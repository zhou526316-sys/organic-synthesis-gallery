#!/usr/bin/env python3
"""Seal exact already-inspected source artifacts. Does not call WeChat."""
import hashlib,json,pathlib,subprocess
from datetime import datetime,timezone,timedelta
R=pathlib.Path.cwd();A=R/'audit/wechat-working/2026-10-15-r1-nature-science'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def blob(p):
 b=p.read_bytes();return hashlib.sha1(('blob '+str(len(b))).encode()+bytes([0])+b).hexdigest()
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
plan=json.loads((R/'audit/automation-triggers/wechat-oct15-source-approval.json').read_text())
gp=R/'audit/wechat-working/2026-10-15-review-gate.json';g=json.loads(gp.read_text())
assert plan['manualVisualReview']=='pass' and plan['scientificTextReview']=='pass'
assert plan['publicSendAuthorized'] is False and plan['draftOnly'] is True
assert blob(gp)==plan['expectedPendingGateBlobSha'],'Gate changed after inspection'
assert g['selectionDois']==['10.1038/s41586-026-11242-8','10.1126/science.aec6298']
assert len(g['assets'])==35 and g['expectedJournalTotal']==plan['dailyCount']
for x in g['sources']:assert blob(R/x['path'])==x['blobSha'],x['path']
for x in g['assets']:assert blob(R/x['path'])==x['blobSha'] and sha(R/x['path'])==x['sha256'],x['path']
qa=json.loads((A/'production-preview/browser-qa.json').read_text())
assert len(qa['results'])==4
for x in qa['results']:
 assert not x['overflow'] and x['images']==x['loaded']==(15 if x['article']=='nature' else 18)
assert plan['workflowRun']>0
reportpath=A/'production-review.json';report=json.loads(reportpath.read_text())
report.update({'status':'reviewed_science_text_original_images_and_production_layout_pass','manualVisualReview':plan,'cloudWritePerformed':False})
write(reportpath,report)
g.update({'textReview':'pass','imageReview':'pass','draftWriteAuthorized':True,'publicSendAuthorized':False,'reviewedAtBeijing':datetime.now(timezone(timedelta(hours=8))).isoformat(),'reviewNotes':'Reviewed source text preserved verbatim apart from Markdown emphasis markers; all 33 exact original body figures decoded and 390/980px layouts visually inspected. Two source screenshot covers add no text/bars. Official draft/get remains required.','visualApproval':plan})
for x in g['sources']:x['blobSha']=blob(R/x['path'])
write(gp,g)
print(json.dumps({'gate':'pass','sourceImages':33,'coverImages':2,'dailyCount':g['expectedJournalTotal'],'gateBlobSha':blob(gp),'publicSendAuthorized':False}))
subprocess.run(['git','config','user.name','github-actions[bot]'],check=True)
subprocess.run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],check=True)
subprocess.run(['git','add',str(gp.relative_to(R)),str(reportpath.relative_to(R))],check=True)
subprocess.run(['git','diff','--cached','--check'],check=True)
subprocess.run(['git','commit','-m','audit: approve Oct15 reviewed Nature Science exact source and cover layout'],check=True)
subprocess.run(['git','push','origin','HEAD:wechat-oct15-nature-science-reviewed-draft'],check=True)
