import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const CUTOFF='2026-10-01';
const API='https://api.gczhouwld.com';
const SITE='https://gallery.gczhouwld.com';
const readAt=new Date().toISOString();
const report={schemaVersion:'tm-oct1-scope-readonly-gap-matrix-v1',readAt,readOnly:true,
  productionWrites:0,publisherRequests:0,pdfRequests:0,mediaMutations:0,
  cutoffAddedDate:CUTOFF,errors:[],summary:{},journals:[],gaps:[]};

function normalized(value){return String(value||'').trim().toLowerCase();}
function n(value){return Number.isFinite(Number(value))?Number(value):0;}
function text(value,max=140){return String(value||'').replace(/[\r\n\t]+/g,' ').slice(0,max);}
async function json(url,options={},max=5_000_000){
  const res=await fetch(url,{...options,redirect:'error',
    headers:{'cache-control':'no-store','accept':'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(23000)});
  assert.equal(res.status,200,'read-only '+new URL(url).pathname+' status='+res.status);
  const len=n(res.headers.get('content-length'));
  assert.ok(!len||len<=max,'response too large');
  const raw=await res.text();
  assert.ok(raw.length<=max,'response too large after transfer');
  return JSON.parse(raw);
}
function tally(rows,property){return rows.reduce((out,row)=>{const key=row[property]||'unknown';out[key]=(out[key]||0)+1;return out},{})}
function stageLabels(row){return row?.figures&&typeof row.figures==='object'?Object.keys(row.figures):[];}
async function mediaInventory(chunk){
  const payload=await json(API+'/api/media/inventory',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({readOnly:true,dois:chunk})
  },3_000_000);
  assert.equal(payload?.items?.length,chunk.length,'media inventory coverage mismatch');
  const got=new Set(payload.items.map(x=>normalized(x.doi)));
  assert.ok(chunk.every(d=>got.has(d)),'read only media inventory DOI mismatch');
  return payload.items;
}
const byDoi=new Map();
try{
  const queue=await json(SITE+'/toc-demand-live.json?gapAudit='+Date.now());
  assert.ok(Array.isArray(queue.articles)&&queue.webpageDoiCount===queue.articles.length,'invalid full registry');
  assert.equal(Number(queue.mediaGeneration),1790082000000,'unexpected media generation');
  const recent=queue.articles.filter(a=>{
    const date=String(a?.addedDate||'');
    return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=CUTOFF;
  });
  assert.ok(recent.length>0,'no Oct-1+ papers in queue');
  const dois=recent.map(a=>normalized(a.doi));
  assert.equal(new Set(dois).size,dois.length,'duplicate DOI in recent queue');

  const media=[];
  for(let i=0;i<dois.length;i+=80){
    const batch=dois.slice(i,i+80);
    const left=batch.slice(0,40),right=batch.slice(40);
    const results=await Promise.all([mediaInventory(left),...(right.length?[mediaInventory(right)]:[])]);
    media.push(...results.flat());
  }
  const [staged,reports]=await Promise.all([
    json(API+'/api/article-figures/staged?inventory=1&ts='+Date.now(),6_000_000),
    json(API+'/api/media/tampermonkey-reports?limit=200&ts='+Date.now(),4_000_000)
  ]);
  assert.equal(staged.schemaVersion,'capture-inventory-v1','stage inventory not ready');
  assert.ok(staged.complete===true&&Array.isArray(staged.items),'stage inventory incomplete');
  assert.ok(Array.isArray(reports.items),'report index unavailable');
  const mediaBy=new Map(media.map(row=>[normalized(row.doi),row]));
  const stageBy=new Map(staged.items.map(row=>[normalized(row.doi),row]));
  const reportsBy=new Map(reports.items.map(row=>[normalized(row.doi),row]));

  for(const raw of recent){
    const doi=normalized(raw.doi),m=mediaBy.get(doi);
    assert.ok(m,'missing inventory row '+doi);
    const stage=stageBy.get(doi),latest=reportsBy.get(doi);
    const ids=stageLabels(stage);
    const published=n(m.figureCount),stagedUnique=ids.length;
    const expected=Math.max(n(stage?.expectedFigureCount),n(latest?.figuresDiscovered));
    const primaryKind=text(m.primaryKind,45);
    const acceptedFallback=primaryKind==='figure1'||Boolean(m.figureOneStored);
    const hasVisual=m.tocStored===true||primaryKind==='official_visual'||acceptedFallback;
    const tocGap=!hasVisual||m.suspiciousToc===true;
    const figuresUncaptured=expected>stagedUnique;
    const capturedNotPublished=stagedUnique>published;
    const figureUnknown=expected===0&&stagedUnique===0&&published===0;
    const pdfStatus=text(latest?.privatePdfStatus,42);
    const latestReason=text(latest?.reason,180);
    const pdfDenied=/private_pdf_http_40[139]|access_denied_http_40[139]/i.test(latestReason)||
      (pdfStatus==='failed'&&/pdf.*40[139]/i.test(latestReason));
    const pdfStored=pdfStatus==='stored'||pdfStatus==='already_stored';
    const pdfState=pdfStored?'reported_stored':pdfDenied?'reported_access_denied':
      pdfStatus==='failed'?'reported_failed':pdfStatus==='not_found'?'reported_not_found':
      pdfStatus==='not_requested'?'not_requested':'not_confirmed';
    const evidenceState=text(latest?.evidenceLevel||latest?.fulltextStatus,40)||'not_confirmed';
    const row={
      doi,journal:text(raw.journal||raw.journalName||'Unspecified',60),
      addedDate:String(raw.addedDate||''),tocGap,rawToc:m.tocRawStored===true,
      tocPublished:m.tocStored===true,tocReason:text(m.tocReason,65),
      suspiciousToc:m.suspiciousToc===true,acceptedFallback,
      stageFigures:stagedUnique,publishedFigures:published,expectedFigures:expected,
      figuresUncaptured,capturedNotPublished,figureUnknown,
      pdfState,evidenceState,latestStatus:text(latest?.status,36),
      lastAttemptAt:text(latest?.finishedAt,44),lastReason:latestReason
    };
    byDoi.set(doi,row);
  }
  const rows=[...byDoi.values()];
  const problems=rows.filter(r=>r.tocGap||r.figuresUncaptured||r.capturedNotPublished||r.figureUnknown||r.pdfState==='reported_access_denied'||r.pdfState==='reported_failed');
  const byJournal=new Map();
  for(const row of rows){
    const journal=row.journal;
    if(!byJournal.has(journal))byJournal.set(journal,[]);
    byJournal.get(journal).push(row);
  }
  report.journals=[...byJournal.entries()].map(([journal,records])=>({
    journal,papers:records.length,missingVisual:records.filter(r=>r.tocGap).length,
    stageIncomplete:records.filter(r=>r.figuresUncaptured).length,
    bodyUnpublished:records.filter(r=>r.capturedNotPublished).length,
    bodyUnknown:records.filter(r=>r.figureUnknown).length,
    pdfAccessDeniedObserved:records.filter(r=>r.pdfState==='reported_access_denied').length,
    pdfStoredObserved:records.filter(r=>r.pdfState==='reported_stored').length
  })).sort((a,b)=>b.missingVisual-a.missingVisual||b.bodyUnpublished-a.bodyUnpublished);
  report.summary={
    registryRows:queue.articles.length,scopedRows:rows.length,
    queueGeneratedAt:text(queue.generatedAt,60),latestAddedDate:String(queue.latestAddedDate||''),
    actualMainVisualGaps:rows.filter(r=>r.tocGap).length,
    visualCoverage:rows.filter(r=>!r.tocGap).length,
    visuallySuspicious:rows.filter(r=>r.suspiciousToc).length,
    knownFigureIncomplete:rows.filter(r=>r.figuresUncaptured).length,
    stagedButNotAllPublished:rows.filter(r=>r.capturedNotPublished).length,
    unknownBodyCoverage:rows.filter(r=>r.figureUnknown).length,
    noBodyPublished:rows.filter(r=>r.publishedFigures===0).length,
    observedPdfDenied:rows.filter(r=>r.pdfState==='reported_access_denied').length,
    observedPdfStored:rows.filter(r=>r.pdfState==='reported_stored').length,
    observedPdfFailedOther:rows.filter(r=>r.pdfState==='reported_failed').length,
    pdfCoverageUnknown:rows.filter(r=>['not_confirmed','not_requested'].includes(r.pdfState)).length,
    reportIndexAvailable:reports.items.length,stageInventoryCount:staged.count,
    importantCaveat:'PDF counts are reported latest-attempt observations, NOT the owner-authoritative authenticated PDF inventory. Stage/published figure counts are distinct and not summed.'
  };
  const score=r=>(r.tocGap?100:0)+(r.figuresUncaptured?30:0)+(r.capturedNotPublished?15:0)+
    (r.pdfState==='reported_access_denied'?8:0)+(r.figureUnknown?5:0);
  report.gaps=problems.sort((a,b)=>score(b)-score(a)||b.addedDate.localeCompare(a.addedDate)).slice(0,160);
  report.highPriorityDois=['10.1002/anie.4335022','10.1016/j.chempr.2026.103008',
    '10.1016/j.chempr.2026.103043','10.1039/d6sc06407h','10.1039/d6gc03748h',
    '10.1021/acs.joc.6c01847'].map(d=>byDoi.get(d)).filter(Boolean);
  report.result='read_only_complete';
}catch(error){
  report.result='read_only_incomplete';report.errors.push(text(error?.message||error,240));
  process.exitCode=1;
}
report.completedAt=new Date().toISOString();
const output=path.join(process.env.RUNNER_TEMP||'/tmp','tm-oct1-media-gap-matrix-live.json');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log('TM_OCT1_GAP_MATRIX '+JSON.stringify({readAt,complete:report.result,
  summary:report.summary,journals:report.journals,highPriorityDois:report.highPriorityDois,
  topMissing:(report.gaps||[]).filter(x=>x.tocGap).slice(0,28).map(x=>({
    doi:x.doi,journal:x.journal,published:x.publishedFigures,staged:x.stageFigures,
    expected:x.expectedFigures,reason:x.latestStatus+' '+x.lastReason.slice(0,85)
  })),errors:report.errors,mediaWrites:0,pdfRequests:0,publisherRequests:0}));
