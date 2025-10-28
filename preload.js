const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  hello: () => 'Hello from Electron preload!',
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getInputFieldConfig: () => ipcRenderer.invoke('get-inputfield-config'),
  saveInputFieldConfig: (config) => ipcRenderer.invoke('save-inputfield-config', config),
  onChangeView: (callback) => ipcRenderer.on('change-view', (event, view) => callback(view)),
  onSelectorData: (callback) => ipcRenderer.on('selector-data', (_e, payload) => callback(payload)),
  chooseSelectorIndex: (token, index) => ipcRenderer.send(`selector-chosen:${token}`, index),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  onAIProcessing: (callback) => ipcRenderer.on('ai-processing', (event, isProcessing) => callback(isProcessing)),
  openSettings: () => ipcRenderer.invoke('open-settings-window'),
});
