import {readFile,writeFile} from 'node:fs/promises';

const queue=JSON.parse(await readFile('public/toc-demand-live.json','utf8'));
const target=(queue.articles||[]).filter(x=>x.addedDate==='2026-10-08')
  .map(x=>({doi:String(x.doi||'').toLowerCase(),journal:x.journal||''}));
const dois=target.map(x=>x.doi);
const primary='https://api.gczhouwld.com';
const fallback='https://organic-synthesis-gallery.zhou526316.workers.dev';
async function jsonEndpoint(path, options, cap=6_000_000){
  let last='';
  for(const origin of [primary,fallback]){
    try{
      const url=origin+path;
      const response=await fetch(url,{...options,
        headers:{'cache-control':'no-cache',...options?.headers},
        signal:AbortSignal.timeout(14000)});
      if(!response.ok)throw Error('http_'+response.status);
      const length=Number(response.headers.get('content-length')||0);
      if(length>cap)throw Error('oversized_'+length);
      const chunks=[];let total=0;
      for await(const chunk of response.body){
        total+=chunk.byteLength;if(total>cap)throw Error('oversized_stream');
        chunks.push(chunk);
      }
      return {data:JSON.parse(Buffer.concat(chunks.map(z=>Buffer.from(z))).toString('utf8')),
        origin,bytes:total};
    }catch(e){last=String(e?.message||e);}
  }
  return {error:last||'unavailable'};
}
const [production,captures,diagnostics,reports]=await Promise.all([
  jsonEndpoint('/api/media/inventory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dois,readOnly:true})}),
  jsonEndpoint('/api/media/local-capture-index?diagnose='+Date.now(),{method:'GET'}),
  jsonEndpoint('/api/media/local-diagnostics?diagnose='+Date.now(),{method:'GET'}),
  jsonEndpoint('/api/media/tampermonkey-reports?limit=200&diagnose='+Date.now(),{method:'GET'})
]);
const prod=new Map((production.data?.items||[]).map(x=>[String(x.doi||'').toLowerCase(),x]));
const tocIndex=new Map();
for(const rec of captures.data?.items||[]){
 const doi=String(rec.doi||'').toLowerCase();
 if(dois.includes(doi)){
  const list=tocIndex.get(doi)||[];list.push({kind:rec.kind||'',hasUrl:Boolean(rec.imageUrl),hasHash:Boolean(rec.contentHash),updatedAt:rec.updatedAt||0});
  tocIndex.set(doi,list);
 }
}
const receipt=(diagnostics.data?.traces||[]).filter(t=>dois.includes(String(t.doi||'').toLowerCase()));
const reportsMap=new Map((reports.data?.items||[]).map(r=>[String(r.doi||'').toLowerCase(),r]));
const byDoi=new Map();
for(const t of receipt){
 const doi=String(t.doi||'').toLowerCase(),arr=byDoi.get(doi)||[];
 arr.push({status:t.status||'',reason:String(t.reason||'').slice(0,100),
   finishedAt:t.finishedAt||'',failureStages:(t.trace||[]).filter(ev=>ev.event==='failed'||ev.status==='low')
      .slice(-3).map(ev=>({stage:ev.stage||'',status:ev.status||'',http:Number(ev.httpStatus||0)}))});
 byDoi.set(doi,arr);
}
const rows=target.map(p=>{
 const m=prod.get(p.doi)||{};
 const idx=tocIndex.get(p.doi)||[];
 const traces=(byDoi.get(p.doi)||[]).sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)));
 return {
   doi:p.doi,journal:p.journal,inventoryPresent:prod.has(p.doi),
   tocStored:m.tocStored===true,primaryKind:m.primaryKind||'',
   figure1Stored:m.figureOneStored===true,
   figureCount:Number(m.figureCount||0),
   localTocReceipts:idx.filter(z=>z.hasUrl&&z.hasHash).length,
   lastCapture:traces[0]||null,
   reportStatus:String(reportsMap.get(p.doi)?.status||''),
   reportReason:String(reportsMap.get(p.doi)?.reason||reportsMap.get(p.doi)?.lastFailureReason||'').slice(0,130),
   reportAttempts:Number(reportsMap.get(p.doi)?.attemptCount||0)
 };
});
const summary={
 checkedAt:new Date().toISOString(),
 queueGeneratedAt:queue.generatedAt,
 cohort:'Gallery addedDate=2026-10-08',total:rows.length,
 productionComplete:production.data?.items?.length===rows.length,
 productMediaUrl:production.origin||'',localCaptureUrl:captures.origin||'',diagnosticsUrl:diagnostics.origin||'',
 tocStored:rows.filter(x=>x.tocStored).length,
 figureOneStored:rows.filter(x=>x.figure1Stored).length,
 anyPrimary:rows.filter(x=>x.tocStored||x.figure1Stored||x.primaryKind).length,
 noProductionVisual:rows.filter(x=>!(x.tocStored||x.figure1Stored||x.primaryKind)).length,
 stagedMainVisual:rows.filter(x=>x.localTocReceipts>0).length,
 reportedCaptureTraces:rows.filter(x=>x.lastCapture).length,
 reportedCaptureIndex:rows.filter(x=>x.reportStatus||x.reportAttempts).length,
 reportedFailures:rows.filter(x=>/^(?:failed|partial|blocked)$/i.test(x.reportStatus)).length,
 errors:{production:production.error||'',captures:captures.error||'',diagnostics:diagnostics.error||'',reports:reports.error||''},
 readOnly:true,publisherRequests:0,productionWrites:0
};
const report={summary,rows};
const path=process.env.RUNNER_TEMP+'/tm-oct08-live-media-read.json';
await writeFile(path,JSON.stringify(report,null,2));
console.log('TM_OCT08_LIVE_SUMMARY '+JSON.stringify(summary));
console.log('TM_OCT08_LIVE_ROWS '+JSON.stringify(rows));
