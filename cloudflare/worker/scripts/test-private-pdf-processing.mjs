import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyPrivatePdfVerification, listPrivatePdfProcessingQueue, privatePdfProcessingStatus, privatePdfProcessorRevision, servePrivatePdfProcessingFile } from '../src/private-pdf-processing.js';

const MIGRATION = `CREATE TABLE private_pdf_documents (
 id TEXT PRIMARY KEY, doi TEXT NOT NULL, publisher TEXT NOT NULL, article_url TEXT, source_url TEXT,
 version_kind TEXT NOT NULL, content_hash TEXT NOT NULL, r2_key TEXT NOT NULL, byte_length INTEGER NOT NULL,
 captured_at INTEGER NOT NULL, processing_state TEXT NOT NULL, active INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
` + fs.readFileSync(new URL('../../private-pdf-v3.sql', import.meta.url), 'utf8');
class Statement { constructor(owner,sql){this.owner=owner;this.sql=sql;this.args=[];} bind(...args){this.args=args;return this;}
  async first(){return this.owner.sqlite.prepare(this.sql).get(...this.args)||null;}
  async all(){return {success:true,results:this.owner.sqlite.prepare(this.sql).all(...this.args)};}
  async run(){const out=this.owner.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(out.changes||0)}};} }
class DB { constructor(schema=''){this.sqlite=new DatabaseSync(':memory:');if(schema)this.sqlite.exec(schema);} prepare(sql){return new Statement(this,sql);}
  async batch(statements){const results=[];this.sqlite.exec('BEGIN');try{for(const stmt of statements)results.push(await stmt.run());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
  close(){this.sqlite.close();} }
class Bucket { constructor(){this.map=new Map();} put(key,bytes,hash){this.map.set(key,{bytes:new Uint8Array(bytes),hash});}
  async head(key){const item=this.map.get(key);return item?{size:item.bytes.byteLength,customMetadata:{contentHash:item.hash}}:null;}
  async get(key){const item=this.map.get(key);return item?{body:item.bytes}:null;} }
function envFor(t) {
  const DB1=new DB(MIGRATION), LIT=new DB(`CREATE TABLE literature_catalog_generations(catalog_id TEXT,ready INTEGER,updated_at INTEGER);
CREATE TABLE literature_catalog_index(catalog_id TEXT,doi TEXT,title TEXT,authors_json TEXT,journal TEXT);
INSERT INTO literature_catalog_generations VALUES('cat',1,2);
INSERT INTO literature_catalog_index VALUES('cat','10.1021/jacs.6c12345','Fixture Article','["Alice Smith"]','JACS');`);
  t.after(()=>{DB1.close();LIT.close();}); const bucket=new Bucket(), bytes=new TextEncoder().encode('%PDF-1.7\n'+ 'A'.repeat(2000) +'\n%%EOF'), hash='a'.repeat(64);
  DB1.sqlite.prepare('INSERT INTO private_pdf_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('pdf_fixture','10.1021/jacs.6c12345','acs',
    'https://pubs.acs.org/x','https://pubs.acs.org/y','unknown',hash,'private/raw.pdf',bytes.byteLength,1,'raw',0,1,1);
  bucket.put('private/raw.pdf',bytes,hash); return {DB:DB1,LITERATURE_INDEX_DB:LIT,PDF_PRIVATE:bucket,PRIVATE_PDF_PROCESSING_ENABLED:'1'};
}
function request(evidence,decision='verified',overrides={}) { return new Request('https://api.test/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
  documentId:'pdf_fixture',doi:'10.1021/jacs.6c12345',contentHash:'a'.repeat(64),decision,processorRevision:privatePdfProcessorRevision(),evidence,...overrides})}); }
const good={pageCount:12,textChars:8000,doiMatch:true,titleScoreMilli:800,metadataTitleScoreMilli:0,authorMatches:1,supplementMarker:false,reason:'verified_identity'};

test('queue exposes bounded catalog metadata but no R2 key',async t=>{const env=envFor(t);const r=await listPrivatePdfProcessingQueue(new Request('https://x/queue?limit=8'),env);
  assert.equal(r.status,200);assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].catalog.title,'Fixture Article');assert.equal(JSON.stringify(r.body).includes('private/raw.pdf'),false);});
test('processing file requires exact document and hash',async t=>{const env=envFor(t);assert.equal((await servePrivatePdfProcessingFile(new Request('https://x/file?id=pdf_fixture&hash='+ 'b'.repeat(64)),env)).status,404);
  const ok=await servePrivatePdfProcessingFile(new Request('https://x/file?id=pdf_fixture&hash='+ 'a'.repeat(64)),env);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');});
test('insufficient evidence cannot activate',async t=>{const env=envFor(t);const r=await applyPrivatePdfVerification(request({...good,titleScoreMilli:100}),env);assert.equal(r.status,400);assert.equal(env.DB.sqlite.prepare('SELECT active FROM private_pdf_documents').get().active,0);});
test('verified identity activates ready document and records evidence',async t=>{const env=envFor(t);const r=await applyPrivatePdfVerification(request(good),env);assert.equal(r.status,200);assert.equal(r.body.active,true);
  assert.deepEqual(env.DB.sqlite.prepare('SELECT processing_state,active FROM private_pdf_documents').get(),{processing_state:'ready',active:1});assert.equal(env.DB.sqlite.prepare('SELECT status FROM private_pdf_verifications').get().status,'verified');});
test('failed identity stays private and may later be reverified',async t=>{const env=envFor(t);const failed={...good,doiMatch:false,titleScoreMilli:0,reason:'doi_missing'};
  assert.equal((await applyPrivatePdfVerification(request(failed,'failed'),env)).status,200);assert.deepEqual(env.DB.sqlite.prepare('SELECT processing_state,active FROM private_pdf_documents').get(),{processing_state:'failed',active:0});
  assert.equal((await applyPrivatePdfVerification(request(good),env)).status,200);assert.equal(env.DB.sqlite.prepare('SELECT active FROM private_pdf_documents').get().active,1);});
test('ready document cannot be downgraded by a later failure',async t=>{const env=envFor(t);await applyPrivatePdfVerification(request(good),env);const failed={...good,doiMatch:false,titleScoreMilli:0,reason:'doi_missing'};
  const r=await applyPrivatePdfVerification(request(failed,'failed'),env);assert.equal(r.status,409);assert.equal(env.DB.sqlite.prepare('SELECT active FROM private_pdf_documents').get().active,1);});
test('status reports raw and ready separately',async t=>{const env=envFor(t);let r=await privatePdfProcessingStatus(env);assert.equal(r.body.counts.raw,1);assert.equal(r.body.counts.ready,0);
  await applyPrivatePdfVerification(request(good),env);r=await privatePdfProcessingStatus(env);assert.equal(r.body.counts.raw,0);assert.equal(r.body.counts.ready,1);assert.equal(r.body.counts.active,1);});
