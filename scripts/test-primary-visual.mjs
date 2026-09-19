import assert from 'node:assert/strict';
import { PRIMARY_VISUAL_RANK, primaryVisualShouldReplace, importPrimaryVisual } from '../cloudflare/worker/src/primary-visual.js';

for (const [oldKind, oldRank] of Object.entries(PRIMARY_VISUAL_RANK)) {
  for (const [kind, rank] of Object.entries(PRIMARY_VISUAL_RANK)) {
    assert.equal(primaryVisualShouldReplace({ kind: oldKind, confidence: 95 }, { kind, confidence: 90 }), rank > oldRank,
      `${oldKind} must not be downgraded to ${kind}`);
  }
  assert.equal(primaryVisualShouldReplace({ kind: oldKind, confidence: 95 }, { kind: oldKind, confidence: 96 }), true);
  assert.equal(primaryVisualShouldReplace({ kind: oldKind, confidence: 95 }, { kind: oldKind, confidence: 95 }), false);
}
assert.equal(primaryVisualShouldReplace(null, { kind: 'toc' }), false, 'ambiguous kind is rejected');
assert.equal(primaryVisualShouldReplace(null, { kind: 'figure1' }), true);
const excluded = await importPrimaryVisual(null, { DB: {}, MEDIA: {} }, { doi: '10.1021/jacs.6c13738', kind: 'official_visual' });
assert.equal(excluded.status, 422);
console.log('PASS: all 25 rank pairs, same-rank confidence, kind validation, excluded DOI');
