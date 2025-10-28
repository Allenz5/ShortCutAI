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
  return { autoStart: true, apiKey: '' };
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
    app.setLoginItemSettings({ openAtLogin: wantAutoStart });
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
  try {
    if (process.platform === 'win32') {
      const script = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('${keys}')`;
      spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', script]);
      return;
    }
    if (process.platform === 'darwin') {
      const isCtrlCombo = typeof keys === 'string' && keys.startsWith('^') && keys.length === 2;
      if (!isCtrlCombo) return;
      const ch = keys.slice(1).toLowerCase();
      const keyCode = ch === 'c' ? 8 : ch === 'v' ? 9 : undefined; // C:8, V:9
      const appleScript = keyCode != null
        ? `tell application "System Events"
try
  key code ${keyCode} using {command down}
on error
  keystroke "${ch}" using {command down}
end try
end tell`
        : `tell application "System Events" to keystroke "${ch}" using {command down}`;
      spawn('osascript', ['-e', appleScript]);
      return;
    }
  } catch (e) {
    console.error('sendKeys error:', e);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// macOS: get the name of the currently frontmost app
async function getFrontmostAppMac() {
  if (process.platform !== 'darwin') return null;
  const script = 'tell application "System Events" to get name of first application process whose frontmost is true';
  try {
    const result = await new Promise((resolve) => {
      try {
        const child = spawn('osascript', ['-e', script]);
        let out = '';
        child.stdout.on('data', (d) => { out += String(d || ''); });
        child.on('close', () => resolve(out.trim() || null));
        child.on('error', () => resolve(null));
      } catch {
        resolve(null);
      }
    });
    return result || null;
  } catch {
    return null;
  }
}

// macOS: activate an app by name
async function activateAppMac(appName) {
  if (process.platform !== 'darwin' || !appName) return;
  const script = `tell application "${appName.replace(/"/g, '\\"')}" to activate`;
  try {
    await new Promise((resolve) => {
      try {
        const child = spawn('osascript', ['-e', script]);
        child.on('close', () => resolve());
        child.on('error', () => resolve());
      } catch {
        resolve();
      }
    });
  } catch {}
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
      // Reload config to ensure fresh data
      const freshConfig = loadInputFieldConfig();
      const profiles = (freshConfig.profiles || []).slice(0, 9);
      
      // Ensure profiles exist
      if (!profiles || profiles.length === 0) {
        console.error('No profiles configured');
        return;
      }
      
      // Capture the current frontmost app on macOS to restore focus later
      const previousApp = process.platform === 'darwin' ? await getFrontmostAppMac() : null;

      // Start copying selection immediately but do not block UI
      const copyPromise = copySelectionText();

      // Show selector overlay
      const chosen = await showSelectorOverlay(profiles);
      if (chosen == null || chosen < 0) return;
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

      console.log('[ShortCutAI] Copied text:', selectedText);

      // Show loading state on floating window
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send('ai-processing', true);
      }

      // Send to GPT
      const promptText = `${profile.prompt}\n\n${selectedText}`;
      const result = await callGptWithPrompt(promptText);
      
      // Hide loading state
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send('ai-processing', false);
      }
      
      if (!result) return;

      console.log('[ShortCutAI] GPT output:', result);

      // Restore focus to previous app on macOS and paste
      if (process.platform === 'darwin' && previousApp) {
        await activateAppMac(previousApp);
        await sleep(150);
      }
      clipboard.writeText(result);
      await new Promise(r => setTimeout(r, 150));
      if (process.platform === 'darwin' || process.platform === 'win32') {
        sendKeys('^v');
      }
    } catch (err) {
      console.error('Hotkey flow error:', err);
      // Make sure to hide loading state on error
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send('ai-processing', false);
      }
    }
  });
  if (ok) currentHotkey = accelerator;
}

function showSelectorOverlay(profiles) {
  return new Promise((resolve) => {
    // Validate profiles exist
    if (!profiles || profiles.length === 0) {
      console.error('No profiles available for selector');
      resolve(null);
      return;
    }
    
    // Close existing if any
    if (selectorWindow) {
      try { selectorWindow.close(); } catch {}
      selectorWindow = null;
    }
    const cursor = screen.getCursorScreenPoint();
    const width = 260;
    const height = Math.min(9, profiles.length || 1) * 38 + 16;
    const token = `sel_${Date.now()}`;
    
    // Position below cursor, centered - minimal mouse movement
    const x = Math.max(0, cursor.x - Math.floor(width / 2));
    const y = cursor.y + 24; // 24px below cursor

    selectorWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      movable: false,
      show: false,  // Add this line - don't show until data is loaded
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
      // Wait for window to be fully ready
      const sendData = () => {
        try {
          if (!selectorWindow || selectorWindow.isDestroyed()) return;
          selectorWindow.webContents.send('selector-data', { profiles, token });
          registerSelectorShortcuts(profiles.length || 0);
        } catch (e) {
          console.error('Error sending selector data:', e);
        }
      };
      
      // Send immediately
      sendData();
      
      // Send again after delays to ensure receipt
      setTimeout(sendData, 50);
      setTimeout(() => {
        sendData();
        // Show window only after data is sent
        if (selectorWindow && !selectorWindow.isDestroyed()) {
          selectorWindow.show();
        }
      }, 150);
    });
  });
}

function createTray() {
  if (tray) return;
  let icon;
  try {
    const iconTemplatePath = path.join(__dirname, 'iconTemplate.png');
    const iconPath = path.join(__dirname, 'icon.png');
    // Prefer the same icon used for macOS menu bar (iconTemplate.png) on all platforms
    if (fs.existsSync(iconTemplatePath)) {
      icon = nativeImage.createFromPath(iconTemplatePath);
      if (process.platform === 'darwin') {
        try { icon.setTemplateImage(true); } catch {}
      }
    } else if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      if (process.platform === 'darwin') { try { icon.setTemplateImage(true); } catch {} }
    } else {
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  // If no image is available, show a short title in the macOS menu bar
  if (process.platform === 'darwin' && icon.isEmpty && icon.isEmpty()) {
    try { tray.setTitle('AI'); } catch {}
  }
  tray.setToolTip('ShortCutAI');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        try {
          if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.close();
          }
        } catch {}
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
      if (process.platform === 'darwin') {
        try { app.dock.show(); } catch {}
      }
      mainWindow.show();
      if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
      mainWindow.focus();
      // Hide floating window when main window is shown
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
      }
    }
  });
}

let floatingWindow;

function createFloatingWindow() {
  if (floatingWindow) return;

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  const windowWidth = 64;
  const windowHeight = 64;
  const margin = 20;

  floatingWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - margin,
    y: screenHeight - windowHeight - margin,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Ensure always on top with highest level
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');

  // Right-click (context menu) with only Quit
  const buildFloatingContextMenu = () => Menu.buildFromTemplate([
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        try {
          if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.close();
          }
        } catch {}
        app.quit();
      }
    }
  ]);
  try {
    floatingWindow.webContents.on('context-menu', () => {
      try { buildFloatingContextMenu().popup({ window: floatingWindow }); } catch {}
    });
  } catch {}

  // Load floating UI
  if (process.env.NODE_ENV === 'development') {
    floatingWindow.loadURL('http://localhost:3000/floating.html');
  } else {
    floatingWindow.loadFile(path.join(__dirname, 'dist/floating.html'));
  }

  // Click to show main window
  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });

  // Prevent closing, just hide
  floatingWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
    }
  });

  floatingWindow.on('blur', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });
}

function centerWindow(win, width, height) {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  const x = Math.floor((screenWidth - width) / 2);
  const y = Math.floor((screenHeight - height) / 2);
  
  win.setBounds({ x, y, width, height });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 880,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  centerWindow(mainWindow, 1024, 680);

  // Load from Vite dev server in development, or from built files in production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
  
  // Remove application menu
  try { Menu.setApplicationMenu(null); } catch {}

  // Minimize to floating window on close
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (process.platform === 'win32') mainWindow.setSkipTaskbar(true);
    if (process.platform === 'darwin') {
      try { app.dock.hide(); } catch {}
    }
    
    // Show floating window when main window closes
    if (!floatingWindow || floatingWindow.isDestroyed()) {
      createFloatingWindow();
    } else {
      floatingWindow.show();
    }
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 560,
    minWidth: 480,
    minHeight: 560,
    maxWidth: 600,
    resizable: false,
    title: 'Settings',
    autoHideMenuBar: true,
    parent: mainWindow,  // Add this line
    modal: false,        // Add this line
    center: true,        // Add this line
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

// Open Settings window from renderer
ipcMain.handle('open-settings-window', () => {
  try {
    createSettingsWindow();
    return { success: true };
  } catch (e) {
    console.error('Failed to open settings window:', e);
    return { success: false, error: e?.message || 'Unknown error' };
  }
});

ipcMain.handle('show-main-window', () => {
  if (mainWindow) {
    if (process.platform === 'darwin') {
      try { app.dock.show(); } catch {}
    }
    mainWindow.show();
    if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
    mainWindow.focus();
    
    // Hide floating window when main window is shown
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.hide();
    }
  }
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();
  registerGlobalHotkey();
  createTray();
  // Ensure login item points to the correct executable after installs/updates
  try { configureAutoStart(loadConfig()); } catch {}
  try {
    if (app.isPackaged && process.platform === 'darwin') {
      const st = app.getLoginItemSettings();
      if (st?.openAtLogin) {
        // Make sure the main window is visible on login
        if (mainWindow) {
          try { app.dock.show(); } catch {}
          mainWindow.show();
          mainWindow.focus();
        }
      }
    }
  } catch {}
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      if (process.platform === 'darwin') {
        try { app.dock.show(); } catch {}
      }
      mainWindow.show();
      if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
      mainWindow.focus();
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
      }
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
