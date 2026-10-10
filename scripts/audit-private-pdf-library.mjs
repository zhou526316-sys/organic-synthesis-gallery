import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DATA_FILES, collectPapers, assertPartition } from './pages-release-delivery.mjs';
import { isExcludedDoi } from '../shared/literature-policy.js';

// Single bounded daily run. Read only public catalog from main; private PDF
// probes happen inside the canonical Worker against owner-protected R2.
// No bearer, file ticket, R2 key, session ID or PDF bytes appear in logs.
const API = 'https://api.gczhouwld.com';
const token = String(process.env.BRIDGE_WRITE_TOKEN || '');
const output = String(process.env.PRIVATE_PDF_AUDIT_OUTPUT || '');
const probeMax = Math.max(0,Math.min(180,Number(process.env.PRIVATE_PDF_AUDIT_PROBE_MAX || 120)));
if(!token) throw new Error('audit_maintenance_credential_unavailable');
const mainSha = String(process.env.GITHUB_SHA ||
  execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
if(!/^[a-f0-9]{40}$/.test(mainSha)) throw new Error('audit_snapshot_invalid');
const inputs=Object.fromEntries(DATA_FILES.map(file=>[file,fs.readFileSync('public/'+file,'utf8')]));
const marker=JSON.parse(fs.readFileSync('audit/publication-release-state.json','utf8'));
const papers=collectPapers(inputs,isExcludedDoi);
assertPartition(marker,[...papers.keys()]);
const items=[...papers.values()].map(item=>({
  doi:item.doi,
  journal:String(item.journal||'Other').trim().slice(0,100)||'Other',
  addedDate:/^\d{4}-\d{2}-\d{2}$/.test(String(item.addedDate||''))?item.addedDate:'',
})).sort((a,b)=>a.doi.localeCompare(b.doi,'en'));
if(items.length!==new Set(items.map(p=>p.doi)).size)throw Error('audit_duplicate_doi');
const catalogId=crypto.createHash('sha256').update(items.map(p=>p.doi).join('\n')).digest('hex');
const report={schemaVersion:1,suite:'private-pdf-library-audit-v1',ok:false,
  sourceCommit:mainSha,catalogId,expectedCount:items.length,
  submitted:0,batches:0,probed:0,storagePass:0,storageFail:0,
  startedAt:new Date().toISOString(),status:'not_started'};
function save(){
  if(!output)return;
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
async function maintenance(command,payload){
  let response;
  try{
    response=await fetch(API+'/api/admin/private-pdf/audit/'+command,{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(payload),
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
    });
  } catch {throw new Error('audit_maintenance_network_error_'+command);}
  let body;
  try{body=await response.json();}
  catch{throw new Error('audit_maintenance_body_invalid_'+command);}
  if(!response.ok||body?.ok!==true)
    throw new Error('audit_maintenance_'+command+'_'+response.status+'_'+
      (String(body?.error||'failed').replace(/[^a-z0-9_]/g,'').slice(0,60)));
  return body;
}
try{
  report.status='catalog_staging';save();
  await maintenance('begin',{catalogId,sourceCommit:mainSha,expectedCount:items.length});
  for(let start=0;start<items.length;start+=24){
    const chunk=items.slice(start,start+24);
    const result=await maintenance('ingest',{catalogId,items:chunk});
    if(result.accepted!==chunk.length)throw new Error('audit_unexpected_ingested_count');
    report.submitted+=chunk.length;report.batches++;
    save();
  }
  const commit=await maintenance('finish',{catalogId});
  if(commit.checkedCount!==items.length)throw new Error('audit_catalog_not_complete');
  report.status='storage_probing';save();
  for(let done=0;done<probeMax;done+=6){
    const check=await maintenance('probe',{limit:Math.min(6,probeMax-done)});
    report.probed+=check.probed;report.storagePass+=check.passed;
    report.storageFail+=check.failed;save();
    if(check.probed<Math.min(6,probeMax-done))break;
  }
  report.status='finished';report.ok=true;
} catch(error) {
  report.status='failed';report.error=String(error?.message||error).slice(0,200);
} finally {
  report.completedAt=new Date().toISOString();save();
}
// Aggregate-only console. No DOIs/private document identities.
console.log(JSON.stringify({suite:report.suite,ok:report.ok,status:report.status,
  expected:report.expectedCount,submitted:report.submitted,
  batches:report.batches,probed:report.probed,
  storagePass:report.storagePass,storageFail:report.storageFail,
  error:report.error||null}));
if(!report.ok)process.exitCode=1;
