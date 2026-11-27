import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { logEvent } from './activityLog';
import { purgeOldCache } from './offlineCache';
import { setAhorroManual, setCellularSlow, setQualityListener } from './netQuality';

/**
 * Guardian de la app: vigila que siga rapida y estable, se autocorrige y deja todo en la bitacora.
 *  - Atrapa errores no controlados (los anota en la bitacora y deja que la app siga).
 *  - Detecta lentitud del telefono (la pantalla se "congela"): libera recursos, pausa cargas opcionales y avisa.
 *  - Detecta señal baja (por lo que tardan las respuestas y por red 2G/3G): modo ahorro.
 *  - Limpia datos guardados muy viejos para que la app no se vaya haciendo pesada.
 * Todo es local y seguro: no ejecuta codigo remoto ni toca datos del servidor.
 */
export type Notice = { id: number; text: string; kind: 'info' | 'warn'; action?: 'restart' };

let notice: Notice | null = null;
let noticeId = 0;
const subs = new Set<() => void>();

function emit(text: string, kind: Notice['kind'], action?: Notice['action'], ttlMs = 9000) {
  const id = ++noticeId;
  notice = { id, text, kind, action };
  subs.forEach((f) => f());
  if (ttlMs > 0) {
    setTimeout(() => {
      if (notice && notice.id === id) dismissNotice();
    }, ttlMs);
  }
}

export function dismissNotice() {
  notice = null;
  subs.forEach((f) => f());
}

export function useGuardianNotice(): Notice | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => notice
  );
}

/** Limpia lo guardado hace mas de `dias` (menos las preferencias de la persona). Devuelve cuantos registros quito. */
async function cleanup(dias: number): Promise<number> {
  try {
    return await purgeOldCache(dias * 24 * 3600 * 1000);
  } catch {
    return 0;
  }
}

let ahorroTimer: ReturnType<typeof setTimeout> | null = null;
const episodes: number[] = [];

async function liberarRecursos(lagMs: number, congelamientos: number) {
  const now = Date.now();
  episodes.push(now);
  while (episodes.length && now - episodes[0] > 30 * 60 * 1000) episodes.shift();

  setAhorroManual(true); // pausa la precarga y otras cargas opcionales
  if (ahorroTimer) clearTimeout(ahorroTimer);
  ahorroTimer = setTimeout(() => setAhorroManual(false), 10 * 60 * 1000);

  const quitados = await cleanup(7); // en emergencia se limpia lo de mas de 7 dias
  logEvent('app_lenta', {
    text: `Lentitud detectada: ${congelamientos} congelamientos en 30 s (pico ${lagMs} ms). Autocorrección: se liberó caché antigua (${quitados} registros) y se pausaron las cargas opcionales por 10 min.`,
  });

  if (episodes.length >= 3) {
    emit('La app sigue lenta. Reiniciarla suele resolverlo y no pierdes nada de lo guardado.', 'warn', 'restart', 0);
  } else {
    emit('Detecté lentitud y liberé recursos para que vaya más rápido. Ya quedó registrado.', 'info');
  }
}

export function startGuardian(): () => void {
  if (Platform.OS === 'web') return () => {};

  // 1) Errores no controlados -> bitacora (y se deja el manejo original para que nada cambie).
  try {
    const EU = (globalThis as any).ErrorUtils;
    const prev = EU?.getGlobalHandler?.();
    EU?.setGlobalHandler?.((e: any, isFatal?: boolean) => {
      try {
        const stack = String(e?.stack ?? '').split('\n').slice(0, 3).join(' ¦ ');
        logEvent('error_app', { text: `${isFatal ? 'FATAL: ' : ''}${String(e?.message ?? e)} | ${stack}`.slice(0, 700) });
      } catch {
        // nunca estorbar
      }
      if (prev) prev(e, isFatal);
    });
  } catch {
    // no critico
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rt = require('promise/setimmediate/rejection-tracking');
    rt.enable({
      allRejections: true,
      onUnhandled: (_id: number, err: any) => {
        logEvent('error_app', { text: `Promesa sin atender: ${String(err?.message ?? err)}`.slice(0, 500) });
      },
    });
  } catch {
    // no critico
  }

  // 2) Señal baja: por tiempos de respuesta (netQuality) y por tipo de red.
  setQualityListener((q) => {
    if (q === 'slow') {
      logEvent('senal_baja', { text: 'Señal baja detectada: modo ahorro (más paciencia, reintentos y sin precarga).' });
      emit('Señal baja: la app entró en modo ahorro para funcionar mejor.', 'info');
    } else {
      logEvent('senal_recuperada', { text: 'La señal volvió a la normalidad.' });
    }
  });
  const unsubNet = NetInfo.addEventListener((s) => {
    const gen = (s.details as any)?.cellularGeneration;
    setCellularSlow(s.type === 'cellular' && (gen === '2g' || gen === '3g'));
  });

  // 3) Vigilante de lentitud: si la pantalla se "congela" varias veces en poco tiempo, libera recursos y avisa.
  let last = Date.now();
  let spikes: number[] = [];
  let lastAct = 0;
  const sub = AppState.addEventListener('change', (st) => {
    if (st === 'active') {
      last = Date.now();
      spikes = [];
    }
  });
  const iv = setInterval(() => {
    const now = Date.now();
    const lag = now - last - 1000;
    last = now;
    if (AppState.currentState !== 'active') return;
    if (lag > 700) {
      spikes.push(now);
      spikes = spikes.filter((t) => now - t < 30000);
      if (spikes.length >= 4 && now - lastAct > 5 * 60 * 1000) {
        lastAct = now;
        liberarRecursos(Math.round(lag), spikes.length).catch(() => {});
      }
    }
  }, 1000);

  // 4) Limpieza preventiva al arrancar (datos guardados de hace mas de 30 dias).
  const t = setTimeout(async () => {
    const n = await cleanup(30);
    if (n > 0) logEvent('autocorreccion', { text: `Limpieza automática: se quitaron ${n} datos guardados de hace más de 30 días para mantener la app ligera.` });
  }, 20000);

  return () => {
    unsubNet();
    sub.remove();
    clearInterval(iv);
    clearTimeout(t);
    setQualityListener(null);
  };
}
