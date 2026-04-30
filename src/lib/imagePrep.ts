import * as FileSystem from 'expo-file-system/legacy';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

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

export async function prepareImage(uri: string): Promise<{ cachePath: string }> {
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('Cache directory unavailable');
  }

  const manipulatedImage = await manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.8,
      format: SaveFormat.JPEG
    }
  );

  const cachePath = `${cacheDirectory}image-${createUuid()}.jpg`;

  await FileSystem.copyAsync({
    from: manipulatedImage.uri,
    to: cachePath
  });

  return { cachePath };
}
