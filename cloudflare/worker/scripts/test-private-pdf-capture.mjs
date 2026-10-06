import assert from 'node:assert/strict';
import { issuePrivatePdfCaptureLease, importPrivatePdf, revokePrivatePdfCaptureLeases } from '../src/private-pdf.js';

const enc=new TextEncoder();
async function hash(v){const d=await crypto.subtle.digest('SHA-256',enc.encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
class Stmt{
  constructor(db,sql){this.db=db;this.sql=sql.replace(/\s+/g,' ').trim();this.a=[]}
  bind(...a){this.a=a;return this}
  async first(){
    const q=this.sql,a=this.a,d=this.db;
    if(q.includes('FROM user_sessions WHERE token_hash'))return d.sessions.get(a[0])||null;
    if(q.includes('FROM user_capabilities WHERE user_id = ? AND capability = ?'))return d.cap.has(a[0]+'|'+a[1])?{ok:1}:null;
    if(q.includes('FROM private_pdf_capture_leases l')){
      const x=d.leases.get(a[1]);if(!x||!d.cap.has(x.user_id+'|'+a[0]))return null;return x;
    }
    if(q.includes('FROM private_pdf_documents WHERE doi = ? AND content_hash = ?')){
      return [...d.docs.values()].find(x=>x.doi===a[0]&&x.content_hash===a[1])||null;
    }
    throw Error('first:'+q);
  }
  async run(){
    const q=this.sql,a=this.a,d=this.db;
    if(q.startsWith('INSERT INTO private_pdf_capture_leases')){d.leases.set(a[0],{token_hash:a[0],user_id:a[1],created_at:a[2],expires_at:a[3],revoked_at:null,label:a[4]});return{success:true}}
    if(q.startsWith('UPDATE private_pdf_capture_leases SET revoked_at')){for(const x of d.leases.values())if(x.user_id===a[1]&&x.revoked_at==null)x.revoked_at=a[0];return{success:true}}
    if(q.startsWith('INSERT INTO private_pdf_documents')){d.docs.set(a[0],{id:a[0],doi:a[1],publisher:a[2],article_url:a[3],source_url:a[4],version_kind:a[5],content_hash:a[6],r2_key:a[7],byte_length:a[8],captured_at:a[9],processing_state:'raw',active:0});return{success:true}}
    throw Error('run:'+q);
  }
}
class DB{constructor(){this.sessions=new Map();this.cap=new Map();this.leases=new Map();this.docs=new Map()}prepare(q){return new Stmt(this,q)}}
class Bucket{
  constructor(){this.map=new Map()}
  async put(k,v,o){this.map.set(k,{bytes:new Uint8Array(v),opts:o})}
  async delete(k){this.map.delete(k)}
}
const db=new DB(),bucket=new Bucket(),now=Date.now();
db.sessions.set(await hash('owner-session'),{user_id:'owner',expires_at:now+86400000});
db.sessions.set(await hash('other-session'),{user_id:'other',expires_at:now+86400000});
db.cap.set('owner|private_pdf_capture',{});
const env={DB:db,PDF_PRIVATE:bucket,PRIVATE_PDF_CAPTURE_ENABLED:'1'};
const auth=(token,path='/api/user-ui/private-pdf/capture-lease',init={})=>new Request('https://api.gczhouwld.com'+path,{method:init.method||'POST',headers:{authorization:'Bearer '+token,...(init.headers||{})},body:init.body});
const pdf=Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.alloc(4096,65),Buffer.from('\n%%EOF')]);
let passed=0;async function t(name,fn){await fn();passed++;console.log('PRIVATE_PDF_CAPTURE_PASS '+name)}
await t('capture disabled fails closed',async()=>{const r=await issuePrivatePdfCaptureLease(auth('owner-session'),{...env,PRIVATE_PDF_CAPTURE_ENABLED:'0'});assert.equal(r.status,503)});
await t('ordinary session cannot mint capture lease',async()=>{const r=await issuePrivatePdfCaptureLease(auth('other-session'),env);assert.equal(r.status,403)});
let lease='';
await t('owner gets scoped seven-day capture lease',async()=>{const r=await issuePrivatePdfCaptureLease(auth('owner-session'),env);assert.equal(r.status,200);assert.equal(r.body.scope,'private_pdf_capture');assert.ok(r.body.token.length>=32);lease=r.body.token;assert.equal(db.leases.size,1)});
function upload(token=lease,query='',bytes=pdf,type='application/pdf'){
  return new Request('https://api.gczhouwld.com/api/private-pdf/import?doi=10.1021%2Fjacs.6c12345&publisher=acs&articleUrl='+encodeURIComponent('https://pubs.acs.org/doi/full/10.1021/jacs.6c12345')+'&sourceUrl='+encodeURIComponent('https://pubs.acs.org/doi/pdf/10.1021/jacs.6c12345')+'&versionKind=unknown&controllerRevision=2.2.41'+query,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':type},body:bytes});
}
await t('stale controller cannot upload a private PDF',async()=>{const r=await importPrivatePdf(upload(lease,'&controllerRevision=2.2.40'),env);assert.equal(r.status,409);assert.equal(r.body.error,'stale_controller_revision')});
await t('valid publisher PDF stores privately but remains inactive pending verification',async()=>{const r=await importPrivatePdf(upload(),env);assert.equal(r.status,201);assert.equal(r.body.stored,true);assert.equal(r.body.active,false);assert.equal(r.body.requiresVerification,true);assert.equal(bucket.map.size,1);assert.ok([...bucket.map.keys()][0].startsWith('private-pdf/raw/'));assert.ok(!JSON.stringify(r.body).includes('private-pdf/raw/'))});
await t('same DOI and hash is idempotent',async()=>{const r=await importPrivatePdf(upload(),env);assert.equal(r.status,200);assert.equal(r.body.duplicate,true);assert.equal(bucket.map.size,1)});
await t('HTML/login page cannot masquerade as PDF',async()=>{const b=Buffer.from('<html>'+('x'.repeat(5000))+'</html>');const r=await importPrivatePdf(upload(lease,'',b),env);assert.equal(r.status,422)});
await t('wrong content type is rejected before storage',async()=>{const r=await importPrivatePdf(upload(lease,'',pdf,'text/html'),env);assert.equal(r.status,415)});
await t('cross publisher source host is rejected',async()=>{const req=new Request('https://api.gczhouwld.com/api/private-pdf/import?doi=10.1021%2Fjacs.6c99999&publisher=acs&articleUrl='+encodeURIComponent('https://pubs.acs.org/doi/full/10.1021/jacs.6c99999')+'&sourceUrl='+encodeURIComponent('https://evil.example/paper.pdf')+'&controllerRevision=2.2.41',{method:'POST',headers:{authorization:'Bearer '+lease,'content-type':'application/pdf'},body:pdf});const r=await importPrivatePdf(req,env);assert.equal(r.status,400)});
await t('declared publisher mismatch is rejected',async()=>{const req=new Request('https://api.gczhouwld.com/api/private-pdf/import?doi=10.1021%2Fjacs.6c99998&publisher=wiley&articleUrl='+encodeURIComponent('https://pubs.acs.org/doi/full/10.1021/jacs.6c99998')+'&sourceUrl='+encodeURIComponent('https://pubs.acs.org/doi/pdf/10.1021/jacs.6c99998')+'&controllerRevision=2.2.41',{method:'POST',headers:{authorization:'Bearer '+lease,'content-type':'application/pdf'},body:pdf});const r=await importPrivatePdf(req,env);assert.equal(r.status,400)});
await t('revoking capability invalidates existing capture lease',async()=>{db.cap.delete('owner|private_pdf_capture');const r=await importPrivatePdf(upload(),env);assert.equal(r.status,401);db.cap.set('owner|private_pdf_capture',{})});
await t('explicit lease revoke invalidates existing token',async()=>{const r=await revokePrivatePdfCaptureLeases(auth('owner-session','/api/user-ui/private-pdf/capture-lease/revoke'),env);assert.equal(r.status,200);const u=await importPrivatePdf(upload(),env);assert.equal(u.status,401)});
console.log(JSON.stringify({passed,privateStorageObjects:bucket.map.size,publicWrites:0,mediaWrites:0}));
