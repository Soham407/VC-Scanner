import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const readProjectFile = (relativePath: string) =>
  readFileSync(path.join(projectRoot, relativePath), 'utf8');

describe('native deep link config', () => {
  it('registers the OAuth callback scheme on Android', () => {
    const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');

    expect(manifest).toContain('android.intent.action.VIEW');
    expect(manifest).toContain('android.intent.category.BROWSABLE');
    expect(manifest).toContain('android:scheme="vcscanner"');
  });

  it('blocks the unused Android microphone permission', () => {
    const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');
    const appConfig = readProjectFile('app.json');

    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(manifest).toContain('tools:node="remove"');
    expect(appConfig).toContain('"blockedPermissions"');
    expect(appConfig).toContain('"android.permission.RECORD_AUDIO"');
  });

  it('does not request Android overlay permission in shipped or internal manifests', () => {
    const manifests = [
      readProjectFile('android/app/src/main/AndroidManifest.xml'),
      readProjectFile('android/app/src/debug/AndroidManifest.xml'),
      readProjectFile('android/app/src/debugOptimized/AndroidManifest.xml')
    ];

    for (const manifest of manifests) {
      expect(manifest).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
    }
  });

  it('keeps New Architecture enabled for Reanimated and Worklets compatibility', () => {
    const appConfig = readProjectFile('app.json');
    const androidProperties = readProjectFile('android/gradle.properties');
    const iosPodProperties = readProjectFile('ios/Podfile.properties.json');
    const iosInfoPlist = readProjectFile('ios/VCScanner/Info.plist');

    expect(appConfig).toContain('"newArchEnabled": true');
    expect(androidProperties).toContain('newArchEnabled=true');
    expect(iosPodProperties).toContain('"newArchEnabled": "true"');
    expect(iosInfoPlist).toContain('<key>RCTNewArchEnabled</key>');
    expect(iosInfoPlist).toContain('<true/>');
  });

  it('keeps Android release versioning ready for repeated Play uploads', () => {
    const buildGradle = readProjectFile('android/app/build.gradle');
    const easConfig = readProjectFile('eas.json');

    expect(buildGradle).toContain('versionCode 2');
    expect(easConfig).toContain('"autoIncrement": "versionCode"');
  });

  it('keeps Expo Doctor configured for the intentional bare/native setup', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      expo?: {
        doctor?: {
          appConfigFieldsNotSyncedCheck?: { enabled?: boolean };
          reactNativeDirectoryCheck?: { exclude?: string[] };
        };
      };
    };

    expect(packageJson.expo?.doctor?.appConfigFieldsNotSyncedCheck?.enabled).toBe(false);
    expect(packageJson.expo?.doctor?.reactNativeDirectoryCheck?.exclude).toContain('@react-native-ml-kit/text-recognition');
  });

  it('keeps local Supabase auth/reset config aligned with app clients', () => {
    const supabaseConfig = readProjectFile('supabase/config.toml');

    expect(supabaseConfig).toContain('[db.seed]');
    expect(supabaseConfig).toContain('enabled = false');
    expect(supabaseConfig).toContain('http://localhost:5173');
    expect(supabaseConfig).toContain('http://127.0.0.1:5173');
    expect(supabaseConfig).toContain('vcscanner://auth/callback');
    expect(supabaseConfig).toContain('enable_confirmations = true');
  });

  it('keeps native orientation config aligned with the shipped app shell', () => {
    const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');
    const plist = readProjectFile('ios/VCScanner/Info.plist');
    const appConfig = readProjectFile('app.json');

    expect(appConfig).toContain('"orientation": "default"');
    expect(manifest).not.toContain('android:screenOrientation="portrait"');
    expect(plist).toContain('<string>UIInterfaceOrientationLandscapeLeft</string>');
    expect(plist).toContain('<string>UIInterfaceOrientationLandscapeRight</string>');
  });

  it('registers the OAuth callback scheme on iOS', () => {
    const plist = readProjectFile('ios/VCScanner/Info.plist');

    expect(plist).toContain('<key>CFBundleURLSchemes</key>');
    expect(plist).toContain('<string>vcscanner</string>');
  });

  it('documents the mobile and backend env example keys', () => {
    const envExample = readProjectFile('.env.example');

    expect(envExample).toContain('SUPABASE_URL=');
    expect(envExample).toContain('SUPABASE_ANON_KEY=');
    expect(envExample).toContain('EXPO_PUBLIC_SUPABASE_URL=');
    expect(envExample).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY=');
    expect(envExample).toContain('GROQ_API_KEY=');
  });

  it('documents the admin web env example keys and redirect URLs', () => {
    const envExample = readProjectFile('admin-web/.env.example');

    expect(envExample).toContain('VITE_SUPABASE_URL=');
    expect(envExample).toContain('VITE_SUPABASE_ANON_KEY=');
    expect(envExample).toContain('NEXT_PUBLIC_SUPABASE_URL=');
    expect(envExample).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY=');
    expect(envExample).toContain('VITE_APP_URL=');
    expect(envExample).toContain('VITE_AUTH_REDIRECT_URL=');
    expect(envExample).toContain('NEXT_PUBLIC_APP_URL=');
    expect(envExample).toContain('NEXT_PUBLIC_AUTH_REDIRECT_URL=');
  });

  it('keeps the release checklist aligned with the configured deployment flow', () => {
    const releaseChecklist = readProjectFile('docs/release-checklist.md');

    expect(releaseChecklist).toContain('vcscanner://auth/callback');
    expect(releaseChecklist).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(releaseChecklist).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(releaseChecklist).toContain('VITE_SUPABASE_URL');
    expect(releaseChecklist).toContain('VITE_SUPABASE_ANON_KEY');
    expect(releaseChecklist).toContain('VITE_APP_URL');
    expect(releaseChecklist).toContain('VITE_AUTH_REDIRECT_URL');
    expect(releaseChecklist).toContain('GROQ_API_KEY');
    expect(releaseChecklist).toContain('versionCode');
    expect(releaseChecklist).toContain('release APK/AAB');
    expect(releaseChecklist).toContain('admin web production and preview origin');
    expect(releaseChecklist).toContain('offline scan queue storage');
  });
});
