import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const baseline='639957f612ee83e866a9d3b4e7fa8524618f10ff';
const original=execFileSync('git',['show',baseline+':public/toc-mainline.user.js'],{encoding:'utf8',maxBuffer:2_000_000});
const functionSource=(s,name)=>{
  const pattern=new RegExp('^  (?:async )?function '+name+'\\(','m');
  const match=pattern.exec(s);
  assert.ok(match,'missing function: '+name);
  const from=match.index;
  const rest=s.slice(from+match[0].length);
  const end=rest.indexOf('\n  }\n');
  assert.ok(end>=0,'missing exact outer closing brace after '+name);
  return s.slice(from,from+match[0].length+end+'\n  }\n'.length);
};
const protectedFunctions=[
  'articleFigureResolution','collectArticleFigureCandidates',
  'rscBodyFigureContext','collectCandidates','svgQuality',
  'waitForPairedVisuals','acquireBestVisual','privatePdfHostAllowed',
  'discoverExplicitPdfCandidates','privatePdfBytesValid',
  'waitForPrivatePdfCandidates','fetchExplicitPdf','uploadPrivatePdf'
];
for(const name of protectedFunctions){
  assert.equal(functionSource(source,name),functionSource(original,name),
    'published acquisition code unexpectedly modified: '+name);
}
assert.ok(source.includes("OCT1_SCOPE_QUEUE_REVISION = '20261008-added-date-only-v1'"));
assert.ok(source.includes("PRIVATE_PDF_INVENTORY_ENDPOINT = WORKER + '/api/private-pdf/capture-inventory'"));
assert.ok(source.includes("var scopedArticles=queue.articles.filter(recentFullCaptureEligible)"));
assert.ok(source.includes("if(!recentFullCaptureEligible(batch[i])){summary.skipped+=1;continue;}"));
assert.ok(source.includes("if(!recentFullCaptureEligible(row.job)){row.state='removed'"));
assert.ok(source.includes("captureFigures:false,"));
assert.ok(source.includes("if(String(job&&job.privatePdfServerStatus||'')!=='missing')return false"));
const context={
  console,
  RECENT_FULL_CAPTURE_CUTOFF:'2026-10-01',
  PRIVATE_PDF_ADDED_DATE_CUTOFF:'2026-10-01',
  PRIVATE_PDF_ATTEMPT_PREFIX:'osg-toc-v6:private-pdf-attempt-v2:',
  normalizeDoi:v=>String(v||'').toLowerCase().trim(),
  publisherForDoi:d=>d.startsWith('10.1038/')?'nature':'acs',
  isNatureScienceFamilyJob:j=>j.journal==='Nature'||j.journal==='Science',
  compareCaptureJobs:(a,b)=>String(b.addedDate||'').localeCompare(String(a.addedDate||'')),
  privatePdfLease:()=>({token:'fixture'}),
  GM_getValue:()=>null,
  Map,Set,Date,
};
vm.createContext(context);
const live=[
  functionSource(source,'recentFullCaptureEligible'),
  functionSource(source,'pairedJobs'),
  functionSource(source,'privatePdfCaptureEligibleByAddedDate'),
  functionSource(source,'privatePdfQueueNeeded'),
  'globalThis.T={pairedJobs,privatePdfQueueNeeded,recentFullCaptureEligible};'
].join('\n');
vm.runInContext(live,context);
const papers=Array.from({length:887},(_,i)=>({
  doi:'10.1021/jacs.6c'+String(i).padStart(5,'0'),
  journal:'JACS',
  date:'2026-10-08',
  addedDate:i<177?'2026-10-08':i<445?'2026-09-30':'',
}));
const q={articles:papers,webpageDoiCount:887,mediaGeneration:1790082000000,latestAddedDate:'2026-10-08'};
const jobs=context.T.pairedJobs(q,{items:{}});
assert.equal(jobs.length,177,'historic/undated DOI entered Oct-1 queue');
assert.ok(jobs.every(j=>j.addedDate>='2026-10-01'&&j.captureToc===true));
assert.equal(q.articles.length,887,'registry must remain intact');
assert.equal(context.T.recentFullCaptureEligible({date:'2026-10-08',addedDate:''}),false,
  'publication date must not substitute for Gallery addedDate');
assert.equal(context.T.recentFullCaptureEligible({addedDate:'2026-09-30'}),false);
assert.equal(context.T.recentFullCaptureEligible({addedDate:'2026-10-01'}),true);
for(const status of ['ready','pending','failed','unknown','']){
  assert.equal(context.T.privatePdfQueueNeeded({doi:papers[0].doi,addedDate:'2026-10-08',
    privatePdfServerStatus:status},Date.now(),true),false,
    status+' unexpectedly triggered a duplicate PDF download');
}
assert.equal(context.T.privatePdfQueueNeeded({doi:papers[0].doi,
  addedDate:'2026-10-08',privatePdfServerStatus:'missing'},Date.now(),true),true);
assert.equal(context.T.privatePdfQueueNeeded({doi:papers[500].doi,
  addedDate:'',date:'2026-10-08',privatePdfServerStatus:'missing'},Date.now(),true),false);
console.log(JSON.stringify({ok:true,protectedCaptureFunctions:protectedFunctions.length,
  registryRows:papers.length,eligible:jobs.length,excluded:papers.length-jobs.length,
  pdfInventoryStates:['ready','pending','failed','unknown','missing'],
  deploymentWrites:0}));
