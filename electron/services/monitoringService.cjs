// ExamTrace - Monitoring Service
//
// Collects a neutral, chronological activity timeline for the ONE active attempt.
// It uses event-driven programming: BrowserWindow events (focus/blur/minimize/
// restore/fullscreen) and Electron powerMonitor (idle/active, lock/unlock,
// suspend/resume).
//
// Important design choices from the spec:
//   * A single "away" flag means a minimize-plus-blur counts as ONE focus-
//     departure interval, not two.
//   * Repeated idle is not recorded twice (a single "idle" flag).
//   * Open away/idle intervals are closed when monitoring stops (e.g. submitting
//     while the window is unfocused), so time-away is measured without double
//     counting.
//   * This records facts only. It never labels a candidate as cheating and never
//     pauses the exam timer.

const crypto = require("crypto");
const { powerMonitor } = require("electron");
const windowRef = require("./../windowRef.cjs");

let state = null; // null when not monitoring

function makeInitialState(attempt, options) {
  return {
    attempt, // the live attempt object; we push into attempt.events
    idleThresholdSeconds: options.idleThresholdSeconds,
    fullscreenForced: !!options.fullscreenEnabled,
    win: options.win,
    onEvent: typeof options.onEvent === "function" ? options.onEvent : null,

    // window focus/departure tracking (one interval regardless of blur+minimize)
    isAway: false,
    awaySince: 0,

    // system idle tracking
    isIdle: false,
    idleSince: 0,
    idlePoll: null,

    // counters used for the summary
    windowDepartures: 0,
    totalAwayMs: 0,
    fullscreenExits: 0,
    idleEvents: 0,
    totalIdleMs: 0,
    lockEvents: 0,
    suspendEvents: 0,

    // bound handlers so we can remove exactly these on stop
    handlers: {}
  };
}

// Append an event to the attempt timeline and push it to the renderer live.
function recordEvent(type, reason, metadata) {
  if (!state) return;
  const event = {
    id: "event-" + crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    reason: reason || "",
    metadata: metadata || {}
  };
  state.attempt.events.push(event);
  windowRef.sendToRenderer("monitoring:event", event);
  // Let the session persist a checkpoint after each monitoring event.
  if (state.onEvent) state.onEvent(event);
}

// Rebuild summary counters from an event list. Used when resuming after a
// restart (we can't recover live counters) and when finalizing on recovery.
// Relies on the dedup rule: one WINDOW_BLUR/WINDOW_MINIMIZED per departure.
function computeSummaryFromEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const count = (t) => list.filter((e) => e.type === t).length;
  const sumMeta = (types, key) =>
    list
      .filter((e) => types.includes(e.type))
      .reduce((acc, e) => acc + ((e.metadata && e.metadata[key]) || 0), 0);
  return {
    windowDepartures: count("WINDOW_BLUR") + count("WINDOW_MINIMIZED"),
    totalAwayMs: sumMeta(["WINDOW_FOCUS", "WINDOW_RESTORED"], "awayMs"),
    fullscreenExits: count("FULLSCREEN_EXIT"),
    idleEvents: count("SYSTEM_IDLE"),
    totalIdleMs: sumMeta(["SYSTEM_ACTIVE"], "idleMs"),
    lockEvents: count("SYSTEM_LOCKED"),
    suspendEvents: count("SYSTEM_SUSPENDED"),
    totalEvents: list.length
  };
}

// ---- Window focus / departure (deduplicated into one interval) ----
function handleAway(triggerType, reason) {
  if (!state) return;
  // Always record the specific event the first time we go away.
  if (!state.isAway) {
    state.isAway = true;
    state.awaySince = Date.now();
    state.windowDepartures++;
    recordEvent(triggerType, reason, {});
  }
  // If already away (e.g. blur right after minimize), ignore - one interval only.
}

function handleReturn(triggerType, reason) {
  if (!state) return;
  if (state.isAway) {
    const awayMs = Date.now() - state.awaySince;
    state.totalAwayMs += awayMs;
    state.isAway = false;
    recordEvent(triggerType, reason, { awayMs });
  }
}

// ---- Idle polling ----
function pollIdle() {
  if (!state) return;
  let idleSeconds = 0;
  try {
    idleSeconds = powerMonitor.getSystemIdleTime(); // seconds since last input
  } catch {
    return; // not supported -> skip gracefully
  }

  if (!state.isIdle && idleSeconds >= state.idleThresholdSeconds) {
    state.isIdle = true;
    // Estimate when the idle period actually began.
    state.idleSince = Date.now() - idleSeconds * 1000;
    state.idleEvents++;
    recordEvent("SYSTEM_IDLE", "No input for " + idleSeconds + "s", {
      thresholdSeconds: state.idleThresholdSeconds
    });
  } else if (state.isIdle && idleSeconds < state.idleThresholdSeconds) {
    const idleMs = Date.now() - state.idleSince;
    state.totalIdleMs += idleMs;
    state.isIdle = false;
    recordEvent("SYSTEM_ACTIVE", "Activity resumed", { idleMs });
  }
}

function start(attempt, options) {
  // Replace any previous monitoring (should not happen, but be safe).
  if (state) stop("manual");

  const win = options.win;
  state = makeInitialState(attempt, options);

  if (options.isResume) {
    // Resuming after a restart: seed counters from the events already recorded,
    // and do NOT record another EXAM_STARTED.
    const seed = computeSummaryFromEvents(attempt.events);
    state.windowDepartures = seed.windowDepartures;
    state.totalAwayMs = seed.totalAwayMs;
    state.fullscreenExits = seed.fullscreenExits;
    state.idleEvents = seed.idleEvents;
    state.totalIdleMs = seed.totalIdleMs;
    state.lockEvents = seed.lockEvents;
    state.suspendEvents = seed.suspendEvents;
  } else {
    recordEvent("EXAM_STARTED", "Examination started", {
      candidateName: attempt.candidateName
    });
  }

  // Optionally enter fullscreen for the exam.
  if (state.fullscreenForced && win && !win.isDestroyed()) {
    win.setFullScreen(true);
  }

  // --- BrowserWindow events ---
  const h = state.handlers;
  h.blur = () => handleAway("WINDOW_BLUR", "Examination window lost focus");
  h.focus = () => handleReturn("WINDOW_FOCUS", "Examination window regained focus");
  h.minimize = () => handleAway("WINDOW_MINIMIZED", "Window minimized");
  h.restore = () => handleReturn("WINDOW_RESTORED", "Window restored");
  h.enterFull = () => recordEvent("FULLSCREEN_ENTER", "Entered fullscreen", {});
  h.leaveFull = () => {
    state.fullscreenExits++;
    recordEvent("FULLSCREEN_EXIT", "Left fullscreen", {});
  };

  if (win && !win.isDestroyed()) {
    win.on("blur", h.blur);
    win.on("focus", h.focus);
    win.on("minimize", h.minimize);
    win.on("restore", h.restore);
    win.on("enter-full-screen", h.enterFull);
    win.on("leave-full-screen", h.leaveFull);
  }

  // --- powerMonitor events (feature-detected; unsupported ones just never fire) ---
  h.lock = () => {
    state.lockEvents++;
    recordEvent("SYSTEM_LOCKED", "Screen locked", {});
  };
  h.unlock = () => recordEvent("SYSTEM_UNLOCKED", "Screen unlocked", {});
  h.suspend = () => {
    state.suspendEvents++;
    recordEvent("SYSTEM_SUSPENDED", "System suspended", {});
  };
  h.resume = () => recordEvent("SYSTEM_RESUMED", "System resumed", {});

  try {
    powerMonitor.on("lock-screen", h.lock);
    powerMonitor.on("unlock-screen", h.unlock);
    powerMonitor.on("suspend", h.suspend);
    powerMonitor.on("resume", h.resume);
  } catch {
    // Some events may be unavailable on a given OS; ignore.
  }

  // Poll idle every 2 seconds (cheap; detects the 10s demo threshold too).
  state.idlePoll = setInterval(pollIdle, 2000);
}

// Stop monitoring, close open intervals, and return a summary.
// submissionType is "manual" or "auto".
function stop(submissionType) {
  if (!state) return null;

  recordEvent(
    submissionType === "auto" ? "EXAM_AUTO_SUBMITTED" : "EXAM_SUBMITTED",
    submissionType === "auto" ? "Time expired - auto submitted" : "Examination submitted",
    {}
  );

  // Close an open away interval using the end time (no fake focus event).
  if (state.isAway) {
    state.totalAwayMs += Date.now() - state.awaySince;
    state.isAway = false;
  }
  // Close an open idle interval.
  if (state.isIdle) {
    state.totalIdleMs += Date.now() - state.idleSince;
    state.isIdle = false;
  }

  // Remove window listeners.
  const win = state.win;
  const h = state.handlers;
  if (win && !win.isDestroyed()) {
    win.removeListener("blur", h.blur);
    win.removeListener("focus", h.focus);
    win.removeListener("minimize", h.minimize);
    win.removeListener("restore", h.restore);
    win.removeListener("enter-full-screen", h.enterFull);
    win.removeListener("leave-full-screen", h.leaveFull);
    if (state.fullscreenForced) win.setFullScreen(false);
  }

  // Remove powerMonitor listeners.
  try {
    powerMonitor.removeListener("lock-screen", h.lock);
    powerMonitor.removeListener("unlock-screen", h.unlock);
    powerMonitor.removeListener("suspend", h.suspend);
    powerMonitor.removeListener("resume", h.resume);
  } catch {
    // ignore
  }

  if (state.idlePoll) clearInterval(state.idlePoll);

  const summary = {
    windowDepartures: state.windowDepartures,
    totalAwayMs: state.totalAwayMs,
    fullscreenExits: state.fullscreenExits,
    idleEvents: state.idleEvents,
    totalIdleMs: state.totalIdleMs,
    lockEvents: state.lockEvents,
    suspendEvents: state.suspendEvents,
    totalEvents: state.attempt.events.length
  };

  state = null;
  return summary;
}

// Live status for the renderer's monitoring pill.
function getStatus() {
  if (!state) return { active: false };
  return { active: true, awayNow: state.isAway, idleNow: state.isIdle };
}

module.exports = { start, stop, getStatus, computeSummaryFromEvents };
