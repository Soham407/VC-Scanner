import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import {
  createDefaultScanPipelineDeps,
  createScanPipeline,
  type ScanPipelineDeps,
  type ScanHistoryItem,
  type ScanQueueItem,
  type ScanQueueItemStatus
} from '../src/lib/scanPipeline';

export type QueueItemStatus = ScanQueueItemStatus;
export type ScannerQueueItem = ScanQueueItem;
export type ScannerHistoryItem = ScanHistoryItem;

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
  teamId?: string | null;
};
type ScannerQueueDeps = ScanPipelineDeps;

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

function getNamespacedStorageKey(name: string): string {
  return `${STORAGE_PREFIX}:${storageNamespace}:${name}`;
}

const namespacedAsyncStorage = {
  getItem: async (name: string) => AsyncStorage.getItem(getNamespacedStorageKey(name)),
  removeItem: async (name: string) => AsyncStorage.removeItem(getNamespacedStorageKey(name)),
  setItem: async (name: string, value: string) => AsyncStorage.setItem(getNamespacedStorageKey(name), value)
};

function createScannerQueueState(pipeline: ReturnType<typeof createScanPipeline>) {
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
          ...(item.teamId !== undefined ? { teamId: item.teamId } : {}),
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
    drainOnce: async () => pipeline.drainOnce({
      getQueue: () => get().queue,
      markFailed: get().markFailed,
      markUploaded: get().markUploaded,
      recordHistory: get().recordHistory,
      remove: get().remove,
      updateQueue: (updater) => {
        set((state) => ({
          queue: updater(state.queue)
        }));
      }
    })
  });
}

export function createScannerQueueStore(
  overrides: Partial<ScannerQueueDeps> = {},
  options: ScannerQueueStoreOptions = {}
) {
  const deps: ScannerQueueDeps = {
    ...createDefaultScanPipelineDeps(),
    ...overrides
  };
  const pipeline = createScanPipeline(deps);

  return createStore<ScannerQueueState>()(
    persist(createScannerQueueState(pipeline), {
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
