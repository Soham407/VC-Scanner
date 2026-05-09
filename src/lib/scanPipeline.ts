import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import type { InvokeScanCardResponse } from './scanCard';
import { supabase } from './supabase';
import { uploadCardImage } from './upload';

export type ScanQueueItemStatus = 'uploading' | 'parsing' | 'failed';

export type ScanQueueItem = {
  id: string;
  status: ScanQueueItemStatus;
  imagePath: string;
  teamId?: string | null;
  storagePath?: string;
  rawText: string;
  retryCount: number;
  nextAttemptAt?: number;
  error?: string;
};

export type ScanHistoryItem = {
  id: string;
  imagePath: string;
  storagePath: string;
  rawText: string;
  parseStatus: InvokeScanCardResponse['parseStatus'];
  parsed: InvokeScanCardResponse['parsed'];
  savedAt: number;
};

export type ScanPipelineDeps = {
  archiveImage: (imagePath: string, leadId: string) => Promise<string>;
  deleteImage: (imagePath: string) => Promise<void>;
  getSessionUserId: () => Promise<string>;
  invokeScanCard: (params: { imagePath: string; leadId: string; rawText: string; teamId?: string | null }) => Promise<InvokeScanCardResponse>;
  uploadCardImage: (localPath: string, leadId: string) => Promise<string>;
};

export type ScanPipelineStoreApi = {
  getQueue: () => ScanQueueItem[];
  markFailed: (id: string, error: string) => void;
  markUploaded: (id: string, storagePath: string) => void;
  remove: (id: string) => void;
  recordHistory: (item: Omit<ScanHistoryItem, 'savedAt'> & { savedAt?: number }) => void;
  updateQueue: (updater: (queue: ScanQueueItem[]) => ScanQueueItem[]) => void;
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

export function createDefaultScanPipelineDeps(): ScanPipelineDeps {
  const { invokeScanCard } = require('./scanCard') as typeof import('./scanCard');

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

export function createScanPipeline(deps: ScanPipelineDeps) {
  return {
    async drainOnce(api: ScanPipelineStoreApi): Promise<void> {
      const now = Date.now();
      const queuedItem = api.getQueue().find(
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
          api.markUploaded(queuedItem.id, storagePath);
        }

        const parsingItem = api.getQueue().find((item) => item.id === queuedItem.id);
        if (!parsingItem || parsingItem.status !== 'parsing') {
          return;
        }

        if (!parsingItem.storagePath) {
          throw new Error('Queue item missing storagePath');
        }

        const archivedImagePath = await deps.archiveImage(parsingItem.imagePath, parsingItem.id);

        const scanResult = await deps.invokeScanCard({
          teamId: parsingItem.teamId ?? null,
          imagePath: parsingItem.storagePath,
          leadId: parsingItem.id,
          rawText: parsingItem.rawText
        });

        api.recordHistory({
          id: parsingItem.id,
          imagePath: archivedImagePath,
          parsed: scanResult.parsed,
          parseStatus: scanResult.parseStatus,
          rawText: parsingItem.rawText,
          storagePath: parsingItem.storagePath
        });

        api.remove(parsingItem.id);
        await deps.deleteImage(parsingItem.imagePath);
      } catch (error) {
        const currentItem = api.getQueue().find((item) => item.id === queuedItem.id);
        if (!currentItem) {
          return;
        }

        const errorMessage = getErrorMessage(error);

        if (!isRetryableError(error)) {
          api.markFailed(currentItem.id, errorMessage);
          return;
        }

        const backoffMs = RETRY_BACKOFF_MS[currentItem.retryCount];
        if (typeof backoffMs !== 'number') {
          api.markFailed(currentItem.id, errorMessage);
          return;
        }

        api.updateQueue((queue) =>
          queue.map((item) =>
            item.id === currentItem.id
              ? {
                ...item,
                retryCount: item.retryCount + 1,
                nextAttemptAt: Date.now() + backoffMs,
                error: errorMessage
              }
              : item
          )
        );
      }
    }
  };
}
