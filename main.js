'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const renamer = require('./renamer');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    icon: path.join(__dirname,'assets/icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f1117',
      symbolColor: '#94a3b8',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname,'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show',()=>{
    mainWindow.show();
    mainWindow.focus();
  });
}


app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// --- IPC Handlers ---

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('fs:readFolder', async (_, folderPath) => {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => {
        const fullPath = path.join(folderPath, e.name);
        let stat;
        try { stat = fs.statSync(fullPath); } catch { stat = {}; }
        return {
          name: e.name,
          ext: path.extname(e.name),
          base: path.basename(e.name, path.extname(e.name)),
          size: stat.size || 0,
          mtime: stat.mtime ? stat.mtime.toISOString() : null,
          birthtime: stat.birthtime ? stat.birthtime.toISOString() : null
        };
      });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('rename:preview', async (_, { files, rules }) => {
  return renamer.generatePreview(files, rules);
});

ipcMain.handle('rename:execute', async (_, { folderPath, previews }) => {
  return renamer.executeRename(folderPath, previews);
});

ipcMain.handle('rename:undo', async (_, { folderPath, undoMap }) => {
  return renamer.executeUndo(folderPath, undoMap);
});