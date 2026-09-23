// Test-driver-only compatibility fix for the pinned Playwright 1.55.0 package.
// Paired evidence: Actions run 35821659876, exact source 03f0d461.
// Default synthetic body stylesheet toggle: both GIF cases fail. Without that
// toggle: both complete GIF lifecycles pass; the static negative control fails
// animation detection as required. No product/browser/fixture pixels are changed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const packagePath = require.resolve('playwright-core/package.json');
const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const expectedVersion = '1.55.0';
const expectedSourceHash = '9aaff6c173c6a9a1c80e831dd92ccc24097243d49ad600dc87c4bc1fad9c625b';
const originalLine = 'const syncAnimations = this._page.delegate.shouldToggleStyleSheetToSyncAnimations();';
// Keep the stock animation-freezing path intact. When the caller explicitly
// allows animation, do not inject/remove a synthetic stylesheet before capture.
const revisedLine = 'const syncAnimations = disableAnimations && this._page.delegate.shouldToggleStyleSheetToSyncAnimations();';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

if (packageInfo.version !== expectedVersion) throw new Error('Re-review animation capture compatibility for changed Playwright version');
const file = path.join(path.dirname(packagePath), 'lib/server/screenshotter.js');
const installed = fs.readFileSync(file, 'utf8');
const alreadyApplied = installed.includes(revisedLine);
const original = alreadyApplied ? installed.replace(revisedLine, originalLine) : installed;
if (hash(original) !== expectedSourceHash || original.split(originalLine).length !== 2) {
  throw new Error('Unrecognized screenshot driver source; refuse an unreviewed library change');
}
const revised = original.replace(originalLine, revisedLine);
if (alreadyApplied && installed !== revised) throw new Error('Unexpected partial screenshot-driver change');
if (!alreadyApplied) fs.writeFileSync(file, revised);
if (hash(fs.readFileSync(file)) !== hash(revised)) throw new Error('Screenshot driver verification failed after write');

const evidence = {
  checkedAt: new Date().toISOString(),
  version: packageInfo.version,
  sourceHash: expectedSourceHash,
  installedHash: hash(revised),
  alreadyApplied,
  testDriverModified: true,
  browserBinaryModified: false,
  productSourceModified: false,
  acceptanceAssertionsModified: false,
  disabledAnimationPathPreserved: true,
  change: { from: originalLine, to: revisedLine },
  supportingRun: 35821659876,
};
if (process.argv[2]) {
  const destination = path.resolve(process.argv[2]);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify(evidence));
