#!/usr/bin/env python3
"""No-network tests for the owner cover/title-only operation."""
import argparse, copy, hashlib, importlib.util, io, json, tempfile
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cover_patch',ROOT/'ops/wechat-publisher/cover_title_patch.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
plan=json.loads((ROOT/mod.PLAN).read_text())

class Fake:
    ROOT=ROOT
    def __init__(self,tmp,tamper=False):
        self.DEFAULT_STATE=tmp/'state.json'
        self.cloud={'news_item':[{'title':s['expectedTitle'],'author':'化之岛','digest':'原摘要必须保留','content':'<p>正式新增20篇</p><p>科学正文不修改 '+str(i)+'</p><img src="original-'+str(i)+'">','content_source_url':s['sourceUrl'],'thumb_media_id':'old'+str(i),'need_open_comment':0,'only_fans_can_comment':0} for i,s in enumerate(plan['articles'])]}
        self.original=copy.deepcopy(self.cloud)
        self.update_count=0; self.tamper=tamper
        self.save_state(self.DEFAULT_STATE,{'publicationDate':mod.DATE,'media_id':mod.MEDIA,'articleCount':2})
    def load_state(self,path):return json.loads(path.read_text()) if path.exists() else {}
    def save_state(self,path,data):path.write_text(json.dumps(data,ensure_ascii=False))
    def load_env(self,path):pass
    def get_access_token(self):return 'MOCK-NOT-A-CREDENTIAL'
    def get_draft(self,token,media):assert media==mod.MEDIA;return copy.deepcopy(self.cloud)
    def assert_draft_source_links(self,cloud,urls):assert [x['content_source_url'] for x in cloud['news_item']]==urls
    def upload_permanent_image(self,token,path,cache):return hashlib.sha256(path.read_bytes()).hexdigest()
    def update_draft(self,token,media,article,index=0):
        assert media==mod.MEDIA
        self.update_count+=1
        self.cloud['news_item'][index].update(copy.deepcopy(article))
        if self.tamper:self.cloud['news_item'][index]['content']+='forbidden change'
    def write_draft_preview(self,draft,media_id,preview_dir,base_url):
        preview_dir.mkdir(exist_ok=True);p=preview_dir/'mock-preview.html';p.write_text('<html><head></head><body>封面排版示意</body></html>');return p,base_url+'/mock-preview.html'

def request():
    return {'action':mod.ACTION,'publicationDate':mod.DATE,'expectedExistingMediaId':mod.MEDIA,'draftOnly':True,'publicSendAuthorized':False,'bodyChangeAuthorized':False,'requireDraftGetReadback':True,'planPath':mod.PLAN,'planSha256':hashlib.sha256((ROOT/mod.PLAN).read_bytes()).hexdigest(),'requestId':'test-same-id'}

def invoke(fake,tmp,req,**kw):
    args=argparse.Namespace(create=True,publish=False,media_id='',env_file=str(tmp/'env'),preview_dir=str(tmp/'preview'),preview_base_url='https://example.invalid/preview')
    for k,v in kw.items():setattr(args,k,v)
    with redirect_stdout(io.StringIO()):return mod.run(fake,args,req)

with tempfile.TemporaryDirectory() as d:
    tmp=Path(d);f=Fake(tmp);invoke(f,tmp,request())
    assert f.update_count==2
    assert [mod.fingerprint(x) for x in f.original['news_item']]==[mod.fingerprint(x) for x in f.cloud['news_item']]
    assert f.cloud['news_item'][0]['title']==f.original['news_item'][0]['title']
    assert f.cloud['news_item'][1]['title']==plan['articles'][1]['newTitle']
    assert 'Benjamin List' in f.cloud['news_item'][1]['title'] and '日报' not in f.cloud['news_item'][1]['title']
    invoke(f,tmp,request());assert f.update_count==2,'retry must not rewrite unchanged fields'
for bad in ['publish','body','identity','plan']:
    with tempfile.TemporaryDirectory() as d:
        tmp=Path(d);f=Fake(tmp);r=request();kw={}
        if bad=='publish':kw['publish']=True
        if bad=='body':r['bodyChangeAuthorized']=True
        if bad=='identity':r['expectedExistingMediaId']='different'
        if bad=='plan':r['planSha256']='0'*64
        try:invoke(f,tmp,r,**kw)
        except RuntimeError:pass
        else:raise AssertionError('must reject '+bad)
        assert f.update_count==0
with tempfile.TemporaryDirectory() as d:
    tmp=Path(d);f=Fake(tmp,tamper=True)
    try:invoke(f,tmp,request())
    except RuntimeError as e:assert 'changed body' in str(e)
    else:raise AssertionError('changed body must fail readback')
print('PASS: source images verified; two covers and retro title only; idempotent; four denied scopes; changed-body readback detected')
