import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const CARD_IMAGES_BUCKET = 'card-images';

function normalizeStoragePath(path: string): string {
  return path.startsWith(`${CARD_IMAGES_BUCKET}/`) ? path.slice(CARD_IMAGES_BUCKET.length + 1) : path;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoder unavailable');
  }

  const binary = globalThis.atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

export async function uploadCardImage(localPath: string, leadId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Authenticated user required for upload');
  }

  const ownerPath = `${data.user.id}/${leadId}.jpg`;
  const imageBase64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64
  });
  const imageBytes = base64ToArrayBuffer(imageBase64);
  const { error: uploadError } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(ownerPath, imageBytes, {
    contentType: 'image/jpeg',
    upsert: false
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return `${CARD_IMAGES_BUCKET}/${ownerPath}`;
}

export async function deleteCardImages(storagePaths: string[]): Promise<void> {
  const normalizedPaths = storagePaths
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .map(normalizeStoragePath);

  if (normalizedPaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(CARD_IMAGES_BUCKET).remove(normalizedPaths);
  if (error) {
    throw new Error(error.message);
  }
}
