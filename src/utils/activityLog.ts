import { AppState, Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { api, getApiEnvironment } from '../api/client';

/**
 * Bitacora de actividad de la app: cada cosa que hace la persona (abrir una
 * pantalla, iniciar/cerrar sesion, guardar algo SIN internet, usar la captura
 * rapida, generar un aviso...) se anota primero en el telefono (SQLite) y de
 * ahi se manda al servidor por lotes (op/api/audit/mobileEvents.php), donde
 * queda en la bitacora general de Traken (Admin > Bitacora, origen "Movil").
 *
 * - NUNCA se pierde: el evento se borra del telefono solo cuando el servidor
 *   confirma que ya lo guardo (y el servidor no repite eventos por su id).
 * - Funciona sin internet: se acumula y sale solo al volver la señal.
 * - Ligera: una fila chica por evento, envio en lotes y nunca lanza errores
 *   ni frena la pantalla.
 * Las acciones de datos (agregar pax, cerrar O.S...) YA las audita el servidor
 * al recibirlas; esto agrega lo demas y la hora real de lo hecho sin internet.
 */
const DB_NAME = 'traken_activity.db';
const MAX_ROWS = 3000;
const BATCH = 100;
const POLL_MS = 120_000;
const FLUSH_DELAY_MS = 20_000;

export type ActivityData = {
  screen?: string;
  folio?: number;
  id_airport?: number;
  text?: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let uid: number | null = null;
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS events (
           id TEXT PRIMARY KEY NOT NULL,
           user_id INTEGER NOT NULL,
           env TEXT NOT NULL,
           t TEXT NOT NULL,
           type TEXT NOT NULL,
           screen TEXT,
           folio INTEGER,
           id_airport INTEGER,
           text TEXT
         );`
      );
      return db;
    });
  }
  return dbPromise;
}

function newId(): string {
  let rnd = '';
  while (rnd.length < 12) rnd += Math.random().toString(36).slice(2);
  return Date.now().toString(36) + rnd.slice(0, 12);
}

/** Se llama al iniciar/cerrar sesion: los eventos pertenecen a quien los hizo. */
export function setActivityUser(userId: number | null) {
  uid = userId;
  if (userId !== null) scheduleFlush(3_000);
}

/** Datos del telefono/app para soporte (version, canal y actualizacion que esta usando). */
function deviceInfo(): string {
  try {
    const upd = Updates.updateId ? Updates.updateId.slice(0, 8) : 'embebida';
    return `Equipo: ${Platform.OS} ${String(Platform.Version)} | App ${Constants.expoConfig?.version ?? '?'} | canal ${Updates.channel ?? '-'} | actualizacion ${upd}`;
  } catch {
    return '';
  }
}

/** Anota un evento. Nunca lanza error ni espera al servidor. */
export function logEvent(type: string, data: ActivityData = {}): void {
  if (Platform.OS === 'web' || uid === null) return;
  const userId = uid;
  (async () => {
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO events (id, user_id, env, t, type, screen, folio, id_airport, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
        [
          newId(),
          userId,
          getApiEnvironment(),
          new Date().toISOString(),
          type,
          data.screen ?? null,
          data.folio ?? null,
          data.id_airport ?? null,
          (() => {
            const base = data.text ?? '';
            const full = type === 'app_abierta' || type === 'inicio_sesion' ? (base ? base + ' | ' : '') + deviceInfo() : base;
            return full ? full.slice(0, 900) : null;
          })(),
        ]
      );
      // Tope: si por semanas no hubo señal, se conservan los mas recientes.
      await db.runAsync(
        'DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY t DESC LIMIT -1 OFFSET ?);',
        [MAX_ROWS]
      );
      scheduleFlush(FLUSH_DELAY_MS);
    } catch {
      // La bitacora nunca debe romper la app.
    }
  })();
}

function scheduleFlush(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flushEvents();
  }, ms);
}

type Row = { id: string; t: string; type: string; screen: string | null; folio: number | null; id_airport: number | null; text: string | null };

/** Manda lo pendiente al servidor. Segura de llamar muchas veces: corre una a la vez. */
export async function flushEvents(): Promise<void> {
  if (Platform.OS === 'web' || flushing || uid === null) return;
  flushing = true;
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false || net.isInternetReachable === false) return;
    const db = await getDb();
    for (let loop = 0; loop < 5; loop++) {
      const rows = await db.getAllAsync<Row>(
        'SELECT id, t, type, screen, folio, id_airport, text FROM events WHERE user_id = ? AND env = ? ORDER BY t ASC LIMIT ?;',
        [uid, getApiEnvironment(), BATCH]
      );
      if (rows.length === 0) break;
      const { data } = await api.post('/audit/mobileEvents.php', {
        events: rows.map((r) => ({
          id: r.id,
          t: r.t,
          type: r.type,
          screen: r.screen ?? undefined,
          folio: r.folio ?? undefined,
          id_airport: r.id_airport ?? undefined,
          text: r.text ?? undefined,
        })),
      });
      if (!data || data.ok === false || !Array.isArray(data.ids)) break;
      const ok: string[] = data.ids;
      if (ok.length === 0) break;
      for (const id of ok) await db.runAsync('DELETE FROM events WHERE id = ?;', [id]);
      if (rows.length < BATCH) break;
    }
  } catch {
    // Sin señal o el servidor aun no tiene el endpoint: todo se conserva y se reintenta.
  } finally {
    flushing = false;
  }
}

/** Reenvia al volver la señal, al abrir la app y cada cierto tiempo. */
export function startActivityMonitor(): () => void {
  if (Platform.OS === 'web') return () => {};
  const unsubNet = NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) scheduleFlush(2_000);
  });
  const unsubApp = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      logEvent('app_abierta');
      scheduleFlush(4_000);
    }
  });
  const poll = setInterval(() => flushEvents(), POLL_MS);
  return () => {
    unsubNet();
    unsubApp.remove();
    clearInterval(poll);
    if (timer) clearTimeout(timer);
  };
}
