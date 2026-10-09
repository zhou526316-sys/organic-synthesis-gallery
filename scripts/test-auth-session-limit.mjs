import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('five active sessions maximum, newest retained, session metadata cleaned', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);');
  const schema = readFileSync('cloudflare/schema.sql','utf8');
  const anchor = '-- Account-device concurrency and Tencent SMS OTP groundwork';
  assert.ok(schema.includes(anchor));
  db.exec(schema.slice(schema.indexOf(anchor)));
  db.prepare('INSERT INTO users(id) VALUES (?)').run('test');
  const deadline = Date.now() + 60_000;
  for (let i = 0; i < 6; i += 1) {
    db.prepare('INSERT INTO user_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('session'+i,'test',i,deadline);
  }
  const active = db.prepare('SELECT token_hash FROM user_sessions ORDER BY created_at').all().map(row=>row.token_hash);
  assert.deepEqual(active,['session1','session2','session3','session4','session5']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_session_devices').get().n, 5);
  db.close();
});
