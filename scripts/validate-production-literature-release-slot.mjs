import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const MARKER = path.resolve(ROOT, 'audit/publication-release-state.json');
const BOOTSTRAP_ID = 'fixed-slots-cutover-2026-09-22';
const BOOTSTRAP_MARKER_COMMIT = '3c9bcd16ab34a24fcbe0efda5a7e1d5905ca71fa';
const SLOT_GRACE_MINUTES = 20;

const marker = JSON.parse(await readFile(MARKER, 'utf8'));
if (marker.mode === 'scope-correction') {
  const { authorizeScopeCorrection } = await import('./lib/immediate-scope-correction.mjs');
  const correction = await authorizeScopeCorrection(ROOT);
  console.log(JSON.stringify(correction, null, 2));
  process.exit(correction.ok ? 0 : 1);
}
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

async function blobSha(file) {
  const { stdout } = await execFileAsync('git', ['hash-object', file], { cwd: ROOT });
  return stdout.trim();
}

const protectedBlobs = marker?.protectedBlobs && typeof marker.protectedBlobs === 'object'
  ? marker.protectedBlobs
  : {};
const files = Object.keys(protectedBlobs);
check(files.length >= 8, 'release-slot: protected production literature file set is unexpectedly small');

const actual = {};
for (const file of files) {
  try {
    actual[file] = await blobSha(file);
    check(actual[file] === protectedBlobs[file],
      `release-slot: unauthorized production literature content for ${file}; expected ${protectedBlobs[file]}, got ${actual[file]}`);
  } catch (error) {
    failures.push(`release-slot: cannot hash ${file}: ${error.message}`);
  }
}

const mode = String(marker?.mode || '');
if (mode === 'bootstrap') {
  check(marker?.bootstrapId === BOOTSTRAP_ID,
    'release-slot: invalid bootstrap marker');
  check(marker?.productionCards === 512,
    'release-slot: bootstrap production card count must remain the cutover baseline of 512');
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%H', '--', 'audit/publication-release-state.json'],
      { cwd: ROOT },
    );
    check(stdout.trim() === BOOTSTRAP_MARKER_COMMIT,
      `release-slot: bootstrap marker was modified after cutover; expected marker commit ${BOOTSTRAP_MARKER_COMMIT}, got ${stdout.trim() || '-'}`);
  } catch (error) {
    failures.push(`release-slot: cannot verify immutable bootstrap marker: ${error.message}`);
  }
} else if (mode === 'slot-release') {
  const slot = String(marker?.publicationSlot || '');
  check(/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(slot),
    `release-slot: invalid publicationSlot ${slot || '-'}`);
  check(Boolean(marker?.reviewFile), 'release-slot: reviewFile missing');
  check(Boolean(marker?.handoffGeneratedAt), 'release-slot: handoffGeneratedAt missing');
  check(Number.isInteger(marker?.productionCards) && marker.productionCards >= 0,
    'release-slot: productionCards missing/invalid');

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%cI', '--', 'audit/publication-release-state.json'],
      { cwd: ROOT },
    );
    const markerCommitAt = new Date(stdout.trim());
    const slotAt = new Date(slot);
    const deltaMinutes = (markerCommitAt.getTime() - slotAt.getTime()) / 60000;
    check(Number.isFinite(deltaMinutes), 'release-slot: cannot compute marker commit time');
    check(deltaMinutes >= 0,
      `release-slot: publication marker was committed before the fixed slot (${deltaMinutes.toFixed(2)} min)`);
    check(deltaMinutes <= SLOT_GRACE_MINUTES,
      `release-slot: publication marker was committed too late for the fixed slot (${deltaMinutes.toFixed(2)} min > ${SLOT_GRACE_MINUTES})`);
  } catch (error) {
    failures.push(`release-slot: cannot read publication marker commit time: ${error.message}`);
  }
} else {
  failures.push(`release-slot: unsupported marker mode ${mode || '-'}`);
}

const result = {
  ok: failures.length === 0,
  mode,
  publicationSlot: marker?.publicationSlot || null,
  productionCards: marker?.productionCards ?? null,
  protectedFiles: files.length,
  slotGraceMinutes: SLOT_GRACE_MINUTES,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
