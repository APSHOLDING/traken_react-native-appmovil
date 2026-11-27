import { useEffect } from 'react';
import { logEvent } from './activityLog';

/** Anota en la bitacora lo que la persona busca en una pantalla (cuando deja de escribir ~1.5 s). */
export function useTrackSearch(screen: string, query: string) {
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => logEvent('busqueda', { screen, text: `Buscó: "${q.slice(0, 80)}"` }), 1500);
    return () => clearTimeout(t);
  }, [screen, query]);
}

/** Anota una accion concreta (filtro, boton, etc.) con sus datos. */
export function track(type: string, text: string, ctx: { screen?: string; folio?: number; id_airport?: number } = {}) {
  logEvent(type, { text, ...ctx });
}
