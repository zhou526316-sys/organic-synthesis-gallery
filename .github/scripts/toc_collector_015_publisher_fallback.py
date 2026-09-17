from pathlib import Path

BG = Path('toc-collector/src/background.mjs')
MAIN = Path('toc-collector/src/main.mjs')
PKG = Path('toc-collector/package.json')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


text = BG.read_text(encoding='utf-8')

text = replace_once(
    text,
    "let lastQueue = [];\n",
    "let lastQueue = [];\nconst publisherPartition = 'toc-publisher-scan';\nconst publisherSession = session.fromPartition(publisherPartition, { cache: false });\n",
    'publisher session insertion',
)

text = replace_once(
    text,
    "  state.cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {};\n  await saveState();\n",
    "  state.cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {};\n  // 0.1.5 retries papers that 0.1.4 marked as generic client-side failures.\n  if (state.collectorRecoveryVersion !== '0.1.5') {\n    state.cooldowns = Object.fromEntries(Object.entries(state.cooldowns).filter(([, value]) => value?.reason !== 'collector_failed'));\n    state.collectorRecoveryVersion = '0.1.5';\n  }\n  await saveState();\n",
    'cooldown recovery insertion',
)

text = replace_once(
    text,
    "    const res = await session.defaultSession.fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });\n",
    "    const res = await publisherSession.fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });\n",
    'publisher probe session',
)

start = text.index('async function inspectArticle(doi) {')
end = text.index('\nasync function imageData(', start)
new_inspector = r'''function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function tagAttributes(tag) {
  const attrs = {};
  for (const match of String(tag || '').matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[String(match[1] || '').toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteMediaUrl(value, pageUrl) {
  if (!value) return '';
  try { return new URL(String(value).trim(), pageUrl).href; } catch { return ''; }
}

function sourceFromAttrs(attrs) {
  for (const key of ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-image-src']) {
    if (attrs[key]) return attrs[key];
  }
  if (attrs.srcset) {
    const options = attrs.srcset.split(',').map(part => part.trim().split(/\s+/)[0]).filter(Boolean);
    return options.at(-1) || '';
  }
  return '';
}

function htmlCandidate(html, pageUrl) {
  const rows = [];
  const add = (src, text, kind, width = 0, height = 0) => {
    const absolute = absoluteMediaUrl(src, pageUrl);
    if (!absolute) return;
    if (/logo|icon|avatar|cover|advert|banner/i.test(String(text || ''))) return;
    rows.push({ src: absolute, text: String(text || ''), kind, width: Number(width) || 0, height: Number(height) || 0 });
  };

  for (const match of String(html || '').matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const key = String(attrs.name || attrs.property || attrs.itemprop || '').toLowerCase();
    if (['citation_graphical_abstract', 'citation_toc_graphic', 'citation_abstract_image'].includes(key)) {
      add(attrs.content, key, 'official');
    }
  }

  let figures = 0;
  for (const match of String(html || '').matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    if (++figures > 80) break;
    const block = match[0];
    const img = block.match(/<img\b[^>]*>/i)?.[0];
    if (!img) continue;
    const attrs = tagAttributes(img);
    const text = [attrs.alt, attrs.title, attrs.id, attrs.class, stripHtml(block).slice(0, 1400)].filter(Boolean).join(' ');
    const official = /visual\s*abstract|graphical\s*abstract|abstract\s*image|toc\s*(graphic|image)|table\s*of\s*contents/i.test(text);
    const fig1 = /(^|\b)(fig(?:ure)?\.?\s*1)(\b|[:.])/i.test(text);
    if (official || fig1) add(sourceFromAttrs(attrs), text, official ? 'official' : 'figure1', attrs.width, attrs.height);
  }

  let images = 0;
  for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    if (++images > 500) break;
    const attrs = tagAttributes(match[0]);
    const text = [attrs.alt, attrs.title, attrs.id, attrs.class].filter(Boolean).join(' ');
    const official = /visual\s*abstract|graphical\s*abstract|abstract\s*image|toc\s*(graphic|image)|table\s*of\s*contents/i.test(text);
    const fig1 = /(^|\b)(fig(?:ure)?\.?\s*1)(\b|[:.])/i.test(text);
    if (official || fig1) add(sourceFromAttrs(attrs), text, official ? 'official' : 'figure1', attrs.width, attrs.height);
  }

  rows.sort((a,b) => {
    const sa = semanticScore(a.text) + (a.kind === 'official' ? 20 : 0) + Math.min(20, ((a.width||0)*(a.height||0))/100000);
    const sb = semanticScore(b.text) + (b.kind === 'official' ? 20 : 0) + Math.min(20, ((b.width||0)*(b.height||0))/100000);
    return sb - sa;
  });
  return rows[0] || null;
}

async function inspectArticleHtml(doi, url, browserError = '') {
  const res = await publisherSession.fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(Math.max(15000, Number(config.publisherTimeoutSeconds || 35) * 1000)),
  });
  if (!res.ok) throw new Error(`publisher_http_${res.status}${browserError ? ` after ${browserError}` : ''}`);
  const html = await res.text();
  if (/captcha|verify you are human|access denied|challenge-platform/i.test(html.slice(0, 250000))) {
    throw new Error(`publisher_access_challenge${browserError ? ` after ${browserError}` : ''}`);
  }
  const finalUrl = res.url || url;
  const candidate = htmlCandidate(html, finalUrl);
  await log('publisher html fallback', { doi, browserError, candidate: candidate?.kind || 'none', url: finalUrl });
  return { url: finalUrl, candidate };
}

async function inspectArticle(doi) {
  const url = articleUrl(doi);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: publisherPartition,
      sandbox: true,
      contextIsolation: true,
      images: true,
    },
  });
  let publisherTimer;
  try {
    try {
      await Promise.race([
        win.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }),
        new Promise((_, reject) => { publisherTimer = setTimeout(() => reject(new Error('publisher_timeout')), Math.max(1, Number(config.publisherTimeoutSeconds) || 35) * 1000); }),
      ]);
    } catch (error) {
      const browserError = String(error?.message || error);
      await log('browser scan failed; trying html fallback', { doi, browserError });
      return await inspectArticleHtml(doi, url, browserError);
    }
    await new Promise(r => setTimeout(r, Number(config.headlessWaitMs) || 5000));
    const result = await win.webContents.executeJavaScript(`(() => {
      const abs = u => { try { return new URL(u, location.href).href } catch { return '' } };
      const rows = [];
      for (const m of document.querySelectorAll('meta')) {
        const key = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase();
        if (['citation_graphical_abstract','citation_toc_graphic','citation_abstract_image'].includes(key)) {
          const src = abs(m.content || ''); if (src) rows.push({ src, text: key, width: 0, height: 0, kind: 'official' });
        }
      }
      for (const img of document.images) {
        const src = abs(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '');
        if (!src) continue;
        const root = img.closest('figure,section,div,aside') || img.parentElement;
        const text = [img.alt, img.title, img.id, img.className, root?.getAttribute?.('aria-label'), root?.innerText?.slice(0,500)].filter(Boolean).join(' ');
        const low = text.toLowerCase();
        if (/logo|icon|avatar|cover|advert|banner/.test(low)) continue;
        const official = /visual\\s*abstract|graphical\\s*abstract|abstract\\s*image|toc\\s*(graphic|image)|table\\s*of\\s*contents/.test(low);
        const fig1 = /(^|\\b)(fig(?:ure)?\\.?\\s*1)(\\b|[:.])/i.test(text);
        if (official || fig1) rows.push({ src, text, width: img.naturalWidth || 0, height: img.naturalHeight || 0, kind: official ? 'official' : 'figure1' });
      }
      return { title: document.title, href: location.href, rows };
    })()`);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    rows.sort((a,b) => {
      const sa = semanticScore(a.text) + (a.kind === 'official' ? 20 : 0) + Math.min(20, ((a.width||0)*(a.height||0))/100000);
      const sb = semanticScore(b.text) + (b.kind === 'official' ? 20 : 0) + Math.min(20, ((b.width||0)*(b.height||0))/100000);
      return sb - sa;
    });
    return { url: result?.href || url, candidate: rows[0] || null };
  } finally {
    if (publisherTimer) clearTimeout(publisherTimer);
    if (!win.isDestroyed()) win.destroy();
  }
}
'''
text = text[:start] + new_inspector + text[end:]

text = replace_once(
    text,
    "  const res = await session.defaultSession.fetch(url, { headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referer }, signal: AbortSignal.timeout(30000) });\n",
    "  const res = await publisherSession.fetch(url, { headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referer }, signal: AbortSignal.timeout(30000) });\n",
    'image publisher session',
)

text = replace_once(
    text,
    "    else if (/timeout/i.test(msg)) { reason = 'publisher_timeout'; ms = 8*60*60*1000; }\n    else if (/write_token_missing|401/.test(msg)) { reason = 'collector_auth'; ms = 30*60*1000; }\n",
    "    else if (/timeout/i.test(msg)) { reason = 'publisher_timeout'; ms = 8*60*60*1000; }\n    else if (/ERR_BLOCKED_BY_CLIENT/i.test(msg)) { reason = 'publisher_client_blocked'; ms = 30*60*1000; }\n    else if (/write_token_missing|401/.test(msg)) { reason = 'collector_auth'; ms = 30*60*1000; }\n",
    'client blocked classification',
)

text = text.replace('TOC Collector 0.1.4 started successfully', 'TOC Collector ${escapeHtml(app.getVersion())} started successfully')

BG.write_text(text, encoding='utf-8')

main = MAIN.read_text(encoding='utf-8')
main = main.replace('TOC Collector 0.1.4 started successfully', 'TOC Collector ${escapeHtml(app.getVersion())} started successfully')
MAIN.write_text(main, encoding='utf-8')

pkg = PKG.read_text(encoding='utf-8')
pkg = replace_once(pkg, '"version": "0.1.4"', '"version": "0.1.5"', 'package version')
PKG.write_text(pkg, encoding='utf-8')

# Basic guardrails: fail before committing if the intended recovery/fallback markers are absent.
final = BG.read_text(encoding='utf-8')
for marker in [
    "publisherPartition = 'toc-publisher-scan'",
    'publisher html fallback',
    'browser scan failed; trying html fallback',
    "collectorRecoveryVersion !== '0.1.5'",
]:
    if marker not in final:
        raise SystemExit(f'missing marker: {marker}')

print('TOC Collector 0.1.5 publisher fallback patch applied')
