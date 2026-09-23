import { STATUS_GLOWS, store, statusLabel, type Language, type StatusGlow, type StyleDef } from './shared';

import { applyGlowWidth, bindGlowWidth, STATUS_GLOW_WIDTH_CSS } from './status-glow-width';

const LABELS: Record<StatusGlow, [string, string]> = {
  none: ['关闭', 'Off'], soft: ['柔光', 'Soft'], pulse: ['呼吸', 'Breathing'],
  orbit: ['环绕', 'Orbit'], rainbow: ['彩虹', 'Rainbow'],
};
const tones = new Map<string, Promise<'dark' | 'light'>>();

export function safeStatusGlow(value: unknown): StatusGlow {
  return STATUS_GLOWS.includes(value as StatusGlow) ? value as StatusGlow : 'none';
}

function applyGlow(node: HTMLElement, style?: StyleDef, statusId = ''): void {
  node.dataset.statusGlowId = statusId;
  applyGlowWidth(node, style?.glowWidth);
  node.dataset.statusGlow = safeStatusGlow(style?.glow);
  const rgb = (style?.rgb || [93, 109, 219]).map(value => Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0);
  node.style.setProperty('--status-glow-rgb', rgb.join(','));
}

function captionTone(source: string): Promise<'dark' | 'light'> {
  const cached = tones.get(source);
  if (cached) return cached;
  // Only sample the small synced preview, never an original or external URL.
  // The contrasting text backplate remains safe when later GIF frames change.
  const pending = new Promise<'dark' | 'light'>(resolve => {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) { resolve('light'); return; }
    const image = new Image();
    let settled = false;
    const finish = (tone: 'dark' | 'light'): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.onload = null; image.onerror = null;
      resolve(tone);
    };
    const timer = window.setTimeout(() => finish('light'), 2000);
    image.onerror = () => finish('light');
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) { finish('light'); return; }
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, 16, 16);
        context.drawImage(image, 0, 0, 16, 16);
        const pixels = context.getImageData(0, 0, 16, 16).data;
        let brightness = 0;
        for (let i = 0; i < pixels.length; i += 4) brightness += (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
        finish(brightness / 256 >= 160 ? 'dark' : 'light');
      } catch { finish('light'); }
    };
    image.src = source;
  });
  if (tones.size >= 32) tones.delete(tones.keys().next().value!);
  tones.set(source, pending);
  return pending;
}

/** Bind to the current disposable card render. No observers, global event
 * listeners or reader events are installed by the presentation controls. */
export function bindStatusPresentation(root: ShadowRoot, language: Language, paperId: string): void {
  const selected = store.status(store.paper(paperId).statusId || '');
  const action = root.querySelector<HTMLButtonElement>('button[data-action="status"]');
  if (action) {
    applyGlow(action, selected?.style, selected?.id || '');
    if (selected?.style.imageData && action.querySelector('.status-action-label')) {
      const source = selected.style.imageData;
      action.dataset.captionTone = 'light';
      void captionTone(source).then(tone => {
        if (!action.isConnected || store.status(store.paper(paperId).statusId || '')?.style.imageData !== source) return;
        action.dataset.captionTone = tone;
      });
    }
  }
  root.querySelectorAll<HTMLElement>('.chips > .chip.status').forEach(node => applyGlow(node, selected?.style, selected?.id || ''));
  root.querySelectorAll<HTMLElement>('[data-status-editor]').forEach(editor => {
    const id = editor.dataset.statusEditor || '';
    const status = store.status(id);
    if (!status) return;
    const choice = Array.from(root.querySelectorAll<HTMLElement>('button[data-action]')).find(node => node.dataset.action === `set-status:${id}`)?.querySelector<HTMLElement>('.status-choice-label');
    if (choice) applyGlow(choice, status.style, id);
    const label = document.createElement('label'); label.className = 'status-glow-control';
    const name = document.createElement('span'); name.textContent = language === 'zh' ? '环绕光效' : 'Surrounding glow';
    const select = document.createElement('select'); select.dataset.statusGlowChoice = id;
    select.setAttribute('aria-label', `${name.textContent} · ${statusLabel(status, language)}`);
    for (const value of STATUS_GLOWS) {
      const option = document.createElement('option'); option.value = value;
      option.textContent = LABELS[value][language === 'zh' ? 0 : 1]; select.append(option);
    }
    select.value = safeStatusGlow(status.style.glow);
    const message = document.createElement('span'); message.dataset.statusGlowMessage = id;
    message.setAttribute('role', 'status'); message.className = 'status-glow-help';
    message.textContent = language === 'zh' ? '仅改变外观，不改变阅读状态；减少动态效果时停止装饰动画。' : 'Appearance only; reduced motion stops decorative animation.';
    select.addEventListener('change', () => {
      const before = safeStatusGlow(store.status(id)?.style.glow);
      if (!store.setStatusGlow(id, safeStatusGlow(select.value))) {
        select.value = before;
        message.textContent = language === 'zh' ? '保存失败，已保留原光效。请检查浏览器存储。' : 'Could not save. Previous glow kept; check browser storage.';
      }
    });
    label.append(name, select, message); editor.append(label);
    bindGlowWidth(editor, root, id, language);
  });
}

export const STATUS_PRESENTATION_CSS = `
[data-status-glow]{position:relative}
[data-status-glow]:not([data-status-glow="none"])::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:3;border:1px solid rgba(var(--status-glow-rgb),.8);box-shadow:inset 0 0 7px 1px rgba(var(--status-glow-rgb),.6),0 0 5px rgba(var(--status-glow-rgb),.4)}
[data-status-glow="rainbow"]::after{border-color:#a78bfa;box-shadow:inset 2px 0 5px #38bdf8,inset -2px 0 5px #e879f9,inset 0 2px 5px #facc15,inset 0 -2px 5px #34d399}
@keyframes status-glow-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes status-glow-orbit{0%,100%{box-shadow:inset 3px 0 7px rgba(var(--status-glow-rgb),.95)}25%{box-shadow:inset 0 3px 7px rgba(var(--status-glow-rgb),.95)}50%{box-shadow:inset -3px 0 7px rgba(var(--status-glow-rgb),.95)}75%{box-shadow:inset 0 -3px 7px rgba(var(--status-glow-rgb),.95)}}
@keyframes status-glow-rainbow{0%,100%{border-color:#38bdf8;filter:hue-rotate(0deg)}50%{border-color:#e879f9;filter:hue-rotate(180deg)}}
@media(prefers-reduced-motion:no-preference){
[data-status-glow="pulse"]::after{animation:status-glow-pulse 2.8s ease-in-out infinite}
[data-status-glow="orbit"]::after{animation:status-glow-orbit 3.6s linear infinite}
[data-status-glow="rainbow"]::after{animation:status-glow-rainbow 5s linear infinite}
}
@media(forced-colors:active){[data-status-glow]::after{display:none!important}.action.status-artwork .status-action-label{color:ButtonText!important;background:ButtonFace!important}}
.status-style-editor .status-glow-control{grid-column:1/-1;display:grid;grid-template-columns:1fr;gap:5px;font-size:11px}
.status-glow-control select{min-height:34px;padding:5px 8px;border:1px solid #d7deea;border-radius:8px;background:#fff;font-size:12px}
.status-glow-help{font-size:10px;line-height:1.55;color:#667085}
.action.status-artwork{position:relative;isolation:isolate;overflow:hidden;padding:2px 5px}
.action.status-artwork .status-original-action{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:0;transform:none}
.action.status-artwork .status-action-label{display:block!important;position:relative;z-index:4;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border-radius:999px;line-height:1.35;font-weight:800;color:#fff;background:rgba(0,0,0,.76);transform:none;pointer-events:none}
.action.status-artwork[data-caption-tone="dark"] .status-action-label{color:#111827;background:rgba(255,255,255,.88)}
@media(max-width:680px){.bar:has(> .status-artwork){grid-template-columns:36px 80px 36px 36px max-content}.action.status-artwork .status-action-label{font-size:10px;padding:2px 5px}}
${STATUS_GLOW_WIDTH_CSS}
`;
