/**
 * One-shot, read-only live verification of an owner-private article PDF.
 * Runner never prints document bytes, document key, hash, signed URL,
 * identity or Cloudflare CLI stdout/stderr. No user session is fabricated.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const doi = '10.1021/acs.orglett.6c03725';
const bucket = 'organic-synthesis-gallery-private-pdf';
const db = 'organic-synthesis-gallery';
const workerCwd = path.resolve('cloudflare/worker');
const wrangler = path.join(workerCwd, 'node_modules', '.bin', 'wrangler');
const origin = 'https://gallery.gczhouwld.com';
const urls = [
  'https://api.gczhouwld.com',
  'https://organic-synthesis-gallery.zhou526316.workers.dev',
];
const report = {
  schemaVersion: 1,
  type: 'private-pdf-owner-readonly-verification',
  doi,
  checkedAt: new Date().toISOString(),
  vantagePoint: 'github-actions-runner-not-user-China-network',
  independentOwnerSessionAvailable: false,
  file: { investigated: false },
  network: [],
};

const clock = () => performance.now();
const elapsed = t => Math.round(performance.now() - t);
const cli = (args, timeout = 55000) => {
  const started = clock();
  const child = spawnSync(wrangler, args, {
    cwd: workerCwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  return { child, elapsedMs: elapsed(started) };
};
const safeFailure = child => child.error?.code === 'ETIMEDOUT' ? 'timeout' :
  child.status !== 0 ? 'command_failed' : 'unknown';
const safeKey = key => typeof key === 'string' && key.length > 0 && key.length <= 1024 &&
  !/^[\/\\]/.test(key) && !/[\u0000-\u001f\u007f]/.test(key) &&
  !/(^|\/)\.\.(\/|$)/.test(key) && !/^https?:\/\//i.test(key);
const limit = (value, maximum) => Math.max(0, Math.min(maximum, Number(value) || 0));

async function requestProbe(name, url, init = {}) {
  const began = clock();
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(11000),
      ...init,
    });
    await response.body?.cancel().catch(() => {});
    return {
      name,
      http: response.status,
      elapsedMs: elapsed(began),
      corsOriginCorrect: response.headers.get('access-control-allow-origin') === origin,
      corsAllowsAuthorization: !!response.headers.get('access-control-allow-headers')
        ?.toLowerCase().split(',').some(h => h.trim() === 'authorization'),
    };
  } catch (error) {
    return { name, http: null, elapsedMs: elapsed(began),
      failure: error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'timeout' : 'network_error' };
  }
}

for (const base of urls) {
  const label = base === urls[0] ? 'canonical' : 'alternate';
  report.network.push(await requestProbe(label + '_public_health',
    base + '/api/_healthcheck'));
  report.network.push(await requestProbe(label + '_cors_options',
    base + '/api/user-ui/private-pdf/open?doi=10.0000/diagnostic&mode=view', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization' },
    }));
  report.network.push(await requestProbe(label + '_invalid_session_post',
    base + '/api/user-ui/private-pdf/open?doi=10.0000/diagnostic&mode=view', {
      method: 'POST',
      headers: { origin, authorization: 'Bearer gallery-invalid-diagnostic-session' },
    }));
}

const safeDoi = doi.replace(/'/g, "''");
const sql = [
  'SELECT id, active, processing_state, byte_length, content_hash, r2_key, version_kind',
  'FROM private_pdf_documents',
  "WHERE doi='" + safeDoi + "' AND active=1 AND processing_state='ready'",
  "ORDER BY CASE version_kind WHEN 'version_of_record' THEN 4 WHEN 'accepted_manuscript'",
  "THEN 3 WHEN 'preprint' THEN 2 ELSE 1 END DESC, captured_at DESC LIMIT 1;",
].join(' ');
const query = cli(['d1', 'execute', db, '--remote', '--command', sql, '--json']);
report.file.d1ElapsedMs = query.elapsedMs;
let row = null;
if (query.child.status !== 0) {
  report.file.d1 = safeFailure(query.child);
} else {
  try {
    const response = JSON.parse(query.child.stdout);
    const groups = Array.isArray(response) ? response : [response];
    const rows = groups.flatMap(group => Array.isArray(group.results) ? group.results : []);
    row = rows[0] || null;
    report.file.d1 = 'ok';
  } catch {
    report.file.d1 = 'invalid_response';
  }
}
report.file.investigated = true;
report.file.selectedReadyRecord = !!row;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-pdf-readonly-'));
try {
  if (row) {
    report.file.recordDeclaredBytes = limit(row.byte_length, 60 * 1024 * 1024);
    report.file.versionKind = ['version_of_record','accepted_manuscript','preprint']
      .includes(row.version_kind) ? row.version_kind : 'other';
    if (!safeKey(row.r2_key)) {
      report.file.storageCheck = 'unsafe_key_metadata';
    } else if (Number(row.byte_length) > 60 * 1024 * 1024) {
      report.file.storageCheck = 'size_exceeds_reader_limit';
    } else {
      const filename = path.join(temp, 'check.pdf');
      const fetched = cli(['r2', 'object', 'get', bucket + '/' + row.r2_key,
        '--file', filename, '--remote'], 90000);
      report.file.r2ElapsedMs = fetched.elapsedMs;
      if (fetched.child.status !== 0) {
        report.file.storageCheck = safeFailure(fetched.child);
      } else if (!fs.existsSync(filename)) {
        report.file.storageCheck = 'object_not_returned';
      } else {
        const contents = new Uint8Array(fs.readFileSync(filename));
        report.file.storageCheck = 'downloaded';
        report.file.actualBytes = contents.length;
        report.file.sizeMatch = contents.length === Number(row.byte_length);
        report.file.headerIsPdf = new TextDecoder('latin1').decode(contents.subarray(0,5)) === '%PDF-';
        report.file.eofMarker = new TextDecoder('latin1')
          .decode(contents.subarray(Math.max(0,contents.length-4096))).includes('%%EOF');
        const digest = createHash('sha256').update(contents).digest('hex');
        report.file.sha256MatchesRecord = digest === String(row.content_hash || '').toLowerCase();
        let task = null;
        try {
          const t = clock();
          task = getDocument({
            data: contents,
            disableAutoFetch: true, disableRange: true, disableStream: true,
            isEvalSupported: false, useSystemFonts: true, stopAtErrors: true,
            verbosity: 0,
          });
          const doc = await task.promise;
          report.file.pdfJsParsed = true;
          report.file.pageCount = doc.numPages;
          const first = await doc.getPage(1);
          const text = await first.getTextContent({ disableNormalization: false });
          report.file.firstPageTextAvailable = Array.isArray(text?.items);
          report.file.firstPageParseMs = elapsed(t);
        } catch {
          report.file.pdfJsParsed = false;
          report.file.pdfParseFailure = 'failed_to_parse_or_read_page';
        } finally {
          try { await task?.destroy(); } catch { /* do not leak PDF.js messages */ }
        }
      }
    }
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
// This report contains only verified, bounded metrics and no private files.
console.log('PRIVATE_PDF_READONLY_RESULT ' + JSON.stringify(report));
