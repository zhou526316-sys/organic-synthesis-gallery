import type { CropRecipe } from './image-cropper';
export const MAX_STATUS_IMAGE_BYTES = 30_000_000;
export const STATUS_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export interface OriginalStatusImage { id: string; name: string; type: string; size: number; }
export interface StatusImageCrop { recipe: CropRecipe; sourcePreview: string; }
export interface StatusImageStyle { imageData?: string; imageOriginal?: OriginalStatusImage; imageCrop?: StatusImageCrop; }
