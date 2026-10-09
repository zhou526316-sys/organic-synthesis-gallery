import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { startPhoneOtp, verifyPhoneOtp } from '../cloudflare/worker/src/phone-otp.js';

function makeFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT,email TEXT,avatar_url TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created_at INTEGER,expires_at INTEGER);CREATE TABLE auth_identities(provider TEXT,provider_user_id TEXT,user_id TEXT);CREATE TABLE user_email_verifications(user_id TEXT,email TEXT);CREATE TABLE user_capabilities(user_id TEXT,capability TEXT);');
  const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
  db.exec(schema.slice(schema.indexOf('-- Account-device concurrency and Tencent SMS OTP groundwork')));
  const DB={
    prepare(sql) { return {bind(...v) { return {
      async first() { return db.prepare(sql).get(...v)||null; },
      async all() { return {results:db.prepare(sql).all(...v)}; },
      async run() {return {meta:{changes:Number(db.prepare(sql).run(...v).changes||0)}};},
    }; }}; },
    async batch(steps) { db.exec('BEGIN IMMEDIATE');try {for (const a of steps)await a.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;} },
  };
  const env={DB,
    TENCENT_SMS_SECRET_ID:'unit-only-id',TENCENT_SMS_SECRET_KEY:'unit-only-key',
    TENCENT_SMS_SDK_APP_ID:'1400000000',TENCENT_SMS_SIGN_NAME:'Unit SMS',
    TENCENT_SMS_TEMPLATE_ID:'1234',SMS_OTP_PEPPER:'unit-test-dummy-pepper',
  };
  return {db,env};
}
test('SMS OTP protects login, replay, sending limits and explicit binding', async () => {
  const {db,env}=makeFixture();
  const originalFetch=globalThis.fetch;
  let otp = '';
  globalThis.fetch=async (url, init)=>{
    assert.equal(url,'https://sms.tencentcloudapi.com');
    assert.equal(init.headers['X-TC-Action'],'SendSms');
    assert.match(init.headers.authorization,/^TC3-HMAC-SHA256 /);
    otp=JSON.parse(init.body).TemplateParamSet[0];
    return new Response(JSON.stringify({Response:{SendStatusSet:[{Code:'Ok'}]}}),{
      status:200,headers:{'content-type':'application/json'},
    });
  };
  const makeRequest=token=>({headers:new Headers({
    'CF-Connecting-IP':'198.51.100.6',
    ...(token?{authorization:'Bearer '+token}:{}),
  })});
  try {
    const first=await startPhoneOtp(makeRequest(),env,{phone:'13800138000',purpose:'login'});
    assert.equal(first.status,200);
    assert.match(first.body.challengeId,/^ph_[a-f0-9]+$/);
    const again=await startPhoneOtp(makeRequest(),env,{phone:'13800138000',purpose:'login'});
    assert.equal(again.status,429);
    const loggedIn=await verifyPhoneOtp(makeRequest(),env,{
      challengeId:first.body.challengeId,code:otp,
      deviceId:'1'.padStart(32,'0'),deviceLabel:'Phone client',
    });
    assert.equal(loggedIn.status,200);
    assert.ok(loggedIn.body.token);
    assert.equal(loggedIn.body.user.phoneMasked,'+86 138****8000');
    const replay=await verifyPhoneOtp(makeRequest(),env,{
      challengeId:first.body.challengeId,code:otp,
    });
    assert.notEqual(replay.status,200);
    const ownAnother=await startPhoneOtp(makeRequest(loggedIn.body.token),env,{phone:'13900139000',purpose:'bind'});
    assert.equal(ownAnother.status,409);
    const now=Date.now();
    db.prepare('INSERT INTO users(id,display_name,email,avatar_url,created_at,updated_at) VALUES(?,?,NULL,NULL,?,?)')
      .run('existing','Existing account',now,now);
    const {issueBearerSession}=await import('../cloudflare/worker/src/auth-sessions.js');
    const existing=await issueBearerSession(env,'existing',{deviceId:'2'.padStart(32,'0')});
    const bind=await startPhoneOtp(makeRequest(existing.token),env,{phone:'13900139000',purpose:'bind'});
    assert.equal(bind.status,200);
    const linked=await verifyPhoneOtp(makeRequest(existing.token),env,{
      challengeId:bind.body.challengeId,code:otp,
    });
    assert.equal(linked.status,200);
    assert.equal(linked.body.verified,true);
    assert.equal(db.prepare('SELECT user_id FROM user_phone_links WHERE phone_e164=?').get('+8613900139000').user_id,'existing');
  } finally {globalThis.fetch=originalFetch;db.close();}
});
