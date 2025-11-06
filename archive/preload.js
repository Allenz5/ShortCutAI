const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  hello: () => 'Hello from Electron preload!',
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getInputFieldConfig: () => ipcRenderer.invoke('get-inputfield-config'),
  saveInputFieldConfig: (config) => ipcRenderer.invoke('save-inputfield-config', config),
  getSelectionConfig: () => ipcRenderer.invoke('get-selection-config'),
  saveSelectionConfig: (config) => ipcRenderer.invoke('save-selection-config', config),
  onChangeView: (callback) => ipcRenderer.on('change-view', (event, view) => callback(view)),
  onSelectorData: (callback) => ipcRenderer.on('selector-data', (_e, payload) => callback(payload)),
  chooseSelectorIndex: (token, index) => ipcRenderer.send(`selector-chosen:${token}`, index),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  onAIProcessing: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('ai-processing', listener);
    return () => ipcRenderer.removeListener('ai-processing', listener);
  },
  getFloatingWindowBounds: () => ipcRenderer.invoke('floating-window-get-bounds'),
  moveFloatingWindow: (position) => ipcRenderer.send('floating-window-move', position),
  setFloatingWindowIgnoreMouse: (ignore) => ipcRenderer.send('floating-window-ignore-mouse', !!ignore),
  openSettings: () => ipcRenderer.invoke('open-settings-window'),
});
