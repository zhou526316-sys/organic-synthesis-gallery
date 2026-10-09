import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {managePrivatePdfReaderGrant} from '../src/private-pdf-reader-grants.js';

const hash=token=>createHash('sha256').update(token).digest('hex');
const now=Date.now();
class FakeDb {
  constructor() {
    this.users=new Map([
      ['owner',{id:'owner',email:'owner@example.invalid',verified:'owner@example.invalid'}],
      ['reader',{id:'reader',email:'reader@example.invalid',verified:'reader@example.invalid'}],
      ['changed',{id:'changed',email:'new@example.invalid',verified:'old@example.invalid'}],
      ['privileged',{id:'privileged',email:'privileged@example.invalid',verified:'privileged@example.invalid'}],
    ]);
    this.sessions=new Map([
      [hash('owner-token'),{token_hash:hash('owner-token'),user_id:'owner',expires_at:now+86_400_000}],
      [hash('reader-token'),{token_hash:hash('reader-token'),user_id:'reader',expires_at:now+86_400_000}],
    ]);
    this.permissions=new Map([
      ['owner|private_pdf_owner',{granted_by:'owner_bootstrap'}],
      ['owner|private_pdf_read',{granted_by:'owner_bootstrap'}],
      ['privileged|private_pdf_capture',{granted_by:'owner_bootstrap'}],
    ]);
    this.audit=[];
  }
  prepare(statement){
    const db=this;
    const sql=statement.replace(/\s+/g,' ').trim();
    return {
      args:[],
      bind(...args){this.args=args;return this;},
      async first(){
        const a=this.args;
        if(sql.includes('FROM user_sessions WHERE token_hash = ?'))
          return db.sessions.get(a[0])||null;
        if(sql.includes('SELECT 1 AS ok FROM user_capabilities WHERE user_id = ? AND capability = ?'))
          return db.permissions.has(a[0]+'|'+a[1])?{ok:1}:null;
        if(sql.startsWith('SELECT granted_by FROM user_capabilities'))
          return db.permissions.get(a[0]+'|'+a[1])||null;
        throw Error('unknown first query');
      },
      async all(){
        const a=this.args;
        if(sql.includes('FROM users u JOIN user_email_verifications v')) {
          const result=[];
          for(const row of db.users.values())
            if(row.email.toLowerCase()===a[0] && row.verified.toLowerCase()===a[1])
              result.push({user_id:row.id});
          return {results:result.slice(0,2)};
        }
        if(sql.includes('SELECT capability, granted_by FROM user_capabilities')) {
          return {results:[...db.permissions].filter(([key])=>key.startsWith(a[0]+'|'))
            .map(([key,v])=>({capability:key.split('|')[1],granted_by:v.granted_by}))};
        }
        throw Error('unknown all query');
      },
      async run(){
        const a=this.args;
        if(sql.startsWith('UPDATE user_session_devices'))return {success:true};
        if(sql.startsWith('INSERT INTO user_capabilities')){
          if(!db.permissions.has(a[0]+'|'+a[1]))
            db.permissions.set(a[0]+'|'+a[1],{granted_by:a[3]});
          return {success:true};
        }
        if(sql.startsWith('DELETE FROM user_capabilities')){
          if(db.permissions.get(a[0]+'|private_pdf_read')?.granted_by===a[1])
            db.permissions.delete(a[0]+'|private_pdf_read');
          return {success:true};
        }
        if(sql.startsWith('INSERT INTO private_pdf_reader_grant_audit')){
          db.audit.push({event:a[0],actor:a[1],target:a[2],action:a[3],time:a[4]});
          return {success:true};
        }
        throw Error('unknown run query');
      }
    };
  }
  async batch(statements){
    const permissions=new Map(this.permissions),length=this.audit.length;
    try { for(const statement of statements) await statement.run(); }
    catch(error){this.permissions=permissions;this.audit.length=length;throw error;}
  }
}
const db=new FakeDb(),env={DB:db};
function call(actor,payload){
  return managePrivatePdfReaderGrant(new Request('https://api.gczhouwld.com/api/user-ui/private-pdf/reader-grant',{
    method:'POST',headers:actor?{authorization:'Bearer '+actor}:{}}),env,payload);
}
const reader='reader@example.invalid';
test('anonymous and non-owner cannot use email lookup or grant',async()=>{
  assert.equal((await call('',{email:reader,action:'status'})).status,401);
  assert.equal((await call('reader-token',{email:reader,action:'status'})).status,403);
  assert.equal(db.audit.length,0);
});
test('owner must explicitly confirm right to share private documents',async()=>{
  const denied=await call('owner-token',{email:reader,action:'grant'});
  assert.equal(denied.status,400);
  assert.equal(db.permissions.has('reader|private_pdf_read'),false);
});
test('target must have a matching verified current email',async()=>{
  assert.equal((await call('owner-token',{email:'missing@example.invalid',action:'grant',rightsConfirmed:true})).status,404);
  assert.equal((await call('owner-token',{email:'new@example.invalid',action:'grant',rightsConfirmed:true})).status,404);
});
test('cannot escalate or modify a privileged target',async()=>{
  assert.equal((await call('owner-token',{email:'privileged@example.invalid',action:'grant',rightsConfirmed:true})).status,409);
  assert.equal(db.audit.length,0);
});
test('owner grants only private_pdf_read with durable audit and no email in result',async()=>{
  const res=await call('owner-token',{email:reader,action:'grant',rightsConfirmed:true});
  assert.equal(res.status,200);
  assert.deepEqual(res.body,{verified:true,readGranted:true,changed:true,canRevoke:true});
  assert.equal(db.permissions.get('reader|private_pdf_read')?.granted_by,'owner_reader_grant:owner');
  assert.equal([...db.permissions.keys()].filter(x=>x.startsWith('reader|')).join(','),'reader|private_pdf_read');
  assert.equal(db.audit.length,1);
  assert.equal(db.audit[0].action,'grant');
  assert.doesNotMatch(JSON.stringify(res),/reader@example|reader-token/);
});
test('repeated grant and status are idempotent and disclose no identifiers',async()=>{
  const res=await call('owner-token',{email:reader,action:'grant',rightsConfirmed:true});
  assert.equal(res.body.changed,false);
  assert.equal(db.audit.length,1);
  const status=await call('owner-token',{email:reader,action:'status'});
  assert.deepEqual(status.body,{verified:true,readGranted:true,canRevoke:true});
});
test('owner revokes only own reader capability, not other role',async()=>{
  const revoked=await call('owner-token',{email:reader,action:'revoke'});
  assert.deepEqual(revoked.body,{verified:true,readGranted:false,changed:true,canRevoke:false});
  assert.equal(db.permissions.has('reader|private_pdf_read'),false);
  assert.equal(db.audit.length,2);
  assert.equal(db.audit.at(-1).action,'revoke');
  assert.equal((await call('owner-token',{email:reader,action:'revoke'})).body.changed,false);
});
test('foreign-provenance read grant cannot be revoked through this endpoint',async()=>{
  db.permissions.set('reader|private_pdf_read',{granted_by:'different_authority'});
  assert.equal((await call('owner-token',{email:reader,action:'revoke'})).status,409);
  assert.equal(db.permissions.get('reader|private_pdf_read').granted_by,'different_authority');
});
