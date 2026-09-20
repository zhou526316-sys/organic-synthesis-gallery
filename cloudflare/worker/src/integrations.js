const DEFAULT_RETURN = 'https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const ALLOWED_RETURN_ORIGINS = new Set([
  'https://zhou526316-sys.github.io',
  'https://organic-synthesis-gallery.zhou526316.workers.dev',
  'https://organic-synthesis-gallery-public.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const AUTH_PROVIDERS = new Set(['google', 'wechat', 'qq']);
const PAYMENT_PROVIDERS = new Set(['wechat', 'alipay']);
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;
const STATE_TTL = 1000 * 60 * 10;
const EXCHANGE_TTL = 1000 * 60 * 5;
const EMAIL_TTL = 1000 * 60 * 15;
const PASSWORD_PBKDF2_ITERATIONS = 100_000;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const REGISTER_TTL = 1000 * 60 * 10;
const EMAIL_CODE_COOLDOWN = 1000 * 60;
const EMAIL_CODE_MAX_ATTEMPTS = 6;

function json(value, init = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomEmailCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 1_000_000).padStart(6, '0');
}

function randomShortSalt() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function emailCodeHash(code, salt) {
  return sha256Hex(`${salt}:${code}`);
}

async function sendEmailCode(env, email, purpose, code) {
  if (!providerConfigured(env, 'email')) return { ok: false, error: 'provider_not_configured' };
  const subjects = {
    register: 'Organic Synthesis Literature Gallery 注册验证码',
    reset: 'Organic Synthesis Literature Gallery 密码重置验证码',
    verify: 'Organic Synthesis Literature Gallery 邮箱验证码',
    change: 'Organic Synthesis Literature Gallery 新邮箱验证码',
  };
  const actions = {
    register: '完成本站账号注册',
    reset: '重置本站账号密码',
    verify: '验证本站账号邮箱',
    change: '确认新的本站账号邮箱',
  };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: subjects[purpose] || subjects.verify,
      html: `<p>你的验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>用于${actions[purpose] || actions.verify}。验证码 10 分钟内有效，请勿转发给他人。</p>`,
    }),
  });
  return response.ok ? { ok: true } : { ok: false, error: 'email_delivery_failed' };
}

function normalizeEmailCode(value) {
  const code = typeof value === 'string' ? value.trim() : '';
  return /^\d{6}$/.test(code) ? code : '';
}

async function challengeRow(env, challengeId, purpose) {
  const id = typeof challengeId === 'string' ? challengeId.trim() : '';
  if (!id) return null;
  const row = await env.DB.prepare(
    `SELECT challenge_id, purpose, user_id, email, display_name, password_hash, salt, iterations,
            code_hash, code_salt, attempts, last_sent_at, created_at, expires_at
       FROM email_code_challenges
      WHERE challenge_id = ? AND purpose = ?`
  ).bind(id, purpose).first();
  return row || null;
}

async function verifyChallengeCode(env, row, rawCode) {
  if (!row) return { ok: false, status: 400, error: 'invalid_code' };
  if (Number(row.expires_at || 0) <= Date.now()) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
    return { ok: false, status: 410, error: 'code_expired' };
  }
  if (Number(row.attempts || 0) >= EMAIL_CODE_MAX_ATTEMPTS) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
    return { ok: false, status: 429, error: 'too_many_code_attempts' };
  }
  const code = normalizeEmailCode(rawCode);
  const valid = code && constantTimeEqual(await emailCodeHash(code, row.code_salt), String(row.code_hash || ''));
  if (!valid) {
    const nextAttempts = Number(row.attempts || 0) + 1;
    if (nextAttempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
      return { ok: false, status: 429, error: 'too_many_code_attempts', attemptsRemaining: 0 };
    }
    await env.DB.prepare('UPDATE email_code_challenges SET attempts = ? WHERE challenge_id = ?')
      .bind(nextAttempts, row.challenge_id).run();
    return { ok: false, status: 400, error: 'invalid_code', attemptsRemaining: EMAIL_CODE_MAX_ATTEMPTS - nextAttempts };
  }
  return { ok: true, code };
}

async function resendChallengeCode(env, row) {
  if (!row) return { status: 400, body: { error: 'invalid_challenge' } };
  const now = Date.now();
  if (Number(row.expires_at || 0) <= now) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
    return { status: 410, body: { error: 'code_expired' } };
  }
  const elapsed = now - Number(row.last_sent_at || 0);
  if (elapsed < EMAIL_CODE_COOLDOWN) {
    return { status: 429, body: { error: 'code_cooldown', retryAfter: Math.ceil((EMAIL_CODE_COOLDOWN - elapsed) / 1000) } };
  }
  const code = randomEmailCode();
  const codeSalt = randomShortSalt();
  const codeHash = await emailCodeHash(code, codeSalt);
  const sent = await sendEmailCode(env, row.email, row.purpose, code);
  if (!sent.ok) return { status: sent.error === 'provider_not_configured' ? 503 : 502, body: { error: sent.error } };
  await env.DB.prepare(
    'UPDATE email_code_challenges SET code_hash = ?, code_salt = ?, attempts = 0, last_sent_at = ?, expires_at = ? WHERE challenge_id = ?'
  ).bind(codeHash, codeSalt, now, now + REGISTER_TTL, row.challenge_id).run();
  return { status: 200, body: { accepted: true, challengeId: row.challenge_id, expiresIn: REGISTER_TTL / 1000, resendAfter: EMAIL_CODE_COOLDOWN / 1000 } };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeReturnTo(value) {
  try {
    const url = new URL(typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_RETURN);
    if (!ALLOWED_RETURN_ORIGINS.has(url.origin)) return DEFAULT_RETURN;
    return url.toString();
  } catch {
    return DEFAULT_RETURN;
  }
}

function callbackUrl(request, provider) {
  return `${new URL(request.url).origin}/api/user-ui/auth/callback/${provider}`;
}

function providerConfigured(env, provider) {
  if (provider === 'google') return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  if (provider === 'wechat') return Boolean(env.WECHAT_OPEN_APP_ID && env.WECHAT_OPEN_APP_SECRET);
  if (provider === 'qq') return Boolean(env.QQ_CONNECT_APP_ID && env.QQ_CONNECT_APP_KEY);
  if (provider === 'email') return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  return false;
}

function paymentConfigured(env, provider) {
  if (provider === 'wechat') {
    return Boolean(env.WECHAT_PAY_MCH_ID && env.WECHAT_PAY_APP_ID && env.WECHAT_PAY_SERIAL_NO && env.WECHAT_PAY_PRIVATE_KEY && env.WECHAT_PAY_API_V3_KEY && env.WECHAT_PAY_PLATFORM_PUBLIC_KEY);
  }
  if (provider === 'alipay') return Boolean(env.ALIPAY_APP_ID && env.ALIPAY_PRIVATE_KEY && env.ALIPAY_PUBLIC_KEY);
  return false;
}

export function integrationStatus(env) {
  return {
    status: 200,
    body: {
      auth: {
        local: true,
        google: providerConfigured(env, 'google'),
        wechat: providerConfigured(env, 'wechat'),
        qq: providerConfigured(env, 'qq'),
        email: providerConfigured(env, 'email'),
      },
      payments: {
        wechat: paymentConfigured(env, 'wechat'),
        alipay: paymentConfigured(env, 'alipay'),
      },
    },
  };
}

export async function probeEmailDelivery(env) {
  if (!providerConfigured(env, 'email')) {
    return { status: 503, body: { ok: false, error: 'provider_not_configured' } };
  }
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: ['delivered@resend.dev'],
        subject: 'Organic Synthesis Gallery email delivery probe',
        html: '<p>Automated delivery probe.</p>',
      }),
    });
  } catch (error) {
    return {
      status: 502,
      body: { ok: false, error: 'email_provider_unreachable', detail: String(error?.message || error).slice(0, 240) },
    };
  }

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    return {
      status: 502,
      body: {
        ok: false,
        error: 'email_delivery_failed',
        providerStatus: response.status,
        providerName: typeof data?.name === 'string' ? data.name.slice(0, 120) : undefined,
        providerMessage: typeof data?.message === 'string' ? data.message.slice(0, 300) : raw.slice(0, 300),
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      providerStatus: response.status,
      messageId: typeof data?.id === 'string' ? data.id : undefined,
    },
  };
}

async function storeState(env, state, provider, returnTo) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO auth_states (state, provider, return_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(state, provider, returnTo, now, now + STATE_TTL).run();
}

async function consumeState(env, state, provider) {
  const row = await env.DB.prepare('SELECT state, provider, return_to, expires_at FROM auth_states WHERE state = ?').bind(state).first();
  await env.DB.prepare('DELETE FROM auth_states WHERE state = ?').bind(state).run();
  if (!row || row.provider !== provider || Number(row.expires_at || 0) < Date.now()) return null;
  return row;
}

function oauthAuthorizationUrl(request, env, provider, state) {
  const redirect = callbackUrl(request, provider);
  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
      include_granted_scopes: 'true',
    }).toString();
    return url.toString();
  }
  if (provider === 'wechat') {
    const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
    url.search = new URLSearchParams({
      appid: env.WECHAT_OPEN_APP_ID,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'snsapi_login',
      state,
    }).toString();
    return `${url.toString()}#wechat_redirect`;
  }
  const url = new URL('https://graph.qq.com/oauth2.0/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.QQ_CONNECT_APP_ID,
    redirect_uri: redirect,
    state,
    scope: 'get_user_info',
  }).toString();
  return url.toString();
}

export async function authStart(request, env) {
  if (!env?.DB) return json({ error: 'database_not_configured' }, { status: 503 });
  const url = new URL(request.url);
  const provider = (url.searchParams.get('provider') || '').toLowerCase();
  if (!AUTH_PROVIDERS.has(provider)) return json({ error: 'unsupported_provider' }, { status: 400 });
  if (!providerConfigured(env, provider)) return json({ error: 'provider_not_configured', provider }, { status: 503 });
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  const state = randomToken(24);
  await storeState(env, state, provider, returnTo);
  return Response.redirect(oauthAuthorizationUrl(request, env, provider, state), 302);
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${label}_invalid_json`); }
  if (!response.ok) throw new Error(`${label}_${response.status}`);
  return data;
}

async function googleProfile(request, env, code) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl(request, 'google'),
    }),
  });
  const token = await parseJsonResponse(tokenResponse, 'google_token');
  if (!token.access_token) throw new Error('google_token_missing');
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const profile = await parseJsonResponse(profileResponse, 'google_profile');
  if (!profile.sub) throw new Error('google_subject_missing');
  return {
    providerUserId: String(profile.sub),
    email: typeof profile.email === 'string' ? profile.email : null,
    displayName: typeof profile.name === 'string' ? profile.name : 'Google user',
    avatarUrl: typeof profile.picture === 'string' ? profile.picture : null,
  };
}

async function wechatProfile(request, env, code) {
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.search = new URLSearchParams({
    appid: env.WECHAT_OPEN_APP_ID,
    secret: env.WECHAT_OPEN_APP_SECRET,
    code,
    grant_type: 'authorization_code',
  }).toString();
  const token = await parseJsonResponse(await fetch(tokenUrl), 'wechat_token');
  if (!token.access_token || !token.openid) throw new Error('wechat_token_missing');
  const profileUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  profileUrl.search = new URLSearchParams({ access_token: token.access_token, openid: token.openid, lang: 'zh_CN' }).toString();
  const profile = await parseJsonResponse(await fetch(profileUrl), 'wechat_profile');
  return {
    providerUserId: String(profile.unionid || profile.openid || token.openid),
    email: null,
    displayName: typeof profile.nickname === 'string' ? profile.nickname : '微信用户',
    avatarUrl: typeof profile.headimgurl === 'string' ? profile.headimgurl : null,
  };
}

async function qqProfile(request, env, code) {
  const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
  tokenUrl.search = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.QQ_CONNECT_APP_ID,
    client_secret: env.QQ_CONNECT_APP_KEY,
    code,
    redirect_uri: callbackUrl(request, 'qq'),
    fmt: 'json',
  }).toString();
  const tokenResponse = await fetch(tokenUrl);
  const tokenText = await tokenResponse.text();
  let token = null;
  try { token = JSON.parse(tokenText); } catch { token = Object.fromEntries(new URLSearchParams(tokenText)); }
  if (!tokenResponse.ok || !token?.access_token) throw new Error('qq_token_failed');
  const meUrl = new URL('https://graph.qq.com/oauth2.0/me');
  meUrl.search = new URLSearchParams({ access_token: token.access_token, fmt: 'json' }).toString();
  const me = await parseJsonResponse(await fetch(meUrl), 'qq_openid');
  if (!me.openid) throw new Error('qq_openid_missing');
  const infoUrl = new URL('https://graph.qq.com/user/get_user_info');
  infoUrl.search = new URLSearchParams({
    access_token: token.access_token,
    oauth_consumer_key: env.QQ_CONNECT_APP_ID,
    openid: me.openid,
    fmt: 'json',
  }).toString();
  const info = await parseJsonResponse(await fetch(infoUrl), 'qq_profile');
  return {
    providerUserId: String(me.openid),
    email: null,
    displayName: typeof info.nickname === 'string' ? info.nickname : 'QQ用户',
    avatarUrl: typeof info.figureurl_qq_2 === 'string' ? info.figureurl_qq_2 : (typeof info.figureurl_qq_1 === 'string' ? info.figureurl_qq_1 : null),
  };
}

async function providerProfile(request, env, provider, code) {
  if (provider === 'google') return googleProfile(request, env, code);
  if (provider === 'wechat') return wechatProfile(request, env, code);
  return qqProfile(request, env, code);
}

async function upsertIdentity(env, provider, profile) {
  const existing = await env.DB.prepare(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?'
  ).bind(provider, profile.providerUserId).first();
  const now = Date.now();
  let userId = existing?.user_id;
  if (!userId) {
    userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    await env.DB.prepare(
      'INSERT INTO users (id, display_name, email, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, profile.displayName || null, profile.email || null, profile.avatarUrl || null, now, now).run();
    await env.DB.prepare(
      'INSERT INTO auth_identities (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(provider, profile.providerUserId, userId, profile.email || null, profile.displayName || null, profile.avatarUrl || null, now, now).run();
  } else {
    await env.DB.prepare(
      'UPDATE users SET display_name = COALESCE(?, display_name), email = COALESCE(?, email), avatar_url = COALESCE(?, avatar_url), updated_at = ? WHERE id = ?'
    ).bind(profile.displayName || null, profile.email || null, profile.avatarUrl || null, now, userId).run();
    await env.DB.prepare(
      'UPDATE auth_identities SET email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?'
    ).bind(profile.email || null, profile.displayName || null, profile.avatarUrl || null, now, provider, profile.providerUserId).run();
  }
  return userId;
}

async function createExchangeCode(env, userId) {
  const code = randomToken(32);
  const hash = await sha256Hex(code);
  await env.DB.prepare(
    'INSERT INTO login_exchange_codes (code_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(hash, userId, Date.now() + EXCHANGE_TTL, Date.now()).run();
  return code;
}

function redirectWithHash(returnTo, values) {
  const target = new URL(safeReturnTo(returnTo));
  target.hash = new URLSearchParams(values).toString();
  return Response.redirect(target.toString(), 302);
}

export async function authCallback(request, env, provider) {
  if (!env?.DB || !AUTH_PROVIDERS.has(provider)) return json({ error: 'invalid_callback' }, { status: 400 });
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const stored = await consumeState(env, state, provider);
  if (!stored) return redirectWithHash(DEFAULT_RETURN, { auth_error: 'invalid_state' });
  if (!code || url.searchParams.get('error')) return redirectWithHash(stored.return_to, { auth_error: url.searchParams.get('error') || 'missing_code' });
  try {
    const profile = await providerProfile(request, env, provider, code);
    const userId = await upsertIdentity(env, provider, profile);
    const exchange = await createExchangeCode(env, userId);
    return redirectWithHash(stored.return_to, { auth_code: exchange, auth_provider: provider });
  } catch (error) {
    console.error('AUTH_CALLBACK_FAILED', provider, error instanceof Error ? error.message : String(error));
    return redirectWithHash(stored.return_to, { auth_error: 'provider_exchange_failed' });
  }
}

async function userSummary(env, userId) {
  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.email, u.avatar_url,
            EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.user_id = u.id AND ai.provider = 'local') AS local_account,
            EXISTS(SELECT 1 FROM user_email_verifications v WHERE v.user_id = u.id) AS email_verified
       FROM users u
      WHERE u.id = ?`
  ).bind(userId).first();
  return row ? {
    id: row.id,
    displayName: row.display_name || null,
    email: row.email || null,
    avatarUrl: row.avatar_url || null,
    localAccount: Boolean(row.local_account),
    emailVerified: Boolean(row.email_verified),
  } : null;
}

export async function exchangeAuth(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  if (!code) return { status: 400, body: { error: 'missing_code' } };
  const hash = await sha256Hex(code);
  const row = await env.DB.prepare('SELECT user_id, expires_at FROM login_exchange_codes WHERE code_hash = ?').bind(hash).first();
  await env.DB.prepare('DELETE FROM login_exchange_codes WHERE code_hash = ?').bind(hash).run();
  if (!row || Number(row.expires_at || 0) < Date.now()) return { status: 400, body: { error: 'invalid_or_expired_code' } };
  const token = randomToken(36);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, row.user_id, now, now + SESSION_TTL).run();
  return { status: 200, body: { token, user: await userSummary(env, row.user_id), expiresAt: now + SESSION_TTL } };
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

async function sessionRow(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT token_hash, user_id, expires_at FROM user_sessions WHERE token_hash = ?').bind(hash).first();
  if (!row) return null;
  if (Number(row.expires_at || 0) < Date.now()) {
    await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  return row;
}

export async function sessionInfo(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const row = await sessionRow(request, env);
  if (!row) return { status: 200, body: { authenticated: false, user: null } };
  return { status: 200, body: { authenticated: true, user: await userSummary(env, row.user_id) } };
}

export async function logout(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const token = bearerToken(request);
  if (token) await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return { status: 200, body: { ok: true } };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}


function normalizeDisplayName(value, email = '') {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name && name.length <= 60) return name;
  return email ? email.split('@')[0].slice(0, 60) : '';
}

function normalizePassword(value) {
  if (typeof value !== 'string') return '';
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return '';
  return value;
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function passwordDigest(password, saltBytes, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: saltBytes,
    iterations,
  }, material, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function createPasswordCredential(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return {
    salt: bytesToBase64Url(salt),
    hash: await passwordDigest(password, salt, PASSWORD_PBKDF2_ITERATIONS),
    iterations: PASSWORD_PBKDF2_ITERATIONS,
  };
}

async function verifyPassword(password, row) {
  try {
    const actual = await passwordDigest(password, base64UrlToBytes(row.salt), Number(row.iterations || 0));
    return constantTimeEqual(actual, String(row.password_hash || ''));
  } catch {
    return false;
  }
}

async function createUserSession(env, userId) {
  const token = randomToken(36);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(tokenHash, userId, now, now + SESSION_TTL).run();
  return { token, user: await userSummary(env, userId), expiresAt: now + SESSION_TTL };
}

export async function registerPasswordUser(request, env, payload) {
  void request;
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!providerConfigured(env, 'email')) return { status: 503, body: { error: 'provider_not_configured', provider: 'email' } };

  const email = normalizeEmail(payload?.email);
  const password = normalizePassword(payload?.password);
  const displayName = normalizeDisplayName(payload?.displayName, email);
  if (!email) return { status: 400, body: { error: 'invalid_email' } };
  if (!password) return { status: 400, body: { error: 'invalid_password', minimum: PASSWORD_MIN_LENGTH, maximum: PASSWORD_MAX_LENGTH } };
  if (!displayName) return { status: 400, body: { error: 'invalid_display_name' } };

  const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1').bind(email).first();
  if (existing?.id) return { status: 409, body: { error: 'email_already_registered' } };

  const previous = await env.DB.prepare(
    "SELECT challenge_id, last_sent_at FROM email_code_challenges WHERE purpose = 'register' AND email = ?"
  ).bind(email).first();
  if (previous?.challenge_id) {
    const elapsed = Date.now() - Number(previous.last_sent_at || 0);
    if (elapsed < EMAIL_CODE_COOLDOWN) {
      return {
        status: 429,
        body: {
          error: 'code_cooldown',
          challengeId: previous.challenge_id,
          retryAfter: Math.ceil((EMAIL_CODE_COOLDOWN - elapsed) / 1000),
        },
      };
    }
  }

  const credential = await createPasswordCredential(password);
  const challengeId = `ch_${randomToken(18)}`;
  const code = randomEmailCode();
  const codeSalt = randomShortSalt();
  const codeHash = await emailCodeHash(code, codeSalt);
  const now = Date.now();

  await env.DB.prepare("DELETE FROM email_code_challenges WHERE purpose = 'register' AND email = ?").bind(email).run();
  await env.DB.prepare(
    `INSERT INTO email_code_challenges
      (challenge_id, purpose, user_id, email, display_name, password_hash, salt, iterations,
       code_hash, code_salt, attempts, last_sent_at, created_at, expires_at)
     VALUES (?, 'register', NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(
    challengeId, email, displayName, credential.hash, credential.salt, credential.iterations,
    codeHash, codeSalt, now, now, now + REGISTER_TTL
  ).run();

  const sent = await sendEmailCode(env, email, 'register', code);
  if (!sent.ok) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: sent.error === 'provider_not_configured' ? 503 : 502, body: { error: sent.error } };
  }
  return {
    status: 202,
    body: {
      accepted: true,
      verificationRequired: true,
      challengeId,
      expiresIn: REGISTER_TTL / 1000,
      resendAfter: EMAIL_CODE_COOLDOWN / 1000,
    },
  };
}

export async function verifyPasswordRegistration(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const row = await challengeRow(env, payload?.challengeId, 'register');
  const verified = await verifyChallengeCode(env, row, payload?.code);
  if (!verified.ok) return { status: verified.status, body: { error: verified.error, attemptsRemaining: verified.attemptsRemaining } };

  const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1').bind(row.email).first();
  if (existing?.id) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
    return { status: 409, body: { error: 'email_already_registered' } };
  }

  const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, display_name, email, avatar_url, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)'
    ).bind(userId, row.display_name, row.email, now, now).run();
    await env.DB.prepare(
      `INSERT INTO auth_identities
        (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at, updated_at)
       VALUES ('local', ?, ?, ?, ?, NULL, ?, ?)`
    ).bind(row.email, userId, row.email, row.display_name, now, now).run();
    await env.DB.prepare(
      'INSERT INTO password_credentials (user_id, email, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, row.email, row.password_hash, row.salt, Number(row.iterations), now, now).run();
    await env.DB.prepare(
      'INSERT INTO user_email_verifications (user_id, email, verified_at) VALUES (?, ?, ?)'
    ).bind(userId, row.email, now).run();
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
    return { status: 201, body: await createUserSession(env, userId) };
  } catch (error) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run().catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|constraint/i.test(message)) return { status: 409, body: { error: 'email_already_registered' } };
    console.error('PASSWORD_REGISTER_VERIFY_FAILED', message);
    return { status: 500, body: { error: 'registration_failed' } };
  }
}

export async function resendPasswordRegistrationCode(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  return resendChallengeCode(env, await challengeRow(env, payload?.challengeId, 'register'));
}

export async function startPasswordReset(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!providerConfigured(env, 'email')) return { status: 503, body: { error: 'provider_not_configured', provider: 'email' } };
  const email = normalizeEmail(payload?.email);
  if (!email) return { status: 400, body: { error: 'invalid_email' } };

  const fakeChallengeId = `ch_${randomToken(18)}`;
  const credential = await env.DB.prepare(
    'SELECT user_id, email FROM password_credentials WHERE email = ?'
  ).bind(email).first();
  if (!credential?.user_id) {
    return {
      status: 202,
      body: { accepted: true, challengeId: fakeChallengeId, expiresIn: REGISTER_TTL / 1000, resendAfter: EMAIL_CODE_COOLDOWN / 1000 },
    };
  }

  const previous = await env.DB.prepare(
    "SELECT challenge_id, last_sent_at FROM email_code_challenges WHERE purpose = 'reset' AND email = ?"
  ).bind(email).first();
  if (previous?.challenge_id) {
    const elapsed = Date.now() - Number(previous.last_sent_at || 0);
    if (elapsed < EMAIL_CODE_COOLDOWN) {
      return {
        status: 202,
        body: {
          accepted: true,
          challengeId: previous.challenge_id,
          expiresIn: REGISTER_TTL / 1000,
          resendAfter: Math.ceil((EMAIL_CODE_COOLDOWN - elapsed) / 1000),
        },
      };
    }
  }

  const challengeId = `ch_${randomToken(18)}`;
  const code = randomEmailCode();
  const codeSalt = randomShortSalt();
  const codeHash = await emailCodeHash(code, codeSalt);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM email_code_challenges WHERE purpose = 'reset' AND email = ?").bind(email).run();
  await env.DB.prepare(
    `INSERT INTO email_code_challenges
      (challenge_id, purpose, user_id, email, code_hash, code_salt, attempts, last_sent_at, created_at, expires_at)
     VALUES (?, 'reset', ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(challengeId, credential.user_id, email, codeHash, codeSalt, now, now, now + REGISTER_TTL).run();

  const sent = await sendEmailCode(env, email, 'reset', code);
  if (!sent.ok) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: sent.error === 'provider_not_configured' ? 503 : 502, body: { error: sent.error } };
  }
  return {
    status: 202,
    body: { accepted: true, challengeId, expiresIn: REGISTER_TTL / 1000, resendAfter: EMAIL_CODE_COOLDOWN / 1000 },
  };
}

export async function resendPasswordResetCode(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const row = await challengeRow(env, payload?.challengeId, 'reset');
  if (!row) return { status: 202, body: { accepted: true, challengeId: payload?.challengeId || '', expiresIn: REGISTER_TTL / 1000, resendAfter: EMAIL_CODE_COOLDOWN / 1000 } };
  return resendChallengeCode(env, row);
}

export async function confirmPasswordReset(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const password = normalizePassword(payload?.newPassword);
  if (!password) return { status: 400, body: { error: 'invalid_password', minimum: PASSWORD_MIN_LENGTH, maximum: PASSWORD_MAX_LENGTH } };
  const row = await challengeRow(env, payload?.challengeId, 'reset');
  const verified = await verifyChallengeCode(env, row, payload?.code);
  if (!verified.ok) return { status: verified.status, body: { error: verified.error, attemptsRemaining: verified.attemptsRemaining } };
  if (!row?.user_id) return { status: 400, body: { error: 'invalid_code' } };

  const credential = await createPasswordCredential(password);
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE password_credentials SET password_hash = ?, salt = ?, iterations = ?, updated_at = ? WHERE user_id = ?'
  ).bind(credential.hash, credential.salt, credential.iterations, now, row.user_id).run();
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(row.user_id).run();
  await env.DB.prepare(
    `INSERT INTO user_email_verifications (user_id, email, verified_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at`
  ).bind(row.user_id, row.email, now).run();
  await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
  return { status: 200, body: { ok: true, reauthRequired: true } };
}

export async function startExistingEmailVerification(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!providerConfigured(env, 'email')) return { status: 503, body: { error: 'provider_not_configured', provider: 'email' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const user = await userSummary(env, session.user_id);
  if (!user?.localAccount || !user.email) return { status: 400, body: { error: 'email_verification_not_applicable' } };
  if (user.emailVerified) return { status: 200, body: { verified: true, user } };

  const previous = await env.DB.prepare(
    "SELECT challenge_id, last_sent_at FROM email_code_challenges WHERE purpose = 'verify' AND email = ?"
  ).bind(user.email).first();
  if (previous?.challenge_id) {
    const elapsed = Date.now() - Number(previous.last_sent_at || 0);
    if (elapsed < EMAIL_CODE_COOLDOWN) {
      return {
        status: 429,
        body: { error: 'code_cooldown', challengeId: previous.challenge_id, retryAfter: Math.ceil((EMAIL_CODE_COOLDOWN - elapsed) / 1000) },
      };
    }
  }

  const challengeId = `ch_${randomToken(18)}`;
  const code = randomEmailCode();
  const codeSalt = randomShortSalt();
  const codeHash = await emailCodeHash(code, codeSalt);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM email_code_challenges WHERE purpose = 'verify' AND email = ?").bind(user.email).run();
  await env.DB.prepare(
    `INSERT INTO email_code_challenges
      (challenge_id, purpose, user_id, email, code_hash, code_salt, attempts, last_sent_at, created_at, expires_at)
     VALUES (?, 'verify', ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(challengeId, session.user_id, user.email, codeHash, codeSalt, now, now, now + REGISTER_TTL).run();

  const sent = await sendEmailCode(env, user.email, 'verify', code);
  if (!sent.ok) {
    await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: sent.error === 'provider_not_configured' ? 503 : 502, body: { error: sent.error } };
  }
  return { status: 200, body: { accepted: true, challengeId, expiresIn: REGISTER_TTL / 1000, resendAfter: EMAIL_CODE_COOLDOWN / 1000 } };
}

export async function resendExistingEmailVerification(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const row = await challengeRow(env, payload?.challengeId, 'verify');
  if (!row || row.user_id !== session.user_id) return { status: 400, body: { error: 'invalid_challenge' } };
  return resendChallengeCode(env, row);
}

export async function confirmExistingEmailVerification(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const row = await challengeRow(env, payload?.challengeId, 'verify');
  if (!row || row.user_id !== session.user_id) return { status: 400, body: { error: 'invalid_challenge' } };
  const verified = await verifyChallengeCode(env, row, payload?.code);
  if (!verified.ok) return { status: verified.status, body: { error: verified.error, attemptsRemaining: verified.attemptsRemaining } };
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user_email_verifications (user_id, email, verified_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at`
  ).bind(session.user_id, row.email, now).run();
  await env.DB.prepare('DELETE FROM email_code_challenges WHERE challenge_id = ?').bind(row.challenge_id).run();
  return { status: 200, body: { verified: true, user: await userSummary(env, session.user_id) } };
}

export async function changePassword(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const currentPassword = normalizePassword(payload?.currentPassword);
  const newPassword = normalizePassword(payload?.newPassword);
  if (!currentPassword || !newPassword) return { status: 400, body: { error: 'invalid_password' } };

  const row = await env.DB.prepare(
    'SELECT user_id, password_hash, salt, iterations FROM password_credentials WHERE user_id = ?'
  ).bind(session.user_id).first();
  if (!row) return { status: 400, body: { error: 'password_not_configured' } };
  if (!(await verifyPassword(currentPassword, row))) return { status: 401, body: { error: 'invalid_current_password' } };

  const credential = await createPasswordCredential(newPassword);
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE password_credentials SET password_hash = ?, salt = ?, iterations = ?, updated_at = ? WHERE user_id = ?'
  ).bind(credential.hash, credential.salt, credential.iterations, now, session.user_id).run();
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(session.user_id).run();
  return { status: 200, body: await createUserSession(env, session.user_id) };
}

export async function startEmailChange(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!providerConfigured(env, 'email')) return { status: 503, body: { error: 'provider_not_configured', provider: 'email' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };

  const newEmail = normalizeEmail(payload?.newEmail);
  const currentPassword = normalizePassword(payload?.currentPassword);
  if (!newEmail) return { status: 400, body: { error: 'invalid_email' } };
  if (!currentPassword) return { status: 400, body: { error: 'invalid_password' } };

  const user = await userSummary(env, session.user_id);
  if (!user?.localAccount || !user.email) return { status: 400, body: { error: 'email_change_not_applicable' } };
  if (newEmail === String(user.email).toLowerCase()) return { status: 400, body: { error: 'email_unchanged' } };

  const credential = await env.DB.prepare(
    'SELECT user_id, password_hash, salt, iterations FROM password_credentials WHERE user_id = ?'
  ).bind(session.user_id).first();
  if (!credential || !(await verifyPassword(currentPassword, credential))) {
    return { status: 401, body: { error: 'invalid_current_password' } };
  }

  const conflict = await env.DB.prepare(
    'SELECT user_id FROM password_credentials WHERE email = ? AND user_id <> ? LIMIT 1'
  ).bind(newEmail, session.user_id).first();
  if (conflict?.user_id) return { status: 409, body: { error: 'email_already_registered' } };

  const previous = await env.DB.prepare(
    'SELECT challenge_id, last_sent_at FROM email_change_challenges WHERE user_id = ?'
  ).bind(session.user_id).first();
  if (previous?.challenge_id) {
    const elapsed = Date.now() - Number(previous.last_sent_at || 0);
    if (elapsed < EMAIL_CODE_COOLDOWN) {
      return {
        status: 429,
        body: {
          error: 'code_cooldown',
          challengeId: previous.challenge_id,
          retryAfter: Math.ceil((EMAIL_CODE_COOLDOWN - elapsed) / 1000),
        },
      };
    }
  }

  const challengeId = `ch_${randomToken(18)}`;
  const code = randomEmailCode();
  const codeSalt = randomShortSalt();
  const codeHash = await emailCodeHash(code, codeSalt);
  const now = Date.now();
  await env.DB.prepare('DELETE FROM email_change_challenges WHERE user_id = ?').bind(session.user_id).run();
  await env.DB.prepare(
    `INSERT INTO email_change_challenges
      (challenge_id, user_id, new_email, code_hash, code_salt, attempts, last_sent_at, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(challengeId, session.user_id, newEmail, codeHash, codeSalt, now, now, now + REGISTER_TTL).run();

  const sent = await sendEmailCode(env, newEmail, 'change', code);
  if (!sent.ok) {
    await env.DB.prepare('DELETE FROM email_change_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: sent.error === 'provider_not_configured' ? 503 : 502, body: { error: sent.error } };
  }
  return {
    status: 200,
    body: {
      accepted: true,
      challengeId,
      newEmail,
      expiresIn: REGISTER_TTL / 1000,
      resendAfter: EMAIL_CODE_COOLDOWN / 1000,
    },
  };
}

export async function resendEmailChange(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const challengeId = typeof payload?.challengeId === 'string' ? payload.challengeId.trim() : '';
  const row = await env.DB.prepare(
    'SELECT challenge_id, user_id, new_email, code_hash, code_salt, attempts, last_sent_at, created_at, expires_at FROM email_change_challenges WHERE challenge_id = ?'
  ).bind(challengeId).first();
  if (!row || row.user_id !== session.user_id) return { status: 400, body: { error: 'invalid_challenge' } };
  const now = Date.now();
  if (Number(row.expires_at || 0) <= now) {
    await env.DB.prepare('DELETE FROM email_change_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: 410, body: { error: 'code_expired' } };
  }
  const elapsed = now - Number(row.last_sent_at || 0);
  if (elapsed < EMAIL_CODE_COOLDOWN) {
    return { status: 429, body: { error: 'code_cooldown', retryAfter: Math.ceil((EMAIL_CODE_COOLDOWN - elapsed) / 1000) } };
  }
  const code = randomEmailCode();
  const codeSalt = randomShortSalt();
  const codeHash = await emailCodeHash(code, codeSalt);
  const sent = await sendEmailCode(env, row.new_email, 'change', code);
  if (!sent.ok) return { status: sent.error === 'provider_not_configured' ? 503 : 502, body: { error: sent.error } };
  await env.DB.prepare(
    'UPDATE email_change_challenges SET code_hash = ?, code_salt = ?, attempts = 0, last_sent_at = ?, expires_at = ? WHERE challenge_id = ?'
  ).bind(codeHash, codeSalt, now, now + REGISTER_TTL, challengeId).run();
  return { status: 200, body: { accepted: true, challengeId, newEmail: row.new_email, expiresIn: REGISTER_TTL / 1000, resendAfter: EMAIL_CODE_COOLDOWN / 1000 } };
}

export async function confirmEmailChange(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const challengeId = typeof payload?.challengeId === 'string' ? payload.challengeId.trim() : '';
  const row = await env.DB.prepare(
    'SELECT challenge_id, user_id, new_email, code_hash, code_salt, attempts, expires_at FROM email_change_challenges WHERE challenge_id = ?'
  ).bind(challengeId).first();
  if (!row || row.user_id !== session.user_id) return { status: 400, body: { error: 'invalid_challenge' } };
  if (Number(row.expires_at || 0) <= Date.now()) {
    await env.DB.prepare('DELETE FROM email_change_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: 410, body: { error: 'code_expired' } };
  }
  if (Number(row.attempts || 0) >= EMAIL_CODE_MAX_ATTEMPTS) {
    await env.DB.prepare('DELETE FROM email_change_challenges WHERE challenge_id = ?').bind(challengeId).run();
    return { status: 429, body: { error: 'too_many_code_attempts' } };
  }
  const code = normalizeEmailCode(payload?.code);
  const valid = code && constantTimeEqual(await emailCodeHash(code, row.code_salt), String(row.code_hash || ''));
  if (!valid) {
    const nextAttempts = Number(row.attempts || 0) + 1;
    if (nextAttempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await env.DB.prepare('DELETE FROM email_change_challenges WHERE challenge_id = ?').bind(challengeId).run();
      return { status: 429, body: { error: 'too_many_code_attempts', attemptsRemaining: 0 } };
    }
    await env.DB.prepare('UPDATE email_change_challenges SET attempts = ? WHERE challenge_id = ?')
      .bind(nextAttempts, challengeId).run();
    return { status: 400, body: { error: 'invalid_code', attemptsRemaining: EMAIL_CODE_MAX_ATTEMPTS - nextAttempts } };
  }

  const conflict = await env.DB.prepare(
    'SELECT user_id FROM password_credentials WHERE email = ? AND user_id <> ? LIMIT 1'
  ).bind(row.new_email, session.user_id).first();
  if (conflict?.user_id) return { status: 409, body: { error: 'email_already_registered' } };

  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').bind(row.new_email, now, session.user_id),
      env.DB.prepare('UPDATE password_credentials SET email = ?, updated_at = ? WHERE user_id = ?').bind(row.new_email, now, session.user_id),
      env.DB.prepare("UPDATE auth_identities SET provider_user_id = ?, email = ?, updated_at = ? WHERE provider = 'local' AND user_id = ?")
        .bind(row.new_email, row.new_email, now, session.user_id),
      env.DB.prepare(
        `INSERT INTO user_email_verifications (user_id, email, verified_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at`
      ).bind(session.user_id, row.new_email, now),
      env.DB.prepare('DELETE FROM email_change_challenges WHERE challenge_id = ?').bind(challengeId),
      env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(session.user_id),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|constraint/i.test(message)) return { status: 409, body: { error: 'email_already_registered' } };
    console.error('EMAIL_CHANGE_FAILED', message);
    return { status: 500, body: { error: 'email_change_failed' } };
  }
  return { status: 200, body: await createUserSession(env, session.user_id) };
}

export async function revokeOtherSessions(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const session = await sessionRow(request, env);
  if (!session) return { status: 401, body: { error: 'not_authenticated' } };
  const result = await env.DB.prepare(
    'DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?'
  ).bind(session.user_id, session.token_hash).run();
  return { status: 200, body: { ok: true, revoked: Number(result?.meta?.changes || 0) } };
}

export async function consumePasswordRegistration(request, env) {
  if (!env?.DB) return json({ error: 'database_not_configured' }, { status: 503 });
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return redirectWithHash(DEFAULT_RETURN, { auth_error: 'missing_registration_token' });
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT email, display_name, password_hash, salt, iterations, return_to, expires_at
     FROM password_registration_tokens WHERE token_hash = ?`
  ).bind(tokenHash).first();
  await env.DB.prepare('DELETE FROM password_registration_tokens WHERE token_hash = ?').bind(tokenHash).run();
  if (!row || Number(row.expires_at || 0) < Date.now()) {
    return redirectWithHash(DEFAULT_RETURN, { auth_error: 'registration_link_expired' });
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1').bind(row.email).first();
  if (existing?.id) return redirectWithHash(row.return_to, { auth_error: 'email_already_registered' });

  const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, display_name, email, avatar_url, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)'
    ).bind(userId, row.display_name, row.email, now, now).run();
    await env.DB.prepare(
      `INSERT INTO auth_identities
        (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at, updated_at)
       VALUES ('local', ?, ?, ?, ?, NULL, ?, ?)`
    ).bind(row.email, userId, row.email, row.display_name, now, now).run();
    await env.DB.prepare(
      'INSERT INTO password_credentials (user_id, email, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, row.email, row.password_hash, row.salt, Number(row.iterations), now, now).run();
    const exchange = await createExchangeCode(env, userId);
    return redirectWithHash(row.return_to, { auth_code: exchange, auth_provider: 'local' });
  } catch (error) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run().catch(() => {});
    console.error('LEGACY_REGISTRATION_CONSUME_FAILED', error instanceof Error ? error.message : String(error));
    return redirectWithHash(row.return_to, { auth_error: 'registration_failed' });
  }
}

export async function passwordLogin(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const email = normalizeEmail(payload?.email);
  const password = normalizePassword(payload?.password);
  if (!email || !password) return { status: 401, body: { error: 'invalid_credentials' } };
  const row = await env.DB.prepare(
    'SELECT user_id, password_hash, salt, iterations FROM password_credentials WHERE email = ?'
  ).bind(email).first();
  if (!row || !(await verifyPassword(password, row))) return { status: 401, body: { error: 'invalid_credentials' } };
  return { status: 200, body: await createUserSession(env, row.user_id) };
}

async function upsertEmailIdentity(env, email) {
  const existing = await env.DB.prepare(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?'
  ).bind('email', email).first();
  if (existing?.user_id) return existing.user_id;

  const matchingUser = await env.DB.prepare(
    'SELECT id, display_name FROM users WHERE lower(email) = ? LIMIT 1'
  ).bind(email).first();
  if (!matchingUser?.id) {
    return upsertIdentity(env, 'email', {
      providerUserId: email,
      email,
      displayName: email.split('@')[0],
      avatarUrl: null,
    });
  }

  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO auth_identities (provider, provider_user_id, user_id, email, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)'
  ).bind('email', email, matchingUser.id, email, matchingUser.display_name || email.split('@')[0], now, now).run();
  return matchingUser.id;
}

export async function emailStart(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  if (!providerConfigured(env, 'email')) return { status: 503, body: { error: 'provider_not_configured', provider: 'email' } };
  const email = normalizeEmail(payload?.email);
  if (!email) return { status: 400, body: { error: 'invalid_email' } };
  const returnTo = safeReturnTo(payload?.returnTo);
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO email_login_tokens (token_hash, email, return_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(hash, email, returnTo, now, now + EMAIL_TTL).run();
  const link = `${new URL(request.url).origin}/api/user-ui/auth/email/consume?token=${encodeURIComponent(token)}`;
  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: 'Organic Synthesis Literature Gallery 登录链接',
      html: `<p>点击下面的链接登录 Organic Synthesis Literature Gallery。链接 15 分钟内有效。</p><p><a href="${link}">登录</a></p>`,
    }),
  });
  if (!send.ok) {
    await env.DB.prepare('DELETE FROM email_login_tokens WHERE token_hash = ?').bind(hash).run();
    return { status: 502, body: { error: 'email_delivery_failed' } };
  }
  return { status: 200, body: { accepted: true } };
}

export async function emailConsume(request, env) {
  if (!env?.DB) return json({ error: 'database_not_configured' }, { status: 503 });
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return redirectWithHash(DEFAULT_RETURN, { auth_error: 'missing_email_token' });
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT email, return_to, expires_at FROM email_login_tokens WHERE token_hash = ?').bind(hash).first();
  await env.DB.prepare('DELETE FROM email_login_tokens WHERE token_hash = ?').bind(hash).run();
  if (!row || Number(row.expires_at || 0) < Date.now()) return redirectWithHash(DEFAULT_RETURN, { auth_error: 'email_link_expired' });
  const userId = await upsertEmailIdentity(env, row.email);
  const exchange = await createExchangeCode(env, userId);
  return redirectWithHash(row.return_to, { auth_code: exchange, auth_provider: 'email' });
}

function pemBytes(pem) {
  const clean = String(pem || '').replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  if (!clean) throw new Error('empty_pem');
  const binary = atob(clean);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function importPrivateKey(pem) {
  return crypto.subtle.importKey('pkcs8', pemBytes(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function importPublicKey(pem) {
  return crypto.subtle.importKey('spki', pemBytes(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

function arrayBufferBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function rsaSign(pem, value) {
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importPrivateKey(pem), new TextEncoder().encode(value));
  return arrayBufferBase64(signature);
}

async function rsaVerify(pem, value, signatureBase64) {
  try {
    const signature = Uint8Array.from(atob(signatureBase64), char => char.charCodeAt(0));
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', await importPublicKey(pem), signature, new TextEncoder().encode(value));
  } catch {
    return false;
  }
}

function shanghaiTimestamp(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeProfileId(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(v) ? v : null;
}

async function optionalUserId(request, env) {
  const row = await sessionRow(request, env);
  return row?.user_id || null;
}

async function insertSupportOrder(request, env, provider, amountCents, profileId) {
  const id = `sup_${Date.now().toString(36)}_${randomToken(9).replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`;
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO support_orders (id, provider, amount_cents, status, profile_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, provider, amountCents, 'created', profileId, await optionalUserId(request, env), now, now).run();
  return id;
}

async function updateOrder(env, id, status, providerOrderId = null, detail = null) {
  await env.DB.prepare(
    'UPDATE support_orders SET status = ?, provider_order_id = COALESCE(?, provider_order_id), detail_json = COALESCE(?, detail_json), updated_at = ? WHERE id = ?'
  ).bind(status, providerOrderId, detail ? JSON.stringify(detail).slice(0, 5000) : null, Date.now(), id).run();
}

async function createWeChatPayment(request, env, orderId, amountCents) {
  const origin = new URL(request.url).origin;
  const apiPath = '/v3/pay/transactions/native';
  const body = JSON.stringify({
    appid: env.WECHAT_PAY_APP_ID,
    mchid: env.WECHAT_PAY_MCH_ID,
    description: '支持 Organic Synthesis Literature Gallery',
    out_trade_no: orderId,
    notify_url: `${origin}/api/user-ui/payments/wechat/notify`,
    amount: { total: amountCents, currency: 'CNY' },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomToken(18);
  const canonical = `POST\n${apiPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = await rsaSign(env.WECHAT_PAY_PRIVATE_KEY, canonical);
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.WECHAT_PAY_SERIAL_NO}",signature="${signature}"`;
  const response = await fetch(`https://api.mch.weixin.qq.com${apiPath}`, {
    method: 'POST',
    headers: { authorization, accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'organic-synthesis-gallery/1.0' },
    body,
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch { payload = {}; }
  if (!response.ok || !payload.code_url) throw new Error(`wechat_pay_create_${response.status}`);
  await updateOrder(env, orderId, 'pending', null, { codeUrl: payload.code_url });
  return { orderId, provider: 'wechat', codeUrl: payload.code_url, status: 'pending' };
}

function alipayCanonical(params) {
  return [...params.entries()].filter(([key, value]) => key !== 'sign' && key !== 'sign_type' && value !== '').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
}

async function createAlipayPayment(request, env, orderId, amountCents, returnTo) {
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    app_id: env.ALIPAY_APP_ID,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: shanghaiTimestamp(),
    version: '1.0',
    notify_url: `${origin}/api/user-ui/payments/alipay/notify`,
    return_url: safeReturnTo(returnTo),
    biz_content: JSON.stringify({
      out_trade_no: orderId,
      total_amount: (amountCents / 100).toFixed(2),
      subject: '支持 Organic Synthesis Literature Gallery',
      product_code: 'FAST_INSTANT_TRADE_PAY',
    }),
  });
  params.set('sign', await rsaSign(env.ALIPAY_PRIVATE_KEY, alipayCanonical(params)));
  const checkoutUrl = `https://openapi.alipay.com/gateway.do?${params.toString()}`;
  await updateOrder(env, orderId, 'pending');
  return { orderId, provider: 'alipay', checkoutUrl, status: 'pending' };
}

export async function createPayment(request, env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const provider = typeof payload?.provider === 'string' ? payload.provider.toLowerCase() : '';
  if (!PAYMENT_PROVIDERS.has(provider)) return { status: 400, body: { error: 'unsupported_provider' } };
  if (!paymentConfigured(env, provider)) return { status: 503, body: { error: 'payment_not_configured', provider } };
  const amount = Number(payload?.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 50000) return { status: 400, body: { error: 'invalid_amount', minimum: 1, maximum: 50000 } };
  const amountCents = Math.round(amount * 100);
  const orderId = await insertSupportOrder(request, env, provider, amountCents, normalizeProfileId(payload?.profileId));
  try {
    const result = provider === 'wechat'
      ? await createWeChatPayment(request, env, orderId, amountCents)
      : await createAlipayPayment(request, env, orderId, amountCents, payload?.returnTo);
    return { status: 200, body: result };
  } catch (error) {
    await updateOrder(env, orderId, 'failed', null, { error: error instanceof Error ? error.message : String(error) });
    console.error('PAYMENT_CREATE_FAILED', provider, error instanceof Error ? error.message : String(error));
    return { status: 502, body: { error: 'payment_create_failed', provider, orderId } };
  }
}

export async function paymentStatus(request, env) {
  if (!env?.DB) return { status: 503, body: { error: 'database_not_configured' } };
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^sup_[A-Za-z0-9_-]{8,80}$/.test(id)) return { status: 400, body: { error: 'invalid_order_id' } };
  const row = await env.DB.prepare('SELECT id, provider, amount_cents, status, created_at, updated_at FROM support_orders WHERE id = ?').bind(id).first();
  if (!row) return { status: 404, body: { error: 'order_not_found' } };
  return { status: 200, body: { orderId: row.id, provider: row.provider, amount: Number(row.amount_cents) / 100, status: row.status, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) } };
}

export async function alipayNotify(request, env) {
  if (!env?.DB || !paymentConfigured(env, 'alipay')) return new Response('failure', { status: 503 });
  const form = new URLSearchParams(await request.text());
  const signature = form.get('sign') || '';
  if (!signature || !(await rsaVerify(env.ALIPAY_PUBLIC_KEY, alipayCanonical(form), signature))) return new Response('failure', { status: 400 });
  const orderId = form.get('out_trade_no') || '';
  const tradeStatus = form.get('trade_status') || '';
  const total = Number(form.get('total_amount') || '0');
  const row = await env.DB.prepare('SELECT amount_cents FROM support_orders WHERE id = ? AND provider = ?').bind(orderId, 'alipay').first();
  if (!row || Math.round(total * 100) !== Number(row.amount_cents)) return new Response('failure', { status: 400 });
  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    await updateOrder(env, orderId, 'paid', form.get('trade_no') || null);
  }
  return new Response('success', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function decryptWechatResource(env, resource) {
  const keyBytes = new TextEncoder().encode(env.WECHAT_PAY_API_V3_KEY);
  if (keyBytes.byteLength !== 32) throw new Error('invalid_wechat_api_v3_key');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const cipher = Uint8Array.from(atob(resource.ciphertext), char => char.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: new TextEncoder().encode(resource.nonce),
    additionalData: new TextEncoder().encode(resource.associated_data || ''),
    tagLength: 128,
  }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function wechatNotify(request, env) {
  if (!env?.DB || !paymentConfigured(env, 'wechat')) return json({ code: 'FAIL', message: 'not_configured' }, { status: 503 });
  const text = await request.text();
  const timestamp = request.headers.get('Wechatpay-Timestamp') || '';
  const nonce = request.headers.get('Wechatpay-Nonce') || '';
  const signature = request.headers.get('Wechatpay-Signature') || '';
  const valid = await rsaVerify(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY, `${timestamp}\n${nonce}\n${text}\n`, signature);
  if (!valid) return json({ code: 'FAIL', message: 'invalid_signature' }, { status: 400 });
  try {
    const event = JSON.parse(text);
    const transaction = await decryptWechatResource(env, event.resource || {});
    const orderId = transaction.out_trade_no || '';
    const total = Number(transaction.amount?.total || 0);
    const row = await env.DB.prepare('SELECT amount_cents FROM support_orders WHERE id = ? AND provider = ?').bind(orderId, 'wechat').first();
    if (!row || total !== Number(row.amount_cents)) return json({ code: 'FAIL', message: 'amount_mismatch' }, { status: 400 });
    if (transaction.trade_state === 'SUCCESS') await updateOrder(env, orderId, 'paid', transaction.transaction_id || null);
    return json({ code: 'SUCCESS', message: '成功' }, { status: 200 });
  } catch (error) {
    console.error('WECHAT_NOTIFY_FAILED', error instanceof Error ? error.message : String(error));
    return json({ code: 'FAIL', message: 'decrypt_failed' }, { status: 400 });
  }
}
