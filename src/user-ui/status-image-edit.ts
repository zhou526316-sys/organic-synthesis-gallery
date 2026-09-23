import { cropUserImage } from './image-cropper';
import { prepareStatusImage } from './status-image-source';
import { originalUrl } from './status-image-storage';
import type { StatusImageStyle } from './status-image-types';

export function imageFingerprint(style: StatusImageStyle): string {
  return JSON.stringify([style.imageData, style.imageOriginal, style.imageCrop]);
}

/** No remote source is accepted: current browser's original Blob or an inline
 * synchronized preview only. Original bytes remain in the original store. */
export async function prepareCroppedStatusImage(style: StatusImageStyle, file?: File): Promise<StatusImageStyle | null> {
  let source: Blob;
  const sourcePreview = style.imageCrop?.sourcePreview || style.imageData;
  if (file) source = file;
  else {
    if (!sourcePreview || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(sourcePreview)) throw new Error('image_decode_failed');
    const url = style.imageOriginal ? await originalUrl(style.imageOriginal.id) : null;
    source = await (await fetch(url || sourcePreview)).blob();
  }
  const notice = !file && (!style.imageOriginal || source.size !== style.imageOriginal.size)
    ? '本设备只能取得同步预览，裁切清晰度受预览限制。 / Only a synced preview is available here; crop resolution is limited.' : '';
  const cropped = await cropUserImage(source, file ? undefined : style.imageCrop?.recipe, notice);
  if (!cropped) return null;
  // New upload is persisted only after Apply; cancelling never replaces state.
  const original = file ? await prepareStatusImage(file) : { imageData: sourcePreview!, imageOriginal: style.imageOriginal };
  return {
    imageData: cropped.imageData,
    imageOriginal: original.imageOriginal,
    imageCrop: { recipe: cropped.recipe, sourcePreview: original.imageData },
  };
}
