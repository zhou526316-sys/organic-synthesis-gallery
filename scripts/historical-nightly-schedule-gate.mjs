/**
 * Idempotency guard for historical candidate-only GitHub scheduled discovery.
 * The 23:09 backup skips when 23:00 already wrote a staging checkpoint.
 * An explicitly authorized push / workflow_dispatch remains a manual override.
 */
import {readFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function beijingParts(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw Error('historical_schedule_invalid_timestamp');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:[parts.year,parts.month,parts.day].join('-'),hour:Number(parts.hour)};
}

export function shouldRunHistoricalNight(eventName,state,now=new Date()){
  if(eventName!=='schedule')return true;
  if(!state||!state.lastRunStarted)return true;
  const previous=beijingParts(state.lastRunStarted),current=beijingParts(now);
  return !(previous.day===current.day&&previous.hour>=22);
}

export async function runHistoricalScheduleGate({
  eventName=process.env.GALLERY_HISTORY_EVENT,now=new Date(),
  path='audit/historical-staging/state.json',output=process.env.GITHUB_OUTPUT
}={}){
  if(!output)throw Error('historical_schedule_missing_actions_output');
  let state=null;
  try{state=JSON.parse(await readFile(path,'utf8'))}
  catch(error){if(error?.code!=='ENOENT')throw error}
  const run=shouldRunHistoricalNight(eventName,state,now);
  await appendFile(output,'run='+(run?'true':'false')+'\n','utf8');
  console.log('HISTORICAL_NIGHT_GATE '+JSON.stringify({
    event:eventName,run,prior:state?.lastRunStarted||null,
    mode:'candidate_discovery_only'
  }));
  return run;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await runHistoricalScheduleGate()}catch(error){
    console.error('HISTORICAL_NIGHT_GATE_BLOCKED',String(error?.message||error));
    process.exitCode=1;
  }
}
