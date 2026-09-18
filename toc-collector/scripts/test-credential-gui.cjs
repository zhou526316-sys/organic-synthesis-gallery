// Run with Electron. Uses only an isolated temporary profile and synthetic data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = process.env.TOC_TEST_ASAR || root;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toc-credential-test-'));
app.setPath('userData', profile);
delete process.env.BROWSERBASE_API_KEY;
delete process.env.BROWSERBASE_PROJECT_ID;
const syntheticKey = 'synthetic-local-test-not-a-real-key';
const original = { writeToken: 'synthetic-preserved-token', customSetting: 'preserve-me' };
const configFile = path.join(profile, 'config.json');
fs.writeFileSync(configFile, JSON.stringify(original));
let background;
let win;
const failures = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 80; i++) { if (await check()) return; await delay(100); }
  throw new Error('Timed out waiting for GUI/config transition');
}
const read = () => JSON.parse(fs.readFileSync(configFile, 'utf8'));
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ show: false, webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      preload: path.join(source, 'src/preload.cjs'),
    }});
    win.webContents.on('preload-error', () => failures.push('preload-error'));
    const { initializeBackground } = await import(pathToFileURL(path.join(source, 'src/background.mjs')).href);
    background = await initializeBackground({ window: win, stage: 'config', reportError: () => failures.push('background-error') });
    assert.equal(await win.webContents.executeJavaScript('typeof window.tocCollector?.saveBrowserbase'), 'function');
    await win.webContents.executeJavaScript(`document.getElementById('browserbase-api-key').value = ${JSON.stringify(syntheticKey)}; document.querySelector('#browserbase-form button[type=submit]').click(); true`);
    await until(() => read().browserbaseApiKey === syntheticKey);
    await until(async () => { try { return await win.webContents.executeJavaScript("Boolean(document.getElementById('browserbase-test'))"); } catch { return false; } });
    assert.equal(read().browserbaseProjectId, '');
    assert.equal(read().writeToken, original.writeToken);
    assert.equal(read().customSetting, original.customSetting);
    await delay(600);
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('browserbase-api-key').value"), '');
    await win.webContents.executeJavaScript("document.getElementById('browserbase-clear').click(); true");
    await until(() => read().browserbaseApiKey === '');
    await until(async () => { try { return await win.webContents.executeJavaScript("!document.getElementById('browserbase-test')"); } catch { return false; } });
    assert.equal(read().writeToken, original.writeToken);
    assert.equal(read().customSetting, original.customSetting);
    assert.equal(fs.readFileSync(path.join(profile, 'collector.log'), 'utf8').includes(syntheticKey), false);
    assert.deepEqual(failures, []);
    console.log('PASS: sandbox preload; actual save click; blank project; immediate reload; acceptance button; clear click; existing fields preserved; key absent from log');
    background.dispose();
    win.destroy();
    app.exit(0);
  } catch {
    console.error('FAIL: credential GUI smoke test');
    background?.dispose();
    win?.destroy();
    app.exit(1);
  }
});
