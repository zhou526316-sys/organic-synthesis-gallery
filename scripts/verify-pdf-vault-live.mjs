import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGIN = 'https://gallery.gczhouwld.com';
const MAX_FILES = 24;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;
const TIME_BUDGET_MS = 150_000;
const REQUEST_TIMEOUT_MS = 10_000;
const ATTEMPTS = 3;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const message = error => String(error?.message || error).slice(0, 400);
const check = (condition, code) => assert.ok(condition, code);

function safePath(value) {
  check(typeof value === 'string' && value.length <= 256 && /^[A-Za-z0-9_./-]+$/.test(value), 'invalid_static_path');
  check(!value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe_static_path');
  check(value === 'pdf-vault/index.html' || /^assets\/[A-Za-z0-9_.-]+\.(?:js|mjs|css)$/.test(value) || /^pdf-vault-assets\/[0-9.]+\/(?:cmaps|standard_fonts|wasm|iccs)\/[A-Za-z0-9_.-]+$/.test(value), 'non_vault_static_path');
  check(new URL('/' + value, ORIGIN).origin === ORIGIN, 'unexpected_static_origin');
  return value;
}

function validateInputs(browser, manifest) {
  check(browser?.schemaVersion === 1 && browser.suite === 'pdf-vault-local-browser' && browser.ok === true, 'browser_gate_not_successful');
  check(Number.isSafeInteger(browser.total) && browser.total >= 17 && browser.total <= 100 && browser.passed === browser.total, 'browser_case_count_mismatch');
  check(Array.isArray(browser.cases) && browser.cases.length === browser.total && browser.cases.every(item => item.status === 'passed'), 'browser_cases_not_all_passed');
  for (const key of ['uncaughtErrors', 'consoleErrors', 'unexpectedRequestFailures', 'unexpectedNetworkRequests']) check(browser[key] === 0, 'browser_error_count_' + key);
  check([1, 2].includes(manifest?.schemaVersion) && /^[a-f0-9]{40}$/.test(manifest.sourceCommit || ''), 'invalid_expected_delivery_manifest');
  check(Array.isArray(browser.deliveryFiles) && browser.deliveryFiles.length >= 6 && browser.deliveryFiles.length <= MAX_FILES, 'invalid_delivery_file_count');
  const seen = new Set(); let total = 0;
  const files = browser.deliveryFiles.map(file => {
    const name = safePath(file?.path);
    check(!seen.has(name), 'duplicate_static_path'); seen.add(name);
    check(/^[a-f0-9]{64}$/.test(file.sha256 || ''), 'invalid_expected_sha256');
    check(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_FILE_BYTES, 'invalid_expected_byte_count');
    total += file.bytes;
    return { path: name, sha256: file.sha256, bytes: file.bytes };
  });
  check(total <= MAX_TOTAL_BYTES, 'static_byte_budget_exceeded');
  check(seen.has('pdf-vault/index.html'), 'vault_html_not_verified_by_browser');
  check(files.some(file => /^assets\/pdfVault-.+\.js$/.test(file.path)) && files.some(file => /^assets\/pdfVault-.+\.css$/.test(file.path)), 'vault_entry_assets_missing');
  check(files.some(file => /^assets\/reader-.+\.js$/.test(file.path)) && files.some(file => /^assets\/pdf\.worker.+\.mjs$/.test(file.path)), 'reader_assets_missing');
  check(files.some(file => file.path.includes('/standard_fonts/')), 'rendered_standard_font_missing');
  return files;
}

async function readBounded(response, maxBytes) {
  const length = response.headers.get('content-length');
  check(response.body, 'response_body_missing');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    if (length && /^\d+$/.test(length)) check(Number(length) <= maxBytes, 'response_content_length_exceeded');
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      check(bytes <= maxBytes, 'response_byte_limit_exceeded');
      chunks.push(Buffer.from(next.value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, bytes);
}

/** Injectable fetch is for local HTTP tests only. The production URL and GET-only
 * request policy are fixed here and cannot be overridden by CLI or environment. */
export async function verifyPdfVaultLive({ browser, manifest, fetchImpl = fetch, report = {}, deadlineMs = TIME_BUDGET_MS }) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(TIME_BUDGET_MS, deadlineMs);
  Object.assign(report, { schemaVersion: 1, suite: 'pdf-vault-live', ok: false, applicable: true, origin: ORIGIN, startedAt: new Date(startedAt).toISOString(), productionMutations: false, method: 'GET', maxConcurrency: 3, maxAttempts: ATTEMPTS, timeBudgetMs: Math.min(TIME_BUDGET_MS, deadlineMs), files: [] });
  let activeRequests = 0, peakRequests = 0;
  try {
    const files = validateInputs(browser, manifest);
    report.expectedSourceCommit = manifest.sourceCommit;
    report.browserCasesPassed = browser.passed;
    report.expectedFileCount = files.length;
    async function get(relative, maxBytes, verify) {
      let lastError;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const remaining = deadline - Date.now();
        check(remaining > 0, 'verification_deadline_exceeded');
        const signal = AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, remaining)));
        activeRequests++; peakRequests = Math.max(peakRequests, activeRequests);
        try {
          const requestedPath = relative === 'pdf-vault/index.html' ? 'pdf-vault/' : relative;
          const requestUrl = new URL('/' + requestedPath, ORIGIN);
          check(requestUrl.origin === ORIGIN, 'unexpected_request_origin');
          if (relative === 'release-delivery.json' || relative === 'pdf-vault/index.html') requestUrl.searchParams.set('vault_verify', String(Date.now()) + '-' + attempt);
          const response = await fetchImpl(requestUrl.href, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { 'cache-control': 'no-cache' }, signal });
          if (response.status !== 200) { await response.body?.cancel().catch(() => {}); throw new Error('http_status_' + response.status); }
          const bytes = await readBounded(response, maxBytes);
          const result = verify(bytes);
          return { ...result, attempts: attempt };
        } catch (error) { lastError = error; }
        finally { activeRequests--; }
        if (attempt < ATTEMPTS && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(250 * attempt, Math.max(0, deadline - Date.now()))));
      }
      throw new Error(message(lastError));
    }
    const checkManifest = bytes => {
      let live;
      try { live = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('live_delivery_manifest_not_json'); }
      check(live.sourceCommit === manifest.sourceCommit, 'live_source_commit_mismatch');
      check(live.schemaVersion === manifest.schemaVersion, 'live_manifest_schema_mismatch');
      for (const key of ['datasetSha256', 'markerCommit', 'markerBlobSha', 'architectureCatalogId']) {
        if (manifest[key] != null) check(live[key] === manifest[key], 'live_manifest_' + key + '_mismatch');
      }
      return { sourceCommit: live.sourceCommit, bytes: bytes.length, sha256: sha256(bytes) };
    };
    report.before = await get('release-delivery.json', MAX_MANIFEST_BYTES, checkManifest);
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
      for (;;) {
        const item = files[index++]; if (!item) return;
        const result = { path: item.path, requestedPath: item.path === 'pdf-vault/index.html' ? '/pdf-vault/' : '/' + item.path, ok: false, expectedSha256: item.sha256, expectedBytes: item.bytes };
        report.files.push(result);
        try {
          Object.assign(result, await get(item.path, Math.min(MAX_FILE_BYTES, item.bytes + 1), bytes => {
            const actualSha256 = sha256(bytes);
            check(bytes.length === item.bytes, 'static_byte_count_mismatch');
            check(actualSha256 === item.sha256, 'static_sha256_mismatch');
            return { actualSha256, actualBytes: bytes.length };
          }), { ok: true });
        } catch (error) { result.error = message(error); }
      }
    }));
    report.files.sort((a, b) => a.path.localeCompare(b.path));
    check(report.files.length === files.length && report.files.every(item => item.ok), 'one_or_more_static_files_failed');
    // Check again so a deployment change during the parallel reads cannot pass.
    report.after = await get('release-delivery.json', MAX_MANIFEST_BYTES, checkManifest);
    check(report.before.sha256 === report.after.sha256, 'live_release_changed_during_verification');
    report.ok = true;
  } catch (error) { report.error = message(error); }
  finally { report.completedAt = new Date().toISOString(); report.durationMs = Date.now() - startedAt; report.peakConcurrency = peakRequests; }
  return report;
}

async function readJson(file, maxBytes) {
  check(typeof file === 'string' && file, 'input_file_missing');
  const stat = await fs.stat(file); check(stat.isFile() && stat.size > 0 && stat.size <= maxBytes, 'input_file_size_invalid');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function main() {
  const [browserFile, manifestFile, outputFile = process.env.PDF_VAULT_LIVE_OUTPUT || 'test-results/pdf-vault-live/summary.json'] = process.argv.slice(2);
  const report = { schemaVersion: 1, suite: 'pdf-vault-live', ok: false, applicable: null, productionMutations: false, pagesRunId: null };
  try {
    const runId = String(process.env.PDF_VAULT_PAGES_RUN_ID || '');
    check(/^\d{1,20}$/.test(runId) && Number.isSafeInteger(Number(runId)), 'invalid_pages_run_id'); report.pagesRunId = Number(runId);
    const [browser, manifest] = await Promise.all([readJson(browserFile, MAX_MANIFEST_BYTES), readJson(manifestFile, MAX_MANIFEST_BYTES)]);
    await verifyPdfVaultLive({ browser, manifest, report });
  } catch (error) { report.error = message(error); report.completedAt = new Date().toISOString(); }
  finally { await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true }); await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify({ ok: report.ok, pagesRunId: report.pagesRunId, sourceCommit: report.expectedSourceCommit || null, verifiedFiles: report.files?.filter(item => item.ok).length || 0, error: report.error || null }));
  if (!report.ok) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
