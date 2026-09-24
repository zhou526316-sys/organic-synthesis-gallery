import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {buildBodyReviewMarker,BODY_MEDIA_GENERATION} from '../shared/body-media-evidence.js';
import {sha256,exactKey} from '../cloudflare/scripts/new-body-auto-validation.mjs';
import {mergeNewBodyAuto,completedPacketMap} from '../cloudflare/scripts/merge-new-body-auto.mjs';

const policy={...JSON.parse(await (await import('node:fs/promises')).readFile('audit/media-auto-policy.json','utf8'))};
const now=Math.max(Date.now(),Date.parse(policy.backfillCapturedBefore)+20*60000);
let passed=0;const test=(name,ok)=>{assert.ok(ok,name);passed++;console.log('TM230_PACKET_PASS '+name);};

async function make(i,{doi='10.1021/jacs.6c8'+String(i).padStart(4,'0'),id='figure-1',label='Figure 1',updatedAt=now}={}){
 const code=doi.split('.').pop(),n=Number(id.split('-').pop());
 const raw=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420"><path d="M1 1L899 419"/><text x="20" y="40">'+label+' substrate scope '+i+'</text></svg>');
 const full=sha256(raw);
 const row={doi,id,label,caption:label+'. Verified substrate scope and reaction examples '+i+'.',
  articleUrl:'https://pubs.acs.org/jacs/article/doi/'+doi+'/fixture',
  sourceUrl:'https://acs.silverchair-cdn.com/acs/content_public/journal/jacs/pap/10.1021_jacs.'+code+'/1/m_ja'+code+'_'+String(n).padStart(4,'0')+'.svg',
  captureVersion:'6.2.20',pageDoi:doi,jobId:'tm230-job-'+String(i).padStart(8,'0'),mediaGeneration:BODY_MEDIA_GENERATION,
  contentHash:full.slice(0,32),sha256:full,byteLength:raw.length,contentType:'image/svg+xml',width:900,height:420,sortOrder:n-1,updatedAt,
  r2Key:'local-captures/article-figures/images/'+sha256(Buffer.from(doi)).slice(0,24)+'/'+id+'-'+full.slice(0,16)+'.svg'};
 row.reviewMarker=await buildBodyReviewMarker(row,full);assert.equal(row.reviewMarker.state,'pending_review');return {row,raw};
}
const a=await make(1),b1=await make(2,{doi:'10.1021/jacs.6c80002',id:'figure-1',label:'Figure 1'}),b2=await make(22,{doi:'10.1021/jacs.6c80002',id:'figure-2',label:'Figure 2'});
const report=(row,labels=[row.label],extra={})=>({doi:row.doi,jobId:row.jobId,captureVersion:'6.2.20',controllerRevision:'2.2.30',final:true,status:'success',figuresDiscovered:labels.length,figuresStored:labels.length,figureLabels:labels,...extra});
test('completed packet map accepts only closed successful packets',completedPacketMap({reports:{items:[report(a.row),report(b1.row,[b1.row.label],{final:false})]}}).has(a.row.doi)&&!completedPacketMap({reports:{items:[report(b1.row,[b1.row.label],{final:false})]}}).has(b1.row.doi));

const root=await mkdtemp(path.join(tmpdir(),'tm230-packet-'));
try{
 await mkdir(path.join(root,'audit'),{recursive:true});await mkdir(path.join(root,'public'),{recursive:true});
 await writeFile(path.join(root,'audit/media-auto-policy.json'),JSON.stringify(policy));
 await writeFile(path.join(root,'audit/literature-update-state.json'),JSON.stringify({pendingScopeReviewBacklog:[]}));
 const papers=[a.row,b1.row].map((r,i)=>({doi:r.doi,journal:i?'Nature':'JACS',title:'Packet '+i,date:'2026-09-24'}));
 await writeFile(path.join(root,'public/papers.gz.b64'),gzipSync(Buffer.from(JSON.stringify(papers))).toString('base64'));
 for(const n of ['total-synthesis','manual-supplement','final-audit-supplement','curated-supplement','automation-supplement','rolling-supplement'])await writeFile(path.join(root,'public',n+'.json'),'{"papers":[]}');
 const mediaPath=path.join(root,'public/media-index.json'),ledgerPath=path.join(root,'public/body-publication-ledger.json');
 const bytes=new Map([[exactKey(a.row),a.raw],[exactKey(b1.row),b1.raw],[exactKey(b2.row),b2.raw]]);
 const record=doi=>({doi,toc:{doi,available:true,imageUrl:'media-mirror/toc.svg',reason:'local_vpn_official_toc'},figures:{doi,available:false,figures:[]}});
 const reset=async dois=>{await writeFile(mediaPath,JSON.stringify({items:Object.fromEntries(dois.map(d=>[d,record(d)]))}));await writeFile(ledgerPath,JSON.stringify({schemaVersion:1,count:0,items:[]}));};
 const local=row=>({doi:row.doi,kind:'official',captureVersion:'6.2.20',pageDoi:row.doi,mediaGeneration:BODY_MEDIA_GENERATION,updatedAt:row.updatedAt,articleUrl:row.articleUrl,sourceUrl:row.sourceUrl});
 const previous={policyId:policy.policyId,items:[],attempts:{}};
 const inputs=(rows,reports)=>({previous,live:{items:Object.fromEntries([...new Set(rows.map(x=>x.doi))].map(d=>[d,{doi:d,toc:{available:false},figures:{figures:[]}}]))},stage:{count:rows.length,items:rows},localCaptures:{count:rows.length,items:rows.map(local)},reports:{items:reports}});
 const decoder={decode:async row=>({width:row.width,height:row.height}),close:async()=>{}};
 const getNew=async row=>bytes.get(exactKey(row)),getOld=async()=>{throw new Error('unexpected_old_read');};

 await reset([a.row.doi]);
 const live=await mergeNewBodyAuto(root,{inputs:inputs([a.row],[report(a.row)]),now,decoder,getNew,getOld});
 test('completed one-article packet publishes immediately',live.status.publishedNewArticles===1&&live.status.added.length===1&&live.media.items[a.row.doi].figures.figures.length===1);
 test('same-build official TOC is preserved',live.media.items[a.row.doi].toc.reason==='local_vpn_official_toc');

 await reset([a.row.doi]);
 const unfinished=await mergeNewBodyAuto(root,{inputs:inputs([a.row],[report(a.row,[a.row.label],{final:false})]),now,decoder,getNew,getOld});
 test('unfinished packet does not publish',unfinished.status.added.length===0);

 const historical={...a.row,updatedAt:Date.parse(policy.backfillCapturedBefore)-20*60000};historical.reviewMarker=await buildBodyReviewMarker(historical,historical.sha256);
 await reset([historical.doi]);
 const backfill=await mergeNewBodyAuto(root,{inputs:inputs([historical],[]),now,decoder,getNew:async()=>a.raw,getOld});
 test('stable pre-cutover staged body figure backfills automatically',backfill.status.added.length===1);

 const recent={...a.row,updatedAt:Date.parse(policy.backfillCapturedBefore)+60000};recent.reviewMarker=await buildBodyReviewMarker(recent,recent.sha256);
 await reset([recent.doi]);
 const blocked=await mergeNewBodyAuto(root,{inputs:inputs([recent],[]),now,decoder,getNew:async()=>a.raw,getOld});
 test('post-cutover capture requires final packet',blocked.status.added.length===0);

 await reset([b1.row.doi]);
 const broken=new Map(bytes);broken.set(exactKey(b2.row),Buffer.alloc(b2.raw.length));
 const atomic=await mergeNewBodyAuto(root,{inputs:inputs([b1.row,b2.row],[report(b1.row,[b1.row.label,b2.row.label])]),now,decoder,getNew:async row=>broken.get(exactKey(row)),getOld});
 test('invalid member holds entire DOI packet',atomic.status.added.length===0&&atomic.media.items[b1.row.doi].figures.figures.length===0&&atomic.status.held.some(x=>x.doi===b1.row.doi&&String(x.reason).startsWith('packet_held:')));
}finally{await rm(root,{recursive:true,force:true});}
console.log('TM230_PACKET_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherRequests:0,minArticles:1,atomicPackets:true}));
