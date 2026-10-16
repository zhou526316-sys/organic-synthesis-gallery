#!/usr/bin/env python3
"""No-network tests: correct one missing author field in memory, fail closed."""
from pathlib import Path
import copy
import hashlib
import json
import sys
import tempfile
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'ops/wechat-publisher'))
import reviewed_daily_metadata as m
paper = {'doi':m.DOI,'title':m.TITLE,'journal':'Nature Communications','authors':[], 'addedDate':'2026-10-16'}
original = copy.deepcopy(paper)
frozen = ROOT/'public/rolling-supplement.json'
before = hashlib.sha256(frozen.read_bytes()).hexdigest()
updated = m.complete_authors(ROOT,m.SLOT,paper)
assert paper == original
assert updated['authors'] == m.AUTHORS
assert {k:v for k,v in updated.items() if k!='authors'} == {k:v for k,v in original.items() if k!='authors'}
for p,slot in [(dict(paper,doi='10.1038/another-paper'),m.SLOT),(paper,'2026-10-17T08:00:00+08:00'),(dict(paper,authors=['Existing Author']),m.SLOT)]:
 assert m.complete_authors(ROOT,slot,p) == p
for p in [dict(paper,title='Wrong title'),dict(paper,journal='Nature')]:
 try:m.complete_authors(ROOT,m.SLOT,p)
 except RuntimeError:pass
 else:raise AssertionError('identity mismatch not rejected')
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/m.EVIDENCE;p.parent.mkdir(parents=True);p.write_text('{}')
 try:m.complete_authors(Path(d),m.SLOT,paper)
 except RuntimeError:pass
 else:raise AssertionError('tampered source accepted')
assert hashlib.sha256(frozen.read_bytes()).hexdigest()==before
print(json.dumps({'status':'pass','scope':'one exact DOI/date/title/journal; authors only; memory only','inputPreserved':True,'frozenPublicationPreserved':True,'wrongIdentityAndEvidenceRejected':True,'otherDoisAndDatesUnchanged':True}))
