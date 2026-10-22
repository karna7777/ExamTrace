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
  saveAnswer: (questionId, answerIndex) => bridge.saveAnswer(questionId, answerIndex),
  markForReview: (questionId, marked) => bridge.markForReview(questionId, marked),
  submitExam: () => bridge.submitExam(),

  // Settings
  getSettings: () => bridge.getSettings(),
  saveSettings: (patch) => bridge.saveSettings(patch),

  // Events (return a cleanup function)
  onTimerUpdate: (cb) => bridge.onTimerUpdate(cb),
  onExamCompleted: (cb) => bridge.onExamCompleted(cb)
};

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
