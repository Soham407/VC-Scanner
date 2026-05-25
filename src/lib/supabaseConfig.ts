export function getRequiredConfigValue(label: string, candidates: Array<unknown>): string {
  const value = candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);

  if (!value) {
    throw new Error(`Missing Supabase ${label}. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, or provide the matching native env vars.`);
  }

  return value.trim();
}

export function resolveSupabaseConfig(values: {
  anonKeyCandidates: Array<unknown>;
  urlCandidates: Array<unknown>;
}): {
  anonKey: string;
  url: string;
} {
  const url = getRequiredConfigValue('URL', values.urlCandidates);

  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid Supabase URL: ${url}`);
  }

  return {
    anonKey: getRequiredConfigValue('anon key', values.anonKeyCandidates),
    url
  };
}
