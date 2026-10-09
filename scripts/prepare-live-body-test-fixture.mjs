import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const SITE='https://gallery.gczhouwld.com/';
const LIMIT=20_000_000;
const out=path.join(process.env.RUNNER_TEMP||'/tmp','auto-fixture');
async function get(url,max=LIMIT){
  const target=new URL(url,SITE);
  assert.equal(target.origin,new URL(SITE).origin,'only immutable published Gallery assets');
  assert.ok(/^\/(?:auto-body-publication\.json|media-mirror\/body-auto-[a-f0-9]{64}\.(?:svg|png))$/.test(target.pathname),
    'unexpected body fixture URL');
  const r=await fetch(target.href,{redirect:'error',headers:{'cache-control':'no-cache'},
    signal:AbortSignal.timeout(22000)});
  assert.equal(r.status,200,'fixture HTTP '+r.status+' '+target.pathname);
  const len=Number(r.headers.get('content-length')||0);
  assert.ok(!len||len<=max,'fixture response oversized');
  const b=Buffer.from(await r.arrayBuffer());
  assert.ok(b.length>0&&b.length<=max,'fixture payload size');
  return b;
}
const data=JSON.parse((await get('auto-body-publication.json',LIMIT)).toString('utf8'));
assert.ok(data?.count>=9&&Array.isArray(data.items)&&data.items.length===data.count,
  'public signed fixture manifest missing');
const eligible=data.items.filter(item=>{
  const row=item.record||{};
  return ['image/svg+xml','image/png'].includes(row.contentType) &&
    /^[a-f0-9]{64}$/.test(String(row.sha256||'')) &&
    Number(row.byteLength)>200&&Number(row.byteLength)<=2_500_000 &&
    row.reviewMarker?.revision==='1'&&row.reviewMarker?.state==='pending_review' &&
    Number(row.mediaGeneration)===1790082000000 &&
    /^media-mirror\/body-auto-[a-f0-9]{64}\.(svg|png)$/.test(String(item.imageUrl||''));
});
const seen=new Set();
const sample=[];
for(const [type,wanted] of [['image/svg+xml',5],['image/png',4]]){
  for(const item of eligible){
    if(sample.filter(s=>s.record.contentType===type).length>=wanted)break;
    if(item.record.contentType!==type||seen.has(item.record.sha256))continue;
    seen.add(item.record.sha256);
    sample.push(item);
  }
  assert.equal(sample.filter(s=>s.record.contentType===type).length,wanted,
    'enough current published '+type+' fixtures are required');
}
await mkdir(path.join(out,'images'),{recursive:true});
const evidence={schemaVersion:1,readOnly:true,origin:'verified_published_Gallery_auto_body',
  generatedAt:new Date().toISOString(),errors:[],images:[]};
for(let i=0;i<sample.length;i++){
  const item=sample[i],row=item.record;
  const ext=row.contentType==='image/svg+xml'?'svg':'png';
  const name='images/next-'+String(i+1).padStart(3,'0')+'.'+ext;
  const bytes=await get(item.imageUrl,2_500_000);
  const digest=createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest,row.sha256,'remote bytes differ from audited published digest');
  assert.equal(bytes.length,Number(row.byteLength),'verified published byte length mismatch');
  await writeFile(path.join(out,name),bytes);
  evidence.images.push({...row,file:name});
}
await writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('TM_LIVE_BODY_FIXTURE '+JSON.stringify({images:evidence.images.length,
  svg:evidence.images.filter(x=>x.contentType==='image/svg+xml').length,
  png:evidence.images.filter(x=>x.contentType==='image/png').length,
  distinctPublisherDois:new Set(evidence.images.map(x=>x.doi)).size,
  sha256Verified:true,remoteMutation:false,publisherRequests:0,privatePdfRequests:0}));
