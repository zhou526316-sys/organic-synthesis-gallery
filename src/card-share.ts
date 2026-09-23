import './card-share.css';

interface ShareInfo {
  doi: string;
  title: string;
  journal: string;
  date: string;
  url: string;
}

let activePanel: HTMLElement | null = null;
let activeAnchor: HTMLElement | null = null;
let panelPositionFrame: number | null = null;
const SHARED_CARD_HIGHLIGHT_MS = 20_000;

let deepLinkFocused = false;
let focusTimer: number | null = null;
let highlightUntil = 0;
let highlightExpiryTimer: number | null = null;

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

function shareSlug(doi: string): string {
  const bytes = new TextEncoder().encode(doi.toLowerCase());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const RICH_SHARE_ORIGIN = 'https://api.gczhouwld.com';

function shareUrl(doi: string): string {
  return `${RICH_SHARE_ORIGIN}/share/${shareSlug(doi)}.html`;
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

function shareText(info: ShareInfo): string {
  const meta = [info.journal, info.date].filter(Boolean).join(' | ');
  return [
    info.title,
    meta,
    `DOI: ${info.doi}`,
    '',
    tr('在 Organic Synthesis Gallery 查看 TOC、摘要和正文图：', 'View TOC, summary and article figures in Organic Synthesis Gallery:'),
    info.url,
  ].filter(Boolean).join('\n');
}

function showToast(message: string): void {
  document.querySelector('.card-share-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'card-share-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 180);
  }, 1800);
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
    const dataUrl = await qrModule.default.toDataURL(info.url, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    holder.innerHTML = `<img class="card-share-qr-image" src="${dataUrl}" alt="${tr('文献分享二维码', 'Paper share QR code')}"><div class="card-share-qr-hint">${tr('微信中可长按识别，或截图后分享。', 'Long-press to scan in WeChat, or share a screenshot.')}</div>`;
  } catch {
    holder.innerHTML = `<div class="card-share-qr-error">${tr('二维码生成失败，请使用复制链接。', 'QR generation failed. Use Copy link instead.')}</div>`;
  } finally {
    button.disabled = false;
  }
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
    <div class="card-share-actions-grid">
      <button type="button" data-share-action="native">${tr('系统分享', 'Share…')}</button>
      <button type="button" data-share-action="copy-link">${tr('复制链接', 'Copy link')}</button>
      <button type="button" data-share-action="copy-text">${tr('复制标题 + DOI + 链接', 'Copy title + DOI + link')}</button>
      <button type="button" data-share-action="qr">${tr('生成二维码', 'Generate QR')}</button>
    </div>
    <div class="card-share-qr" data-share-qr hidden></div>
  `;
  panel.querySelector<HTMLElement>('.card-share-title')!.textContent = info.title;
  panel.querySelector<HTMLElement>('.card-share-meta')!.textContent = [info.journal, info.date, info.doi].filter(Boolean).join(' · ');
  const nativeButton = panel.querySelector<HTMLButtonElement>('[data-share-action="native"]');
  if (!navigator.share && nativeButton) nativeButton.hidden = true;

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
      if (action === 'native' && navigator.share) {
        try {
          await navigator.share({ title: info.title, text: `${info.journal} · DOI: ${info.doi}`, url: info.url });
          closePanel();
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            showToast(tr('系统分享未完成，可改用复制链接。', 'System share did not complete. Use Copy link instead.'));
          }
        }
        return;
      }
      if (action === 'copy-link') {
        try {
          await copyText(info.url);
          showToast(tr('已复制本篇链接', 'Paper link copied'));
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
