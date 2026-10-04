import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8788);
const APP_ID = String(process.env.WECHAT_MP_APP_ID || '').trim();
const APP_SECRET = String(process.env.WECHAT_MP_APP_SECRET || '').trim();
const RELAY_SHARED_KEY = String(process.env.RELAY_SHARED_KEY || '').trim();
const PUBLISHER_REPO = String(process.env.PUBLISHER_REPO || '/repo').trim();
const PUBLISHER_PREVIEW_DIR = String(process.env.PUBLISHER_PREVIEW_DIR || '/preview').trim();
const PUBLISHER_PREVIEW_BASE_URL = String(process.env.PUBLISHER_PREVIEW_BASE_URL || 'https://relay.gczhouwld.com/wechat-preview').trim();

let accessTokenCache = null;
let ticketCache = null;
let publisherRunning = false;

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


function readJsonBody(req, maxBytes = 16384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('request_body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || undefined,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const cap = 2 * 1024 * 1024;
    child.stdout.on('data', (chunk) => {
      if (stdout.length < cap) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < cap) stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, Number(options.timeoutMs || 240000));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error('publisher_process_failed');
        error.details = { command, args, code, signal, stdout, stderr };
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function lastJsonLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Keep scanning.
    }
  }
  return null;
}

async function runPublisher() {
  if (publisherRunning) {
    const error = new Error('publisher_busy');
    error.status = 409;
    throw error;
  }
  publisherRunning = true;
  try {
    await runProcess('git', ['pull', '--ff-only', 'origin', 'main'], {
      cwd: PUBLISHER_REPO,
      timeoutMs: 120000,
    });
    const script = `${PUBLISHER_REPO}/ops/wechat-publisher/create-draft.py`;
    const result = await runProcess(
      'python3',
      [
        script,
        '--create',
        '--preview-dir',
        PUBLISHER_PREVIEW_DIR,
        '--preview-base-url',
        PUBLISHER_PREVIEW_BASE_URL,
      ],
      {
        cwd: PUBLISHER_REPO,
        env: {
          ...process.env,
          WECHAT_MP_APP_ID: APP_ID,
          WECHAT_MP_APP_SECRET: APP_SECRET,
          RELAY_SHARED_KEY,
        },
        timeoutMs: 300000,
      },
    );
    const payload = lastJsonLine(result.stdout);
    if (!payload) {
      const error = new Error('publisher_missing_json_result');
      error.details = { stdout: result.stdout, stderr: result.stderr };
      throw error;
    }
    return payload;
  } finally {
    publisherRunning = false;
  }
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

  if (url.pathname === '/wechat/publisher/run') {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!authorized(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    try {
      const body = await readJsonBody(req);
      if (body?.action && body.action !== 'sync_daily_draft') {
        json(res, 400, { error: 'unsupported_action' });
        return;
      }
      const result = await runPublisher();
      json(res, 200, { ok: true, result });
    } catch (error) {
      const status = Number(error?.status || 502);
      console.error('WECHAT_PUBLISHER_FAILED', {
        message: error instanceof Error ? error.message : String(error),
        details: error?.details || undefined,
      });
      json(res, status, {
        error: 'wechat_publisher_error',
        reason: error instanceof Error ? error.message : String(error),
        details: error?.details || undefined,
      });
    }
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
