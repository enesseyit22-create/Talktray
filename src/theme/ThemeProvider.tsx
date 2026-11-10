import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type Palette } from '@/theme/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeValue = {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      setMode,
    }),
    [mode, scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
