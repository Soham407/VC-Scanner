import { uploadCardImage } from '../../src/lib/upload';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    },
    storage: {
      from: jest.fn()
    }
  }
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: {
    Base64: 'base64'
  },
  readAsStringAsync: jest.fn()
}));

import * as FileSystem from 'expo-file-system/legacy';

describe('uploadCardImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads to owner scoped path with upsert disabled and returns storage path', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('ZmFrZS1pbWFnZQ==');

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const upload = jest.fn().mockResolvedValue({ data: { path: 'user-123/lead-456.jpg' }, error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    const storagePath = await uploadCardImage('file:///cache/prepared.jpg', 'lead-456');

    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///cache/prepared.jpg', {
      encoding: 'base64'
    });
    expect(supabase.storage.from).toHaveBeenCalledWith('card-images');
    expect(upload).toHaveBeenCalledWith('user-123/lead-456.jpg', expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false
    });
    expect(storagePath).toBe('card-images/user-123/lead-456.jpg');
  });

  it('throws when no authenticated user is available', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null
    });

    await expect(uploadCardImage('file:///cache/prepared.jpg', 'lead-456')).rejects.toThrow(
      'Authenticated user required for upload'
    );
  });
});
