import { originalUrl } from './status-image-storage';
import type { StatusImageStyle } from './status-image-types';
export { prepareStatusImage } from './status-image-source';
export type { OriginalStatusImage } from './status-image-types';
const ID_PATTERN = /^[a-f0-9]{64}$/;

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function statusImageTag(style: StatusImageStyle, className: string, label: string): string {
  if (!style.imageData) return '';
  const id = style.imageOriginal?.id;
  return `<img class='${className}' src='${escape(style.imageData)}' ${id && ID_PATTERN.test(id) ? `data-status-asset='${id}'` : ''} alt='${escape(label)}' title='${escape(label)}'>`;
}

export function hydrateStatusImages(root: ShadowRoot): void {
  root.querySelectorAll<HTMLImageElement>('img[data-status-asset]').forEach(image => {
    const id = image.dataset.statusAsset || '';
    void originalUrl(id).then(url => {
      if (!image.isConnected || image.dataset.statusAsset !== id) return;
      image.dataset.imageSource = url ? 'original' : 'preview';
      if (url) image.src = url;
    });
  });
}

export function statusImageError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'image_too_large') return '图片超过 30 MB（30,000,000 字节），原标记未改变。 / Maximum 30 MB; previous image kept.';
  if (code === 'image_type_unsupported') return '请选择 PNG、JPG、WebP 或 GIF 原图；文件内容须与格式一致。 / Choose a valid PNG, JPG, WebP or GIF.';
  if (code === 'image_decode_failed' || code === 'image_preview_failed') return '图片无法解码，原标记未改变。 / Image cannot be decoded; previous image kept.';
  return '原图未能保存，请检查浏览器存储空间或隐私设置；原标记未改变。 / Could not save the original; check browser storage or privacy settings. Previous image kept.';
}

export async function viewStatusImage(style: StatusImageStyle): Promise<void> {
  const url = style.imageOriginal?.id ? await originalUrl(style.imageOriginal.id) : null;
  const source = url || style.imageData;
  if (!source) return;
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
  message.textContent = url ? '原图 · 仅当前浏览器保存 / Original · stored in this browser' : '此浏览器无原图，显示同步预览（GIF 为静态预览）。 / Original unavailable here; showing synced preview (GIF is static).';
  const image = document.createElement('img');
  image.src = source;
  image.alt = style.imageOriginal?.name || '状态图片 / Status image';
  Object.assign(image.style, { display: 'block', maxWidth: '100%', maxHeight: '65dvh', objectFit: 'contain', margin: '12px auto' });
  dialog.append(close, message, image);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
}
