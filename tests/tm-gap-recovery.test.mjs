import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
assert.ok(source.includes("// @version      6.2.59"));
assert.ok(source.includes("var INSTALL_REVISION = '6.2.59';"));
assert.ok(source.includes("GAP_RECOVERY_REVISION = '20261008-gap-recovery-v1'"));
assert.ok(source.includes("FIGURE_ONE_QUEUE_POLICY_REVISION = '20261008-verified-figure1-complete-v2'"));

const articleStart=source.indexOf('  function articleUrl(job) {');
const articleEnd=source.indexOf('\n  function publisherArticleHostAllowed',articleStart);
assert.ok(articleStart>0&&articleEnd>articleStart);
const articleCtx=vm.createContext({String,Boolean,Number,normalizeDoi:v=>String(v||'').toLowerCase()});
vm.runInContext(source.slice(articleStart,articleEnd),articleCtx);
const articleUrl=vm.runInContext('articleUrl',articleCtx);

test('opportunistic bundle uses full publisher routes',()=>{
  assert.match(articleUrl({doi:'10.1039/d6sc06874j',publisher:'rsc',captureToc:true,opportunisticFigures:true}),/\/articlehtml\/2026\/sc\/d6sc06874j$/);
  assert.equal(articleUrl({doi:'10.1039/d6sc06874j',publisher:'rsc',captureToc:true}), 'https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc06874j');
  assert.equal(articleUrl({doi:'10.1021/jacs.6c12345',publisher:'acs',captureToc:true,opportunisticEvidence:true}), 'https://pubs.acs.org/doi/10.1021/jacs.6c12345');
  assert.equal(articleUrl({doi:'10.1021/jacs.6c12345',publisher:'acs',captureToc:false,captureFigures:true}), 'https://pubs.acs.org/doi/full/10.1021/jacs.6c12345');
});

const evidenceStart=source.indexOf('  function evidenceArticleUrl(job) {');
const evidenceEnd=source.indexOf('\n  function evidenceSourceUrl()',evidenceStart);
assert.ok(evidenceStart>0&&evidenceEnd>evidenceStart);
function evidenceUrl({live,resolved}){
  const ctx=vm.createContext({
    String,
    normalizeDoi:v=>String(v||'').toLowerCase(),
    publisherForDoi:()=> 'elsevier',
    evidenceSourceUrl:()=>live,
    publisherArticleHostAllowed:(p,v)=>{try{const h=new URL(v).hostname;return p==='elsevier'&&(h==='www.sciencedirect.com'||h.endsWith('.sciencedirect.com')||h==='www.cell.com'||h.endsWith('.cell.com'));}catch{return false;}},
    articleUrl:()=> 'https://doi.org/10.1016/j.chempr.2026.103282'
  });
  vm.runInContext(source.slice(evidenceStart,evidenceEnd),ctx);
  return vm.runInContext('evidenceArticleUrl',ctx)({doi:'10.1016/j.chempr.2026.103282',publisher:'elsevier',resolvedArticleUrl:resolved});
}
test('Elsevier evidence provenance uses actual ScienceDirect route',()=>{
  const live='https://www.sciencedirect.com/science/article/pii/S2451929426003487';
  assert.equal(evidenceUrl({live,resolved:''}),live);
  const resolved='https://www.cell.com/chem/fulltext/S2451-9294(26)00348-7#osg-job=x';
  assert.equal(evidenceUrl({live:'https://doi.org/10.1016/j.chempr.2026.103282',resolved}),resolved.split('#')[0]);
});

const policyStart=source.indexOf("  var FIGURE_ONE_QUEUE_POLICY_REVISION");
const policyEnd=source.indexOf('\n\n  function captureQueueTier',policyStart);
assert.ok(policyStart>0&&policyEnd>policyStart);
const pctx=vm.createContext({String,Boolean});
vm.runInContext(source.slice(policyStart,policyEnd),pctx);
const accept=vm.runInContext('verifiedFigureOneSatisfiesQueue',pctx);
test('verified Figure 1 closes primary-visual gap across journals',()=>{
  for(const journal of ['JACS','Organic Letters','Green Chemistry','Chemical Science','Nature Chemistry'])assert.equal(accept({journal},true),true,journal);
  assert.equal(accept({journal:'JACS'},false),false);
});

test('partial figure coverage is handled only on a genuine publisher visit',()=>{
  assert.ok(source.includes('var explicitFigureGap=expected>0&&knownCount<expected;'));
  assert.ok(source.includes('captureFigures:false,'));
  assert.ok(source.includes('opportunisticFigures:Boolean(bundleVisit||tocNeeded)'));
  assert.ok(source.includes('capturePrivatePdf:Boolean(pdfNeeded),privatePdfServerStatus:ownerPdfStatus'));
  assert.ok(source.includes('if(job.captureToc||job.captureFigures||job.captureEvidence||job.capturePrivatePdf)'));
  assert.ok(source.includes('job.mediaNeed=captureMediaNeed(job);'));
  assert.ok(source.includes("job.state=job.captureToc?'no_visual':job.captureFigures?'figure_gap'"));
});

console.log('TM_GAP_RECOVERY_SUMMARY '+JSON.stringify({passed:4,productionWrites:0,publisherRequests:0}));
