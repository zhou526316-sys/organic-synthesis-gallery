import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const logFile = path.join(os.tmpdir(), 'toc-collector-bootstrap.log');
function mark(stage) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} [${process.pid}] minimal ${stage}\n`);
}
mark('JS file loaded');
const { app, BrowserWindow } = await import('electron');
mark('electron imported');
app.whenReady().then(async () => {
mark('app.whenReady');
mark('BrowserWindow before');
const window = new BrowserWindow({ width: 760, height: 480, show: true, title: 'TOC Collector 0.1.4-debug', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
mark('BrowserWindow after');
await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><title>TOC Collector 0.1.4-debug</title><h1>TOC Collector 0.1.4 started successfully</h1><p>程序已启动</p>'));
window.show();
mark('HTML loaded; visible=' + window.isVisible());
}).catch(error => { mark('startup error: ' + String(error.stack || error)); });
app.on('window-all-closed', () => app.quit());
