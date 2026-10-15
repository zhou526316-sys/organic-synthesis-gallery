#!/usr/bin/env python3
"""No-network regression tests. No real credential or WeChat API is used."""
import argparse, copy, hashlib, importlib.util, io, json, tempfile
from contextlib import redirect_stdout
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('recreation',ROOT/'ops/wechat-publisher/recreate_reviewed_draft.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
D='2026-10-15';R=D+'-r2-peer-reviewed';OLD='previous-owner-media';NEW='new-test-media'
DOIS=['10.1038/s41586-026-11242-8','10.1126/science.aec6298']
URLS=['https://gallery.gczhouwld.com/?doi='+x+'&summary=0' for x in DOIS]
ARTS=[{'title':'Nature' if i==0 else 'Science','author':'化之岛','digest':'original digest','content':'<p>reviewed paragraph '+str(i)+'</p><img src="original-'+str(i)+'">','content_source_url':u,'thumb_media_id':'cover-'+str(i)} for i,u in enumerate(URLS)]
REQ={'requestId':'reviewed-oct15-new-draft-test','action':mod.ACTION,'publicationDate':D,'editorialRevision':R,'explicitNewDraftAuthorized':True,'draftOnly':True,'publicSendAuthorized':False,'requireDraftGetReadback':True,'previousMediaId':OLD,'expectedArticleCount':2,'expectedDois':DOIS,'journalTotalCount':33}

class Fake:
 def __init__(self,p):
  self.ROOT=p;self.DEFAULT_STATE=p/'state.json';self.EDITORIAL_GATE_DIR=p/'audit/wechat-working'
  self.EDITORIAL_GATE_DIR.mkdir(parents=True);self.calls=0;self.cloud=None;self.fail_add=False;self.fail_get=False;self.tamper=False
  self.save_state(self.DEFAULT_STATE,{'media_id':OLD,'publicationDate':D})
  self.save_state(self.EDITORIAL_GATE_DIR/(D+'-review-gate.json'),{'revision':R,'textReview':'pass','imageReview':'pass'})
 def load_state(self,p):return json.loads(p.read_text()) if p.exists() else {}
 def save_state(self,p,o):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False))
 def create_draft(self,t,a):
  assert t=='MOCK';self.calls+=1
  if self.fail_add:raise TimeoutError('ambiguous POST')
  self.cloud={'news_item':copy.deepcopy(a)};return {'media_id':NEW}
 def get_draft(self,t,m):
  assert t=='MOCK' and m==NEW,'must not read old media as new'
  if self.fail_get:raise RuntimeError('temporary readback failure')
  v=copy.deepcopy(self.cloud)
  if self.tamper:v['news_item'][0]['content']+='unreviewed'
  return v
 def update_draft(self,*a,**k):raise AssertionError('old draft must never be updated')
 def assert_draft_source_links(self,d,urls):assert [x['content_source_url'] for x in d['news_item']]==urls
 def summarize_wechat_article_html(self,s):return {'prose_sha256':hashlib.sha256(s.encode()).hexdigest(),'images':[],'links':[],'headings':[],'tables':[]}
 def write_draft_preview(self,d,**kw):return self.ROOT/'preview.html','https://example.invalid/new-preview'

def run(f,req=None,arts=None,publish=False):
 args=argparse.Namespace(create=True,publish=publish,media_id='',preview_dir=str(f.ROOT),preview_base_url='https://example.invalid')
 buf=io.StringIO()
 with redirect_stdout(buf):mod.run(f,args,copy.deepcopy(req or REQ),token='MOCK',publication_date=D,slot=D+'T08:00:00+08:00',papers=[{}]*33,edition={'editorialRevision':R,'retrospective':'science'},articles=copy.deepcopy(arts or ARTS),expected_source_links=URLS)
 return json.loads(buf.getvalue())

checks=[]
with tempfile.TemporaryDirectory() as t:
 f=Fake(Path(t));a=run(f);b=run(f)
 assert f.calls==1 and a['media_id']==NEW and a['source_media_id']==OLD
 assert a['created_new_draft'] and not b['created_new_draft'] and b['stage']=='draft_recreate_resumed'
 assert a['publish_id'] is None and a['public_send'] is False
 checks.append('one new id, retry readback only, no old-media mutation')
for key,value in [('explicitNewDraftAuthorized',False),('publicSendAuthorized',True),('journalTotalCount',32),('previousMediaId','unexpected-media'),('editorialRevision','unreviewed')]:
 with tempfile.TemporaryDirectory() as t:
  f=Fake(Path(t));q=copy.deepcopy(REQ);q[key]=value
  try:run(f,q)
  except RuntimeError:pass
  else:raise AssertionError('must deny '+key)
  assert f.calls==0
  checks.append('denied '+key)
with tempfile.TemporaryDirectory() as t:
 f=Fake(Path(t))
 try:run(f,publish=True)
 except RuntimeError:pass
 else:raise AssertionError('must reject --publish')
 assert f.calls==0;checks.append('denied publish flag')
with tempfile.TemporaryDirectory() as t:
 f=Fake(Path(t));f.fail_add=True
 for attempt in range(2):
  try:run(f)
  except (RuntimeError,TimeoutError):pass
  else:raise AssertionError('ambiguous add must remain blocked')
 assert f.calls==1;checks.append('ambiguous add never retried blindly')
with tempfile.TemporaryDirectory() as t:
 f=Fake(Path(t));f.fail_get=True
 try:run(f)
 except RuntimeError:pass
 f.fail_get=False;a=run(f);assert f.calls==1 and a['stage']=='draft_recreate_resumed'
 checks.append('new id persisted before readback; resumable')
with tempfile.TemporaryDirectory() as t:
 f=Fake(Path(t));f.tamper=True
 try:run(f)
 except RuntimeError as e:assert 'content differs' in str(e)
 else:raise AssertionError('must detect changed prose')
 f.tamper=False;run(f);assert f.calls==1;checks.append('content tampering detected')
with tempfile.TemporaryDirectory() as t:
 f=Fake(Path(t));run(f);changed=copy.deepcopy(ARTS);changed[0]['content']+='different source'
 try:run(f,arts=changed)
 except RuntimeError as e:assert 'different approved content' in str(e)
 else:raise AssertionError('same request may not change content')
 assert f.calls==1;checks.append('same request fingerprint cannot drift')
print(json.dumps({'status':'pass','checks':checks,'count':len(checks),'networkCalls':0},ensure_ascii=False))
