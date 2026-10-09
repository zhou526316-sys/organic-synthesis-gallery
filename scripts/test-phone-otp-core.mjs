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
