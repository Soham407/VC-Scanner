import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

const APP_PREFERENCES_STORAGE_KEY = 'vs-scanner:app-preferences';

export type PreferredScanMode = 'ask' | 'singleSided' | 'doubleSided';
export type AfterSaveBehavior = 'dashboard' | 'scan-again';

type StoredPreferences = {
  afterSaveBehavior: AfterSaveBehavior;
  preferredScanMode: PreferredScanMode;
};

type AppPreferencesContextValue = StoredPreferences & {
  setAfterSaveBehavior: (value: AfterSaveBehavior) => void;
  setPreferredScanMode: (value: PreferredScanMode) => void;
};

const defaultPreferences: StoredPreferences = {
  afterSaveBehavior: 'dashboard',
  preferredScanMode: 'ask'
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferredScanMode, setPreferredScanMode] = useState<PreferredScanMode>(defaultPreferences.preferredScanMode);
  const [afterSaveBehavior, setAfterSaveBehavior] = useState<AfterSaveBehavior>(defaultPreferences.afterSaveBehavior);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const storedValue = await AsyncStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
        if (!mounted || !storedValue) {
          return;
        }

        const parsed = JSON.parse(storedValue) as Partial<StoredPreferences>;

        if (parsed.preferredScanMode === 'ask' || parsed.preferredScanMode === 'singleSided' || parsed.preferredScanMode === 'doubleSided') {
          setPreferredScanMode(parsed.preferredScanMode);
        }

        if (parsed.afterSaveBehavior === 'dashboard' || parsed.afterSaveBehavior === 'scan-again') {
          setAfterSaveBehavior(parsed.afterSaveBehavior);
        }
      } catch {
        // Ignore invalid persisted settings and keep defaults.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        afterSaveBehavior,
        preferredScanMode
      } satisfies StoredPreferences)
    );
  }, [afterSaveBehavior, preferredScanMode]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      afterSaveBehavior,
      preferredScanMode,
      setAfterSaveBehavior,
      setPreferredScanMode
    }),
    [afterSaveBehavior, preferredScanMode]
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences(): AppPreferencesContextValue {
  const value = useContext(AppPreferencesContext);
  if (!value) {
    throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  }

  return value;
}
