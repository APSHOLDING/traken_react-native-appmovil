import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_IDS,
  AccentId,
  buildTheme,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  MODE_IDS,
  ThemeMode,
  ThemeTokens,
} from '../theme/themes';

const KEY = 'traken_theme_v1';

type ThemeContextValue = ThemeTokens & {
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Tema elegido por la persona (estilo + color), guardado en el telefono. Si no
 * hay nada guardado, o falla la lectura, se usa el tema por defecto: nunca
 * puede dejar la app sin pintar.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { mode?: string; accent?: string };
        if (saved.mode && (MODE_IDS as string[]).includes(saved.mode)) setModeState(saved.mode as ThemeMode);
        if (saved.accent && (ACCENT_IDS as string[]).includes(saved.accent)) setAccentState(saved.accent as AccentId);
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((m: ThemeMode, a: AccentId) => {
    AsyncStorage.setItem(KEY, JSON.stringify({ mode: m, accent: a })).catch(() => {});
  }, []);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      persist(m, accent);
    },
    [accent, persist]
  );

  const setAccent = useCallback(
    (a: AccentId) => {
      setAccentState(a);
      persist(mode, a);
    },
    [mode, persist]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ ...buildTheme(mode, accent), setMode, setAccent }),
    [mode, accent, setMode, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
