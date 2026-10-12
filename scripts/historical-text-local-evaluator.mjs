// Local-only accuracy and storage benchmark for 50-100 user-exported source packets.
// Does not sync or upload journal article text. Reports counts, never excerpts.
// Example: node scripts/historical-text-local-evaluator.mjs --dir=./local-historical-captures --limit=100 --output=./pilot-report.json
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {normalizedDoi,CUT_OFF} from './historical-text-source-audit.mjs';

const MAX_FILE_BYTES=1024*1024, MAX_DOCS=100;
export function canonicalText(packet){
  return [...(packet.sections||[]).map(x=>x.heading+'\n'+x.text),
    ...(packet.captions||[]).map(x=>x.label+'\n'+x.text),
    ...(packet.tables||[]).map(x=>x.label+'\n'+x.text)].join('\n');
}
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateLocalPacket(packet,registry){
  if(packet?.schemaVersion!=='gallery-historical-local-text-pilot-v1')
    throw Error('invalid_schema');
  const doi=normalizedDoi(packet?.doi);
  if(!doi||doi!==packet.doi)throw Error('invalid_doi');
  const publication=String(packet?.publication||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(publication)||publication>=CUT_OFF)
    throw Error('not_historical');
  const matches=(registry?.articles||[]).filter(row=>normalizedDoi(row?.doi)===doi);
  if(matches.length!==1||String(matches[0].date||'')!==publication)
    throw Error('not_current_published_member');
  if(packet.rightsStatus!=='local_only_permission_to_be_verified'
    ||packet.indexEligibility!=='local_pilot_only'
    ||packet.publicUploadAllowed!==false
    ||packet.pdfDownloaded!==false||packet.mediaDownloaded!==false)
    throw Error('rights_or_media_policy_mismatch');
  if(!Array.isArray(packet.sections)||packet.sections.length===0||packet.sections.length>100
    ||!Array.isArray(packet.captions)||!Array.isArray(packet.tables))
    throw Error('invalid_sections');
  const text=canonicalText(packet);
  if(text.length<250||text.length>350000||hash(text)!==packet.sourceSha256)
    throw Error('content_hash_mismatch');
  return {doi,journal:String(matches[0].journal||''),
    sourceSha256:packet.sourceSha256,text,
    title:String(matches[0].title||''),characters:text.length};
}
export const CHEMICAL_EQUIVALENTS=Object.freeze({
  lmct:['lmct','ligand-to-metal charge transfer','ligand to metal charge transfer','配体到金属电荷转移'],
  carbon_dioxide:['co2','co₂','carbon dioxide','二氧化碳'],
  nickel_i:['ni(i)','nickel(i)','nickel(i) species','一价镍'],
  chirality:['enantioselective','asymmetric catalysis','不对称催化'],
  electrochemistry:['electrochemical','electrosynthesis','电化学','电合成'],
});
const norm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\u2010-\u2015]/g,'-');
export function matchTerms(text,term){
  const set=CHEMICAL_EQUIVALENTS[term]||[term];
  const searchable=norm(text);
  return set.some(word=>searchable.includes(norm(word)));
}
export function evaluatePackets(records,terms=Object.keys(CHEMICAL_EQUIVALENTS)){
  return terms.map(term=>{
    const titleHits=records.filter(r=>matchTerms(r.title,term)).length;
    const bodyHits=records.filter(r=>matchTerms(r.text,term)).length;
    const bodyOnly=records.filter(r=>!matchTerms(r.title,term)&&matchTerms(r.text,term)).length;
    return {term,titleHits,bodyHits,bodyOnly};
  });
}
export async function runLocal({dir,registryPath='public/toc-demand-live.json',
  output='/tmp/gallery-historical-local-text-pilot.json',limit=100}={}){
  if(!dir)throw Error('local_directory_required');
  const registry=JSON.parse(await readFile(registryPath,'utf8'));
  const filenames=(await readdir(dir)).filter(n=>/^gallery-historical-[\w.-]+\.json$/.test(n)).sort()
    .slice(0,Math.max(1,Math.min(MAX_DOCS,Number(limit)||100)));
  const records=[],errors={},seen=new Set();
  let inputBytes=0;
  for(const filename of filenames){
    try{
      const full=join(dir,filename),bytes=(await readFile(full));
      if(bytes.length>MAX_FILE_BYTES)throw Error('file_too_large');
      inputBytes+=bytes.length;
      const item=validateLocalPacket(JSON.parse(bytes.toString('utf8')),registry);
      if(seen.has(item.doi))throw Error('duplicate_doi');
      seen.add(item.doi);records.push(item);
    }catch(error){
      const reason=String(error?.message||error).slice(0,80);
      errors[reason]=(errors[reason]||0)+1;
    }
  }
  const result={schemaVersion:'gallery-historical-local-search-benchmark-v1',
    evaluatedAt:new Date().toISOString(),localOnly:true,remoteUploads:0,
    inputFiles:filenames.length,validDocuments:records.length,
    inputBytes,rawTextBytes:records.reduce((n,r)=>n+Buffer.byteLength(r.text),0),
    byJournal:{},rejected:errors,queries:evaluatePackets(records)};
  for(const row of records)result.byJournal[row.journal]=(result.byJournal[row.journal]||0)+1;
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log('HISTORICAL_LOCAL_SEARCH_BENCHMARK '+JSON.stringify(result));
  return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const opt=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
  runLocal({dir:opt('dir',''),registryPath:opt('catalog','public/toc-demand-live.json'),
    output:opt('output','/tmp/gallery-historical-local-text-pilot.json'),
    limit:Number(opt('limit','100'))}).catch(error=>{
    console.error('HISTORICAL_LOCAL_SEARCH_BENCHMARK_FAILED '+String(error?.message||error).slice(0,150));
    process.exitCode=1;
  });
}
