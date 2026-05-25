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
  imagePaths?: string[];
  rawText: string;
  teamId?: string | null;
  storagePath?: string;
  storagePaths?: string[];
  uploadLeadIds?: string[];
};
type ScannerQueueDeps = ScanPipelineDeps;

export type ScannerQueueState = {
  queue: ScannerQueueItem[];
  history: ScannerHistoryItem[];
  systemNotice: SystemNotice | null;
  enqueue: (item: EnqueueInput) => void;
  markUploaded: (id: string, storagePath: string | string[]) => void;
  markFailed: (id: string, error: string) => void;
  recordHistory: (item: Omit<ScannerHistoryItem, 'savedAt'> & { savedAt?: number }) => void;
  replaceHistory: (items: ScannerHistoryItem[]) => void;
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
const HISTORY_DIRECTORY_NAME = 'history';
const LOCAL_HISTORY_MAX_ITEMS = 20;
const LOCAL_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;
let storageNamespace = 'signed-out';
let isPersistenceSuppressed = false;

function getNamespacedStorageKey(name: string): string {
  return `${STORAGE_PREFIX}:${storageNamespace}:${name}`;
}

const namespacedAsyncStorage = {
  getItem: async (name: string) => AsyncStorage.getItem(getNamespacedStorageKey(name)),
  removeItem: async (name: string) => AsyncStorage.removeItem(getNamespacedStorageKey(name)),
  setItem: async (name: string, value: string) => {
    if (isPersistenceSuppressed) {
      return;
    }

    return AsyncStorage.setItem(getNamespacedStorageKey(name), value);
  }
};

function getHistoryDirectory(): string | null {
  const cacheDirectory = FileSystem.cacheDirectory;
  return cacheDirectory ? `${cacheDirectory}${HISTORY_DIRECTORY_NAME}/` : null;
}

function pruneLocalHistoryItems(history: ScannerHistoryItem[], now = Date.now()): ScannerHistoryItem[] {
  return history
    .filter((item) => now - item.savedAt <= LOCAL_HISTORY_RETENTION_MS)
    .slice(0, LOCAL_HISTORY_MAX_ITEMS);
}

async function syncArchivedHistoryFiles(history: ScannerHistoryItem[]): Promise<void> {
  const historyDirectory = getHistoryDirectory();
  if (!historyDirectory) {
    return;
  }

  try {
    await FileSystem.makeDirectoryAsync(historyDirectory, { intermediates: true });

    const keepPaths = new Set(
      history
        .map((item) => item.imagePath)
        .filter((path) => path.startsWith(historyDirectory))
    );

    const filenames = await FileSystem.readDirectoryAsync(historyDirectory);
    await Promise.all(
      filenames.map((filename) => {
        const path = `${historyDirectory}${filename}`;
        if (keepPaths.has(path)) {
          return Promise.resolve();
        }

        return FileSystem.deleteAsync(path, { idempotent: true });
      })
    );
  } catch {
    // Best-effort cleanup only.
  }
}

async function clearArchivedHistoryFiles(): Promise<void> {
  await syncArchivedHistoryFiles([]);
}

function createScannerQueueState(pipeline: ReturnType<typeof createScanPipeline>) {
  return (set: (updater: (state: ScannerQueueState) => Partial<ScannerQueueState>) => void, get: () => ScannerQueueState): ScannerQueueState => ({
    queue: [],
    history: [],
    systemNotice: null,
    enqueue: (item) => {
      const imagePaths = item.imagePaths?.length ? item.imagePaths : [item.imagePath];
      const storagePaths = item.storagePaths?.length ? item.storagePaths : item.storagePath ? [item.storagePath] : [];
      const uploadLeadIds = item.uploadLeadIds?.length ? item.uploadLeadIds : undefined;

      set((state) => ({
        queue: [
          ...state.queue,
          {
            id: item.id,
            imagePath: item.imagePath,
            ...(imagePaths.length > 1 ? { imagePaths } : {}),
            ...(storagePaths.length > 0 ? { storagePath: storagePaths[0], storagePaths } : {}),
            ...(uploadLeadIds ? { uploadLeadIds } : {}),
            ...(item.teamId !== undefined ? { teamId: item.teamId } : {}),
            ...(item.rawText ? { rawText: item.rawText } : {}),
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
      void clearArchivedHistoryFiles();
    },
    clearSystemNotice: () => {
      set(() => ({
        systemNotice: null
      }));
    },
    markUploaded: (id, storagePath) => {
      const storagePaths = Array.isArray(storagePath) ? storagePath : [storagePath];
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? {
              ...item,
              status: 'parsing',
              storagePath: storagePaths[0],
              ...(storagePaths.length > 1 ? { storagePaths } : {}),
              nextAttemptAt: undefined,
              error: undefined
            }
          : item
        )
      }));
    },
    recordHistory: (item) => {
      const nextHistory = pruneLocalHistoryItems([
        {
          ...item,
          savedAt: item.savedAt ?? Date.now()
        },
        ...get().history.filter((existing) => existing.id !== item.id)
      ]);

      set(() => ({
        systemNotice: {
          createdAt: Date.now(),
          kind: 'success',
          message: 'Scan saved to cloud',
          title: 'Saved'
        },
        history: nextHistory
      }));
      void syncArchivedHistoryFiles(nextHistory);
    },
    replaceHistory: (items) => {
      set(() => ({
        history: items
      }));
      void syncArchivedHistoryFiles(items);
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
              status: item.storagePaths?.length || item.storagePath ? 'parsing' : 'uploading',
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
        history: []
      })
    })
  );
}

export const scannerQueueStore = createScannerQueueStore({}, { skipHydration: true });

export async function syncScannerQueueStoreNamespace(userId: string | null): Promise<void> {
  const nextNamespace = userId && userId.trim().length > 0 ? userId : 'signed-out';

  isPersistenceSuppressed = true;
  try {
    scannerQueueStore.setState({
      history: [],
      queue: [],
      systemNotice: null
    });
  } finally {
    isPersistenceSuppressed = false;
  }

  storageNamespace = nextNamespace;
  await clearArchivedHistoryFiles();

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
      const match = filename.match(/^lead-([a-f0-9-]+?)(?:-(?:front|back))?\.jpg$/i);
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
