const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  hello: () => 'Hello from Electron preload!',
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onChangeView: (callback) => ipcRenderer.on('change-view', (event, view) => callback(view)),
});
