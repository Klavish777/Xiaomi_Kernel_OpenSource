const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moneyWork', {
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  onFullscreenChange: (callback) => {
    const listener = (_event, isFullScreen) => callback(isFullScreen);
    ipcRenderer.on('window:fullscreen', listener);
    return () => ipcRenderer.removeListener('window:fullscreen', listener);
  },
  connectMt5: (credentials) => ipcRenderer.invoke('mt5:connect', credentials),
  connectSavedMt5: () => ipcRenderer.invoke('mt5:connect-saved'),
  getSavedMt5Account: () => ipcRenderer.invoke('mt5:get-saved-account'),
  disconnectMt5: () => ipcRenderer.invoke('mt5:disconnect'),
  searchMt5Symbols: (query) => ipcRenderer.invoke('mt5:symbols', query),
  subscribeMt5Symbol: (symbol) => ipcRenderer.invoke('mt5:subscribe', symbol),
  getMt5History: (symbol, timeframe) => ipcRenderer.invoke('mt5:history', symbol, timeframe),
  getMt5Positions: () => ipcRenderer.invoke('mt5:positions'),
  getMt5Deals: (days) => ipcRenderer.invoke('mt5:deals', days),
  onMt5Event: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('mt5:event', listener);
    return () => ipcRenderer.removeListener('mt5:event', listener);
  },
});
