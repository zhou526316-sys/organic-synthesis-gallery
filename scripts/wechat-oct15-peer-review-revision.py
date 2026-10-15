#!/usr/bin/env python3
"""Prepare source-grounded R2 manuscripts and a withheld gate; approve only after visual inspection."""
import argparse, copy, hashlib, html, importlib.util, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DAY='2026-10-15'; REV=DAY+'-r2-peer-reviewed'
OUT=ROOT/'audit/wechat-working'/REV
FP=ROOT/'public/wechat-featured'/f'{DAY}.json'
SP=ROOT/'public/wechat-retrospective/kf-catalytic-appel-fluorination-20261015.json'
EP=ROOT/'public/wechat-editions'/f'{DAY}.json'
GP=ROOT/'audit/wechat-working'/f'{DAY}-review-gate.json'

def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,v):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def blob(p):
 b=p.read_bytes();return hashlib.sha1(('blob '+str(len(b))).encode()+bytes([0])+b).hexdigest()
def rel(p): return p.relative_to(ROOT).as_posix()
def prose(m):
 a=['# '+str(m.get('title') or m['headline']),'',m['paper']['title'],'DOI: '+m['paper']['doi'],'']
 for q in m.get('quick_points',[]):a.extend(['## '+q['label'],q['text'],''])
 for s in m['sections']:
  a.extend(['## '+s['heading'],''])
  for p in s.get('paragraphs',[]):a.extend([p,''])
  for k in ['callout','warning','review']:
   if s.get(k):a.extend([s[k],''])
 return '\n'.join(a)+'\n'

def prepare():
 old=read(GP); f=read(FP); s=read(SP); e=read(EP)
 if f.get('editorialRevision')==REV:
  raise RuntimeError('Already prepared; use approve after inspecting the existing rendered artifacts')
 assert f['paper']['doi']=='10.1038/s41586-026-11242-8'
 assert s['paper']['doi']=='10.1126/science.aec6298'
 assert f['editorialRevision']==s['editorialRevision']==e['editorialRevision']==DAY+'-r1'
 assert len(f['sections'])==7 and e['dailyReleaseSnapshot']['count']==33
 OUT.mkdir(parents=True,exist_ok=True)
 write(OUT/'previous-gate.json',old)
 write(OUT/'previous-manifests.json',{'nature':f,'science':s,'edition':e})
 f['editorialRevision']=s['editorialRevision']=e['editorialRevision']=REV
 f['source_note']='依据用户提供的 Nature Accelerated Article Preview、SI 及 Peer Review File；分别标明匿名审稿人意见、作者回应与本文评议，不把历史答复数值覆盖到预览版数据。'
 f['sections'][3]['heading']='以官能团兼容性与交叉拼接检验合成价值'
 f['sections'][3]['paragraphs'][0]='两位审稿人均要求更充分地检验官能团兼容性，作者据此扩充了底物范围。原文图 3 包括溴、氰基、酯、酰胺和酮等取代结构；含羰基螺二芴体现了不同于强亲核有机金属路线的合成价值。1-取代及含氮联苯撑还表现出远端 C–C 键活化的区域选择性，其位阻与配位解释仍属作者分析。'
 f['sections'][4]={
 'eyebrow':'审稿追问推动的机理检验',
 'heading':'重氮物与 PPh₃ 的对照，需要放回真实反应阶段',
 'paragraphs':[
 '作者提出 4a 受热后释放少量重氮物，再进入铑卡宾转移；但预制重氮物 6a 单独反应却没有目标产物。审稿人1据此建议加入 PPh₃，检验它能否与 6a 重新形成 phosphazine。这项追问针对的是反应入口：预制物直接加入失败，是否足以否定它在原位生成时的作用？',
 '作者按此建议补做实验：6a 与 PPh₃ 同加时得到 18% 产物，先预混两小时的一组得到 66% 核磁收率。原图还显示溶剂不同，不能把差值全归于预混。这些结果支持 phosphazine 作为有效前体，也提供了另一条合成入口，但没有直接测出原催化过程中游离重氮物的浓度。',
 '审稿人1还问：释放出的 PPh₃ 会不会竞争配位，令铑逐渐失活？作者先用定量 ³¹P NMR 确认 PPh₃ 是主要含磷产物，再把添加实验分成两个阶段，而没有只在标准条件中加一次 PPh₃ 就作结论。',
 '从起始阶段加入一当量 PPh₃，产率降至 14%；改用分离的 4a 考察第二阶段，额外加入 PPh₃ 仍得到 93%。这支持 PPh₃ 在不同阶段产生不同影响，不能笼统写成“抑制反应”或“不影响反应”。竞争配位是作者据此提出的解释，并未被直接定量。',
 '这组审稿往返提供了一个具体的方法学启示：添加剂对照应尽量复现该物种实际出现的时段与共存组分。审稿人的追问推动了实验，实验又收窄了可作出的机制结论；这一推演比单独罗列四个收率更能说明研究如何推进。'
 ],
 'figures':['N_diazo','N_phosphine'],
 'figures_after_paragraph':{'2':['N_diazo'],'4':['N_phosphine']}}
 f['sections'][6]={
 'eyebrow':'实用性质疑与作者的改进',
 'heading':'放大与一锅法改善了操作，底物门槛仍然存在',
 'paragraphs':[
 '审稿人1质疑慢滴加、混合溶剂及铑／配体用量是否限制实际应用，并要求检验克级制备。作者随后优化加料与温度，以 PINC 为基准将 [Rh(cod)Cl]₂ 降至 3 mol%；在 10 mmol PINC 规模上，得到 1.57 g、50% 分离收率。反应装置在台面搭建，仍使用氮气，不能写成“空气中反应”。',
 '交叉拼接也得到简化：不再分离 4，也不补加第二份铑催化剂。SI S13 的一锅反应给出 97% 产物，收率以第二个联苯撑为基准。这回应了中间体处理和二次催化剂投料的问题，但没有证明所有交叉底物均能按同样效率一锅完成。',
 '另一项追问是底物究竟有多通用。作者既补充了成功例，也在 SI S31 保留了所测醛、游离羟基和硝基底物的失败结果。联苯撑前体还需要预先制备；因此，克级结果改善了制备可行性，却没有消除原料可及性与官能团限制。'
 ],'figures':['N_onepot','N_limits'],'figures_after_paragraph':{'2':['N_onepot'],'3':['N_limits']}}
 f['sections'].append({
 'eyebrow':'第二轮审稿仍保留的分歧',
 'heading':'概念原创性与合成实用性，需要分别评价',
 'paragraphs':[
 '第二轮中，审稿人1认可补充实验并建议接受，理由是通过 C–C σ 键活化实现单碳转移的概念价值；他仍保留对专用底物和操作条件的意见。审稿人2同样肯定原创性，却仍判断实际应用与合成影响有限。被接受不等于两位审稿人已对实用性形成一致认可。',
 '作者在答复中承认这些边界，说明已收窄“通用”表述，并重新区分图 1A 的概念与图 1B 实际需要的联苯撑底物。这里应将答复中的论文定位与当前展示的实验分开阅读：已建立的是新的碳转移模式，而非对任意联苯或多芳烃都适用的三维化反应。'
 ],'figures':[],'figures_after_paragraph':{},
 'review':'研究启示｜PINC 的持续供给、中间体 4 的暂时积累与第二组分的分段进入，把互相竞争的过程拆开。沿此思路，原位物种监测与分段加料对照可用于检验各阶段的限制因素；推广到其他 σ 键或发展对映选择性，则仍需新的实验证据。这是基于本文提出的研究建议。',
 'warning':'审稿资料｜上述匿名审稿人意见及作者回应，转述自本篇 Nature 公开的 Peer Review File：第2页、第5–10页及第14–15页；不是作者正文的全部结论，也不是本文编辑评议的替代。'
 })
 for fig in f['figures']:
  if fig['id']=='N_diazo':fig['caption']+=' 审稿人1建议的重氮物／PPh₃补充实验另见 Peer Review File 第10页；两组条件的溶剂并不相同。'
  if fig['id']=='N_phosphine':fig['caption']+=' 对应 Peer Review File 第9–10页关于分阶段 PPh₃ 影响的作者答复。'
 s['source_note']='依据用户提供的 Science 正文与 SI；没有对应审稿报告或作者答复，不能将编辑摘要或本文评议表述为审稿意见。'
 s['sections'][-1]['warning']='资料范围｜本篇依据论文正文与 SI。当前材料不含审稿报告及作者答复；文中的机制判断和研究建议不代表审稿人意见，Editor’s summary 也不等于审稿报告。'
 e['digest']='正式新增按10月15日08:00目录统计；Nature结合公开审稿往返解读单碳螺环拼接，Science解析KF参与的催化Appel氟化。'
 e['regeneration']={'authorizedNewDraft':True,'reason':'owner reports publication followed by deletion and explicitly requests an improved new draft','previousMediaId':'KhELYUzvwADwB_l1xH1SWE19Pj0vRCRwKboBqBMzBwhc8kqBBleCJP2ALtXFeTK-','noPublicSend':True}
 write(FP,f);write(SP,s);write(EP,e)
 (OUT/'nature-text-only.md').write_text(prose(f),encoding='utf-8')
 (OUT/'science-text-only.md').write_text(prose(s),encoding='utf-8')
 write(OUT/'images-only.json',[{'doi':m['paper']['doi'],'cover':m['cover'],'lead':m['lead_figure_id'],'figures':m['figures'],'placements':[{'heading':z['heading'],'positions':z['figures_after_paragraph']} for z in m['sections']]} for m in (f,s)])
 original=read(OUT/'previous-manifests.json')
 assert f['cover']==original['nature']['cover'] and s['cover']==original['science']['cover']
 assert [(x['id'],x['repo_path']) for x in f['figures']]==[(x['id'],x['repo_path']) for x in original['nature']['figures']]
 assert [(x['id'],x['repo_path']) for x in s['figures']]==[(x['id'],x['repo_path']) for x in original['science']['figures']]
 for a in old['assets']:
  p=ROOT/a['path'];assert blob(p)==a['blobSha'],a['path']
 review={'date':DAY,'revision':REV,'status':'science_language_review_complete_visual_pending','basis':['Nature main/ SI /15-page Peer Review File supplied by owner','Science main/SI supplied by owner; no peer-review record supplied'],
 'evidence':[{'point':'Reviewer1 requested diazo/PPh3 and coordination tests','source':'Peer Review File p2 and pp8-10; SI pp31-35','boundary':'18/66 conditions differ in solvent and premixing;14/93 test different stages; no direct diazo concentration or full metal-species quantitation'},
 {'point':'Practicality prompted lower load, scale-up, one-pot and expanded scope','source':'Peer Review File pp5-8; SI pp10-13 and31','boundary':'3mol% denotes the stated Rh dimer relative to PINC; glovebox-free is not air;97% referenced to second biphenylene; historical reply figures are not substituted for preview values'},
 {'point':'Second-round opinions not unanimous on utility','source':'Peer Review File p3 and pp14-15','boundary':'Reviewer1 recommends acceptance while retaining caveats;Reviewer2 still questions utility. Author response says wording narrowed; actual demonstrated scope remains biphenylenes'},
 {'point':'Science has no supplied reviewer report','source':'Science main p9 editorial summary and supplied SI contents','boundary':'Do not invent referee motivation or conflate editor and referee'}],
 'unchanged':{'scientificImageCount':33,'coverCount':2,'allAssetBytes':True,'dois':old['selectionDois'],'dailyCount':33},
 'checks':{'noGeneratedChemistry':True,'noNewReviewerClaimsForScience':True,'naturalChinesePass':True,'sourceEvidencePass':True},'cloudWritten':False,'publicSendAuthorized':False}
 write(OUT/'editorial-review.json',review)
 source_paths=[FP,SP,EP,OUT/'nature-text-only.md',OUT/'science-text-only.md',OUT/'images-only.json',OUT/'editorial-review.json']
 gate=copy.deepcopy(old);gate.update({'revision':REV,'textReview':'pending_final_visual','imageReview':'pending_final_visual','draftWriteAuthorized':False,'publicSendAuthorized':False,'sources':[{'path':rel(p),'blobSha':blob(p)} for p in source_paths],
 'artifacts':{'textOnly':rel(OUT/'nature-text-only.md'),'retrospectiveTextOnly':rel(OUT/'science-text-only.md'),'imagesOnly':rel(OUT/'images-only.json'),'scienceReview':rel(OUT/'editorial-review.json')},'note':'New draft explicitly requested after owner-reported publication/deletion. Old assets and covers immutable. Gate withheld until actual new-layout manual review.'})
 write(GP,gate)
 pubfile=ROOT/'ops/wechat-publisher/create-draft.py';code=pubfile.read_text(encoding='utf-8')
 anchor='    state = load_state(DEFAULT_STATE)\n    requested_media_id = str(args.media_id or "").strip()'
 hook='    if source_link_request.get("action") == "recreate_reviewed_draft":\n        from recreate_reviewed_draft import run as run_recreation\n        return run_recreation(sys.modules[__name__], args, source_link_request, token=token,\n            publication_date=publication_date, slot=slot, papers=papers, edition=edition,\n            articles=articles, expected_source_links=expected_source_links)\n\n'
 assert code.count(anchor)==1
 pubfile.write_text(code.replace(anchor,hook+anchor),encoding='utf-8')
 spec=importlib.util.spec_from_file_location('pub',pubfile);pub=importlib.util.module_from_spec(spec);spec.loader.exec_module(pub)
 slot,papers=pub.load_latest_release();assert slot==DAY+'T08:00:00+08:00' and len(papers)==33
 assert {p['doi'] for p in papers}==set(e['dailyReleaseSnapshot']['dois'])
 dest=OUT/'preview';dest.mkdir(exist_ok=True)
 for key,m in [('nature',f),('science',s)]:
  urls={x['id']:'/'+x['repo_path'] for x in m['figures'] if x.get('body') is not False}
  body=pub.build_content(slot,papers,m,urls) if key=='nature' else pub.build_retrospective_content(m,urls)
  page='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f4f5f6}main{box-sizing:border-box;max-width:720px;margin:auto;background:white;padding:20px}img{max-width:100%;height:auto}</style></head><body><main>'+body+'</main></body></html>'
  (dest/(key+'.html')).write_text(page,encoding='utf-8')
 print(json.dumps({'revision':REV,'scienceImageCount':33,'dailyCount':33,'paragraphs':[sum(len(z['paragraphs']) for z in m['sections']) for m in (f,s)],'status':'prepared_no_cloud_write'},ensure_ascii=False))

def approve():
 approval=read(OUT/'manual-visual-approval.json');assert approval['revision']==REV and approval['approved'] is True
 gate=read(GP)
 for v in gate['sources']:assert blob(ROOT/v['path'])==v['blobSha'],v['path']
 for v in gate['assets']:assert blob(ROOT/v['path'])==v['blobSha'],v['path']
 qa=read(OUT/'preview/browser-qa.json');assert qa['status']=='pass'
 review=read(OUT/'editorial-review.json');review['status']='source_text_images_and_manual_production_layout_pass';review['manualVisualApproval']=rel(OUT/'manual-visual-approval.json');write(OUT/'editorial-review.json',review)
 for v in gate['sources']:v['blobSha']=blob(ROOT/v['path'])
 gate['sources'].append({'path':rel(OUT/'manual-visual-approval.json'),'blobSha':blob(OUT/'manual-visual-approval.json')})
 gate.update({'textReview':'pass','imageReview':'pass','draftWriteAuthorized':True,'note':'Source evidence, Chinese expression, exact images and manually inspected production rendering approved. Requires a new media_id and real draft/get. No public send.'})
 write(GP,gate)
 spec=importlib.util.spec_from_file_location('pub',ROOT/'ops/wechat-publisher/create-draft.py');pub=importlib.util.module_from_spec(spec);spec.loader.exec_module(pub)
 pub.require_editorial_review_gate(GP,[FP,SP,EP])
 print('PASS: complete R2 source and original-image gate sealed after manual visual inspection')

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('mode',choices=['prepare','approve']);args=ap.parse_args()
 prepare() if args.mode=='prepare' else approve()
