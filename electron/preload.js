const { contextBridge, ipcRenderer } = require("electron");

// sync with electron.d.ts
contextBridge.exposeInMainWorld("electron", {
  // One-way
  // send: (/** @type {string} */ channel, /** @type {any[]} */ ...args) => ipcRenderer.send(channel, ...args),
  // Two-way
  // invoke: (/** @type {string} */ channel, /** @type {any[]} */ ...args) => ipcRenderer.invoke(channel, ...args),

  log: (/** @type {any[]} */ ...messages) => ipcRenderer.send("log", ...messages),
  quitApp: () => ipcRenderer.send("quit-app"),
  toggleFullScreen: () => ipcRenderer.send("toggle-full-screen"),
  isFullScreen: () => ipcRenderer.invoke("is-full-screen"),
});
