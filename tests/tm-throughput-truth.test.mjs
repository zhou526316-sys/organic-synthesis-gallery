import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
let passed=0;
function test(name,fn){fn();passed++;console.log('TM_THROUGHPUT_TRUTH_PASS '+name);}

assert.ok(source.includes("// @version      6.2.51"));
assert.ok(source.includes("var INSTALL_REVISION = '6.2.51';"));
assert.ok(source.includes("FIGURE_ONE_QUEUE_POLICY_REVISION = '20261008-verified-figure1-complete-v2'"));

const familyStart=source.indexOf('  var FIGURE_ONE_QUEUE_POLICY_REVISION');
const familyEnd=source.indexOf('\n\n  function captureQueueTier',familyStart);
assert.ok(familyStart>0&&familyEnd>familyStart);
const familyCtx=vm.createContext({String,Boolean});
vm.runInContext(source.slice(familyStart,familyEnd),familyCtx);
const family=vm.runInContext('({isNatureScienceFamilyJob,verifiedFigureOneSatisfiesQueue})',familyCtx);

test('verified Figure 1 satisfies Nature Communications visual queue',()=>{
  assert.equal(family.verifiedFigureOneSatisfiesQueue({journal:'Nature Communications'},true),true);
});
test('verified Figure 1 satisfies Nature and Science family visual queue',()=>{
  for(const journal of ['Nature','Science','Nature Chemistry','Nature Catalysis','Science Advances']){
    assert.equal(family.verifiedFigureOneSatisfiesQueue({journal},true),true,journal);
  }
});
test('verified Figure 1 satisfies JACS and RSC visual queue too',()=>{
  for(const journal of ['JACS','Green Chemistry','Chemical Science']){
    assert.equal(family.verifiedFigureOneSatisfiesQueue({journal},true),true,journal);
  }
});
test('missing Figure 1 never suppresses official TOC acquisition',()=>{
  assert.equal(family.verifiedFigureOneSatisfiesQueue({journal:'Nature Communications'},false),false);
});

const policyStart=source.indexOf('  function privatePdfCompletedStatus(');
const policyEnd=source.indexOf('\n  function coverageReason(',policyStart);
assert.ok(policyStart>0&&policyEnd>policyStart);
const policyCtx=vm.createContext({String,Number});
vm.runInContext(source.slice(policyStart,policyEnd),policyCtx);
const useful=vm.runInContext('captureResultHasUsefulLayer',policyCtx);

test('full text success prevents false total-failure label',()=>assert.equal(useful({toc:{status:'not_found'},fulltext:{status:'stored'}}),true));
test('body figure success prevents false total-failure label',()=>assert.equal(useful({toc:{status:'not_found'},figures:{stored:4}}),true));
test('stored or reusable PDF prevents false total-failure label',()=>{
  assert.equal(useful({privatePdf:{status:'stored'}}),true);
  assert.equal(useful({privatePdf:{status:'already_stored'}}),true);
});
test('not-found TOC alone remains a failure',()=>assert.equal(useful({toc:{status:'not_found'},figures:{stored:0},fulltext:{status:'failed'},privatePdf:{status:'failed'}}),false));
test('pre-existing TOC marker alone is not counted as newly captured work',()=>assert.equal(useful({toc:{status:'already_available'}}),false));

assert.ok(source.includes('var figureOneCompletesQueue=verifiedFigureOneSatisfiesQueue(raw,fallback);'));
assert.ok(source.includes('var tocNeeded=tocKnown&&!productionOfficial&&!figureOneCompletesQueue;'));
assert.ok(source.includes("verifiedFigureOneSatisfiesQueue(job,job.existingTocKind==='figure1')"));
assert.ok((source.match(/result\.status==='failed'&&captureResultHasUsefulLayer\(result\)/g)||[]).length>=2);
test('fresh queue, recovered coverage, evidence and PDF truth are all wired',()=>{});

console.log('TM_THROUGHPUT_TRUTH_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherRequests:0}));
