// Kept as a plain script (no import/export): sandboxed preloads get a limited
// require, and the renderer only needs this one call.
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('cps', {
  notify: (title: string, body: string) => ipcRenderer.send('notify', title, body),
  openKofi: () => ipcRenderer.send('open-kofi'),
});
