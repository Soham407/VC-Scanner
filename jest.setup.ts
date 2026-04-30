jest.mock(
  '@env',
  () => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'example-key'
  }),
  { virtual: true }
);
