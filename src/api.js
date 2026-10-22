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

  // Settings
  getSettings: () => bridge.getSettings(),
  saveSettings: (patch) => bridge.saveSettings(patch)
};
