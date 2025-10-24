const { app, BrowserWindow, Menu, ipcMain, globalShortcut, clipboard, screen, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
let OpenAI;

const configPath = path.join(app.getPath('userData'), 'config.json');
const inputFieldConfigPath = path.join(app.getPath('userData'), 'inputfield-config.json');

// Load or initialize config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { autoStart: false, apiKey: '' };
}

// Save config
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Configure OS login item so the correct app starts on boot
function configureAutoStart(config) {
  try {
    const wantAutoStart = !!config?.autoStart;
    if (!wantAutoStart) {
      app.setLoginItemSettings({ openAtLogin: false });
      return;
    }

    // Avoid registering dev Electron on login; only enable when packaged
    if (!app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: false });
      return;
    }

    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
      });
    } else {
      // macOS/Linux
      app.setLoginItemSettings({
        openAtLogin: true,
      });
    }
  } catch (e) {
    console.error('configureAutoStart error:', e);
  }
}

// Load or initialize InputField config
function loadInputFieldConfig() {
  try {
    if (fs.existsSync(inputFieldConfigPath)) {
      return JSON.parse(fs.readFileSync(inputFieldConfigPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading InputField config:', error);
  }
  // Return default config with EditGrammar profile
  const defaultConfig = {
    profiles: [
      {
        id: 'default-editgrammar',
        name: 'EditGrammar',
        prompt: 'Please fix the grammar and spelling in the following text while keeping the original meaning:'
      }
    ],
    general: { hotkey: '' }
  };
  // Save the default config so it persists
  saveInputFieldConfig(defaultConfig);
  return defaultConfig;
}

// Save InputField config
function saveInputFieldConfig(config) {
  try {
    fs.writeFileSync(inputFieldConfigPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving InputField config:', error);
  }
}

let mainWindow;
let settingsWindow;
let selectorWindow;
let currentHotkey;
let tray;
let isQuitting = false;

function sendKeys(keys) {
  // Windows-only implementation via PowerShell SendKeys
  if (process.platform !== 'win32') return;
  const script = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('${keys}')`;
  spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', script]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function copySelectionText() {
  try {
    // Clear clipboard first to avoid stale values
    clipboard.writeText('');
    await sleep(50);
    // First attempt
    sendKeys('^c');
    await sleep(250);
    let text = clipboard.readText();
    // Retry a few times if empty
    let attempts = 0;
    while ((!text || text.trim() === '') && attempts < 8) {
      if (attempts === 3) {
        // Try copy again mid-way through retries
        sendKeys('^c');
      }
      await sleep(120);
      text = clipboard.readText();
      attempts += 1;
    }
    return text || '';
  } catch (e) {
    console.error('copySelectionText error:', e);
    return '';
  }
}

async function callGptWithPrompt(promptText) {
  try {
    if (!OpenAI) {
      // Lazy-load to avoid require failure when not installed
      OpenAI = require('openai');
    }
    const cfg = loadConfig();
    if (!cfg.apiKey) {
      throw new Error('OpenAI API Key not set');
    }
    const client = new OpenAI({ apiKey: cfg.apiKey });
    const resp = await client.responses.create({
      model: 'gpt-4o-mini',
      input: promptText,
    });
    // Prefer text output
    if (resp.output_text) return resp.output_text;
    const candidates = resp.output || resp.choices;
    if (Array.isArray(candidates) && candidates.length) {
      const c = candidates[0];
      return (c.text || c.message?.content || '').toString();
    }
    return '';
  } catch (e) {
    console.error('OpenAI error:', e);
    return '';
  }
}

function enforceProfileLimit(config) {
  if (!config || !Array.isArray(config.profiles)) return config;
  if (config.profiles.length > 9) {
    config.profiles = config.profiles.slice(0, 9);
  }
  return config;
}

function registerGlobalHotkey() {
  const inputCfg = loadInputFieldConfig();
  const hotkey = inputCfg?.general?.hotkey;
  if (!hotkey) return;
  const toAccelerator = (hk) => {
    const parts = hk.split('+');
    return parts.map(p => {
      if (p === 'Ctrl') return 'CommandOrControl';
      if (p === 'Meta') return 'Super';
      return p;
    }).join('+');
  };
  const accelerator = toAccelerator(hotkey);
  // Unregister previous
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
    currentHotkey = undefined;
  }
  const ok = globalShortcut.register(accelerator, async () => {
    try {
      // Start copying selection immediately but do not block UI
      const copyPromise = copySelectionText();

      // Show selector overlay instantly
      const profiles = (inputCfg.profiles || []).slice(0, 9);
      const chosen = await showSelectorOverlay(profiles);
      if (chosen == null) return;
      const profile = profiles[chosen];
      if (!profile) return;

      // Await copied text (it likely finished while user was choosing)
      let selectedText = await copyPromise;
      // If initial copy failed (likely due to focus), try again now that overlay closed
      if (!selectedText || selectedText.trim() === '') {
        await sleep(80);
        selectedText = await copySelectionText();
      }
      if (!selectedText || selectedText.trim() === '') return;

      // Send to GPT
      const promptText = `${profile.prompt}\n\n${selectedText}`;
      const result = await callGptWithPrompt(promptText);
      if (!result) return;

      // Paste result
      clipboard.writeText(result);
      await new Promise(r => setTimeout(r, 100));
      sendKeys('^v');
    } catch (err) {
      console.error('Hotkey flow error:', err);
    }
  });
  if (ok) currentHotkey = accelerator;
}

function showSelectorOverlay(profiles) {
  return new Promise((resolve) => {
    // Close existing if any
    if (selectorWindow) {
      try { selectorWindow.close(); } catch {}
      selectorWindow = null;
    }
    const cursor = screen.getCursorScreenPoint();
    const width = 280;
    const height = Math.min(9, profiles.length || 1) * 44 + 20;
    const token = `sel_${Date.now()}`;

    selectorWindow = new BrowserWindow({
      width,
      height,
      x: Math.max(0, cursor.x - Math.floor(width / 2)),
      y: Math.max(0, cursor.y + 12),
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      movable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Load selector UI
    if (process.env.NODE_ENV === 'development') {
      selectorWindow.loadURL('http://localhost:3000/selector.html');
    } else {
      selectorWindow.loadFile(path.join(__dirname, 'dist/selector.html'));
    }

    const channel = `selector-chosen:${token}`;
    let done = false;
    const registeredKeys = [];
    const unregisterSelectorShortcuts = () => {
      for (const k of registeredKeys) {
        try { globalShortcut.unregister(k); } catch {}
      }
      registeredKeys.length = 0;
    };
    const chooseAndClose = (index) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(index);
    };
    const registerSelectorShortcuts = (count) => {
      const reg = (accel, handler) => {
        try {
          if (globalShortcut.register(accel, handler)) registeredKeys.push(accel);
        } catch {}
      };
      // Escape to cancel
      reg('Escape', () => chooseAndClose(-1));
      // Number keys 1..9 select profile
      for (let i = 1; i <= Math.min(9, count); i += 1) {
        reg(String(i), () => chooseAndClose(i - 1));
      }
    };
    const cleanup = () => {
      ipcMain.removeAllListeners(channel);
      unregisterSelectorShortcuts();
      if (selectorWindow) {
        try { selectorWindow.close(); } catch {}
        selectorWindow = null;
      }
    };
    ipcMain.once(channel, (_evt, index) => {
      cleanup();
      resolve(index);
    });
    selectorWindow.on('closed', () => {
      selectorWindow = null;
      unregisterSelectorShortcuts();
      if (!done) resolve(null);
    });
    selectorWindow.webContents.on('did-finish-load', () => {
      try {
        if (!selectorWindow || selectorWindow.isDestroyed()) return;
        selectorWindow.webContents.send('selector-data', { profiles, token });
        registerSelectorShortcuts(profiles.length || 0);
      } catch (e) {
        // Window may have been closed before load completed
        console.error('selector did-finish-load handler error:', e);
      }
    });
  });
}

function createTray() {
  if (tray) return;
  let icon;
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else {
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('ShortCutAI');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
        mainWindow.focus();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load from Vite dev server in development, or from built files in production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
  
  // Create custom menu
  const menuTemplate = [
    {
      label: 'Settings',
      click: () => {
        createSettingsWindow();
      }
    },
    {
      label: 'InputField',
      click: () => {
        mainWindow.webContents.send('change-view', 'inputfield');
      }
    }
    // Selection and ScreenShot hidden for now
    // {
    //   label: 'Selection',
    //   click: () => {
    //     mainWindow.webContents.send('change-view', 'selection');
    //   }
    // },
    // {
    //   label: 'ScreenShot',
    //   click: () => {
    //     mainWindow.webContents.send('change-view', 'screenshot');
    //   }
    // }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Minimize to tray on close
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (process.platform === 'win32') mainWindow.setSkipTaskbar(true);
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 400,
    title: 'Settings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load from Vite dev server in development, or from built files in production
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.loadURL('http://localhost:3000/settings.html');
  } else {
    settingsWindow.loadFile(path.join(__dirname, 'dist/settings.html'));
  }
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC handlers
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  
  // Handle auto-start
  configureAutoStart(config);
  
  return { success: true };
});

ipcMain.handle('get-inputfield-config', () => {
  return loadInputFieldConfig();
});

ipcMain.handle('save-inputfield-config', (event, config) => {
  saveInputFieldConfig(enforceProfileLimit(config));
  // Re-register global hotkey if changed
  registerGlobalHotkey();
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();
  registerGlobalHotkey();
  createTray();
  // Ensure login item points to the correct executable after installs/updates
  try { configureAutoStart(loadConfig()); } catch {}
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
