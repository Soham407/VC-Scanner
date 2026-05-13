jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn()
    }
  }
}));

import { createScanPipeline, type ScanQueueItem } from '../../src/lib/scanPipeline';

function createApi(initialQueue: ScanQueueItem[]) {
  let queue = initialQueue;

  return {
    getQueue: () => queue,
    markFailed: jest.fn(),
    markUploaded: jest.fn((id: string, storagePath: string) => {
      queue = queue.map((item) =>
        item.id === id
          ? {
            ...item,
            error: undefined,
            nextAttemptAt: undefined,
            status: 'parsing',
            storagePath
          }
          : item
      );
    }),
    recordHistory: jest.fn(),
    remove: jest.fn((id: string) => {
      queue = queue.filter((item) => item.id !== id);
    }),
    updateQueue: jest.fn((updater: (items: ScanQueueItem[]) => ScanQueueItem[]) => {
      queue = updater(queue);
    })
  };
}

describe('scanPipeline', () => {
  it('processes a scan end-to-end', async () => {
    const api = createApi([
      {
        teamId: 'team-1',
        id: 'lead-1',
        imagePath: 'file:///cache/lead-1.jpg',
        rawText: 'Ada Lovelace',
        retryCount: 0,
        status: 'uploading'
      }
    ]);

    const pipeline = createScanPipeline({
      archiveImage: jest.fn().mockResolvedValue('file:///history/lead-1.jpg'),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      getSessionUserId: jest.fn().mockResolvedValue('user-1'),
      invokeScanCard: jest.fn().mockResolvedValue({
        parseStatus: 'parsed',
        parsed: {
          address: null,
          companyName: 'Acme',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          jobTitle: 'Engineer',
          productServices: 'Automation systems',
          phoneNumber: null
        }
      }),
      uploadCardImage: jest.fn().mockResolvedValue('card-images/user-1/lead-1.jpg')
    });

    await pipeline.drainOnce(api);

    expect(api.markUploaded).toHaveBeenCalledWith('lead-1', 'card-images/user-1/lead-1.jpg');
    expect(api.recordHistory).toHaveBeenCalledWith({
      id: 'lead-1',
      imagePath: 'file:///history/lead-1.jpg',
      parsed: {
        address: null,
        companyName: 'Acme',
        email: 'ada@example.com',
        fullName: 'Ada Lovelace',
        jobTitle: 'Engineer',
        productServices: 'Automation systems',
        phoneNumber: null
      },
      parseStatus: 'parsed',
      rawText: 'Ada Lovelace',
      storagePath: 'card-images/user-1/lead-1.jpg'
    });
    expect(api.remove).toHaveBeenCalledWith('lead-1');
    expect(api.getQueue()).toEqual([]);
  });

  it('schedules a retry for retryable failures', async () => {
    const api = createApi([
      {
        teamId: null,
        id: 'lead-1',
        imagePath: 'file:///cache/lead-1.jpg',
        rawText: 'Ada Lovelace',
        retryCount: 0,
        status: 'uploading'
      }
    ]);

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const pipeline = createScanPipeline({
      archiveImage: jest.fn(),
      deleteImage: jest.fn(),
      getSessionUserId: jest.fn().mockResolvedValue('user-1'),
      invokeScanCard: jest.fn().mockRejectedValue({ message: 'Edge function 500', status: 500 }),
      uploadCardImage: jest.fn().mockResolvedValue('card-images/user-1/lead-1.jpg')
    });

    await pipeline.drainOnce(api);

    expect(api.updateQueue).toHaveBeenCalledTimes(1);
    expect(api.getQueue()[0]).toMatchObject({
      nextAttemptAt: 2_000,
      retryCount: 1,
      status: 'parsing'
    });

    nowSpy.mockRestore();
  });
});
