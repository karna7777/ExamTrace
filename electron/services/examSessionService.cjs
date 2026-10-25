// ExamTrace - Exam Session Service (the examination engine)
//
// The Main process owns the ONE active attempt and is the authoritative source
// for the timer and the score. The renderer only displays what Main sends.
//
// Key guarantees from the spec:
//   * Only one attempt can be in progress at a time (single-attempt guard).
//   * The full exam snapshot (with the answer key) stays in Main. The renderer
//     only ever receives sanitized questions during an active exam.
//   * The timer is computed from an absolute deadline (deadline - now), so it
//     stays correct through blur/minimize/reload and never resets.
//   * Finalization (scoring) happens exactly once.
//
// Phase 5 adds persistence: an in-progress attempt is checkpointed to
// active-attempt.json; finalized attempts go to attempts.json. On startup we
// recover an unfinished attempt (or finalize it if its deadline passed while the
// app was closed).

const crypto = require("crypto");
const { Notification } = require("electron");
const examService = require("./examService.cjs");
const settingsService = require("./settingsService.cjs");
const monitoringService = require("./monitoringService.cjs");
const attemptService = require("./attemptService.cjs");
const backendService = require("./backendService.cjs");
const windowRef = require("../windowRef.cjs");

let activeAttempt = null; // the full attempt object (internal, includes answer key)
let timerInterval = null;
let starting = false; // synchronous lock to block simultaneous startExam calls

// A result produced during startup recovery (deadline passed while closed),
// surfaced to the renderer once via getRecoveredResult().
let pendingRecoveredResult = null;

// Resolves once startup recovery has finished, so the renderer never reads the
// active-exam state before recovery decided what to restore.
let resolveRecovery;
const recoveryDone = new Promise((resolve) => {
  resolveRecovery = resolve;
});

// Persist the current in-progress attempt (checkpoint). Fire-and-forget: the
// storage write queue preserves order.
function checkpoint() {
  // Only LOCAL attempts are checkpointed to disk. Networked (teacher) attempts are
  // owned by the server, so we never write them into the local active-attempt file.
  if (activeAttempt && activeAttempt.status === "in_progress" && activeAttempt.mode === "local") {
    attemptService.saveCheckpoint(serializeAttempt(activeAttempt));
  }
}

// A plain, JSON-safe copy of the attempt (drops nothing we need for recovery).
function serializeAttempt(a) {
  return JSON.parse(JSON.stringify(a));
}

function isExamActive() {
  return !!activeAttempt && activeAttempt.status === "in_progress";
}

// Strip the answer key before sending questions to the renderer.
function getPublicQuestions(questions) {
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options
  }));
}

// Sanitized view of the active attempt for the renderer (no correct answers).
function getActiveExam() {
  if (!isExamActive()) return null;
  const a = activeAttempt;
  return {
    attemptId: a.id,
    examId: a.examId,
    source: a.source || "local",
    preview: !!a.preview,
    title: a.examSnapshot.title,
    subject: a.examSnapshot.subject,
    candidateName: a.candidateName,
    durationMinutes: a.examSnapshot.durationMinutes,
    deadline: a.deadline,
    remainingMs: Math.max(0, a.deadlineMs - Date.now()),
    questions: getPublicQuestions(a.examSnapshot.questions),
    answers: a.answers,
    markedForReview: a.markedForReview,
    events: a.events,
    monitoring: monitoringService.getStatus()
  };
}

async function startExam(examId, candidateName) {
  // Single-attempt guard: reject a second start, even after a renderer reload.
  if (isExamActive() || starting) {
    throw new Error("An examination is already in progress.");
  }
  starting = true;
  try {
    const name = typeof candidateName === "string" ? candidateName.trim() : "";
    if (!name) throw new Error("Please enter your name to begin the examination.");
    if (name.length > 80) throw new Error("Name is too long (max 80 characters).");

    const exam = await examService.getExamById(examId);
    if (!exam) throw new Error("Exam not found.");
    if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
      throw new Error("This exam has no questions.");
    }

    const now = Date.now();
    const deadlineMs = now + exam.durationMinutes * 60 * 1000;

    activeAttempt = {
      id: "attempt-" + crypto.randomUUID(),
      mode: "local",
      source: "local",
      examId: exam.id,
      candidateName: name,
      // Immutable internal snapshot WITH the answer key. Never sent to renderer.
      examSnapshot: JSON.parse(JSON.stringify(exam)),
      startedAt: new Date(now).toISOString(),
      deadline: new Date(deadlineMs).toISOString(),
      deadlineMs,
      endedAt: null,
      status: "in_progress",
      answers: {}, // questionId -> selected option index
      markedForReview: [], // questionIds
      events: [], // monitoring timeline (Phase 4)
      result: null
    };

    startTimer();

    // Start desktop activity monitoring tied to this attempt. The idle
    // threshold comes from settings (10s in Demo Mode, otherwise the normal
    // threshold). Fullscreen during the exam is a setting too.
    const settings = await settingsService.getSettings();
    const idleThresholdSeconds = settings.demoMode ? 10 : settings.inactivityThresholdSeconds;
    monitoringService.start(activeAttempt, {
      idleThresholdSeconds,
      fullscreenEnabled: settings.fullscreenDuringExam,
      win: windowRef.getMainWindow(),
      onEvent: checkpoint // persist after each monitoring event
    });

    // Initial checkpoint so the attempt survives a restart from the very start.
    checkpoint();

    return getActiveExam();
  } finally {
    starting = false;
  }
}

// Start a TEACHER (networked) exam. The server owns the attempt, deadline and
// answer key; we only get sanitized questions. Reuses the same timer + workspace +
// monitoring as a local exam. `opts.preview` starts a teacher preview attempt.
async function startNetworkedExam(examId, candidateName, studentId, opts = {}) {
  if (isExamActive() || starting) {
    throw new Error("An examination is already in progress.");
  }
  starting = true;
  try {
    const preview = !!opts.preview;
    const name = typeof candidateName === "string" ? candidateName.trim() : "";
    if (!preview && !name) throw new Error("Please enter your name to begin the examination.");

    const res = preview
      ? await backendService.startPreview(examId)
      : await backendService.startAttempt(examId, name, typeof studentId === "string" ? studentId.trim() : "");
    if (!res.ok) throw new Error(res.error || "Could not start the teacher exam.");
    const d = res.data;
    const deadlineMs = new Date(d.deadline).getTime();

    activeAttempt = {
      id: "attempt-" + crypto.randomUUID(), // local UI id
      mode: "network",
      source: "teacher",
      preview,
      serverAttemptId: d.attemptId,
      credential: d.credential,
      examId,
      candidateName: preview ? "Preview (teacher)" : name,
      studentId: typeof studentId === "string" ? studentId.trim() : "",
      // Sanitized snapshot from the server - NO answer key present.
      examSnapshot: {
        title: d.title,
        subject: d.subject,
        durationMinutes: d.durationMinutes,
        questions: Array.isArray(d.questions) ? d.questions : []
      },
      startedAt: new Date().toISOString(),
      deadline: d.deadline,
      deadlineMs,
      endedAt: null,
      status: "in_progress",
      answers: {},
      markedForReview: [],
      events: [],
      result: null
    };

    startTimer();
    const settings = await settingsService.getSettings();
    const idleThresholdSeconds = settings.demoMode ? 10 : settings.inactivityThresholdSeconds;
    monitoringService.start(activeAttempt, {
      idleThresholdSeconds,
      fullscreenEnabled: settings.fullscreenDuringExam,
      win: windowRef.getMainWindow(),
      onEvent: checkpoint // no-op for network (checkpoint is local-only)
    });
    // No local checkpoint for networked attempts - the server is authoritative.
    return getActiveExam();
  } finally {
    starting = false;
  }
}

function ensureActiveAndOpen() {
  if (!isExamActive()) throw new Error("No active examination.");
  if (Date.now() >= activeAttempt.deadlineMs) {
    throw new Error("The examination deadline has passed.");
  }
}

function findQuestion(questionId) {
  return activeAttempt.examSnapshot.questions.find((q) => q.id === questionId) || null;
}

// Save or change an answer. Validated entirely in Main - we never trust a
// renderer-supplied question object, only the id + index.
function saveAnswer(questionId, answerIndex) {
  ensureActiveAndOpen();
  const q = findQuestion(questionId);
  if (!q) throw new Error("Invalid question.");
  const idx = Number(answerIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
    throw new Error("Invalid answer selection.");
  }
  activeAttempt.answers[questionId] = idx;
  checkpoint(); // save after an answer change
  return { ok: true };
}

// Mark / unmark a question for review. Stored separately from answers, so a
// question can be both answered and marked.
function markForReview(questionId, marked) {
  ensureActiveAndOpen();
  const q = findQuestion(questionId);
  if (!q) throw new Error("Invalid question.");
  const list = activeAttempt.markedForReview;
  const has = list.includes(questionId);
  if (marked && !has) list.push(questionId);
  if (!marked && has) activeAttempt.markedForReview = list.filter((id) => id !== questionId);
  checkpoint(); // save after a review-flag change
  return { ok: true };
}

// Grade the attempt and build the result (with answer review). Correct answers
// are only revealed here, after finalization.
function buildResult() {
  const a = activeAttempt;
  const questions = a.examSnapshot.questions;
  let correct = 0;
  let attempted = 0;

  const review = questions.map((q) => {
    const selected = q.id in a.answers ? a.answers[q.id] : null;
    if (selected !== null) attempted++;
    const isCorrect = selected === q.correctAnswer;
    if (isCorrect) correct++;
    return {
      id: q.id,
      text: q.text,
      options: q.options,
      selected,
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation || ""
    };
  });

  const total = questions.length;
  const incorrect = attempted - correct;
  const unanswered = total - attempted;
  const startedMs = new Date(a.startedAt).getTime();
  const endedMs = a.endedAt ? new Date(a.endedAt).getTime() : Date.now();

  return {
    attemptId: a.id,
    examId: a.examId,
    title: a.examSnapshot.title,
    subject: a.examSnapshot.subject,
    candidateName: a.candidateName,
    status: a.status,
    submissionType: a.status === "auto_submitted" ? "auto" : "manual",
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    durationMinutes: a.examSnapshot.durationMinutes,
    totalQuestions: total,
    attempted,
    correct,
    incorrect,
    unanswered,
    score: correct,
    percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
    timeUsedMs: Math.max(0, endedMs - startedMs),
    review,
    events: a.events,
    monitoringSummary: a.monitoringSummary || null
  };
}

// Dispatch finalization by attempt mode.
async function finalizeExam(submissionType) {
  if (!activeAttempt) return null;
  if (activeAttempt.mode === "network") return finalizeNetwork(submissionType);
  return finalizeLocal(submissionType);
}

// Networked finalize: the SERVER grades. We submit answers (+ monitoring events),
// and only mark the attempt finished if the server accepts it - so a failed submit
// (e.g. server down) leaves the exam running and the student can retry.
async function finalizeNetwork(submissionType) {
  const a = activeAttempt;
  if (!a || a.status !== "in_progress") return a ? a.result : null;
  if (a._submitting) return { ok: false, error: "A submission is already in progress." };
  a._submitting = true;
  try {
    const res = await backendService.submitAttempt(
      a.serverAttemptId,
      a.credential,
      a.answers,
      a.events,
      submissionType === "auto"
    );
    if (!res.ok) {
      windowRef.sendToRenderer("exam:submitError", { error: res.error || "Could not submit to the server." });
      return { ok: false, error: res.error || "Could not submit to the server." };
    }
    stopTimer();
    monitoringService.stop(submissionType);
    a.status = submissionType === "auto" ? "auto_submitted" : "submitted";
    a.endedAt = new Date().toISOString();
    a.result = (res.data && res.data.result) || res.data;
    windowRef.sendToRenderer("exam:completed", a.result);
    showCompletionNotification(a.result);
    return a.result;
  } finally {
    a._submitting = false;
  }
}

// Local finalize: grade in Main, persist to local history. Exactly-once via the
// status check set synchronously before any await.
async function finalizeLocal(submissionType) {
  if (!activeAttempt) return null;
  if (activeAttempt.status !== "in_progress") {
    return activeAttempt.result;
  }

  stopTimer();
  activeAttempt.status = submissionType === "auto" ? "auto_submitted" : "submitted";
  activeAttempt.endedAt = new Date().toISOString();

  // Stop monitoring: records the submit event, closes any open away/idle
  // interval, and returns the summary used in the report.
  activeAttempt.monitoringSummary = monitoringService.stop(submissionType);
  activeAttempt.result = buildResult();

  // Notify the renderer immediately (covers auto-submit too).
  windowRef.sendToRenderer("exam:completed", activeAttempt.result);

  // Native desktop notification for submission / time expiry.
  showCompletionNotification(activeAttempt.result);

  // Persist in a recoverable order: write history FIRST, then clear the
  // checkpoint. If a crash happens in between, the attempt is already in
  // history and startup recovery just clears the leftover checkpoint
  // (saveFinalizedAttempt is idempotent, so no duplicate is created).
  try {
    await attemptService.saveFinalizedAttempt(serializeAttempt(activeAttempt));
    await attemptService.clearCheckpoint();
  } catch (err) {
    console.error("[ExamTrace] failed to persist finalized attempt:", err);
  }
  return activeAttempt.result;
}

function submitExam() {
  if (!activeAttempt) throw new Error("No active examination.");
  return finalizeExam("manual");
}

// Show a native OS notification when an exam ends.
function showCompletionNotification(result) {
  try {
    if (!Notification.isSupported()) return;
    const title = result.submissionType === "auto" ? "Time expired" : "Examination submitted";
    const body =
      result.title + " - " + result.score + "/" + result.totalQuestions + " (" + result.percentage + "%)";
    new Notification({ title: "ExamTrace: " + title, body }).show();
  } catch (err) {
    console.error("[ExamTrace] notification error:", err);
  }
}

// ---- Startup recovery ----
function validCheckpoint(cp) {
  return (
    cp &&
    typeof cp.id === "string" &&
    cp.examSnapshot &&
    Array.isArray(cp.examSnapshot.questions) &&
    typeof cp.deadlineMs === "number" &&
    typeof cp.startedAt === "string"
  );
}

// Called once at startup (from main.cjs) after the window exists.
async function recoverOnStartup() {
  try {
    const cp = await attemptService.readCheckpoint();
    if (!cp) return;

    // Already in history (crash happened after writing history but before the
    // checkpoint was cleared): just remove the leftover checkpoint. No restore,
    // no duplicate.
    if (cp.id && (await attemptService.hasAttempt(cp.id))) {
      await attemptService.clearCheckpoint();
      return;
    }

    if (cp.status !== "in_progress") {
      // Crash after finalize but before the checkpoint was cleared: make sure
      // it's in history (idempotent) and clear the leftover checkpoint.
      await attemptService.saveFinalizedAttempt(cp);
      await attemptService.clearCheckpoint();
      return;
    }

    if (!validCheckpoint(cp)) {
      await attemptService.clearCheckpoint();
      return;
    }

    if (Date.now() >= cp.deadlineMs) {
      // Deadline passed while the app was closed: finalize exactly once.
      // We do NOT fabricate monitoring events for the time the app was not
      // running - we cannot observe what happened then.
      activeAttempt = cp;
      activeAttempt.status = "auto_submitted";
      activeAttempt.endedAt = new Date(cp.deadlineMs).toISOString();
      activeAttempt.monitoringSummary = monitoringService.computeSummaryFromEvents(cp.events);
      activeAttempt.result = buildResult();
      pendingRecoveredResult = activeAttempt.result;
      await attemptService.saveFinalizedAttempt(serializeAttempt(activeAttempt));
      await attemptService.clearCheckpoint();
      activeAttempt = null;
      return;
    }

    // Still valid and running: restore it and resume the timer + monitoring.
    activeAttempt = cp;
    startTimer();
    const settings = await settingsService.getSettings();
    const idleThresholdSeconds = settings.demoMode ? 10 : settings.inactivityThresholdSeconds;
    monitoringService.start(activeAttempt, {
      idleThresholdSeconds,
      fullscreenEnabled: settings.fullscreenDuringExam,
      win: windowRef.getMainWindow(),
      onEvent: checkpoint,
      isResume: true // seed counters from existing events, no duplicate EXAM_STARTED
    });
  } catch (err) {
    console.error("[ExamTrace] recovery error:", err);
  } finally {
    resolveRecovery();
  }
}

// Renderer waits for recovery before reading the active-exam state.
async function getActiveExamAsync() {
  await recoveryDone;
  return getActiveExam();
}

// Returns (once) a result produced during startup recovery, then clears it.
async function getRecoveredResult() {
  await recoveryDone;
  const r = pendingRecoveredResult;
  pendingRecoveredResult = null;
  return r;
}

// ---- Authoritative timer (Main process) ----
function startTimer() {
  stopTimer();
  tick(); // send an immediate update
  timerInterval = setInterval(tick, 1000);
}

function tick() {
  if (!isExamActive()) {
    stopTimer();
    return;
  }
  const remainingMs = Math.max(0, activeAttempt.deadlineMs - Date.now());
  windowRef.sendToRenderer("timer:update", {
    attemptId: activeAttempt.id,
    remainingMs
  });
  if (remainingMs <= 0) {
    stopTimer(); // stop first so a failed networked auto-submit doesn't repeat each tick
    finalizeExam("auto"); // deadline reached -> auto submit
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

module.exports = {
  isExamActive,
  startExam,
  startNetworkedExam,
  getActiveExam,
  getActiveExamAsync,
  getRecoveredResult,
  recoverOnStartup,
  saveAnswer,
  markForReview,
  submitExam
};
