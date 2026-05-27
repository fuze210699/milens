const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('milens', {
  getStatus: () => ipcRenderer.invoke('milens:status'),
  getMetrics: (dbPath) => ipcRenderer.invoke('milens:metrics', dbPath),
  getDomains: (dbPath) => ipcRenderer.invoke('milens:domains', dbPath),
  getSecurity: (dbPath) => ipcRenderer.invoke('milens:security', dbPath),
  getAnnotations: (dbPath) => ipcRenderer.invoke('milens:annotations', dbPath),
});
