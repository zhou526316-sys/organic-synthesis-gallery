// Read-only, owner-authenticated aggregation of historic text diagnostics.
// Raw D1 events are never printed, stored in artifacts, or committed.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const ORIGIN='https://api.gczhouwld.com';
const PATH='/api/admin/historical-text/reports';
const token=String(process.env.BRIDGE_WRITE_TOKEN||'').trim();
const output=join(process.env.RUNNER_TEMP||'/tmp','historical-text-aggregate.json');
const n=Object.create(null);
const count=(record,key)=>{const k=String(key||'unknown').slice(0,80);record[k]=(record[k]||0)+1;};
function cleanReport(items,hasMore){
  const runs=new Map();
  const report={
    schemaVersion:'historical-text-diagnostic-summary-v1',readOnly:true,
    rawEventsReleased:0,bodyReleased:false,recordLimit:200,
    eventsRead:items.length,pagesRead:Math.ceil(items.length/100),
    moreEventsExist:hasMore,attempts:0,finalResults:0,
    checkpointOnlyAttempts:0,duplicateFinalResults:0,
    byPublisher:{},byReason:{},byHttpStatus:{},byVersion:{},
    byFinalStage:{},byResultStatus:{},byDay:{},byVersionAndReason:{},
    versionProvenanceWarning:null,
  };
  for(const event of items){
    if(!event||typeof event!=='object')continue;
    count(report.byVersion,event.scriptVersion);
    const day=String(event.occurredAt||'').slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(day))count(report.byDay,day);
    const doi=String(event.doi||''),job=String(event.jobId||'');
    if(!/^10\.\d{4,9}\/\S+$/.test(doi)||!job)continue;
    const key=doi+'\n'+job;
    if(!runs.has(key))runs.set(key,[]);
    runs.get(key).push(event);
  }
  report.attempts=runs.size;
  for(const events of runs.values()){
    const finals=events.filter(e=>e.kind==='final_result');
    if(finals.length>1)report.duplicateFinalResults++;
    const row=finals.at(-1)||events.at(0);
    if(!row)continue;
    if(finals.length)report.finalResults++;else report.checkpointOnlyAttempts++;
    count(report.byPublisher,row.publisher);
    count(report.byReason,row.reasonCode);
    count(report.byHttpStatus,row.httpStatus==null?'unknown':String(row.httpStatus));
    count(report.byFinalStage,row.stage);
    count(report.byResultStatus,row.status);
    count(report.byVersionAndReason,String(row.scriptVersion||'?')+'/'+String(row.reasonCode||'?'));
  }
  if(report.byVersion['0.2.2']&&!report.byVersion['0.2.3'])
    report.versionProvenanceWarning='v0.2.3 currently hardcodes v0.2.2 in diagnostics; source-version inference unavailable';
  return report;
}
const result={ok:false,readOnly:true,rawEventsReleased:0,bodyReleased:false};
try{
  if(!token)throw Error('owner_credential_missing');
  const all=[],seen=new Set();
  let before=0,beforeEventId='',more=false,pages=0;
  for(let i=0;i<2;i++){
    const url=new URL(PATH,ORIGIN);
    url.searchParams.set('limit','100');
    if(before){url.searchParams.set('before',String(before));url.searchParams.set('beforeEventId',beforeEventId);}
    const response=await fetch(url,{headers:{authorization:'Bearer '+token,accept:'application/json','cache-control':'no-store'},signal:AbortSignal.timeout(13000)});
    if(!response.ok)throw Error('report_http_'+response.status);
    const body=await response.json();
    if(body.schemaVersion!=='historical-text-diagnostic-v1'||!Array.isArray(body.items)||body.items.length>100)
      throw Error('report_schema_mismatch');
    for(const row of body.items){
      if(typeof row?.eventId!=='string'||seen.has(row.eventId))throw Error('report_duplicate_event');
      seen.add(row.eventId);all.push(row);
    }
    pages++;
    more=body.hasMore===true;
    if(!more)break;
    before=Number(body.nextBefore);
    beforeEventId=String(body.nextBeforeEventId||'');
    if(!Number.isSafeInteger(before)||before<1||!/^[a-z0-9:_-]{11,128}$/i.test(beforeEventId))
      throw Error('report_cursor_invalid');
  }
  Object.assign(result,cleanReport(all,more),{ok:true,pagesRead:pages});
}catch(e){
  const msg=String(e?.message||'');
  result.error=/^report_http_\d{3}$/.test(msg)||['owner_credential_missing','report_schema_mismatch','report_duplicate_event','report_cursor_invalid'].includes(msg)?msg:'report_read_unavailable';
  process.exitCode=1;
}
await mkdir(process.env.RUNNER_TEMP||'/tmp',{recursive:true});
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log('HISTORICAL_DIAGNOSTICS_AGGREGATE '+JSON.stringify(result));
