const ALLOWED_SHARE_HOSTS = new Set(['api.gczhouwld.com']);
const CACHE_ORIGIN = 'https://api.gczhouwld.com';
const EXPIRY_SAFETY_SECONDS = 300;

let memoryAccessToken = null;
let memoryJsapiTicket = null;

function result(status, body) { return { status, body }; }

function relayConfigured(env) {
  return Boolean(
    typeof env?.WECHAT_TICKET_RELAY_URL === 'string' && env.WECHAT_TICKET_RELAY_URL.trim() &&
    typeof env?.WECHAT_TICKET_RELAY_KEY === 'string' && env.WECHAT_TICKET_RELAY_KEY.trim()
  );
}

function configured(env) {
  return Boolean(
    typeof env?.WECHAT_MP_APP_ID === 'string' && env.WECHAT_MP_APP_ID.trim() &&
    (
      relayConfigured(env) ||
      (typeof env?.WECHAT_MP_APP_SECRET === 'string' && env.WECHAT_MP_APP_SECRET.trim())
    )
  );
}

function safeExpiry(expiresIn) { return Math.max(60, Number(expiresIn || 7200) - EXPIRY_SAFETY_SECONDS); }

function cacheRequest(name, appId) {
  return new Request(`${CACHE_ORIGIN}/__wechat-js-sdk-cache/${encodeURIComponent(appId)}/${name}`, { method: 'GET' });
}

async function readEdgeCache(name, appId) {
  try {
    const cached = await caches.default.match(cacheRequest(name, appId));
    if (!cached) return null;
    const body = await cached.json();
    return body && typeof body.value === 'string' ? body : null;
  } catch { return null; }
}

async function writeEdgeCache(name, appId, value, ttl) {
  try {
    await caches.default.put(cacheRequest(name, appId), new Response(JSON.stringify({ value }), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
    }));
  } catch {}
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const error = new Error(`wechat_http_${response.status}`);
    error.details = body;
    throw error;
  }
  return body;
}

async function accessToken(env) {
  const appId = env.WECHAT_MP_APP_ID.trim();
  const secret = env.WECHAT_MP_APP_SECRET.trim();
  const now = Date.now();
  if (memoryAccessToken?.value && memoryAccessToken.expiresAt > now) return memoryAccessToken.value;
  const edge = await readEdgeCache('access-token', appId);
  if (edge?.value) {
    memoryAccessToken = { value: edge.value, expiresAt: now + 30 * 60 * 1000 };
    return edge.value;
  }
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', secret);
  const body = await fetchJson(url.toString());
  if (!body?.access_token) {
    const error = new Error('wechat_access_token_error');
    error.details = body;
    throw error;
  }
  const ttl = safeExpiry(body.expires_in);
  memoryAccessToken = { value: body.access_token, expiresAt: now + ttl * 1000 };
  await writeEdgeCache('access-token', appId, body.access_token, ttl);
  return body.access_token;
}

async function relayTicket(env) {
  const response = await fetch(env.WECHAT_TICKET_RELAY_URL.trim(), {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${env.WECHAT_TICKET_RELAY_KEY.trim()}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || body?.ok !== true || typeof body?.ticket !== 'string' || !body.ticket) {
    const error = new Error('wechat_ticket_relay_error');
    error.details = body;
    throw error;
  }
  return {
    ticket: body.ticket,
    expiresIn: Math.max(60, Number(body.expiresIn || body.expires_in || 7200)),
  };
}

async function jsapiTicket(env) {
  const appId = env.WECHAT_MP_APP_ID.trim();
  const now = Date.now();
  if (memoryJsapiTicket?.value && memoryJsapiTicket.expiresAt > now) return memoryJsapiTicket.value;
  const edge = await readEdgeCache('jsapi-ticket', appId);
  if (edge?.value) {
    memoryJsapiTicket = { value: edge.value, expiresAt: now + 30 * 60 * 1000 };
    return edge.value;
  }
  if (relayConfigured(env)) {
    const relay = await relayTicket(env);
    const ttl = safeExpiry(relay.expiresIn);
    memoryJsapiTicket = { value: relay.ticket, expiresAt: now + ttl * 1000 };
    await writeEdgeCache('jsapi-ticket', appId, relay.ticket, ttl);
    return relay.ticket;
  }

  const token = await accessToken(env);
  const url = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
  url.searchParams.set('access_token', token);
  url.searchParams.set('type', 'jsapi');
  const body = await fetchJson(url.toString());
  if (Number(body?.errcode || 0) !== 0 || !body?.ticket) {
    const error = new Error('wechat_jsapi_ticket_error');
    error.details = body;
    throw error;
  }
  const ttl = safeExpiry(body.expires_in);
  memoryJsapiTicket = { value: body.ticket, expiresAt: now + ttl * 1000 };
  await writeEdgeCache('jsapi-ticket', appId, body.ticket, ttl);
  return body.ticket;
}

function canonicalSignedUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const withoutHash = raw.trim().split('#')[0];
  try {
    const parsed = new URL(withoutHash);
    if (parsed.protocol !== 'https:' || !ALLOWED_SHARE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return withoutHash;
  } catch { return null; }
}

function randomNonce() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function publicUpstreamError(error) {
  const details = error?.details && typeof error.details === 'object' ? error.details : {};
  return {
    error: 'wechat_upstream_error',
    reason: String(error?.message || 'wechat_request_failed'),
    errcode: Number.isFinite(Number(details?.errcode)) ? Number(details.errcode) : undefined,
    errmsg: typeof details?.errmsg === 'string' ? details.errmsg : undefined,
  };
}

export async function getWeChatJsSdkSignature(request, env) {
  if (!configured(env)) return result(503, { error: 'wechat_js_sdk_not_configured' });
  const requestUrl = new URL(request.url);
  const signedUrl = canonicalSignedUrl(requestUrl.searchParams.get('url'));
  if (!signedUrl) return result(400, { error: 'invalid_wechat_signature_url', allowedHost: 'api.gczhouwld.com' });
  try {
    const ticket = await jsapiTicket(env);
    const nonceStr = randomNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureBase = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${signedUrl}`;
    const signature = await sha1Hex(signatureBase);
    return result(200, {
      ok: true,
      appId: env.WECHAT_MP_APP_ID.trim(),
      timestamp,
      nonceStr,
      signature,
      url: signedUrl,
      jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
    });
  } catch (error) {
    console.error('WECHAT_JS_SDK_SIGNATURE_FAILED', {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || undefined,
    });
    return result(502, publicUpstreamError(error));
  }
}
