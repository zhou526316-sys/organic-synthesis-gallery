import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateScopeCorrections} from './lib/scope-corrections.mjs';
const raw=JSON.parse(await readFile('audit/literature-scope-corrections.json','utf8'));
const all=validateScopeCorrections(raw);
const recent=all.filter(x=>x.source==='explicit_user_doi_decision_and_article_specific_evidence_2026-10-10');
assert.ok(recent.length>=2,'read-only registry contains recorded explicit DOI decisions');
for(const x of recent) {
 const original=JSON.stringify(x);
 assert.ok(String(x.userInstruction).includes(x.doi),'stored user instruction names DOI');
 const forged=structuredClone(raw);
 const row=forged.items.find(r=>r.doi===x.doi);
 row.userInstruction='';
 assert.throws(()=>validateScopeCorrections(forged),/recorded explicit/,'missing user instruction remains rejected');
 const changed=structuredClone(raw);
 changed.items.find(r=>r.doi===x.doi).source='machine_generated_claim_only';
 assert.throws(()=>validateScopeCorrections(changed),/recorded explicit/,'machine-generated exclusions remain rejected');
 const unsafe=structuredClone(raw);
 unsafe.items.find(r=>r.doi===x.doi).decision='include';
 assert.throws(()=>validateScopeCorrections(unsafe),/cannot add|silently defer/,'cannot turn exclusion into addition');
 assert.equal(JSON.stringify(x),original,'validator must never edit original exclusion records');
}
console.log('SCOPE_EXPLICIT_DOI_EVIDENCE_PASS '+JSON.stringify({rows:all.length,recordedRecent:recent.length,mutation:false}));
