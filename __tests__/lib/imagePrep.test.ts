import * as FileSystem from 'expo-file-system/legacy';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { prepareImage } from '../../src/lib/imagePrep';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {
    JPEG: 'jpeg'
  },
  manipulateAsync: jest.fn()
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn()
}));

describe('prepareImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resizes to width 1200, writes jpeg to cache directory, and returns cache path', async () => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5);

    (manipulateAsync as jest.Mock).mockResolvedValue({
      height: 1200,
      uri: 'file:///tmp/prepared.jpg',
      width: 900
    });

    const result = await prepareImage('file:///tmp/input.jpg');

    expect(manipulateAsync).toHaveBeenCalledWith(
      'file:///tmp/input.jpg',
      [{ resize: { width: 1200 } }],
      {
        compress: 0.8,
        format: SaveFormat.JPEG
      }
    );

    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/prepared.jpg',
      to: expect.stringMatching(/^file:\/\/\/cache\/image-[a-f0-9-]+\.jpg$/)
    });

    expect(result.cachePath).toMatch(/^file:\/\/\/cache\/image-[a-f0-9-]+\.jpg$/);
  });

  it('crops before resizing when a crop region is provided', async () => {
    (manipulateAsync as jest.Mock).mockResolvedValue({
      height: 900,
      uri: 'file:///tmp/prepared.jpg',
      width: 1200
    });

    await prepareImage('file:///tmp/input.jpg', 'lead-1', {
      height: 700,
      originX: 100,
      originY: 80,
      width: 420
    });

    expect(manipulateAsync).toHaveBeenCalledWith(
      'file:///tmp/input.jpg',
      [
        { crop: { height: 700, originX: 100, originY: 80, width: 420 } },
        { resize: { width: 1200 } }
      ],
      {
        compress: 0.8,
        format: SaveFormat.JPEG
      }
    );
  });

  it('throws when cache directory is unavailable', async () => {
    const originalCacheDirectory = FileSystem.cacheDirectory;
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: null
    });

    await expect(prepareImage('file:///tmp/input.jpg')).rejects.toThrow('Cache directory unavailable');

    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: originalCacheDirectory
    });
  });
});
