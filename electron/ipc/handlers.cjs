// ExamTrace - IPC Handlers
//
// Every ipcMain handler is registered here. This is the Main-process side of
// the window.examTrace calls the renderer makes. Crucially, examiner-only
// operations are authorized HERE, in Main - hiding a button in React is not
// security. A candidate renderer that calls an examiner function directly is
// rejected.

const { app, ipcMain, BrowserWindow, dialog } = require("electron");
const authService = require("../services/authService.cjs");
const examService = require("../services/examService.cjs");
const settingsService = require("../services/settingsService.cjs");
const examSession = require("../services/examSessionService.cjs");

// True while a candidate examination is in progress. Examiner actions are
// blocked during an active exam so the candidate can't reach editing controls.
function isExamActive() {
  return examSession.isExamActive();
}

// Guard for every examiner-only operation: must be unlocked AND no active exam.
function requireExaminer() {
  if (!authService.isUnlocked()) {
    throw new Error("Examiner access required.");
  }
  if (isExamActive()) {
    throw new Error("Examiner actions are not allowed during an active examination.");
  }
}

function registerHandlers() {
  // ---- App info (Phase 1) ----
  ipcMain.handle("app:ping", () => "pong");
  ipcMain.handle("app:getInfo", () => ({
    productName: "ExamTrace",
    version: app.getVersion(),
    userDataPath: app.getPath("userData"),
    platform: process.platform
  }));

  // ---- Examiner status & authentication ----
  ipcMain.handle("examiner:getStatus", async () => {
    const configured = await authService.isConfigured();
    // Recovery state: no auth file, but other app data exists.
    const recovery = !configured && (await authService.anyAppDataExists());
    return {
      configured,
      unlocked: authService.isUnlocked(),
      recovery
    };
  });

  ipcMain.handle("examiner:setup", async (event, passcode) => {
    await authService.setup(passcode);
    // Seed the built-in sample exam ONLY after setup succeeds (clarification #1).
    await examService.seedSampleExamIfNeeded();
    return { ok: true };
  });

  ipcMain.handle("examiner:unlock", async (event, passcode) => {
    if (isExamActive()) {
      throw new Error("Examiner Mode cannot be unlocked during an active examination.");
    }
    return authService.unlock(passcode);
  });

  ipcMain.handle("examiner:lock", () => authService.lock());

  ipcMain.handle("examiner:changePasscode", async (event, data) => {
    requireExaminer();
    const current = data && data.current;
    const next = data && data.next;
    return authService.changePasscode(current, next);
  });

  // ---- Exams ----
  // Candidate-safe: metadata only, no answer keys.
  ipcMain.handle("exam:getAvailable", () => examService.getAvailableExams());

  // Examiner-only: full exam (with answer key) for editing.
  ipcMain.handle("exam:getForEdit", (event, examId) => {
    requireExaminer();
    return examService.getExamForEdit(examId);
  });

  ipcMain.handle("exam:save", (event, exam) => {
    requireExaminer();
    return examService.saveExam(exam);
  });

  ipcMain.handle("exam:delete", async (event, examId) => {
    requireExaminer();
    // Native confirmation dialog - allowed here because exam management never
    // happens during an active examination.
    const exam = await examService.getExamById(examId);
    const title = exam ? exam.title : "this exam";
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Cancel", "Delete"],
      defaultId: 0,
      cancelId: 0,
      message: 'Delete "' + title + '"?',
      detail: "This removes the exam definition only. Completed attempt records are kept."
    });
    if (result.response !== 1) {
      return { ok: false, cancelled: true };
    }
    return examService.deleteExam(examId);
  });

  // ---- Examination engine (candidate-facing) ----
  // startExam(examId, candidateName) - Main validates the name and guards
  // against a second attempt.
  ipcMain.handle("exam:start", (event, examId, candidateName) => {
    return examSession.startExam(examId, candidateName);
  });

  // Returns the sanitized active attempt (no answer key) or null. Used for
  // renderer-reload recovery.
  ipcMain.handle("exam:getActive", () => examSession.getActiveExam());

  ipcMain.handle("exam:saveAnswer", (event, questionId, answerIndex) => {
    return examSession.saveAnswer(questionId, answerIndex);
  });

  ipcMain.handle("exam:markReview", (event, questionId, marked) => {
    return examSession.markForReview(questionId, marked);
  });

  ipcMain.handle("exam:submit", () => examSession.submitExam());

  // ---- Settings ----
  ipcMain.handle("settings:get", () => settingsService.getSettings());
  ipcMain.handle("settings:save", (event, patch) => {
    // Main decides which keys this mode may change.
    return settingsService.updateSettings(patch, authService.isUnlocked());
  });
}

module.exports = { registerHandlers };
