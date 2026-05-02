import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from './supabase';

const CARD_IMAGES_BUCKET = 'card-images';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = globalThis.atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
}

export async function uploadCardImage(localPath: string, leadId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Authenticated user required for upload');
  }

  const ownerPath = `${data.user.id}/${leadId}.jpg`;

  const base64Image = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64
  });

  if (!base64Image) {
    throw new Error(`Failed to read local image from path: ${localPath}`);
  }

  const imageBytes = base64ToUint8Array(base64Image);
  const imageBuffer = imageBytes.buffer.slice(
    imageBytes.byteOffset,
    imageBytes.byteOffset + imageBytes.byteLength
  ) as ArrayBuffer;
  const { error: uploadError } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(ownerPath, imageBuffer, {
    contentType: 'image/jpeg',
    upsert: false
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return `${CARD_IMAGES_BUCKET}/${ownerPath}`;
}
