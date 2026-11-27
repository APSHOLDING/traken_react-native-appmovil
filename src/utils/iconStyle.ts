import { useSyncExternalStore } from 'react';
import { getCache, saveCache } from './offlineCache';

/**
 * Estilo de iconos de TODA la app: 'classic' (contorno, como siempre) o 'filled' (rellenos, con pastilla de color).
 * Se elige en Inicio > Personalizar > Iconos, se guarda en el telefono y se aplica al instante en todas las pantallas.
 */
export type IconStyle = 'classic' | 'filled';

let current: IconStyle = 'classic';
const subs = new Set<() => void>();

export function getIconStyle(): IconStyle {
  return current;
}

export function setIconStyle(next: IconStyle, persist = true) {
  if (next === current) return;
  current = next;
  subs.forEach((f) => f());
  if (persist) saveCache('icon_style', next).catch(() => {});
}

export function useIconStyle(): IconStyle {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => current
  );
}

// Al arrancar la app se recupera la ultima eleccion guardada.
getCache<string>('icon_style')
  .then((c) => {
    if (c && (c.data === 'filled' || c.data === 'classic')) setIconStyle(c.data, false);
  })
  .catch(() => {});
