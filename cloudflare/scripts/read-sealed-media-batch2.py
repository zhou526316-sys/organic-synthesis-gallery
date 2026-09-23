"""Read sealed local images omitted by batch1; no media writes, no publisher crawling."""
import concurrent.futures,datetime,gzip,base64,hashlib,json,os,pathlib,re,urllib.parse,urllib.request
OUT=pathlib.Path(os.environ['RUNNER_TEMP'])/'sealed-media-batch2';(OUT/'images').mkdir(parents=True,exist_ok=True)
BASE='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/r2/buckets/organic-synthesis-gallery-media/objects/'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
OPENER=urllib.request.build_opener(NoRedirect())
def read_object(key,limit=5000000):
 if not (key in ('local-captures/index.json','local-captures/tampermonkey/report-index.json') or re.fullmatch(r'local-captures/(?:images|tampermonkey/reports)/[a-zA-Z0-9_./-]+',key)):raise ValueError('invalid_read_key')
 req=urllib.request.Request(BASE+urllib.parse.quote(key,safe='/'),headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']})
 with OPENER.open(req,timeout=20) as r: data=r.read(limit+1)
 if len(data)>limit:raise ValueError('object_size_limit')
 return data

def url(s):
 try:
  u=urllib.parse.urlsplit(str(s or ''));return urllib.parse.urlunsplit((u.scheme,u.hostname or '',u.path,'','')) if u.scheme in ('http','https') else ''
 except ValueError:return ''
def text(s):
 s=re.sub(r'https?://[^\s\"\'<>]+',lambda m:url(m.group()),str(s or ''))
 return re.sub(r'(?i)Bearer\s+\S+|(?:token|secret|password|cookie|authorization)\s*[:=]\s*\S+','[redacted]',s)[:1200]
def ids(s):
 s=url(s)
 for i in range(3):s=urllib.parse.unquote(s)
 return sorted(set('10.'+a+'/'+b.lower() for a,b in re.findall(r'10\.(1021|1038|1002)[/_]([a-z0-9._()-]+)',s,re.I)))
def norm(s):return re.sub(r'[^a-z0-9]','',str(s or '').lower())
raw=read_object('local-captures/index.json');index=json.loads(raw)
rows=list(index['items'].values())
b1=json.loads(pathlib.Path('audit/media-recovery/toc-batch1-manifest.json').read_text());done={x['doi'] for x in b1['items']}
papers=json.loads(gzip.decompress(base64.b64decode(pathlib.Path('public/papers.gz.b64').read_text())))
for name in ['total-synthesis','manual-supplement','final-audit-supplement','curated-supplement','automation-supplement','rolling-supplement','literature-supplement']:
 p=pathlib.Path('public')/(name+'.json')
 if p.exists():papers.extend(json.loads(p.read_text()).get('papers',[]))
bydoi={str(p.get('doi','')).lower():p for p in papers if p.get('doi')}
# Limit to the retained pre-cutover local index, excluding explicitly unresolved role conflicts and prior batch.
held={'10.1021/acscatal.6c05271','10.1021/acscatal.6c05787','10.1021/acscatal.6c05029','10.1021/acscatal.6c04593'}
selected=[r for r in rows if r.get('doi') not in done|held and float(r.get('updatedAt') or 0)<1790082000000 and r.get('kind') in ('official','figure1')]
assert len(selected)<=45,'Bounded candidate limit exceeded'

def verify(pair):
 i,r=pair;doi=r['doi'];paper=bydoi.get(doi,{})
 result={k:r.get(k) for k in ['doi','kind','r2Key','contentHash','updatedAt','capturedAt','contentType','byteLength']}
 result.update(reviewId='b2-'+str(i).zfill(3),articleUrl=url(r.get('articleUrl')),sourceUrl=url(r.get('sourceUrl')),caption=text(r.get('caption')),titles={k:text(paper.get(k)) for k in ['title','titleEn','title_en','journal','date']},sourceDois=ids(r.get('sourceUrl')),articleDois=ids(r.get('articleUrl')),inRepositoryCorpus=bool(paper),approved=False)
 try:
  data=read_object(r['r2Key']);h=hashlib.sha256(data).hexdigest();result['sha256']=h
  assert re.fullmatch(r'[a-f0-9]{16,64}',str(r.get('contentHash',''))) and h.startswith(r['contentHash']),'stored_hash_mismatch'
  if data.startswith(b'\x89PNG\r\n\x1a\n'):typ='png'
  elif data.startswith(b'\xff\xd8\xff'):typ='jpg'
  elif data[:4]==b'RIFF' and data[8:12]==b'WEBP':typ='webp'
  elif re.search(br'<svg[\s>]',data[:4096],re.I):typ='svg'
  else:raise ValueError('unrecognized_type')
  f='images/'+result['reviewId']+'.'+typ;(OUT/f).write_bytes(data);result.update(file=f,actualType=typ,actualBytes=len(data),byteVerified=True)
 except Exception as e:result.update(byteVerified=False,errorType=type(e).__name__,httpStatus=getattr(e,'code',None))
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:images=list(pool.map(verify,enumerate(selected,1)))
# Read summaries for each remaining candidate; fetch at most two old success reports per DOI, total bounded.
ri=json.loads(read_object('local-captures/tampermonkey/report-index.json'))['items'];history=[]
for r in selected:
 row=ri.get(r['doi'],{});attempts=[x for x in row.get('attempts',[]) if x.get('status')=='success' and float(x.get('updatedAt') or 0)<1790082000000][:2]
 for a in attempts:
  try:
   p=json.loads(read_object(a['reportKey']));events=p.get('trace',[])
   history.append({'doi':r['doi'],'attemptId':p.get('attemptId'),'updatedAt':p.get('updatedAt'),'status':p.get('status'),'reason':text(p.get('reason')),'articleUrl':url(p.get('articleUrl')),'sourceUrl':url(p.get('sourceUrl')),'candidateSource':p.get('candidateSource'),'candidateKind':p.get('candidateKind'),'pageTitle':text(p.get('pageTitle')),'trace':[{'stage':e.get('stage'),'event':e.get('event'),'at':e.get('at'),'url':url(e.get('url')),'message':text(e.get('message')),'candidateKind':e.get('candidateKind')} for e in events if e.get('stage') in ('job','r2_upload','page_doi_guard','candidate_selection')][:20]})
  except Exception as e:history.append({'doi':r['doi'],'errorType':type(e).__name__})
summary={'readAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseSha':os.environ['GITHUB_SHA'],'readOnly':True,'indexSha256':hashlib.sha256(raw).hexdigest(),'candidates':len(images),'bytesVerified':sum(x['byteVerified'] for x in images),'historicalReports':len(history),'mediaWrites':0,'restored':0,'reviewRequired':True}
(OUT/'evidence.json').write_text(json.dumps({'summary':summary,'images':images,'reports':history},ensure_ascii=False,indent=2))
print('SEALED_B2_READ '+json.dumps(summary,ensure_ascii=False))
for r in images:print('SEALED_B2_CANDIDATE '+json.dumps({k:r[k] for k in ['reviewId','doi','kind','byteVerified','inRepositoryCorpus','sourceDois','articleDois','titles']},ensure_ascii=False))
