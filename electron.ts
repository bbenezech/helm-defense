import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "path";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater; // https://github.com/electron-userland/electron-builder/issues/7976
import log from "electron-log";

log.transports.file.level = "info"; // Set log level to info
autoUpdater.logger = log;

const DEVTOOLS = false;
const __dirname = path.resolve();

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    frame: false,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: DEVTOOLS,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "dist/index.html"));

  if (DEVTOOLS) mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  Menu.setApplicationMenu(null);
}

app.on("ready", () => {
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
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
