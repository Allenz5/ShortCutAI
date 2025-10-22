const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');

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

let mainWindow;
let settingsWindow;

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
    mainWindow.webContents.openDevTools();
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
  if (config.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe')
    });
  } else {
    app.setLoginItemSettings({
      openAtLogin: false
    });
  }
  
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
