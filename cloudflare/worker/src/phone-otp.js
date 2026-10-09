// China-mainland +86 verification codes. Delivery is fail-closed until the
// owner provisions an approved Tencent Cloud SMS signature and template.
import { authenticatedSessionUserId, createUserSession } from './integrations.js';

const SMS_TTL_MS = 5 * 60 * 1000;
const SMS_COOLDOWN_MS = 60 * 1000;
const SMS_WINDOW_MS = 60 * 60 * 1000;
const SMS_MAX_PHONE_HOUR = 5;
const SMS_MAX_IP_HOUR = 20;
const SMS_MAX_WRONG_CODES = 6;
const SMS_ENDPOINT = 'https://sms.tencentcloudapi.com';

const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const encode = value => new TextEncoder().encode(value);

function randomId(size = 18) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function otpCode() {
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  return String(digits[0] % 1_000_000).padStart(6, '0');
}

export function normalizeMainlandPhone(value) {
  const input = typeof value === 'string' ? value.trim().replace(/[\s-]/g, '') : '';
  const e164 = input.startsWith('+86') ? input : '+86' + input;
  return /^\+861[3-9]\d{9}$/.test(e164) ? e164 : null;
}

export function maskedPhone(phone) {
  const value = normalizeMainlandPhone(phone);
  return value ? '+86 ' + value.slice(3, 6) + '****' + value.slice(-4) : null;
}

export function smsConfigured(env) {
  return Boolean(env?.TENCENT_SMS_SECRET_ID && env?.TENCENT_SMS_SECRET_KEY
    && env?.TENCENT_SMS_SDK_APP_ID && env?.TENCENT_SMS_SIGN_NAME
    && env?.TENCENT_SMS_TEMPLATE_ID && env?.SMS_OTP_PEPPER);
}

async function hmac(key, message) {
  const material = typeof key === 'string' ? encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encode(message)));
}

async function keyedHash(env, message) {
  return hex(await hmac(env.SMS_OTP_PEPPER, message));
}

async function sha256(message) {
  return hex(await crypto.subtle.digest('SHA-256', encode(message)));
}

function constantTimeHexEqual(left, right) {
  const a = String(left || ''), b = String(right || '');
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendTencentSms(env, phone, code) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  // The approved template must contain EXACTLY ONE variable: the six-digit code.
  const payload = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: env.TENCENT_SMS_SDK_APP_ID,
    SignName: env.TENCENT_SMS_SIGN_NAME,
    TemplateId: env.TENCENT_SMS_TEMPLATE_ID,
    TemplateParamSet: [code],
  });
  const contentType = 'application/json; charset=utf-8';
  const hashedRequestPayload = await sha256(payload);
  const canonicalRequest = [
    'POST', '/', '', 'content-type:' + contentType + '\nhost:sms.tencentcloudapi.com\n',
    'content-type;host', hashedRequestPayload,
  ].join('\n');
  const scope = date + '/sms/tc3_request';
  const stringToSign = [
    'TC3-HMAC-SHA256', String(timestamp), scope, await sha256(canonicalRequest),
  ].join('\n');
  const dateKey = await hmac('TC3' + env.TENCENT_SMS_SECRET_KEY, date);
  const serviceKey = await hmac(dateKey, 'sms');
  const signingKey = await hmac(serviceKey, 'tc3_request');
  const signature = hex(await hmac(signingKey, stringToSign));
  const authorization = 'TC3-HMAC-SHA256 Credential=' + env.TENCENT_SMS_SECRET_ID + '/' + scope
    + ', SignedHeaders=content-type;host, Signature=' + signature;
  try {
    const response = await fetch(SMS_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        'content-type': contentType,
        authorization,
        'X-TC-Action': 'SendSms',
        'X-TC-Version': '2021-01-11',
        'X-TC-Region': 'ap-guangzhou',
        'X-TC-Timestamp': String(timestamp),
      },
      body: payload,
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.Response?.SendStatusSet?.length === 1
      && body.Response.SendStatusSet[0]?.Code === 'Ok';
  } catch {
    return false;
  }
}

async function reserveSmsRate(env, phone, request, now) {
  // Do not store full source IP or phone in rate history.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const phoneHash = await keyedHash(env, 'phone:' + phone);
  const ipHash = await keyedHash(env, 'ip:' + ip);
  const attemptId = randomId();
  await env.DB.prepare('DELETE FROM phone_sms_send_attempts WHERE created_at < ?')
    .bind(now - 24 * SMS_WINDOW_MS).run();
  const result = await env.DB.prepare(
    'INSERT INTO phone_sms_send_attempts(attempt_id,phone_hash,ip_hash,created_at) ' +
    'SELECT ?,?,?,? WHERE ' +
    'NOT EXISTS (SELECT 1 FROM phone_sms_send_attempts WHERE phone_hash=? AND created_at>?) AND ' +
    '(SELECT COUNT(*) FROM phone_sms_send_attempts WHERE phone_hash=? AND created_at>?)<? AND ' +
    '(SELECT COUNT(*) FROM phone_sms_send_attempts WHERE ip_hash=? AND created_at>?)<?'
  ).bind(attemptId, phoneHash, ipHash, now,
    phoneHash, now - SMS_COOLDOWN_MS,
    phoneHash, now - SMS_WINDOW_MS, SMS_MAX_PHONE_HOUR,
    ipHash, now - SMS_WINDOW_MS, SMS_MAX_IP_HOUR).run();
  return Number(result?.meta?.changes || 0) === 1 ? attemptId : null;
}

export async function startPhoneOtp(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!smsConfigured(env)) return { status: 503, body: { error: 'sms_not_configured' } };
  const phone = normalizeMainlandPhone(payload?.phone);
  if (!phone) return { status: 400, body: { error: 'invalid_phone' } };
  const purpose = payload?.purpose === 'bind' ? 'bind' : 'login';
  const userId = purpose === 'bind' ? await authenticatedSessionUserId(request, env) : null;
  if (purpose === 'bind' && !userId) return { status: 401, body: { error: 'not_authenticated' } };
  if (purpose === 'bind') {
    const own = await env.DB.prepare('SELECT phone_e164 FROM user_phone_links WHERE user_id=?').bind(userId).first();
    if (own) return { status: 409, body: { error: 'phone_already_bound' } };
    const taken = await env.DB.prepare('SELECT user_id FROM user_phone_links WHERE phone_e164=?').bind(phone).first();
    if (taken) return { status: 409, body: { error: 'phone_already_bound' } };
  }

  const now = Date.now();
  const attemptId = await reserveSmsRate(env, phone, request, now);
  if (!attemptId) return { status: 429, body: { error: 'sms_rate_limited', retryAfter: 60 } };

  const challengeId = 'ph_' + randomId();
  const code = otpCode();
  const codeSalt = randomId(12);
  const codeHash = await keyedHash(env, challengeId + '|' + phone + '|' + codeSalt + '|' + code);
  try {
    await env.DB.prepare(
      'INSERT INTO phone_otp_challenges(challenge_id,purpose,user_id,phone_e164,code_hash,code_salt,attempts,last_sent_at,created_at,expires_at) ' +
      'VALUES (?,?,?,?,?,?,0,?,?,?) ON CONFLICT(purpose,phone_e164) DO UPDATE SET ' +
      'challenge_id=excluded.challenge_id,user_id=excluded.user_id,code_hash=excluded.code_hash,' +
      'code_salt=excluded.code_salt,attempts=0,last_sent_at=excluded.last_sent_at,' +
      'created_at=excluded.created_at,expires_at=excluded.expires_at'
    ).bind(challengeId, purpose, userId, phone, codeHash, codeSalt, now, now, now + SMS_TTL_MS).run();
  } catch {
    await env.DB.prepare('DELETE FROM phone_sms_send_attempts WHERE attempt_id=?').bind(attemptId).run().catch(() => {});
    return { status: 503, body: { error: 'sms_challenge_unavailable' } };
  }
  if (!(await sendTencentSms(env, phone, code))) {
    await env.DB.prepare('DELETE FROM phone_otp_challenges WHERE challenge_id=?').bind(challengeId).run().catch(() => {});
    await env.DB.prepare('DELETE FROM phone_sms_send_attempts WHERE attempt_id=?').bind(attemptId).run().catch(() => {});
    return { status: 502, body: { error: 'sms_delivery_failed' } };
  }
  return { status: 200, body: {
    accepted: true, challengeId, expiresIn: SMS_TTL_MS / 1000,
    resendAfter: SMS_COOLDOWN_MS / 1000, phoneMasked: maskedPhone(phone),
  } };
}

export async function verifyPhoneOtp(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!smsConfigured(env)) return { status: 503, body: { error: 'sms_not_configured' } };
  const challengeId = String(payload?.challengeId || '').trim();
  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  if (!/^ph_[a-f0-9]{36}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
    return { status: 400, body: { error: 'invalid_code' } };
  }
  const row = await env.DB.prepare(
    'SELECT challenge_id,purpose,user_id,phone_e164,code_hash,code_salt,attempts,expires_at ' +
    'FROM phone_otp_challenges WHERE challenge_id=?'
  ).bind(challengeId).first();
  if (!row) return { status: 400, body: { error: 'invalid_code' } };
  if (Number(row.expires_at) <= Date.now()) {
    await env.DB.prepare('DELETE FROM phone_otp_challenges WHERE challenge_id=?').bind(challengeId).run();
    return { status: 410, body: { error: 'code_expired' } };
  }
  if (Number(row.attempts) >= SMS_MAX_WRONG_CODES) return { status: 429, body: { error: 'too_many_code_attempts' } };
  const expected = await keyedHash(env, challengeId + '|' + row.phone_e164 + '|' + row.code_salt + '|' + code);
  if (!constantTimeHexEqual(expected, row.code_hash)) {
    await env.DB.prepare('UPDATE phone_otp_challenges SET attempts=attempts+1 WHERE challenge_id=?')
      .bind(challengeId).run();
    return { status: 400, body: { error: 'invalid_code' } };
  }
  const authenticatedUser = row.purpose === 'bind'
    ? await authenticatedSessionUserId(request, env) : null;
  if (row.purpose === 'bind' && (!authenticatedUser || authenticatedUser !== row.user_id)) {
    return { status: 401, body: { error: 'not_authenticated' } };
  }
  // Compare-and-delete makes an OTP single-use even under concurrent requests.
  const taken = await env.DB.prepare(
    'DELETE FROM phone_otp_challenges WHERE challenge_id=? AND code_hash=? AND expires_at>? AND attempts<?'
  ).bind(challengeId, row.code_hash, Date.now(), SMS_MAX_WRONG_CODES).run();
  if (Number(taken?.meta?.changes || 0) !== 1) return { status: 409, body: { error: 'code_already_used' } };

  if (row.purpose === 'bind') {
    try {
      await env.DB.prepare('INSERT INTO user_phone_links(user_id,phone_e164,verified_at) VALUES(?,?,?)')
        .bind(authenticatedUser, row.phone_e164, Date.now()).run();
    } catch {
      return { status: 409, body: { error: 'phone_already_bound' } };
    }
    return { status: 200, body: { verified: true, phoneMasked: maskedPhone(row.phone_e164) } };
  }
  let linked = await env.DB.prepare('SELECT user_id FROM user_phone_links WHERE phone_e164=?')
    .bind(row.phone_e164).first();
  if (!linked) {
    const newUserId = 'usr_' + crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users(id,display_name,email,avatar_url,created_at,updated_at) VALUES(?,?,NULL,NULL,?,?)')
          .bind(newUserId, '用户' + row.phone_e164.slice(-4), now, now),
        env.DB.prepare('INSERT INTO user_phone_links(user_id,phone_e164,verified_at) VALUES(?,?,?)')
          .bind(newUserId, row.phone_e164, now),
      ]);
      linked = { user_id: newUserId };
    } catch {
      // A concurrent successful verification might have registered this number.
      linked = await env.DB.prepare('SELECT user_id FROM user_phone_links WHERE phone_e164=?')
        .bind(row.phone_e164).first();
      if (!linked) return { status: 503, body: { error: 'registration_failed' } };
    }
  }
  return { status: 200, body: await createUserSession(env, linked.user_id, payload) };
}
