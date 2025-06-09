import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from "electron";
import path from "path";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater; // https://github.com/electron-userland/electron-builder/issues/7976
import log from "electron-log";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

log.transports.file.level = "info"; // Set log level to info
autoUpdater.logger = log;

log.info(`App starting from ${__dirname}...`, process.env["NODE_ENV"]);
const devTools = process.env["NODE_ENV"] === "development";

/** @type {null | BrowserWindow} */
let mainWindow = null;
let isFullScreen = true;
let mac = process.platform === "darwin";
/** @type {null | {width:number; height: number,x: number; y:number}} */
let nonFullScreenBounds = null;
let isQuitting = false;

function enterImmersiveFullScreen() {
  if (!mainWindow) return;
  const currentBounds = mainWindow.getBounds();
  if (currentBounds.width > 100 && currentBounds.height > 100) nonFullScreenBounds = currentBounds;
  log.info("enterImmersiveFullScreen nonFullScreenBounds", nonFullScreenBounds);

  if (mac) {
    mainWindow.setFullScreen(true);
    mainWindow.setSimpleFullScreen(true);
    mainWindow.setKiosk(true);
  } else {
    mainWindow.setFullScreen(true);
  }

  if (mac) {
    mainWindow.setEnabled(false);
    mainWindow.setEnabled(true);
    setTimeout(() => {
      mainWindow?.webContents.focus();
    }, 200);
  }

  isFullScreen = true;
}

function exitImmersiveFullScreen() {
  if (!mainWindow) return;
  if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
  if (mainWindow.isSimpleFullScreen()) mainWindow.setSimpleFullScreen(false);
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);

  log.info("exitImmersiveFullScreen nonFullScreenBounds", nonFullScreenBounds);

  if (nonFullScreenBounds)
    mainWindow.setBounds({
      width: nonFullScreenBounds.width,
      height: nonFullScreenBounds.height,
      x: nonFullScreenBounds.x,
      y: nonFullScreenBounds.y,
    });

  if (mac) {
    mainWindow.setEnabled(false);
    mainWindow.setEnabled(true);
    setTimeout(() => {
      mainWindow?.webContents.focus();
    }, 200);
  }

  isFullScreen = false;
}

function toggleFullScreen() {
  if (!mainWindow) return;
  if (isFullScreen) {
    exitImmersiveFullScreen();
  } else {
    enterImmersiveFullScreen();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    frame: false,
    kiosk: false,
    fullscreen: false,
    simpleFullscreen: false,
    fullscreenable: false,
    webPreferences: {
      devTools,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../electron/preload.js"),
    },
  });

  if (isFullScreen) {
    log.info("Creating window in immersive full screen mode");
    enterImmersiveFullScreen();
  }

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:9000");
  }

  if (devTools) mainWindow.webContents.openDevTools({ mode: "right" });

  mainWindow.on("close", (event) => {
    log.info("mainWindow close");
    if (!mainWindow || isQuitting) return;

    event.preventDefault(); // Prevent the default close action

    dialog
      .showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Cancel", "Quit Game"],
        defaultId: 0,
        title: "Confirm Quit",
        message: "Are you sure you want to quit?",
        cancelId: 0,
      })
      .then((choice) => {
        if (choice.response === 1) {
          isQuitting = true;
          app.quit();
        }
      });
  });

  mainWindow.on("closed", () => {
    log.info("mainWindow closed");
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();

  ipcMain.on("quit-app", () => {
    log.info("ipcMain quit-app");
    app.quit();
  });

  ipcMain.on("toggle-full-screen", () => {
    log.info("ipcMain toggle-full-screen");
    toggleFullScreen();
  });

  ipcMain.handle("is-full-screen", () => {
    log.info("ipcMain is-full-screen");
    return isFullScreen;
  });

  ipcMain.on("log", (_event, ...messages) => {
    log.info("[Renderer]", ...messages);
  });
});

app.on("will-quit", () => {
  log.info("will-quit");
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  log.info("before-quit");
});

app.on("quit", () => {
  log.info("quit");
});

app.on("window-all-closed", () => {
  log.info("window-all-closed");
  app.quit();
});

app.on("browser-window-focus", () => {
  log.info("browser-window-focus");
  // Register global shortcuts when the window is focused
});

app.on("browser-window-blur", () => {
  log.info("browser-window-blur");
  globalShortcut.unregisterAll();
});

autoUpdater.on("checking-for-update", () => {
  if (!mainWindow) return;
  log.info("Checking for update...");
  mainWindow.webContents.send("update-message", "Checking for update...");
});

autoUpdater.on("update-available", (info) => {
  if (!mainWindow) return;
  log.info("Update available.", info);
  mainWindow.webContents.send("update-message", `Update available: ${info.version}`);
});

autoUpdater.on("update-not-available", (info) => {
  if (!mainWindow) return;
  log.info("Update not available.", info);
  mainWindow.webContents.send("update-message", "You are on the latest version.");
});

autoUpdater.on("error", (err) => {
  if (!mainWindow) return;
  log.error("Error in auto-updater. " + err);
  mainWindow.webContents.send("update-message", `Error in auto-updater: ${err.message}`);
});

autoUpdater.on("download-progress", (progressObj) => {
  if (!mainWindow) return;
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + " - Downloaded " + progressObj.percent + "%";
  log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")";
  log.info(log_message);
  mainWindow.webContents.send("update-message", `Downloading: ${Math.round(progressObj.percent)}%`);
});

autoUpdater.on("update-downloaded", (info) => {
  if (!mainWindow || isQuitting) return;
  log.info("Update downloaded. Will install on next restart.", info);
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart", "Later"],
      title: "Application Update",
      message: info.version,
      detail: "A new version has been downloaded. Restart the application to apply the updates.",
    })
    .then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
});
