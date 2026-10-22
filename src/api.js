// Thin wrapper around the window.examTrace API that the preload script exposes.
// Keeping all IPC access in one small file makes the React components cleaner
// and gives us a single place to extend as new IPC calls are added per phase.

// window.examTrace is injected by electron/preload.cjs via contextBridge.
const bridge = window.examTrace;

export const api = {
  ping: () => bridge.ping(),
  getAppInfo: () => bridge.getAppInfo()
};
