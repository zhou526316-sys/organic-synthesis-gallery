import { originalUrl } from './status-image-storage';
import type { StatusImageStyle } from './status-image-types';
export { prepareStatusImage } from './status-image-source';
export type { OriginalStatusImage } from './status-image-types';
const ID_PATTERN = /^[a-f0-9]{64}$/;
const hydrationJobs = new WeakMap<HTMLImageElement, object>();
const readyImages = new Map<string, Promise<void>>();

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Both load and decode are valid image-readiness signals. Do not leave a
 * displayed preview waiting indefinitely on decode(), or re-decode the same
 * local original once per card on every global preference change. */
function validateOriginal(url: string): Promise<void> {
  const cached = readyImages.get(url);
  if (cached) return cached;
  const pending = new Promise<void>((resolve, reject) => {
    const original = new Image();
    let settled = false;
    const finish = (valid: boolean): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      original.onload = null;
      original.onerror = null;
      if (valid && original.naturalWidth > 0 && original.naturalHeight > 0) resolve();
      else reject(new Error('image_decode_failed'));
    };
    const timer = window.setTimeout(() => finish(false), 8000);
    original.onload = () => finish(true);
    original.onerror = () => finish(false);
    original.src = url;
    void original.decode().then(() => finish(true), () => {
      // An error event is authoritative; a decode rejection alone can also
      // describe a superseded decode task. Keep the bounded load/error path.
    });
  });
  if (readyImages.size >= 32) readyImages.delete(readyImages.keys().next().value!);
  readyImages.set(url, pending);
  void pending.catch(() => { if (readyImages.get(url) === pending) readyImages.delete(url); });
  return pending;
}

export function statusImageTag(style: StatusImageStyle, className: string, label: string): string {
  if (!style.imageData) return '';
  const id = style.imageCrop ? undefined : style.imageOriginal?.id;
  // A crop remains the selected display even when an original is retained.
  return `<img class='${className}' src='${escape(style.imageData)}' data-image-source='${style.imageCrop ? 'crop' : 'preview'}' ${id && ID_PATTERN.test(id) ? `data-status-asset='${id}' data-original-state='pending'` : ''} alt='${escape(label)}' title='${escape(label)}'>`;
}

function hydrateImage(image: HTMLImageElement, resolved?: (original: boolean) => void): void {
  const id = image.dataset.statusAsset || '';
  const preview = image.getAttribute('src') || '';
  const job = {};
  hydrationJobs.set(image, job);
  const current = (): boolean => image.isConnected && image.dataset.statusAsset === id && hydrationJobs.get(image) === job;
  void (async () => {
    const url = await originalUrl(id);
    if (!current()) return;
    if (url) {
      // Never replace a preview with an undecodable original; validation is
      // shared but the current-element/job guard remains independent.
      await validateOriginal(url);
      if (!current()) return;
      image.src = url;
      image.dataset.imageSource = 'original';
      image.dataset.originalState = 'available';
      resolved?.(true);
    } else {
      image.dataset.originalState = 'unavailable';
      resolved?.(false);
    }
  })().catch(() => {
    if (!current()) return;
    image.src = preview;
    image.dataset.imageSource = 'preview';
    image.dataset.originalState = 'unavailable';
    resolved?.(false);
  });
}

export function hydrateStatusImages(root: ShadowRoot): void {
  root.querySelectorAll<HTMLImageElement>('img[data-status-asset]').forEach(image => hydrateImage(image));
}

export function statusImageError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  console.warn('status-image-error', error instanceof Error ? error.name : 'UnknownError', code);
  if (code === 'image_too_large') return '图片超过 30 MB（30,000,000 字节），原标记未改变。 / Maximum 30 MB; previous image kept.';
  if (code === 'image_type_unsupported') return '请选择 PNG、JPG、WebP 或 GIF 原图；文件内容须与格式一致。 / Choose a valid PNG, JPG, WebP or GIF.';
  if (code === 'image_decode_failed' || code === 'image_preview_failed') return '图片无法解码，原标记未改变。 / Image cannot be decoded; previous image kept.';
  return '原图未能保存，请检查浏览器存储空间或隐私设置；原标记未改变。 / Could not save the original; check browser storage or privacy settings. Previous image kept.';
}

export async function viewStatusImage(style: StatusImageStyle): Promise<void> {
  if (!style.imageData) return;
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.dataset.galleryUserCropper = 'true';
  dialog.dataset.statusImageViewer = 'true';
  dialog.setAttribute('aria-label', '状态图片 / Status image');
  Object.assign(dialog.style, { width: 'min(900px, 90vw)', maxHeight: '82dvh', padding: '16px', border: '1px solid #d7deea', borderRadius: '16px' });
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭 / Close';
  close.addEventListener('click', () => dialog.close());
  const message = document.createElement('p');
  const unavailable = '此浏览器无可用原图，显示同步预览（GIF 为静态预览）。 / Original unavailable here; showing synced preview (GIF is static).';
  const id = style.imageCrop ? undefined : style.imageOriginal?.id;
  const hasOriginal = Boolean(id && ID_PATTERN.test(id));
  message.textContent = hasOriginal
    ? '先显示预览，正在读取本地原图… / Showing preview while loading the local original…'
    : style.imageCrop ? '裁切结果（静态）· 原图保留，可恢复 / Static crop · original retained and restorable' : unavailable;
  const image = document.createElement('img');
  image.src = style.imageData;
  image.dataset.imageSource = style.imageCrop ? 'crop' : 'preview';
  if (hasOriginal) {
    image.dataset.statusAsset = id!;
    image.dataset.originalState = 'pending';
  }
  image.alt = style.imageOriginal?.name || '状态图片 / Status image';
  Object.assign(image.style, { display: 'block', maxWidth: '100%', maxHeight: '65dvh', objectFit: 'contain', margin: '12px auto' });
  dialog.append(close, message, image);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
  if (hasOriginal) hydrateImage(image, original => {
    if (!dialog.open) return;
    message.textContent = original ? '原图 · 仅当前浏览器保存 / Original · stored in this browser' : unavailable;
  });
}
