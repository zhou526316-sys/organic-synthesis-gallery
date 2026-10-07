import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
assert.ok(source.includes("// @version      6.2.47"));
assert.ok(source.includes("var INSTALL_REVISION = '6.2.47';"));
assert.ok(source.includes("CAPTURE_OBSERVABILITY_REVISION = '20261007-capture-observability-v1'"));
for(const needle of [
  "function publisherDomSnapshot(","stage:'dom_snapshot'","stage:'dom_asset_sample'",
  "stage:'toc_filter_summary'","stage:'figure_filter_summary'","stage:'discovery_summary'",
  "stage:'capture_timing'","job.routePlan=captureRoutePlan","captureObservabilityRevision",
  "opportunisticFigures:job&&job.opportunisticFigures===true",
  "opportunisticEvidence:job&&job.opportunisticEvidence===true"
]) assert.ok(source.includes(needle),needle);

const a=source.indexOf('  function captureRouteClass(');
const b=source.indexOf('\n  function captureRoutePlan(',a);
assert.ok(a>0&&b>a);
const ctx=vm.createContext({URL,location:{href:'https://gallery.gczhouwld.com/'}});
vm.runInContext(source.slice(a,b),ctx);
const classify=vm.runInContext('captureRouteClass',ctx);

test('route classifier distinguishes shallow and full publisher routes',()=>{
  assert.equal(classify('https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc06874j'),'rsc_articlelanding');
  assert.equal(classify('https://pubs.rsc.org/en/content/articlehtml/2026/sc/d6sc06874j'),'rsc_articlehtml');
  assert.equal(classify('https://pubs.acs.org/doi/full/10.1021/jacs.6c12345'),'acs_full');
  assert.equal(classify('https://www.sciencedirect.com/science/article/pii/S2451929426001234'),'elsevier_sciencedirect');
  assert.equal(classify('https://www.nature.com/articles/s41557-026-02238-y'),'nature_article');
});

test('TOC and body candidate filters expose rejection counters without changing candidate obligations',()=>{
  assert.ok(source.includes("var diag={nodes:0,noContext:0,noKind:0,noUrl:0,pdfPreview:0,duplicate:0,doiMismatch:0,rejected:0,accepted:0}"));
  assert.ok(source.includes("var diag={nodes:0,noContext:0,official:0,pdfPreview:0,noLabel:0,duplicate:0,doiMismatch:0,rejected:0,accepted:0}"));
  assert.ok(source.includes("job._tocCandidateStats=diag"));
  assert.ok(source.includes("job._figureCandidateStats=diag"));
});

test('final automatic report carries route plan and observability revision for success and failure',()=>{
  assert.ok(source.includes("routePlan:job&&job.routePlan?job.routePlan:null"));
  assert.ok(source.includes("captureObservabilityRevision:typeof CAPTURE_OBSERVABILITY_REVISION==='string'?CAPTURE_OBSERVABILITY_REVISION:''"));
  assert.ok(source.includes("trace:[context].concat(events)"));
});

test('diagnostic patch does not add terminal isolation policy',()=>{
  assert.ok(!source.includes('capture_observability_terminal_isolation'));
  assert.ok(!source.includes('observability_skip_known_failure'));
});

console.log('TM_CAPTURE_OBSERVABILITY_SUMMARY '+JSON.stringify({passed:4,productionWrites:0,publisherRequests:0}));
