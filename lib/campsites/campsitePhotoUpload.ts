import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '../supabase';

const CAMPSITE_PHOTO_BUCKET = 'ecs';
export const MAX_CAMPSITE_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_CAMPSITE_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export type CampsitePhotoUploadCandidate = {
  id: string;
  displayName: string;
  file: File;
  previewUrl?: string;
  size: number;
  type: string;
};

export type CampsitePhotoUploadResult =
  | {
      ok: true;
      storage_url: string;
      thumbnail_url: string | null;
      exif_stripped: true;
    }
  | { ok: false; error: string };

export function canUseCampsitePhotoPicker(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined' && typeof File !== 'undefined';
}

export function validateCampsitePhotoFile(file: File): string | null {
  if (!ALLOWED_CAMPSITE_PHOTO_TYPES.has(file.type.toLowerCase())) {
    return 'Only JPEG, PNG, WebP, HEIC, or HEIF images can be attached.';
  }
  if (file.size > MAX_CAMPSITE_PHOTO_BYTES) return 'Photo is too large. Maximum size is 8 MB.';
  return null;
}

async function reencodeImageWithoutMetadata(file: File, maxEdge: number, quality: number): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Photo metadata stripping is only available in the web uploader.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read image.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare image canvas.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Could not encode stripped image.'));
        },
        'image/jpeg',
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function stripCampsitePhotoMetadata(file: File): Promise<Blob> {
  return reencodeImageWithoutMetadata(file, 1600, 0.86);
}

export async function createCampsitePhotoThumbnail(file: File): Promise<Blob> {
  return reencodeImageWithoutMetadata(file, 420, 0.78);
}

function safeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'photo';
}

export async function uploadCampsitePhotoForReport({
  reportId,
  userId,
  file,
}: {
  reportId: string;
  userId?: string | null;
  file: File;
}): Promise<CampsitePhotoUploadResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Photo upload is not configured.' };

  const validation = validateCampsitePhotoFile(file);
  if (validation) return { ok: false, error: validation };

  try {
    const effectiveUserId =
      userId ??
      (await supabase.auth.getSession()).data.session?.user?.id ??
      null;
    if (!effectiveUserId) return { ok: false, error: 'Authentication is required.' };

    const stripped = await stripCampsitePhotoMetadata(file);
    const thumbnail = await createCampsitePhotoThumbnail(file);
    const safeBase = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const storagePath = [
      'campsite-reports',
      safeStorageSegment(effectiveUserId),
      safeStorageSegment(reportId),
      `${safeBase}.jpg`,
    ].join('/');
    const thumbnailPath = [
      'campsite-reports',
      safeStorageSegment(effectiveUserId),
      safeStorageSegment(reportId),
      'thumbs',
      `${safeBase}.jpg`,
    ].join('/');

    const { error } = await supabase.storage.from(CAMPSITE_PHOTO_BUCKET).upload(storagePath, stripped, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) return { ok: false, error: error.message ?? 'Photo upload failed.' };
    const thumbResult = await supabase.storage.from(CAMPSITE_PHOTO_BUCKET).upload(thumbnailPath, thumbnail, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false,
    });

    return {
      ok: true,
      storage_url: storagePath,
      thumbnail_url: thumbResult.error ? null : thumbnailPath,
      exif_stripped: true,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? 'Photo upload failed.' };
  }
}
