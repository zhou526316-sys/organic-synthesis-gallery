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

async function loadQr(panel: HTMLElement, info: ShareInfo): Promise<void> {
  const holder = panel.querySelector<HTMLElement>('[data-share-qr]');
  const button = panel.querySelector<HTMLButtonElement>('[data-share-action="qr"]');
  if (!holder || !button) return;
  button.disabled = true;
  holder.hidden = false;
  holder.innerHTML = `<div class="card-share-qr-loading">${tr('正在生成二维码…', 'Generating QR code…')}</div>`;
  try {
    const qrModule = await import('qrcode');
    const dataUrl = await qrModule.default.toDataURL(sharePrepareUrl(info.url), {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    holder.innerHTML = `<img class="card-share-qr-image" src="${dataUrl}" alt="${tr('微信图文分享二维码', 'WeChat rich-share QR code')}"><div class="card-share-qr-hint">${tr('用微信扫码后页面会停留并自动准备标题 + TOC 图；随后点右上角“…”→“分享给朋友”。', 'Scan in WeChat. The page will stay open and prepare the title + TOC image; then use the top-right menu → Share with friends.')}</div>`;
  } catch {
    holder.innerHTML = `<div class="card-share-qr-error">${tr('二维码生成失败，请使用复制链接。', 'QR generation failed. Use Copy link instead.')}</div>`;
  } finally {
    button.disabled = false;
  }
}

function openPanel(anchor: HTMLElement, info: ShareInfo): void {
  closePanel();
  const weChatContext = isWeChatBrowser() && isWeChatJsSdkHost();
  const weChatTip = weChatContext
    ? tr('当前页面可直接配置微信图文卡片：标题 + 期刊/DOI + TOC 图。准备完成后只需点右上角“…”→“分享给朋友”。', 'This page can configure a WeChat rich card with title, journal/DOI and TOC image. Once ready, just use the top-right menu → Share with friends.')
    : tr('电脑端最省事的方式：点“微信扫码分享图文卡片”，用微信扫一次；扫码页不会自动跳走，卡片准备好后只需右上角分享。', 'Easiest desktop flow: choose “Scan with WeChat to share rich card” and scan once. The scanned page will stay open; after the card is prepared, just share from the top-right menu.');
  const weChatActionLabel = weChatContext
    ? tr('准备微信图文卡片', 'Prepare WeChat rich card')
    : tr('微信扫码分享图文卡片', 'Scan with WeChat to share rich card');
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
    <div class="card-share-wechat-tip">${weChatTip}</div>
    <div class="card-share-actions-grid">
      <button type="button" data-share-action="wechat-copy">${weChatActionLabel}</button>
      <button type="button" data-share-action="native">${tr('系统分享', 'System share')}</button>
      <button type="button" data-share-action="copy-link">${tr('复制富卡链接', 'Copy rich-preview link')}</button>
      <button type="button" data-share-action="copy-text">${tr('复制标题 + DOI + 链接', 'Copy title + DOI + link')}</button>
      <button type="button" data-share-action="qr">${tr('微信扫码分享', 'WeChat QR share')}</button>
    </div>
    <div class="card-share-qr" data-share-qr hidden></div>
  `;
  panel.querySelector<HTMLElement>('.card-share-title')!.textContent = info.title;
  panel.querySelector<HTMLElement>('.card-share-meta')!.textContent = [info.journal, info.date, info.doi].filter(Boolean).join(' · ');
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
      if (action === 'wechat-copy') {
        if (isWeChatBrowser() && isWeChatJsSdkHost()) {
          try {
            await configureWeChatShare(info);
            showToast(tr('微信卡片已准备好：请点右上角“…”→“分享给朋友”。不要复制粘贴链接。', 'WeChat card is ready: use the top-right menu → Share with friends. Do not paste the URL into chat.'), 3600);
          } catch (error) {
            console.warn('WECHAT_SHARE_CONFIG_FAILED', error);
            try {
              await copyText(info.url);
              showToast(tr('微信接口暂未就绪，已复制微信内打开链接；直接粘贴到聊天框只会显示普通链接。', 'WeChat API is not ready. A link to open inside WeChat was copied; pasting it into chat only sends a plain link.'), 3600);
            } catch {
              showToast(tr('微信分享配置失败，请使用二维码。', 'WeChat share setup failed. Use the QR code.'));
            }
          }
        } else {
          await loadQr(panel, info);
          showToast(tr('请用微信扫描二维码；扫码页会停留并自动准备标题 + TOC 图文卡片。', 'Scan the QR code with WeChat; the scanned page will stay open and prepare the title + TOC rich card.'), 4200);
        }
        return;
      }
      if (action === 'native') {
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({
              title: info.title,
              text: [info.journal, `DOI: ${info.doi}`].filter(Boolean).join(' · '),
              url: info.url,
            });
            showToast(tr('已交给系统分享', 'Shared through the system share sheet'));
            closePanel();
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
          }
        }
        try {
          await copyText(info.url);
          showToast(tr('系统分享当前不可用，已自动复制卡片链接', 'System share is unavailable; the card link was copied instead.'));
        } catch {
          showToast(tr('系统分享和复制都失败，请使用二维码。', 'System share and copy failed. Use the QR code instead.'));
        }
        return;
      }
      if (action === 'copy-link') {
        try {
          await copyText(info.url);
          showToast(tr('已复制富卡链接', 'Rich-preview link copied'));
        } catch {
          showToast(tr('复制失败，请手动复制。', 'Copy failed. Please copy manually.'));
        }
        return;
      }
      if (action === 'copy-text') {
        try {
          await copyText(shareText(info));
          showToast(tr('已复制分享文字', 'Share text copied'));
        } catch {
          showToast(tr('复制失败，请手动复制。', 'Copy failed. Please copy manually.'));
        }
        return;
      }
      if (action === 'qr') await loadQr(panel, info);
    })();
  });

  document.body.appendChild(panel);
  activePanel = panel;
  activeAnchor = anchor;
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
