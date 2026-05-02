import { supabase } from './supabase';

export type ParsedCard = {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
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

type InvokeScanCardResponse = {
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
    throw new ScanCardInvokeError(error.message, getInvokeErrorStatus(error));
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
