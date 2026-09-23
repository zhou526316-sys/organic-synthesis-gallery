"""Bounded, read-only recovery evidence. This script never promotes or writes production media."""
import base64, concurrent.futures, datetime, gzip, hashlib, json, os, pathlib, re, urllib.parse, urllib.request
ROOT=pathlib.Path('.'); OUT=pathlib.Path(os.environ['RUNNER_TEMP'])/'sealed-media-batch2'; OUT.mkdir(parents=True,exist_ok=True)
BASE='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/r2/buckets/organic-synthesis-gallery-media/objects/'
CUTOVER=1790082000000
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k): return None
opener=urllib.request.build_opener(NoRedirect())
def read_object(key):
 if not re.fullmatch(r'local-captures/(?:index\.json|tampermonkey/report-index\.json|tampermonkey/reports/[a-zA-Z0-9/_-]+\.json|images/[a-zA-Z0-9._-]+)',key): raise ValueError('unexpected_object_key')
 req=urllib.request.Request(BASE+urllib.parse.quote(key,safe='/'),headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']})
 with opener.open(req,timeout=20) as r: body=r.read(6000001)
 if len(body)>6000000: raise ValueError('size_limit')
 return body

def url(v):
 try:
  u=urllib.parse.urlsplit(str(v or ''));return urllib.parse.urlunsplit((u.scheme,u.hostname or '',u.path,'','')) if u.scheme=='https' else ''
 except ValueError:return ''
def text(v):
 s=re.sub(r'https?://[^\s\"\'<>]+',lambda m:url(m.group()),str(v or ''))
 return re.sub(r'(?i)Bearer\s+\S+|(?:token|secret|password|cookie|authorization)\s*[:=]\s*[^\s;,]+','[redacted]',s)[:1200]
def safe_report(r):
 out={k:(url(r[k]) if k.endswith('Url') else text(r[k]) if isinstance(r[k],str) else r[k]) for k in ['doi','status','reason','candidateSource','candidateKind','assetType','articleUrl','sourceUrl','startedAt','finishedAt','updatedAt','attemptId'] if k in r}
 out['trace']=[{k:(url(e[k]) if k=='url' else text(e[k]) if isinstance(e[k],str) else e[k]) for k in ['seq','at','stage','event','status','httpStatus','url','message','imageWidth','imageHeight','byteLength'] if k in e} for e in r.get('trace',[])]
 return out
local_bytes=read_object('local-captures/index.json'); report_bytes=read_object('local-captures/tampermonkey/report-index.json')
local=json.loads(local_bytes); reports=json.loads(report_bytes)
prior=json.loads((ROOT/'audit/media-recovery/toc-batch1-manifest.json').read_text())
prior_dois={r['doi'] for r in prior['items']}
selected=[r for r in local['items'].values() if r.get('kind')=='official' and r['doi'] not in prior_dois and 0<int(r.get('updatedAt') or 0)<CUTOVER]
assert len(selected)<=60,'Review universe unexpectedly expanded'

def asset(row):
 out={k:row.get(k) for k in ['doi','kind','r2Key','contentHash','contentType','byteLength','updatedAt','source']}
 out.update(articleUrl=url(row.get('articleUrl')),sourceUrl=url(row.get('sourceUrl')),caption=text(row.get('caption')),approved=False)
 try:
  raw=read_object(row['r2Key']); sha=hashlib.sha256(raw).hexdigest();out['sha256']=sha;out['storedHashMatches']=sha.startswith(row['contentHash']);out['actualBytes']=len(raw)
  assert out['storedHashMatches'],'stored_hash_mismatch'
  ext='png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else 'jpg' if raw.startswith(b'\xff\xd8\xff') else 'webp' if raw[:4]==b'RIFF' and raw[8:12]==b'WEBP' else 'svg' if b'<svg' in raw[:4096] else ''
  assert ext,'unknown_image_bytes'
  file='assets/'+sha+'.'+ext;(OUT/'assets').mkdir(exist_ok=True);(OUT/file).write_bytes(raw);out['file']=file
  record=reports.get('items',{}).get(row['doi'],{}); attempts=record.get('attempts') or ([record] if record else [])
  exact=[a for a in attempts if url(a.get('sourceUrl'))==out['sourceUrl'] and url(a.get('articleUrl'))==out['articleUrl']]
  out['matchingReportSummaries']=len(exact);out['matchingReports']=[]
  for a in exact[:3]:
   try:
    r=json.loads(read_object(a['reportKey']));out['matchingReports'].append(safe_report(r))
   except Exception as e:out.setdefault('reportErrors',[]).append(type(e).__name__)
 except Exception as e:out['error']=type(e).__name__
 return out
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: assets=list(pool.map(asset,selected))
latest=sorted(reports.get('items',{}).values(),key=lambda x:int(x.get('updatedAt') or 0),reverse=True)
def recent(row):
 try:return safe_report(json.loads(read_object(row['reportKey'])))
 except Exception as e:return {'doi':row.get('doi'),'readError':type(e).__name__}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: details=list(pool.map(recent,latest[:6]))
summary={'readAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'mediaWrites':0,'baseSha':os.environ['GITHUB_SHA'],'indexSha256':hashlib.sha256(local_bytes).hexdigest(),'reportIndexSha256':hashlib.sha256(report_bytes).hexdigest(),'reportIndexUpdatedAt':reports.get('updatedAt'),'autoLatestDoi':sum(str(r.get('candidateSource','')).startswith('auto_') for r in latest),'selectedSealed':len(assets),'verifiedByteObjects':sum(r.get('storedHashMatches') is True for r in assets),'matchingReportCandidates':sum(bool(r.get('matchingReports')) for r in assets),'pixelReviewDone':False,'restored':0}
(OUT/'evidence.json').write_text(json.dumps({'summary':summary,'assets':assets,'latestReports':details},ensure_ascii=False,indent=2))
print('SEALED_MEDIA_READ '+json.dumps(summary))
for r in details:
 print('RECENT_CAPTURE '+json.dumps({k:v for k,v in r.items() if k!='trace'},ensure_ascii=False))
for r in assets:
 print('SEALED_CANDIDATE '+json.dumps({k:r.get(k) for k in ['doi','kind','actualBytes','storedHashMatches','matchingReportSummaries','error']},ensure_ascii=False))
