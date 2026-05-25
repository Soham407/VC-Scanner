# VC Scanner

Expo mobile app plus a separate `admin-web` Vite app for scanning, parsing, and managing business cards with Supabase.

## Apps

- Mobile app: Expo / React Native in the repo root
- Admin web app: Vite / React app in [`admin-web`](./admin-web)

## Environment

Root `.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `GROQ_API_KEY`

`admin-web/.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL`
- `VITE_AUTH_REDIRECT_URL`

## Auth Setup

Configure the same Supabase project for both apps.

Required redirect URLs:

- Mobile OAuth callback: `vcscanner://auth/callback`
- Admin web production callback: `<your-admin-web-origin>/`
- Admin web preview callback: each deployed preview origin you allow

Required providers:

- Google OAuth if using Google sign-in
- Email auth if using password or magic-link login flows

Production email delivery:

- Configure real SMTP in Supabase before client rollout
- Enable email confirmations and production email templates in the hosted project as needed

## Backend Setup

Deploy the Supabase Edge Function:

- `scan-card`

Required function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GROQ_API_KEY`

## Mobile Release

- Android application ID: `com.vsscanner.app`
- iOS bundle identifier: `com.vsscanner.app`
- Expo scheme: `vcscanner`

Before store submission, configure:

- EAS project secrets for Android signing
- Apple signing and App Store Connect credentials
- Real production Supabase project values

## Verification

Root app:

- `npm run typecheck`
- `npm test`
- `npm run test:supabase-functions`
- `npm run web:build`

Admin web:

- `cd admin-web && npm run test`
- `cd admin-web && npm run build`

## Release Checklist

See [`docs/release-checklist.md`](./docs/release-checklist.md).
