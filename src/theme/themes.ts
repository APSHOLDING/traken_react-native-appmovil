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

/** Tokens generales (pantallas internas y componentes). Ver GUIA-TEMAS.md */
export type InnerTokens = {
  /** Texto principal sobre el fondo o sobre una tarjeta. */
  text: string;
  textMuted: string;
  textFaint: string;
  /** Texto/icono sobre algo con el color del tema (botones, chips rellenos): siempre blanco. */
  onAccent: string;
  /** Fondo de tarjetas / bloques. */
  card: string;
  cardBorder: string;
  /** Fondo de un bloque seleccionado o resaltado (un poco mas marcado que card). */
  cardStrong: string;
  inputBg: string;
  inputBorder: string;
  placeholder: string;
  divider: string;
  /** Color del tema como TEXTO o icono sobre el fondo (legible en claro y oscuro). */
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  danger: string;
  dangerText: string;
  dangerSoft: string;
  dangerBorder: string;
  ok: string;
  okText: string;
  okSoft: string;
  okBorder: string;
  warn: string;
  warnText: string;
  warnSoft: string;
  warnBorder: string;
  /** Fondo detras de los modales. */
  overlay: string;
  /** Fondo de la hoja/modal. */
  modalBg: string;
  /** Sombra de tarjetas (suave en claro, fuerte en oscuro). */
  shadowCard: ViewStyle;
};

function inner(isDark: boolean, accent: string, accentDark: string): InnerTokens {
  if (isDark) {
    return {
      text: '#f4f6fb',
      textMuted: 'rgba(244,246,251,0.62)',
      textFaint: 'rgba(244,246,251,0.40)',
      onAccent: '#ffffff',
      card: 'rgba(255,255,255,0.07)',
      cardBorder: 'rgba(255,255,255,0.16)',
      cardStrong: 'rgba(255,255,255,0.13)',
      inputBg: 'rgba(255,255,255,0.09)',
      inputBorder: 'rgba(255,255,255,0.12)',
      placeholder: 'rgba(244,246,251,0.38)',
      divider: 'rgba(255,255,255,0.12)',
      accentText: accent,
      accentSoft: hexA(accent, 0.14),
      accentBorder: hexA(accent, 0.4),
      danger: '#dc2626',
      dangerText: '#ffb4bb',
      dangerSoft: 'rgba(220,38,38,0.14)',
      dangerBorder: 'rgba(220,38,38,0.35)',
      ok: '#16a34a',
      okText: '#4ade80',
      okSoft: 'rgba(22,163,74,0.18)',
      okBorder: 'rgba(22,163,74,0.4)',
      warn: '#f59e0b',
      warnText: '#fde68a',
      warnSoft: 'rgba(245,158,11,0.16)',
      warnBorder: 'rgba(245,158,11,0.4)',
      overlay: 'rgba(0,0,0,0.6)',
      modalBg: '#1b2656',
      shadowCard: DARK_SHADOW,
    };
  }
  return {
    text: '#16214d',
    textMuted: '#64748b',
    textFaint: '#94a3b8',
    onAccent: '#ffffff',
    card: '#ffffff',
    cardBorder: '#e8edf4',
    cardStrong: '#f1f5f9',
    inputBg: '#f1f5f9',
    inputBorder: '#e2e8f0',
    placeholder: '#94a3b8',
    divider: '#e2e8f0',
    accentText: accentDark,
    accentSoft: hexA(accent, 0.12),
    accentBorder: hexA(accent, 0.35),
    danger: '#dc2626',
    dangerText: '#b91c1c',
    dangerSoft: '#fef2f2',
    dangerBorder: '#fecaca',
    ok: '#16a34a',
    okText: '#15803d',
    okSoft: '#f0fdf4',
    okBorder: '#bbf7d0',
    warn: '#f59e0b',
    warnText: '#b45309',
    warnSoft: '#fffbeb',
    warnBorder: '#fde68a',
    overlay: 'rgba(15,23,42,0.5)',
    modalBg: '#ffffff',
    shadowCard: SOFT_SHADOW,
  };
}

export type ThemeTokens = InnerTokens & {
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

export function buildTheme(mode: ThemeMode, accentId: AccentId): ThemeTokens {
  const a = ACCENTS[accentId] ?? ACCENTS[DEFAULT_ACCENT];
  const base = { mode, accentId, accent: a.main, accentDark: a.dark };
  // Dentro de las pantallas internas 'web' y 'oscuro' comparten paleta oscura; solo 'claro' es claro.
  const innerT = inner(mode !== 'claro', a.main, a.dark);

  if (mode === 'claro') {
    return {
      ...base,
      ...innerT,
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
      ...innerT,
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
    ...innerT,
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
