import http from 'node:http';

const PORT = Number(process.env.PORT || 8788);
const APP_ID = String(process.env.WECHAT_MP_APP_ID || '').trim();
const APP_SECRET = String(process.env.WECHAT_MP_APP_SECRET || '').trim();
const RELAY_SHARED_KEY = String(process.env.RELAY_SHARED_KEY || '').trim();

let accessTokenCache = null;
let ticketCache = null;

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  return Boolean(RELAY_SHARED_KEY) && String(req.headers.authorization || '') === `Bearer ${RELAY_SHARED_KEY}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.details = body;
    throw error;
  }
  return body;
}

function usable(cache) {
  return cache?.value && Number(cache.expiresAt || 0) > Date.now() + 120000;
}

async function accessToken() {
  if (usable(accessTokenCache)) return accessTokenCache.value;
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', APP_ID);
  url.searchParams.set('secret', APP_SECRET);
  const body = await fetchJson(url.toString());
  if (!body?.access_token) {
    const error = new Error('wechat_access_token_error');
    error.details = body;
    throw error;
  }
  const ttl = Math.max(300, Number(body.expires_in || 7200) - 300);
  accessTokenCache = { value: body.access_token, expiresAt: Date.now() + ttl * 1000 };
  return accessTokenCache.value;
}

async function jsapiTicket() {
  if (usable(ticketCache)) {
    return {
      ticket: ticketCache.value,
      expiresIn: Math.max(60, Math.floor((ticketCache.expiresAt - Date.now()) / 1000)),
    };
  }
  const token = await accessToken();
  const url = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
  url.searchParams.set('access_token', token);
  url.searchParams.set('type', 'jsapi');
  const body = await fetchJson(url.toString());
  if (Number(body?.errcode || 0) !== 0 || !body?.ticket) {
    const error = new Error('wechat_jsapi_ticket_error');
    error.details = body;
    throw error;
  }
  const ttl = Math.max(300, Number(body.expires_in || 7200) - 300);
  ticketCache = { value: body.ticket, expiresAt: Date.now() + ttl * 1000 };
  return { ticket: ticketCache.value, expiresIn: ttl };
}

if (!APP_ID || !APP_SECRET || !RELAY_SHARED_KEY) {
  console.error('Missing WECHAT_MP_APP_ID, WECHAT_MP_APP_SECRET, or RELAY_SHARED_KEY');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'osg-wechat-ticket-relay' });
    return;
  }

  if (req.method !== 'GET' || url.pathname !== '/wechat/jsapi-ticket') {
    json(res, 404, { error: 'not_found' });
    return;
  }

  if (!authorized(req)) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }

  try {
    json(res, 200, { ok: true, ...(await jsapiTicket()) });
  } catch (error) {
    console.error('WECHAT_RELAY_FAILED', {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || undefined,
    });
    json(res, 502, {
      error: 'wechat_upstream_error',
      reason: error instanceof Error ? error.message : String(error),
      errcode: Number(error?.details?.errcode || 0) || undefined,
      errmsg: typeof error?.details?.errmsg === 'string' ? error.details.errmsg : undefined,
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`osg-wechat-ticket-relay listening on :${PORT}`);
});
