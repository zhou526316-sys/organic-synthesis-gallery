import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_ORIGIN = (process.env.TARGET_SITE_ORIGIN || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const GITHUB_SITE_ORIGIN = 'https://zhou526316-sys.github.io/organic-synthesis-gallery';
const CLOUDFLARE_SITE_ORIGIN = 'https://organic-synthesis-gallery-public.pages.dev';
const UPDATE_ORIGIN = (process.env.BRIDGE_UPDATE_ORIGIN || GITHUB_SITE_ORIGIN).replace(/\/$/, '');
const PUBLIC_SITE_ORIGINS = [...new Set([SITE_ORIGIN, CLOUDFLARE_SITE_ORIGIN, GITHUB_SITE_ORIGIN])];
const BRIDGE_OUTPUT = path.resolve(process.env.BRIDGE_OUTPUT || 'public/gallery-vpn-bridge.user.js');
const RUNTIME_OUTPUT = path.resolve(process.env.BRIDGE_RUNTIME_OUTPUT || 'public/gallery-vpn-bridge-runtime.js');
const TOC_MAINLINE_INPUT = path.resolve(process.env.TOC_MAINLINE_INPUT || 'public/toc-mainline.user.js');

let runtime = await readFile(BRIDGE_OUTPUT, 'utf8');
let tocMainline = await readFile(TOC_MAINLINE_INPUT, 'utf8');

function replaceRequired(before, after, label) {
  if (!runtime.includes(before)) throw new Error(`Bridge packaging anchor changed: ${label}`);
  runtime = runtime.replace(before, after);
}

replaceRequired('// @version      1.0.4', '// @version      1.2.0', 'runtime metadata version');
replaceRequired("const VERSION = '1.0.4';", "const VERSION = '1.2.0';", 'runtime status version');
replaceRequired("const COOLDOWN_KEY = 'organicGalleryBridgeCooldownsV1';", "const COOLDOWN_KEY = 'organicGalleryBridgeCooldownsV3';", 'runtime cooldown generation');

replaceRequired(
  "const semanticPattern = /visual\\s*abstract|graphical\\s*abstract|toc\\s*(?:graphic|image)|table\\s*of\\s*contents/i;",
  "const semanticPattern = /visual\\s*abstract|graphical\\s*abstract|abstract\\s*image|toc\\s*(?:graphic|image)|table\\s*of\\s*contents/i;",
  'semantic abstract-image pattern'
);
replaceRequired(
  "key === 'citation_graphical_abstract' || key === 'citation_toc_graphic'",
  "key === 'citation_graphical_abstract' || key === 'citation_toc_graphic' || key === 'citation_abstract_image'",
  'abstract-image citation meta'
);
replaceRequired(
  "[class*=\"visual-abstract\"],[class*=\"graphical-abstract\"],[id*=\"visual-abstract\"],[id*=\"graphical-abstract\"]",
  "[class*=\"visual-abstract\"],[class*=\"graphical-abstract\"],[class*=\"abstract-image\"],[id*=\"visual-abstract\"],[id*=\"graphical-abstract\"],[id*=\"abstract-image\"]",
  'abstract-image DOM selectors'
);
replaceRequired(
  "/visual\\s*abstract|graphical\\s*abstract|toc\\s*(graphic|image)/i.test(`${caption} ${idText}`)",
  "/visual\\s*abstract|graphical\\s*abstract|abstract\\s*image|toc\\s*(graphic|image)/i.test(`${caption} ${idText}`)",
  'abstract-image figure exclusion'
);
runtime = runtime.replaceAll(
  'No verified Visual/Graphical Abstract or TOC Graphic across publisher/full-text pages; Figure 1 will be used when available',
  'No verified Visual/Graphical Abstract, Abstract Image, or TOC Graphic across publisher/full-text pages; Figure 1 will be used when available'
);
replaceRequired(
  '  async function refreshServerBridgeQueue() {',
  '  async function refreshServerBridgeQueue() {\n    if (globalThis.__OSG_TOC_BROWSER_MAINLINE__) return;',
  'disable duplicate legacy server backlog when browser mainline is integrated'
);

// legacy_runtime_media_disabled: all media acquisition belongs to the bound mainline.
for (const signature of ['  function queueDoi(doi, priority = false) {','  function pump() {','  function scan() {']) {
  replaceRequired(signature, signature + '\n    if (globalThis.__OSG_TOC_BROWSER_MAINLINE__) return;', 'disable legacy '+signature);
}
replaceRequired('  function updateStatus() {',
  "  function updateStatus() {\n    if (globalThis.__OSG_TOC_BROWSER_MAINLINE__) { const node=statusNode(); node.textContent='VPN Bridge 2.2.21 · 抓取由主线控制'; node.title='从 Tampermonkey 菜单启动夜间连续抓取；本按钮保留密钥设置。'; return; }",
  'do not display obsolete legacy acquisition counts');

await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');

const runtimeBody = runtime.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '').trim();
if (!runtimeBody.includes("const VERSION = '1.2.0';") || !runtimeBody.includes("const API_BASE = 'https://organic-synthesis-gallery-public.pages.dev';")) {
  throw new Error('Packaged Runtime validation failed.');
}
if (/\beval\s*\(/.test(runtimeBody)) throw new Error('Runtime unexpectedly contains eval().');

const tocMatchLines = tocMainline.match(/^\/\/ @match\s+.+$/gm) || [];
let tocBody = tocMainline.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '').trim();
if (!tocBody.includes("var VERSION = '6.2.21';")) throw new Error('TOC mainline version/content changed unexpectedly.');
tocBody = tocBody
  .replace("var TOKEN_KEY = P + 'write-token';", "var TOKEN_KEY = 'organicGalleryCloudflareBridgeWriteToken';")
  .replace("var LEGACY_TOKEN_KEY = 'osg-toc-v5:write-token';", "var LEGACY_TOKEN_KEY = TOKEN_KEY;")
  .replace("right:14px;bottom:14px", "right:14px;bottom:58px");
if (!tocBody.includes("var TOKEN_KEY = 'organicGalleryCloudflareBridgeWriteToken';")) {
  throw new Error('Integrated TOC mainline did not adopt the Bridge token storage key.');
}
if (/\beval\s*\(/.test(tocBody)) throw new Error('TOC mainline unexpectedly contains eval().');

const matchLines = [...new Set([
  ...PUBLIC_SITE_ORIGINS.map(origin => `// @match        ${origin}/*`),
  ...tocMatchLines,
])].join('\n');
const galleryHosts = [...new Set(PUBLIC_SITE_ORIGINS.map(origin => new URL(origin).hostname))];
const galleryHostExpression = galleryHosts.map(host => `location.hostname === '${host}'`).join(' || ');
const loaderVersion = '2.2.21';

const loader = `// ==UserScript==
// @name         Organic Synthesis Gallery VPN Literature Bridge
// @namespace    organic-synthesis-gallery
// @version      ${loaderVersion}
// @description  Self-contained VPN Bridge. The complete runtime is bundled locally so Tampermonkey does not need remote eval.
${matchLines}
// @updateURL    ${UPDATE_ORIGIN}/gallery-vpn-bridge.user.js
// @downloadURL  ${UPDATE_ORIGIN}/gallery-vpn-bridge.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @connect      *
// @connect      acs.silverchair-cdn.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

globalThis.__OSG_TOC_BROWSER_MAINLINE__ = true;

(() => {
  'use strict';
  if (!(${galleryHostExpression})) return;

  const DIAGNOSTIC_ID = 'vpn-lit-bridge-loader-status';
  let node = document.getElementById(DIAGNOSTIC_ID);
  if (!node) {
    node = document.createElement('button');
    node.id = DIAGNOSTIC_ID;
    node.type = 'button';
    Object.assign(node.style, {
      position: 'fixed', right: '14px', bottom: '14px', zIndex: '2147483647',
      border: '1px solid #84adff', borderRadius: '999px', padding: '8px 12px',
      background: 'rgba(255,255,255,.98)', color: '#175cd3', font: '12px/1.25 system-ui,sans-serif',
      boxShadow: '0 4px 18px rgba(16,24,40,.14)', cursor: 'default'
    });
    (document.documentElement || document.body).appendChild(node);
  }
  node.textContent = 'VPN Bridge ${loaderVersion} · 正在启动 Runtime…';
  node.title = 'Tampermonkey 脚本已执行；正在启动内置 Runtime。';

  setTimeout(() => {
    const runtimeNode = document.getElementById('vpn-lit-bridge-status');
    const diagnosticNode = document.getElementById(DIAGNOSTIC_ID);
    if (!diagnosticNode) return;
    if (runtimeNode) {
      diagnosticNode.remove();
      return;
    }
    diagnosticNode.textContent = 'VPN Bridge ${loaderVersion} · Runtime 未启动';
    diagnosticNode.title = 'Tampermonkey 已执行 Loader，但 Runtime 没有创建状态控件。';
    diagnosticNode.style.borderColor = '#f04438';
    diagnosticNode.style.color = '#b42318';
  }, 1500);
})();

if (${galleryHostExpression}) {
${runtimeBody}
}

${tocBody}
`;

await writeFile(BRIDGE_OUTPUT, loader, 'utf8');
console.log(`Packaged self-contained Bridge userscript at ${BRIDGE_OUTPUT}`);
console.log(`Packaged standalone Bridge runtime for diagnostics at ${RUNTIME_OUTPUT}`);
