import { describe, expect, it } from 'vitest';

import { resolveAuthRedirectUrl } from './authRedirect';

describe('resolveAuthRedirectUrl', () => {
  it('prefers an explicit redirect URL when provided', () => {
    expect(
      resolveAuthRedirectUrl({
        appUrl: 'https://admin.example.com',
        explicitRedirectUrl: 'https://auth.example.com/callback',
        fallbackOrigin: 'http://localhost:5173'
      })
    ).toBe('https://auth.example.com/callback');
  });

  it('normalizes the app URL to a trailing slash', () => {
    expect(
      resolveAuthRedirectUrl({
        appUrl: 'https://admin.example.com/app',
        fallbackOrigin: 'http://localhost:5173'
      })
    ).toBe('https://admin.example.com/app/');
  });

  it('falls back to the current origin when app URL is unset', () => {
    expect(
      resolveAuthRedirectUrl({
        fallbackOrigin: 'http://localhost:5173'
      })
    ).toBe('http://localhost:5173/');
  });

  it('throws when no redirect source is available', () => {
    expect(() => resolveAuthRedirectUrl({})).toThrow(
      'Missing web auth redirect URL. Set VITE_APP_URL or VITE_AUTH_REDIRECT_URL.'
    );
  });
});
