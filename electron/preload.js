const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electron", {
  send: (/** @type {string} */ channel, /** @type {string} */ data) => ipcRenderer.send(channel, data),
  on: (/** @type {string} */ channel, /** @type {Function} */ func) =>
    ipcRenderer.on(channel, (_event, ...args) => func(...args)),
});
