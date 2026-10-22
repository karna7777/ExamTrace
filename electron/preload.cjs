// ExamTrace - Preload Script
//
// The preload runs in a special context that sits between the Renderer (React)
// and the Main process. Because the window uses sandbox:true + contextIsolation,
// this file must stay small and may only require("electron"). It must NOT import
// our other service files.
//
// contextBridge safely exposes a narrow, explicitly named API on window.examTrace.
// The renderer never sees raw ipcRenderer or any Node/Electron internals.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("examTrace", {
  // Simple test call used to prove Main <-> Renderer IPC works.
  ping: () => ipcRenderer.invoke("app:ping"),

  // Returns basic app info (product name, version, where data is stored).
  getAppInfo: () => ipcRenderer.invoke("app:getInfo")
});
