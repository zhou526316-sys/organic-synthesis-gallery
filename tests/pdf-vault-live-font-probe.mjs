import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidBundledStandardFont, safePath, validateInputs } from '../scripts/verify-pdf-vault-live.mjs';

test('TrueType hosted standard-font bytes are accepted',()=>{
  const data=Buffer.alloc(4096);
  data.set([0,1,0,0],0);
  assert.equal(isValidBundledStandardFont(data),true);
});
test('OpenType hosted standard-font bytes are accepted',()=>{
  const data=Buffer.alloc(4096);
  data.write('OTTO',0,'ascii');
  assert.equal(isValidBundledStandardFont(data),true);
});
test('HTML, a tiny fake file, or missing data cannot masquerade as a hosted font',()=>{
  const html=Buffer.from('<html>login</html>'+'.'.repeat(3000));
  const tooShort=Buffer.from([0,1,0,0]);
  assert.equal(isValidBundledStandardFont(html),false);
  assert.equal(isValidBundledStandardFont(tooShort),false);
  assert.equal(isValidBundledStandardFont(null),false);
  assert.equal(isValidBundledStandardFont(new Uint8Array(512*1024+1)),false);
});

const fakeEntry = path => ({ path, sha256: 'a'.repeat(64), bytes: 100 });
function syntheticDelivery({ native = true, hasNativeHtml = native, hasNativeJs = native, hasNativeCss = native } = {}) {
  const files = [
    'pdf-vault/index.html', 'assets/pdfVault-mock.js', 'assets/pdfVault-mock.css',
    'assets/reader-mock.js', 'assets/pdf.worker-mock.mjs', 'assets/queue-client-mock.js',
  ];
  if (hasNativeHtml) files.push('pdf-vault/open/index.html');
  if (hasNativeJs) files.push('assets/pdfVaultNative-mock.js');
  if (hasNativeCss) files.push('assets/pdfVaultNative-mock.css');
  const cases = Array.from({length: 17}, (_, i) => ({ name: 'legacy PDF case ' + i, status: 'passed' }));
  if (native) cases[0].name = 'direct DOI PDF tab opens a saved local copy in the browser native viewer';
  const browser = {
    schemaVersion: 1, suite: 'pdf-vault-local-browser', ok: true,
    passed: 17, total: 17, cases,
    uncaughtErrors: 0, consoleErrors: 0,
    unexpectedRequestFailures: 0, unexpectedNetworkRequests: 0,
    deliveryFiles: files.map(fakeEntry),
  };
  return { browser, manifest: { schemaVersion: 1, sourceCommit: 'a'.repeat(40) } };
}
test('native DOI PDF HTML is a bounded allowed delivery path, arbitrary nested paths are rejected', () => {
  assert.equal(safePath('pdf-vault/open/index.html'), 'pdf-vault/open/index.html');
  for (const path of ['pdf-vault/open/private.pdf','pdf-vault/other/index.html','../../private/notes.pdf','pdf-vault/../index.html','https://evil.invalid/a']) {
    assert.throws(() => safePath(path));
  }
});
test('native browser PDF suite requires both native-entry assets and its HTML', () => {
  const { browser, manifest } = syntheticDelivery();
  const validated = validateInputs(browser, manifest);
  assert.ok(validated.some(item => item.path === 'pdf-vault/open/index.html'));
  for (const missing of [
    { hasNativeHtml: false },
    { hasNativeJs: false },
    { hasNativeCss: false },
  ]) {
    const values = syntheticDelivery(missing);
    assert.throws(() => validateInputs(values.browser, values.manifest));
  }
});
test('pre-native PDF deliveries remain testable without inventing a native reader', () => {
  const { browser, manifest } = syntheticDelivery({ native: false });
  assert.equal(validateInputs(browser, manifest).length, 6);
});
