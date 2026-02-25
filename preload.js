'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFolder: (folderPath) => ipcRenderer.invoke('fs:readFolder', folderPath),
  previewRename: (payload) => ipcRenderer.invoke('rename:preview', payload),
  executeRename: (payload) => ipcRenderer.invoke('rename:execute', payload),
  undoRename: (payload) => ipcRenderer.invoke('rename:undo', payload)
});
