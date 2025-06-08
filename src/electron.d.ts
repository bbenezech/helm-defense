// sync with the Electron API exposed in preload.js
export interface ElectronAPI {
  log: (...args: any[]) => void;
  quitApp: () => void;
  toggleFullScreen: () => void;
  isFullScreen: () => Promise<boolean>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
