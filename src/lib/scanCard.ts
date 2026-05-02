import { supabase } from './supabase';

export type ParsedCard = {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  address: string | null;
  email: string | null;
  phoneNumber: string | null;
};

export type ParseStatus = 'parsed' | 'unparsed';

type InvokeScanCardParams = {
  rawText: string;
  imagePath: string;
  leadId: string;
  boothId?: string | null;
};

export type InvokeScanCardResponse = {
  parsed: ParsedCard;
  parseStatus: ParseStatus;
};

type ScanCardFunctionSuccess = {
  ok: true;
  parsed: ParsedCard;
  parseStatus: ParseStatus;
};

type ScanCardFunctionFailure = {
  ok: false;
  error?: string;
};

export class ScanCardInvokeError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ScanCardInvokeError';
    this.status = status;
  }
}

async function extractErrorMessage(error: unknown): Promise<string | undefined> {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const context = (error as {
    context?: unknown;
    message?: unknown;
  }).context;

  if (!context || typeof context !== 'object') {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
  }

  const responseLike = context as {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
    status?: unknown;
    statusText?: unknown;
  };

  try {
    if (typeof responseLike.json === 'function') {
      const payload = await responseLike.json();
      if (typeof payload === 'string' && payload.trim().length > 0) {
        return payload;
      }

      if (typeof payload === 'object' && payload !== null) {
        const body = payload as { error?: unknown; message?: unknown };
        if (typeof body.error === 'string' && body.error.trim().length > 0) {
          return body.error;
        }

        if (typeof body.message === 'string' && body.message.trim().length > 0) {
          return body.message;
        }
      }
    }
  } catch {
    // Fall through to text/message extraction.
  }

  try {
    if (typeof responseLike.text === 'function') {
      const text = await responseLike.text();
      if (typeof text === 'string' && text.trim().length > 0) {
        return text;
      }
    }
  } catch {
    // Fall through to generic message extraction.
  }

  const status = typeof responseLike.status === 'number' ? responseLike.status : undefined;
  const statusText = typeof responseLike.statusText === 'string' ? responseLike.statusText : undefined;
  if (status || statusText) {
    return [status ? `HTTP ${status}` : null, statusText ?? null].filter(Boolean).join(' ');
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
}

function getInvokeErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorObject = error as {
    status?: unknown;
    context?: {
      status?: unknown;
      statusCode?: unknown;
    };
    statusCode?: unknown;
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

  return undefined;
}

export async function invokeScanCard(params: InvokeScanCardParams): Promise<InvokeScanCardResponse> {
  const { data, error } = await supabase.functions.invoke<ScanCardFunctionSuccess | ScanCardFunctionFailure>(
    'scan-card',
    {
      body: {
        boothId: params.boothId ?? null,
        imagePath: params.imagePath,
        leadId: params.leadId,
        rawText: params.rawText
      }
    }
  );

  if (error) {
    const detailMessage = await extractErrorMessage(error);
    throw new ScanCardInvokeError(detailMessage ?? error.message, getInvokeErrorStatus(error));
  }

  if (!data || !('ok' in data) || data.ok !== true) {
    const errorMessage = data && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'scan-card invocation failed';
    throw new ScanCardInvokeError(errorMessage);
  }

  return {
    parseStatus: data.parseStatus,
    parsed: data.parsed
  };
}
