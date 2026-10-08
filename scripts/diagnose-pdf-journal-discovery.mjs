import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';

const dataRaw=fs.readFileSync('public/papers.gz.b64','utf8').trim();
let catalog;
try{
  const raw=gunzipSync(Buffer.from(dataRaw,'base64')).toString('utf8');
  const parsed=JSON.parse(raw);
  catalog=Array.isArray(parsed)?parsed:(Array.isArray(parsed.papers)?parsed.papers:Array.isArray(parsed.articles)?parsed.articles:null);
}catch(error){
  console.log('PDF_JOURNAL_DISCOVERY '+JSON.stringify({ok:false,reason:'published_catalog_parse_failed'}));
  process.exit(1);
}
if(!catalog)throw Error('published_catalog_shape_invalid');
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
const r=spawnSync('cloudflare/worker/node_modules/.bin/wrangler',
  ['d1','execute','organic-synthesis-gallery','--remote','--command',sql,'--json'],
  {encoding:'utf8',timeout:55000,maxBuffer:6*1024*1024,env:process.env,stdio:['ignore','pipe','pipe']});
if(r.status!==0)throw Error('ready_pdf_inventory_query_failed');
const output=JSON.parse(r.stdout);const groups=Array.isArray(output)?output:[output];
const all=groups.flatMap(o=>Array.isArray(o.results)?o.results:[]);
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
  report.push({
    journal:journal.name,
    activeFrom:journal.activeFrom,
    publishedCards:entries.length,
    ready:ready.length,
    missing:notReady.length,
    selection:chosen.map(x=>({doi:x.doi,addedDate:x.addedDate,fileBytes:x.size,ready:x.ready})),
    testCount:chosen.length,
  });
}
console.log('PDF_JOURNAL_DISCOVERY '+JSON.stringify({ok:true,source:'main-canonical-journal-registry+published-cards+production-D1',catalogCount:catalog.length,readyInventoryUniqueDois:docs.size,unknownJournalNames:unknown,journals:report}));
