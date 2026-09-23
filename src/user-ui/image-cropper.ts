export type CropMode = 'square' | 'circle' | 'free' | 'wide';
export interface CropStroke { x: number; y: number; radius: number; erase: boolean; }
export interface CropRecipe {
  x: number; y: number; width: number; height: number; mode: CropMode;
  background?: number;
  strokes?: CropStroke[];
}
export interface CroppedUserImage { imageData: string; circular: boolean; recipe: CropRecipe; }
const LIMIT = 30_000_000;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const bound = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));
const finite = (n: unknown, fallback: number): number => typeof n === 'number' && Number.isFinite(n) ? n : fallback;

/** Removes only edge-connected pixels near the dominant edge color. This is a
 * local simple-background tool, not semantic/person recognition. Enclosed
 * details remain untouched; the restore brush recovers original source pixels. */
export function removeEdgeBackground(data: ImageData, tolerance: number): void {
  const { width: w, height: h, data: pixels } = data;
  const edges: number[] = [];
  for (let x = 0; x < w; x++) { edges.push(x, (h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { edges.push(y * w, y * w + w - 1); }
  const bins = new Map<string, { count: number; rgb: number[] }>();
  for (const p of edges) {
    const i = p * 4;
    if (pixels[i + 3] < 200) continue;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = rgb.map(v => Math.round(v / 24)).join(',');
    const bin = bins.get(key) || { count: 0, rgb: [0, 0, 0] };
    bin.count++; rgb.forEach((v, j) => { bin.rgb[j] += v; }); bins.set(key, bin);
  }
  const winner = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return;
  const rgb = winner.rgb.map(v => v / winner.count);
  const eligible = (p: number): boolean => {
    const i = p * 4;
    return pixels[i + 3] < 16 || Math.max(Math.abs(pixels[i] - rgb[0]), Math.abs(pixels[i + 1] - rgb[1]), Math.abs(pixels[i + 2] - rgb[2])) <= tolerance;
  };
  if (edges.filter(eligible).length < edges.length * .55) return;
  const seen = new Uint8Array(w * h), queue = new Uint32Array(w * h);
  let head = 0, tail = 0;
  const add = (p: number): void => { if (!seen[p] && eligible(p)) { seen[p] = 1; queue[tail++] = p; } };
  edges.forEach(add);
  while (head < tail) {
    const p = queue[head++]; pixels[p * 4 + 3] = 0;
    if (p % w) add(p - 1); if (p % w < w - 1) add(p + 1);
    if (p >= w) add(p - w); if (p < w * (h - 1)) add(p + w);
  }
}

export async function cropUserImage(file: Blob, initial?: CropRecipe, sourceNotice = ''): Promise<CroppedUserImage | null> {
  if (!TYPES.has(file.type)) throw new Error('image_type_unsupported');
  if (!file.size || file.size > LIMIT) throw new Error('image_too_large');
  const zh = !document.documentElement.lang.toLowerCase().startsWith('en');
  const tr = (cn: string, en: string): string => zh ? cn : en;
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('image_decode_failed')); }, 10000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('image_decode_failed')); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('image_decode_failed');
  } catch (error) { URL.revokeObjectURL(url); throw error; }

  // Freeze exactly one decoded source frame; GIF originals are never rewritten.
  const source = document.createElement('canvas');
  const sourceScale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  source.width = Math.max(1, Math.round(image.naturalWidth * sourceScale));
  source.height = Math.max(1, Math.round(image.naturalHeight * sourceScale));
  const sourceContext = source.getContext('2d');
  if (!sourceContext) { URL.revokeObjectURL(url); throw new Error('image_preview_failed'); }
  sourceContext.drawImage(image, 0, 0, source.width, source.height);
  URL.revokeObjectURL(url);
  const W = image.naturalWidth, H = image.naturalHeight;
  let recipe: CropRecipe = { x: 0, y: 0, width: 1, height: 1, mode: 'square' };
  let strokes: CropStroke[] = (initial?.strokes || []).filter(s => [s.x, s.y, s.radius].every(Number.isFinite)).slice(0, 1024).map(s => ({ x: bound(s.x, 0, 1), y: bound(s.y, 0, 1), radius: bound(s.radius, .001, .2), erase: s.erase === true }));
  let tool: 'move' | 'erase' | 'restore' = 'move';
  let background = initial?.background === undefined ? undefined : bound(initial.background, 0, 100);

  const dialog = document.createElement('dialog');
  dialog.dataset.galleryUserCropper = 'true'; dialog.dataset.cropEditor = 'true';
  dialog.setAttribute('aria-label', tr('裁切图片', 'Crop image'));
  dialog.innerHTML = `<style>
  dialog[data-crop-editor]{box-sizing:border-box;width:min(740px,94vw);max-height:92dvh;padding:18px;border:1px solid #d6deea;border-radius:16px;color:#172033;background:#fff;font:13px/1.55 system-ui,sans-serif;overflow:auto}
  dialog[data-crop-editor]::backdrop{background:rgba(15,23,42,.55)}
  [data-crop-editor] *{box-sizing:border-box}[data-crop-editor] h3{margin:0;font-size:18px}
  [data-crop-editor] .crop-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0}
  [data-crop-editor] button,[data-crop-editor] select{font:inherit;min-height:38px;padding:6px 12px;border:1px solid #cfd8e6;border-radius:9px;background:#fff;color:#344054;cursor:pointer}
  [data-crop-editor] button[aria-pressed=true]{background:#eef3ff;border-color:#3159bd;color:#24499b}
  [data-crop-editor] button:focus-visible,[data-crop-editor] canvas:focus-visible{outline:2px solid #3159bd;outline-offset:2px}
  [data-crop-editor] .crop-surface{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:14px;align-items:center}
  [data-crop-editor] canvas[data-crop-canvas]{width:100%;max-height:340px;object-fit:contain;touch-action:none;cursor:move;border:1px solid #cfd8e6;background:#f1f5f9}
  [data-crop-editor] canvas[data-crop-preview]{display:block;max-width:100%;max-height:120px;margin:6px auto;background:repeating-conic-gradient(#e8ecf2 0% 25%,white 0% 50%) 50%/12px 12px;border:1px solid #cfd8e6}
  [data-crop-editor] .crop-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  [data-crop-editor] .crop-fields input{width:100%;min-height:34px;border:1px solid #cfd8e6;border-radius:6px;padding:4px;font:inherit}
  [data-crop-editor] .crop-help{color:#667085;font-size:12px;margin:8px 0}
  [data-crop-editor] .crop-footer{position:sticky;bottom:-18px;background:#fff;padding:10px 0 4px;display:flex;justify-content:flex-end;gap:8px}
  [data-crop-editor] [data-crop-apply]{background:#3159bd;color:white;border:0}
  @media(max-width:520px){dialog[data-crop-editor]{padding:12px}.crop-surface{grid-template-columns:minmax(0,1fr)!important}[data-crop-editor] .crop-preview-wrap{display:flex;gap:10px;align-items:center}[data-crop-editor] canvas[data-crop-preview]{max-height:70px;max-width:100px;margin:0}[data-crop-editor] .crop-fields{grid-template-columns:repeat(2,minmax(0,1fr))}[data-crop-editor] .crop-footer{bottom:-12px}}
  </style>
  <div class='crop-row'><h3>${tr('裁切图片 / 抠图', 'Crop image / cutout')}</h3><button type='button' data-crop-cancel style='margin-left:auto' aria-label='${tr('关闭', 'Close')}'>×</button></div>
  <p class='crop-help' data-crop-notice></p>
  <div class='crop-row' data-crop-modes>
    <button type='button' data-crop-mode='square'>方形 / Square</button><button type='button' data-crop-mode='circle'>圆形 / Circle</button>
    <button type='button' data-crop-mode='free'>${tr('自由矩形', 'Free rectangle')}</button><button type='button' data-crop-mode='wide'>${tr('横向 3:1', 'Wide 3:1')}</button>
    <button type='button' data-crop-all>${tr('选取整图', 'Select whole image')}</button>
  </div>
  <div class='crop-surface'><canvas data-crop-canvas tabindex='0' aria-label='${tr('拖动选区，拖动右下角调整大小；方向键移动选区', 'Drag selection or lower-right handle; arrow keys move selection')}'></canvas><div class='crop-preview-wrap'><span>${tr('保存效果', 'Saved result')}</span><canvas data-crop-preview></canvas></div></div>
  <p class='crop-help'>${tr('拖动选区移动；拖动右下角调整大小。也可输入像素坐标和尺寸。', 'Drag inside to move; drag the lower-right corner to resize. Pixel coordinates can also be entered.')}</p>
  <div class='crop-fields'>${[['x','X'],['y','Y'],['width',tr('宽','Width')],['height',tr('高','Height')]].map(([key,label]) => `<label>${label} (px)<input type='number' min='0' step='1' data-crop-field='${key}' aria-label='${label} (px)'></label>`).join('')}</div>
  <label class='crop-row'>${tr('缩放 / Zoom', 'Zoom')}<input type='range' data-crop-zoom min='1' max='8' step='.05' value='1'></label>
  <details data-crop-cutout><summary>${tr('背景处理 / 手动抠图', 'Background / manual cutout')}</summary><p class='crop-help'>${tr('“去除边缘背景”仅适合简单背景，不是 AI 人物识别。复杂背景请用擦除笔；恢复笔可补回误删区域。', 'Edge background removal works on simple backgrounds, not AI person recognition. Use Erase for complex backgrounds and Restore to recover details.')}</p>
  <div class='crop-row'><button type='button' data-crop-background>${tr('去除边缘背景', 'Remove edge background')}</button><label>${tr('容差', 'Tolerance')} <input type='range' data-crop-tolerance min='0' max='100' value='${background ?? 24}'></label><button type='button' data-crop-background-reset>${tr('恢复背景', 'Restore background')}</button></div>
  <div class='crop-row'><button type='button' data-crop-tool='move'>${tr('移动选区', 'Move selection')}</button><button type='button' data-crop-tool='erase'>${tr('擦除笔', 'Erase')}</button><button type='button' data-crop-tool='restore'>${tr('恢复笔', 'Restore')}</button><label>${tr('笔刷', 'Brush')} <input data-crop-brush type='range' min='2' max='16' value='5'></label><button type='button' data-crop-undo>${tr('撤销笔画', 'Undo stroke')}</button></div></details>
  <div class='crop-help' role='status' data-crop-message></div>
  <div class='crop-footer'><button type='button' data-crop-cancel>取消 / Cancel</button><button type='button' data-crop-apply>使用 / Apply</button></div>`;
  const q = <T extends Element = HTMLElement>(selector: string): T => dialog.querySelector<T>(selector)!;
  q('[data-crop-notice]').textContent = [sourceNotice, tr('仅保存选区结果；处理在本浏览器进行，不上传图片。', 'Only the selected area is saved; processing stays in this browser.'), file.type === 'image/gif' ? tr('GIF 裁切结果是静态图片；恢复原图后可继续播放动画。', 'A GIF crop is static; restoring the original restores animation.') : ''].filter(Boolean).join(' ');
  const canvas = q<HTMLCanvasElement>('[data-crop-canvas]'), preview = q<HTMLCanvasElement>('[data-crop-preview]');
  const ratio = Math.min(1, 600 / W, 340 / H);
  canvas.width = Math.max(1, Math.round(W * ratio)); canvas.height = Math.max(1, Math.round(H * ratio));
  const ctx = canvas.getContext('2d')!;
  const normalize = (): void => {
    recipe.width = bound(finite(recipe.width, 1), 1 / W, 1); recipe.height = bound(finite(recipe.height, 1), 1 / H, 1);
    if (recipe.mode !== 'free') {
      const aspect = recipe.mode === 'wide' ? 3 : 1;
      recipe.height = recipe.width * W / H / aspect;
      if (recipe.height > 1) { recipe.height = 1; recipe.width = H / W * aspect; }
    }
    recipe.x = bound(finite(recipe.x, 0), 0, 1 - recipe.width); recipe.y = bound(finite(recipe.y, 0), 0, 1 - recipe.height);
  };
  const choose = (mode: CropMode): void => {
    const center = { x: recipe.x + recipe.width / 2, y: recipe.y + recipe.height / 2 };
    recipe.mode = mode; normalize(); recipe.x = center.x - recipe.width / 2; recipe.y = center.y - recipe.height / 2; normalize();
  };
  choose('square');
  if (initial) {
    recipe = { x: finite(initial.x, 0), y: finite(initial.y, 0), width: finite(initial.width, 1), height: finite(initial.height, 1), mode: ['square','circle','free','wide'].includes(initial.mode) ? initial.mode : 'square' };
    normalize();
  }
  const output = (longEdge: number): HTMLCanvasElement => {
    const out = document.createElement('canvas');
    const sw = recipe.width * source.width, sh = recipe.height * source.height;
    const s = Math.min(1, longEdge / Math.max(sw, sh));
    out.width = Math.max(1, Math.round(sw * s)); out.height = Math.max(1, Math.round(sh * s));
    const c = out.getContext('2d')!;
    const paint = (): void => c.drawImage(source, recipe.x * source.width, recipe.y * source.height, sw, sh, 0, 0, out.width, out.height);
    paint();
    if (background !== undefined) { const data = c.getImageData(0, 0, out.width, out.height); removeEdgeBackground(data, background); c.putImageData(data, 0, 0); }
    for (const stroke of strokes) {
      c.save(); c.beginPath();
      c.ellipse((stroke.x - recipe.x) / recipe.width * out.width, (stroke.y - recipe.y) / recipe.height * out.height, stroke.radius / recipe.width * out.width, stroke.radius * W / H / recipe.height * out.height, 0, 0, Math.PI * 2);
      if (stroke.erase) { c.globalCompositeOperation = 'destination-out'; c.fill(); }
      else { c.clip(); paint(); }
      c.restore();
    }
    if (recipe.mode === 'circle') { c.globalCompositeOperation = 'destination-in'; c.beginPath(); c.ellipse(out.width / 2, out.height / 2, out.width / 2, out.height / 2, 0, 0, Math.PI * 2); c.fill(); }
    return out;
  };
  const refresh = (): void => {
    normalize(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const x = recipe.x * canvas.width, y = recipe.y * canvas.height, w = recipe.width * canvas.width, h = recipe.height * canvas.height;
    ctx.fillStyle = 'rgba(15,23,42,.55)'; ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height); ctx.rect(x, y, w, h); ctx.fill('evenodd');
    const result = output(384); preview.width = result.width; preview.height = result.height; preview.getContext('2d')!.drawImage(result, 0, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    if (recipe.mode === 'circle') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#3159bd'; ctx.fillRect(x + w - 7, y + h - 7, 14, 14);
    for (const key of ['x','y','width','height'] as const) q<HTMLInputElement>(`[data-crop-field='${key}']`).value = String(Math.round(recipe[key] * (key === 'x' || key === 'width' ? W : H)));
    dialog.querySelectorAll<HTMLButtonElement>('[data-crop-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cropMode === recipe.mode)));
    dialog.querySelectorAll<HTMLButtonElement>('[data-crop-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cropTool === tool)));
    canvas.style.cursor = tool === 'move' ? 'move' : 'crosshair';
  };
  const previousFocus = document.activeElement;
  document.body.append(dialog); dialog.showModal(); refresh();
  return new Promise(resolve => {
    let finished = false;
    const finish = (value: CroppedUserImage | null): void => {
      if (finished) return; finished = true; dialog.remove();
      source.width = source.height = 1;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(value);
    };
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.querySelectorAll('[data-crop-cancel]').forEach(b => b.addEventListener('click', () => finish(null)));
    dialog.querySelectorAll<HTMLButtonElement>('[data-crop-mode]').forEach(b => b.addEventListener('click', () => { choose(b.dataset.cropMode as CropMode); refresh(); }));
    q('[data-crop-all]').addEventListener('click', () => { recipe = { x: 0, y: 0, width: 1, height: 1, mode: 'free' }; q<HTMLInputElement>('[data-crop-zoom]').value = '1'; refresh(); });
    for (const key of ['x','y','width','height'] as const) q<HTMLInputElement>(`[data-crop-field='${key}']`).addEventListener('change', event => {
      recipe[key] = Number((event.currentTarget as HTMLInputElement).value) / (key === 'x' || key === 'width' ? W : H);
      if (key === 'height' && recipe.mode !== 'free') recipe.width = recipe.height * H / W * (recipe.mode === 'wide' ? 3 : 1);
      refresh();
    });
    q<HTMLInputElement>('[data-crop-zoom]').addEventListener('input', event => {
      const zoom = Number((event.target as HTMLInputElement).value), cx = recipe.x + recipe.width / 2, cy = recipe.y + recipe.height / 2;
      const aspect = recipe.mode === 'wide' ? 3 : recipe.mode === 'free' ? recipe.width * W / (recipe.height * H) : 1;
      const maxWidth = Math.min(1, H / W * aspect);
      recipe.width = maxWidth / zoom; recipe.height = recipe.width * W / H / aspect;
      recipe.x = cx - recipe.width / 2; recipe.y = cy - recipe.height / 2; refresh();
    });
    q('[data-crop-background]').addEventListener('click', () => { background = Number(q<HTMLInputElement>('[data-crop-tolerance]').value); refresh(); });
    q('[data-crop-background-reset]').addEventListener('click', () => { background = undefined; strokes = []; refresh(); });
    q<HTMLInputElement>('[data-crop-tolerance]').addEventListener('input', event => { if (background !== undefined) { background = Number((event.target as HTMLInputElement).value); refresh(); } });
    dialog.querySelectorAll<HTMLButtonElement>('[data-crop-tool]').forEach(b => b.addEventListener('click', () => { tool = b.dataset.cropTool as typeof tool; refresh(); }));
    q('[data-crop-undo]').addEventListener('click', () => { strokes.pop(); refresh(); });
    let drag: { id: number; x: number; y: number; initial: CropRecipe; resize: boolean } | null = null;
    const point = (e: PointerEvent): { x: number; y: number } => { const r = canvas.getBoundingClientRect(); return { x: bound((e.clientX - r.left) / r.width, 0, 1), y: bound((e.clientY - r.top) / r.height, 0, 1) }; };
    const brush = (p: {x:number;y:number}): void => {
      if (strokes.length >= 1024) { q('[data-crop-message]').textContent = tr('笔画已达上限，请撤销部分笔画。', 'Stroke limit reached; undo some strokes.'); return; }
      strokes.push({ x: Number(p.x.toFixed(5)), y: Number(p.y.toFixed(5)), radius: Number(q<HTMLInputElement>('[data-crop-brush]').value) / 200, erase: tool === 'erase' });
    };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || drag) return; e.preventDefault();
      const p = point(e), r = canvas.getBoundingClientRect();
      const resize = Math.hypot((p.x - recipe.x - recipe.width) * r.width, (p.y - recipe.y - recipe.height) * r.height) < 22;
      drag = { id: e.pointerId, ...p, initial: { ...recipe }, resize };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* Synthetic or cancelled pointer. */ }
      if (tool !== 'move') { brush(p); refresh(); }
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return; e.preventDefault(); const p = point(e);
      if (tool !== 'move') brush(p);
      else if (drag.resize) { recipe.width = drag.initial.width + p.x - drag.x; recipe.height = drag.initial.height + p.y - drag.y; }
      else { recipe.x = drag.initial.x + p.x - drag.x; recipe.y = drag.initial.y + p.y - drag.y; }
      refresh();
    });
    const end = (e: PointerEvent): void => { if (drag?.id !== e.pointerId) return; drag = null; try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch {} };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('keydown', e => {
      const delta = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') recipe.x -= delta / W; else if (e.key === 'ArrowRight') recipe.x += delta / W;
      else if (e.key === 'ArrowUp') recipe.y -= delta / H; else if (e.key === 'ArrowDown') recipe.y += delta / H; else return;
      e.preventDefault(); refresh();
    });
    q('[data-crop-apply]').addEventListener('click', () => {
      try { const out = output(512); finish({ imageData: out.toDataURL('image/png'), circular: recipe.mode === 'circle', recipe: { ...recipe, background, strokes } }); }
      catch { q('[data-crop-message]').textContent = tr('裁切导出失败，原设置未改变。', 'Crop export failed; previous settings kept.'); }
    });
  });
}
