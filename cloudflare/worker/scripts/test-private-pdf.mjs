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
  constructor(){this.sessions=new Map();this.verified=new Set();this.capabilities=new Map();this.documents=new Map();this.tokens=new Map();}
  prepare(sql){return new FakeStatement(this,sql);}
}
class FakeBucket {
  constructor(){this.objects=new Map();}
  put(key,bytes){this.objects.set(key,bytes);}
  async head(key){const b=this.objects.get(key);return b?{size:b.length}:null;}
  async get(key,opt){const b=this.objects.get(key);if(!b)return null;let out=b;
    if(opt?.range){out=b.slice(opt.range.offset,opt.range.offset+opt.range.length);}
    return {body:out};
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
const env={DB:db,PDF_PRIVATE:bucket,PRIVATE_PDF_READ_ENABLED:'1',PRIVATE_PDF_CAPTURE_ENABLED:'0',PRIVATE_PDF_PROCESSING_ENABLED:'0',PRIVATE_PDF_OWNER_BOOTSTRAP_HASH:await sha256(fixtureClaim)};
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
const pdf=Buffer.from('%PDF-1.7\nprivate fixture\n%%EOF');
bucket.put('private-pdf/fixture.pdf',pdf);
db.documents.set('pdf1',{id:'pdf1',doi:'10.1021/jacs.6c12345',version_kind:'version_of_record',content_hash:'a'.repeat(64),r2_key:'private-pdf/fixture.pdf',byte_length:pdf.length,captured_at:now,processing_state:'raw',active:1});
await test('status exposes metadata but never the private R2 key',async()=>{
  const r=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345'),env);
  assert.equal(r.body.available,true);assert.ok(!JSON.stringify(r.body).includes('private-pdf/fixture.pdf'));
});
let accessUrl='';
await test('owner open returns only a short-lived opaque file URL',async()=>{
  const r=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','owner-token',{method:'POST'}),env);
  assert.equal(r.status,200);assert.equal(r.body.available,true);accessUrl=r.body.url;assert.ok(/token=/.test(accessUrl));assert.ok(!accessUrl.includes('fixture.pdf'));
});
await test('temporary URL serves inline PDF bytes with no-store',async()=>{
  const res=await servePrivatePdf(new Request(accessUrl),env,{});
  assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/pdf');assert.match(res.headers.get('content-disposition'),/^inline/);assert.equal(res.headers.get('cache-control'),'private, no-store');
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(),pdf.toString());
});
await test('single byte range is honored for native PDF viewers',async()=>{
  const res=await servePrivatePdf(new Request(accessUrl,{headers:{range:'bytes=0-7'}}),env,{});
  assert.equal(res.status,206);assert.equal(res.headers.get('content-range'),`bytes 0-7/${pdf.length}`);assert.equal(Buffer.from(await res.arrayBuffer()).length,8);
});
await test('ordinary account never receives private document existence or bytes',async()=>{
  const s=await privatePdfStatus(await authRequest('/api/user-ui/private-pdf/status?doi=10.1021/jacs.6c12345','other-token'),env);
  assert.equal(s.body.entitled,false);assert.equal(s.body.available,false);
  const o=await openPrivatePdf(await authRequest('/api/user-ui/private-pdf/open?doi=10.1021/jacs.6c12345','other-token',{method:'POST'}),env);
  assert.equal(o.status,403);
});
await test('revocation invalidates already minted access token',async()=>{
  db.capabilities.delete('owner|private_pdf_read');
  const res=await servePrivatePdf(new Request(accessUrl),env,{});
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
