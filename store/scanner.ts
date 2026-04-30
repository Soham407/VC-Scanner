import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export type QueueItemStatus = 'uploading' | 'parsing' | 'failed';

export type ScannerQueueItem = {
  id: string;
  status: QueueItemStatus;
  imagePath: string;
  storagePath?: string;
  rawText: string;
  retryCount: number;
  error?: string;
};

type EnqueueInput = {
  id: string;
  imagePath: string;
  rawText: string;
};

type ScannerQueueDeps = {
  deleteImage: (imagePath: string) => Promise<void>;
  getSessionUserId: () => Promise<string>;
  invokeScanCard: (params: { imagePath: string; leadId: string; rawText: string }) => Promise<unknown>;
  uploadCardImage: (localPath: string, leadId: string) => Promise<string>;
};

function getDefaultDeps(): ScannerQueueDeps {
  const { invokeScanCard } = require('../src/lib/scanCard') as typeof import('../src/lib/scanCard');
  const { supabase } = require('../src/lib/supabase') as typeof import('../src/lib/supabase');
  const { uploadCardImage } = require('../src/lib/upload') as typeof import('../src/lib/upload');

  return {
    deleteImage: async (imagePath) => {
      await FileSystem.deleteAsync(imagePath, { idempotent: true });
    },
    getSessionUserId: async () => {
      const { data, error } = await supabase.auth.getSession();
      const userId = data.session?.user.id;

      if (error || !userId) {
        throw new Error('Authenticated session required for background queue');
      }

      return userId;
    },
    invokeScanCard,
    uploadCardImage
  };
}

export type ScannerQueueState = {
  queue: ScannerQueueItem[];
  enqueue: (item: EnqueueInput) => void;
  markUploaded: (id: string, storagePath: string) => void;
  markFailed: (id: string, error: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  drainOnce: () => Promise<void>;
};

type ScannerQueueStoreOptions = {
  name?: string;
  skipHydration?: boolean;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Background save failed';
}

function createScannerQueueState(deps: ScannerQueueDeps) {
  return (set: (updater: (state: ScannerQueueState) => Partial<ScannerQueueState>) => void, get: () => ScannerQueueState): ScannerQueueState => ({
    queue: [],
    enqueue: (item) => {
      set((state) => ({
        queue: [
          ...state.queue,
          {
            id: item.id,
            imagePath: item.imagePath,
            rawText: item.rawText,
            retryCount: 0,
            status: 'uploading'
          }
        ]
      }));
    },
    markUploaded: (id, storagePath) => {
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? {
              ...item,
              status: 'parsing',
              storagePath,
              error: undefined
            }
            : item
        )
      }));
    },
    markFailed: (id, error) => {
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? {
              ...item,
              status: 'failed',
              retryCount: item.retryCount + 1,
              error
            }
            : item
        )
      }));
    },
    retry: (id) => {
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? {
              ...item,
              status: 'uploading',
              error: undefined
            }
            : item
        )
      }));
    },
    remove: (id) => {
      set((state) => ({
        queue: state.queue.filter((item) => item.id !== id)
      }));
    },
    drainOnce: async () => {
      const queuedItem = get().queue.find((item) => item.status !== 'failed');

      if (!queuedItem) {
        return;
      }

      try {
        if (queuedItem.status === 'uploading') {
          await deps.getSessionUserId();
          const storagePath = await deps.uploadCardImage(queuedItem.imagePath, queuedItem.id);
          get().markUploaded(queuedItem.id, storagePath);
        }

        const parsingItem = get().queue.find((item) => item.id === queuedItem.id);
        if (!parsingItem || parsingItem.status !== 'parsing') {
          return;
        }

        if (!parsingItem.storagePath) {
          throw new Error('Queue item missing storagePath');
        }

        await deps.invokeScanCard({
          imagePath: parsingItem.storagePath,
          leadId: parsingItem.id,
          rawText: parsingItem.rawText
        });

        get().remove(parsingItem.id);
        await deps.deleteImage(parsingItem.imagePath);
      } catch (error) {
        get().markFailed(queuedItem.id, getErrorMessage(error));
      }
    }
  });
}

export function createScannerQueueStore(
  overrides: Partial<ScannerQueueDeps> = {},
  options: ScannerQueueStoreOptions = {}
) {
  const deps: ScannerQueueDeps = {
    ...getDefaultDeps(),
    ...overrides
  };

  return createStore<ScannerQueueState>()(
    persist(createScannerQueueState(deps), {
      name: options.name ?? 'scanner-queue',
      skipHydration: options.skipHydration ?? false,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        queue: state.queue
      })
    })
  );
}

export const scannerQueueStore = createScannerQueueStore();

export function useScannerQueueStore<T>(selector: (state: ScannerQueueState) => T): T {
  return useStore(scannerQueueStore, selector);
}

export async function garbageCollectOrphanedQueueImages(queue: ScannerQueueItem[]): Promise<void> {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    return;
  }

  const cacheFiles = await FileSystem.readDirectoryAsync(cacheDirectory);
  const activeLeadIds = new Set(queue.map((item) => item.id));

  const deletions = cacheFiles
    .map((filename) => {
      const match = filename.match(/^lead-([a-f0-9-]+)\.jpg$/i);
      if (!match) {
        return null;
      }

      const [, leadId] = match;
      if (activeLeadIds.has(leadId)) {
        return null;
      }

      return FileSystem.deleteAsync(`${cacheDirectory}${filename}`, { idempotent: true });
    })
    .filter((operation): operation is Promise<void> => operation !== null);

  await Promise.all(deletions);
}
