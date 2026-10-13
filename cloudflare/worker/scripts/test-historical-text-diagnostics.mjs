import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {importHistoricalDiagnostic,listHistoricalDiagnostics,REPORT_SCHEMA} from '../src/historical-text-diagnostics.js';

class D1Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){const r=this.db.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0)}};}
  async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args)};}
}
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){return new D1Statement(this,sql);}
  close(){this.sqlite.close();}
}
const base=(overrides={})=>({
  schemaVersion:REPORT_SCHEMA,eventId:'history_aaaaaaaaaaaaaaaaaaaa',doi:'10.1021/jacs.6c11111',
  runId:'run_aaaaaaaaaaaaaaaaaaa',jobId:'job_aaaaaaaaaaaaaaaaaaa',
  kind:'final_result',status:'failed',stage:'publisher_wait',
  reasonCode:'publisher_no_response',httpStatus:null,publisher:'acs',
  pageDoiVerified:false,sectionCount:0,evidenceChars:0,scriptVersion:'0.2.2',
  occurredAt:new Date().toISOString(),...overrides,
});
test('diagnostics D1 idempotent receipts and independently queryable histories',async t=>{
  const db=new D1();t.after(()=>db.close());const env={DB:db};
  const first=await importHistoricalDiagnostic(env,base());
  assert.equal(first.status,200);assert.equal(first.body.stored,true);
  assert.equal(first.body.doi,'10.1021/jacs.6c11111');
  const twice=await importHistoricalDiagnostic(env,base({occurredAt:new Date(Date.now()-500).toISOString()}));
  assert.equal(twice.status,200);
  const entries=await listHistoricalDiagnostics(env,{doi:'10.1021/jacs.6c11111'});
  assert.equal(entries.status,200);assert.equal(entries.body.count,1);
  assert.equal(entries.body.items[0].reasonCode,'publisher_no_response');
  assert.equal(entries.body.items[0].httpStatus,null);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM historical_text_capture_reports_v1").get().n,1);
  const unrelated=await importHistoricalDiagnostic(env,base({doi:'10.1021/jacs.6c22222'}));
  assert.equal(unrelated.status,409,'same event ID may not represent another article');
  assert.equal((await listHistoricalDiagnostics(env,{doi:'10.1021/jacs.6c22222'})).body.count,0);
});
test('no article bodies, urls, cookies, keys or arbitrary trace allowed',async t=>{
  const db=new D1();t.after(()=>db.close());const env={DB:db};
  for(const extra of [
    {articleText:'whole copyrighted paper'},
    {text:'experiment'},
    {trace:[{secret:'x'}]},
    {cookie:'admin'},
    {token:'abcd'},
    {pageUrl:'https://publisher.example/query?token=x'},
    {httpStatus:0},
    {reasonCode:'made-up-network-error'},
    {status:'unknown'},
    {publisher:'malicious-domain'},
    {eventId:'x'},
    {doi:'10.1021/a?token=secret'},
    {pageDoiVerified:'true'},
  ]){
    const result=await importHistoricalDiagnostic(env,base(extra));
    assert.equal(result.status,400,'should reject extra '+Object.keys(extra));
  }
  assert.equal((await listHistoricalDiagnostics(env,{})).body.count,0);
});
test('server enforces metadata-only bounds, paginator and DOI/status filters',async t=>{
  const db=new D1();t.after(()=>db.close());const env={DB:db};
  for(let i=0;i<6;i++){
    const p=base({eventId:'history_aaaaaaaaaaaaaaaaaa'+i,
      doi:i%2?'10.1021/jacs.6c22222':'10.1021/jacs.6c11111',
      kind:i%2?'failure_checkpoint':'final_result',
      status:i%2?'blocked':'failed',stage:i%2?'license':'publisher_wait',
      reasonCode:i%2?'license_not_verified':'publisher_no_response',
    });
    assert.equal((await importHistoricalDiagnostic(env,p)).status,200);
  }
  const blocked=await listHistoricalDiagnostics(env,{status:'blocked',limit:10});
  assert.equal(blocked.body.count,3);assert.ok(blocked.body.items.every(x=>x.status==='blocked'));
  const first=await listHistoricalDiagnostics(env,{limit:2});
  assert.equal(first.body.count,2);assert.equal(first.body.hasMore,true);
  const only=await listHistoricalDiagnostics(env,{doi:'10.1021/jacs.6c22222'});
  assert.equal(only.body.count,3);
  assert.equal((await listHistoricalDiagnostics(env,{doi:'not_a_doi'})).status,400);
  assert.equal((await listHistoricalDiagnostics(env,{status:'unknown'})).status,400);
  assert.equal((await listHistoricalDiagnostics(env,{before:-1})).status,400);
  assert.equal((await importHistoricalDiagnostic({DB:null},base())).status,503);
  const route=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  const gate=route.indexOf("if (request.method === 'POST' && url.pathname === '/api/admin/historical-text/reports')");
  assert.ok(gate>route.indexOf('const isWriteRoute')&&
    route.slice(route.indexOf('const isWriteRoute'),gate).includes("'/api/admin/historical-text/reports'"),
    'diagnostics route cannot bypass existing owner write token');
  assert.ok(route.includes("if (request.method === 'GET' && url.pathname === '/api/admin/historical-text/reports')"));
  assert.ok(route.includes("const denied=requireWriteAuthorization(request,env);"),
    'reads must also demand owner token');
});
