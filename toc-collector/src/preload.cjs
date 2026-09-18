const { contextBridge, ipcRenderer } = require('electron');

// Keep Browserbase credentials off URLs and out of the dashboard document.
// The main process validates and persists the two submitted strings.
contextBridge.exposeInMainWorld('tocCollector', {
  saveBrowserbase: ({ apiKey, projectId } = {}) => ipcRenderer.invoke('toc-collector:browserbase-save', { apiKey, projectId }),
  clearBrowserbase: () => ipcRenderer.invoke('toc-collector:browserbase-clear'),
  testBrowserbase: () => ipcRenderer.invoke('toc-collector:browserbase-acceptance'),
  startManualBrowserbase: publisher => ipcRenderer.invoke('toc-collector:browserbase-manual-start', publisher),
  finishManualBrowserbase: publisher => ipcRenderer.invoke('toc-collector:browserbase-manual-finish', publisher),
});
