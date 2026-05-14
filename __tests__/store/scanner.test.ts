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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createScannerQueueStore,
  scannerQueueStore,
  syncScannerQueueStoreNamespace
} from '../../store/scanner';

function createTestStore(overrides: Parameters<typeof createScannerQueueStore>[0] = {}) {
  return createScannerQueueStore(overrides, {
    name: 'scanner-queue-test',
    skipHydration: true
  });
}

describe('scanner queue store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await syncScannerQueueStoreNamespace(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function flushPersistedState(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

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

  it('keeps persisted queue and history isolated by signed-in user namespace', async () => {
    await syncScannerQueueStoreNamespace('user-1');
    scannerQueueStore.getState().enqueue({
      id: 'lead-user-1',
      imagePath: 'file:///cache/lead-user-1.jpg',
      rawText: 'User one'
    });
    await flushPersistedState();

    await syncScannerQueueStoreNamespace('user-2');
    expect(scannerQueueStore.getState().queue).toEqual([]);

    scannerQueueStore.getState().enqueue({
      id: 'lead-user-2',
      imagePath: 'file:///cache/lead-user-2.jpg',
      rawText: 'User two'
    });
    await flushPersistedState();

    await syncScannerQueueStoreNamespace('user-1');
    expect(scannerQueueStore.getState().queue).toMatchObject([
      {
        id: 'lead-user-1',
        status: 'uploading'
      }
    ]);

    await syncScannerQueueStoreNamespace('user-2');
    expect(scannerQueueStore.getState().queue).toMatchObject([
      {
        id: 'lead-user-2',
        status: 'uploading'
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

  it('markFailed stores error details on the item', () => {
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
      retryCount: 0,
      error: 'Network failed'
    });
  });

it('retry resets failed item to uploading, clears error, and resets retryCount to 0', () => {
    const store = createTestStore();

    store.getState().enqueue({
      id: 'lead-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });

    store.setState((state) => ({
      queue: [
        {
          ...state.queue[0],
          error: 'Network failed',
          retryCount: 3,
          status: 'failed',
          storagePath: 'card-images/user-1/lead-1.jpg'
        }
      ]
    }));

    store.getState().retry('lead-1');

    expect(store.getState().queue[0]).toEqual({
      id: 'lead-1',
      status: 'parsing',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp',
      retryCount: 0,
      storagePath: 'card-images/user-1/lead-1.jpg'
    });
  });

  it('successful drainOnce completion removes item from queue', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-1.jpg');
    const invokeScanCard = jest.fn().mockResolvedValue({ parseStatus: 'parsed', parsed: {} });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const archiveImage = jest.fn().mockResolvedValue('file:///documents/history/lead-1.jpg');
    const deleteImage = jest.fn().mockResolvedValue(undefined);

    const store = createTestStore({
      archiveImage,
      uploadCardImage,
      invokeScanCard,
      getSessionUserId,
      deleteImage
    });

    store.getState().enqueue({
      id: 'lead-1',
      teamId: 'team-1',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      rawText: 'John Doe\nAcme Corp'
    });

    await store.getState().drainOnce();

    expect(uploadCardImage).toHaveBeenCalledWith('file:///cache/lead-lead-1.jpg', 'lead-1');
    expect(invokeScanCard).toHaveBeenCalledWith({
      teamId: 'team-1',
      imagePath: 'card-images/user-1/lead-1.jpg',
      leadId: 'lead-1',
      rawText: 'John Doe\nAcme Corp'
    });
    expect(archiveImage).toHaveBeenCalledWith('file:///cache/lead-lead-1.jpg', 'lead-1');
    expect(deleteImage).toHaveBeenCalledWith('file:///cache/lead-lead-1.jpg');
    expect(store.getState().queue).toEqual([]);
    expect(store.getState().history).toEqual([
      {
        id: 'lead-1',
        imagePath: 'file:///documents/history/lead-1.jpg',
        parsed: {},
        parseStatus: 'parsed',
        rawText: 'John Doe\nAcme Corp',
        savedAt: expect.any(Number),
        storagePath: 'card-images/user-1/lead-1.jpg'
      }
    ]);
    expect(store.getState().systemNotice).toEqual({
      kind: 'success',
      title: 'Saved',
      message: 'Scan saved to cloud',
      createdAt: expect.any(Number)
    });
  });

  it('drainOnce retries retryable failures with per-item backoff and fails after the 3rd retry', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-1.jpg');
    const invokeScanCard = jest
      .fn()
      .mockRejectedValue({ message: 'Edge function 500', status: 500 });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const deleteImage = jest.fn().mockResolvedValue(undefined);
    const archiveImage = jest.fn().mockResolvedValue('file:///documents/history/lead-1.jpg');

    const store = createTestStore({
      archiveImage,
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

    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await store.getState().drainOnce();
    expect(store.getState().queue[0]).toMatchObject({
      id: 'lead-1',
      retryCount: 1,
      status: 'parsing',
      nextAttemptAt: 2_000
    });

    nowSpy.mockReturnValue(1_500);
    await store.getState().drainOnce();
    expect(invokeScanCard).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(2_000);
    await store.getState().drainOnce();
    expect(store.getState().queue[0]).toMatchObject({
      retryCount: 2,
      status: 'parsing',
      nextAttemptAt: 6_000
    });

    nowSpy.mockReturnValue(6_000);
    await store.getState().drainOnce();
    expect(store.getState().queue[0]).toMatchObject({
      retryCount: 3,
      status: 'parsing',
      nextAttemptAt: 22_000
    });

    nowSpy.mockReturnValue(22_000);
    await store.getState().drainOnce();

    expect(invokeScanCard).toHaveBeenCalledTimes(4);
    expect(store.getState().queue[0]).toMatchObject({
      error: 'Edge function 500',
      retryCount: 3,
      status: 'failed'
    });
    expect(store.getState().systemNotice).toEqual({
      kind: 'error',
      title: 'Save failed',
      message: 'Edge function 500',
      createdAt: expect.any(Number)
    });
  });

  it('drainOnce fails immediately on non-retryable 4xx-style errors', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-1.jpg');
    const invokeScanCard = jest.fn().mockRejectedValue({ message: 'Unauthorized', status: 401 });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const deleteImage = jest.fn().mockResolvedValue(undefined);
    const archiveImage = jest.fn().mockResolvedValue('file:///documents/history/lead-1.jpg');

    const store = createTestStore({
      archiveImage,
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

    expect(invokeScanCard).toHaveBeenCalledTimes(1);
    expect(store.getState().queue[0]).toEqual({
      id: 'lead-1',
      status: 'failed',
      imagePath: 'file:///cache/lead-lead-1.jpg',
      storagePath: 'card-images/user-1/lead-1.jpg',
      rawText: 'John Doe\nAcme Corp',
      retryCount: 0,
      error: 'Unauthorized'
    });
  });

  it('drainOnce skips backoff-delayed items and processes the next actionable item', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-2.jpg');
    const invokeScanCard = jest.fn().mockResolvedValue({ parseStatus: 'parsed', parsed: {} });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const archiveImage = jest.fn().mockResolvedValue('file:///documents/history/lead-2.jpg');
    const deleteImage = jest.fn().mockResolvedValue(undefined);

    const store = createTestStore({
      archiveImage,
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
    store.getState().markUploaded('lead-1', 'card-images/user-1/lead-1.jpg');
    store.setState((state) => ({
      queue: state.queue.map((item) =>
        item.id === 'lead-1'
          ? {
            ...item,
            nextAttemptAt: 10_000,
            retryCount: 1
          }
          : item
      )
    }));
    store.getState().enqueue({
      id: 'lead-2',
      imagePath: 'file:///cache/lead-lead-2.jpg',
      rawText: 'Second'
    });

    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await store.getState().drainOnce();

    expect(uploadCardImage).toHaveBeenCalledWith('file:///cache/lead-lead-2.jpg', 'lead-2');
    expect(invokeScanCard).toHaveBeenCalledWith({
      teamId: null,
      imagePath: 'card-images/user-1/lead-2.jpg',
      leadId: 'lead-2',
      rawText: 'Second'
    });
    expect(store.getState().queue).toEqual([
      {
        id: 'lead-1',
        status: 'parsing',
        imagePath: 'file:///cache/lead-lead-1.jpg',
        storagePath: 'card-images/user-1/lead-1.jpg',
        rawText: 'First',
        retryCount: 1,
        nextAttemptAt: 10_000
      }
    ]);
  });

  it('drainOnce skips failed items and continues with later pending work', async () => {
    const uploadCardImage = jest.fn().mockResolvedValue('card-images/user-1/lead-2.jpg');
    const invokeScanCard = jest.fn().mockResolvedValue({ parseStatus: 'parsed', parsed: {} });
    const getSessionUserId = jest.fn().mockResolvedValue('user-1');
    const archiveImage = jest.fn().mockResolvedValue('file:///documents/history/lead-2.jpg');
    const deleteImage = jest.fn().mockResolvedValue(undefined);

    const store = createTestStore({
      archiveImage,
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
      teamId: null,
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
        retryCount: 0,
        error: 'Network failed'
      }
    ]);
  });
});
