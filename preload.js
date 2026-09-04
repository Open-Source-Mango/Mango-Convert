const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('select-file'),
                                startConversion: (payload) => ipcRenderer.send('start-conversion', payload),
                                onProgress: (cb) => ipcRenderer.on('conversion-progress', (e, data) => cb(data)),
                                onDone: (cb) => ipcRenderer.on('conversion-done', (e, success) => cb(success)),
                                onError: (cb) => ipcRenderer.on('conversion-error', (e, err) => cb(err)),
                                minimizeWindow: () => ipcRenderer.send('window-minimize'),
                                closeWindow: () => ipcRenderer.send('window-close')
});
