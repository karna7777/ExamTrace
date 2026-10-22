// ExamTrace - Electron Main Process (entry point)
//
// The Main process is the "backend" of the desktop app. It controls the
// application lifecycle, creates the BrowserWindow (the actual OS window),
// and will later own authentication, the exam timer, monitoring and all
// file persistence. The React UI runs in a separate Renderer process and
// talks to Main only through secure IPC exposed by the preload script.

const { app, BrowserWindow } = require("electron");
const path = require("path");
const { registerHandlers } = require("./ipc/handlers.cjs");

// IMPORTANT: set the application name BEFORE anything reads app.getPath().
// This guarantees our user data lives in:
//   ~/Library/Application Support/ExamTrace
// and never under an old/different project name.
app.setName("ExamTrace");

// In development the app is not packaged, so we load the Vite dev server.
// In a packaged build we load the files Vite produced in "dist".
const isDev = !app.isPackaged;

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "ExamTrace",
    backgroundColor: "#0f172a",
    show: false, // show only once content is ready, to avoid a white flash
    webPreferences: {
      // Security: the renderer cannot touch Node or Electron directly.
      // It only gets the small, named API we expose from preload.cjs.
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // DevTools are allowed only in development. Packaged builds disable them.
      devTools: isDev
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// app.whenReady() resolves when Electron has finished initialising and it is
// safe to create windows. This is part of the application lifecycle.
app.whenReady().then(() => {
  // Register all IPC handlers once, before any window can call them.
  registerHandlers();

  // Helpful during development: confirm the data directory is correct.
  console.log("[ExamTrace] userData path:", app.getPath("userData"));

  createMainWindow();

  // macOS: clicking the dock icon with no windows open should re-create one.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Standard macOS behaviour: apps usually stay running when all windows are
// closed until the user quits with Cmd+Q. On other platforms we quit.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
