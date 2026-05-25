export function resolveAuthRedirectUrl(params: {
  appUrl?: string | null;
  explicitRedirectUrl?: string | null;
  fallbackOrigin?: string | null;
}): string {
  const explicitRedirectUrl = params.explicitRedirectUrl?.trim();
  if (explicitRedirectUrl) {
    return explicitRedirectUrl;
  }

  const appUrl = params.appUrl?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, '')}/`;
  }

  const fallbackOrigin = params.fallbackOrigin?.trim();
  if (fallbackOrigin) {
    return `${fallbackOrigin.replace(/\/+$/, '')}/`;
  }

  throw new Error('Missing web auth redirect URL. Set VITE_APP_URL or VITE_AUTH_REDIRECT_URL.');
}

export function getWebAuthRedirectUrl(): string {
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : null;

  return resolveAuthRedirectUrl({
    appUrl: import.meta.env.VITE_APP_URL ?? import.meta.env.NEXT_PUBLIC_APP_URL ?? null,
    explicitRedirectUrl: import.meta.env.VITE_AUTH_REDIRECT_URL ?? import.meta.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ?? null,
    fallbackOrigin
  });
}
