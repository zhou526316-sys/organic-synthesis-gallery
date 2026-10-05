import test from 'node:test';
import assert from 'node:assert/strict';
import { architectureReleaseBasis, ARCHITECTURE_RECEIPT_FILES } from '../release-basis.mjs';

test('slot releases use the generic verified deployment receipt', () => {
  const basis = architectureReleaseBasis({
    mode: 'slot-release',
    publicationSlot: '2026-10-05T08:00:00+08:00',
  });
  assert.deepEqual(basis, {
    mode: 'slot-release',
    publicationSlot: '2026-10-05T08:00:00+08:00',
    receiptFile: ARCHITECTURE_RECEIPT_FILES.generic,
  });
});

test('scope corrections use their own verified delivery receipt and fixed slot identity', () => {
  const basis = architectureReleaseBasis({
    mode: 'scope-correction',
    releasePolicy: 'deletion-only',
    lastFixedPublicationSlot: '2026-10-05T08:00:00+08:00',
  });
  assert.deepEqual(basis, {
    mode: 'scope-correction',
    publicationSlot: '2026-10-05T08:00:00+08:00',
    receiptFile: ARCHITECTURE_RECEIPT_FILES.scopeCorrection,
  });
});

test('scope correction without deletion-only authority fails closed', () => {
  assert.throws(() => architectureReleaseBasis({
    mode: 'scope-correction',
    releasePolicy: 'per-doi',
    lastFixedPublicationSlot: '2026-10-05T08:00:00+08:00',
  }), /invalid_scope_correction_policy/);
});
