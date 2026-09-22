import { MAX_STATUS_IMAGE_BYTES, type StatusImageStyle } from './status-image-types';
import { writeOriginal, refreshOriginal } from './status-image-storage';
function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.src = ''; reject(new Error('image_decode_failed')); }, 15000);
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error('image_decode_failed')); };
    image.src = url;
  });
}

function signatureType(bytes: Uint8Array): string {
  const ascii = (start: number, end: number): string => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return '';
}

export async function prepareStatusImage(file: File): Promise<Required<StatusImageStyle>> {
  if (!file.size) throw new Error('image_decode_failed');
  if (file.size > MAX_STATUS_IMAGE_BYTES) throw new Error('image_too_large');
  const type = signatureType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type || (file.type && file.type !== type)) throw new Error('image_type_unsupported');
  const blob = file.slice(0, file.size, type);
  const temporary = URL.createObjectURL(blob);
  let imageData: string;
  try {
    const image = await decodeImage(temporary);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('image_decode_failed');
    const scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('image_decode_failed');
    // Preview only: original bytes and all animation frames remain untouched.
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    imageData = canvas.toDataURL('image/png');
    if (imageData.length > 100_000) throw new Error('image_preview_failed');
  } finally { URL.revokeObjectURL(temporary); }
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  await writeOriginal(id, blob); // Commit before publishing the preference reference.
  refreshOriginal(id);
  return { imageData, imageOriginal: { id, name: file.name.slice(0, 180), type, size: file.size } };
}
