import { spawnSync } from 'node:child_process';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

// Read the *current deployed indexed catalog*, not the historical archive
// public/papers.gz.b64 (which stops before the newest journal additions).
const readD1=(name,sql)=>{
  const p=spawnSync('cloudflare/worker/node_modules/.bin/wrangler',
    ['d1','execute',name,'--remote','--command',sql,'--json'],
    {encoding:'utf8',timeout:55000,maxBuffer:8*1024*1024,env:process.env,
     stdio:['ignore','pipe','pipe']});
  if(p.status!==0)throw Error('D1_inventory_read_failed');
  const data=JSON.parse(p.stdout);
  const blocks=Array.isArray(data)?data:[data];
  if(blocks.some(b=>b.success===false))throw Error('D1_inventory_failed');
  return blocks.flatMap(b=>Array.isArray(b.results)?b.results:[]);
};
const generations=readD1('organic-synthesis-lit-index',
  'SELECT catalog_id,record_count,publication_slot FROM literature_catalog_generations WHERE ready=1 ORDER BY updated_at DESC LIMIT 1;');
const latest=generations[0];
if(!latest?.catalog_id||!/^[a-f0-9]{64}$/.test(latest.catalog_id))throw Error('current_catalog_generation_unavailable');
const catalog=readD1('organic-synthesis-lit-index',
  'SELECT doi,journal,added_date AS addedDate FROM literature_catalog_index WHERE catalog_id='+
  "'"+latest.catalog_id+"'"+' ORDER BY added_date DESC,doi ASC LIMIT 6000;');
if(catalog.length!==Number(latest.record_count))throw Error('current_index_row_count_mismatch');
const identity=(value)=>String(value||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'');
const aliases={
  Nature:['nature'],
  Science:['science'],
  'Nature Catalysis':['naturecatalysis','natcatal'],
  'Nature Synthesis':['naturesynthesis','natsynth'],
  'Nature Chemistry':['naturechemistry','natchem'],
  'Nature Communications':['naturecommunications','natcommun','natcomms'],
  JACS:['jacs','journaloftheamericanchemicalsociety','jamchemsoc'],
  Angew:['angew','angewandtechemie','angewandtechemieinternationaledition','angewcheminted','angewchemintedit'],
  'ACS Catalysis':['acscatalysis','acscatal'],
  'Organic Letters':['organicletters','orglett'],
  Chem:['chem','chemjournal'],
  'Chemical Science':['chemicalscience','chemsci'],
  'CCS Chemistry':['ccschemistry','ccschem'],
  'Science Advances':['scienceadvances','sciadv'],
  'Green Chemistry':['greenchemistry','greenchem'],
  JOC:['joc','journaloforganicchemistry','jorgchem'],
};
const lookup=new Map(Object.entries(aliases).flatMap(([name,entries])=>entries.map(key=>[key,name])));
const sql='SELECT doi,byte_length,version_kind,captured_at FROM private_pdf_documents WHERE active=1 AND processing_state='+ "'ready'" +' ORDER BY captured_at DESC LIMIT 5000;';
const all=readD1('organic-synthesis-gallery',sql);
const ranking={version_of_record:4,accepted_manuscript:3,preprint:2,unknown:1};
const docs=new Map();
for(const row of all){
  const doi=String(row.doi||'').toLowerCase();
  if(!/^10\.\d{4,9}\/\S+$/.test(doi))continue;
  const prev=docs.get(doi);
  if(!prev||((ranking[row.version_kind]||0)>(ranking[prev.version_kind]||0))||
     ((ranking[row.version_kind]||0)===(ranking[prev.version_kind]||0)&&Number(row.captured_at)>Number(prev.captured_at)))docs.set(doi,row);
}
const unknown={};const seen=new Set();const grouped=new Map(TARGET_JOURNALS.map(j=>[j.name,[]]));
for(const item of catalog){
  const doi=String(item?.doi||'').trim().toLowerCase();
  if(!/^10\.\d{4,9}\/\S+$/.test(doi)||seen.has(doi))continue;
  seen.add(doi);
  const jval=item?.journal||item?.journalName||item?.sourceJournal||'';
  const journal=lookup.get(identity(jval));
  if(!journal){const name=String(jval||'empty').slice(0,70);unknown[name]=(unknown[name]||0)+1;continue;}
  const reg=TARGET_JOURNALS.find(j=>j.name===journal);
  const addedDate=String(item.addedDate||item.addedAt||item.date||'').slice(0,10);
  if(reg?.activeFrom&&addedDate&&addedDate<reg.activeFrom)continue;
  grouped.get(journal).push({doi,addedDate,size:Number(docs.get(doi)?.byte_length||0),ready:docs.has(doi)});
}
const report=[];
for(const journal of TARGET_JOURNALS){
  const entries=grouped.get(journal.name)||[];
  const ready=entries.filter(x=>x.ready);
  const notReady=entries.filter(x=>!x.ready);
  const chosen=[];
  const insert=x=>{if(x&&!chosen.find(z=>z.doi===x.doi))chosen.push(x);};
  const latest=(xs)=>xs.slice().sort((a,b)=>b.addedDate.localeCompare(a.addedDate));
  insert(latest(ready)[0]);
  insert(ready.slice().sort((a,b)=>b.size-a.size)[0]);
  insert(ready.slice().sort((a,b)=>a.addedDate.localeCompare(b.addedDate))[0]);
  for(const x of latest(ready)){if(chosen.length>=3)break;insert(x);}
  for(const x of latest(notReady)){if(chosen.length>=3)break;insert(x);}
  const recent=entries.filter(x=>x.addedDate>='2026-10-01');
  report.push({
    journal:journal.name,
    activeFrom:journal.activeFrom,
    publishedCards:entries.length,
    addedSinceOct1:recent.length,
    readySinceOct1:recent.filter(x=>x.ready).length,
    missingSinceOct1:recent.filter(x=>!x.ready).length,
    ready:ready.length,
    missing:notReady.length,
    selection:chosen.map(x=>({doi:x.doi,addedDate:x.addedDate,fileBytes:x.size,ready:x.ready})),
    testCount:chosen.length,
  });
}
console.log('PDF_JOURNAL_DISCOVERY '+JSON.stringify({ok:true,source:'main-canonical-journal-registry+current-deployed-literature-index+production-D1',catalogGeneration:latest.catalog_id,publicationSlot:latest.publication_slot,catalogCount:catalog.length,readyInventoryUniqueDois:docs.size,unknownJournalNames:unknown,journals:report}));
