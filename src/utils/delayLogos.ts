import { api } from '../api/client';
import { getCache, saveCache } from './offlineCache';
import type { NoticeLogo } from './delayNotice';

/**
 * Logos de aerolinea para el aviso de retraso, SIN meterlos dentro de la app (para no hacerla pesada).
 *
 *  - El logo se pide al servidor (op/api/delay/logos.php) solo cuando hace falta, ya recortado como lo
 *    deja la web, y se guarda en el SQLite del telefono (el mismo cache que ya usan las demas pantallas).
 *  - Cada logo trae una "version": si en el servidor lo reemplazan o suben uno nuevo, la app lo nota y lo baja de nuevo.
 *    Si no cambio, el servidor contesta sin mandar la imagen (casi no gasta datos).
 *  - Sin internet se usa lo que ya se haya guardado. Con `prefetchAirlineLogos` se bajan por adelantado los de las
 *    aerolineas de las O.S. abiertas, para que el aviso salga completo aunque se quede sin senal.
 */
type Cached = { v: string; w: number; h: number; data: string } | { none: true; at: number };

const NONE_TTL_MS = 6 * 60 * 60 * 1000; // si no hay logo, no se vuelve a preguntar en 6 h
const REFRESH_MIN_MS = 10 * 60 * 1000; // revisar si cambio, como maximo cada 10 min por aerolinea

const mem = new Map<string, NoticeLogo>(); // en memoria: la pantalla no vuelve a leer SQLite cada vez
const lastCheck = new Map<string, number>();

function normName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '');
}

const cacheKey = (name: string) => `airline_logo_${normName(name)}`;

function toLogo(c: Cached): NoticeLogo {
  if ('none' in c) return null;
  return { uri: `data:image/png;base64,${c.data}`, w: c.w, h: c.h };
}

/** Lo que ya hay guardado en el telefono (rapido, sin internet). null si no hay. */
export async function getCachedLogo(name: string): Promise<NoticeLogo> {
  const key = normName(name);
  if (!key) return null;
  if (mem.has(key)) return mem.get(key) ?? null;
  const hit = await getCache<Cached>(cacheKey(name));
  if (!hit) return null;
  const logo = toLogo(hit.data);
  mem.set(key, logo);
  return logo;
}

/**
 * Pregunta al servidor si hay logo nuevo o cambiado y lo guarda. Devuelve el logo vigente (o el que ya habia).
 * Nunca lanza error: ante cualquier falla de red devuelve lo guardado.
 */
export async function refreshLogo(name: string, force = false): Promise<NoticeLogo> {
  const key = normName(name);
  if (!key) return null;
  const now = Date.now();
  if (!force && now - (lastCheck.get(key) ?? 0) < REFRESH_MIN_MS) return getCachedLogo(name);

  const hit = await getCache<Cached>(cacheKey(name));
  const cached = hit?.data;
  if (cached && 'none' in cached && now - cached.at < NONE_TTL_MS && !force) {
    lastCheck.set(key, now);
    return null;
  }
  const have = cached && !('none' in cached) ? cached.v : '';

  try {
    const { data } = await api.get<{
      ok: boolean;
      found?: boolean;
      same?: boolean;
      v?: string;
      w?: number;
      h?: number;
      data?: string;
    }>('/delay/logos.php', { params: { name, have }, timeout: 15000 });
    lastCheck.set(key, now);
    if (!data.ok) return getCachedLogo(name);
    if (!data.found) {
      await saveCache<Cached>(cacheKey(name), { none: true, at: now });
      mem.set(key, null);
      return null;
    }
    if (data.same && cached && !('none' in cached)) {
      return getCachedLogo(name); // sigue vigente
    }
    if (data.data && data.v && data.w && data.h) {
      const fresh: Cached = { v: data.v, w: data.w, h: data.h, data: data.data };
      await saveCache<Cached>(cacheKey(name), fresh);
      const logo = toLogo(fresh);
      mem.set(key, logo);
      return logo;
    }
  } catch (e) {
    // Sin senal o servidor sin actualizar: se queda con lo guardado.
  }
  return getCachedLogo(name);
}

/** Baja por adelantado los logos de varias aerolineas (en segundo plano, de uno en uno, maximo 15). */
export async function prefetchAirlineLogos(names: string[]): Promise<void> {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const n of names) {
    const k = normName(n ?? '');
    if (k && !seen.has(k)) {
      seen.add(k);
      list.push(n);
    }
    if (list.length >= 15) break;
  }
  for (const n of list) {
    try {
      await refreshLogo(n);
    } catch (e) {
      // sigue con la siguiente
    }
  }
}
