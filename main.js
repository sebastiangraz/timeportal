const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

function setSystemTime(formatted) {
  return new Promise((resolve, reject) => {
    const cmd = `powershell.exe -NoProfile -Command "Set-Date -Date '${formatted}'"`;
    exec(cmd, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve();
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

ipcMain.handle('set-system-time', async (_e, formatted) => {
  await setSystemTime(formatted);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
