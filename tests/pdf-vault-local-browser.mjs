import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// This suite uses real Chromium IndexedDB, OPFS, FileSystemHandles and PDF.js.
// Only account API responses, picker UI and explicit failure injection are fixtures.
// A picker returning an OPFS directory exercises the directory adapter and structured
// clone persistence; it is not a test of the native Windows folder permission prompt.
const OUTPUT = path.resolve(process.env.PDF_VAULT_BROWSER_OUTPUT || 'test-results/pdf-vault-local-browser');
const DIST = path.resolve('dist');
const DB_NAME = 'gallery-pdf-vault-local-v1';
const SESSION_KEY = 'organic-gallery-session-v1';
const DOI = '10.9999/gallery-local-vault-fixture';
const TOKENS = { a: 'fixture-session-a', b: 'fixture-session-b' };
const USERS = { a: 'fixture-user-a', b: 'fixture-user-b' };
const cases = [], contexts = new Set(), observedStaticPaths = new Set();
let browser, server, base, activeCase, fatalError;
await fs.mkdir(OUTPUT, { recursive: true });

function vectorPdf(shade = '0.2') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    '',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  for (const [index, color] of [[3, shade + ' 0.5 0.8'], [5, '0.8 ' + shade + ' 0.4']]) {
    const stream = 'q ' + color + ' rg 30 40 280 360 re f 0 0 0 RG 3 w 25 25 m 330 450 l S BT /F1 18 Tf 0 0 0 rg 50 430 Td (Gallery local PDF page ' + (index === 3 ? 1 : 2) + ') Tj ET Q\n';
    objects[index] = '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream';
  }
  let body = '%PDF-1.7\n% Gallery synthetic two-page vector and Helvetica fixture. No publisher content.\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(body)); body += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
  const start = Buffer.byteLength(body);
  body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) body += String(offset).padStart(10, '0') + ' 00000 n \n';
  body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n';
  return Buffer.from(body);
}
const PDF = vectorPdf(), CHANGED_PDF = vectorPdf('0.7');
assert.equal(PDF.length, CHANGED_PDF.length, 'changed fixture preserves size so a size-only probe cannot pass');
const PDF_HASH = createHash('sha256').update(PDF).digest('hex');
const forbiddenNetworkValues = [PDF_HASH, PDF.toString('base64'), '%PDF-', 'fixture-private-document.pdf', 'picked-directory'];
const bounded = (array, value) => { if (array.length < 80) array.push(value); };
const by = (page, name) => page.getByTestId('pdf-vault-' + name);
const copyRows = page => page.locator('[data-testid="pdf-vault-list"] article[data-copy-id]');

async function staticServer() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.ttf': 'font/ttf' };
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    let relative;
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch { res.writeHead(400); res.end(); return; }
    let file = path.resolve(DIST, relative);
    if (!file.startsWith(DIST + path.sep) && file !== DIST) { res.writeHead(403); res.end(); return; }
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}

async function trackedContext({ width = 1280, holdAuth = false, folderPicker = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  contexts.add(context); context.setDefaultTimeout(7000); context.setDefaultNavigationTimeout(12000);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const diagnostic = activeCase;
  const state = { holdAuth, allowAuthCancellation: false, pendingAuth: [], authCalls: [], requests: [] };
  context.on('close', () => contexts.delete(context));
  context.on('response', response => {
    try { const url = new URL(response.url()); if (url.origin === base && response.status() === 200 && !url.pathname.startsWith('/api/')) observedStaticPaths.add(url.pathname); } catch {}
  });
  context.on('page', page => {
    page.on('pageerror', error => bounded(diagnostic.pageErrors, String(error)));
    page.on('console', message => { if (message.type() === 'error') bounded(diagnostic.consoleErrors, message.text()); });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText || '';
      const expected = state.allowAuthCancellation && new URL(request.url()).pathname === '/api/user-ui/auth/session' && request.headers().authorization === 'Bearer ' + TOKENS.a && /(?:net::ERR_ABORTED|NS_BINDING_ABORTED)/.test(reason);
      bounded(diagnostic.failedRequests, { url: request.url(), reason, expected: Boolean(expected) });
    });
    page.on('response', response => { if (response.url().includes('/api/')) bounded(diagnostic.responses, { url: response.url(), status: response.status() }); });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), post = request.postData() || '';
    bounded(state.requests, { url: request.url(), method: request.method(), postBytes: Buffer.byteLength(post) });
    for (const forbidden of forbiddenNetworkValues) if (request.url().includes(forbidden) || post.includes(forbidden)) {
      bounded(diagnostic.privateNetworkLeaks, { url: request.url().slice(0, 300), category: 'private_bytes_hash_name_or_path' });
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"private_payload_blocked_by_fixture"}' });
    }
    if (url.pathname === '/api/user-ui/auth/session' && [base, 'https://api.gczhouwld.com'].includes(url.origin)) {
      if (request.method() !== 'GET' || post || url.search) {
        bounded(diagnostic.unexpectedNetwork, { url: url.origin + url.pathname, method: request.method(), reason: 'session_request_must_contain_no_document_payload' });
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unexpected_session_payload"}' });
      }
      const token = String(request.headers().authorization || '').replace(/^Bearer /, '');
      state.authCalls.push(token);
      if (state.holdAuth && token === TOKENS.a) await new Promise(resolve => state.pendingAuth.push(resolve));
      const who = token === TOKENS.a ? 'a' : token === TOKENS.b ? 'b' : null;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' }, body: JSON.stringify({ authenticated: Boolean(who), user: who ? { id: USERS[who], displayName: '测试账号 ' + who.toUpperCase(), email: who + '@example.invalid', capabilities: [] } : null }) });
    }
    if (url.origin === base && !url.pathname.startsWith('/api/')) return route.continue();
    bounded(diagnostic.unexpectedNetwork, { url: request.url(), method: request.method() });
    return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"unexpected_network_blocked_by_fixture"}' });
  });
  await context.addInitScript(({ origin, sessionKey, token, folderPicker }) => {
    if (location.origin !== origin) return;
    if (!localStorage.getItem('gallery-local-vault-fixture-seeded')) {
      localStorage.setItem(sessionKey, token);
      localStorage.setItem('gallery-local-vault-fixture-seeded', '1');
    }
    window.__pdfVaultFixture = { pickerMode: 'real', writeMode: 'real', permission: 'granted', pickerCalls: 0, writesStarted: 0, releaseWrites: [] };
    window.showDirectoryPicker = async () => {
      const state = window.__pdfVaultFixture; state.pickerCalls++;
      if (state.pickerMode === 'cancel') throw new DOMException('Fixture picker cancellation', 'AbortError');
      if (state.pickerMode === 'deny') throw new DOMException('Fixture picker denial', 'NotAllowedError');
      return (await navigator.storage.getDirectory()).getDirectoryHandle('picked-directory', { create: true });
    };
    if (!folderPicker) window.showDirectoryPicker = undefined;
    const prototype = FileSystemDirectoryHandle.prototype;
    const query = prototype.queryPermission, request = prototype.requestPermission;
    prototype.queryPermission = function (options) { return (this.name === 'picked-directory' || this.name.startsWith('library-')) ? Promise.resolve(window.__pdfVaultFixture.permission) : query.call(this, options); };
    prototype.requestPermission = function (options) { return (this.name === 'picked-directory' || this.name.startsWith('library-')) ? Promise.resolve(window.__pdfVaultFixture.permission) : request.call(this, options); };
    const createWritable = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (options) {
      if (this.name.endsWith('.pdf')) {
        const state = window.__pdfVaultFixture; state.writesStarted++;
        if (state.writeMode === 'deny') throw new DOMException('Fixture full local storage', 'QuotaExceededError');
        if (state.writeMode === 'hold') await new Promise(resolve => state.releaseWrites.push(resolve));
      }
      return createWritable.call(this, options);
    };
  }, { origin: base, sessionKey: SESSION_KEY, token: TOKENS.a, folderPicker });
  return { context, state };
}

async function pageFor(context, { authenticated = true } = {}) {
  const page = await context.newPage();
  await page.goto(base + '/pdf-vault/?doi=' + encodeURIComponent(DOI), { waitUntil: 'domcontentloaded' });
  await by(page, 'status').waitFor({ state: 'attached' });
  if (authenticated) await waitAccount(page, 'a');
  return page;
}
async function waitAccount(page, who) {
  await page.waitForFunction(expected => document.documentElement.dataset.pdfVaultAuth === 'authenticated' && document.querySelector('[data-testid="pdf-vault-account"]')?.textContent?.includes(expected), '测试账号 ' + who.toUpperCase());
}
async function waitStatus(page, status) {
  await page.waitForFunction(status => document.querySelector('[data-testid="pdf-vault-status"]')?.dataset.status === status, status);
}
async function switchAccount(page, who, notify = true) {
  return page.evaluate(({ key, token, notify }) => {
    if (token) localStorage.setItem(key, token); else localStorage.removeItem(key);
    if (notify) window.dispatchEvent(new Event('gallery-auth-session-changed'));
    const reader = document.querySelector('[data-testid="pdf-vault-reader"]');
    const canvas = document.querySelector('[data-testid="pdf-vault-reader-canvas"]');
    return { auth: document.documentElement.dataset.pdfVaultAuth, readerVisible: Boolean(reader && !reader.hidden && reader.open), canvasWidth: canvas?.width || 0, rows: document.querySelectorAll('[data-testid="pdf-vault-list"] article[data-copy-id]').length };
  }, { key: SESSION_KEY, token: who ? TOKENS[who] : '', notify });
}
async function selectDestination(page, destination = 'opfs') {
  await by(page, destination).click(); await waitStatus(page, 'success');
}
async function importFile(page, buffer = PDF, name = 'fixture-private-document.pdf', mimeType = 'application/pdf') {
  await by(page, 'doi').fill(DOI);
  await by(page, 'file').setInputFiles({ name, mimeType, buffer });
  await by(page, 'import').click();
}
async function importGood(page, { destination = 'opfs' } = {}) {
  await selectDestination(page, destination); await importFile(page);
  await waitStatus(page, 'success');
  assert.equal(await copyRows(page).count(), 1, 'successful import must create exactly one visible copy');
  return copyRows(page).first().getAttribute('data-copy-id');
}
async function localCopies(page, user = USERS.a) {
  return page.evaluate(async ({ name, user }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('copies', 'readonly').objectStore('copies').getAll(); request.onsuccess = () => resolve(request.result.filter(row => row.user_id === user).map(({ directory_handle, ...row }) => ({ ...row, hasDirectoryHandle: Boolean(directory_handle && directory_handle.kind === 'directory') }))); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  }, { name: DB_NAME, user });
}
async function localDestination(page, user = USERS.a) {
  return page.evaluate(async ({ name, user }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('accounts', 'readonly').objectStore('accounts').get(user); request.onsuccess = () => resolve(request.result?.destination?.kind || null); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  }, { name: DB_NAME, user });
}
async function mutateFile(page, mode) {
  return page.evaluate(async ({ name, bytes, mode }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const record = await new Promise((resolve, reject) => { const request = db.transaction('copies', 'readonly').objectStore('copies').getAll(); request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error); }); db.close();
    if (mode === 'remove') { await record.directory_handle.removeEntry(record.file_name); return; }
    const fileHandle = await record.directory_handle.getFileHandle(record.file_name);
    const writable = await fileHandle.createWritable(); await writable.write(new Uint8Array(bytes)); await writable.close();
  }, { name: DB_NAME, bytes: [...CHANGED_PDF], mode });
}
async function openFirst(page) {
  await copyRows(page).first().getByTestId('pdf-vault-open').click();
  await by(page, 'reader').waitFor({ state: 'visible' });
  await page.waitForFunction(() => { const canvas = document.querySelector('[data-testid="pdf-vault-reader-canvas"]'); return canvas && canvas.width > 0 && canvas.height > 0 && canvas.dataset.renderedPage === '1' && document.querySelector('[data-testid="pdf-vault-reader-pagecount"]')?.textContent?.includes('2'); });
}
async function assertRendered(page) {
  await page.waitForFunction(() => { const canvas = document.querySelector('[data-testid="pdf-vault-reader-canvas"]'); return canvas?.dataset.renderedPage && document.querySelector('[data-testid="pdf-vault-reader-status"]')?.dataset.status === 'success'; });
  const metrics = await by(page, 'reader-canvas').evaluate(canvas => {
    const context = canvas.getContext('2d'), pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0; for (let i = 0; i < pixels.length; i += 4 * 113) if (pixels[i + 3] > 0 && (Math.abs(pixels[i] - pixels[i + 1]) > 10 || Math.abs(pixels[i + 1] - pixels[i + 2]) > 10)) colored++;
    return { width: canvas.width, height: canvas.height, colored };
  });
  assert.ok(metrics.width > 100 && metrics.height > 100 && metrics.colored > 50, 'PDF.js must render actual non-empty page pixels');
}
async function saveVisual(page, name) {
  if (!process.env.PDF_VAULT_BROWSER_VISUALS) return;
  const directory = path.resolve(process.env.PDF_VAULT_BROWSER_VISUALS);
  await fs.mkdir(directory, { recursive: true });
  if (name.endsWith('library')) await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(directory, name + '.png'), fullPage: false });
}
async function assertNoReader(page) { assert.equal(await by(page, 'reader').isVisible(), false, 'failed or stale open must not expose the reader'); }
async function waitUntil(predicate, description) {
  for (let i = 0; i < 140; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  assert.ok(predicate(), description);
}

async function test(name, work) {
  const record = { name, status: 'running', pageErrors: [], consoleErrors: [], failedRequests: [], unexpectedNetwork: [], privateNetworkLeaks: [], responses: [] };
  cases.push(record); activeCase = record; const start = Date.now();
  try {
    await work();
    assert.deepEqual(record.pageErrors, [], 'uncaught browser errors');
    assert.deepEqual(record.consoleErrors, [], 'browser console errors');
    assert.deepEqual(record.failedRequests.filter(item => !item.expected), [], 'unexpected failed browser requests');
    assert.deepEqual(record.unexpectedNetwork, [], 'unexpected external or service requests');
    assert.deepEqual(record.privateNetworkLeaks, [], 'private bytes, content hashes, filenames and paths must stay local');
    record.status = 'passed'; console.log('PDF_VAULT_LOCAL_BROWSER_PASS ' + name);
  } catch (error) {
    record.status = 'failed'; record.error = String(error?.stack || error);
    const slug = String(cases.length).padStart(2, '0') + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 55);
    let index = 0; record.screenshots = []; record.traces = [];
    for (const context of contexts) {
      for (const page of context.pages()) { const filename = slug + '-' + (++index) + '.png'; try { await page.screenshot({ path: path.join(OUTPUT, filename), fullPage: true }); record.screenshots.push(filename); } catch {} }
      const filename = slug + '-context-' + index + '.zip'; try { await context.tracing.stop({ path: path.join(OUTPUT, filename) }); record.traces.push(filename); } catch {}
    }
    await fs.writeFile(path.join(OUTPUT, slug + '-diagnostics.json'), JSON.stringify(record, null, 2) + '\n');
    throw error;
  } finally { record.durationMs = Date.now() - start; for (const context of [...contexts]) await context.close().catch(() => {}); }
}

try {
  base = process.env.PDF_VAULT_BASE_URL ? new URL(process.env.PDF_VAULT_BASE_URL).origin : await staticServer();
  browser = await chromium.launch({ headless: true });
  await test('real OPFS import is read back and reopened after reload', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page);
    let copies = await localCopies(page); assert.equal(copies.length, 1); assert.equal(copies[0].content_hash, PDF_HASH); assert.equal(copies[0].byte_length, PDF.length); assert.equal(copies[0].hasDirectoryHandle, true);
    await openFirst(page); await assertRendered(page); await saveVisual(page, 'desktop-reader'); await by(page, 'reader-close').click();
    await page.reload({ waitUntil: 'domcontentloaded' }); await waitAccount(page, 'a');
    assert.equal(await copyRows(page).count(), 1); await openFirst(page); await assertRendered(page);
    copies = await localCopies(page); assert.equal(copies.length, 1, 'opening a stored PDF does not import another copy');
    await by(page, 'reader-close').click();
    const downloadPromise = page.waitForEvent('download'); await copyRows(page).first().getByTestId('pdf-vault-export').click();
    const download = await downloadPromise, chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'), PDF_HASH, 'export is the actual retained PDF');
    assert.match(download.suggestedFilename(), /\.pdf$/i);
  });
  await test('directory adapter persists a real file handle and reopens it', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page, { destination: 'directory' });
    assert.equal(await page.evaluate(() => window.__pdfVaultFixture.pickerCalls), 1);
    const copies = await localCopies(page); assert.equal(copies[0].storage_kind, 'local_folder'); assert.equal(copies[0].hasDirectoryHandle, true);
    await page.reload({ waitUntil: 'domcontentloaded' }); await waitAccount(page, 'a'); await openFirst(page); await assertRendered(page);
  });
  await test('PDF.js renders both pages and closes without retaining pixels', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page); await openFirst(page); await assertRendered(page);
    assert.match(await by(page, 'reader-pagecount').innerText(), /1\s*\/\s*2/);
    await by(page, 'reader-next').click(); await page.waitForFunction(() => /2\s*\/\s*2/.test(document.querySelector('[data-testid="pdf-vault-reader-pagecount"]')?.textContent || ''));
    await assertRendered(page); await by(page, 'reader-previous').click(); await page.waitForFunction(() => /1\s*\/\s*2/.test(document.querySelector('[data-testid="pdf-vault-reader-pagecount"]')?.textContent || ''));
    await by(page, 'reader-close').click(); await assertNoReader(page);
    assert.equal(await by(page, 'reader-canvas').evaluate(canvas => canvas.width), 0);
  });
  await test('changed same-size PDF cannot reuse a prior readability result', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page); await mutateFile(page, 'change');
    await copyRows(page).first().getByTestId('pdf-vault-open').click(); await waitStatus(page, 'error'); await assertNoReader(page);
    assert.match(await by(page, 'status').innerText(), /变化|不同|不一致|重新导入|校验|损坏/);
  });
  await test('removed file is unavailable even though its manifest persists', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page); await mutateFile(page, 'remove');
    await copyRows(page).first().getByTestId('pdf-vault-open').click(); await waitStatus(page, 'error'); await assertNoReader(page);
    assert.match(await by(page, 'status').innerText(), /不存在|找不到|丢失|移走|删除|无法找到/);
    assert.equal((await localCopies(page)).length, 1, 'missing-file evidence does not invent a fresh successful import');
  });
  await test('two accounts keep independent same-DOI copies and namespaces', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); const aId = await importGood(page);
    const switched = await switchAccount(page, 'b'); assert.equal(switched.rows, 0); await waitAccount(page, 'b'); assert.equal(await copyRows(page).count(), 0);
    const bId = await importGood(page); assert.notEqual(aId, bId);
    const a = (await localCopies(page, USERS.a))[0], b = (await localCopies(page, USERS.b))[0];
    assert.equal(a.content_hash, b.content_hash); assert.notEqual(a.id, b.id); assert.notEqual(a.file_name, b.file_name);
    await switchAccount(page, 'a'); await waitAccount(page, 'a'); assert.equal(await copyRows(page).count(), 1); assert.equal(await copyRows(page).first().getAttribute('data-copy-id'), aId); await openFirst(page);
  });
  await test('logout synchronously hides the reader and discards rendered pixels', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page); await openFirst(page);
    const state = await switchAccount(page, null); assert.equal(state.readerVisible, false); assert.equal(state.canvasWidth, 0); assert.equal(state.rows, 0); await assertNoReader(page);
  });
  await test('storage events revoke an old account reader in another tab', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page); await openFirst(page);
    const second = await pageFor(context); await switchAccount(second, 'b'); await waitAccount(page, 'b');
    assert.equal(await copyRows(page).count(), 0); await assertNoReader(page); assert.equal(await by(page, 'reader-canvas').evaluate(canvas => canvas.width), 0);
  });
  await test('watcher catches a token change without an explicit auth event', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page); await openFirst(page);
    await switchAccount(page, 'b', false); await waitAccount(page, 'b'); assert.equal(await copyRows(page).count(), 0); await assertNoReader(page);
  });
  await test('late account response cannot expose an earlier account library', async () => {
    const { context, state } = await trackedContext(); const page = await pageFor(context); await importGood(page);
    state.holdAuth = true; state.allowAuthCancellation = true; await page.reload({ waitUntil: 'domcontentloaded' }); await waitUntil(() => state.pendingAuth.length > 0, 'held account request started');
    await switchAccount(page, 'b'); await waitAccount(page, 'b');
    for (const release of state.pendingAuth.splice(0)) release(); state.holdAuth = false;
    await page.waitForTimeout(100); await waitAccount(page, 'b'); assert.equal(await copyRows(page).count(), 0); await assertNoReader(page);
  });
  await test('logout while writing cannot commit a successful old-account import', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await selectDestination(page);
    await page.evaluate(() => { window.__pdfVaultFixture.writeMode = 'hold'; }); await importFile(page);
    await page.waitForFunction(() => window.__pdfVaultFixture.releaseWrites.length > 0);
    await switchAccount(page, null); await page.evaluate(() => { window.__pdfVaultFixture.writeMode = 'real'; for (const release of window.__pdfVaultFixture.releaseWrites.splice(0)) release(); });
    await page.waitForTimeout(100); assert.equal((await localCopies(page)).length, 0); await assertNoReader(page);
    await switchAccount(page, 'a'); await waitAccount(page, 'a'); assert.equal(await copyRows(page).count(), 0);
  });
  await test('HTML and a forged PDF header never become successful imports', async () => {
    for (const buffer of [Buffer.from('<!DOCTYPE html><html><body>Institution login required</body></html>'), Buffer.from('%PDF-1.7\n<html>Publisher login page</html>\n%%EOF\n')]) {
      const { context } = await trackedContext(); const page = await pageFor(context); await selectDestination(page); await importFile(page, buffer);
      await waitStatus(page, 'error'); assert.equal(await copyRows(page).count(), 0); assert.equal((await localCopies(page)).length, 0); await assertNoReader(page);
    }
  });
  await test('oversized file is rejected before any local writable is opened', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await selectDestination(page);
    await by(page, 'file').evaluate(input => {
      const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'oversized-fixture.pdf', { type: 'application/pdf' })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await by(page, 'import').click(); await waitStatus(page, 'error'); assert.equal(await copyRows(page).count(), 0); assert.equal(await page.evaluate(() => window.__pdfVaultFixture.writesStarted), 0);
  });
  await test('cancelled or denied folder picker never silently selects OPFS', async () => {
    for (const mode of ['cancel', 'deny']) {
      const { context } = await trackedContext(); const page = await pageFor(context); await page.evaluate(mode => { window.__pdfVaultFixture.pickerMode = mode; }, mode);
      await by(page, 'directory').click(); await page.waitForFunction(() => window.__pdfVaultFixture.pickerCalls === 1);
      await page.waitForTimeout(50); assert.equal(await copyRows(page).count(), 0); assert.equal(await page.evaluate(() => window.__pdfVaultFixture.writesStarted), 0);
      assert.equal(await localDestination(page), null, 'picker cancellation does not install another destination');
      await by(page, 'file').setInputFiles({ name: 'fixture-private-document.pdf', mimeType: 'application/pdf', buffer: PDF });
      if (await by(page, 'import').isEnabled()) { await by(page, 'import').click(); await waitStatus(page, 'error'); }
      assert.equal(await copyRows(page).count(), 0);
      await selectDestination(page, 'opfs'); await importFile(page); await waitStatus(page, 'success'); assert.equal(await copyRows(page).count(), 1);
    }
  });
  await test('revoked folder permission blocks old copies until explicit restore', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await importGood(page, { destination: 'directory' });
    await page.evaluate(() => { window.__pdfVaultFixture.permission = 'denied'; });
    await copyRows(page).first().getByTestId('pdf-vault-open').click(); await waitStatus(page, 'error'); await assertNoReader(page);
    assert.match(await by(page, 'status').innerText(), /权限|授权|允许/);
    await copyRows(page).first().getByTestId('pdf-vault-restore-copy').click(); await waitStatus(page, 'error'); await assertNoReader(page);
    await page.evaluate(() => { window.__pdfVaultFixture.permission = 'granted'; });
    await copyRows(page).first().getByTestId('pdf-vault-restore-copy').click(); await waitStatus(page, 'success');
    await openFirst(page); await assertRendered(page);
  });
  await test('write failure never creates an available copy or claims saved', async () => {
    const { context } = await trackedContext(); const page = await pageFor(context); await selectDestination(page); await page.evaluate(() => { window.__pdfVaultFixture.writeMode = 'deny'; });
    await importFile(page); await waitStatus(page, 'error'); assert.equal(await copyRows(page).count(), 0); assert.equal((await localCopies(page)).length, 0); await assertNoReader(page);
  });
  await test('390px local library and PDF reader fit the mobile viewport', async () => {
    const { context } = await trackedContext({ width: 390, folderPicker: false }); const page = await pageFor(context); assert.equal(await by(page, 'directory').isDisabled(), true); assert.equal(await by(page, 'opfs').isEnabled(), true); await importGood(page); await saveVisual(page, 'mobile-library'); await openFirst(page); await assertRendered(page); await saveVisual(page, 'mobile-reader');
    const metrics = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, overflows: [...document.querySelectorAll('body *')].map(element => ({ tag: element.tagName, className: String(element.className || ''), testId: element.dataset?.testid || '', left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })).filter(item => item.left < -1 || item.right > innerWidth + 1).slice(0, 12) }));
    activeCase.layout = metrics;
    assert.ok(metrics.document <= metrics.width + 1 && metrics.body <= metrics.width + 1, 'no page-level horizontal overflow: ' + JSON.stringify(metrics));
    for (const name of ['reader', 'reader-next', 'reader-previous', 'reader-close']) {
      const box = await by(page, name).boundingBox(); assert.ok(box && box.width > 0 && box.height > 0 && box.x >= -1 && box.x + box.width <= 391, name + ' fits viewport');
    }
  });
} catch (error) { fatalError = error; }
finally {
  for (const context of [...contexts]) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  const deliveryFiles = [];
  for (const pathname of [...observedStaticPaths].sort()) {
    try {
      let relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      let file = path.resolve(DIST, relative);
      if (!file.startsWith(DIST + path.sep)) throw new Error('Unsafe delivery resource path');
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const bytes = await fs.readFile(file);
      deliveryFiles.push({ path: path.relative(DIST, file).split(path.sep).join('/'), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    } catch (error) { fatalError ||= new Error('Unable to fingerprint an observed delivery resource: ' + pathname + ': ' + error.message); }
  }
  const summary = { schemaVersion: 1, suite: 'pdf-vault-local-browser', ok: !fatalError, passed: cases.filter(item => item.status === 'passed').length, total: cases.length, completedAt: new Date().toISOString(), browser: 'chromium', realStorage: ['IndexedDB', 'OPFS', 'FileSystemHandle structured clone'], syntheticDirectoryPicker: true, nativeWindowsPermissionPromptTested: false, publisherContentUsed: false, productionMutations: false, deliveryFiles, expectedRequestCancellations: cases.reduce((n, item) => n + item.failedRequests.filter(request => request.expected).length, 0), unexpectedRequestFailures: cases.reduce((n, item) => n + item.failedRequests.filter(request => !request.expected).length, 0), uncaughtErrors: cases.reduce((n, item) => n + item.pageErrors.length, 0), consoleErrors: cases.reduce((n, item) => n + item.consoleErrors.length, 0), unexpectedNetworkRequests: cases.reduce((n, item) => n + item.unexpectedNetwork.length + item.privateNetworkLeaks.length, 0), cases: cases.map(({ name, status, durationMs, error }) => ({ name, status, durationMs, ...(error ? { error } : {}) })), ...(fatalError ? { error: String(fatalError?.stack || fatalError) } : {}) };
  await fs.writeFile(path.join(OUTPUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
}
if (fatalError) throw fatalError;
console.log('PDF_VAULT_LOCAL_BROWSER_OK ' + cases.length);
