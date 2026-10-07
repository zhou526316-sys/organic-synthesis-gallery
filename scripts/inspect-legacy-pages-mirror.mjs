import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_PROJECT_NAME = 'organic-synthesis-gallery-public';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_ERROR_CODES = 8;

function report(classification, reason, httpStatus = 0, cloudflareErrorCodes = []) {
  return {
    schemaVersion: 1,
    probe: 'legacy-pages-mirror',
    readOnly: true,
    deployed: false,
    canRestoreAutomatically: false,
    classification,
    reason,
    httpStatus,
    cloudflareErrorCodes,
  };
}

function errorCodes(payload) {
  const codes = [];
  for (const item of Array.isArray(payload?.errors) ? payload.errors.slice(0, 64) : []) {
    const raw = item?.code;
    const code = typeof raw === 'number' ? raw
      : typeof raw === 'string' && /^\d{1,8}$/.test(raw) ? Number(raw) : NaN;
    if (Number.isSafeInteger(code) && code >= 0 && code <= 99_999_999 && !codes.includes(code)) codes.push(code);
  }
  // Keep the authentication marker visible even if unrelated errors precede it.
  if (codes.includes(10000)) return [10000, ...codes.filter(code => code !== 10000)].slice(0, MAX_ERROR_CODES);
  return codes.slice(0, MAX_ERROR_CODES);
}

async function readPayload(response, signal) {
  if (!response?.body || typeof response.body.getReader !== 'function') return { valid: false, reason: 'invalid_json' };
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let length = 0;
  try {
    if (signal.aborted) return { valid: false, reason: 'request_timeout' };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        cancel();
        return { valid: false, reason: 'response_too_large' };
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { valid: true, payload }
      : { valid: false, reason: 'invalid_json' };
  } catch {
    return { valid: false, reason: 'invalid_json' };
  }
}

/** Inspect one Pages project. Readability never authorizes deployment. */
export async function inspectLegacyPagesMirror({
  fetchImpl = globalThis.fetch,
  token,
  accountId,
  projectName = DEFAULT_PROJECT_NAME,
} = {}) {
  const credential = typeof token === 'string' ? token.trim() : '';
  const account = typeof accountId === 'string' ? accountId.trim() : '';
  const project = typeof projectName === 'string' ? projectName.trim() : '';
  if (!credential || credential.length > 4096 || /[\s\x00-\x1f\x7f]/.test(credential)) {
    return report('configuration_error', 'missing_or_invalid_authentication');
  }
  if (!/^[a-fA-F0-9]{32}$/.test(account)) return report('configuration_error', 'invalid_account_id');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(project)) {
    return report('configuration_error', 'invalid_project_name');
  }
  if (typeof fetchImpl !== 'function') return report('configuration_error', 'fetch_unavailable');

  const controller = new AbortController();
  let httpStatus = 0;
  let timedOut = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('request_timeout'));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    const operation = (async () => {
      const response = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`,
        {
          method: 'GET',
          redirect: 'error',
          headers: { accept: 'application/json', authorization: `Bearer ${credential}` },
          signal: controller.signal,
        },
      );
      httpStatus = Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599
        ? response.status : 0;
      const decoded = await readPayload(response, controller.signal);
      const codes = errorCodes(decoded.payload);
      if (httpStatus === 401 || httpStatus === 403 || codes.includes(10000)) {
        return report('authentication_denied', codes.includes(10000) ? 'cloudflare_authentication_error' : 'http_authentication_denied', httpStatus, codes);
      }
      if (httpStatus === 404) return report('missing', 'project_not_found', httpStatus, codes);
      if (httpStatus < 200 || httpStatus >= 300) return report('upstream_error', 'http_request_failed', httpStatus, codes);
      if (!decoded.valid) return report('invalid_response', decoded.reason, httpStatus, codes);
      if (decoded.payload.success !== true || !decoded.payload.result || Array.isArray(decoded.payload.result)
        || decoded.payload.result.name !== project) {
        return report('invalid_response', 'unverified_project_response', httpStatus, codes);
      }
      return report('readable', 'project_read_succeeded', httpStatus, codes);
    })();
    const result = await Promise.race([operation, deadline]);
    return timedOut ? report('transport_error', 'request_timeout', httpStatus) : result;
  } catch {
    return report('transport_error', timedOut ? 'request_timeout' : 'request_failed', httpStatus);
  } finally {
    clearTimeout(timer);
  }
}

async function cli(args) {
  const reportIndex = args.indexOf('--report');
  const chosenPath = reportIndex >= 0 ? args[reportIndex + 1] : '';
  let result;
  if (!chosenPath || chosenPath.startsWith('--')) {
    console.log(JSON.stringify(report('configuration_error', 'report_path_required')));
    process.exitCode = 2;
    return;
  }
  if (args.length !== 2 || reportIndex !== 0) {
    result = report('configuration_error', 'invalid_cli_arguments');
  } else {
    result = await inspectLegacyPagesMirror({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      projectName: process.env.CLOUDFLARE_PAGES_PROJECT || DEFAULT_PROJECT_NAME,
    });
  }
  try {
    const outputPath = resolve(chosenPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result));
    process.exitCode = result.classification === 'readable' ? 0 : 1;
  } catch {
    console.log(JSON.stringify(report('configuration_error', 'report_write_failed')));
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await cli(process.argv.slice(2));
}
