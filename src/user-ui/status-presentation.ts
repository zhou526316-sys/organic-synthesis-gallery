import { STATUS_GLOWS, store, statusLabel, type Language, type StatusGlow } from './shared';

import { bindGlowWidth, STATUS_GLOW_WIDTH_CSS } from './status-glow-width';
import { applyCardGlow } from './card-glow';

const LABELS: Record<StatusGlow, [string, string]> = {
  none: ['关闭', 'Off'], soft: ['柔光', 'Soft'], pulse: ['呼吸', 'Breathing'],
  orbit: ['环绕', 'Orbit'], rainbow: ['彩虹', 'Rainbow'],
};
const tones = new Map<string, Promise<'dark' | 'light'>>();

export function safeStatusGlow(value: unknown): StatusGlow {
  return STATUS_GLOWS.includes(value as StatusGlow) ? value as StatusGlow : 'none';
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
  const card = (root.host as HTMLElement).closest<HTMLElement>('#gallery > .card');
  if (card) applyCardGlow(card, selected?.style, selected?.id || '');
  const action = root.querySelector<HTMLButtonElement>('button[data-action="status"]');
  if (action) {
    if (selected?.style.imageData && action.querySelector('.status-action-label')) {
      const source = selected.style.imageData;
      action.dataset.captionTone = 'light';
      void captionTone(source).then(tone => {
        if (!action.isConnected || store.status(store.paper(paperId).statusId || '')?.style.imageData !== source) return;
        action.dataset.captionTone = tone;
      });
    }
  }
  root.querySelectorAll<HTMLElement>('[data-status-editor]').forEach(editor => {
    const id = editor.dataset.statusEditor || '';
    const status = store.status(id);
    if (!status) return;
    const label = document.createElement('label'); label.className = 'status-glow-control';
    const name = document.createElement('span'); name.textContent = language === 'zh' ? '卡片光效' : 'Card glow';
    const select = document.createElement('select'); select.dataset.statusGlowChoice = id;
    select.setAttribute('aria-label', `${name.textContent} · ${statusLabel(status, language)}`);
    for (const value of STATUS_GLOWS) {
      const option = document.createElement('option'); option.value = value;
      option.textContent = LABELS[value][language === 'zh' ? 0 : 1]; select.append(option);
    }
    select.value = safeStatusGlow(status.style.glow);
    const message = document.createElement('span'); message.dataset.statusGlowMessage = id;
    message.setAttribute('role', 'status'); message.className = 'status-glow-help';
    message.textContent = language === 'zh' ? '应用于该阅读状态的整张文献卡片；按钮不发光。减少动态效果时停止动画。' : 'Applies to the full literature card for this status, not its buttons. Reduced motion stops animation.';
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
@media(forced-colors:active){.action.status-artwork .status-action-label{color:ButtonText!important;background:ButtonFace!important}}
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
