import assert from 'node:assert/strict';
import { bootstrapPrivatePdfOwner, openPrivatePdf, privatePdfStatus, servePrivatePdf } from '../src/private-pdf.js';

const now = Date.now();
const encoder = new TextEncoder();
async function sha256(value) {
  const d = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

class FakeStatement {
  constructor(db, sql) { this.db=db; this.sql=sql.replace(/\s+/g,' ').trim(); this.args=[]; }
  bind(...args) { this.args=args; return this; }
  async first() {
    const q=this.sql, a=this.args, db=this.db;
    if(q.includes('FROM user_sessions WHERE token_hash')) return db.sessions.get(a[0]) || null;
    if(q.includes('FROM user_email_verifications WHERE user_id')) return db.verified.has(a[0]) ? {ok:1}:null;
    if(q.includes('FROM user_capabilities WHERE capability = ? LIMIT 1')) {
      for(const [key] of db.capabilities) { const [u,c]=key.split('|'); if(c===a[0]) return {user_id:u}; } return null;
    }
    if(q.includes('FROM user_capabilities WHERE user_id = ? AND capability = ?')) return db.capabilities.has(a[0]+'|'+a[1])?{ok:1}:null;
    if(q.includes('FROM private_pdf_documents') && q.includes('WHERE doi = ?')) {
      const rows=[...db.documents.values()].filter(x=>x.doi===a[0]&&x.active===1);
      rows.sort((x,y)=>y.captured_at-x.captured_at); return rows[0]||null;
    }
    if(q.includes('FROM private_pdf_access_tokens t')) {
      const token=db.tokens.get(a[1]); if(!token)return null;
      const doc=db.documents.get(token.document_id); if(!doc||doc.active!==1)return null;
      if(!db.capabilities.has(token.user_id+'|'+a[0]))return null;
      return {...token,doi:doc.doi,r2_key:doc.r2_key,byte_length:doc.byte_length};
    }
    throw new Error('Unhandled first: '+q);
  }
  async all() {
    const q=this.sql,a=this.args,db=this.db;
    if(q.includes('SELECT capability FROM user_capabilities WHERE user_id')) {
      return {results:[...db.capabilities.keys()].filter(k=>k.startsWith(a[0]+'|')).map(k=>({capability:k.split('|')[1]})).sort((x,y)=>x.capability.localeCompare(y.capability))};
    }
    throw new Error('Unhandled all: '+q);
  }
  async run() {
    const q=this.sql,a=this.args,db=this.db;
    if(q.startsWith('INSERT INTO user_capabilities')) { db.capabilities.set(a[0]+'|'+a[1],{user_id:a[0],capability:a[1],granted_at:a[2]}); return {success:true}; }
    if(q.startsWith('INSERT INTO private_pdf_access_tokens')) { db.tokens.set(a[0],{token_hash:a[0],user_id:a[1],document_id:a[2],created_at:a[3],expires_at:a[4]}); return {success:true}; }
    if(q.startsWith('DELETE FROM private_pdf_access_tokens')) { db.tokens.delete(a[0]); return {success:true}; }
    throw new Error('Unhandled run: '+q);
  }
}
class FakeDB {
  constructor(){this.sessions=new Map();this.verified=new Set();this.capabilities=new Map();this.documents=new Map();this.tokens=new Map();this.firstCalls=0;}
  prepare(sql){
    const stmt=new FakeStatement(this,sql);
    const original=stmt.first.bind(stmt);
    stmt.first=async()=>{this.firstCalls++;return original();};
    return stmt;
  }
}
class FakeBucket {
  constructor(){this.objects=new Map();this.headCalls=0;this.getCalls=0;}
  put(key,bytes){this.objects.set(key,bytes);}
  async head(key){this.headCalls++;const b=this.objects.get(key);return b?{size:b.length}:null;}
  async get(key,opt){this.getCalls++;const b=this.objects.get(key);if(!b)return null;let out=b;
    if(opt?.range){out=b.slice(opt.range.offset,opt.range.offset+opt.range.length);}
    return {body:out,size:b.length,arrayBuffer:async()=>out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength)};
  }
}
async function authRequest(path, token='owner-token', init={}) {
  return new Request('https://api.gczhouwld.com'+path,{...init,headers:{authorization:'Bearer '+token,...(init.headers||{})}});
}

const db=new FakeDB(), bucket=new FakeBucket();
db.sessions.set(await sha256('owner-token'),{token_hash:await sha256('owner-token'),user_id:'owner',expires_at:now+86400000});
db.sessions.set(await sha256('other-token'),{token_hash:await sha256('other-token'),user_id:'other',expires_at:now+86400000});
db.verified.add('owner');db.verified.add('other');
const fixtureClaim='fixture-owner-claim-not-production';
const env={DB:db,PDF_PRIVATE:bucket,BRIDGE_WRITE_TOKEN:'fixture-fast-ticket-secret',PRIVATE_PDF_READ_ENABLED:'1',PRIVATE_PDF_CAPTURE_ENABLED:'0',PRIVATE_PDF_PROCESSING_ENABLED:'0',PRIVATE_PDF_OPEN_TIMING_ENABLED:'1',PRIVATE_PDF_OWNER_BOOTSTRAP_HASH:await sha256(fixtureClaim)};
let passed=0;async function test(name,fn){await fn();passed++;console.log('PRIVATE_PDF_PASS '+name);}

await test('anonymous status is fail-open to publisher behavior',async()=>{
  const r=await privatePdfStatus(new Request('https://api.gczhouwld.com/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345'),env);
  assert.equal(r.body.authenticated,false);assert.equal(r.body.available,false);
});
await test('wrong owner claim code cannot grant',async()=>{
  const r=await bootstrapPrivatePdfOwner(await authRequest('/api/user-ui/private-pdf/bootstrap-owner'),env,{claimCode:'wrong'});
  assert.equal(r.status,403);assert.equal(db.capabilities.size,0);
});
await test('one-time high entropy claim grants four server capabilities',async()=>{
  const r=await bootstrapPrivatePdfOwner(await authRequest('/api/user-ui/private-pdf/bootstrap-owner'),env,{claimCode:fixtureClaim});
  assert.equal(r.status,200);assert.deepEqual(r.body.capabilities,['private_pdf_capture','private_pdf_owner','private_pdf_process','private_pdf_read']);
});
await test('owner bootstrap cannot be stolen by a second verified account',async()=>{
  const r=await bootstrapPrivatePdfOwner(await authRequest('/api/user-ui/private-pdf/bootstrap-owner','other-token'),env,{claimCode:fixtureClaim});
  assert.equal(r.status,409);assert.equal(db.capabilities.has('other|private_pdf_read'),false);
});
await test('owner without stored PDF still falls back normally',async()=>{
  const r=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345'),env);
  assert.equal(r.body.entitled,true);assert.equal(r.body.available,false);
});
function makeRealPdf() {
  const streamA='q 0.2 0.5 0.8 rg 20 20 160 150 re f Q\n';
  const streamB='q 0.8 0.3 0.4 rg 40 30 140 170 re f Q\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 250] /Contents 4 0 R >>',
    '<< /Length '+Buffer.byteLength(streamA)+' >>\nstream\n'+streamA+'endstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 250] /Contents 6 0 R >>',
    '<< /Length '+Buffer.byteLength(streamB)+' >>\nstream\n'+streamB+'endstream',
  ];
  let pdf='%PDF-1.7\n% Gallery generated two-page PDF test fixture.\n';
  const offsets=[];
  for (let index=0;index<objects.length;index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf+=(index+1)+' 0 obj\n'+objects[index]+'\nendobj\n';
  }
  const start=Buffer.byteLength(pdf);
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets)pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  return Buffer.from(pdf+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
}
const pdf=makeRealPdf();
bucket.put('private-pdf/fixture.pdf',pdf);
db.documents.set('pdf1',{id:'pdf1',doi:'10.1021/jacs.6c12345',version_kind:'version_of_record',content_hash:'a'.repeat(64),r2_key:'private-pdf/fixture.pdf',byte_length:pdf.length,captured_at:now,processing_state:'ready',active:1});
await test('status exposes metadata but never the private R2 key',async()=>{
  const r=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345'),env);
  assert.equal(r.body.available,true);assert.ok(!JSON.stringify(r.body).includes('private-pdf/fixture.pdf'));
});
let accessUrl='';
await test('owner open returns only a short-lived opaque file URL',async()=>{
  const r=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),env);
  assert.equal(r.status,200);assert.equal(r.body.available,true);accessUrl=r.body.url;assert.ok(/token=v2\./.test(accessUrl));assert.equal(r.body.ticketMode,'stateless-v2');assert.ok(!accessUrl.includes('fixture.pdf'));
  assert.equal(r.body.headerVerified,true,'edge verifies the real PDF header during open');
  assert.equal(bucket.headCalls,0,'initial open does not issue a separate R2 HEAD');
  const timing=r.headers?.['server-timing']||'';
  assert.match(timing,/session;dur=\d+/);
  assert.match(timing,/capability;dur=\d+/);
  assert.match(timing,/document;dur=\d+/);
  assert.match(timing,/r2_get;dur=\d+/);
  assert.match(timing,/ticket_create;dur=\d+/);
  assert.match(timing,/total;dur=\d+/);
  assert.doesNotMatch(timing,/fixture|pdf1|owner|token|private-pdf|10\.1021|https/i);
  assert.ok(!JSON.stringify(r.headers).includes('fixture-token'));
});
await test('timing is disabled without diagnostic feature flag',async()=>{
  env.PRIVATE_PDF_OPEN_TIMING_ENABLED='0';
  try {
    const r=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),env);
    assert.equal(r.body.available,true);
    assert.equal(r.headers?.['server-timing'],undefined);
  } finally { env.PRIVATE_PDF_OPEN_TIMING_ENABLED='1'; }
});
await test('owner PDF timing is not exposed to a denied ordinary account',async()=>{
  const r=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','other-token',{method:'POST'}),env);
  assert.equal(r.status,403);
  assert.equal(r.headers?.['server-timing'],undefined);
});
await test('temporary URL serves inline PDF bytes with no-store',async()=>{
  const res=await servePrivatePdf(new Request(accessUrl),env,{});
  assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/pdf');assert.match(res.headers.get('content-disposition'),/^inline/);assert.equal(res.headers.get('cache-control'),'private, no-store');
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(),pdf.toString());
});
await test('fast ticket range is honored without D1 or redundant R2 HEAD',async()=>{
  const beforeHead=bucket.headCalls,beforeGet=bucket.getCalls,beforeDb=db.firstCalls;
  const res=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-7'}}),env,{});
  assert.equal(res.status,206);assert.equal(res.headers.get('content-range'),`bytes 0-7/${pdf.length}`);assert.equal(Buffer.from(await res.arrayBuffer()).length,8);
  assert.equal(bucket.headCalls,beforeHead);assert.equal(bucket.getCalls,beforeGet+1);assert.equal(db.firstCalls,beforeDb);
});
await test('HEAD establishes PDF size without reading R2 object bytes',async()=>{
  const beforeHead=bucket.headCalls,beforeGet=bucket.getCalls;
  const res=await servePrivatePdf(new Request(accessUrl,{method:'HEAD'}),env,{});
  assert.equal(res.status,200);assert.equal(res.headers.get('content-length'),String(pdf.length));assert.equal(res.headers.get('accept-ranges'),'bytes');
  assert.equal(bucket.headCalls,beforeHead);assert.equal(bucket.getCalls,beforeGet);
});
await test('vector PDF fixture has two pages and a complete xref table',async()=>{
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.match(pdf.toString(),/\/Count 2/);
  assert.match(pdf.toString(),/xref\n0 7\n/);
  assert.match(pdf.toString(),/startxref\n\d+\n%%EOF\n$/);
});
await test('view ticket continuation is bound to browser HttpOnly cookie and absolute lifetime',async()=>{
  const first=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-15'}}),env,{});
  assert.equal(first.status,206);
  const cookie=first.headers.get('set-cookie');
  assert.match(cookie,/^gpdf_[A-Za-z0-9_-]+=v1\./);
  assert.match(cookie,/HttpOnly; SameSite=Strict/);
  const originalNow=Date.now,issued=originalNow();
  try {
    Date.now=()=>issued+5*60*1000+1000;
    const absent=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-15'}}),env,{});
    assert.equal(absent.status,401);
    assert.equal(absent.headers.get('x-gallery-pdf-status'),'pdf_ticket_expired');
    const resumed=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-15',cookie:cookie.split(';')[0]}}),env,{});
    assert.equal(resumed.status,206);
    assert.equal(Buffer.from(await resumed.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    Date.now=()=>issued+91*60*1000;
    const expired=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-15',cookie:cookie.split(';')[0]}}),env,{});
    assert.equal(expired.status,401);
  } finally { Date.now=originalNow; }
});
await test('download request mints fresh attachment ticket and cannot reuse inline intent',async()=>{
  const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345&mode=download','owner-token',{method:'POST'}),env);
  assert.equal(opened.status,200);assert.equal(opened.body.mode,'download');
  const url=new URL(opened.body.url);
  assert.equal(url.searchParams.get('download'),'1');
  const file=await servePrivatePdf(new Request(url),env,{});
  assert.equal(file.status,200);
  assert.match(file.headers.get('content-disposition'),/^attachment;/);
  assert.equal(file.headers.get('content-type'),'application/pdf');
  assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const forged=new URL(accessUrl);
  forged.searchParams.set('download','1');
  const denied=await servePrivatePdf(new Request(forged),env,{});
  assert.equal(denied.status,403);
  assert.equal(denied.headers.get('x-gallery-pdf-status'),'pdf_ticket_mode_mismatch');
});
await test('new ticket recovers after secret change while previous signature fails closed',async()=>{
  const rotated={...env,BRIDGE_WRITE_TOKEN:'fixture-rotated-secret'};
  const old=await servePrivatePdf(new Request(accessUrl),rotated,{});
  assert.equal(old.status,401);
  assert.equal(old.headers.get('x-gallery-pdf-status'),'pdf_ticket_invalid');
  const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),rotated);
  assert.equal(opened.status,200);
  const fresh=await servePrivatePdf(new Request(opened.body.url),rotated,{});
  assert.equal(fresh.status,200);
});
await test('older valid private R2 keys no longer fail an unnecessary prefix check',async()=>{
  const doc=db.documents.get('pdf1'),originalKey=doc.r2_key;
  doc.r2_key='legacy-pdf/fixture-article.pdf';
  bucket.put(doc.r2_key,pdf);
  try {
    const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),env);
    assert.equal(opened.status,200);
    const res=await servePrivatePdf(new Request(opened.body.url),env,{});
    assert.equal(res.status,200);
    assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  } finally { doc.r2_key=originalKey; }
});
await test('inconsistent stored R2 size fails before issuing a file URL',async()=>{
  const doc=db.documents.get('pdf1'),oldLength=doc.byte_length;
  doc.byte_length=oldLength+2;
  try {
    const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),env);
    assert.equal(opened.status,200);
    assert.equal(opened.body.available,false);
    assert.equal(opened.body.reason,'pdf_object_unavailable');
  } finally { doc.byte_length=oldLength; }
});
await test('invalid R2 PDF header is rejected before creating any file ticket',async()=>{
  const document=db.documents.get('pdf1');
  const previous=bucket.objects.get(document.r2_key);
  const bad=Buffer.from(previous);
  bad[0]=0x3c; // fake HTML or a non-PDF response with the same byte count
  bucket.objects.set(document.r2_key,bad);
  try {
    const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),env);
    assert.equal(opened.status,200);assert.equal(opened.body.available,false);
    assert.equal(opened.body.reason,'pdf_header_invalid');
    assert.equal(opened.body.url,undefined);
  } finally { bucket.objects.set(document.r2_key,previous); }
});
await test('legacy D1 fallback keeps client-side file verification',async()=>{
  const legacy={...env,BRIDGE_WRITE_TOKEN:'',PRIVATE_PDF_TICKET_SECRET:''};
  const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),legacy);
  assert.equal(opened.body.ticketMode,'legacy-d1');
  assert.equal(opened.body.headerVerified,false);
});
await test('ordinary account never receives private document existence or bytes',async()=>{
  const s=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345','other-token'),env);
  assert.equal(s.body.entitled,false);assert.equal(s.body.available,false);
  const o=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','other-token',{method:'POST'}),env);
  assert.equal(o.status,403);
});
await test('fast ticket stays independent of D1 until its short expiry',async()=>{
  const beforeDb=db.firstCalls;
  db.capabilities.delete('owner|private_pdf_read');
  const res=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-7'}}),env,{});
  assert.equal(res.status,206);assert.equal(db.firstCalls,beforeDb);
  db.capabilities.set('owner|private_pdf_read',{});
});
await test('legacy opaque ticket still supports immediate capability revocation',async()=>{
  const legacyEnv={...env,BRIDGE_WRITE_TOKEN:'',PRIVATE_PDF_TICKET_SECRET:''};
  const opened=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),legacyEnv);
  assert.equal(opened.body.ticketMode,'legacy-d1');
  db.capabilities.delete('owner|private_pdf_read');
  const res=await servePrivatePdf(new Request(opened.body.url),legacyEnv,{});
  assert.equal(res.status,401);
  db.capabilities.set('owner|private_pdf_read',{});
});
await test('kill switch disables owner routing without touching stored PDF',async()=>{
  const off={...env,PRIVATE_PDF_READ_ENABLED:'0'};
  const s=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345'),off);
  assert.equal(s.body.enabled,false);assert.equal(s.body.available,false);assert.ok(bucket.objects.has('private-pdf/fixture.pdf'));
});
await test('invalid DOI is rejected before any storage lookup',async()=>{
  const r=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=bad'),env);assert.equal(r.status,400);
});
console.log(JSON.stringify({passed,captureEnabled:false,processingEnabled:false,publicPdfKeysExposed:false}));
