const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { Store } = require('./src/db');

let win = null;

// Interface en français (format des dates, boîtes de dialogue du système).
app.commandLine.appendSwitch('lang', 'fr');
let store = null;

// Une seule instance : évite deux fenêtres qui écriraient dans la même base.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function dbFile() {
  const dir = process.env.FICHES_DATA_DIR || path.join(app.getPath('userData'), 'donnees');
  return path.join(dir, 'fiches.sqlite');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "Fiches d'attribution de parcelles",
    backgroundColor: '#f3f4f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // Modifications non enregistrées : demande de confirmation avant de fermer.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Quitter sans enregistrer', 'Rester'],
      defaultId: 1,
      cancelId: 1,
      title: 'Modifications non enregistrées',
      message: 'Des modifications ne sont pas enregistrées. Quitter quand même ?',
    });
    if (choice === 0) e.preventDefault();
  });
  // Les liens externes éventuels ne s'ouvrent jamais dans l'application.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
  });
}

// Chaque appel renvoie { ok, data } ou { ok:false, error } pour un affichage propre côté interface.
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(channel, err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function safeFileName(s) {
  return String(s || 'fiche').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'fiche';
}

function registerIpc() {
  handle('templates:list', () => store.listTemplates());
  handle('templates:get', (id) => store.getTemplate(id));
  handle('templates:create', (data) => store.createTemplate(data, false));
  handle('templates:update', (id, data) => store.updateTemplate(id, data));
  handle('templates:duplicate', (id) => store.duplicateTemplate(id));
  handle('templates:setDefault', (id) => store.setDefaultTemplate(id));
  handle('templates:delete', (id) => store.deleteTemplate(id));

  handle('fiches:search', (q) => store.searchFiches(q));
  handle('fiches:get', (id) => store.getFiche(id));
  handle('fiches:byRef', (ref) => store.findByReference(ref));
  handle('fiches:create', (payload) => store.createFiche(payload));
  handle('fiches:update', (id, values) => store.updateFiche(id, values));
  handle('fiches:delete', (id) => store.deleteFiche(id));

  handle('qr:make', (text) => QRCode.toDataURL(String(text), { errorCorrectionLevel: 'M', margin: 1, width: 360 }));

  // Le document à imprimer est placé par l'interface dans une zone dédiée,
  // seule visible à l'impression (voir @media print dans styles.css).
  handle('doc:pdf', async (suggestedName) => {
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const res = await dialog.showSaveDialog(win, {
      title: 'Enregistrer la fiche en PDF',
      defaultPath: path.join(app.getPath('documents'), safeFileName(suggestedName) + '.pdf'),
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, pdf);
    return res.filePath;
  });

  handle('doc:print', () =>
    new Promise((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' }, pageSize: 'A4' }, (success, reason) => {
        if (success || reason === 'cancelled' || reason === 'Print job canceled') resolve(success);
        else reject(new Error("L'impression a échoué : " + reason));
      });
    })
  );

  handle('file:open', (p) => shell.showItemInFolder(p));

  handle('backup:info', () => ({ file: dbFile(), ...store.stats() }));
  handle('backup:openFolder', () => shell.showItemInFolder(dbFile()));
  handle('backup:export', async () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const res = await dialog.showSaveDialog(win, {
      title: 'Enregistrer une sauvegarde',
      defaultPath: path.join(app.getPath('documents'), `sauvegarde-fiches-${stamp}.sqlite`),
      filters: [{ name: 'Sauvegarde des fiches', extensions: ['sqlite'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, store.exportBytes());
    return res.filePath;
  });
  handle('backup:import', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir une sauvegarde à restaurer',
      properties: ['openFile'],
      filters: [{ name: 'Sauvegarde des fiches', extensions: ['sqlite'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    // Copie de sécurité de la base actuelle avant remplacement.
    const safety = dbFile().replace(/\.sqlite$/, `-avant-restauration-${Date.now()}.sqlite`);
    fs.writeFileSync(safety, store.exportBytes());
    store.restoreFrom(fs.readFileSync(res.filePaths[0]));
    return { restored: res.filePaths[0], safety };
  });
}

app.whenReady().then(async () => {
  try {
    store = await Store.open(dbFile());
  } catch (err) {
    dialog.showErrorBox('Erreur', "Impossible d'ouvrir la base de données :\n" + err.message);
    app.quit();
    return;
  }
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
