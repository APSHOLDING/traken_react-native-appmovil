import { useSyncExternalStore } from 'react';

/**
 * Calidad de la conexion, medida con lo que REALMENTE tarda el servidor en contestar (no solo "hay/no hay internet").
 * - 'slow' si las ultimas respuestas tardan mucho, hay timeouts seguidos o la red movil es 2G/3G.
 * Con 'slow' la app entra en modo ahorro: espera mas antes de rendirse, reintenta y pospone cargas opcionales.
 * Sin imports de la app (para que client.ts pueda usarlo sin ciclos).
 */
export type NetQuality = 'good' | 'slow';

let quality: NetQuality = 'good';
let cellularSlow = false;
let ahorroManual = false;
const samples: { ms: number; ok: boolean }[] = [];
const subs = new Set<() => void>();
let onChange: ((q: NetQuality) => void) | null = null;

function notify() {
  subs.forEach((f) => f());
}

function evaluate() {
  const oks = samples.filter((s) => s.ok);
  const avg = oks.length ? oks.reduce((a, s) => a + s.ms, 0) / oks.length : 0;
  const fails = samples.filter((s) => !s.ok).length;
  const slow = cellularSlow || (samples.length >= 3 && (avg > 3500 || fails >= 3));
  if (slow !== (quality === 'slow')) {
    quality = slow ? 'slow' : 'good';
    notify();
    if (onChange) onChange(quality);
  }
}

/** Anota cuanto tardo una peticion (ok=false si fue timeout/sin respuesta). */
export function recordRequest(ms: number, ok: boolean) {
  samples.push({ ms, ok });
  if (samples.length > 6) samples.shift();
  evaluate();
}

export function setCellularSlow(v: boolean) {
  if (cellularSlow === v) return;
  cellularSlow = v;
  evaluate();
}

export function setQualityListener(fn: ((q: NetQuality) => void) | null) {
  onChange = fn;
}

export function getNetQuality(): NetQuality {
  return quality;
}

/** Ahorro forzado temporalmente (ej. la app detecto que el telefono esta lento). */
export function setAhorroManual(v: boolean) {
  if (ahorroManual === v) return;
  ahorroManual = v;
  notify();
}

/** true si conviene no hacer cargas opcionales (precarga, etc.). */
export function isSavingMode(): boolean {
  return quality === 'slow' || ahorroManual;
}

export function useNetQuality(): NetQuality {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => quality
  );
}
