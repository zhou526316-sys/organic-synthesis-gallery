"""Deterministic source patch only; no network or production data operations."""
from pathlib import Path

def replace_once(text, old, new):
    if new in text: return text
    assert text.count(old) == 1, 'Unexpected source shape: ' + old[:100]
    return text.replace(old, new, 1)

p = Path('cloudflare/worker/src/stage-storage.js'); s = p.read_text()
s = replace_once(s, '// Storage only:', "import {buildBodyReviewMarker} from '../../../shared/body-media-evidence.js';\n\n// Storage only:")
s = replace_once(s,
    "if (raw.length < 100 || raw.length > 4000000 || (expectedSize && raw.length !== expectedSize) || !(await digest(raw)).startsWith(hashPrefix)) throw integrityError('object_integrity_mismatch');\n    return true;",
    "const actualDigest = await digest(raw);\n    if (raw.length < 100 || raw.length > 4000000 || (expectedSize && raw.length !== expectedSize) || !actualDigest.startsWith(hashPrefix)) throw integrityError('object_integrity_mismatch');\n    return actualDigest;")
s = replace_once(s, 'updatedAt: record.updatedAt, stageStorageRevision: STAGE_STORAGE_REVISION,',
    'updatedAt: record.updatedAt, stageStorageRevision: STAGE_STORAGE_REVISION,\n    sha256: record.sha256, reviewMarker: record.reviewMarker,')
s = replace_once(s, 'return exists ? receipt(previous, {reusedExistingObject: same, retainedHigherResolution: !same}) : null;',
    'return exists ? receipt({...previous, sha256: exists, reviewMarker: await buildBodyReviewMarker(previous, exists)}, {reusedExistingObject: same, retainedHigherResolution: !same}) : null;')
s = replace_once(s, 'const record = {...entry, updatedAt: now(), stageStorageRevision: STAGE_STORAGE_REVISION};',
    'const record = {...entry, sha256: fullHash, reviewMarker: await buildBodyReviewMarker(entry, fullHash), updatedAt: now(), stageStorageRevision: STAGE_STORAGE_REVISION};')
p.write_text(s)
p = Path('cloudflare/worker/src/index.js'); s = p.read_text()
s = replace_once(s, 'publishedAutomatically:false,stageStorageRevision:STAGE_STORAGE_REVISION}',
    "publishedAutomatically:false,stageStorageRevision:STAGE_STORAGE_REVISION,bodyReviewMarkerRevision:'1'}")
p.write_text(s)
p = Path('cloudflare/scripts/merge-curated-pages.mjs'); s = p.read_text()
if 'await mergeApprovedBodyBatches();' not in s:
    assert 'await mergeReviewedBody();' in s
    s += "\n// Data-only, individually approved body batches; capture markers alone cannot publish.\nconst {mergeApprovedBodyBatches}=await import('./merge-approved-body-batches.mjs');\nawait mergeApprovedBodyBatches();\n"
    p.write_text(s)
print('BODY_REVIEW_MARKERS_PATCHED; productionWrites=0; userscriptChanges=0')
