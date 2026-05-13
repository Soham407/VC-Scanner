import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

const COLOR_MODE_STORAGE_KEY = 'vs-scanner:color-mode';

export type ColorMode = 'dark' | 'light';

type OpenDesignColors = {
  background: string;
  error: string;
  errorContainer: string;
  onErrorContainer: string;
  onPrimaryContainer: string;
  onSecondaryContainer: string;
  onSurface: string;
  onSurfaceVariant: string;
  onTertiaryContainer: string;
  outlineVariant: string;
  primary: string;
  primaryContainer: string;
  scrim: string;
  secondary: string;
  secondaryContainer: string;
  surface: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  tertiary: string;
  tertiaryContainer: string;
};

type OpenDesignTheme = {
  colors: OpenDesignColors;
  dark: boolean;
  roundness: number;
};

type ThemeControlsContextValue = {
  colorMode: ColorMode;
  materialTheme: {
    dark: OpenDesignTheme;
    light: OpenDesignTheme;
  };
  resetTheme: () => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  updateTheme: (_sourceColor: string) => void;
};

const lightColors: OpenDesignColors = {
  background: '#F6F8F7',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  onPrimaryContainer: '#1E2600',
  onSecondaryContainer: '#0F1B2A',
  onSurface: '#1F2528',
  onSurfaceVariant: '#5E6A6E',
  onTertiaryContainer: '#2A1D00',
  outlineVariant: '#D7E0E2',
  primary: '#A8D800',
  primaryContainer: '#E6F4A6',
  scrim: 'rgba(0, 0, 0, 0.45)',
  secondary: '#315D86',
  secondaryContainer: '#D8E9FA',
  surface: '#FFFFFF',
  surfaceContainer: '#FFFFFF',
  surfaceContainerHigh: '#EEF5F4',
  surfaceContainerHighest: '#E2ECEB',
  tertiary: '#8A6400',
  tertiaryContainer: '#FFE3A3'
};

const darkColors: OpenDesignColors = {
  background: '#111719',
  error: '#FFB4AB',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  onPrimaryContainer: '#F3FFD2',
  onSecondaryContainer: '#EAF4FF',
  onSurface: '#EEF3F4',
  onSurfaceVariant: '#B8C7CB',
  onTertiaryContainer: '#FFE9B2',
  outlineVariant: '#3D4A4E',
  primary: '#A8D800',
  primaryContainer: '#4A5B00',
  scrim: 'rgba(0, 0, 0, 0.55)',
  secondary: '#A8CBEF',
  secondaryContainer: '#193B59',
  surface: '#171D20',
  surfaceContainer: '#1E2629',
  surfaceContainerHigh: '#263033',
  surfaceContainerHighest: '#303B3F',
  tertiary: '#E8C36A',
  tertiaryContainer: '#5D4300'
};

const lightTheme: OpenDesignTheme = {
  colors: lightColors,
  dark: false,
  roundness: 8
};

const darkTheme: OpenDesignTheme = {
  colors: darkColors,
  dark: true,
  roundness: 8
};

const ThemeContext = createContext<OpenDesignTheme | null>(null);
const ThemeControlsContext = createContext<ThemeControlsContextValue | null>(null);

export function MaterialThemeProvider({ children }: { children: ReactNode }) {
  const systemColorMode: ColorMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [colorMode, setColorMode] = useState<ColorMode>(systemColorMode);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const storedColorMode = await AsyncStorage.getItem(COLOR_MODE_STORAGE_KEY);
        if (!mounted) {
          return;
        }

        setColorMode(storedColorMode === 'dark' || storedColorMode === 'light' ? storedColorMode : systemColorMode);
      } catch {
        if (mounted) {
          setColorMode(systemColorMode);
        }
      } finally {
        if (mounted) {
          hasHydratedRef.current = true;
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [systemColorMode]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      return;
    }

    void AsyncStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
  }, [colorMode]);

  const theme = colorMode === 'dark' ? darkTheme : lightTheme;
  const controls = useMemo<ThemeControlsContextValue>(
    () => ({
      colorMode,
      materialTheme: {
        dark: darkTheme,
        light: lightTheme
      },
      resetTheme: () => undefined,
      setColorMode,
      toggleColorMode: () => setColorMode((current) => (current === 'dark' ? 'light' : 'dark')),
      updateTheme: () => undefined
    }),
    [colorMode]
  );

  return (
    <ThemeControlsContext.Provider value={controls}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </ThemeControlsContext.Provider>
  );
}

export function useMaterialThemeControls(): ThemeControlsContextValue {
  const value = useContext(ThemeControlsContext);
  if (!value) {
    throw new Error('useMaterialThemeControls must be used inside MaterialThemeProvider');
  }

  return value;
}

export function useAppTheme(): OpenDesignTheme {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside MaterialThemeProvider');
  }

  return value;
}
