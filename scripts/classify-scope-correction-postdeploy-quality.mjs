import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';

const norm = v => String(v||'').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'').replace(/[?#].*$/,'');
const unique = list => Array.isArray(list) && list.length === new Set(list).size;
const sorted = list => [...list].sort();
const equalSet = (a,b) => unique(a) && unique(b) && a.length===b.length && a.every(x=>b.includes(x));
const onlyAllowedFailure='discovery: unresolved DOI is neither formal pending nor reviewed next-slot carryover';
const fail = msg => {throw new Error('scope_quality_classification:'+msg)};
export function classifyScopeCorrectionQuality({quality,marker,registry,audit,compact,state}){
  assert.equal(marker?.mode,'scope-correction','not deletion-only mode');
  assert.equal(marker?.schemaVersion,3,'unknown correction schema');
  assert.equal(marker?.releasePolicy,'deletion-only');
  assert.equal(marker?.productionCards,state?.lastWebsiteSync?.verification?.galleryDois,'live count unverified');
  assert.equal(state?.lastScopeCorrection?.id,marker.correctionId,'wrong correction');
  assert.equal(state?.lastScopeCorrection?.status,'verified','deletion receipt not verified');
  const removed=(marker.removedDois||[]).map(norm);
  assert(removed.length && unique(removed),'bad removed set');
  const prior=(marker.previousProductionCards||0);
  assert(prior-marker.productionCards===removed.length,'production cardinality');
  const included=(marker.publishableDois||[]).map(norm);
  assert(included.length===0,'deletion attempt admits DOI');
  const byRegistry=new Map((registry.items||[]).map(x=>[norm(x.doi),x]));
  for(const doi of removed)assert.equal(byRegistry.get(doi)?.decision,'exclude','missing lasting exclusion');
  assert(audit?.generatedAt && audit.generatedAt===compact?.generatedAt,'paired audit mismatch');
  const missing=(audit.missingCandidates||[]),known=missing.map(x=>norm(x.doi));
  assert(unique(known),'duplicate missing DOI');
  assert(audit.summary?.unresolved===missing.length,'audit unresolved count mismatch');
  assert(compact.summary?.unresolved===(compact.unresolved||[]).length,'compact unresolved count mismatch');
  assert(equalSet(known,(compact.unresolved||[]).map(x=>norm(x.doi))),'paired DOI mismatch');
  const pending=(state.pendingReviewBacklog||[]).map(x=>norm(x.doi));
  assert(unique(pending)&&pending.every(doi=>known.includes(doi)),'existing pending lost');
  const correctionCandidates=missing.filter(z=>removed.includes(norm(z.doi)));
  assert(equalSet(correctionCandidates.map(z=>norm(z.doi)),removed),'withdrawn DOI missing from expected snapshot');
  for(const z of correctionCandidates){
    assert.equal(z.scopeCorrection?.decision,'exclude','withdrawn DOI not labeled corrected');
  }
  const trulyUnreviewed=missing.filter(z=>!removed.includes(norm(z.doi))&&!pending.includes(norm(z.doi)));
  const unreviewedDois=trulyUnreviewed.map(z=>norm(z.doi));
  assert(unique(unreviewedDois),'duplicate unreviewed');
  const failures=quality?.failures;
  assert(Array.isArray(failures),'invalid quality report');
  const qualityOk=quality.ok===true&&failures.length===0;
  if(!qualityOk){
    assert(!quality.ok,'failed quality flagged successful');
    assert(equalSet(failures,[onlyAllowedFailure]),'unexpected global quality failure; no bypass');
    assert(unreviewedDois.length>0,'failure lacks actual unreviewed DOI');
  }else assert(unreviewedDois.length===0,'unreviewed DOI and passing quality incompatible');
  const sourceFresh=Number(audit.summary.galleryDois)===marker.productionCards;
  // The current audit was captured during deletion before Pages was updated.
  // A stale scan must not be promoted into a full-coverage claim.
  assert(Number.isInteger(audit.summary.galleryDois)&&audit.summary.galleryDois>=marker.productionCards
    &&audit.summary.galleryDois<=prior,'audit catalog count outside allowable in-flight snapshot');
  return {
    schemaVersion:1,correctionId:marker.correctionId,mode:'deletion_only_verified_independently',
    deliveryVerified:true,repoAndDeployedCards:marker.productionCards,
    removedDois:sorted(removed),originalPendingDois:sorted(pending),
    unreviewedDois:sorted(unreviewedDois),
    unreviewedCandidates:trulyUnreviewed.map(z=>({doi:norm(z.doi),title:z.title,journal:z.journal,date:z.date||null})),
    auditGeneratedAt:audit.generatedAt,auditCatalogCount:audit.summary.galleryDois,
    auditFreshForDeletion:sourceFresh,qualityGateOk:qualityOk,
    qualityGateStatus:qualityOk?'passed':'unreviewed_discovery_not_closed',
    qualityGateFailures:failures,
    warnings:quality.warnings||[],
    noNewAdmissions:true,formalPublicationSlot:marker.lastFixedPublicationSlot,
    note:'The 4 DOI deletion and published DOI-set parity are verified. An unrelated unresolved discovery candidate is not automatically approved, excluded, or treated as a formal pending review. Do not advance verifiedThrough. Refresh paired audit and finish scope review separately.'
  };
}
async function main(){
  const root=process.cwd();
  const sentinel='/tmp/scope-correction-state-finalized.json';
  try{await access(sentinel)}catch{
    console.log(JSON.stringify({ok:true,skipped:true,reason:'no_pending_verified_correction'}));return;
  }
  const read=async file=>JSON.parse(await readFile(path.resolve(root,file),'utf8'));
  const [quality,marker,registry,audit,compact,state]=await Promise.all([
    read(process.argv[2]||'/tmp/scope-correction-quality.json'),
    read('audit/publication-release-state.json'),
    read('audit/literature-scope-corrections.json'),
    read('audit/latest.json'),
    read('audit/unresolved-latest.json'),
    read('audit/literature-update-state.json'),
  ]);
  const result=classifyScopeCorrectionQuality({quality,marker,registry,audit,compact,state});
  const file='audit/scope-rechecks/'+marker.correctionId+'-global-quality.json';
  await mkdir(path.dirname(file),{recursive:true});
  await writeFile(file,JSON.stringify({...result,classifiedAt:new Date().toISOString()},null,2)+'\n');
  state.lastScopeCorrection={...state.lastScopeCorrection,postRemovalQuality:{
    status:result.qualityGateStatus,reportFile:file,auditGeneratedAt:result.auditGeneratedAt,
    auditFreshForDeletion:result.auditFreshForDeletion,unreviewedDois:result.unreviewedDois,
    originalPendingDois:result.originalPendingDois,
    globalQualityGateOk:result.qualityGateOk,
    note:'Deletion independently verified; full literature discovery and scope review remain open.'
  }};
  if(!result.qualityGateOk){
    state.reviewComplete=false;
    state.verifiedThrough=state.verifiedThrough||null;
  }
  await writeFile('audit/literature-update-state.json',JSON.stringify(state,null,2)+'\n');
  await writeFile('/tmp/scope-postdelete-quality-classified.json',JSON.stringify({file,...result},null,2)+'\n');
  console.log(JSON.stringify({ok:true,globalQualityGateOk:result.qualityGateOk,
    mode:'deletion_evidence_persistable_without_false_global_closure',
    unreviewedDois:result.unreviewedDois,reportFile:file}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  main().catch(e=>{console.error(e);process.exitCode=1});
}
