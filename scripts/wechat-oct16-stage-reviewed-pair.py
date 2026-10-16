#!/usr/bin/env python3
"""Import only the owner's reviewed October-16 two-article assets; no API write."""
import collections,hashlib,importlib.util,io,json,os,pathlib,struct,urllib.request,zipfile
R=pathlib.Path.cwd(); EXPECTED='fbf33d3d7e52802c548cb52d29d130b04aed6d0277502a4b04cc991f29a6d921'
req=urllib.request.Request(os.environ['REVIEWED_ARCHIVE_URL'],headers={'User-Agent':'Mozilla/5.0','Accept':'application/zip'})
with urllib.request.urlopen(req,timeout=60) as r: data=r.read(12000000)
assert hashlib.sha256(data).hexdigest()==EXPECTED,'Exact reviewed archive SHA mismatch'
z=zipfile.ZipFile(io.BytesIO(data));assert z.testzip() is None
manifest=json.loads(z.read('transfer-manifest.json'))
assert manifest['date']=='2026-10-16' and manifest['bodyImages']==41 and manifest['covers']==2
allowed_single={'public/wechat-featured/2026-10-16.json','public/wechat-editions/2026-10-16.json','public/wechat-retrospective/levin-isoxazole-to-pyrrole-20261016.json','audit/wechat-working/2026-10-16-review-gate.json'}
allowed_prefix=('public/wechat-assets/reviewed/2026-10-16-r1/','audit/wechat-working/2026-10-16-r1/')
assert len(manifest['files'])==54
assert set(z.namelist())=={x['path'] for x in manifest['files']}|{'transfer-manifest.json'}
for row in manifest['files']:
 p=pathlib.PurePosixPath(row['path'])
 assert not p.is_absolute() and '..' not in p.parts
 assert str(p) in allowed_single or str(p).startswith(allowed_prefix),str(p)
 b=z.read(str(p));assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256'],str(p)
 if str(p).endswith('.png'):
  assert b[:8]==bytes.fromhex('89504e470d0a1a0a')
  w,h=struct.unpack('>II',b[16:24]);assert w>50 and h>50
 target=R/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
sp=importlib.util.spec_from_file_location('wx',R/'ops/wechat-publisher/create-draft.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
f=R/'public/wechat-featured/2026-10-16.json';n=R/'public/wechat-retrospective/levin-isoxazole-to-pyrrole-20261016.json';e=R/'public/wechat-editions/2026-10-16.json';gp=R/'audit/wechat-working/2026-10-16-review-gate.json'
g=m.require_editorial_review_gate(gp,[f,n,e]);assert len(g['assets'])==43
slot,papers=m.load_latest_release();expected={'Science':1,'Nature Communications':3,'JACS':6,'Angew':6,'ACS Catalysis':2,'JOC':7,'Organic Letters':10}
counts=dict(collections.Counter(p['journal'] for p in papers))
assert slot=='2026-10-16T08:00:00+08:00' and len(papers)==35 and counts==expected,(slot,len(papers),counts)
assert any(p['doi']=='10.1021/jacs.6c17168' for p in papers)
a,b=json.loads(f.read_text()),json.loads(n.read_text())
assert [sum(x.get('body') is not False for x in k['figures']) for k in [a,b]]==[21,20]
assert '日报' not in b['title'] and 'Levin' in b['title']
assert g['publicSendAuthorized'] is False
for k in [a,b]:
 for fig in k['figures']:assert hashlib.sha256((R/fig['repo_path']).read_bytes()).hexdigest()==fig['sha256']
print(json.dumps({'sourceFileCount':54,'scienceImages':41,'covers':2,'reviewGate':'pass','actualOct16Papers':len(papers),'journals':counts,'draftWritePerformed':False,'publicSend':False},ensure_ascii=False))
