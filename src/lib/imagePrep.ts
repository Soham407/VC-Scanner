import * as FileSystem from 'expo-file-system/legacy';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

export type ImageCropRegion = {
  height: number;
  originX: number;
  originY: number;
  width: number;
};

function createUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto);
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function prepareImage(uri: string, leadId?: string, cropRegion?: ImageCropRegion | null): Promise<{ cachePath: string }> {
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('Cache directory unavailable');
  }

  const manipulatedImage = await manipulateAsync(
    uri,
    [
      ...(cropRegion ? [{ crop: cropRegion }] : []),
      { resize: { width: 1200 } }
    ],
    {
      compress: 0.8,
      format: SaveFormat.JPEG
    }
  );

  const cacheFileName = leadId ? `lead-${leadId}.jpg` : `image-${createUuid()}.jpg`;
  const cachePath = `${cacheDirectory}${cacheFileName}`;

  await FileSystem.copyAsync({
    from: manipulatedImage.uri,
    to: cachePath
  });

  return { cachePath };
}
