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
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  onLogsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, logs) => callback(logs);
    ipcRenderer.on('logs-updated', listener);
    return () => ipcRenderer.removeListener('logs-updated', listener);
  },
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
  openLogs: () => ipcRenderer.invoke('open-logs-window'),
  openTutorial: () => ipcRenderer.invoke('open-tutorial-window'),
  markTutorialSeen: () => ipcRenderer.invoke('tutorial-mark-seen'),
  closeTutorial: () => ipcRenderer.invoke('close-tutorial-window'),
  onHotkeyConflict: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('hotkey-conflict', listener);
    return () => ipcRenderer.removeListener('hotkey-conflict', listener);
  },
});
