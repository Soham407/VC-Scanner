# Release Checklist

## Mobile

- Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Expo / EAS, or the `SUPABASE_URL` and `SUPABASE_ANON_KEY` fallback if needed
- Verify Google OAuth redirect includes `vcscanner://auth/callback`
- Verify password reset and email verification links open the app on a physical device
- Build Android preview APK and production AAB
- Confirm Android `versionCode` increments for every Play Store upload
- Build iOS production archive
- Test camera capture, OCR, parse, save, queue retry, and sign-out on physical devices
- Test camera permission denied -> Settings -> allowed -> return to scanner on a physical Android device
- Test OCR on a release APK/AAB build before client delivery

## Admin Web

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, or the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback if needed
- Set `VITE_APP_URL` to the deployed admin-web origin
- Set `VITE_AUTH_REDIRECT_URL` if auth must land on a different allowlisted URL
- Add the deployed web origin to Supabase redirect allowlist
- Verify Supabase auth allowlist includes every admin web production and preview origin
- Test Google login, magic link login, team inbox, assignment, reassignment, and lead edits

## Backend

- Deploy all Supabase migrations
- Deploy `scan-card` edge function
- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GROQ_API_KEY` for the function runtime
- Set `GEMINI_API_KEY` for the function runtime (primary card parser; Groq is the fallback if it is unset or fails)
- Verify storage bucket `card-images` and RLS policies exist in the production project
- Run one full scan flow against production-equivalent infrastructure

## Operations

- Enable CI on the default branch
- Confirm monitoring and error reporting are configured externally
- Confirm any production auth policy changes intentionally allow or block public signup
- Confirm offline scan queue storage of business-card OCR text is acceptable for the client environment
- Freeze a release commit before client rollout
