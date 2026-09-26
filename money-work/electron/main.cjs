const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

let mainWindow;
let bridge;
let nextRequestId = 1;
let stdoutBuffer = '';
let bridgeDiagnostic = '';
const pending = new Map();
const accountFile = () => path.join(app.getPath('userData'), 'mt5-account.bin');

function sendEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mt5:event', payload);
}

function rejectPending(message) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(message));
  }
  pending.clear();
}

function startBridge() {
  if (bridge && bridge.exitCode === null) return bridge;
  const bridgeCandidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'mt5-bridge.exe'),
        path.join(process.resourcesPath, 'mt5-bridge', 'mt5-bridge.exe'),
      ]
    : [
        path.join(__dirname, '..', 'bridge', 'dist', 'mt5-bridge.exe'),
        path.join(__dirname, '..', 'bridge', 'dist', 'mt5-bridge', 'mt5-bridge.exe'),
      ];
  const bridgePath = bridgeCandidates.find((candidate) => fs.existsSync(candidate));
  if (!bridgePath) {
    throw new Error(`MT5 connector executable is missing. Checked: ${bridgeCandidates.join(' | ')}. Reinstall Money Work or rebuild the Windows installer.`);
  }
  bridge = spawn(bridgePath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  stdoutBuffer = '';
  bridgeDiagnostic = '';
  bridge.stdout.setEncoding('utf8');
  bridge.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.type === 'response') {
          const entry = pending.get(message.requestId);
          if (entry) {
            clearTimeout(entry.timer);
            pending.delete(message.requestId);
            if (message.ok) entry.resolve(message);
            else entry.reject(new Error(message.message || 'MT5 connector request failed.'));
          }
        } else {
          if (['fatal', 'error', 'warning'].includes(message.type) && message.message) {
            bridgeDiagnostic = String(message.message).slice(-1200);
          }
          sendEvent(message);
        }
      } catch (error) {
        bridgeDiagnostic = `Invalid connector output: ${error.message}`;
        sendEvent({ type: 'warning', message: bridgeDiagnostic });
      }
    }
  });
  bridge.stderr.setEncoding('utf8');
  bridge.stderr.on('data', (text) => {
    const detail = String(text).trim();
    if (detail) bridgeDiagnostic = `${bridgeDiagnostic} ${detail}`.trim().slice(-1200);
    if (detail) sendEvent({ type: 'log', message: detail });
  });
  bridge.on('error', (error) => {
    bridgeDiagnostic = `Could not start MT5 connector: ${error.message}`;
    sendEvent({ type: 'error', message: bridgeDiagnostic });
    rejectPending(bridgeDiagnostic);
    bridge = null;
  });
  bridge.on('exit', (code) => {
    const stoppedMessage = bridgeDiagnostic
      ? `MT5 connector stopped (code ${code ?? 'unknown'}): ${bridgeDiagnostic}`
      : `MT5 connector stopped unexpectedly (code ${code ?? 'unknown'}). Confirm the 64-bit MetaTrader 5 desktop terminal is installed on this PC, then retry.`;
    if (code !== 0 || bridgeDiagnostic) sendEvent({ type: 'error', message: stoppedMessage });
    rejectPending(stoppedMessage);
    bridge = null;
  });
  return bridge;
}

function bridgeRequest(action, payload = {}, timeoutMs = 45000) {
  const child = startBridge();
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('MT5 did not respond in time. Check that the terminal is installed and reachable.'));
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ action, requestId, ...payload })}\n`, (error) => {
      if (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });
  });
}

function saveCredentials(credentials) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable. Do not enable Remember account.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
  fs.writeFileSync(accountFile(), encrypted, { mode: 0o600 });
}

function readCredentials() {
  const file = accountFile();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable.');
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#090b11',
    title: 'Money Work',
    autoHideMenuBar: true,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:fullscreen', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:fullscreen', false));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });
  if (!app.isPackaged) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('external:open-mt5-download', async () => shell.openExternal('https://www.metatrader5.com/en/download'));
ipcMain.handle('external:open-bybit-mt5-guide', async () => shell.openExternal('https://www.bybit.com/en/derivative-activity/tradfi'));

ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});

ipcMain.handle('mt5:connect', async (_event, credentials) => {
  if (!credentials || !credentials.login || !credentials.password || !credentials.server) {
    throw new Error('Account number, password, and MT5 server are required.');
  }
  if (credentials.remember && !safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure credential storage is unavailable. Connect without saving, or enable Windows DPAPI support.');
  }
  const safeCredentials = {
    login: String(credentials.login).trim(),
    password: String(credentials.password),
    server: String(credentials.server).trim(),
    terminalPath: String(credentials.terminalPath || '').trim(),
  };
  const result = await bridgeRequest('connect', safeCredentials, 60000);
  if (credentials.remember) saveCredentials(safeCredentials);
  return result.account;
});

ipcMain.handle('mt5:connect-saved', async () => {
  const credentials = readCredentials();
  if (!credentials) throw new Error('No saved account is available on this device.');
  const result = await bridgeRequest('connect', credentials, 60000);
  return result.account;
});

ipcMain.handle('mt5:get-saved-account', async () => {
  const credentials = readCredentials();
  return credentials ? { login: credentials.login, server: credentials.server, terminalPath: credentials.terminalPath } : null;
});

ipcMain.handle('mt5:disconnect', async () => {
  if (!bridge || bridge.exitCode !== null) return true;
  await bridgeRequest('disconnect', {}, 15000);
  return true;
});

ipcMain.handle('mt5:symbols', async (_event, query) => {
  const result = await bridgeRequest('symbols', { query: String(query || '') });
  return result.symbols || [];
});

ipcMain.handle('mt5:subscribe', async (_event, symbol) => {
  const result = await bridgeRequest('subscribe', { symbol: String(symbol || '') });
  return result.quote;
});

ipcMain.handle('mt5:history', async (_event, symbol, timeframe) => {
  const result = await bridgeRequest('history', { symbol: String(symbol || ''), timeframe: String(timeframe || '15M') });
  return result.bars || [];
});

ipcMain.handle('mt5:positions', async () => {
  const result = await bridgeRequest('positions');
  return result.positions || [];
});

ipcMain.handle('mt5:deals', async (_event, days) => {
  const result = await bridgeRequest('deals', { days: Number(days) || 30 });
  return result.deals || [];
});

ipcMain.handle('mt5:agent-evaluate', async (_event, payload) => {
  if (!payload || !/^AUDCAD[A-Z0-9.+_-]*$/i.test(String(payload.symbol || ''))) {
    throw new Error('The automatic agent is restricted to the broker AUDCAD symbol.');
  }
  if (!['WATCH BUY', 'WATCH SELL', 'WAIT'].includes(payload.signal)) {
    throw new Error('Invalid market signal for the automatic agent.');
  }
  const rsi = Number(payload.rsi);
  if (!Number.isFinite(rsi) || rsi < 0 || rsi > 100) throw new Error('Invalid RSI value.');
  const schedule = payload.schedule || {};
  const days = Array.isArray(schedule.days) ? schedule.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
  const rawReference = payload.reference;
  const reference = rawReference && typeof rawReference === 'object' ? {
    base: String(rawReference.base || '').slice(0, 8),
    sourceDate: String(rawReference.sourceDate || '').slice(0, 10),
    rate: Number(rawReference.rate),
    fetchedAt: String(rawReference.fetchedAt || '').slice(0, 40),
  } : null;
  const result = await bridgeRequest('agent_evaluate', {
    symbol: String(payload.symbol),
    signal: payload.signal,
    rsi,
    entryAllowed: payload.entryAllowed !== false,
    liveConfirmed: payload.liveConfirmed === true,
    schedule: { start: String(schedule.start || ''), end: String(schedule.end || ''), days },
    reference,
  }, 20000);
  return result.result;
});

app.whenReady().then(createWindow);
app.on('before-quit', () => {
  try { if (bridge && bridge.exitCode === null) bridge.kill(); } catch (_) { /* best-effort cleanup */ }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
