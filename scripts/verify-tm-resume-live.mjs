import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INSTALLER_URL = 'https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js';
const ENDPOINTS = [
  ['canonical', INSTALLER_URL],
  ['worker', 'https://organic-synthesis-gallery.zhou526316.workers.dev/gallery-vpn-bridge.user.js'],
];
const EXPECTED = Object.freeze({
  bridgeVersion: '2.2.61',
  installRevision: '6.2.42',
  captureProtocol: '6.2.20',
  controllerRevision: '2.2.41',
  manualRecoveryRevision: '20261007-manual-resume-v1',
});
const MAX_BYTES = 4_000_000;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function value(source, name) {
  return source.match(new RegExp('\\b(?:var|let|const)\\s+' + name + '\\s*=\\s*[\'\"]([^\'\"]+)[\'\"]'))?.[1] || '';
}

async function probe(key, url, suffix, expectedSha256, fetchImpl) {
  const result = { key, url, passed: false };
  try {
    const response = await fetchImpl(url + suffix, {
      method: 'GET',
      redirect: 'error',
      headers: { 'cache-control': 'no-cache', origin: 'https://gallery.gczhouwld.com' },
      signal: AbortSignal.timeout(15_000),
    });
    result.status = response.status;
    result.contentType = response.headers.get('content-type') || '';
    assert.equal(response.status, 200, 'installer_http_' + response.status);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    assert.ok(!declaredLength || declaredLength <= MAX_BYTES, 'installer_too_large');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      assert.ok(bytes <= MAX_BYTES, 'installer_too_large');
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    result.bytes = raw.length;
    result.sha256 = digest(raw);
    // build-bridge-loader.mjs embeds plain runtimeBody + tocBody, not base64.
    // Inspect downloaded JavaScript only; do not eval or execute an installer.
    const header = source.match(/^\s*\/\/ ==UserScript==\s*\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m)?.[1];
    assert.ok(header, 'userscript_header_missing');
    result.bridgeVersion = header.match(/^\/\/ @version\s+(\S+)\s*$/m)?.[1] || '';
    result.updateUrl = header.match(/^\/\/ @updateURL\s+(\S+)\s*$/m)?.[1] || '';
    result.downloadUrl = header.match(/^\/\/ @downloadURL\s+(\S+)\s*$/m)?.[1] || '';
    result.installRevision = value(source, 'INSTALL_REVISION');
    result.captureProtocol = source.match(/\bvar\s+VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
    result.controllerRevision = value(source, 'CONTROLLER_REVISION');
    result.manualRecoveryRevision = value(source, 'MANUAL_RECOVERY_REVISION');
    for (const [field, expected] of Object.entries(EXPECTED)) {
      assert.equal(result[field], expected, 'unexpected_' + field);
    }
    assert.equal(result.updateUrl, INSTALLER_URL, 'noncanonical_update_url');
    assert.equal(result.downloadUrl, INSTALLER_URL, 'noncanonical_download_url');
    result.matchesExpectedSha256 = expectedSha256 ? result.sha256 === expectedSha256 : null;
    if (expectedSha256) assert.equal(result.matchesExpectedSha256, true, 'tested_installer_sha256_mismatch');
    result.passed = true;
  } catch (error) {
    result.error = String(error?.message || error).slice(0, 240);
  }
  return result;
}

export async function verifyLiveInstallers({
  expectedSha256 = process.env.TM_EXPECTED_INSTALLER_SHA256 || '',
  fetchImpl = globalThis.fetch,
} = {}) {
  const report = {
    checkedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null,
    readOnly: true,
    productionWrites: 0,
    publisherRequests: 0,
    expected: EXPECTED,
    expectedInstallerSha256: expectedSha256.trim().toLowerCase() || null,
    passed: false,
    probes: [],
  };
  if (report.expectedInstallerSha256 && !/^[a-f0-9]{64}$/.test(report.expectedInstallerSha256)) {
    report.error = 'invalid_expected_installer_sha256';
    return report;
  }
  const suffix = '?tmResumeLive=' + Date.now();
  report.probes = await Promise.all(ENDPOINTS.map(([key, url]) =>
    probe(key, url, suffix, report.expectedInstallerSha256, fetchImpl)));
  report.sameInstallerBytes = report.probes.every(item => item.sha256) &&
    report.probes[0].sha256 === report.probes[1].sha256;
  report.passed = report.sameInstallerBytes && report.probes.every(item => item.passed);
  if (!report.passed) report.error = report.sameInstallerBytes ? 'installer_contract_failed' : 'installer_bytes_mismatch_or_unreadable';
  report.verifiedAt = new Date().toISOString();
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await verifyLiveInstallers();
  const output = path.join(process.env.RUNNER_TEMP || process.cwd(), 'tm-resume-live.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('TM_RESUME_LIVE ' + JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
