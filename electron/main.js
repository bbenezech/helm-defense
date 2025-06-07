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
const DEVTOOLS = process.env["NODE_ENV"] === "development";

/** @type {null | BrowserWindow} */
let mainWindow = null;
let isInImmersiveFullScreen = true;
let mac = process.platform === "darwin";
/** @type {null | {width:number; height: number,x: number; y:number}} */
let nonFullScreenBounds = null;

function enterImmersiveFullScreen() {
  if (!mainWindow) return;
  const currentBounds = mainWindow.getBounds();
  if (currentBounds.width > 100 && currentBounds.height > 100) nonFullScreenBounds = currentBounds;
  log.info("enterImmersiveFullScreen nonFullScreenBounds", nonFullScreenBounds);

  if (mac) {
    mainWindow.setFullScreen(true);
    mainWindow.setSimpleFullScreen(true);
    mainWindow.setKiosk(true);

    mainWindow.setEnabled(false);
    mainWindow.setEnabled(true);
    mainWindow.focusOnWebView();
  } else {
    mainWindow.setFullScreen(true);
  }

  isInImmersiveFullScreen = true;
}

function exitImmersiveFullScreen() {
  if (!mainWindow) return;
  if (mainWindow.kiosk) mainWindow.setKiosk(false);
  if (mainWindow.simpleFullScreen) mainWindow.setSimpleFullScreen(false);
  if (mainWindow.fullScreen) mainWindow.setFullScreen(false);

  if (mac) {
    mainWindow.setEnabled(false);
    mainWindow.setEnabled(true);
    mainWindow.focusOnWebView();
  }

  log.info("exitImmersiveFullScreen nonFullScreenBounds", nonFullScreenBounds);

  if (nonFullScreenBounds)
    mainWindow.setBounds({
      width: nonFullScreenBounds.width,
      height: nonFullScreenBounds.height,
      x: nonFullScreenBounds.x,
      y: nonFullScreenBounds.y,
    });

  isInImmersiveFullScreen = false;
}

function toggleImmersiveFullScreen() {
  if (!mainWindow) return;
  if (isInImmersiveFullScreen) {
    exitImmersiveFullScreen();
  } else {
    enterImmersiveFullScreen();
  }
}

function createWindow() {
  const webPreferences = {
    preload: path.join(__dirname, "../electron/preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    devTools: DEVTOOLS,
    disableHtmlFullscreenWindowResize: true,
  };

  mainWindow = new BrowserWindow({
    frame: false,
    kiosk: false,
    fullscreen: false,
    simpleFullscreen: false,
    fullscreenable: false,
    webPreferences,
  });

  if (isInImmersiveFullScreen) {
    log.info("Creating window in immersive full screen mode");
    enterImmersiveFullScreen();
  }

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:9000");
  }

  if (DEVTOOLS) mainWindow.webContents.openDevTools();

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

  ipcMain.on("toggle-fullscreen", () => {
    log.info("ipcMain toggle-fullscreen");
    toggleImmersiveFullScreen();
  });

  ipcMain.handle("is-fullscreen-status", () => {
    log.info("ipcMain is-fullscreen-status");
    return isInImmersiveFullScreen;
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
  app.quit();
});

app.on("browser-window-focus", () => {
  log.info("browser-window-focus");
  globalShortcut.register("Escape", () => {
    if (isInImmersiveFullScreen) exitImmersiveFullScreen();
  });

  globalShortcut.register("F11", () => {
    toggleImmersiveFullScreen();
  });

  globalShortcut.register("f", () => {
    toggleImmersiveFullScreen();
  });
});

app.on("browser-window-blur", () => {
  log.info("browser-window-blur");
  globalShortcut.unregisterAll();
});

autoUpdater.on("checking-for-update", () => {
  log.info("Checking for update...");
  // mainWindow.webContents.send('update-message', 'Checking for update...');
});

autoUpdater.on("update-available", (info) => {
  log.info("Update available.", info);
  // mainWindow.webContents.send('update-message', `Update available: ${info.version}`);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("Update not available.", info);
  // mainWindow.webContents.send('update-message', 'You are on the latest version.');
});

autoUpdater.on("error", (err) => {
  log.error("Error in auto-updater. " + err);
  // mainWindow.webContents.send('update-message', `Error in auto-updater: ${err.message}`);
});

autoUpdater.on("download-progress", (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + " - Downloaded " + progressObj.percent + "%";
  log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")";
  log.info(log_message);
  // mainWindow.webContents.send('update-message', `Downloading: ${Math.round(progressObj.percent)}%`);
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("Update downloaded. Will install on next restart.", info);
  dialog
    .showMessageBox({
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
