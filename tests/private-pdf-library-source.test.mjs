import assert from 'node:assert/strict';
import test from 'node:test';
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';
import {DATA_FILES,collectPapers,assertPartition} from '../scripts/pages-release-delivery.mjs';
import {isExcludedDoi} from '../shared/literature-policy.js';
test('all published supplementary sources are included in audit union, not only recent papers',()=>{
 const early={doi:'10.1021/jacs.6c00123',journal:'JACS',addedDate:'2026-07-01'};
 const late={doi:'10.1038/s41467-026-78405-z',journal:'Nature Communications',addedDate:'2026-10-10'};
 const files={
  'papers.gz.b64':gzipSync(JSON.stringify([early])).toString('base64'),
  'rolling-supplement.json':JSON.stringify({papers:[late]})
 };
 assert(DATA_FILES.includes('papers.gz.b64') && DATA_FILES.includes('rolling-supplement.json'));
 const dataset=collectPapers(files,isExcludedDoi);
 assert.equal(dataset.size,2);
 assertPartition({productionCards:2,publishableDois:[early.doi,late.doi],rejectedDois:[],deferredDois:[]},[...dataset.keys()]);
});
test('actual main repository publication snapshot is complete before audit',()=>{
 const files=Object.fromEntries(DATA_FILES.map(name=>[
  name,fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),
 ]));
 const marker=JSON.parse(fs.readFileSync(
  new URL('../audit/publication-release-state.json',import.meta.url),'utf8'));
 const all=collectPapers(files,isExcludedDoi);
 assertPartition(marker,[...all.keys()]);
 assert(all.size>=1);
});
test('runtime refuses to expose private tokens or raw PDF content in summary',()=>{
 const source=fs.readFileSync(new URL('../scripts/audit-private-pdf-library.mjs',import.meta.url),'utf8');
 assert.match(source,/const token = String\(process\.env\.BRIDGE_WRITE_TOKEN/);
 assert.match(source,/report\.probed/);
 assert.match(source,/private-pdf\/audit\/\x27\+command/);
 assert.doesNotMatch(source,/console\.log\(.*token\b/);
 assert.match(source,/assertPartition\(marker,\[\.\.\.papers\.keys\(\)\]\)/);
});
