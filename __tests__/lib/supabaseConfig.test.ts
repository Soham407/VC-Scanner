import { getRequiredConfigValue, resolveSupabaseConfig } from '../../src/lib/supabaseConfig';

describe('supabase config resolver', () => {
  it('throws immediately when the Supabase env vars are missing', () => {
    expect(() => getRequiredConfigValue('URL', [undefined, '', null])).toThrow('Missing Supabase URL');
  });

  it('rejects invalid Supabase URLs before client creation', () => {
    expect(() =>
      resolveSupabaseConfig({
        anonKeyCandidates: ['key'],
        urlCandidates: ['not a url']
      })
    ).toThrow('Invalid Supabase URL: not a url');
  });

  it('trims the resolved config values', () => {
    expect(
      resolveSupabaseConfig({
        anonKeyCandidates: ['  anon-key  '],
        urlCandidates: ['  https://example.supabase.co  ']
      })
    ).toEqual({
      anonKey: 'anon-key',
      url: 'https://example.supabase.co'
    });
  });
});
