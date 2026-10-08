import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const MARKER = path.resolve(ROOT, 'audit/publication-release-state.json');
const BOOTSTRAP_ID = 'fixed-slots-cutover-2026-09-22';
const BOOTSTRAP_MARKER_COMMIT = '3c9bcd16ab34a24fcbe0efda5a7e1d5905ca71fa';
const SLOT_GRACE_MINUTES = 60;
const SINGLE_DAILY_SLOT_CUTOVER_COMMIT = '0a88cd948049081479d33040b93ea20a80d83ca9';

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
let markerCommitSha = null;
let legacyMarkerAuthorized = false;
let receiptBackedBaseline = false;
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
  const currentMorningSlot = /^\d{4}-\d{2}-\d{2}T08:00:00\+08:00$/.test(slot);
  const legacyEveningSlot = /^\d{4}-\d{2}-\d{2}T18:00:00\+08:00$/.test(slot);
  check(Boolean(marker?.reviewFile), 'release-slot: reviewFile missing');
  check(Boolean(marker?.handoffGeneratedAt), 'release-slot: handoffGeneratedAt missing');
  check(Number.isInteger(marker?.productionCards) && marker.productionCards >= 0,
    'release-slot: productionCards missing/invalid');

  try {
    let committedAt = '';
    const currentMarkerBlobSha = await blobSha('audit/publication-release-state.json');

    try {
      const delivery = JSON.parse(await readFile(path.resolve(ROOT, 'audit/deployment-delivery-latest.json'), 'utf8'));
      const receiptMatches = delivery?.ok === true
        && Number(delivery?.schemaVersion || 0) >= 2
        && delivery.markerBlobSha === currentMarkerBlobSha
        && delivery.publicationSlot === slot
        && Number(delivery.productionCards) === Number(marker.productionCards)
        && /^[a-f0-9]{40}$/.test(String(delivery.markerCommit || ''));
      if (receiptMatches) {
        markerCommitSha = String(delivery.markerCommit);
        const shown = await execFileAsync('git', ['show', '-s', '--format=%cI', markerCommitSha], { cwd: ROOT });
        committedAt = shown.stdout.trim();
        receiptBackedBaseline = true;
      }
    } catch {
      receiptBackedBaseline = false;
    }

    if (!markerCommitSha) {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '--first-parent', '-1', '--format=%H%n%cI', '--', 'audit/publication-release-state.json'],
        { cwd: ROOT },
      );
      const [commitSha = '', commitTime = ''] = stdout.trim().split(/\r?\n/);
      markerCommitSha = commitSha.trim() || null;
      committedAt = commitTime.trim();
    }

    if (legacyEveningSlot && receiptBackedBaseline && markerCommitSha) {
      try {
        await execFileAsync(
          'git',
          ['merge-base', '--is-ancestor', markerCommitSha, SINGLE_DAILY_SLOT_CUTOVER_COMMIT],
          { cwd: ROOT },
        );
        legacyMarkerAuthorized = true;
      } catch {
        legacyMarkerAuthorized = false;
      }
    }

    check(currentMorningSlot || legacyMarkerAuthorized,
      `release-slot: invalid publicationSlot ${slot || '-'}`);

    const markerCommitAt = new Date(committedAt);
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
  singleDailySlotCutoverCommit: SINGLE_DAILY_SLOT_CUTOVER_COMMIT,
  markerCommitSha,
  receiptBackedBaseline,
  legacyMarkerAuthorized,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
