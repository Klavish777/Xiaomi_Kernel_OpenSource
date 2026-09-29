const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moneyWork', {
  connectMt5: (credentials) => ipcRenderer.invoke('mt5:connect', credentials),
  connectSavedMt5: () => ipcRenderer.invoke('mt5:connect-saved'),
  getSavedMt5Account: () => ipcRenderer.invoke('mt5:get-saved-account'),
  disconnectMt5: () => ipcRenderer.invoke('mt5:disconnect'),
  searchMt5Symbols: (query) => ipcRenderer.invoke('mt5:symbols', query),
  subscribeMt5Symbol: (symbol) => ipcRenderer.invoke('mt5:subscribe', symbol),
  getMt5Account: () => ipcRenderer.invoke('mt5:account'),
  getMt5History: (symbol, count = 2000) => ipcRenderer.invoke('mt5:history', symbol, count),
  getMt5Positions: () => ipcRenderer.invoke('mt5:positions'),
  closeMt5Position: (payload) => ipcRenderer.invoke('mt5:close-position', payload),
  placeMt5ManualOrder: (payload) => ipcRenderer.invoke('mt5:manual-order', payload),
  getMarketAnalystStatus: () => ipcRenderer.invoke('market-analyst:status'),
  saveMarketAnalystKey: (key) => ipcRenderer.invoke('market-analyst:save-key', key),
  deleteMarketAnalystKey: () => ipcRenderer.invoke('market-analyst:delete-key'),
  openMarketAnalystKeyPage: () => ipcRenderer.invoke('market-analyst:open-key-page'),
  analyzeMarket: (payload) => ipcRenderer.invoke('market-analyst:analyze', payload),
  onMt5Event: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('mt5:event', listener);
    return () => ipcRenderer.removeListener('mt5:event', listener);
  },
});
