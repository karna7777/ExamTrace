// ExamTrace - Main Window Reference
//
// A tiny shared helper so Main-process services (timer, monitoring) can push
// events to the renderer without each one needing a direct handle to the
// BrowserWindow. main.cjs registers the window once at startup.

let mainWindow = null;

function setMainWindow(win) {
  mainWindow = win;
}

function getMainWindow() {
  return mainWindow;
}

// Safely send an event to the renderer (ignored if the window is gone).
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

module.exports = { setMainWindow, getMainWindow, sendToRenderer };
