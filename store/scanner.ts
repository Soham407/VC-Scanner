import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import type { InvokeScanCardResponse } from '../src/lib/scanCard';

export type QueueItemStatus = 'uploading' | 'parsing' | 'failed';

export type ScannerQueueItem = {
  id: string;
  status: QueueItemStatus;
  imagePath: string;
  boothId?: string | null;
  storagePath?: string;
  rawText: string;
  retryCount: number;
  nextAttemptAt?: number;
  error?: string;
};

export type ScannerHistoryItem = {
  id: string;
  imagePath: string;
  storagePath: string;
  rawText: string;
  parseStatus: InvokeScanCardResponse['parseStatus'];
  parsed: InvokeScanCardResponse['parsed'];
  savedAt: number;
};

export type SystemNotice = {
  kind: 'success' | 'error';
  title: string;
  message: string;
  createdAt: number;
};

type EnqueueInput = {
  id: string;
  imagePath: string;
  rawText: string;
  boothId?: string | null;
};

type ScannerQueueDeps = {
  archiveImage: (imagePath: string, leadId: string) => Promise<string>;
  deleteImage: (imagePath: string) => Promise<void>;
  getSessionUserId: () => Promise<string>;
  invokeScanCard: (params: { imagePath: string; leadId: string; rawText: string; boothId?: string | null }) => Promise<InvokeScanCardResponse>;
  uploadCardImage: (localPath: string, leadId: string) => Promise<string>;
};

function getDefaultDeps(): ScannerQueueDeps {
  const { invokeScanCard } = require('../src/lib/scanCard') as typeof import('../src/lib/scanCard');
  const { supabase } = require('../src/lib/supabase') as typeof import('../src/lib/supabase');
  const { uploadCardImage } = require('../src/lib/upload') as typeof import('../src/lib/upload');

  return {
    archiveImage: async (imagePath, leadId) => {
      const historyDirectory = `${FileSystem.documentDirectory ?? ''}history/`;
      if (!FileSystem.documentDirectory) {
        throw new Error('Document directory unavailable');
      }

      await FileSystem.makeDirectoryAsync(historyDirectory, { intermediates: true });

      const archivedPath = `${historyDirectory}lead-${leadId}.jpg`;
      await FileSystem.deleteAsync(archivedPath, { idempotent: true });
      await FileSystem.copyAsync({
        from: imagePath,
        to: archivedPath
      });

      return archivedPath;
    },
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
  history: ScannerHistoryItem[];
  systemNotice: SystemNotice | null;
  enqueue: (item: EnqueueInput) => void;
  markUploaded: (id: string, storagePath: string) => void;
  markFailed: (id: string, error: string) => void;
  recordHistory: (item: Omit<ScannerHistoryItem, 'savedAt'> & { savedAt?: number }) => void;
  clearSystemNotice: () => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  clearHistory: () => void;
  drainOnce: () => Promise<void>;
};

type ScannerQueueStoreOptions = {
  name?: string;
  skipHydration?: boolean;
};

const STORAGE_PREFIX = 'scanner-queue';
let storageNamespace = 'signed-out';

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

function getNamespacedStorageKey(name: string): string {
  return `${STORAGE_PREFIX}:${storageNamespace}:${name}`;
}

const namespacedAsyncStorage = {
  getItem: async (name: string) => AsyncStorage.getItem(getNamespacedStorageKey(name)),
  removeItem: async (name: string) => AsyncStorage.removeItem(getNamespacedStorageKey(name)),
  setItem: async (name: string, value: string) => AsyncStorage.setItem(getNamespacedStorageKey(name), value)
};

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
    history: [],
    systemNotice: null,
    enqueue: (item) => {
      set((state) => ({
        queue: [
          ...state.queue,
          {
            id: item.id,
            imagePath: item.imagePath,
            ...(item.boothId !== undefined ? { boothId: item.boothId } : {}),
            rawText: item.rawText,
            retryCount: 0,
            status: 'uploading'
          }
        ]
      }));
    },
    clearHistory: () => {
      set(() => ({
        history: []
      }));
    },
    clearSystemNotice: () => {
      set(() => ({
        systemNotice: null
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
    recordHistory: (item) => {
      set((state) => ({
        systemNotice: {
          createdAt: Date.now(),
          kind: 'success',
          message: 'Scan saved to cloud',
          title: 'Saved'
        },
        history: [
          {
            ...item,
            savedAt: item.savedAt ?? Date.now()
          },
          ...state.history.filter((existing) => existing.id !== item.id)
        ].slice(0, 10)
      }));
    },
    markFailed: (id, error) => {
      set((state) => ({
        systemNotice: {
          createdAt: Date.now(),
          kind: 'error',
          message: error,
          title: 'Save failed'
        },
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
              status: item.storagePath ? 'parsing' : 'uploading',
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

        const archivedImagePath = await deps.archiveImage(parsingItem.imagePath, parsingItem.id);

        const scanResult = await deps.invokeScanCard({
          boothId: parsingItem.boothId ?? null,
          imagePath: parsingItem.storagePath,
          leadId: parsingItem.id,
          rawText: parsingItem.rawText
        });

        get().recordHistory({
          id: parsingItem.id,
          imagePath: archivedImagePath,
          parsed: scanResult.parsed,
          parseStatus: scanResult.parseStatus,
          rawText: parsingItem.rawText,
          storagePath: parsingItem.storagePath
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
      storage: createJSONStorage(() => namespacedAsyncStorage),
      partialize: (state) => ({
        queue: state.queue,
        history: state.history
      })
    })
  );
}

export const scannerQueueStore = createScannerQueueStore({}, { skipHydration: true });

export async function syncScannerQueueStoreNamespace(userId: string | null): Promise<void> {
  storageNamespace = userId && userId.trim().length > 0 ? userId : 'signed-out';
  scannerQueueStore.setState({
    history: [],
    queue: [],
    systemNotice: null
  });

  if (userId) {
    await scannerQueueStore.persist.rehydrate();
  }
}

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
