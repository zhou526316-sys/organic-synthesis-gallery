/**
 * Evidence-ready batch packet for real model/human two-pass ORIGINAL-method
 * screening. It is a derived ranking artifact ONLY, never an admission.
 * Original high-recall immutable publisher-source shards are not modified.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SCHEMA='gallery-historical-academic-preflight-v1';
const doiOk=id=>/^10\.\d{4,9}\/\S+$/.test(id||'');
const safeIso=t=>typeof t==='string'&&/^202\d-\d\d-\d\dT/.test(t);
const ensure=(ok,m)=>{if(!ok)throw Error('historical_preflight_'+m)};
const stem=v=>String(v||'').trim().toLowerCase();
const terms=[
  [/enantioselectiv|atroposelectiv|asymmetric (?:cataly|synthe|coupl|cycl|alkyl|amination|hydrogen|hydrobor|functional)/i,'stereoselective_synthetic_method',8],
  [/\b(?:total synthesis|formal synthesis|late.stage functionalization|de novo synthesis)\b/i,'target_or_late_stage_synthesis',7],
  [/\b(?:C[–-][CNOSB]|C\(sp[23]\)\s*[–-]\s*[CNOSB]|cross.coupling|annulation|cycloaddition|cyclization|ring.expansion|skeletal.editing|carbonylation|olefination|hydroamination|borylation|decarboxylative|alkynylation|arylation|aminofunctionalization|hydroarylation|Minisci)\b/i,'bond_construction',7],
  [/\b(?:organic synthesis|photoredox|electrochemical synthesis|electrosynthesis|photoelectro|radical.polar crossover|organocataly|synthetic methodology)\b/i,'synthetic_method_context',5],
  [/\b(?:enantioselectivity|selective synthesis|synthesis of [a-z].*(?:heterocycl|molecul|alkaloid|peptid|nucleoside|compound))\b/i,'preparative_claim',4],
  [/\b(?:reaction|catalysis|synthesis|transformation|radical|alkene|alkyne|heterocycle|photocataly)\b/i,'broad_chemistry_context',1],
];
const unrelated=[
  /\b(?:prefrontal|flagellar rotation|neural|neuron|brain|magnetic thin film|spintronics|ecosystem|ophthalmic|pixel|voltage.gated ion channel|aerospace|galactic|social network)\b/i,
  /\b(?:battery|solar cell|oxygen evolution|photovoltaic|tissue engineering|water treatment|nanofungicide|semiconducting thin films)\b/i
];
export function rankEvidence(row){
  const title=String(row?.title||''),signals=[];
  let weight=0;
  for(const [regex,label,points] of terms){
    if(regex.test(title)){signals.push(label);weight+=points}
  }
  const offTopicTitle=unrelated.some(rx=>rx.test(title));
  const strongOrganic=signals.includes('stereoselective_synthetic_method')
    ||signals.includes('target_or_late_stage_synthesis')
    ||signals.includes('bond_construction');
  if(offTopicTitle&&!strongOrganic)weight-=12;
  if(!title.trim())weight-=4;
  return {score:weight,signals,offTopicTitleRisk:offTopicTitle&&!strongOrganic,
    chemistryTitleSignalsOnly:true,
    nonOriginalPublisherTypeVerified:false,
    publisherFirstOnlineVerified:false,
    noAutomaticScopeDecision:true};
}
const journalKey=r=>String(r.journal||'Unknown');
function traceSource(row,mode){
  const rootIds=mode==='q3'?(row.sourceRootIds||[]):(row.sourceBatchIds||[]);
  const hashes=mode==='q3'?(row.sourceHashes||[]):(row.sourceFingerprints||[]);
  ensure(Array.isArray(rootIds)&&rootIds.length>0
    &&Array.isArray(hashes)&&hashes.length>0
    &&hashes.every(x=>/^[a-f0-9]{64}$/.test(x)), 'source_identity_untrusted:'+row.doi);
  return {sourceRootIds:rootIds,sourceSha256Hashes:hashes};
}
export function buildAcademicBatch(rows,{
  batchSize=160,mode='q3',worklistTimestamp='',sourceWorklistHash='',
  sourceTotal=rows.length
}={}){
  ensure(['q3','global'].includes(mode)&&Array.isArray(rows)
    &&Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=200
    &&Number.isSafeInteger(sourceTotal)&&sourceTotal>=rows.length,
    'invalid_arguments');
  const checked=new Set(),bins=new Map(),all=[];
  for(const r of rows){
    const doi=stem(r?.doi);
    ensure(doiOk(doi)&&doi===r.doi&&!checked.has(doi)
      &&r.title&&r.journal, 'invalid_or_duplicate_Doi:'+doi);
    checked.add(doi);
    const cues=rankEvidence(r),proof=traceSource(r,mode);
    const paper={doi,journal:r.journal,title:r.title,
      firstAuthor:r.firstAuthor||'',originalQueuePriority:r.priority||'P3',
      originDateCandidate:mode==='q3'?(r.apiDateCandidate||''):(r.date||''),
      truePublisherOnlineDate:null,publisherCategory:null,
      evidenceRank:cues,sourceProof:proof,
      doiResolver:'https://doi.org/'+doi,
      publisherEvidenceRequired:[
        'DOI-exact official Article versus Review/Comment/Preview classification',
        'Publisher first available online date versus issue/index-created date',
        'Specific new substrate-to-product chemistry and product identity',
        'Generality, yields/structure controls, or completed total synthesis',
        'Adversarial second-pass: real boundary/contradicting evidence'
      ],
      scienceFirstPass:'not_performed',scienceAdversarialPass:'not_performed',
      decision:'unreviewed',publicationAuthority:false};
    all.push(paper);
    const j=journalKey(r),bin=bins.get(j)||[];
    bin.push(paper);bins.set(j,bin);
  }
  const order=['JACS','Angew','Organic Letters','JOC','Chem','Nature Chemistry',
    'Nature Synthesis','Nature Catalysis','ACS Catalysis','Chemical Science',
    'Green Chemistry','CCS Chemistry','Nature Communications',
    'Science Advances','Nature','Science'];
  const cmp=(a,b)=>b.evidenceRank.score-a.evidenceRank.score
    ||a.doi.localeCompare(b.doi);
  for(const bin of bins.values())bin.sort(cmp);
  const orderedJournals=[...bins.keys()].sort((a,b)=>{
    const ai=order.indexOf(a),bi=order.indexOf(b);
    return (ai<0?99:ai)-(bi<0?99:bi)||a.localeCompare(b);
  });
  const selected=[];let round=0;
  while(selected.length<Math.min(batchSize,all.length)){
    let progress=false;
    for(const j of orderedJournals){
      const bin=bins.get(j);
      if(!bin?.length)continue;
      const r=round%7===6?bin.pop():bin.shift();
      if(r){selected.push(r);progress=true}
      if(selected.length>=batchSize)break;
    }
    if(!progress)break;round++;
  }
  ensure(new Set(selected.map(x=>x.doi)).size===selected.length,
    'duplicate_after_prioritization');
  return {schemaVersion:SCHEMA,mode:'evidence_collection_and_two_pass_human_or_model_review_pending',
    selectionMode:mode,sourceWorklistProducedAt:worklistTimestamp,
    sourceWorklistSha256:sourceWorklistHash,
    sourceRowsInProvidedPage:rows.length,sourceTotalUnreviewed:sourceTotal,
    selected:selected.length,maxBatchSize:batchSize,
    journalCoverage:[...new Set(selected.map(r=>r.journal))],
    highChemistrySignalCount:selected.filter(x=>x.evidenceRank.score>=5).length,
    interdisciplinaryTitleRiskCount:selected.filter(x=>x.evidenceRank.offTopicTitleRisk).length,
    candidates:selected,
    guards:{noAutomaticIncludeOrExclude:true,
      lowRankDoesNotRemoveOriginalCandidates:true,
      worklistAndFrozenSourceUnchanged:true,
      publisherDateNotInferred:true,
      noExternalRequests:true,noD1:true,noMediaOrPdf:true,
      noHistoricalDailyNewOrHot:true,noFormalPublication:true}};
}
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const fileHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function runAcademicPreflight({
 root='audit/historical-staging',batchSize=Number(process.env.HISTORICAL_ACADEMIC_BATCH_SIZE||160)
}={}){
  ensure(process.env.HISTORICAL_STAGING_ONLY==='1'
    &&process.env.HISTORICAL_STAGING_BRANCH==='1','staging_only');
  const paths=[
    {path:root+'/quarter-2026-q3-review-worklist.json',mode:'q3',
      outfile:root+'/academic-preflight-q3.json'},
    {path:root+'/reviewer-worklist.json',mode:'global',
      outfile:root+'/academic-preflight-global.json'}
  ];
  const outputs=[];
  for(const {path,mode,outfile} of paths){
    const bytes=await readFile(path),d=JSON.parse(bytes.toString());
    if(mode==='q3')ensure(d.noAutomaticAcademicDecision===true
      &&d.noCloudflareD1Access===true
      &&Array.isArray(d.rows)&&d.rows.length===d.selected
      &&safeIso(d.generatedAt),'untrusted_q3_worklist');
    else ensure(d.mode==='scientific_review_worklist_only_not_scope_decision'
      &&d.noAutomatedIncludesOrExcludes===true
      &&Array.isArray(d.worklist)&&d.worklist.length===d.selected
      &&safeIso(d.producedAt),'untrusted_global_worklist');
    const rows=mode==='q3'?d.rows:d.worklist;
    const o=buildAcademicBatch(rows,{mode,batchSize,
      worklistTimestamp:d.generatedAt||d.producedAt,
      sourceWorklistHash:fileHash(bytes),
      sourceTotal:d.totalUnreviewedCandidates||d.statusCounts?.needsReview||rows.length});
    await mkdir(dirname(outfile),{recursive:true});
    const tmp=outfile+'.tmp.'+process.pid;
    await writeFile(tmp,JSON.stringify(o,null,2)+'\n');await rename(tmp,outfile);
    outputs.push({file:outfile,selected:o.selected,sourceRows:o.sourceRowsInProvidedPage,
      sourceTotalUnreviewed:o.sourceTotalUnreviewed,
      highSignal:o.highChemistrySignalCount,journalCoverage:o.journalCoverage.length});
  }
  console.log('HISTORICAL_ACADEMIC_PREFLIGHT '+JSON.stringify({
    completedReviewDecisions:0,academicAdmissions:0,batchPackets:outputs,
    noPublication:true,noD1:true}));
  return outputs;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runAcademicPreflight().catch(e=>{console.error('HISTORICAL_ACADEMIC_PREFLIGHT_BLOCKED',
    String(e?.message||e));process.exitCode=1});
