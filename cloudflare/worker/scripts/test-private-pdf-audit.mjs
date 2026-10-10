import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {
 beginPrivatePdfAudit,ingestPrivatePdfAudit,finishPrivatePdfAudit,
 probePrivatePdfAudit,readOwnerPdfAudit,recordOwnerPdfBrowserCheck,
} from '../src/private-pdf-audit.js';

const SQL=fs.readFileSync(new URL('../../private-pdf-audit-v1.sql',import.meta.url),'utf8');
class Statement {
 constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}
 bind(...v){this.args=v;return this}
 async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null}
 async all(){return{success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args)}}
 async run(){return this.db.sqlite.prepare(this.sql).run(...this.args)}
}
class DB {
 constructor(){
  this.sqlite=new DatabaseSync(':memory:');
  this.sqlite.exec('CREATE TABLE private_pdf_documents (id TEXT PRIMARY KEY,doi TEXT,publisher TEXT,version_kind TEXT,content_hash TEXT,r2_key TEXT,byte_length INTEGER,processing_state TEXT,active INTEGER,captured_at INTEGER);'+
    'CREATE TABLE private_pdf_verifications(document_id TEXT,content_hash TEXT,status TEXT,page_count INTEGER);'+
    'CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);'+
    'CREATE TABLE user_capabilities(user_id TEXT,capability TEXT);'+SQL);
 }
 prepare(sql){return new Statement(this,sql)}
 async batch(stmts){this.sqlite.exec('BEGIN IMMEDIATE');try{
  for(const stmt of stmts)await stmt.run();
  this.sqlite.exec('COMMIT');return[{success:true}];
 }catch(e){this.sqlite.exec('ROLLBACK');throw e}}
 close(){this.sqlite.close()}
}
const sha=s=>createHash('sha256').update(s).digest('hex');
const catalog='a'.repeat(64),commit='b'.repeat(40);
const doiA='10.1021/jacs.6c12345',doiB='10.1038/s41467-026-78405-z';
const doiC='10.1021/acscatal.6c10001',doiD='10.1016/j.chempr.2026.123456';
const items=[
 {doi:doiA,journal:'JACS',addedDate:'2026-10-10'},
 {doi:doiB,journal:'Nature Communications',addedDate:'2026-10-10'},
 {doi:doiC,journal:'ACS Catalysis',addedDate:'2026-09-30'},
 {doi:doiD,journal:'Chem',addedDate:'2026-10-09'},
];
const pdf=new TextEncoder().encode('%PDF-1.7\n'+ 'X'.repeat(1300)+'\n%%EOF\n');
const hash=sha(pdf);
function envOf(t,bad=false){
 const D=new DB(),env={DB:D};t.after(()=>D.close());
 const insert=(id,doi,status,active,size,key,digest)=>D.sqlite.prepare(
  'INSERT INTO private_pdf_documents VALUES(?,?,?,?,?,?,?,?,?,?)').run(
   id,doi,'acs','version_of_record',digest,key,size,status,active,Date.now());
 insert('docA',doiA,'ready',1,pdf.byteLength,'private/docA.pdf',hash);
 insert('docB',doiB,'raw',0,1234,'private/docB.pdf','b'.repeat(64));
 insert('docC',doiC,'failed',0,1234,'private/docC.pdf','c'.repeat(64));
 D.sqlite.prepare('INSERT INTO private_pdf_verifications VALUES(?,?,?,?)').run('docA',hash,'verified',12);
 for(const [token,user] of [['owner-secret','owner'],['reader-secret','reader']])
  D.sqlite.prepare('INSERT INTO user_sessions VALUES(?,?,?)').run(sha(token),user,Date.now()+1000000);
 for(const cap of ['private_pdf_owner','private_pdf_read'])
  D.sqlite.prepare('INSERT INTO user_capabilities VALUES(?,?)').run('owner',cap);
 D.sqlite.prepare('INSERT INTO user_capabilities VALUES(?,?)').run('reader','private_pdf_read');
 env.PDF_PRIVATE={
  async head(key){return key==='private/docA.pdf'?{size:pdf.length,customMetadata:{contentHash:hash}}:null},
  async get(key,{range}){
   if(key!=='private/docA.pdf')return null;
   const b=pdf.subarray(range.offset,range.offset+range.length);
   return{arrayBuffer:async()=>bad?new Uint8Array(0).buffer:
    b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
  },
 };
 return env;
}
const request=(token,params='')=>new Request(
  'https://api.gczhouwld.com/api/user-ui/private-pdf/audit'+params,
  {headers:token?{authorization:'Bearer '+token}:{}});
async function complete(env){
 assert.equal((await beginPrivatePdfAudit(env,{catalogId:catalog,sourceCommit:commit,expectedCount:4})).status,200);
 assert.equal((await ingestPrivatePdfAudit(env,{catalogId:catalog,items})).body.accepted,4);
 assert.equal((await finishPrivatePdfAudit(env,{catalogId:catalog})).status,200);
}
test('catalog cannot claim partial coverage or accept duplicates',async t=>{
 const env=envOf(t);
 assert.equal((await beginPrivatePdfAudit(env,{catalogId:catalog,sourceCommit:commit,expectedCount:4})).status,200);
 assert.equal((await finishPrivatePdfAudit(env,{catalogId:catalog})).status,409);
 assert.equal((await ingestPrivatePdfAudit(env,{catalogId:catalog,items:[items[0],items[0]]})).status,400);
 assert.equal((await ingestPrivatePdfAudit(env,{catalogId:catalog,items})).body.accepted,4);
 assert.equal((await finishPrivatePdfAudit(env,{catalogId:catalog})).body.checkedCount,4);
 assert.equal((await beginPrivatePdfAudit(env,{catalogId:catalog,sourceCommit:commit,expectedCount:5})).status,409);
 assert.equal((await beginPrivatePdfAudit(env,{catalogId:catalog,sourceCommit:commit,expectedCount:4})).body.alreadyComplete,true);
});
test('reports are strictly owner-only and do not expose R2 keys/tickets/hashes',async t=>{
 const env=envOf(t);await complete(env);
 assert.equal((await readOwnerPdfAudit(request(''),env)).status,401);
 assert.equal((await readOwnerPdfAudit(request('reader-secret'),env)).status,403);
 const page=await readOwnerPdfAudit(request('owner-secret','?limit=2'),env);
 assert.equal(page.status,200);assert.equal(page.body.expectedCount,4);
 assert.equal(page.body.summary.total,4);
 for(const key of ['ready','pending','failed','missing'])assert.equal(page.body.summary[key],1);
 assert.equal(page.body.items.length,2);assert.equal(page.body.hasMore,true);
 const next=await readOwnerPdfAudit(request('owner-secret','?limit=2&after='+encodeURIComponent(page.body.nextAfter)),env);
 assert.equal(next.body.items.length,2);assert.equal(next.body.hasMore,false);
 const body=JSON.stringify(page.body)+JSON.stringify(next.body);
 assert(!body.includes('private/docA.pdf')&&!body.includes(hash)&&!body.includes('owner-secret'));
 assert.equal((await readOwnerPdfAudit(request('owner-secret','?status=unknown'),env)).status,400);
});
test('R2 prefix/trailer is actual small-byte storage proof, not HTTP206/browser proof',async t=>{
 const env=envOf(t);await complete(env);
 const check=await probePrivatePdfAudit(env,{limit:6});
 assert.equal(check.body.probed,1);assert.equal(check.body.passed,1);
 const report=await readOwnerPdfAudit(request('owner-secret','?status=probe_pass'),env);
 assert.equal(report.body.items.length,1);
 assert.equal(report.body.items[0].storageProbe,'pass');
 assert.equal(report.body.items[0].identityVerified,true);
 assert.equal(report.body.items[0].browser,'untested');
});
test('truncated R2 range fails and cannot be misclassified as pass',async t=>{
 const env=envOf(t,true);await complete(env);
 const result=await probePrivatePdfAudit(env,{limit:6});
 assert.equal(result.body.passed,0);assert.equal(result.body.failed,1);
 const report=await readOwnerPdfAudit(request('owner-secret','?status=probe_failed'),env);
 assert.equal(report.body.items[0].probeReason,'r2_range_incomplete');
});
test('only owner may attest real two pages; ready DOI required',async t=>{
 const env=envOf(t);await complete(env);
 const evidence={doi:doiA,result:'two_pages_rendered'};
 assert.equal((await recordOwnerPdfBrowserCheck(request('reader-secret'),env,evidence)).status,403);
 assert.equal((await recordOwnerPdfBrowserCheck(request('owner-secret'),env,{doi:doiD,result:'two_pages_rendered'})).status,409);
 assert.equal((await recordOwnerPdfBrowserCheck(request('owner-secret'),env,evidence)).status,200);
 const report=await readOwnerPdfAudit(request('owner-secret','?status=browser_pass'),env);
 assert.equal(report.body.items[0].browser,'owner_reported_pass');
 assert.equal(report.body.summary.owner_reported_browser_pass,1);
});
test('different PDF version clears old R2 and owner browser success',async t=>{
 const env=envOf(t);await complete(env);
 await probePrivatePdfAudit(env,{limit:6});
 await recordOwnerPdfBrowserCheck(request('owner-secret'),env,{doi:doiA,result:'two_pages_rendered'});
 env.DB.sqlite.prepare('UPDATE private_pdf_documents SET active=0 WHERE id=?').run('docA');
 env.DB.sqlite.prepare('INSERT INTO private_pdf_documents VALUES(?,?,?,?,?,?,?,?,?,?)').run(
  'docAnew',doiA,'acs','version_of_record','c'.repeat(64),'private/new.pdf',3000,'ready',1,Date.now()+1);
 await ingestPrivatePdfAudit(env,{catalogId:catalog,items:[items[0]]});
 const report=await readOwnerPdfAudit(request('owner-secret','?status=ready'),env);
 assert.equal(report.body.items[0].storageProbe,'untested');
 assert.equal(report.body.items[0].browser,'untested');
 assert.equal(report.body.items[0].identityVerified,false);
});
