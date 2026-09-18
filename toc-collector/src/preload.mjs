import { contextBridge, ipcRenderer } from 'electron';

// Keep Browserbase credentials off URLs and out of the dashboard document.
// The main process validates and persists the two submitted strings.
contextBridge.exposeInMainWorld('tocCollector', {
  saveBrowserbase: ({ apiKey, projectId } = {}) => ipcRenderer.invoke('toc-collector:browserbase-save', { apiKey, projectId }),
  clearBrowserbase: () => ipcRenderer.invoke('toc-collector:browserbase-clear'),
  testBrowserbase: () => ipcRenderer.invoke('toc-collector:browserbase-acceptance'),
});
