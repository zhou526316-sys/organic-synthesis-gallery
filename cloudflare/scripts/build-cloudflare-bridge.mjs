import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE_BRIDGE = process.env.SOURCE_BRIDGE || 'https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai/gallery-vpn-bridge.user.js';
const TARGET_API_BASE = (process.env.TARGET_API_BASE || '').replace(/\/$/, '');
const TARGET_SITE_ORIGIN = (process.env.TARGET_SITE_ORIGIN || '').replace(/\/$/, '');
const OUTPUT = resolve(process.env.BRIDGE_OUTPUT || 'public/gallery-vpn-bridge.user.js');

if (!TARGET_API_BASE) throw new Error('TARGET_API_BASE is required.');
if (!TARGET_SITE_ORIGIN) throw new Error('TARGET_SITE_ORIGIN is required.');
const targetApiHost = new URL(TARGET_API_BASE).hostname;

const response = await fetch(SOURCE_BRIDGE, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(`Unable to fetch source Bridge: HTTP ${response.status}`);
let source = await response.text();
if (!source.includes("const VERSION = '0.4.5';") || !source.includes('Organic Synthesis Gallery VPN Literature Bridge')) {
  throw new Error('Unexpected source Bridge version/content; refusing an unsafe automatic rewrite.');
}

source = source
  .replace('// @version      0.4.5', '// @version      1.0.3')
  .replace(
    '// @match        https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai/*',
    `// @match        ${TARGET_SITE_ORIGIN}/*`
  )
  .replace(
    '// @updateURL    https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai/gallery-vpn-bridge.user.js',
    `// @updateURL    ${TARGET_SITE_ORIGIN}/gallery-vpn-bridge.user.js`
  )
  .replace(
    '// @downloadURL  https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai/gallery-vpn-bridge.user.js',
    `// @downloadURL  ${TARGET_SITE_ORIGIN}/gallery-vpn-bridge.user.js`
  )
  .replace(
    '// @grant        GM_xmlhttpRequest',
    '// @grant        GM_xmlhttpRequest\n// @grant        GM_getValue\n// @grant        GM_setValue\n// @grant        GM_registerMenuCommand'
  )
  .replace("const VERSION = '0.4.5';", "const VERSION = '1.0.3';")
  .replace(
    "const API_BASE = 'https://api-v2.appdeploy.ai/app/organic-synthesis-literature-gallery-ase43k';",
    `const API_BASE = '${TARGET_API_BASE}';\n  const WRITE_TOKEN_KEY = 'organicGalleryCloudflareBridgeWriteToken';`
  )
  .replace(
    "  function supportedDoi(doi) {\n    return validDoi(doi) && /^10\\.(?:1021|1002|1038|1126)\\//i.test(doi.trim());\n  }",
    "  function supportedDoi(doi) {\n    return validDoi(doi);\n  }"
  );

const robustnessRewrites = [
  ['const REQUEST_TIMEOUT = 22000;', 'const REQUEST_TIMEOUT = 35000;'],
  ['const BRIDGE_RETRY_COOLDOWN_MS = 2 * 60 * 1000;', 'const BRIDGE_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;'],
  ['const scale = Math.min(1, 1900 / width, 1350 / height);', 'const scale = Math.min(1, 2800 / width, 2000 / height);'],
  ["if (dataUrl.length > 2500000) dataUrl = canvas.toDataURL('image/jpeg', 0.74);", "if (dataUrl.length > 4800000) dataUrl = canvas.toDataURL('image/jpeg', 0.84);"],
  ['if (!requiresRasterization && image.buffer.byteLength <= 1650000) return bufferToDataUrl(image.buffer, image.mime);', 'if (!requiresRasterization && image.buffer.byteLength <= 3800000) return bufferToDataUrl(image.buffer, image.mime);'],
];
for (const [before, after] of robustnessRewrites) {
  if (!source.includes(before)) throw new Error(`Source Bridge robustness anchor changed: ${before}`);
  source = source.replace(before, after);
}

if (!source.includes(`// @connect      ${targetApiHost}`)) {
  const grantAnchor = '// @grant        GM_registerMenuCommand';
  if (!source.includes(grantAnchor)) throw new Error('Unable to add Cloudflare API @connect permission.');
  source = source.replace(grantAnchor, `${grantAnchor}\n// @connect      ${targetApiHost}`);
}

const apiAnchor = `  async function apiGet(path) {\n    const response = await gmRequest({ method: 'GET', url: \`\${API_BASE}\${path}\` });\n    return safeJson(response.responseText) || {};\n  }\n\n  async function apiPost(path, body) {\n    const response = await gmRequest({ method: 'POST', url: \`\${API_BASE}\${path}\`, headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(body) });\n    return safeJson(response.responseText) || {};\n  }`;

const apiReplacement = `  function bridgeWriteToken() {\n    const value = typeof GM_getValue === 'function' ? GM_getValue(WRITE_TOKEN_KEY, '') : '';\n    return typeof value === 'string' ? value.trim() : '';\n  }\n\n  function configureBridgeWriteToken() {\n    const current = bridgeWriteToken();\n    const next = window.prompt('请输入 Cloudflare Gallery Bridge 写入密钥。该值只保存在 Tampermonkey 私有存储中。', current);\n    if (next === null) return;\n    const cleaned = next.trim();\n    if (typeof GM_setValue === 'function') GM_setValue(WRITE_TOKEN_KEY, cleaned);\n    updateStatus();\n    if (cleaned) {\n      for (const [key, state] of articleStates.entries()) {\n        if (state?.state === 'failed') articleStates.delete(key);\n      }\n      scheduleBridgeQueueRefresh(0);\n      scheduleScan(0);\n    }\n  }\n\n  if (typeof GM_registerMenuCommand === 'function') {\n    GM_registerMenuCommand('设置 / 更换 Gallery Bridge 写入密钥', configureBridgeWriteToken);\n  }\n\n  async function apiGet(path) {\n    const response = await gmRequest({ method: 'GET', url: \`\${API_BASE}\${path}\` });\n    return safeJson(response.responseText) || {};\n  }\n\n  async function apiPost(path, body) {\n    const token = bridgeWriteToken();\n    if (!token) throw bridgeError('auth', 'Cloudflare Bridge write token is not configured', \`\${API_BASE}\${path}\`);\n    const response = await gmRequest({\n      method: 'POST',\n      url: \`\${API_BASE}\${path}\`,\n      headers: {\n        'Content-Type': 'application/json',\n        Authorization: \`Bearer \${token}\`,\n      },\n      data: JSON.stringify(body),\n    });\n    return safeJson(response.responseText) || {};\n  }`;

if (!source.includes(apiAnchor)) throw new Error('Source Bridge API helper anchor changed; refusing automatic rewrite.');
source = source.replace(apiAnchor, apiReplacement);

const statusClickAnchor = `    node.addEventListener('click', () => {\n      for (const [key, state] of articleStates) if (state.state === 'failed') articleStates.delete(key);\n      stats.failed = 0;\n      scheduleScan(0);\n    });`;
const statusClickReplacement = `    node.addEventListener('click', () => {\n      if (!bridgeWriteToken()) {\n        configureBridgeWriteToken();\n        return;\n      }\n      for (const [key, state] of articleStates) if (state.state === 'failed') articleStates.delete(key);\n      stats.failed = 0;\n      scheduleBridgeQueueRefresh(0);\n      scheduleScan(0);\n    });`;
if (!source.includes(statusClickAnchor)) throw new Error('Source Bridge status click anchor changed; refusing automatic rewrite.');
source = source.replace(statusClickAnchor, statusClickReplacement);

const statusAnchor = "    const nextText = `VPN Literature ${VERSION} · TOC ${stats.tocNew} new / ${stats.tocReplaced} replaced · Figures ${stats.figures} · Done ${stats.papersDone} · Failed ${stats.failed}` + (pending ? ` · ${pending} pending` : '');";
const statusReplacement = "    const authText = bridgeWriteToken() ? '' : ' · 写入密钥未设置';\n    node.title = bridgeWriteToken() ? 'VPN Literature Bridge；点击重试失败项目并刷新待修队列' : 'VPN Literature Bridge；点击设置 Cloudflare 写入密钥';\n    const nextText = `VPN Literature ${VERSION} · TOC ${stats.tocNew} new / ${stats.tocReplaced} replaced · Figures ${stats.figures} · Done ${stats.papersDone} · Failed ${stats.failed}` + (pending ? ` · ${pending} pending` : '') + authText;";
if (!source.includes(statusAnchor)) throw new Error('Source Bridge status anchor changed; refusing automatic rewrite.');
source = source.replace(statusAnchor, statusReplacement);

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, source, 'utf8');
console.log(`Generated Cloudflare VPN Bridge at ${OUTPUT}`);
