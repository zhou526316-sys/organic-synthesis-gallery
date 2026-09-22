"""Final invariant checks for the assembled release source; original assembly is retained in parent history."""
from pathlib import Path
p=Path('public/toc-mainline.user.js');core=p.read_text()
assert "var VERSION = '6.2.20';" in core
assert 'toc_capture_receipt_invalid' in core and 'buildRecoveryJobs' in core
assert 'indexed_live_api' in core and 'bindPublisherCaptureJob' in core
old="await uploadReport(job,trace,status==='partial'?'success':status,reason,tocCandidate,token);"
if old in core:
 assert core.count(old)==1
 core=core.replace(old,'await uploadReport(job,trace,status,reason,tocCandidate,token);',1)
 p.write_text(core)
assert "status==='partial'?'success':status" not in core
assert 'staged_index_receipt_mismatch' in Path('cloudflare/worker/src/local-captures.js').read_text()
assert "url.pathname === '/api/media/capture-capabilities'" in Path('cloudflare/worker/src/index.js').read_text()
p=Path('src/platform-api.ts');s=p.read_text()
assert '// tm620-live-figure-union' in s
old="function mediaItemHasFigures(item: StaticMediaItem | undefined): boolean {\n  return Boolean(item?.figures?.available && item.figures.figures?.length);\n}\n\n"
if old in s:
 assert s.count(old)==1
 s=s.replace(old,'',1)
 p.write_text(s)
assert 'mediaItemHasFigures' not in s
print('TM620_FINAL_SOURCE_INVARIANTS_AND_TRUTHFUL_PARTIAL_STATUS')
