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
  .replace('// @version      0.4.5', '// @version      1.0.4')
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
    '// @grant        GM_xmlhttpRequest\n// @grant        GM_getValue\n// @grant        GM_setValue\n// @grant        GM_setClipboard\n// @grant        GM_registerMenuCommand'
  )
  .replace("const VERSION = '0.4.5';", "const VERSION = '1.0.4';")
  .replace(
    "const API_BASE = 'https://api-v2.appdeploy.ai/app/organic-synthesis-literature-gallery-ase43k';",
    `const API_BASE = '${TARGET_API_BASE}';\n  const WRITE_TOKEN_KEY = 'organicGalleryCloudflareBridgeWriteToken';\n  const COOLDOWN_KEY = 'organicGalleryBridgeCooldownsV1';`
  )
  .replace(
    "  function supportedDoi(doi) {\n    return validDoi(doi) && /^10\\.(?:1021|1002|1038|1126)\\//i.test(doi.trim());\n  }",
    "  function supportedDoi(doi) {\n    return validDoi(doi);\n  }"
  );

const robustnessRewrites = [
  ['const REQUEST_TIMEOUT = 22000;', 'const REQUEST_TIMEOUT = 35000;'],
  ['const BRIDGE_BURST_LIMIT = 12;', 'const BRIDGE_BURST_LIMIT = 20;'],
  ['const BRIDGE_RETRY_COOLDOWN_MS = 2 * 60 * 1000;', 'const BRIDGE_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;'],
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

const apiReplacement = `  function bridgeWriteToken() {\n    const value = typeof GM_getValue === 'function' ? GM_getValue(WRITE_TOKEN_KEY, '') : '';\n    return typeof value === 'string' ? value.trim() : '';\n  }\n\n  function configureBridgeWriteToken() {\n    const current = bridgeWriteToken();\n    const next = window.prompt('请输入 Cloudflare Gallery Bridge 写入密钥。该值只保存在 Tampermonkey 私有存储中。', current);\n    if (next === null) return;\n    const cleaned = next.trim();\n    if (typeof GM_setValue === 'function') GM_setValue(WRITE_TOKEN_KEY, cleaned);\n    updateStatus();\n    if (cleaned) {\n      for (const [key, state] of articleStates.entries()) {\n        if (state?.state === 'failed') articleStates.delete(key);\n      }\n      scheduleBridgeQueueRefresh(0);\n      scheduleScan(0);\n    }\n  }\n\n  function copyBridgeWriteToken() {\n    const current = bridgeWriteToken();\n    if (!current) {\n      window.alert('当前浏览器还没有配置 Gallery Bridge 写入密钥。');\n      return;\n    }\n    if (typeof GM_setClipboard === 'function') {\n      GM_setClipboard(current, 'text/plain');\n      window.alert('Gallery Bridge 写入密钥已复制到剪贴板。请只粘贴到另一浏览器的 Tampermonkey「设置 / 更换 Gallery Bridge 写入密钥」中，不要粘贴到聊天、GitHub 或网页表单。');\n      return;\n    }\n    window.alert('当前 Tampermonkey 不支持安全复制，请先更新 Bridge/Tampermonkey。');\n  }\n\n  if (typeof GM_registerMenuCommand === 'function') {\n    GM_registerMenuCommand('设置 / 更换 Gallery Bridge 写入密钥', configureBridgeWriteToken);\n    GM_registerMenuCommand('复制 Gallery Bridge 写入密钥（用于另一浏览器）', copyBridgeWriteToken);\n  }\n\n  async function apiGet(path) {\n    const response = await gmRequest({ method: 'GET', url: \`\${API_BASE}\${path}\` });\n    return safeJson(response.responseText) || {};\n  }\n\n  async function apiPost(path, body) {\n    const token = bridgeWriteToken();\n    if (!token) throw bridgeError('auth', 'Cloudflare Bridge write token is not configured', \`\${API_BASE}\${path}\`);\n    const response = await gmRequest({\n      method: 'POST',\n      url: \`\${API_BASE}\${path}\`,\n      headers: {\n        'Content-Type': 'application/json',\n        Authorization: \`Bearer \${token}\`,\n      },\n      data: JSON.stringify(body),\n    });\n    return safeJson(response.responseText) || {};\n  }\n\n  function readBridgeCooldowns() {\n    try {\n      const raw = typeof GM_getValue === 'function' ? GM_getValue(COOLDOWN_KEY, '{}') : '{}';\n      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;\n      return parsed && typeof parsed === 'object' ? parsed : {};\n    } catch {\n      return {};\n    }\n  }\n\n  function writeBridgeCooldowns(value) {\n    try {\n      if (typeof GM_setValue === 'function') GM_setValue(COOLDOWN_KEY, JSON.stringify(value));\n    } catch {}\n  }\n\n  function bridgeCooldown(doi) {\n    const key = String(doi || '').toLowerCase();\n    if (!key) return null;\n    const cooldowns = readBridgeCooldowns();\n    const record = cooldowns[key];\n    if (!record || Number(record.until || 0) <= Date.now()) {\n      if (record) { delete cooldowns[key]; writeBridgeCooldowns(cooldowns); }\n      return null;\n    }\n    return record;\n  }\n\n  function setBridgeCooldown(doi, reason, durationMs) {\n    const key = String(doi || '').toLowerCase();\n    if (!key) return;\n    const cooldowns = readBridgeCooldowns();\n    cooldowns[key] = { until: Date.now() + Math.max(60_000, Number(durationMs || 0)), reason: String(reason || 'retry_later').slice(0, 120) };\n    const entries = Object.entries(cooldowns).sort((a, b) => Number(b[1]?.until || 0) - Number(a[1]?.until || 0)).slice(0, 600);\n    writeBridgeCooldowns(Object.fromEntries(entries));\n  }\n\n  function clearBridgeCooldown(doi) {\n    const key = String(doi || '').toLowerCase();\n    const cooldowns = readBridgeCooldowns();\n    if (!(key in cooldowns)) return;\n    delete cooldowns[key];\n    writeBridgeCooldowns(cooldowns);\n  }\n\n  async function reportBridgeAttempt(doi, stage, outcome, rootCause, url = '') {\n    try {\n      await apiPost('/api/media/attempt', { doi, source: 'vpn-bridge', stage, outcome, rootCause, url });\n    } catch {}\n  }\n\n  async function recordBridgeFailure(doi, error, stage, url = '') {\n    const message = String(error?.message || error || 'Bridge failure');\n    const failingUrl = String(error?.bridgeUrl || url || '');\n    let rootCause = 'bridge_request_failed';\n    let cooldownMs = 6 * 60 * 60 * 1000;\n    if (/HTTP\\s*403|captcha|challenge|security verification|access denied/i.test(message)) {\n      rootCause = 'publisher_access_blocked';\n      cooldownMs = 24 * 60 * 60 * 1000;\n    } else if (/HTTP\\s*429|too many requests|rate limit/i.test(message)) {\n      rootCause = 'publisher_rate_limited';\n      cooldownMs = 24 * 60 * 60 * 1000;\n    } else if (/timeout/i.test(message)) {\n      rootCause = 'publisher_timeout';\n      cooldownMs = 8 * 60 * 60 * 1000;\n    } else if (stage === 'publisher-html' || /network/i.test(message)) {\n      rootCause = 'publisher_html_unreachable';\n      cooldownMs = 12 * 60 * 60 * 1000;\n    } else if (stage === 'auth' || (/HTTP\\s*401/.test(message) && failingUrl.startsWith(API_BASE))) {\n      rootCause = 'bridge_auth';\n      cooldownMs = 30 * 60 * 1000;\n    }\n    setBridgeCooldown(doi, rootCause, cooldownMs);\n    await reportBridgeAttempt(doi, stage, 'failed', rootCause, failingUrl);\n  }`;

if (!source.includes(apiAnchor)) throw new Error('Source Bridge API helper anchor changed; refusing automatic rewrite.');
source = source.replace(apiAnchor, apiReplacement);

const queueAnchor = `  function queueDoi(doi, priority = false) {\n    if (!supportedDoi(doi)) return;\n    const key = doi.toLowerCase();`;
const queueReplacement = `  function queueDoi(doi, priority = false) {\n    if (!supportedDoi(doi)) return;\n    const key = doi.toLowerCase();\n    if (bridgeCooldown(key)) return;`;
if (!source.includes(queueAnchor)) throw new Error('Source Bridge queue anchor changed; refusing automatic rewrite.');
source = source.replace(queueAnchor, queueReplacement);

const verifiedAnchor = `            verifiedToc = true;\n            suspectTocDois.delete(key);`;
const verifiedReplacement = `            verifiedToc = true;\n            clearBridgeCooldown(doi);\n            suspectTocDois.delete(key);`;
if (!source.includes(verifiedAnchor)) throw new Error('Source Bridge verified-TOC anchor changed; refusing automatic rewrite.');
source = source.replace(verifiedAnchor, verifiedReplacement);

const noTocAnchor = `          suspectTocDois.delete(key);\n          console.warn('[VPN LIT BRIDGE][NO TOC]', { doi, articleUrl, reason: 'No verified Visual/Graphical Abstract or TOC Graphic across publisher/full-text pages; Figure 1 will be used when available' });`;
const noTocReplacement = `          suspectTocDois.delete(key);\n          setBridgeCooldown(doi, 'semantic_toc_not_found', 72 * 60 * 60 * 1000);\n          await reportBridgeAttempt(doi, 'toc-extract', 'partial', 'semantic_toc_not_found', articleUrl);\n          console.warn('[VPN LIT BRIDGE][NO TOC]', { doi, articleUrl, reason: 'No verified Visual/Graphical Abstract or TOC Graphic across publisher/full-text pages; Figure 1 will be used when available' });`;
if (!source.includes(noTocAnchor)) throw new Error('Source Bridge no-TOC anchor changed; refusing automatic rewrite.');
source = source.replace(noTocAnchor, noTocReplacement);

const catchAnchor = `    } catch (error) {\n      articleStates.set(key, { state: 'failed', at: Date.now() });\n      stats.failed += 1;\n      console.warn('[VPN LIT BRIDGE][PAPER FAIL]', { doi, stage: error.bridgeStage || stage, url: error.bridgeUrl || currentUrl, error: error.message || String(error) });`;
const catchReplacement = `    } catch (error) {\n      articleStates.set(key, { state: 'failed', at: Date.now() });\n      stats.failed += 1;\n      await recordBridgeFailure(doi, error, error.bridgeStage || stage, error.bridgeUrl || currentUrl);\n      console.warn('[VPN LIT BRIDGE][PAPER FAIL]', { doi, stage: error.bridgeStage || stage, url: error.bridgeUrl || currentUrl, error: error.message || String(error) });`;
if (!source.includes(catchAnchor)) throw new Error('Source Bridge failure anchor changed; refusing automatic rewrite.');
source = source.replace(catchAnchor, catchReplacement);

const statusClickAnchor = `    node.addEventListener('click', () => {\n      for (const [key, state] of articleStates) if (state.state === 'failed') articleStates.delete(key);\n      stats.failed = 0;\n      scheduleScan(0);\n    });`;
const statusClickReplacement = `    node.addEventListener('click', () => {\n      if (!bridgeWriteToken()) {\n        configureBridgeWriteToken();\n        return;\n      }\n      for (const [key, state] of articleStates) if (state.state === 'failed') articleStates.delete(key);\n      stats.failed = 0;\n      scheduleBridgeQueueRefresh(0);\n      scheduleScan(0);\n    });`;
if (!source.includes(statusClickAnchor)) throw new Error('Source Bridge status click anchor changed; refusing automatic rewrite.');
source = source.replace(statusClickAnchor, statusClickReplacement);

const statusAnchor = "    const nextText = `VPN Literature ${VERSION} · TOC ${stats.tocNew} new / ${stats.tocReplaced} replaced · Figures ${stats.figures} · Done ${stats.papersDone} · Failed ${stats.failed}` + (pending ? ` · ${pending} pending` : '');";
const statusReplacement = "    const authText = bridgeWriteToken() ? '' : ' · 写入密钥未设置';\n    node.title = bridgeWriteToken() ? 'VPN Literature Bridge；后台持续补齐 TOC/Figure，点击重试当前会话失败项目' : 'VPN Literature Bridge；点击设置 Cloudflare 写入密钥';\n    const nextText = `VPN Literature ${VERSION} · TOC ${stats.tocNew} new / ${stats.tocReplaced} replaced · Figures ${stats.figures} · Done ${stats.papersDone} · Failed ${stats.failed}` + (pending ? ` · ${pending} pending` : '') + authText;";
if (!source.includes(statusAnchor)) throw new Error('Source Bridge status anchor changed; refusing automatic rewrite.');
source = source.replace(statusAnchor, statusReplacement);

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, source, 'utf8');
console.log(`Generated Cloudflare VPN Bridge at ${OUTPUT}`);
