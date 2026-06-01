import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('milens', {
  getStatus: () => ipcRenderer.invoke('milens:status'),
  getMetrics: () => ipcRenderer.invoke('milens:metrics'),
  getDomains: () => ipcRenderer.invoke('milens:domains'),
  getSecurity: () => ipcRenderer.invoke('milens:security'),
  getAnnotations: () => ipcRenderer.invoke('milens:annotations'),
  getToolActivity: () => ipcRenderer.invoke('milens:toolActivity'),
  getHeat: () => ipcRenderer.invoke('milens:heat'),
});
