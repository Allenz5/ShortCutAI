const { app, BrowserWindow, Menu, ipcMain, globalShortcut, clipboard, screen, Tray, nativeImage, systemPreferences, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
let OpenAI;
const AutoLaunch = require('electron-auto-launch');

const configPath = path.join(app.getPath('userData'), 'config.json');
const inputFieldConfigPath = path.join(app.getPath('userData'), 'inputfield-config.json');
const selectionConfigPath = path.join(app.getPath('userData'), 'selection-config.json');

const startedHidden = determineHiddenStartup();

const APP_ICON_RELATIVE_PATH = path.join('assets', 'floating', 'nerd.png');
let cachedAppIconPath;

function determineHiddenStartup() {
  try {
    if (process.platform === 'darwin') {
      const loginSettings = app.getLoginItemSettings();
      if (loginSettings?.wasOpenedAtLogin || loginSettings?.wasOpenedAsHidden) {
        return true;
      }
    } else if (process.platform === 'win32') {
      const argMatches = process.argv.some((arg) => {
        if (!arg) return false;
        const lower = String(arg).toLowerCase();
        return lower === '--hidden' || lower.includes('--hidden');
      });
      if (argMatches) return true;
      try {
        const loginSettings = app.getLoginItemSettings?.();
        if (loginSettings?.wasOpenedAtLogin) return true;
      } catch {}
    }
  } catch {}
  return false;
}

function resolveAppIconPath() {
  if (cachedAppIconPath !== undefined) return cachedAppIconPath;
  const candidates = [
    path.join(__dirname, 'public', APP_ICON_RELATIVE_PATH),
    path.join(__dirname, 'dist', APP_ICON_RELATIVE_PATH),
    path.join(process.resourcesPath || '', APP_ICON_RELATIVE_PATH),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', APP_ICON_RELATIVE_PATH),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        cachedAppIconPath = candidate;
        return cachedAppIconPath;
      }
    } catch {
      // Ignore missing paths and continue searching
    }
  }
  cachedAppIconPath = null;
  return cachedAppIconPath;
}

function getAppIconPath() {
  return resolveAppIconPath();
}

function getAppIconImage() {
  const iconPath = resolveAppIconPath();
  if (!iconPath) return nativeImage.createEmpty();
  try {
    const image = nativeImage.createFromPath(iconPath);
    if (!image || image.isEmpty()) return nativeImage.createEmpty();
    return image;
  } catch {
    return nativeImage.createEmpty();
  }
}

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

let appAutoLauncher;

function getAutoLauncher() {
  if (appAutoLauncher) return appAutoLauncher;
  try {
    appAutoLauncher = new AutoLaunch({
      name: 'ShortCutAI',
      isHidden: true,
    });
  } catch (e) {
    console.error('Failed to init AutoLaunch:', e);
  }
  return appAutoLauncher;
}

// Configure OS login item so the correct app starts on boot
function configureAutoStart(config) {
  try {
    if (!app.isPackaged) {
      return;
    }
    const wantAutoStart = !!config?.autoStart;
    const launcher = getAutoLauncher();
    if (!launcher) return;
    launcher.isEnabled().then((enabled) => {
      if (wantAutoStart && !enabled) {
        launcher.enable().catch((e) => console.error('AutoLaunch enable error:', e));
      } else if (wantAutoStart && enabled) {
        launcher.disable()
          .catch((e) => console.error('AutoLaunch disable (refresh) error:', e))
          .finally(() => {
            launcher.enable().catch((e) => console.error('AutoLaunch re-enable error:', e));
          });
      } else if (!wantAutoStart && enabled) {
        launcher.disable().catch((e) => console.error('AutoLaunch disable error:', e));
      }
    }).catch((e) => console.error('AutoLaunch isEnabled error:', e));
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

// Load or initialize Selection config
function loadSelectionConfig() {
  try {
    if (fs.existsSync(selectionConfigPath)) {
      return JSON.parse(fs.readFileSync(selectionConfigPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading Selection config:', error);
  }
  // Default Selection config mirrors InputField structure
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
  saveSelectionConfig(defaultConfig);
  return defaultConfig;
}

// Save Selection config
function saveSelectionConfig(config) {
  try {
    fs.writeFileSync(selectionConfigPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving Selection config:', error);
  }
}

let mainWindow;
let settingsWindow;
let selectorWindow;
let currentHotkey;
let currentSelectionHotkey;
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
  const selectionCfg = loadSelectionConfig();
  const inputHotkey = inputCfg?.general?.hotkey;
  const selectionHotkey = selectionCfg?.general?.hotkey;
  const toAccelerator = (hk) => {
    if (!hk) return '';
    const parts = hk.split('+');
    return parts.map(p => {
      if (p === 'Ctrl') return 'CommandOrControl';
      if (p === 'Meta') return 'Super';
      return p;
    }).join('+');
  };

  // Unregister previous InputField hotkey
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
    currentHotkey = undefined;
  }
  // Unregister previous Selection hotkey
  if (currentSelectionHotkey) {
    globalShortcut.unregister(currentSelectionHotkey);
    currentSelectionHotkey = undefined;
  }

  // Register InputField hotkey if present
  if (inputHotkey) {
    const accelerator = toAccelerator(inputHotkey);
    const ok = globalShortcut.register(accelerator, async () => {
      try {
        const freshConfig = loadInputFieldConfig();
        const profiles = (freshConfig.profiles || []).slice(0, 9);
        if (!profiles || profiles.length === 0) {
          console.error('No profiles configured');
          return;
        }
        const previousApp = process.platform === 'darwin' ? await getFrontmostAppMac() : null;
        const copyPromise = copySelectionText();
        const chosen = await showSelectorOverlay(profiles);
        if (chosen == null || chosen < 0) return;
        const profile = profiles[chosen];
        if (!profile) return;
        let selectedText = await copyPromise;
        if (!selectedText || selectedText.trim() === '') {
          await sleep(80);
          selectedText = await copySelectionText();
        }
        if (!selectedText || selectedText.trim() === '') return;
        console.log('[ShortCutAI] Copied text:', selectedText);
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('ai-processing', 'input');
        }
        const promptText = `${profile.prompt}\n\n${selectedText}`;
        const result = await callGptWithPrompt(promptText);
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('ai-processing', 'idle');
        }
        if (!result) return;
        console.log('[ShortCutAI] GPT output:', result);
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
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('ai-processing', 'idle');
        }
      }
    });
    if (ok) currentHotkey = accelerator;
  }

  // Register Selection hotkey if present (but DO NOT paste result)
  if (selectionHotkey) {
    const accelerator = toAccelerator(selectionHotkey);
    const ok = globalShortcut.register(accelerator, async () => {
      try {
        const freshConfig = loadSelectionConfig();
        const profiles = (freshConfig.profiles || []).slice(0, 9);
        if (!profiles || profiles.length === 0) {
          console.error('No Selection profiles configured');
          return;
        }
        const previousApp = process.platform === 'darwin' ? await getFrontmostAppMac() : null;
        const copyPromise = copySelectionText();
        const chosen = await showSelectorOverlay(profiles);
        if (chosen == null || chosen < 0) return;
        const profile = profiles[chosen];
        if (!profile) return;
        let selectedText = await copyPromise;
        if (!selectedText || selectedText.trim() === '') {
          await sleep(80);
          selectedText = await copySelectionText();
        }
        if (!selectedText || selectedText.trim() === '') return;
        console.log('[ShortCutAI] Selection Copied text:', selectedText);
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('ai-processing', 'selection');
        }
        const promptText = `${profile.prompt}\n\n${selectedText}`;
        const result = await callGptWithPrompt(promptText);
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('ai-processing', 'idle');
        }
        if (!result) return;
        console.log('[ShortCutAI] Selection GPT output:', result);
        if (process.platform === 'darwin' && previousApp) {
          await activateAppMac(previousApp);
          await sleep(150);
        }
        showResultDialog(result);
        // Do not set clipboard or paste here
      } catch (err) {
        console.error('Selection Hotkey flow error:', err);
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('ai-processing', 'idle');
        }
      }
    });
    if (ok) currentSelectionHotkey = accelerator;
  }
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
    const display = screen.getDisplayNearestPoint(cursor);
    const workArea = display?.workArea || {
      x: display?.bounds?.x || 0,
      y: display?.bounds?.y || 0,
      width: display?.bounds?.width || width,
      height: display?.bounds?.height || height,
    };
    const workX = workArea.x || 0;
    const workY = workArea.y || 0;
    const workWidth = workArea.width || width;
    const workHeight = workArea.height || height;
    
    let x = cursor.x - Math.floor(width / 2);
    x = Math.max(workX, Math.min(x, workX + workWidth - width));
    
    let y = cursor.y - Math.floor(height / 2);
    if (y < workY) {
      y = workY;
    }
    if (y + height > workY + workHeight) {
      y = Math.max(workY, workY + workHeight - height);
    }

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

function showResultDialog(resultText) {
  const { screen, BrowserWindow } = require('electron');
  const cursor = screen.getCursorScreenPoint();
  const lines = resultText.split('\n').length;
  const charsPerLine = Math.max(...resultText.split('\n').map(l => l.length));
  const width = Math.min(900, Math.max(320, charsPerLine * 12 + 50));
  const height = Math.min(600, Math.max(120, lines * 32 + 70));
  const display = screen.getDisplayNearestPoint(cursor);
  const workArea = display?.workArea || {
    x: display?.bounds?.x || 0,
    y: display?.bounds?.y || 0,
    width: display?.bounds?.width || width,
    height: display?.bounds?.height || height,
  };
  const workX = workArea.x || 0;
  const workY = workArea.y || 0;
  const workWidth = workArea.width || width;
  const workHeight = workArea.height || height;

  let x = cursor.x - Math.floor(width / 2);
  x = Math.max(workX, Math.min(x, workX + workWidth - width));

  let y = cursor.y - Math.floor(height / 2);
  if (y < workY) {
    y = workY;
  }
  if (y + height > workY + workHeight) {
    y = Math.max(workY, workY + workHeight - height);
  }

  // Central single-layer dialog on completely transparent background
  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'>
    <title>AI Result</title>
    <style>
      html, body { height: 100%; margin: 0; padding: 0; background: transparent !important; }
      body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: transparent !important; }
      .dialog {
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 24px 0 rgba(60,60,92,0.14);
        padding: 12px 12px 12px 12px;
        min-width: 220px;
        max-width: 700px;
        max-height: 500px;
        font-family: system-ui,sans-serif;
        color: #222;
        box-sizing: border-box;
        overflow: auto;
      }
      .result {
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.6;
        padding-bottom: 0;
        user-select: text;
        font-weight: 400;
      }
    </style>
  </head><body tabindex='1'>
    <div class='dialog'>
      <div class='result'>${resultText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
    </div>
    <script>document.body.focus();document.body.onkeydown=e=>{if(e.key==='Escape'){window.close();}};document.body.onclick=()=>window.close();</script>
  </body></html>`;

  const win = new BrowserWindow({
    width, height,
    x,
    y,
    resizable: true,
    alwaysOnTop: true,
    minimizable: false,
    maximizable: false,
    frame: false,
    skipTaskbar: true,
    transparent: true, // Keep OS background transparent, dialog only white layer
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
  win.once('ready-to-show', () => win.show());
  win.on('blur', () => { try { win.close(); } catch {} });
}

function createTray() {
  if (tray) return;
  let icon = getAppIconImage();
  if (!icon || icon.isEmpty()) {
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
  try {
    floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (err) {
    console.warn('setVisibleOnAllWorkspaces unsupported:', err?.message || err);
  }

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
    show: !startedHidden,
    icon: getAppIconPath() || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  centerWindow(mainWindow, 1024, 680);

  if (startedHidden) {
    mainWindow.once('ready-to-show', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (process.platform === 'win32') {
        try { mainWindow.setSkipTaskbar(true); } catch {}
      }
      if (process.platform === 'darwin') {
        try { app.dock.hide(); } catch {}
      }
    });
  }

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

function ensureMacAccessibility() {
  try {
    if (process.platform !== 'darwin') return;
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (trusted) return;
    // Prompt the OS to show the Accessibility dialog
    try { systemPreferences.isTrustedAccessibilityClient(true); } catch {}
    // Provide helpful instructions and deep link to the correct pane
    try {
      dialog.showMessageBox({
        type: 'info',
        buttons: ['Open System Settings', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Enable Accessibility for ShortCutAI',
        message: 'ShortCutAI needs Accessibility permission to read selections and paste results.',
        detail: 'Go to System Settings → Privacy & Security → Accessibility and enable ShortCutAI.',
      }).then((res) => {
        if (res.response === 0) {
          try { shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); } catch {}
        }
      }).catch(() => {});
    } catch {}
  } catch (e) {
    console.error('ensureMacAccessibility error:', e);
  }
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
    icon: getAppIconPath() || undefined,
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

ipcMain.handle('get-selection-config', () => {
  return loadSelectionConfig();
});

ipcMain.handle('save-selection-config', (event, config) => {
  saveSelectionConfig(enforceProfileLimit(config));
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
  }
  return { success: true };
});

ipcMain.handle('floating-window-get-bounds', () => {
  try {
    if (!floatingWindow || floatingWindow.isDestroyed()) return null;
    const { x, y } = floatingWindow.getBounds();
    return { x, y };
  } catch {
    return null;
  }
});

ipcMain.on('floating-window-move', (_event, position) => {
  try {
    if (!floatingWindow || floatingWindow.isDestroyed()) return;
    const { x, y } = position || {};
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    floatingWindow.setPosition(Math.round(x), Math.round(y));
  } catch (err) {
    console.error('Failed to move floating window:', err);
  }
});

ipcMain.on('floating-window-ignore-mouse', (_event, ignore) => {
  try {
    if (!floatingWindow || floatingWindow.isDestroyed()) return;
    if (ignore) {
      floatingWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      floatingWindow.setIgnoreMouseEvents(false);
    }
  } catch (err) {
    console.error('Failed to update floating window mouse event handling:', err);
  }
});

app.whenReady().then(() => {
  try {
    if (process.platform === 'darwin') {
      const iconImage = getAppIconImage();
      if (iconImage && !iconImage.isEmpty()) {
        app.dock.setIcon(iconImage);
      }
    }
  } catch {}
  createWindow();
  createFloatingWindow();
  ensureMacAccessibility();
  registerGlobalHotkey();
  createTray();
  // Ensure login item points to the correct executable after installs/updates
  try { configureAutoStart(loadConfig()); } catch {}
  // If no OpenAI API key is configured, prompt user to open Settings on startup
  try {
    const cfg = loadConfig();
    const apiKey = (cfg && typeof cfg.apiKey === 'string') ? cfg.apiKey.trim() : '';
    if (!apiKey) {
      createSettingsWindow();
    }
  } catch {}
  try {
    if (!startedHidden && app.isPackaged && process.platform === 'darwin') {
      const st = app.getLoginItemSettings();
      if (st?.openAtLogin && mainWindow) {
        try { app.dock.show(); } catch {}
        mainWindow.show();
        mainWindow.focus();
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
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
