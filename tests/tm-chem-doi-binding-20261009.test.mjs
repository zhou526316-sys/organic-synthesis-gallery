import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const code=fs.readFileSync('public/toc-mainline.user.js','utf8');
function extract(name){
 const m=new RegExp('^  (?:async )?function '+name+'\\(','m').exec(code);
 assert.ok(m,'missing function '+name);
 const end=code.indexOf('\n  }\n',m.index);
 assert.ok(end>m.index,'missing function closure '+name);
 return code.slice(m.index,end+5);
}
const DOI='10.1016/j.chempr.2026.103220',P='osg-toc-v6:';
const job={doi:DOI,jobId:'12345678-1234-4234-a234-123456789012',publisher:'elsevier',captureToc:true,
  startedAt:'2026-10-08T17:00:00Z',captureVersion:'6.2.20'};
function harness({publisher='elsevier',reason='page_doi_unverified',binding=true,active=true,prior=false}={}){
 const store=new Map(),reports=[],apiReports=[],events=[];
 let ran=0,slept=0,heartbeats=0;
 const j={...job,publisher,startedAt:new Date().toISOString()};
 const ctx={
  String,Number,Boolean,Date,JSON,Math,console,
  P,VERSION:'6.2.20',CONTROLLER_REVISION:'2.2.41',INSTALL_REVISION:'6.2.54',
  ACTIVE_JOB_KEY:P+'active-job',
  location:{hostname:'www.sciencedirect.com',href:'https://www.sciencedirect.com/science/article/pii/S2451929426003220'},
  sessionStorage:{getItem:()=>binding?j.jobId:'unrelated-job-id'},
  GM_getValue:(k,d)=>store.has(k)?store.get(k):d,
  GM_setValue:(k,v)=>store.set(k,v),
  GM_deleteValue:k=>store.delete(k),
  normalizeDoi:d=>String(d||'').trim().toLowerCase(),
  publisherForDoi:()=>publisher,
  currentCaptureJob:()=>active,
  completedPublisherResult:()=>prior?{status:'success',jobId:j.jobId}:null,
  controllerPaused:()=>false,
  traceKey:doi=>P+'trace:'+doi,
  progressKey:doi=>P+'progress:'+doi,
  resultKey:doi=>P+'result:'+doi,
  nowIso:()=> '2026-10-08T17:10:00.000Z',
  pushTrace:(trace,event)=>{trace.push(event);events.push(event)},
  enqueueCaptureReport:(...args)=>reports.push(args),
  uploadReport:async(...args)=>{apiReports.push(args);return true},
  bindPublisherCaptureJob:async()=>{throw Error(reason)},
  writeToken:()=> '测试写入密钥占位符',
  writePublisherHeartbeat:()=>{heartbeats++},
  sleep:async()=>{slept++},
  runPublisherJob:async()=>{ran++}
 };
 store.set(P+'active-job',j);
 vm.createContext(ctx);
 vm.runInContext(extract('finalizeBoundElsevierDoiFailure')+
   '\n'+extract('publisherBoot')+
   '\n globalThis.T={finalizeBoundElsevierDoiFailure,publisherBoot};',ctx);
 return {ctx,store,reports,apiReports,events,job:j,counts:()=>({ran,slept,heartbeats})};
}

test('genuinely bound Elsevier DOI-less article closes in a verified failed result, not 8-minute wait',async()=>{
 const x=harness();
 await x.ctx.T.publisherBoot();
 const result=x.store.get(P+'result:'+DOI);
 assert.ok(result);
 assert.equal(result.doi,DOI);
 assert.equal(result.jobId,x.job.jobId);
 assert.equal(result.version,'6.2.20');
 assert.equal(result.controllerRevision,'2.2.41');
 assert.equal(result.status,'failed');
 assert.equal(result.reason,'page_doi_unverified');
 assert.equal(result.toc.status,'not_requested','DOI-less page cannot claim missing TOC');
 assert.equal(result.figures.status,'not_requested');
 assert.equal(x.reports.length,1);
 assert.equal(x.reports[0][4],true,'final report must be durable');
 assert.equal(x.apiReports.length,0,'no duplicate non-final telemetry for same task');
 assert.equal(x.counts().ran,0);
 assert.equal(x.counts().slept,0);
 assert.ok(x.events.some(e=>e.event==='bound_publisher_doi_unverified'));
});

test('an unrelated publisher tab cannot finish or report another DOI task',async()=>{
 const x=harness({binding:false});
 await x.ctx.T.publisherBoot();
 assert.equal(x.store.has(P+'result:'+DOI),false);
 assert.equal(x.reports.length,0);
 assert.equal(x.apiReports.length,0);
});

test('superseded manual or automatic controller job cannot post any terminal failure',async()=>{
 const x=harness({active:false});
 await x.ctx.T.publisherBoot();
 assert.equal(x.store.has(P+'result:'+DOI),false);
 assert.equal(x.reports.length,0);
});

test('incorrect DOI is a separate provenance failure and must not be treated as DOI-less Chem',()=>{
 const x=harness({reason:'page_doi_mismatch'});
 assert.equal(x.ctx.T.finalizeBoundElsevierDoiFailure(x.job,Error('page_doi_mismatch')),false);
 assert.equal(x.store.has(P+'result:'+DOI),false);
});
test('existing actual publisher success result is never overwritten by late page-binding error',()=>{
 const x=harness({prior:true});
 assert.equal(x.ctx.T.finalizeBoundElsevierDoiFailure(x.job,Error('page_doi_unverified')),false);
 assert.equal(x.store.has(P+'result:'+DOI),false);
});
test('RSC Silverchair DOI-less page does not inherit Chem-specific completion rule',()=>{
 const x=harness({publisher:'rsc'});
 assert.equal(x.ctx.T.finalizeBoundElsevierDoiFailure(x.job,Error('page_doi_unverified')),false);
 assert.equal(x.store.has(P+'result:'+DOI),false);
});
test('successful Elsevier binding proceeds to ordinary legitimate publisher capture',async()=>{
 const x=harness();
 x.ctx.bindPublisherCaptureJob=async()=>true;
 await x.ctx.T.publisherBoot();
 assert.equal(x.counts().ran,1);
 assert.equal(x.counts().heartbeats,2);
 assert.equal(x.reports.length,0);
 assert.equal(x.store.has(P+'result:'+DOI),false);
});
test('no image, PDF, authorization or media byte is present in synthetic terminal diagnostic',async()=>{
 const x=harness();
 await x.ctx.T.publisherBoot();
 const state=JSON.stringify([...x.store]);
 assert.ok(!state.includes('测试写入密钥占位符'));
 assert.ok(!state.includes('Signature='));
 assert.ok(!state.includes('imageData'));
 assert.ok(!state.includes('pdfData'));
 assert.ok(x.reports[0][2]==='failed');
});


function crossrefHarness({recordDoi=DOI,primary='https://linkinghub.elsevier.com/retrieve/pii/S245192942600286X',responseStatus=200}={}){
 const store=new Map(),reads=[];
 const message={message:{DOI:recordDoi,resource:{primary:{URL:primary}}}};
 const ctx=vm.createContext({
   URL,JSON,Date,Math,Number,String,RegExp,encodeURIComponent,
   P,GM_getValue:(key,fallback)=>store.has(key)?store.get(key):fallback,
   GM_setValue:(key,value)=>store.set(key,value),
   normalizeDoi:d=>String(d||'').trim().toLowerCase(),
   publisherForDoi:()=> 'elsevier',
   publisherArticleHostAllowed:(publisher,url)=>publisher==='elsevier'&&String(url).startsWith('https://www.sciencedirect.com/science/article/pii/'),
   gmRequest:async options=>{
     reads.push(options);
     return {status:responseStatus,responseText:JSON.stringify(message)};
   }
 });
 vm.runInContext(extract('elsevierCrossrefVerifiedArticleUrl')+
  '\n globalThis.route=elsevierCrossrefVerifiedArticleUrl;',ctx);
 return {ctx,reads,store};
}
test('exact Chem DOI Crossref PII resolves to authentic publisher article route and caches result',async()=>{
 const x=crossrefHarness();
 const expected='https://www.sciencedirect.com/science/article/pii/S245192942600286X';
 assert.equal(await x.ctx.route({doi:DOI,publisher:'elsevier'}),expected);
 assert.equal(x.reads.length,1);
 assert.equal(x.reads[0].url,'https://api.crossref.org/works/'+encodeURIComponent(DOI));
 assert.equal(x.reads[0].timeout,9000);
 assert.equal(await x.ctx.route({doi:DOI,publisher:'elsevier'}),expected);
 assert.equal(x.reads.length,1,'valid DOI-bound public metadata is reused, no second Crossref request');
});
test('different Crossref DOI, fabricated PII or non-Elsevier host cannot become a Chem article link',async()=>{
 for(const source of [
  {recordDoi:'10.1016/j.chempr.2026.103282'},
  {primary:'https://publisher.evil.example/retrieve/pii/S245192942600286X'},
  {primary:'https://linkinghub.elsevier.com/retrieve/pii/SINVALID'},
  {primary:'http://linkinghub.elsevier.com/retrieve/pii/S245192942600286X'},
  {responseStatus:403}
 ]){
  const x=crossrefHarness(source);
  assert.equal(await x.ctx.route({doi:DOI,publisher:'elsevier'}),'');
  assert.equal(x.store.size,0);
 }
});
test('second real Chem DOI uses publisher-registered distinct PII, not a shared template path',async()=>{
 const x=crossrefHarness({recordDoi:'10.1016/j.chempr.2026.103282',primary:'https://linkinghub.elsevier.com/retrieve/pii/S2451929426003487'});
 const url=await x.ctx.route({doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier'});
 assert.equal(url,'https://www.sciencedirect.com/science/article/pii/S2451929426003487');
 assert.notEqual(url,'https://www.sciencedirect.com/science/article/pii/S245192942600286X');
});
test('DOI route resolver invokes the verified Crossref fallback only when original DOI redirect has no publisher page',async()=>{
 const ctx=vm.createContext({
   String,Number,Boolean,JSON,URL,Math,Date,
   normalizeDoi:v=>String(v||'').toLowerCase(),
   publisherForDoi:()=> 'elsevier',
   articleUrl:j=>'https://doi.org/'+j.doi,
   elsevierResolvedPublisherUrl:()=> '',
   gmRequest:async options=>({status:403,finalUrl:'https://doi.org/'+DOI,responseText:''}),
   elsevierCrossrefVerifiedArticleUrl:async()=> 'https://www.sciencedirect.com/science/article/pii/S245192942600286X'
 });
 vm.runInContext(extract('resolvePublisherTaskUrl')+
  '\n globalThis.run=resolvePublisherTaskUrl;',ctx);
 assert.equal(await ctx.run({doi:DOI,publisher:'elsevier'}),
  'https://www.sciencedirect.com/science/article/pii/S245192942600286X');
});
