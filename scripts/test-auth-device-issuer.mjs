import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { issueBearerSession, listBearerSessions } from '../cloudflare/worker/src/auth-sessions.js';

test('browser device replacement and concurrent login issuer remain capped', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created_at INTEGER,expires_at INTEGER);');
  const sql = fs.readFileSync('cloudflare/schema.sql','utf8');
  db.exec(sql.slice(sql.indexOf('-- Account-device concurrency and Tencent SMS OTP groundwork')));
  db.prepare('INSERT INTO users(id) VALUES (?)').run('account');
  let batchQueue = Promise.resolve();
  const DB = {
    prepare(statement) {
      return {
        bind(...args) {
          return {
            async first() { return db.prepare(statement).get(...args) || null; },
            async all() { return { results: db.prepare(statement).all(...args) }; },
            async run() { return { meta: { changes: Number(db.prepare(statement).run(...args).changes || 0) } }; },
          };
        },
      };
    },
    batch(ops) {
      // D1 serializes transactions; serialize the in-memory SQLite mock too.
      const task = batchQueue.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const op of ops) await op.run();
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
      batchQueue = task.catch(() => {});
      return task;
    },
  };
  const env = { DB };
  const tokens = [];
  for (let i = 1; i <= 5; i += 1) {
    tokens.push(await issueBearerSession(env,'account',{ deviceId: i.toString(16).padStart(32,'0'), deviceLabel: 'Device ' + i }));
  }
  let state = await listBearerSessions(env,'account','');
  assert.equal(state.count, 5);
  assert.deepEqual(state.sessions.map(x => x.deviceLabel).sort(),['Device 1','Device 2','Device 3','Device 4','Device 5']);
  const same = await issueBearerSession(env,'account',{ deviceId: '1'.padStart(32,'0'), deviceLabel:'Device 1' });
  assert.notEqual(same.token, tokens[0].token);
  assert.equal((await listBearerSessions(env,'account','')).count, 5);
  // The least recently active other browser is removed when device six signs in.
  db.prepare('UPDATE user_session_devices SET last_seen_at=0 WHERE device_id=?').run('2'.padStart(32,'0'));
  await issueBearerSession(env,'account',{ deviceId:'6'.padStart(32,'0'), deviceLabel:'Device 6' });
  state = await listBearerSessions(env,'account','');
  assert.equal(state.count, 5);
  assert.ok(state.sessions.some(x=>x.deviceLabel==='Device 6'));
  assert.ok(!state.sessions.some(x=>x.deviceLabel==='Device 2'));
  await Promise.all(Array.from({length:8},(_,i)=>issueBearerSession(env,'account',{
    deviceId:(i+7).toString(16).padStart(32,'0'),deviceLabel:'Parallel '+i,
  })));
  assert.equal((await listBearerSessions(env,'account','')).count,5);
  db.close();
});
