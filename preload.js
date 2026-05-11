const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setSystemTime: (formatted) => ipcRenderer.invoke('set-system-time', formatted),
  snapshotW32Time: () => ipcRenderer.invoke('w32time-snapshot'),
  restoreAutomaticTime: () => ipcRenderer.invoke('w32time-restore'),
  onCssChanged: (cb) => ipcRenderer.on('css-changed', () => cb()),
});
