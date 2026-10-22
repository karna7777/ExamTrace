// ExamTrace - Preload Script
//
// The preload runs between the Renderer (React) and the Main process. With
// sandbox:true + contextIsolation this file must stay small and may only
// require("electron"); it must NOT import our service files. All real logic
// lives in Main. Here we expose a narrow, explicitly named API on
// window.examTrace via contextBridge - the renderer never sees raw ipcRenderer.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("examTrace", {
  // --- App info (Phase 1) ---
  ping: () => ipcRenderer.invoke("app:ping"),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),

  // --- Examiner status & authentication ---
  getExaminerStatus: () => ipcRenderer.invoke("examiner:getStatus"),
  setupExaminer: (passcode) => ipcRenderer.invoke("examiner:setup", passcode),
  unlockExaminer: (passcode) => ipcRenderer.invoke("examiner:unlock", passcode),
  lockExaminer: () => ipcRenderer.invoke("examiner:lock"),
  changeExaminerPasscode: (data) => ipcRenderer.invoke("examiner:changePasscode", data),

  // --- Exams ---
  getAvailableExams: () => ipcRenderer.invoke("exam:getAvailable"),
  getExamForEdit: (examId) => ipcRenderer.invoke("exam:getForEdit", examId),
  saveExam: (exam) => ipcRenderer.invoke("exam:save", exam),
  deleteExam: (examId) => ipcRenderer.invoke("exam:delete", examId),

  // --- Examination engine (candidate) ---
  startExam: (examId, candidateName) => ipcRenderer.invoke("exam:start", examId, candidateName),
  getActiveExam: () => ipcRenderer.invoke("exam:getActive"),
  saveAnswer: (questionId, answerIndex) => ipcRenderer.invoke("exam:saveAnswer", questionId, answerIndex),
  markForReview: (questionId, marked) => ipcRenderer.invoke("exam:markReview", questionId, marked),
  submitExam: () => ipcRenderer.invoke("exam:submit"),

  // --- Settings ---
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),

  // --- Events (Main -> Renderer). Each returns a cleanup function that the
  //     React component must call on unmount to remove the listener. ---
  onTimerUpdate: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on("timer:update", listener);
    return () => ipcRenderer.removeListener("timer:update", listener);
  },
  onExamCompleted: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on("exam:completed", listener);
    return () => ipcRenderer.removeListener("exam:completed", listener);
  }
});
