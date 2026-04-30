jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../src/lib/scanCard', () => ({
  invokeScanCard: jest.fn()
}));

jest.mock('../../src/lib/upload', () => ({
  uploadCardImage: jest.fn()
}));

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn()
    }
  }
}));

import { createScannerQueueStore } from '../../store/scanner';

function createTestStore(overrides: Parameters<typeof createScannerQueueStore>[0] = {}) {
  return createScannerQueueStore(overrides, {
    name: 'scanner-queue-test',
    skipHydration: true
  });
}

describe('scanner queue store', () => {
  it('enqueue adds an uploading item', () => {
    const store = createTestStore();

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });

    expect(store.getState().queue).toEqual([
      {
        id: 'lead-1',
        status: 'uploading',
        imagePath: 'file:///cache/lead-lead-1.jpg',
        rawText: 'John Doe\nAcme Corp',
        retryCount: 0
      }
    ]);
  });

  it('markUploaded advances item to parsing', () => {
    const store = createTestStore();

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });

    store.getState().markUploaded('lead-1', 'card-images/user-1/lead-1.jpg');

    expect(store.getState().queue[0]).toEqual({
      id: 'lead-1',
      status: 'parsing',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      storagePath: 'card-images/user-1/lead-1.jpg',
      rawText: 'John Doe\nAcme Corp',
      retryCount: 0
    });
  });

  it('markFailed increments retryCount and stores error', () => {
    const store = createTestStore();

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });

    store.getState().markFailed('lead-1', 'Network failed');

    expect(store.getState().queue[0]).toEqual({
      id: 'lead-1',
      status: 'failed',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp',
      retryCount: 1,
      error: 'Network failed'
    });
  });

  it('retry resets failed item to uploading and clears error', () => {
    const store = createTestStore();

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });
    store.getState().markFailed('lead-1', 'Network failed');

    store.getState().retry('lead-1');

    expect(store.getState().queue[0]).toEqual({
      id: 'lead-1',
      status: 'uploading',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp',
      retryCount: 1
    });
  });

  it('successful drainOnce completion removes item from queue', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-1.jpg');
    const invokeScanCard = jest.fn().mockResolvedValue({ parseStatus: 'parsed', parsed: {} });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const deleteImage = jest.fn().mockResolvedValue(undefined);

    const store = createTestStore({
      uploadCardImage,
      invokeScanCard,
      getSessionUserId,
      deleteImage
    });

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });

    await store.getState().drainOnce();

    expect(uploadCardImage).toHaveBeenCalledWith('file:///cache/lead-lead-1.jpg', 'lead-1');
    expect(invokeScanCard).toHaveBeenCalledWith({
      imagePath: 'card-images/user-1/lead-1.jpg',
      leadId: 'lead-1',
      rawText: 'John Doe\nAcme Corp'
    });
    expect(deleteImage).toHaveBeenCalledWith('file:///cache/lead-lead-1.jpg');
    expect(store.getState().queue).toEqual([]);
  });

  it('drainOnce skips failed items and continues with later pending work', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-2.jpg');
    const invokeScanCard = jest.fn().mockResolvedValue({ parseStatus: 'parsed', parsed: {} });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const deleteImage = jest.fn().mockResolvedValue(undefined);

    const store = createTestStore({
      uploadCardImage,
      invokeScanCard,
      getSessionUserId,
      deleteImage
    });

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'First'
    });
    store.getState().markFailed('lead-1', 'Network failed');
    store.getState().enqueue({
      id: 'lead-2',
      imagePath: 'file:///cache/lead-lead-2.jpg',
      rawText: 'Second'
    });

    await store.getState().drainOnce();

    expect(uploadCardImage).toHaveBeenCalledWith('file:///cache/lead-lead-2.jpg', 'lead-2');
    expect(invokeScanCard).toHaveBeenCalledWith({
      imagePath: 'card-images/user-1/lead-2.jpg',
      leadId: 'lead-2',
      rawText: 'Second'
    });
    expect(store.getState().queue).toEqual([
      {
        id: 'lead-1',
        status: 'failed',
        imagePath: 'file:///cache/lead-lead-1.jpg',
        rawText: 'First',
        retryCount: 1,
        error: 'Network failed'
      }
    ]);
  });
});
