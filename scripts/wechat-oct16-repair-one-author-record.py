#!/usr/bin/env python3
"""Minimal metadata repair for an already-published daily DOI, never add a paper."""
from pathlib import Path
import json,hashlib,datetime
R=Path.cwd();doi='10.1038/s41467-026-78630-6'
authors=['Zheng-Yang Gu','Bin Gao','Jinxiang Ye','Yang Zheng','Liyun Wu','Jiaxuan Li','Ru-Yi Zhu']
files=['rolling-supplement.json','literature-supplement.json','automation-supplement.json','curated-supplement.json','final-audit-supplement.json','manual-supplement.json','total-synthesis.json']
def walk(x):
 if isinstance(x,dict):
  if str(x.get('doi','')).lower()==doi:yield x
  for v in x.values():yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
repairs=[];found=0
for name in files:
 p=R/'public'/name
 if not p.exists():continue
 b=p.read_bytes();j=json.loads(b);changed=0
 for item in walk(j):
  found+=1
  assert 'water-promoted oxidative' in str(item.get('title','')).lower(),item.get('title')
  old=item.get('authors')
  if not old:
   item['authors']=authors.copy();changed+=1
  else:
   assert old==authors,('Unexpected existing author record; do not overwrite',name,old)
 if changed:
  p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  repairs.append({'path':str(p.relative_to(R)),'changedRecords':changed,'beforeSHA256':hashlib.sha256(b).hexdigest(),'afterSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'onlyChangedField':'authors'})
assert found>0,'Existing formally published DOI not found'
report={'doi':doi,'title':'Rapid and versatile water-promoted oxidative [3+2] cycloaddition','authors':authors,'source':'https://www.nature.com/articles/s41467-026-78630-6','sourceSection':'Authors and Affiliations','publisherDate':'2026-10-15','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBasis':'Primary publisher page retrieved by exact DOI web search; all seven names and order visible in Authors and Affiliations. Not the older lab-page author list.','changes':repairs,'addedDois':[],'deletedDois':[],'reviewDecisionsChanged':False,'dailyTotalChanged':False}
p=R/'audit/wechat-working/2026-10-16-r1/daily-author-metadata-repair.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'authorsRepairedFor':doi,'authorCount':len(authors),'files':repairs,'dailyCountUnchanged':True},ensure_ascii=False))
