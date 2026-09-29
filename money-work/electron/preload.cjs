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
  askLocalAssistant: (payload) => ipcRenderer.invoke('assistant:command', payload),
  getAssistantStatus: () => ipcRenderer.invoke('assistant:status'),
  openAssistantDownload: () => ipcRenderer.invoke('assistant:open-download'),
  setupAssistantModel: () => ipcRenderer.invoke('assistant:setup-model'),
  getAssistantAutoStatus: () => ipcRenderer.invoke('assistant:auto-status'),
  armAssistantAuto: () => ipcRenderer.invoke('assistant:arm-auto'),
  disarmAssistantAuto: () => ipcRenderer.invoke('assistant:disarm-auto'),
  runAssistantCycle: (payload) => ipcRenderer.invoke('assistant:run-cycle', payload),
  reviewAssistantNow: () => ipcRenderer.invoke('assistant:review-now'),
  getAssistantJournal: () => ipcRenderer.invoke('assistant:journal'),
  onAssistantSetupProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('assistant:setup-progress', listener);
    return () => ipcRenderer.removeListener('assistant:setup-progress', listener);
  },
  placeMt5ManualOrder: (payload) => ipcRenderer.invoke('mt5:manual-order', payload),
  onMt5Event: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('mt5:event', listener);
    return () => ipcRenderer.removeListener('mt5:event', listener);
  },
});
