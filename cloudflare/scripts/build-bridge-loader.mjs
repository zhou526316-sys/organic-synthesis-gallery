import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_ORIGIN = (process.env.TARGET_SITE_ORIGIN || 'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/$/, '');
const BRIDGE_OUTPUT = path.resolve(process.env.BRIDGE_OUTPUT || 'public/gallery-vpn-bridge.user.js');
const RUNTIME_OUTPUT = path.resolve(process.env.BRIDGE_RUNTIME_OUTPUT || 'public/gallery-vpn-bridge-runtime.js');

let runtime = await readFile(BRIDGE_OUTPUT, 'utf8');

function replaceRequired(before, after, label) {
  if (!runtime.includes(before)) throw new Error(`Bridge packaging anchor changed: ${label}`);
  runtime = runtime.replace(before, after);
}

replaceRequired('// @version      1.0.4', '// @version      1.1.0', 'runtime metadata version');
replaceRequired("const VERSION = '1.0.4';", "const VERSION = '1.1.0';", 'runtime status version');

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

await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');

const loader = `// ==UserScript==
// @name         Organic Synthesis Gallery VPN Literature Bridge
// @namespace    organic-synthesis-gallery
// @version      2.0.0
// @description  Stable VPN Bridge loader. Installs once, then loads the latest Gallery Bridge runtime automatically on every visit.
// @match        ${SITE_ORIGIN}/*
// @updateURL    ${SITE_ORIGIN}/gallery-vpn-bridge.user.js
// @downloadURL  ${SITE_ORIGIN}/gallery-vpn-bridge.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const RUNTIME_URL = '${SITE_ORIGIN}/gallery-vpn-bridge-runtime.js';
  const CACHE_KEY = 'organicGalleryBridgeRuntimeCacheV1';
  const CACHE_AT_KEY = 'organicGalleryBridgeRuntimeCacheAtV1';

  function loadText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 30000,
        headers: { Accept: 'text/javascript,*/*;q=0.8', 'Cache-Control': 'no-cache' },
        onload(response) {
          if (response.status >= 200 && response.status < 300 && typeof response.responseText === 'string' && response.responseText.length > 1000) {
            resolve(response.responseText);
          } else {
            reject(new Error('Runtime HTTP ' + response.status));
          }
        },
        onerror() { reject(new Error('Runtime network error')); },
        ontimeout() { reject(new Error('Runtime request timeout')); },
      });
    });
  }

  function executeRuntime(source, sourceLabel) {
    if (!source.includes('Organic Synthesis Gallery VPN Literature Bridge') || !source.includes('VPN LIT BRIDGE')) {
      throw new Error('Runtime validation failed');
    }
    eval(source + '\n//# sourceURL=' + sourceLabel);
  }

  function showLoaderError(message) {
    let node = document.getElementById('vpn-lit-bridge-loader-error');
    if (!node) {
      node = document.createElement('button');
      node.id = 'vpn-lit-bridge-loader-error';
      node.type = 'button';
      Object.assign(node.style, {
        position: 'fixed', right: '14px', bottom: '14px', zIndex: '2147483647',
        border: '1px solid #f04438', borderRadius: '999px', padding: '8px 12px',
        background: 'rgba(255,255,255,.98)', color: '#b42318', font: '12px/1.25 system-ui,sans-serif',
        boxShadow: '0 4px 18px rgba(16,24,40,.14)', cursor: 'pointer'
      });
      node.addEventListener('click', () => location.reload());
      document.documentElement.appendChild(node);
    }
    node.textContent = 'VPN Bridge runtime 加载失败 · 点击重试';
    node.title = message;
  }

  async function boot() {
    try {
      const fresh = await loadText(RUNTIME_URL + '?t=' + Date.now());
      executeRuntime(fresh, RUNTIME_URL);
      try {
        GM_setValue(CACHE_KEY, fresh);
        GM_setValue(CACHE_AT_KEY, Date.now());
      } catch {}
      console.log('[VPN LIT BRIDGE LOADER] latest runtime loaded');
      return;
    } catch (error) {
      console.warn('[VPN LIT BRIDGE LOADER] latest runtime unavailable', error);
    }

    try {
      const cached = GM_getValue(CACHE_KEY, '');
      if (typeof cached === 'string' && cached.length > 1000) {
        executeRuntime(cached, RUNTIME_URL + '#cached');
        console.warn('[VPN LIT BRIDGE LOADER] using cached runtime from', GM_getValue(CACHE_AT_KEY, 0));
        return;
      }
    } catch (error) {
      console.warn('[VPN LIT BRIDGE LOADER] cached runtime failed', error);
    }

    showLoaderError('No valid latest or cached Bridge runtime is available.');
  }

  void boot();
})();
`;

await writeFile(BRIDGE_OUTPUT, loader, 'utf8');
console.log(`Packaged self-updating Bridge loader at ${BRIDGE_OUTPUT}`);
console.log(`Packaged latest Bridge runtime at ${RUNTIME_OUTPUT}`);
