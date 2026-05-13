import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');

describe('native deep link config', () => {
  it('registers the OAuth callback scheme on Android', () => {
    const manifest = readFileSync(
      path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );

    expect(manifest).toContain('android.intent.action.VIEW');
    expect(manifest).toContain('android.intent.category.BROWSABLE');
    expect(manifest).toContain('android:scheme="vcscanner"');
  });

  it('blocks the unused Android microphone permission', () => {
    const manifest = readFileSync(
      path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );
    const appConfig = readFileSync(path.join(projectRoot, 'app.json'), 'utf8');

    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(manifest).toContain('tools:node="remove"');
    expect(appConfig).toContain('"blockedPermissions"');
    expect(appConfig).toContain('"android.permission.RECORD_AUDIO"');
  });

  it('allows landscape camera usage on native platforms', () => {
    const manifest = readFileSync(
      path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );
    const plist = readFileSync(
      path.join(projectRoot, 'ios/VCScanner/Info.plist'),
      'utf8'
    );
    const appConfig = readFileSync(path.join(projectRoot, 'app.json'), 'utf8');

    expect(appConfig).toContain('"orientation": "default"');
    expect(manifest).not.toContain('android:screenOrientation="portrait"');
    expect(plist).toContain('<string>UIInterfaceOrientationLandscapeLeft</string>');
    expect(plist).toContain('<string>UIInterfaceOrientationLandscapeRight</string>');
  });

  it('registers the OAuth callback scheme on iOS', () => {
    const plist = readFileSync(
      path.join(projectRoot, 'ios/VCScanner/Info.plist'),
      'utf8'
    );

    expect(plist).toContain('<key>CFBundleURLSchemes</key>');
    expect(plist).toContain('<string>vcscanner</string>');
  });
});
