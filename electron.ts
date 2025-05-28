import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  screen,
  globalShortcut,
  ipcMain,
} from "electron";
import path from "path";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater; // https://github.com/electron-userland/electron-builder/issues/7976
import log from "electron-log";

log.transports.file.level = "info"; // Set log level to info
autoUpdater.logger = log;

const DEVTOOLS = true;
const __dirname = path.resolve();

let mainWindow: BrowserWindow | null = null;
let isInImmersiveFullScreen = true; // Start in this mode

// Store initial non-fullscreen bounds for restoration
let nonFullScreenBounds: {
  width: number;
  height: number;
  x?: number;
  y?: number;
} = { width: 1280, height: 720, x: undefined, y: undefined };

function enterImmersiveFullScreen() {
  if (!mainWindow) return;
  const currentBounds = mainWindow.getBounds();
  if (currentBounds.width > 100 && currentBounds.height > 100) {
    // Avoid storing tiny initial bounds
    nonFullScreenBounds = currentBounds;
  }
  log.info(`Entering immersive fullscreen`);

  mainWindow.setKiosk(true);

  isInImmersiveFullScreen = true;
}

function exitImmersiveFullScreen() {
  if (!mainWindow) return;
  log.info(
    `Exiting immersive fullscreen: ${nonFullScreenBounds.width}x${nonFullScreenBounds.height}`,
  );

  mainWindow.setKiosk(false);
  mainWindow.setBounds({
    width: nonFullScreenBounds.width,
    height: nonFullScreenBounds.height,
    x: nonFullScreenBounds.x, // May be undefined initially, center will handle
    y: nonFullScreenBounds.y,
  });

  if (
    typeof nonFullScreenBounds.x === "undefined" ||
    typeof nonFullScreenBounds.y === "undefined"
  ) {
    mainWindow.center();
  }

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
  mainWindow = new BrowserWindow({
    frame: false,
    width: nonFullScreenBounds.width,
    height: nonFullScreenBounds.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: DEVTOOLS,
      disableHtmlFullscreenWindowResize: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "dist/index.html"));

  // Enter immersive fullscreen shortly after window is ready
  // to ensure all screen information is available.
  mainWindow.once("ready-to-show", () => {
    if (isInImmersiveFullScreen) {
      // If we intend to start fullscreen
      enterImmersiveFullScreen();
    }
  });

  if (DEVTOOLS) mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  Menu.setApplicationMenu(null);
}

app.on("ready", () => {
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();

  globalShortcut.register("Escape", () => {
    // if (isInImmersiveFullScreen) exitImmersiveFullScreen();
    toggleImmersiveFullScreen();
  });

  globalShortcut.register("F11", () => {
    toggleImmersiveFullScreen();
  });

  ipcMain.on("quit-app", () => {
    app.quit();
  });

  ipcMain.on("toggle-fullscreen", () => {
    toggleImmersiveFullScreen();
  });

  ipcMain.handle("is-fullscreen-status", () => {
    return isInImmersiveFullScreen;
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("will-quit", () => {
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
  log_message =
    log_message +
    " (" +
    progressObj.transferred +
    "/" +
    progressObj.total +
    ")";
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
      detail:
        "A new version has been downloaded. Restart the application to apply the updates.",
    })
    .then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
});
