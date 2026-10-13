import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ID = 'owner-2026-10-13-seven-dois-single-catchup';
export const SLOT = '2026-10-13T08:00:00+08:00';
export const AUTH = 'audit/owner-catchup/2026-10-13-title-decisions.json';
export const REVIEW = 'audit/review-2026-10-13-owner-catchup.json';
export const STAGING = 'audit/prepublish-review-2026-10-13-owner-catchup.json';
export const MARKER = 'audit/publication-release-state.json';
export const PROTECTED = ['public/papers.gz.b64','public/total-synthesis.json','public/manual-supplement.json','public/final-audit-supplement.json','public/curated-supplement.json','public/automation-supplement.json','public/rolling-supplement.json','shared/literature-policy.js'];
export const INCLUDED = ['10.1038/s44160-026-01189-z','10.1021/acs.orglett.6c04027','10.1021/acs.orglett.6c03617','10.31635/ccschem.026.202608252','10.1021/acs.orglett.6c03893'];
export const EXCLUDED = ['10.31635/ccschem.026.202608292','10.31635/ccschem.026.202607973'];
export const ALL = [...INCLUDED,...EXCLUDED];
const normalize = v => String(v || '').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'').replace(/[?#].*$/,'');
export const exactSet = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && a.every(x => b.includes(x));
const parse = s => JSON.parse(String(s));
export const decode = (name,s) => {
  const x = parse(name.endsWith('.gz.b64') ? gunzipSync(Buffer.from(String(s).trim(),'base64')).toString('utf8') : s);
  const rows = Array.isArray(x) ? x : x?.papers;
  if (!Array.isArray(rows)) throw new Error('invalid_protected_dataset:' + name);
  return rows;
};
export function validateOwnerSource(authority,compact,audit,review,staging) {
  const f=[],ok=(v,s)=>{if(!v)f.push(s)};
  ok(authority?.ownerApprovalId===ID && authority.oneTimeOnly===true && authority.noNewPublicationSchedule===true,'untrusted_owner_override');
  ok(authority.originalSlot===SLOT,'wrong_original_slot');
  ok(exactSet((authority.approved||[]).map(v=>normalize(v.doi)),INCLUDED),'owner_include_mismatch');
  ok(exactSet((authority.excluded||[]).map(v=>normalize(v.doi)),EXCLUDED),'owner_exclude_mismatch');
  ok(authority.userInstruction?.includes('1. 氧杂环丁烷→硫杂环丁烷：纳入') && authority.userInstruction?.includes('7. 卤键活化催化策略：纳入'),'owner_instruction_missing');
  ok(compact?.generatedAt && compact.generatedAt===audit?.generatedAt,'mixed_audit_generation');
  ok(compact?.summary?.galleryDois===979 && audit?.summary?.galleryDois===979,'not_original_979_snapshot');
  ok(compact?.summary?.unresolved===7 && audit?.summary?.unresolved===7 && compact?.unresolved?.length===7,'unresolved_count_mismatch');
  ok(exactSet((compact?.unresolved||[]).map(x=>normalize(x.doi)),ALL),'unreviewed_or_unknown_doi');
  for(const k of ['criticalSourceFailures','sourceFamilyGaps','historicalCoverageLosses'])
    ok(compact?.summary?.[k]===0 && audit?.summary?.[k]===0,'source_health_'+k);
  const rc=review?.accepted||[],rx=review?.rejected||[],rp=review?.pending||[];
  ok(exactSet(rc.map(x=>normalize(x.doi)),INCLUDED)&&exactSet(rx.map(x=>normalize(x.doi)),EXCLUDED)&&rp.length===0,'review_partition_mismatch');
  ok(review?.publicationSlot===SLOT && review?.ownerAuthorizationId===ID && review?.reviewType==='one_time_owner_title_override','review_owner_scope_invalid');
  ok(review?.summary?.reviewed===7&&review?.summary?.accepted===5&&review?.summary?.rejected===2&&review?.summary?.pending===0,'review_summary_invalid');
  ok(review?.qualityControl?.secondPassCompleted===true && review?.qualityControl?.unresolvedDisagreements===0,'review_prior_pass_or_override_not_recorded');
  ok(staging?.publicationSlot===SLOT && staging?.handoffGeneratedAt===compact?.generatedAt && staging?.ownerAuthorizationId===ID,'staging_provenance_invalid');
  ok(exactSet((staging?.decisions||[]).filter(x=>x.decision==='include').map(x=>normalize(x.doi)),INCLUDED),'staging_include_invalid');
  ok(exactSet((staging?.decisions||[]).filter(x=>x.decision==='exclude').map(x=>normalize(x.doi)),EXCLUDED),'staging_exclude_invalid');
  ok(staging?.decisions?.length===7,'staging_incomplete');
  for(const row of [...rc,...rx]){
    const doi=normalize(row.doi),src=(compact?.unresolved||[]).find(x=>normalize(x.doi)===doi);
    ok(!!src&&src.dateUnverified===false&&src.onlineDate===src.date&&Array.isArray(src.authors)&&src.authors.length>0,'source_date_or_authors_missing:'+doi);
    ok(row.title===src?.title && row.date===src?.date && row.journal===src?.journal && isDeepStrictEqual(row.authors,src?.authors),'article_identity_mismatch:'+doi);
    ok(row.ownerDecision===row.decision && row.challengeDecision===row.decision,'owner_decision_not_applied:'+doi);
    ok(String(row.reason||'').length>=12 && String(row.evidenceBasis||'').length>=40 && String(row.challengeReason||'').length>=30,'owner_evidence_missing:'+doi);
    if(row.decision==='include'){
      ok(typeof row.titleZh==='string' && /[\u3400-\u9fff]/.test(row.titleZh),'verified_chinese_title_missing:'+doi);
      ok(['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'].every(k=>String(row.scopeAssessment?.[k]||'').length>=8),'owner_scope_assessment_missing:'+doi);
      if(doi==='10.31635/ccschem.026.202608252'||doi==='10.1021/acs.orglett.6c03893')
        ok(row.evidenceStatus==='owner_title_only_not_full_preparative_evidence','unverified_scope_not_disclosed:'+doi);
    }
  }
  return f;
}
export function appendOnly(before,after,expected) {
  if(!before||!after||!Array.isArray(before.papers)||!Array.isArray(after.papers)) return false;
  const a={...before};delete a.papers;
  const b={...after};delete b.papers;
  if(!isDeepStrictEqual(a,b)||after.papers.length!==before.papers.length+expected.length) return false;
  if(!isDeepStrictEqual(after.papers.slice(0,before.papers.length),before.papers)) return false;
  return exactSet(after.papers.slice(before.papers.length).map(x=>normalize(x.doi)),expected);
}
export async function authorizeOwnerCatchup(root=process.cwd()){
 const failures=[],check=(v,k)=>{if(!v)failures.push(k)};
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:96*1024*1024}).trim();
 const show=(ref,file)=>git('show',ref+':'+file);
 let marker,markerCommit,parent,previous,source,originalAudit,review,staging,authority;
 try{
  marker=parse(readFileSync(path.join(root,MARKER),'utf8'));
  markerCommit=git('log','-1','--format=%H','--',MARKER);
  parent=git('rev-parse',markerCommit+'^');
  previous=parse(show(parent,MARKER));
  const inner=marker.ownerCatchup || {};
  check(marker.mode==='slot-release'&&marker.schemaVersion===2&&marker.releasePolicy==='per-doi'&&marker.publicationSlot===SLOT,'invalid_one_time_marker');
  check(inner.id===ID&&inner.oneTimeOnly===true&&inner.authorityFile===AUTH,'owner_catchup_identity_invalid');
  check(previous.mode==='slot-release'&&previous.schemaVersion===2&&previous.publicationSlot===SLOT
    &&previous.productionCards===979&&!previous.ownerCatchup,'not_the_original_fixed_slot_marker');
  check(inner.previousMarkerBlobSha===git('rev-parse',parent+':'+MARKER),'original_marker_reference_mismatch');
  check(inner.previousReleaseCommit===parent,'previous_release_parent_mismatch');
  const committedAt=Date.parse(git('show','-s','--format=%cI',markerCommit));
  check(Number.isFinite(committedAt)&&committedAt>=Date.parse('2026-10-13T09:00:00+08:00')
    &&committedAt<Date.parse('2026-10-14T00:00:00+08:00'),'outside_one_time_owner_authorization_date');
  check(marker.generatedAt&&Number.isFinite(Date.parse(marker.generatedAt))
    &&Math.abs(Date.parse(marker.generatedAt)-committedAt)<30*60000,'catchup_timestamp_unreliable');
  const expectedRefs=[[AUTH,'authorityBlobSha'],[REVIEW,'reviewBlobSha'],[STAGING,'stagingReviewBlobSha'],['audit/unresolved-latest.json','handoffBlobSha'],['audit/latest.json','auditBlobSha']];
  for(const [file,key] of expectedRefs){
    const val=key==='authorityBlobSha'?inner[key]:marker[key];
    check(/^[a-f0-9]{40}$/.test(String(val||''))&&git('rev-parse',markerCommit+':'+file)===val,'frozen_reference_mismatch:'+file);
  }
  authority=parse(show(markerCommit,AUTH));review=parse(show(markerCommit,REVIEW));staging=parse(show(markerCommit,STAGING));
  source=parse(show(markerCommit,'audit/unresolved-latest.json'));
  originalAudit=parse(show(markerCommit,'audit/latest.json'));
  check(marker.reviewFile===REVIEW&&marker.stagingReviewFile===STAGING&&marker.handoffGeneratedAt===source.generatedAt,'wrong_frozen_evidence');
  failures.push(...validateOwnerSource(authority,source,originalAudit,review,staging));
  check(exactSet(marker.dailyPublishableDois,[...(previous.dailyPublishableDois||[]),...INCLUDED]),'daily_partition_changed');
  check(exactSet(marker.historicalAdmittedDois,previous.historicalAdmittedDois||[]),'historical_archive_partition_changed');
  check(exactSet(marker.publishableDois,[...(previous.publishableDois||[]),...INCLUDED]),'admission_partition_changed');
  check(exactSet(marker.rejectedDois,[...(previous.rejectedDois||[]),...EXCLUDED]),'rejection_partition_changed');
  check(Array.isArray(marker.deferredDois)&&marker.deferredDois.length===0,'original_pending_not_resolved');
  check(marker.productionCards===984,'unexpected_production_count');
  check(exactSet(Object.keys(marker.protectedBlobs||{}),PROTECTED),'protected_file_set_changed');
  const changed=new Set(git('diff-tree','--no-commit-id','--name-only','-r',markerCommit).split('\n'));
  for(const file of [MARKER,REVIEW,STAGING,'public/rolling-supplement.json','audit/literature-update-state.json'])
    check(changed.has(file),'not_atomic_with_owner_catchup:'+file);
  const keys=['audit/literature-scope-corrections.json','audit/scope-removal-authority.json'];
  for(const k of keys)check(git('rev-parse',parent+':'+k)===git('rev-parse',markerCommit+':'+k),'scope_authority_mutated:'+k);
  const allBefore=new Set(),allAfter=new Set();
  for(const file of PROTECTED){
    const beforeSha=git('rev-parse',parent+':'+file),afterSha=git('rev-parse',markerCommit+':'+file);
    check(previous.protectedBlobs?.[file]===beforeSha,'previous_snapshot_not_authorized:'+file);
    check(marker.protectedBlobs?.[file]===afterSha&&git('hash-object','--',file)===afterSha,'untrusted_new_protected_blob:'+file);
    if(file==='shared/literature-policy.js')check(beforeSha===afterSha,'policy_code_modified');
    else{
      const before=show(parent,file),after=show(markerCommit,file),left=decode(file,before),right=decode(file,after);
      if(file==='public/rolling-supplement.json'){
        check(appendOnly(parse(before),parse(after),INCLUDED),'rolling_not_exact_five_append');
        const additions=parse(after).papers.slice(parse(before).papers.length),by=new Map(source.unresolved.map(x=>[normalize(x.doi),x]));
        for(const row of additions){
          const doi=normalize(row.doi),src=by.get(doi),decision=review.accepted.find(x=>normalize(x.doi)===doi);
          check(!!src&&!!decision&&row.title===src.title&&row.date===src.date&&row.addedDate==='2026-10-13'
            &&row.titleZh===decision.titleZh&&isDeepStrictEqual(row.authors,src.authors)&&row.url==='https://doi.org/'+doi,
            'appended_card_identity_failed:'+doi);
        }
      }else check(beforeSha===afterSha,'non_rolling_data_changed:'+file);
      for(const row of left)if(normalize(row.doi||row.url).startsWith('10.'))allBefore.add(normalize(row.doi||row.url));
      for(const row of right)if(normalize(row.doi||row.url).startsWith('10.'))allAfter.add(normalize(row.doi||row.url));
    }
  }
  check(allBefore.size===979&&allAfter.size===984
    &&exactSet([...allAfter].filter(x=>!allBefore.has(x)),INCLUDED)
    &&[...allBefore].every(x=>allAfter.has(x)),'doi_union_changed_beyond_approved_five');
  const next=parse(show(markerCommit,'audit/literature-update-state.json'));
  check(next.pendingReviewBacklog?.length===0&&next.nextSlotPublicationBacklog?.length===0&&next.activeRun===null,'durable_review_backlog_unresolved');
  check(next.nextPublicationSlot==='2026-10-14T08:00:00+08:00'
    &&next.lastPublication?.publicationSlot===SLOT,'next_fixed_slot_or_original_release_changed');
  const priorState=parse(show(parent,'audit/literature-update-state.json'));
  check(exactSet((priorState.pendingReviewBacklog||[]).map(x=>normalize(x.doi)),[EXCLUDED[0],EXCLUDED[1],INCLUDED[0],INCLUDED[3],INCLUDED[4]])
    &&exactSet((priorState.nextSlotPublicationBacklog||[]).map(x=>normalize(x.doi)),[INCLUDED[1],INCLUDED[2]]),'original_seven_not_exact_active_backlog');
  if(!failures.length){
    const dir=mkdtempSync(path.join(tmpdir(),'gallery-owner-prior-'));
    try{
      git('worktree','add','--detach',dir,parent);
      const child=spawnSync(process.execPath,[fileURLToPath(new URL('../validate-pages-literature-authorization.mjs',import.meta.url))],
        {cwd:dir,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
      let result;try{result=JSON.parse(child.stdout)}catch{}
      check(child.status===0&&result?.ok===true,'prior_fixed_slot_snapshot_not_authorized');
    }finally{try{git('worktree','remove','--force',dir)}finally{rmSync(dir,{recursive:true,force:true})}}
  }
 }catch(error){failures.push('one_time_validation_failed:'+String(error?.message||error).slice(0,180))}
 return {schemaVersion:1,ok:failures.length===0,gate:'pages-literature-authorization',
  mode:'slot-release',ownerOneTimeCatchup:true,publicationSlot:SLOT,markerCommit,
  productionCards:marker?.productionCards??null,reviewComplete:true,
  includedDois:INCLUDED,excludedDois:EXCLUDED,protectedFiles:PROTECTED.length,
  failures,productionDataModified:false,
  note:'Explicit one-time owner-approved 13 Oct catchup. This does not authorize another off-slot admission, alter any future schedule, or waive immutable DOI-set integrity checks.'};
}
