import type { ViewStyle } from 'react-native';

/**
 * Temas de la app. La persona elige:
 *   - un ESTILO  (claro / web / oscuro)
 *   - un COLOR   (acento: encabezado, chips, botones)
 * Los colores propios de cada modulo (azul de Crear O.S., verde de Abiertas...)
 * se quedan fijos igual que en la web para que se reconozcan siempre.
 */
export type ThemeMode = 'claro' | 'web' | 'oscuro';
export type AccentId = 'teal' | 'azul' | 'marino' | 'verde' | 'morado' | 'rosa' | 'naranja' | 'rojo';

export const MODE_LABELS: Record<ThemeMode, { label: string; hint: string }> = {
  claro: { label: 'Claro', hint: 'Fondo blanco' },
  web: { label: 'Como la web', hint: 'Azul marino y tarjetas blancas' },
  oscuro: { label: 'Oscuro', hint: 'Fondo oscuro' },
};

export const ACCENTS: Record<AccentId, { label: string; main: string; dark: string }> = {
  teal: { label: 'Turquesa', main: '#2bb7b3', dark: '#1f8f8c' },
  azul: { label: 'Azul', main: '#2563eb', dark: '#1d4ed8' },
  marino: { label: 'Marino', main: '#233163', dark: '#16214d' },
  verde: { label: 'Verde', main: '#16a34a', dark: '#0f7a37' },
  morado: { label: 'Morado', main: '#7c3aed', dark: '#6d28d9' },
  rosa: { label: 'Rosa', main: '#db2777', dark: '#be185d' },
  naranja: { label: 'Naranja', main: '#ea580c', dark: '#c2410c' },
  rojo: { label: 'Rojo', main: '#dc2626', dark: '#b91c1c' },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];
export const MODE_IDS: ThemeMode[] = ['claro', 'web', 'oscuro'];

export const DEFAULT_MODE: ThemeMode = 'claro';
export const DEFAULT_ACCENT: AccentId = 'teal';

/** '#rrggbb' + opacidad -> 'rgba(r,g,b,a)' */
export function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type ThemeTokens = {
  mode: ThemeMode;
  accentId: AccentId;
  accent: string;
  accentDark: string;
  /** El fondo es oscuro: la barra de estado va clara. */
  isDark: boolean;
  bg: readonly [string, string, ...string[]];
  /** En 'claro' el encabezado es una tarjeta con degradado del color elegido. */
  headerAsCard: boolean;
  headerText: string;
  headerMuted: string;
  headerBtnBg: string;
  headerBtnBorder: string;
  headerBtnIcon: string;
  headerChipBg: string;
  headerChipBorder: string;
  headerChipText: string;
  sectionTitle: string;
  surface: string;
  surfaceBorder: string;
  cardLabel: string;
  cardShadow: ViewStyle;
  refreshTint: string;
};

const SOFT_SHADOW: ViewStyle = {
  shadowColor: '#0f172a',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 14,
  elevation: 4,
};

const DARK_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.35,
  shadowRadius: 20,
  elevation: 10,
};

export function buildTheme(mode: ThemeMode, accentId: AccentId): ThemeTokens {
  const a = ACCENTS[accentId] ?? ACCENTS[DEFAULT_ACCENT];
  const base = { mode, accentId, accent: a.main, accentDark: a.dark };

  if (mode === 'claro') {
    return {
      ...base,
      isDark: false,
      bg: ['#f4f7fb', '#ffffff'],
      headerAsCard: true,
      headerText: '#ffffff',
      headerMuted: 'rgba(255,255,255,0.78)',
      headerBtnBg: 'rgba(255,255,255,0.20)',
      headerBtnBorder: 'rgba(255,255,255,0.28)',
      headerBtnIcon: '#ffffff',
      headerChipBg: 'rgba(255,255,255,0.20)',
      headerChipBorder: 'rgba(255,255,255,0.30)',
      headerChipText: '#ffffff',
      sectionTitle: '#64748b',
      surface: '#ffffff',
      surfaceBorder: '#e8edf4',
      cardLabel: '#16214d',
      cardShadow: SOFT_SHADOW,
      refreshTint: a.main,
    };
  }

  if (mode === 'web') {
    // Igual que el inicio de la web: fondo azul marino y tarjetas blancas.
    return {
      ...base,
      isDark: true,
      bg: ['#16214d', '#233163', '#2b3f86'],
      headerAsCard: false,
      headerText: '#ffffff',
      headerMuted: 'rgba(255,255,255,0.72)',
      headerBtnBg: 'rgba(255,255,255,0.10)',
      headerBtnBorder: 'rgba(255,255,255,0.18)',
      headerBtnIcon: '#ffffff',
      headerChipBg: hexA(a.main, 0.18),
      headerChipBorder: hexA(a.main, 0.5),
      headerChipText: '#ffffff',
      sectionTitle: 'rgba(255,255,255,0.6)',
      surface: 'rgba(255,255,255,0.97)',
      surfaceBorder: 'rgba(255,255,255,0.5)',
      cardLabel: '#1e293b',
      cardShadow: DARK_SHADOW,
      refreshTint: '#ffffff',
    };
  }

  // oscuro (el estilo que tenia la app)
  return {
    ...base,
    isDark: true,
    bg: ['#0b1130', '#16214d', '#1c2a63'],
    headerAsCard: false,
    headerText: '#ffffff',
    headerMuted: 'rgba(244,246,251,0.62)',
    headerBtnBg: 'rgba(255,255,255,0.07)',
    headerBtnBorder: 'rgba(255,255,255,0.16)',
    headerBtnIcon: '#ffffff',
    headerChipBg: hexA(a.main, 0.16),
    headerChipBorder: hexA(a.main, 0.45),
    headerChipText: '#ffffff',
    sectionTitle: 'rgba(244,246,251,0.5)',
    surface: 'rgba(255,255,255,0.07)',
    surfaceBorder: 'rgba(255,255,255,0.16)',
    cardLabel: '#f4f6fb',
    cardShadow: DARK_SHADOW,
    refreshTint: a.main,
  };
}
