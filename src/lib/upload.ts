import { supabase } from './supabase';

const CARD_IMAGES_BUCKET = 'card-images';

export async function uploadCardImage(localPath: string, leadId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Authenticated user required for upload');
  }

  const ownerPath = `${data.user.id}/${leadId}.jpg`;

  const localImageResponse = await fetch(localPath);
  if (!localImageResponse.ok) {
    throw new Error(`Failed to read local image from path: ${localPath}`);
  }

  const imageBlob = await localImageResponse.blob();
  const { error: uploadError } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(ownerPath, imageBlob, {
    contentType: 'image/jpeg',
    upsert: false
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return `${CARD_IMAGES_BUCKET}/${ownerPath}`;
}
