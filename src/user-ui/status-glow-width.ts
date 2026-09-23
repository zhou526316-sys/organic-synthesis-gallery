import { store, statusLabel, type Language } from './shared';

export const DEFAULT_GLOW_WIDTH = 1;
export const MIN_GLOW_WIDTH = 1;
export const MAX_GLOW_WIDTH = 6;

/** Old or malformed preferences cannot inject CSS or remove the visible edge. */
export function safeGlowWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(MIN_GLOW_WIDTH, Math.min(MAX_GLOW_WIDTH, Math.round(value)))
    : DEFAULT_GLOW_WIDTH;
}

export function applyGlowWidth(node: HTMLElement, value: unknown): void {
  const width = safeGlowWidth(value);
  node.style.setProperty('--status-glow-width', `${width}px`);
  node.style.setProperty('--status-glow-blur', `${width + 6}px`);
  node.style.setProperty('--status-glow-outer-blur', `${width + 4}px`);
  node.style.setProperty('--status-glow-orbit-size', `${width + 2}px`);
  node.style.setProperty('--status-glow-rainbow-size', `${width + 1}px`);
}

/** Preview touches only this disposable card render. It never mutates stored
 * preferences or broadcasts changes on input; normal change commits once. */
export function bindGlowWidth(editor: HTMLElement, root: ShadowRoot, id: string, language: Language): void {
  const status = store.status(id);
  if (!status) return;
  const tr = (zh: string, en: string): string => language === 'zh' ? zh : en;
  const group = document.createElement('div'); group.className = 'status-glow-width-control';
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(MIN_GLOW_WIDTH); input.max = String(MAX_GLOW_WIDTH); input.step = '1';
  input.id = `status-glow-width-${id}`; input.dataset.statusGlowWidth = id;
  input.setAttribute('aria-label', `${tr('光效粗细', 'Glow thickness')} · ${statusLabel(status, language)}`);
  label.htmlFor = input.id; label.textContent = tr('光效粗细', 'Glow thickness');
  const value = document.createElement('output'); value.dataset.glowWidthValue = id;
  value.setAttribute('for', input.id);
  const reset = document.createElement('button'); reset.type = 'button'; reset.dataset.glowWidthReset = id;
  reset.textContent = tr('恢复默认', 'Reset');
  const message = document.createElement('span'); message.className = 'status-glow-width-help';
  message.dataset.glowWidthMessage = id; message.setAttribute('role', 'status');
  const hint = tr('1–6px；拖动预览，松开保存。光效关闭时只保存粗细。', '1–6px; drag to preview, release to save. Off stays off.');
  message.textContent = hint;
  const row = document.createElement('div'); row.className = 'status-glow-width-row';
  row.append(input, value, reset); group.append(label, row, message); editor.append(group);

  const setPreview = (width: number): void => {
    input.value = String(width); value.value = `${width} px`;
    input.setAttribute('aria-valuetext', `${width} ${tr('像素', 'pixels')}`);
    root.querySelectorAll<HTMLElement>('[data-status-glow-id]').forEach(node => {
      if (node.dataset.statusGlowId === id) applyGlowWidth(node, width);
    });
  };
  const storedWidth = (): number => safeGlowWidth(store.status(id)?.style.glowWidth);
  const commit = (width: number, focused: 'range' | 'reset'): void => {
    if (!input.isConnected) return;
    const keepFocus = root.activeElement === (focused === 'reset' ? reset : input);
    const top = root.querySelector<HTMLElement>('.drawer')?.scrollTop;
    if (!store.setStatusGlowWidth(id, width)) {
      setPreview(storedWidth());
      message.textContent = tr('保存失败，已恢复原粗细。请检查浏览器存储。', 'Could not save. Previous thickness restored; check browser storage.');
      return;
    }
    // A successful store broadcast replaces this card's DOM. Restore keyboard
    // focus and editor scroll so Arrow keys can continue adjusting the new range.
    const selector = focused === 'reset' ? '[data-glow-width-reset]' : '[data-status-glow-width]';
    const fresh = Array.from(root.querySelectorAll<HTMLElement>(selector)).find(node =>
      (focused === 'reset' ? node.dataset.glowWidthReset : node.dataset.statusGlowWidth) === id);
    if (keepFocus) fresh?.focus({ preventScroll: true });
    const drawer = root.querySelector<HTMLElement>('.drawer');
    if (drawer && top !== undefined) drawer.scrollTop = top;
  };
  setPreview(storedWidth());
  input.addEventListener('input', () => {
    setPreview(safeGlowWidth(input.valueAsNumber));
    message.textContent = hint;
  });
  input.addEventListener('change', () => commit(safeGlowWidth(input.valueAsNumber), 'range'));
  input.addEventListener('pointercancel', () => setPreview(storedWidth()));
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') setPreview(storedWidth());
  });
  reset.addEventListener('click', () => commit(DEFAULT_GLOW_WIDTH, 'reset'));
}

export const STATUS_GLOW_WIDTH_CSS = `
.status-style-editor .status-glow-width-control{grid-column:1/-1;display:grid;gap:3px;min-width:0}
.status-glow-width-control > label{font-size:11px}
.status-glow-width-row{display:flex;align-items:center;gap:8px;min-width:0}
.status-glow-width-row input[type="range"]{flex:1 1 0;min-width:0;width:100%;height:36px;margin:0;accent-color:#3159bd;touch-action:pan-y}
.status-glow-width-row output{flex:0 0 32px;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums}
.status-glow-width-row button{flex:0 0 auto;min-height:36px;padding:4px 8px;border:1px solid #d7deea;border-radius:8px;background:#fff;color:#3159bd;font-size:11px;cursor:pointer}
.status-glow-width-row :focus-visible{outline:2px solid #3159bd;outline-offset:2px}
.status-glow-width-help{font-size:10px;line-height:1.55;color:#667085;overflow-wrap:anywhere}
[data-status-glow]:not([data-status-glow="none"])::after{box-sizing:border-box;border-width:var(--status-glow-width,1px);box-shadow:inset 0 0 var(--status-glow-blur,7px) var(--status-glow-width,1px) rgba(var(--status-glow-rgb),.6),0 0 var(--status-glow-outer-blur,5px) rgba(var(--status-glow-rgb),.4)}
[data-status-glow="rainbow"]::after{box-shadow:inset var(--status-glow-rainbow-size,2px) 0 var(--status-glow-outer-blur,5px) #38bdf8,inset calc(-1 * var(--status-glow-rainbow-size,2px)) 0 var(--status-glow-outer-blur,5px) #e879f9,inset 0 var(--status-glow-rainbow-size,2px) var(--status-glow-outer-blur,5px) #facc15,inset 0 calc(-1 * var(--status-glow-rainbow-size,2px)) var(--status-glow-outer-blur,5px) #34d399}
@keyframes status-glow-orbit{
0%,100%{box-shadow:inset var(--status-glow-orbit-size,3px) 0 var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
25%{box-shadow:inset 0 var(--status-glow-orbit-size,3px) var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
50%{box-shadow:inset calc(-1 * var(--status-glow-orbit-size,3px)) 0 var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
75%{box-shadow:inset 0 calc(-1 * var(--status-glow-orbit-size,3px)) var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
}
`;
