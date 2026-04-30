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
  constructor(message: string) {
    super(message);
    this.name = 'ScanCardInvokeError';
  }
}

export async function invokeScanCard(params: InvokeScanCardParams): Promise<InvokeScanCardResponse> {
  const { data, error } = await supabase.functions.invoke<ScanCardFunctionSuccess | ScanCardFunctionFailure>(
    'scan-card',
    {
      body: {
        imagePath: params.imagePath,
        leadId: params.leadId,
        rawText: params.rawText
      }
    }
  );

  if (error) {
    throw new ScanCardInvokeError(error.message);
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
