import * as FileSystem from 'expo-file-system/legacy';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

export type ImageCropRegion = {
  height: number;
  originX: number;
  originY: number;
  width: number;
};

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

  const cacheFileName = leadId ? `lead-${leadId}.jpg` : `image-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  const cachePath = `${cacheDirectory}${cacheFileName}`;

  await FileSystem.copyAsync({
    from: manipulatedImage.uri,
    to: cachePath
  });

  return { cachePath };
}
