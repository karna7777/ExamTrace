// Thin wrapper around the window.examTrace bridge exposed by electron/preload.cjs.
// Keeping all IPC access in one place keeps the React components clean and gives
// us a single spot to extend as each phase adds calls.

const bridge = window.examTrace;

export const api = {
  // App info
  ping: () => bridge.ping(),
  getAppInfo: () => bridge.getAppInfo(),

  // Examiner status & auth
  getExaminerStatus: () => bridge.getExaminerStatus(),
  setupExaminer: (passcode) => bridge.setupExaminer(passcode),
  unlockExaminer: (passcode) => bridge.unlockExaminer(passcode),
  lockExaminer: () => bridge.lockExaminer(),
  changeExaminerPasscode: (data) => bridge.changeExaminerPasscode(data),

  // Exams
  getAvailableExams: () => bridge.getAvailableExams(),
  getExamForEdit: (examId) => bridge.getExamForEdit(examId),
  saveExam: (exam) => bridge.saveExam(exam),
  deleteExam: (examId) => bridge.deleteExam(examId),

  // Examination engine (candidate)
  startExam: (examId, candidateName) => bridge.startExam(examId, candidateName),
  getActiveExam: () => bridge.getActiveExam(),
  getRecoveredResult: () => bridge.getRecoveredResult(),
  saveAnswer: (questionId, answerIndex) => bridge.saveAnswer(questionId, answerIndex),
  markForReview: (questionId, marked) => bridge.markForReview(questionId, marked),
  submitExam: () => bridge.submitExam(),
  getExamHistory: () => bridge.getExamHistory(),
  clearExamHistory: () => bridge.clearExamHistory(),
  getExamReport: (attemptId) => bridge.getExamReport(attemptId),
  exportReport: (attemptId) => bridge.exportReport(attemptId),
  generateQuestions: (topic, count) => bridge.generateQuestions(topic, count),

  // Settings
  getSettings: () => bridge.getSettings(),
  saveSettings: (patch) => bridge.saveSettings(patch),

  // Events (return a cleanup function)
  onTimerUpdate: (cb) => bridge.onTimerUpdate(cb),
  onExamCompleted: (cb) => bridge.onExamCompleted(cb),
  onMonitoringEvent: (cb) => bridge.onMonitoringEvent(cb)
};

// Human-friendly label + classification for a monitoring event type. Neutral
// wording only - we never call anything "cheating".
export function describeEvent(type) {
  const map = {
    EXAM_STARTED: { label: "Examination started", kind: "info" },
    WINDOW_BLUR: { label: "Window lost focus", kind: "activity" },
    WINDOW_FOCUS: { label: "Window regained focus", kind: "activity" },
    WINDOW_MINIMIZED: { label: "Window minimized", kind: "activity" },
    WINDOW_RESTORED: { label: "Window restored", kind: "activity" },
    FULLSCREEN_ENTER: { label: "Entered fullscreen", kind: "info" },
    FULLSCREEN_EXIT: { label: "Left fullscreen", kind: "policy" },
    SYSTEM_IDLE: { label: "System inactivity detected", kind: "activity" },
    SYSTEM_ACTIVE: { label: "Activity resumed", kind: "activity" },
    SYSTEM_LOCKED: { label: "Screen locked", kind: "policy" },
    SYSTEM_UNLOCKED: { label: "Screen unlocked", kind: "activity" },
    SYSTEM_SUSPENDED: { label: "System suspended", kind: "policy" },
    SYSTEM_RESUMED: { label: "System resumed", kind: "activity" },
    EXAM_SUBMITTED: { label: "Examination submitted", kind: "info" },
    EXAM_AUTO_SUBMITTED: { label: "Auto-submitted (time expired)", kind: "info" }
  };
  return map[type] || { label: type, kind: "info" };
}

// Format a timestamp as a local HH:MM:SS clock time.
export function formatClock(iso) {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

// Format milliseconds as HH:MM:SS (or MM:SS when under an hour).
export function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours > 0) return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
  return pad(minutes) + ":" + pad(seconds);
}
