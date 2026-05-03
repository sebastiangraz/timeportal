const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setSystemTime: (formatted) => ipcRenderer.invoke('set-system-time', formatted),
});
