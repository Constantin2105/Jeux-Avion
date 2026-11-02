const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  templates: {
    list: call('templates:list'),
    get: call('templates:get'),
    create: call('templates:create'),
    update: call('templates:update'),
    duplicate: call('templates:duplicate'),
    setDefault: call('templates:setDefault'),
    remove: call('templates:delete'),
  },
  fiches: {
    search: call('fiches:search'),
    get: call('fiches:get'),
    byRef: call('fiches:byRef'),
    create: call('fiches:create'),
    update: call('fiches:update'),
    remove: call('fiches:delete'),
  },
  qr: call('qr:make'),
  pdf: call('doc:pdf'),
  print: call('doc:print'),
  showFile: call('file:open'),
  backup: {
    info: call('backup:info'),
    openFolder: call('backup:openFolder'),
    exportFile: call('backup:export'),
    importFile: call('backup:import'),
  },
});
