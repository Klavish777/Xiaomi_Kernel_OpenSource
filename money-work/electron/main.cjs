const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const window = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#090b11',
    title: 'Money Work',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    window.loadURL('http://127.0.0.1:5173');
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
