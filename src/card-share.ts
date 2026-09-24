import './card-share.css';

declare const __GALLERY_BUILD_ID__: string;

interface ShareInfo {
  doi: string;
  title: string;
  journal: string;
  date: string;
  url: string;
  imageUrl?: string;
  imageElement?: HTMLImageElement | null;
}

let activePanel: HTMLElement | null = null;
let activeAnchor: HTMLElement | null = null;
let panelPositionFrame: number | null = null;
const SHARED_CARD_HIGHLIGHT_MS = 20_000;

let deepLinkFocused = false;
let focusTimer: number | null = null;
let highlightUntil = 0;
let highlightExpiryTimer: number | null = null;

const qrModulePromise = import('qrcode');
const posterCache = new Map<string, Promise<Blob>>();
const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;

function normalizeDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  let cleaned = value.trim();
  try { cleaned = decodeURIComponent(cleaned); } catch { return null; }
  cleaned = cleaned
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function tr(zh: string, en: string): string {
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? zh : en;
}

const RICH_SHARE_ORIGIN = 'https://api.gczhouwld.com';
const CANONICAL_GALLERY_ORIGIN = 'https://gallery.gczhouwld.com';
const GALLERY_BUILD_ID = typeof __GALLERY_BUILD_ID__ === 'string' && __GALLERY_BUILD_ID__
  ? __GALLERY_BUILD_ID__
  : 'runtime';

function shareUrl(doi: string): string {
  return `${CANONICAL_GALLERY_ORIGIN}/?doi=${encodeURIComponent(doi)}&sharev=${encodeURIComponent(GALLERY_BUILD_ID)}`;
}

type WeChatSdk = {
  config: (config: Record<string, unknown>) => void;
  ready: (callback: () => void) => void;
  error: (callback: (error: unknown) => void) => void;
  updateAppMessageShareData?: (data: Record<string, unknown>) => void;
  updateTimelineShareData?: (data: Record<string, unknown>) => void;
};

let weChatSdkPromise: Promise<WeChatSdk> | null = null;
let weChatReadyPromise: Promise<WeChatSdk> | null = null;
let weChatSignedUrl = '';

function isWeChatBrowser(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent);
}

function isWeChatJsSdkHost(): boolean {
  if (window.location.protocol !== 'https:') return false;
  return new Set(['gallery.gczhouwld.com', 'api.gczhouwld.com'])
    .has(window.location.hostname.toLowerCase());
}

function currentWeChatSignedUrl(): string {
  return window.location.href.split('#')[0];
}

function loadWeChatSdk(): Promise<WeChatSdk> {
  const existing = (window as Window & { wx?: WeChatSdk }).wx;
  if (existing) return Promise.resolve(existing);
  if (weChatSdkPromise) return weChatSdkPromise;
  weChatSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
    script.async = true;
    script.onload = () => {
      const wx = (window as Window & { wx?: WeChatSdk }).wx;
      if (wx) resolve(wx);
      else reject(new Error('wechat_sdk_missing_after_load'));
    };
    script.onerror = () => reject(new Error('wechat_sdk_load_failed'));
    document.head.appendChild(script);
  });
  return weChatSdkPromise;
}

async function ensureWeChatReady(): Promise<WeChatSdk> {
  if (!isWeChatBrowser()) throw new Error('not_wechat_browser');
  if (!isWeChatJsSdkHost()) throw new Error('wechat_js_sdk_host_not_configured');
  const signedUrl = currentWeChatSignedUrl();
  if (weChatReadyPromise && weChatSignedUrl === signedUrl) return weChatReadyPromise;
  weChatSignedUrl = signedUrl;
  weChatReadyPromise = (async () => {
    const [wx, response] = await Promise.all([
      loadWeChatSdk(),
      fetch(`${RICH_SHARE_ORIGIN}/api/wechat/js-sdk-signature?url=${encodeURIComponent(signedUrl)}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      }),
    ]);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) {
      const error = new Error(String(body?.error || 'wechat_signature_failed'));
      (error as Error & { details?: unknown }).details = body;
      throw error;
    }
    return await new Promise<WeChatSdk>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('wechat_config_timeout')); }
      }, 12000);
      wx.ready(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(wx);
      });
      wx.error(error => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('wechat_config_error'));
      });
      wx.config({
        debug: false,
        appId: body.appId,
        timestamp: body.timestamp,
        nonceStr: body.nonceStr,
        signature: body.signature,
        jsApiList: body.jsApiList || ['updateAppMessageShareData', 'updateTimelineShareData'],
      });
    });
  })();
  try { return await weChatReadyPromise; }
  catch (error) { weChatReadyPromise = null; throw error; }
}

async function shareImageUrl(info: ShareInfo): Promise<string> {
  if (info.imageUrl && !info.imageUrl.includes('share-default.png')) return info.imageUrl;
  try {
    const response = await fetch(info.url, { cache: 'no-store' });
    if (response.ok) {
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const image = parsed.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
      if (image) return new URL(image, info.url).toString();
    }
  } catch {}
  return `${CANONICAL_GALLERY_ORIGIN}/share-default.png`;
}

async function configureWeChatShare(info: ShareInfo): Promise<void> {
  const wx = await ensureWeChatReady();
  const imgUrl = await shareImageUrl(info);
  const desc = [info.journal, info.date, `DOI: ${info.doi}`].filter(Boolean).join(' · ');
  if (typeof wx.updateAppMessageShareData !== 'function') throw new Error('wechat_friend_share_api_missing');
  if (typeof wx.updateTimelineShareData !== 'function') throw new Error('wechat_timeline_share_api_missing');
  const link = info.url;
  wx.updateAppMessageShareData({ title: info.title, desc, link, imgUrl });
  wx.updateTimelineShareData({
    title: [info.title, info.journal].filter(Boolean).join(' · '),
    link,
    imgUrl,
  });
}

function infoFromButton(button: HTMLElement): ShareInfo | null {
  const card = button.closest<HTMLElement>('.card');
  if (!card) return null;
  const doi = normalizeDoi(card.dataset.doi || card.querySelector<HTMLElement>('.doi')?.textContent);
  if (!doi) return null;
  return {
    doi,
    title: card.querySelector<HTMLElement>('.title')?.textContent?.trim() || doi,
    journal: card.dataset.journal || '',
    date: card.dataset.date || '',
    url: shareUrl(doi),
    imageElement: card.querySelector<HTMLImageElement>('.toc-image'),
    imageUrl: card.querySelector<HTMLImageElement>('.toc-image')?.currentSrc
      || card.querySelector<HTMLImageElement>('.toc-image')?.src
      || `${CANONICAL_GALLERY_ORIGIN}/share-default.png`,
  };
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the DOM-copy fallback.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  Object.assign(area.style, { position: 'fixed', left: '-10000px', top: '0', opacity: '0' });
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}

function showToast(message: string, duration = 1800): void {
  document.querySelector('.card-share-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'card-share-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

function closePanel(): void {
  const posterObjectUrl = activePanel?.dataset.posterObjectUrl;
  if (posterObjectUrl) URL.revokeObjectURL(posterObjectUrl);
  activePanel?.remove();
  activePanel = null;
  activeAnchor = null;
  if (panelPositionFrame !== null) cancelAnimationFrame(panelPositionFrame);
  panelPositionFrame = null;
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePanel();
}

function positionPanel(panel: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const margin = 10;
  if (window.innerWidth <= 680) {
    panel.style.left = '12px';
    panel.style.right = '12px';
    panel.style.top = 'auto';
    panel.style.bottom = '12px';
    return;
  }
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  const panelRect = panel.getBoundingClientRect();
  let left = rect.right - panelRect.width;
  left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));
  const roomBelow = window.innerHeight - rect.bottom;
  const top = roomBelow >= panelRect.height + 12
    ? rect.bottom + 8
    : Math.max(margin, rect.top - panelRect.height - 8);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const source = text.trim();
  if (!source) return [];
  const useWords = /\s/.test(source);
  const tokens = useWords ? source.split(/\s+/).map((word, index) => index ? ` ${word}` : word) : Array.from(source);
  const lines: string[] = [];
  let line = '';
  let consumed = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const candidate = line + token;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      consumed = index + 1;
      continue;
    }
    lines.push(line.trim());
    line = token.trimStart();
    if (lines.length === maxLines) break;
    consumed = index;
  }
  if (lines.length < maxLines && line) {
    lines.push(line.trim());
    consumed = tokens.length;
  }
  if (consumed < tokens.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last.replace(/[\s,.;:，。；：]+$/, '') + '…';
  }
  return lines.slice(0, maxLines);
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih) return;
  const scale = Math.min(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement | null>(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function posterTocImage(info: ShareInfo): Promise<HTMLImageElement | null> {
  const existing = info.imageElement;
  if (existing?.complete && existing.naturalWidth > 0) {
    try {
      const current = new URL(existing.currentSrc || existing.src, window.location.href);
      if (current.origin === window.location.origin) return existing;
    } catch {}
  }
  const candidates = [
    info.imageUrl,
    new URL('/share-default.png', window.location.origin).toString(),
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  for (const candidate of candidates) {
    const image = await loadImageFromUrl(candidate);
    if (image) return image;
  }
  return null;
}

async function posterBlob(info: ShareInfo): Promise<Blob> {
  const key = [info.doi.toLowerCase(), info.imageUrl || ''].join('|');
  const cached = posterCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const canvas = document.createElement('canvas');
    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('poster_canvas_unavailable');

    ctx.fillStyle = '#eef2f8';
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    roundRectPath(ctx, 42, 42, 996, 1356, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const left = 86;
    const contentWidth = 908;
    ctx.fillStyle = '#3159bd';
    ctx.font = '800 25px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText('ORGANIC SYNTHESIS GALLERY', left, 105);

    ctx.fillStyle = '#172033';
    ctx.font = '750 48px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    const titleLines = wrapCanvasText(ctx, info.title, contentWidth, 4);
    let y = 174;
    for (const line of titleLines) {
      ctx.fillText(line, left, y);
      y += 60;
    }

    const meta = [info.journal, info.date, `DOI: ${info.doi}`].filter(Boolean).join(' · ');
    ctx.fillStyle = '#687386';
    ctx.font = '500 26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const metaLines = wrapCanvasText(ctx, meta, contentWidth, 2);
    y += 4;
    for (const line of metaLines) {
      ctx.fillText(line, left, y);
      y += 36;
    }

    const tocTop = Math.max(380, y + 26);
    const footerTop = 1072;
    const tocHeight = Math.max(430, footerTop - tocTop - 44);
    roundRectPath(ctx, left, tocTop, contentWidth, tocHeight, 26);
    ctx.fillStyle = '#f7f9fc';
    ctx.fill();
    ctx.strokeStyle = '#dfe5ef';
    ctx.lineWidth = 2;
    ctx.stroke();

    const [tocImage, qrModule] = await Promise.all([posterTocImage(info), qrModulePromise]);
    if (tocImage) {
      drawContainedImage(ctx, tocImage, left + 30, tocTop + 30, contentWidth - 60, tocHeight - 60);
    } else {
      ctx.fillStyle = '#98a2b3';
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tr('TOC 图片暂未获取', 'TOC image not available yet'), POSTER_WIDTH / 2, tocTop + tocHeight / 2);
      ctx.textAlign = 'left';
    }

    const qrDataUrl = await qrModule.default.toDataURL(info.url, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('poster_qr_load_failed'));
      image.src = qrDataUrl;
    });

    const qrSize = 250;
    const qrX = POSTER_WIDTH - left - qrSize;
    const qrY = 1110;
    roundRectPath(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#d7deea';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    roundRectPath(ctx, left, 1115, 232, 56, 20);
    ctx.fillStyle = '#fff1e8';
    ctx.fill();
    ctx.fillStyle = '#c75220';
    ctx.font = '800 28px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('↗  扫码跳转', left + 18, 1152);

    ctx.fillStyle = '#172033';
    ctx.font = '750 36px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(tr('扫码跳转并定位该文献', 'Scan to open this paper'), left, 1228);

    ctx.fillStyle = '#667085';
    ctx.font = '500 25px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    const hintLines = wrapCanvasText(
      ctx,
      tr('进入 Organic Synthesis Gallery，自动定位并高亮对应卡片。', 'Open Organic Synthesis Gallery and highlight the matching paper.'),
      610,
      2,
    );
    let hintY = 1272;
    for (const line of hintLines) {
      ctx.fillText(line, left, hintY);
      hintY += 34;
    }

    ctx.fillStyle = '#98a2b3';
    ctx.font = '600 21px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText('gallery.gczhouwld.com', left, 1362);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('poster_png_export_failed')), 'image/png');
    });
  })();

  posterCache.set(key, pending);
  if (posterCache.size > 12) posterCache.delete(posterCache.keys().next().value as string);
  pending.catch(() => posterCache.delete(key));
  return pending;
}

async function loadPosterPreview(panel: HTMLElement, info: ShareInfo): Promise<Blob> {
  const holder = panel.querySelector<HTMLElement>('[data-share-poster]');
  const copyButton = panel.querySelector<HTMLButtonElement>('[data-share-action="copy-poster"]');
  if (!holder || !copyButton) throw new Error('poster_ui_missing');
  try {
    const blob = await posterBlob(info);
    if (!panel.isConnected) return blob;
    const oldUrl = panel.dataset.posterObjectUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const objectUrl = URL.createObjectURL(blob);
    panel.dataset.posterObjectUrl = objectUrl;
    panel.dataset.posterReady = 'true';
    holder.innerHTML = `<img class="card-share-poster-image" src="${objectUrl}" alt="${tr('文献分享图片', 'Paper share image')}"><div class="card-share-poster-hint">${tr('默认分享图片：标题 + TOC + 二维码。扫码后直接定位并高亮该文献。', 'Default share image: title + TOC + QR code. Scanning opens and highlights this paper.')}</div>`;
    copyButton.disabled = false;
    return blob;
  } catch (error) {
    if (panel.isConnected) {
      holder.innerHTML = `<div class="card-share-poster-error">${tr('分享图片生成失败，请重试。', 'Share image generation failed. Please try again.')}</div>`;
    }
    throw error;
  }
}

function downloadPoster(blob: Blob, info: ShareInfo): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `OSG-${info.doi.replace(/[^a-z0-9._-]+/gi, '_')}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function copyPoster(blob: Blob, info: ShareInfo): Promise<'copied' | 'downloaded'> {
  const ClipboardItemCtor = (window as Window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (navigator.clipboard?.write && ClipboardItemCtor) {
    try {
      await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
      return 'copied';
    } catch {}
  }
  downloadPoster(blob, info);
  return 'downloaded';
}

function openPanel(anchor: HTMLElement, info: ShareInfo): void {
  closePanel();
  const panel = document.createElement('section');
  panel.className = 'card-share-panel';
  panel.dataset.shareUrl = info.url;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', tr('分享文献', 'Share paper'));
  panel.innerHTML = `
    <div class="card-share-head">
      <div>
        <div class="card-share-kicker">${tr('分享这篇文献', 'Share this paper')}</div>
        <div class="card-share-title"></div>
      </div>
      <button type="button" class="card-share-close" data-share-close aria-label="${tr('关闭', 'Close')}">×</button>
    </div>
    <div class="card-share-meta"></div>
    <div class="card-share-poster" data-share-poster>
      <div class="card-share-poster-loading">${tr('正在快速生成分享图片…', 'Generating share image…')}</div>
    </div>
    <div class="card-share-actions-grid">
      <button type="button" class="card-share-primary-action" data-share-action="copy-poster" disabled>${tr('复制分享图片', 'Copy share image')}</button>
      <button type="button" data-share-action="copy-title-doi">${tr('复制标题 + DOI', 'Copy title + DOI')}</button>
      <button type="button" data-share-action="copy-link">${tr('复制链接', 'Copy link')}</button>
    </div>
  `;
  panel.querySelector<HTMLElement>('.card-share-title')!.textContent = info.title;
  panel.querySelector<HTMLElement>('.card-share-meta')!.textContent = [info.journal, info.date, info.doi].filter(Boolean).join(' · ');

  document.body.appendChild(panel);
  activePanel = panel;
  activeAnchor = anchor;
  const posterPromise = loadPosterPreview(panel, info);
  posterPromise.catch(error => console.warn('SHARE_POSTER_GENERATION_FAILED', error));

  panel.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-share-close]')) {
      closePanel();
      return;
    }
    const action = target.closest<HTMLElement>('[data-share-action]')?.dataset.shareAction;
    if (!action) return;
    void (async () => {
      if (action === 'copy-poster') {
        try {
          const blob = await posterPromise;
          const result = await copyPoster(blob, info);
          showToast(result === 'copied'
            ? tr('分享图片已复制，可直接粘贴到微信。', 'Share image copied. You can paste it into WeChat.')
            : tr('浏览器不支持复制图片，已改为保存 PNG。', 'Image clipboard is unavailable; the PNG was saved instead.'), 3200);
        } catch {
          showToast(tr('复制分享图片失败，请重试。', 'Could not copy the share image. Please try again.'));
        }
        return;
      }
      if (action === 'copy-title-doi') {
        try {
          await copyText([info.title, `DOI: ${info.doi}`].join('\n'));
          showToast(tr('标题和 DOI 已复制', 'Title and DOI copied'));
        } catch {
          showToast(tr('复制失败，请手动复制。', 'Copy failed. Please copy manually.'));
        }
        return;
      }
      if (action === 'copy-link') {
        try {
          await copyText(info.url);
          showToast(tr('文献链接已复制', 'Paper link copied'));
        } catch {
          showToast(tr('复制失败，请手动复制。', 'Copy failed. Please copy manually.'));
        }
      }
    })();
  });

  requestAnimationFrame(() => positionPanel(panel, anchor));
  document.addEventListener('keydown', onKeydown);
}

function deepLinkDoi(): string | null {
  try { return normalizeDoi(new URL(window.location.href).searchParams.get('doi')); }
  catch { return null; }
}

function clearSharedHighlight(): void {
  document.querySelectorAll<HTMLElement>('.card.shared-card-target')
    .forEach(card => card.classList.remove('shared-card-target'));
  highlightUntil = 0;
  if (highlightExpiryTimer !== null) window.clearTimeout(highlightExpiryTimer);
  highlightExpiryTimer = null;
}

function scheduleSharedHighlightExpiry(): void {
  if (!highlightUntil) return;
  const remaining = Math.max(0, highlightUntil - Date.now());
  if (highlightExpiryTimer !== null) window.clearTimeout(highlightExpiryTimer);
  highlightExpiryTimer = window.setTimeout(clearSharedHighlight, remaining);
}

function focusDeepLinkCard(): void {
  const doi = deepLinkDoi();
  if (!doi) {
    deepLinkFocused = true;
    clearSharedHighlight();
    return;
  }

  const card = [...document.querySelectorAll<HTMLElement>('.card[data-doi]')]
    .find(item => item.dataset.doi?.toLowerCase() === doi.toLowerCase());
  if (!card) return;

  const firstFocus = !deepLinkFocused;
  if (firstFocus) {
    deepLinkFocused = true;
    highlightUntil = Date.now() + SHARED_CARD_HIGHLIGHT_MS;
    const title = card.querySelector<HTMLElement>('.title')?.textContent?.trim();
    if (title) document.title = `${title} | Organic Synthesis Gallery`;
    requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    if (isWeChatBrowser() && isWeChatJsSdkHost()) {
      const shareButton = card.querySelector<HTMLElement>('[data-card-share]');
      const info = shareButton ? infoFromButton(shareButton) : null;
      if (info) {
        void configureWeChatShare(info)
          .then(() => showToast(tr('微信分享卡片已自动准备好：点右上角“…”→“分享给朋友”。', 'WeChat share card is ready. Use the top-right menu → Share with friends.'), 3600))
          .catch(error => console.warn('WECHAT_AUTO_SHARE_CONFIG_FAILED', error));
      }
    }
  }

  if (highlightUntil > Date.now()) {
    card.classList.add('shared-card-target');
    scheduleSharedHighlightExpiry();
  } else {
    clearSharedHighlight();
  }
}

function scheduleDeepLinkFocus(): void {
  if (focusTimer !== null) return;
  if (deepLinkFocused && highlightUntil <= Date.now()) return;
  focusTimer = window.setTimeout(() => {
    focusTimer = null;
    focusDeepLinkCard();
  }, 40);
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const button = target.closest<HTMLElement>('[data-card-share]');
  if (button) {
    event.preventDefault();
    event.stopPropagation();
    const info = infoFromButton(button);
    if (info) openPanel(button, info);
    return;
  }
  if (activePanel && !event.composedPath().includes(activePanel)) closePanel();
});

function schedulePanelPosition(): void {
  if (!activePanel || !activeAnchor || panelPositionFrame !== null) return;
  panelPositionFrame = requestAnimationFrame(() => {
    panelPositionFrame = null;
    if (activePanel && activeAnchor) positionPanel(activePanel, activeAnchor);
  });
}

window.addEventListener('resize', schedulePanelPosition, { passive: true });
window.addEventListener('scroll', schedulePanelPosition, { passive: true, capture: true });

document.documentElement.dataset.cardShareReady = 'true';

const observer = new MutationObserver(() => scheduleDeepLinkFocus());
observer.observe(document.documentElement, { childList: true, subtree: true });
scheduleDeepLinkFocus();
