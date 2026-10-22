// ExamTrace - IPC Handlers
//
// This file registers every ipcMain handler in one place. Each handler is the
// Main-process side of a call the renderer makes through window.examTrace.
// In later phases this is where examiner-authorization checks and input
// validation will live. For Phase 1 we only have two harmless test calls.

const { app, ipcMain } = require("electron");

function registerHandlers() {
  // Test call: the renderer sends "app:ping" and Main replies "pong".
  // This is the minimal proof that IPC is wired up correctly.
  ipcMain.handle("app:ping", () => {
    return "pong";
  });

  // Returns a small, safe object describing the app. We expose only what the
  // UI needs - never internal Electron objects.
  ipcMain.handle("app:getInfo", () => {
    return {
      productName: "ExamTrace",
      version: app.getVersion(),
      userDataPath: app.getPath("userData"),
      platform: process.platform
    };
  });
}

module.exports = { registerHandlers };
