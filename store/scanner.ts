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
  nextAttemptAt?: number;
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

const RETRY_BACKOFF_MS = [1_000, 4_000, 16_000] as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return 'Background save failed';
}

function getStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const errorObject = error as {
    status?: unknown;
    statusCode?: unknown;
    context?: {
      status?: unknown;
      statusCode?: unknown;
    };
  };

  const candidates = [
    errorObject.status,
    errorObject.statusCode,
    errorObject.context?.status,
    errorObject.context?.statusCode
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const parsed = Number.parseInt(candidate, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isRetryableError(error: unknown): boolean {
  const status = getStatusCode(error);
  if (status !== null) {
    if (status >= 500) {
      return true;
    }

    if (status >= 400) {
      return false;
    }
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown }).name;
    if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') {
      return true;
    }
  }

  const normalizedMessage = getErrorMessage(error).toLowerCase();
  if (normalizedMessage.includes('network request failed')) {
    return true;
  }
  if (normalizedMessage.includes('failed to fetch')) {
    return true;
  }
  if (normalizedMessage.includes('failed to send a request')) {
    return true;
  }
  if (normalizedMessage.includes('timeout')) {
    return true;
  }
  if (normalizedMessage.includes('timed out')) {
    return true;
  }

  return false;
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
              nextAttemptAt: undefined,
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
              nextAttemptAt: undefined,
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
              storagePath: undefined,
              retryCount: 0,
              nextAttemptAt: undefined,
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
      const now = Date.now();
      const queuedItem = get().queue.find(
        (item) =>
          item.status !== 'failed' &&
          (typeof item.nextAttemptAt !== 'number' || item.nextAttemptAt <= now)
      );

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
        const currentItem = get().queue.find((item) => item.id === queuedItem.id);
        if (!currentItem) {
          return;
        }

        const errorMessage = getErrorMessage(error);

        if (!isRetryableError(error)) {
          get().markFailed(currentItem.id, errorMessage);
          return;
        }

        const backoffMs = RETRY_BACKOFF_MS[currentItem.retryCount];
        if (typeof backoffMs !== 'number') {
          get().markFailed(currentItem.id, errorMessage);
          return;
        }

        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === currentItem.id
              ? {
                ...item,
                retryCount: item.retryCount + 1,
                nextAttemptAt: Date.now() + backoffMs,
                error: errorMessage
              }
              : item
          )
        }));
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
