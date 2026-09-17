import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// No Electron import or app.getPath is needed to record entry/module failures.
const bootstrapPath = path.join(os.tmpdir(), 'toc-collector-bootstrap.log');
function mark(stage, detail = '') {
  try {
    fs.appendFileSync(bootstrapPath, `${new Date().toISOString()} [${process.pid}] ${stage} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}\n`);
  } catch (error) { console.error('Bootstrap log unavailable:', error.message); }
}
mark('JS file loaded', { entry: import.meta.url, electron: process.versions.electron });
// A diagnostic console may close while this GUI app keeps running.
// Broken stdout/stderr must never become an uncaught application error.
process.stdout?.on('error', error => mark('stdout.error', error.message));
process.stderr?.on('error', error => mark('stderr.error', error.message));
let electron;
let window;
let background;
const errors = [];
function errorText(error) { return String(error?.stack || error); }
function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function reportError(stage, error) {
  mark(`${stage}.error`, errorText(error));
  errors.push(`${stage}: ${String(error?.message || error)}`);
  if (errors.length > 6) errors.shift();
  if (window && !window.isDestroyed()) {
    window.show();
    // Keep the existing page/window alive; the background module also shows its errors.
    void window.webContents.executeJavaScript(`(() => {
      let box = document.getElementById('bootstrap-errors');
      if (!box) { box = document.createElement('pre'); box.id = 'bootstrap-errors'; box.style.cssText='white-space:pre-wrap;background:#fff0f0;color:#8b1717;padding:16px'; document.body.prepend(box); }
      box.textContent = ${JSON.stringify('后台功能出错，主窗口继续运行。\n' + errors.join('\n'))};
    })()`).catch(error => mark('error-display.failed', errorText(error)));
  } else if (electron) {
    electron.dialog.showErrorBox('TOC Collector 启动失败', `${errorText(error)}\n\n日志：${bootstrapPath}`);
  }
}
process.on('uncaughtException', error => reportError('uncaughtException', error));
process.on('unhandledRejection', error => reportError('unhandledRejection', error));
process.on('exit', code => mark('process.exit', { code }));

// Dynamic import is deliberately after the first synchronous file write.
try {
  mark('electron.import.before');
  electron = await import('electron');
  mark('electron.import.after');
} catch (error) {
  mark('electron.import.error', errorText(error));
  throw error; // The native launcher records the non-zero exit before Electron dialogs exist.
}
const { app, BrowserWindow } = electron;
app.on('before-quit', () => { mark('app.before-quit'); background?.dispose(); });
app.on('window-all-closed', () => app.quit());
app.on('child-process-gone', (_event, details) => reportError('child-process-gone', new Error(JSON.stringify(details))));

// Do not top-level-await whenReady: Electron must finish evaluating the ESM entry
// before it can emit ready. Awaiting ready there deadlocks a windowless process.
mark('app.whenReady.register');
app.whenReady().then(async () => {
  mark('app.whenReady', { version: app.getVersion(), userData: app.getPath('userData') });
  mark('BrowserWindow.before');
  window = new BrowserWindow({
    width: 800, height: 740, minWidth: 560, minHeight: 480,
    show: true, autoHideMenuBar: true, title: `TOC Collector ${app.getVersion()}`,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  mark('BrowserWindow.after', { id: window.id });
  window.webContents.on('render-process-gone', (_event, details) => {
    mark('renderer.gone', details);
    electron.dialog.showErrorBox('TOC Collector 页面进程错误', `${details.reason}\n日志：${bootstrapPath}`);
  });
  window.webContents.on('did-fail-load', (_event, code, description) => mark('renderer.load-failed', { code, description }));
  window.on('closed', () => { mark('BrowserWindow.closed'); window = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('collector:')) event.preventDefault(); });
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>TOC Collector ${app.getVersion()}</title><style>body{font:17px Segoe UI,Arial;margin:40px;background:#f6f7f9;color:#202124}h1{font-size:27px}p{line-height:1.6}code{overflow-wrap:anywhere}</style><h1>程序已启动</h1><p>TOC Collector ${escapeHtml(app.getVersion())} started successfully</p><p>正在加载后台功能，发生错误时此窗口会继续显示。</p><p>启动日志：<code>${escapeHtml(bootstrapPath)}</code></p>`));
  window.show();
  window.focus();
  mark('startup-window.visible', { visible: window.isVisible(), title: window.getTitle() });
  const stageArg = process.argv.find(arg => arg.startsWith('--startup-stage='));
  const stage = stageArg?.split('=')[1] || 'collector';
  if (stage === 'window') { mark('startup.complete', { stage }); return; }
  // Yield after the first page renders; no background dependency precedes the UI.
  setImmediate(async () => {
    try {
      mark('background.import.before');
      const { initializeBackground } = await import('./background.mjs');
      mark('background.import.after');
      background = await initializeBackground({ window, stage, mark, reportError });
      mark('startup.complete', { stage, visible: Boolean(window && !window.isDestroyed() && window.isVisible()) });
    } catch (error) { reportError('background', error); }
  });
}).catch(error => reportError('startup', error));
