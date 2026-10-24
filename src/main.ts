import { app, BrowserWindow, Menu, Notification, ipcMain, shell } from 'electron';
import path from 'path';

// One instance only, so a second launch can't leave a stray process around.
if (!app.requestSingleInstanceLock()) app.quit();
// Windows only shows toast notifications for apps with an AppUserModelID.
app.setAppUserModelId('com.urmamge.dragtrainer');

let win: BrowserWindow | null = null;
// Held so click handlers survive until the toast is dismissed.
const toasts = new Set<Notification>();

function focusWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#14161b',
    title: 'Drag Trainer',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'static', 'index.html'));
  win.on('closed', () => { win = null; });
  // The app never opens other pages itself; links go to the real browser via open-kofi only.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// Fixed URL in the main process, so the page can't ask it to open anything else.
ipcMain.on('open-kofi', () => { shell.openExternal('https://ko-fi.com/urmamge'); });

ipcMain.on('notify', (_e, title: unknown, body: unknown) => {
  if (typeof title !== 'string' || typeof body !== 'string' || !Notification.isSupported()) return;
  const n = new Notification({ title, body });
  toasts.add(n);
  n.on('click', () => { focusWindow(); toasts.delete(n); });
  n.on('close', () => toasts.delete(n));
  n.on('failed', (_ev, err) => { console.error('notification failed:', err); toasts.delete(n); });
  n.show();
  if (win && !win.isFocused()) win.flashFrame(true);
});

app.on('second-instance', focusWindow);

app.whenReady().then(createWindow);

// The X button ends the whole app: no tray, no background process.
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => process.exit(0));
