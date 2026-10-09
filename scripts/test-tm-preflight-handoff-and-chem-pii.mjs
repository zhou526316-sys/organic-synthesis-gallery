import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const src=await readFile('public/toc-mainline.user.js','utf8');
function outer(name){
  const expression=new RegExp('^  (?:async )?function '+name+'\\(','m');
  const m=expression.exec(src);
  assert.ok(m,'Missing '+name);
  const tail=src.slice(m.index+m[0].length);
  const end=tail.indexOf('\n  }\n');
  assert.ok(end>=0,'Malformed '+name);
  return src.slice(m.index,m.index+m[0].length+end+'\n  }\n'.length);
}
const jobId='12345678-aaaa-4bbb-8999-000011112222';
const prefix='osg-toc-v6:';
const doi='10.1016/j.chempr.2026.103043';
let now=Date.parse('2026-10-09T14:00:00.000Z');
const records=new Map(),reportOutbox=[],token='not_written_or_reported';
let binding=jobId,allowed=true,reportValue;
const job={jobId,doi,version:'6.2.20',captureVersion:'6.2.20',
  captureToc:false,capturePrivatePdf:true,controllerRevision:'2.2.41',
  publisher:'elsevier',mediaNeed:'private_pdf_gap',startedAt:new Date(now-15_000).toISOString()};
records.set('active',job);
records.set('progress:'+doi,{jobId,status:'publisher_binding_wait',at:new Date(now).toISOString()});
const ctx={
  URL,Date,Number,String,Boolean,Map,Set,RegExp,console,
  nowIso:()=>new Date(now).toISOString(),
  normalizeDoi:x=>String(x||'').toLowerCase().trim(),
  captureLiveError:x=>String(x||'').slice(0,200),
  currentCaptureJob:()=>allowed,
  ACTIVE_JOB_KEY:'active',P:prefix,VERSION:'6.2.20',
  CONTROLLER_REVISION:'2.2.41',PUBLISHER_TASK_BINDING_REVISION:'20261005-interstitial-bind-v4',
  GM_getValue:(k,d)=>records.has(k)?records.get(k):d,
  GM_setValue:(k,v)=>records.set(k,v),
  GM_deleteValue:k=>records.delete(k),
  sessionStorage:{getItem:()=>binding},
  resultKey:d=>'result:'+d,
  traceKey:d=>'trace:'+d,
  progressKey:d=>'progress:'+d,
  location:{href:'https://www.sciencedirect.com/science/article/pii/S2451929426001099'},
  enqueueCaptureReport:(j,trace,status,reason,final)=>{reportOutbox.push({j,trace,status,reason,final});return true},
  publisherPageDois:()=>[],
  embeddedJobDois:url=>[...String(url||'').matchAll(/10\.[0-9]{4}\/[a-z0-9._-]+/ig)].map(x=>x[0].toLowerCase()),
  isAbortRequested:()=>false,ENABLED_KEY:'enabled',renewLease:()=>true,
  sleep:async()=>{},currentPublisherHeartbeat:()=>null,HEARTBEAT_KEY:'heartbeat',
  privatePdfLease:()=>({token:'redacted'}),
  privatePdfCaptureEligibleByAddedDate:j=>String(j.addedDate||'')>='2026-10-01',
  PRIVATE_PDF_ATTEMPT_PREFIX:'pdf:',
};
vm.createContext(ctx);
const names=['verifiedChemPublisherPii','verifiedChemPublisherPage','candidateBelongsToJob',
  'assertBoundCaptureJob','finishBoundPublisherPreflightFailure','completedPublisherResult',
  'waitForResult','privatePdfQueueNeeded','overnightRetryEligible'];
vm.runInContext(names.map(outer).join('\n'),ctx);
let checks=0;const check=(name,b)=>{assert.ok(b,name);checks++;console.log('TM_FASTFAIL_PASS '+name)};
check('exact known Chem DOI/PII route verified',
  ctx.verifiedChemPublisherPage(job,ctx.location.href)===true);
check('unknown DOI and all unrelated publisher URLs blocked',
  ctx.verifiedChemPublisherPage({...job,doi:'10.1016/j.chempr.2026.999999'},ctx.location.href)===false &&
  ctx.verifiedChemPublisherPage(job,'https://doi.org/10.1016/j.chempr.2026.103043')===false);
check('verified Chem publisher path accepts missing citation_doi',
  ctx.assertBoundCaptureJob(job)===doi);
ctx.location.href='https://www.sciencedirect.com/science/article/pii/S2451929426000744';
let fail=false;try{ctx.assertBoundCaptureJob(job)}catch(e){fail=String(e.message)==='page_doi_unverified'}
check('different verified PII cannot satisfy current Chem DOI',fail);
ctx.location.href='https://www.sciencedirect.com/science/article/pii/S2451929426001099';
check('same DOI Elsevier image PII accepted',
  ctx.candidateBelongsToJob('https://ars.els-cdn.com/content/image/1-s2.0-S2451929426001099-gr1.jpg',job));
check('different Elsevier source PII rejected',
  !ctx.candidateBelongsToJob('https://ars.els-cdn.com/content/image/1-s2.0-S2451929426000744-gr1.jpg',job));
check('explicit foreign DOI on image URL rejected',
  !ctx.candidateBelongsToJob('https://pubs.rsc.org/doi/10.1039/d6sc06407h',job));
const failJob={...job};
ctx.finishBoundPublisherPreflightFailure(failJob,new Error('page_doi_unverified'));
const terminal=records.get('result:'+doi);
check('page guard writes exact same-job terminal result without 8-minute waiting',
  terminal?.jobId===jobId&&terminal?.status==='failed'&&terminal?.reason==='page_doi_unverified'&&
  terminal?.version==='6.2.20'&&terminal?.finishedAt==='2026-10-09T14:00:00.000Z');
check('terminal result is directly observed by controller',
  ctx.completedPublisherResult(job)?.status==='failed');
const instant=await ctx.waitForResult(job,{closed:false});
check('controller wait returns terminal publisher error immediately',
  instant?.jobId===jobId&&instant?.reason==='page_doi_unverified');
check('diagnostic outbox retained and no media or private PDF action performed',
  reportOutbox.length===1&&reportOutbox[0].final===true&&
  records.get('trace:'+doi)?.status==='failed'&&!records.has('progress:'+doi) &&
  !JSON.stringify([...records.values()]).includes(token));
records.delete('result:'+doi);
binding='other-job-id';const recorded=reportOutbox.length;
check('foreign browser tab cannot poison active DOI result',
  ctx.finishBoundPublisherPreflightFailure(job,new Error('page_doi_mismatch'))===false &&
  reportOutbox.length===recorded&&!records.has('result:'+doi));
binding=jobId;allowed=false;
check('revoked or replaced job cannot publish late failure',
  ctx.finishBoundPublisherPreflightFailure(job,new Error('page_doi_unverified'))===false &&
  !records.has('result:'+doi));
allowed=true;
const prior={doi,status:'failed',reason:'page_doi_unverified',
  finishedAt:new Date(now-30*60*1000).toISOString()};
check('unverified publisher page gets long backoff rather than immediate repeat',
  ctx.overnightRetryEligible(prior,now)===false);
prior.finishedAt=new Date(now-7*60*60*1000).toISOString();
check('failed DOI becomes retryable on later run',
  ctx.overnightRetryEligible(prior,now)===true);
const pdf={doi,addedDate:'2026-10-09',privatePdfServerStatus:'missing'};
records.set('pdf:'+doi,{status:'failed',reason:'private_pdf_http_403',at:now-2*60*60*1000});
check('explicit PDF 403 does not reopen publisher within six hours',
  ctx.privatePdfQueueNeeded(pdf,now)===false);
check('manual owner confirmation may explicitly retry PDF once',
  ctx.privatePdfQueueNeeded(pdf,now,true)===true);
check('PDF 403 can be retried after six hours',
  ctx.privatePdfQueueNeeded(pdf,now+7*60*60*1000)===true);
records.set('pdf:'+doi,{status:'failed',reason:'gm_request_timeout',at:now-40*60*1000});
check('transient non-permission PDF errors use shorter cooldown',
  ctx.privatePdfQueueNeeded(pdf,now)===true);
check('existing ready PDF remains excluded by server inventory',
  ctx.privatePdfQueueNeeded({...pdf,privatePdfServerStatus:'ready'},now)===false);
check('RSC native AJAX source proof survives bounded final-report truncation',
  src.includes("e.stage==='rsc_native_abstract_ajax'") &&
  src.includes("important.concat(rscAjax,recent)"));
check('page gate calls terminal publisher handoff instead of async report-only',
  outer('finishBoundPublisherPreflightFailure').includes('GM_setValue(resultKey(job.doi),terminal)') &&
  outer('publisherBoot').includes('finishBoundPublisherPreflightFailure(job,error)') &&
  !outer('publisherBoot').includes('await uploadReport(job'));
console.log('TM_FASTFAIL_TEST_SUMMARY '+JSON.stringify({
  passed:checks,ownerPublisherRequests:0,productionWrites:0,noMediaMutation:true,
  protocol:'6.2.20',controller:'2.2.41',blockedPublisherExpectedFailure:true}));
