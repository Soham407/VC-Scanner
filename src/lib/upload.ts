import { supabase } from './supabase';

const CARD_IMAGES_BUCKET = 'card-images';

function normalizeStoragePath(path: string): string {
  return path.startsWith(`${CARD_IMAGES_BUCKET}/`) ? path.slice(CARD_IMAGES_BUCKET.length + 1) : path;
}

export async function uploadCardImage(localPath: string, leadId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Authenticated user required for upload');
  }

  const ownerPath = `${data.user.id}/${leadId}.jpg`;
  const imageResponse = await fetch(localPath);
  if (!imageResponse.ok) {
    throw new Error(`Failed to read local image from path: ${localPath}`);
  }

  const imageBlob = await imageResponse.blob();
  const { error: uploadError } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(ownerPath, imageBlob, {
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
