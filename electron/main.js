import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } from "electron";
import path from "path";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater; // https://github.com/electron-userland/electron-builder/issues/7976
import log from "electron-log";
import { fileURLToPath } from "url";
const USE_DANGEROUS_MAC_HACK_FULL_SCREEN = false; // Set to false to disable the hackish full-screen mode for Macs with notches

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

log.transports.file.level = "info"; // Set log level to info
autoUpdater.logger = log;

log.info(`App starting from ${__dirname}...`, process.env["NODE_ENV"]);
const devTools = process.env["NODE_ENV"] === "development";

/** @type {null | BrowserWindow} */
let mainWindow = null;
let isFullScreen = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fullScreenModes = {
  classic: {
    desc: "Regular full-screen mode, best for Windows/Linux",
    mac: [
      "menu & dock toggle when edge scrolling top/bottom",
      "notch area is a mouse dead zone that cannot be handled",
    ],
  },
  kiosk: {
    desc: "Immersive full-screen mode, best for Macs without notch",
    mac: ["notch area is a mouse dead zone that cannot be handled"],
  },
  "mac-old": {
    desc: "Simple MacOS full-screen mode (old pre-Lion behavior without workspace)",
    mac: ["menu & dock toggle when edge scrolling top/bottom"],
  },
  "mac-hack": { desc: "Composite kiosk/mac-old mode, best for Silicon MacBook Pros with notches", mac: ["hackish"] },
};
// classic: Regular mode, best for Windows/Linux. MacOS issues: menu & dock toggle when edge scrolling top/bottom, notch area is a mouse dead zone that cannot be handled.
// kiosk: Immersive mode, best for Macs without notch. MacOS issue: notch area is a mouse dead zone that cannot be handled.
// mac-old: No workspace mode (old pre-Lion behavior). MacOS issue: menu & dock toggle when edge scrolling top/bottom.
// mac-hack: Composite kiosk/mac-old mode, hackish but best for Macs with notchs when it works.
/** @type {keyof typeof fullScreenModes} */
let fullScreenMode = "classic";
/** @type {null | {width:number; height: number,x: number; y:number}} */
let nonFullScreenBounds = null;
let isQuitting = false;

function enterFullScreen(/** @type {keyof typeof fullScreenModes} */ mode) {
  if (!mainWindow) return;
  const currentBounds = mainWindow.getBounds();
  if (currentBounds.width > 100 && currentBounds.height > 100) nonFullScreenBounds = currentBounds;
  log.info("enterFullScreen nonFullScreenBounds", nonFullScreenBounds);

  if (mode === "classic") {
    mainWindow.setFullScreen(true);
  } else if (mode === "kiosk") {
    mainWindow.setKiosk(true);
  } else if (mode === "mac-old") {
    mainWindow.setSimpleFullScreen(true);
  } else if (mode === "mac-hack") {
    // enter crazy town
    mainWindow.setFullScreen(true);
    mainWindow.setSimpleFullScreen(true);
    mainWindow.setKiosk(true);
    mainWindow.setEnabled(false);
    mainWindow.setEnabled(true);
  }

  // helps with focus issues on macOS
  setTimeout(() => {
    mainWindow?.webContents.focus();
  }, 500);

  isFullScreen = true;
}

function exitFullScreen(/** @type {keyof typeof fullScreenModes} */ mode) {
  if (!mainWindow) return;
  if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
  if (mainWindow.isSimpleFullScreen()) mainWindow.setSimpleFullScreen(false);
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);

  log.info("exitFullScreen nonFullScreenBounds", nonFullScreenBounds);

  if (nonFullScreenBounds)
    mainWindow.setBounds({
      width: nonFullScreenBounds.width,
      height: nonFullScreenBounds.height,
      x: nonFullScreenBounds.x,
      y: nonFullScreenBounds.y,
    });

  if (mode === "mac-hack") {
    mainWindow.setEnabled(false);
    mainWindow.setEnabled(true);
  }

  setTimeout(() => {
    mainWindow?.webContents.focus();
  }, 500);

  isFullScreen = false;
}

function toggleFullScreen() {
  if (!mainWindow) return;
  if (isFullScreen) {
    exitFullScreen(fullScreenMode);
  } else {
    enterFullScreen(fullScreenMode);
  }
}

function createWindow() {
  const mac = process.platform === "darwin";
  const webPreferences = {
    devTools,
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, "../electron/preload.js"),
  };
  const frame = !mac;

  if (mac) fullScreenMode = "kiosk"; // avoid edge scrolling issues on macOS, other platforms can use classic full screen without issues

  const primaryDisplay = screen.getPrimaryDisplay();
  const notched = primaryDisplay.size.height > primaryDisplay.workAreaSize.height;
  if (mac && notched && USE_DANGEROUS_MAC_HACK_FULL_SCREEN) {
    fullScreenMode = "mac-hack"; // use insane hacks to cover notch area and avoid edge scrolling issues
    log.info("Notched Mac detected:", primaryDisplay.size.height, primaryDisplay.workAreaSize.height);
  }

  mainWindow = new BrowserWindow(
    fullScreenMode === "mac-hack"
      ? { frame, webPreferences, kiosk: false, fullscreen: false, simpleFullscreen: false }
      : { frame, webPreferences },
  );

  if (isFullScreen) {
    log.info("Switching window to full screen");
    enterFullScreen(fullScreenMode);
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

  globalShortcut.register("CommandOrControl+R", () => {
    log.info("CommandOrControl+R is pressed: Shortcut Disabled");
  });
  globalShortcut.register("CommandOrControl+Shift+R", () => {
    log.info("CommandOrControl+Shift+R is pressed: Shortcut Disabled");
  });
  globalShortcut.register("F5", () => {
    log.info("F5 is pressed: Shortcut Disabled");
  });
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
