import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMaterial3Theme, type Material3Scheme, type Material3Theme } from '@pchmn/expo-material3-theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useColorScheme } from 'react-native';
import {
  MD3DarkTheme,
  MD3LightTheme,
  type MD3Theme,
  PaperProvider,
  useTheme
} from 'react-native-paper';

const BRAND_SOURCE_COLOR = '#9A4B36';
const COLOR_MODE_STORAGE_KEY = 'vs-scanner:color-mode';

export type ColorMode = 'dark' | 'light';

type MaterialThemeContextValue = {
  colorMode: ColorMode;
  materialTheme: Material3Theme;
  resetTheme: () => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  updateTheme: (sourceColor: string) => void;
};

const MaterialThemeContext = createContext<MaterialThemeContextValue | null>(null);

type AppPaperTheme = MD3Theme & {
  colors: Material3Scheme;
};

function buildPaperTheme(colorMode: ColorMode, colors: Material3Scheme): AppPaperTheme {
  const baseTheme = colorMode === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const prototypeColors = colorMode === 'dark'
    ? {
        background: '#191512',
        error: '#FFB4AB',
        errorContainer: '#93000A',
        onErrorContainer: '#FFDAD6',
        onPrimary: '#FFFFFF',
        onPrimaryContainer: '#FFEDE7',
        onSecondaryContainer: '#F6E7E0',
        onSurface: '#F4EEE9',
        onSurfaceVariant: '#CDBEB7',
        primary: '#D88B72',
        primaryContainer: '#733522',
        secondary: '#CFA092',
        secondaryContainer: '#4A2B23',
        surface: '#1F1A17',
        surfaceContainer: '#27211D',
        surfaceContainerHigh: '#2E2722',
        surfaceContainerHighest: '#38302A',
        tertiary: '#D9B76E',
        tertiaryContainer: '#4F3E13'
      }
    : {
        background: '#F8F3EA',
        error: '#BA1A1A',
        errorContainer: '#FFDAD6',
        onErrorContainer: '#410002',
        onPrimary: '#FFFFFF',
        onPrimaryContainer: '#3B1106',
        onSecondaryContainer: '#2E150F',
        onSurface: '#30251F',
        onSurfaceVariant: '#75645C',
        primary: '#9A4B36',
        primaryContainer: '#FFE0D4',
        secondary: '#76574D',
        secondaryContainer: '#F6DED6',
        surface: '#FFF9F3',
        surfaceContainer: '#FFF9F3',
        surfaceContainerHigh: '#FBF2EA',
        surfaceContainerHighest: '#F0E6DD',
        tertiary: '#77601E',
        tertiaryContainer: '#F9E49A'
      };

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...colors,
      ...prototypeColors
    },
    roundness: 3
  } as AppPaperTheme;
}

export function MaterialThemeProvider({ children }: { children: ReactNode }) {
  const systemColorMode: ColorMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { theme, resetTheme, updateTheme } = useMaterial3Theme({
    fallbackSourceColor: BRAND_SOURCE_COLOR
  });
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

        if (storedColorMode === 'dark' || storedColorMode === 'light') {
          setColorMode(storedColorMode);
        } else {
          setColorMode(systemColorMode);
        }
      } catch {
        if (!mounted) {
          return;
        }

        setColorMode(systemColorMode);
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

  const paperTheme = useMemo(
    () => buildPaperTheme(colorMode, colorMode === 'dark' ? theme.dark : theme.light),
    [colorMode, theme]
  );

  const toggleColorMode = () => {
    setColorMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  return (
    <MaterialThemeContext.Provider
      value={{
        colorMode,
        materialTheme: theme,
        resetTheme,
        setColorMode,
        toggleColorMode,
        updateTheme
      }}
    >
      <PaperProvider
        settings={{
          icon: (props) => <MaterialCommunityIcons {...props} />
        }}
        theme={paperTheme}
      >
        {children}
      </PaperProvider>
    </MaterialThemeContext.Provider>
  );
}

export function useMaterialThemeControls(): MaterialThemeContextValue {
  const value = useContext(MaterialThemeContext);
  if (!value) {
    throw new Error('useMaterialThemeControls must be used inside MaterialThemeProvider');
  }

  return value;
}

export const useAppTheme = useTheme<AppPaperTheme>;
