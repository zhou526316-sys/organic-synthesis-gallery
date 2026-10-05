import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const shadowDir=path.resolve(process.argv[2]||'');
const reportPath=path.resolve(process.env.LITERATURE_INDEX_SHADOW_REPORT||'/tmp/literature-index-shadow-report.json');
const workerBase=String(process.env.WORKER_URL||'').replace(/\/$/,'');
const token=String(process.env.BRIDGE_WRITE_TOKEN||'');
const fail=message=>{throw new Error(message);};
if(!shadowDir||!workerBase||!token) fail('literature_index_shadow_inputs_missing');

const readJson=async file=>JSON.parse(await readFile(path.join(shadowDir,file),'utf8'));
const normalizeDoi=value=>String(value||'').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
const codepoints=value=>[...String(value||'')].length;
const sha40=value=>/^[a-f0-9]{40}$/i.test(String(value||''))?String(value).toLowerCase():'';
const hash64=value=>/^[a-f0-9]{64}$/i.test(String(value||''))?String(value).toLowerCase():'';

async function api(route,{method='GET',body}={}){
  const response=await fetch(workerBase+route,{
    method,
    headers:{
      authorization:'Bearer '+token,
      'cache-control':'no-cache',
      ...(body?{'content-type':'application/json'}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(30000),
  });
  const text=await response.text();
  let parsed={};try{parsed=text?JSON.parse(text):{};}catch{}
  if(!response.ok){
    const error=new Error(route+' failed: '+response.status+' '+text.slice(0,800));
    error.status=response.status;error.body=parsed;throw error;
  }
  return parsed;
}

const pointer=await readJson('current.json');
const catalog=await readJson(pointer.catalog.path);
const shadowReport=await readJson('report.json');
if(pointer?.schema!=='gallery-shadow-catalog-v1'||catalog?.schema!=='gallery-shadow-catalog-v1') fail('shadow_catalog_schema_invalid');
if(shadowReport?.liveVerification?.ok!==true) fail('shadow_live_verification_required');
if(!hash64(catalog.recordSetHash)||!hash64(catalog.doiSetHash)) fail('shadow_catalog_hash_invalid');

const records=[];
for(const ref of catalog.shards||[]){
  const shard=await readJson(ref.path);
  if(shard?.schema!=='gallery-shadow-catalog-v1'||!Array.isArray(shard.records)||shard.records.length!==ref.count){
    fail('shadow_shard_invalid:'+String(ref.path||''));
  }
  records.push(...shard.records);
}
records.sort((a,b)=>String(a.doi).localeCompare(String(b.doi)));
if(records.length!==catalog.recordCount) fail('shadow_record_count_mismatch');
if(new Set(records.map(row=>row.doi)).size!==records.length) fail('shadow_duplicate_doi');

const generation={
  catalogId:String(catalog.recordSetHash).toLowerCase(),
  doiSetHash:String(catalog.doiSetHash).toLowerCase(),
  publicationSlot:String(shadowReport.publicationSlot||catalog.source?.publicationSlot||''),
  sourceCommit:sha40(shadowReport.liveVerification?.sourceCommit)||sha40(catalog.source?.commit),
  markerBlobSha:String(catalog.source?.markerBlobSha||'').toLowerCase(),
  recordCount:Number(catalog.recordCount||0),
};
if(!generation.sourceCommit||!hash64(generation.markerBlobSha)||!/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(generation.publicationSlot)){
  fail('shadow_generation_identity_invalid');
}

const rows=records.map(record=>{
  const paper=record.paper||{};
  return {
    doi:record.doi,
    revision:record.revision,
    title:paper.title??paper.titleEn??'',
    titleZh:paper.titleZh??'',
    authors:Array.isArray(paper.authors)?paper.authors:[],
    journal:paper.journal??'',
    firstOnlineDate:record.firstOnlineDate??null,
    datePrecision:record.datePrecision??'unknown',
    addedDate:record.addedDate??null,
    synthesisType:paper.synthesisType??null,
  };
});

const report={
  schemaVersion:1,
  phase:'P1-literature-catalog-index-shadow',
  startedAt:new Date().toISOString(),
  workerBase,
  generation,
  imported:false,
  importBatches:0,
  parityPasses:[],
  shortQueryCompatibility:false,
  ok:false,
};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');

let status=await api('/api/admin/literature-catalog-index/status');
let existing=(status.generations||[]).find(item=>item.catalogId===generation.catalogId);
if(existing){
  for(const [key,expected] of [
    ['doiSetHash',generation.doiSetHash],['publicationSlot',generation.publicationSlot],
    ['sourceCommit',generation.sourceCommit],['markerBlobSha',generation.markerBlobSha],
    ['recordCount',generation.recordCount],
  ]){
    if(existing[key]!==expected) fail('shadow_existing_generation_mismatch:'+key);
  }
}

if(!existing?.ready){
  await api('/api/admin/literature-catalog-index/begin',{method:'POST',body:generation});
  for(let offset=0;offset<rows.length;offset+=200){
    const page=rows.slice(offset,offset+200);
    const imported=await api('/api/admin/literature-catalog-index/import',{
      method:'POST',body:{generation,rows:page},
    });
    if(Number(imported.importedRows||0)>generation.recordCount) fail('shadow_import_overflow');
    report.importBatches+=1;
  }
  const finalized=await api('/api/admin/literature-catalog-index/finalize',{
    method:'POST',body:{catalogId:generation.catalogId},
  });
  if(finalized.ready!==true||Number(finalized.indexedRows)!==generation.recordCount||Number(finalized.ftsRows)!==generation.recordCount){
    fail('shadow_finalize_not_ready');
  }
  report.imported=true;
}
status=await api('/api/admin/literature-catalog-index/status');
existing=(status.generations||[]).find(item=>item.catalogId===generation.catalogId);
if(!existing?.ready||Number(existing.importedRows)!==generation.recordCount) fail('shadow_status_not_ready');
if(status.readPathActive!==false) fail('shadow_read_path_must_remain_inactive');

function legacyMatches(query){
  const needle=String(query).trim().toLowerCase();
  return rows.filter(row=>[
    row.doi,row.title,row.titleZh,...row.authors,row.journal,row.firstOnlineDate||'',row.synthesisType||''
  ].join(' ').toLowerCase().includes(needle)).map(row=>row.doi).sort();
}

const probes=new Set();
for(const value of [...new Set(rows.map(row=>row.journal).filter(Boolean))]) if(codepoints(value.trim())>=3) probes.add(value.trim());
for(const value of [...new Set(rows.map(row=>row.synthesisType).filter(Boolean))]) if(codepoints(value.trim())>=3) probes.add(value.trim());
for(const value of [...new Set(rows.map(row=>row.firstOnlineDate).filter(Boolean))].sort().slice(-12)) probes.add(value);
const sampleCount=Math.min(28,rows.length);
for(let i=0;i<sampleCount;i++){
  const index=sampleCount===1?0:Math.floor(i*(rows.length-1)/(sampleCount-1));
  const row=rows[index];
  probes.add(row.doi);
  const title=String(row.title||'').trim();
  if(codepoints(title)>=3&&new TextEncoder().encode(title).byteLength<=1200) probes.add(title);
  const author=String(row.authors?.[0]||'').trim();
  if(codepoints(author)>=3&&new TextEncoder().encode(author).byteLength<=600) probes.add(author);
  const zh=String(row.titleZh||'').trim();
  if(codepoints(zh)>=3&&new TextEncoder().encode(zh).byteLength<=600) probes.add(zh);
}
probes.add('zzzzzzgallerynomatchzzzzzz');
const boundedProbes=[...probes].slice(0,96);

async function indexedMatches(query){
  let cursor='',matched=null,pages=0;const dois=[];
  do{
    const qs=new URLSearchParams({catalogId:generation.catalogId,q:query,limit:'100'});
    if(cursor) qs.set('cursor',cursor);
    const page=await api('/api/admin/literature-catalog-index/query?'+qs.toString());
    if(page.readPathActive!==false) fail('shadow_query_read_path_unexpected');
    if(matched===null) matched=Number(page.matched||0);
    else if(Number(page.matched||0)!==matched) fail('shadow_query_count_changed');
    dois.push(...(page.items||[]).map(item=>normalizeDoi(item.doi)));
    pages+=1;
    if(pages>100) fail('shadow_query_page_limit_exceeded');
    cursor=page.hasMore?String(page.nextCursor||''):'';
    if(page.hasMore&&!cursor) fail('shadow_query_cursor_missing');
  }while(cursor);
  return {matched:Number(matched||0),dois:[...new Set(dois)].sort(),pages};
}

async function parityPass(){
  const mismatches=[];
  let pages=0;
  for(const query of boundedProbes){
    const expected=legacyMatches(query);
    const actual=await indexedMatches(query);
    pages+=actual.pages;
    if(actual.matched!==expected.length||JSON.stringify(actual.dois)!==JSON.stringify(expected)){
      mismatches.push({query,expectedCount:expected.length,actualCount:actual.matched,
        expected:expected.slice(0,20),actual:actual.dois.slice(0,20)});
      if(mismatches.length>=8) break;
    }
  }
  return {checked:boundedProbes.length,pages,mismatches};
}

for(let pass=1;pass<=2;pass++){
  const result=await parityPass();
  report.parityPasses.push({pass,...result});
  if(result.mismatches.length) fail('shadow_search_parity_failed_pass_'+pass);
}
try{
  await api('/api/admin/literature-catalog-index/query?'+new URLSearchParams({
    catalogId:generation.catalogId,q:'Ni',limit:'60'
  }).toString());
  fail('short_query_unexpectedly_indexed');
}catch(error){
  if(error.status!==422||error.body?.error!=='literature_catalog_short_query_requires_compatibility') throw error;
  report.shortQueryCompatibility=true;
}

report.ok=true;
report.completedAt=new Date().toISOString();
report.probeCount=boundedProbes.length;
report.readPathActive=false;
report.frontendCutover=false;
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log('LITERATURE_CATALOG_INDEX_SHADOW '+JSON.stringify({
  ok:true,catalogId:generation.catalogId,recordCount:generation.recordCount,
  imported:report.imported,probes:report.probeCount,passes:report.parityPasses.length,
  readPathActive:false,
}));
