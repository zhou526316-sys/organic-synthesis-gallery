import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INSTALLER_URL = 'https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js';
const ENDPOINTS = [
  ['api', 'https://api.gczhouwld.com/gallery-vpn-bridge.user.js'],
  ['gallery', 'https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js'],
  ['worker', 'https://organic-synthesis-gallery.zhou526316.workers.dev/gallery-vpn-bridge.user.js'],
];
const EXPECTED = Object.freeze({
  bridgeVersion: '2.2.63',
  installRevision: '6.2.44',
  pdfUploadRevision: '20261007-pdf-upload-budget-v1',
  captureProtocol: '6.2.20',
  controllerRevision: '2.2.41',
  manualRecoveryRevision: '20261007-manual-resume-v1',
  controllerReadRevision: '20261007-native-metadata-first-v1',
});
const EXPECTED_INSTALLER_SHA256 = '201203a5715d19c80fd90c1ac091b8f27a4455f27bffaaa1bec69c054246ff2b';
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
      headers: { 'cache-control': 'no-cache' },
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
    result.pdfUploadRevision = value(source, 'PRIVATE_PDF_UPLOAD_REVISION');
    result.installRevision = value(source, 'INSTALL_REVISION');
    result.captureProtocol = source.match(/\bvar\s+VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
    result.controllerRevision = value(source, 'CONTROLLER_REVISION');
    result.manualRecoveryRevision = value(source, 'MANUAL_RECOVERY_REVISION');
    result.controllerReadRevision = value(source, 'CONTROLLER_READ_REVISION');
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
  expectedSha256 = EXPECTED_INSTALLER_SHA256,
  fetchImpl = globalThis.fetch,
} = {}) {
  const report = {
    checkedAt: new Date().toISOString(),
    verificationSha: process.env.GITHUB_SHA || null,
    releaseSha: '703526ae312b07b2a65fbe16872b46fe64875e19',
    testedMainlineSha256: '9942eabc68c2c779ee971f226ffde6eca88927c0ec71def718dec5f613154a58',
    deliveryTarget: 'exact_api_and_worker_urls',
    additionalGalleryCheck: true,
    readOnly: true,
    productionWrites: 0,
    publisherRequests: 0,
    expected: EXPECTED,
    expectedInstallerSha256: expectedSha256.trim().toLowerCase() || null,
    passed: false,
    probes: [],
  };
  if (!report.expectedInstallerSha256 || !/^[a-f0-9]{64}$/.test(report.expectedInstallerSha256)) {
    report.error = 'invalid_expected_installer_sha256';
    return report;
  }
  const suffix = ''; // Verify exactly the link given to the user, without Origin or query.
  report.probes = await Promise.all(ENDPOINTS.map(([key, url]) =>
    probe(key, url, suffix, report.expectedInstallerSha256, fetchImpl)));
  report.sameInstallerBytes = report.probes.every(item => item.sha256) &&
    report.probes.every(item => item.sha256 === report.probes[0].sha256);
  const required = report.probes.filter(item => item.key !== 'gallery');
  report.sameRequiredInstallerBytes = required.every(item => item.sha256 === expectedSha256);
  report.canonicalGalleryVerified = report.probes.find(item => item.key === 'gallery')?.passed === true;
  report.passed = report.sameRequiredInstallerBytes && required.every(item => item.passed);
  if (!report.passed) report.error = report.sameInstallerBytes ? 'installer_contract_failed' : 'installer_bytes_mismatch_or_unreadable';
  report.verifiedAt = new Date().toISOString();
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await verifyLiveInstallers();
  const output = path.join(process.env.RUNNER_TEMP || process.cwd(), 'tm-pdf-live.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('TM_PDF_LIVE ' + JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
