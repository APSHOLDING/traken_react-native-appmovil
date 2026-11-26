import { AppState, Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';
import { api, getApiEnvironment } from '../api/client';

/**
 * COLA DE ENVIO ("outbox") para trabajar SIN INTERNET sin perder ni duplicar nada.
 *
 * Como funciona:
 *  1. Cada accion de escritura (agregar pasajero, transporte, comentario, cerrar O.S.)
 *     se manda con un identificador unico propio (cabecera X-Idempotency-Key).
 *  2. Si no hay internet (o la señal se cae a media peticion) la accion se guarda en una
 *     base SQLite del telefono, con la hora REAL en que se hizo, y la persona sigue
 *     trabajando normal.
 *  3. Al volver la conexion (o al abrir la app / cada minuto) se envia en el MISMO orden en
 *     que se hizo, con la MISMA clave. El servidor (op/api/include/idempotency.php) reconoce
 *     la clave: si ya habia procesado esa accion devuelve el mismo resultado SIN repetirla,
 *     asi que un reintento por mala señal jamas duplica una habitacion, un comentario, etc.
 *  4. En la Bitacora del sistema queda marcada como hecha desde la app y "sin conexion", con
 *     la hora real (cabeceras X-Offline / X-Client-Time -> api_audit()).
 *
 * Reglas para no perder datos:
 *  - Una accion solo se borra de la cola cuando el servidor contesta que SI se guardo.
 *  - Error de red / timeout / 5xx / 429 / 409 "procesando": se conserva y se reintenta.
 *  - 401 (sesion vencida): se conserva todo y se envia cuando la misma persona vuelva a entrar.
 *  - El servidor la rechazo por una regla de negocio (ej. "ya no hay habitaciones"): NO se
 *    reintenta a ciegas ni se borra: pasa a "requiere revision" y la persona decide.
 *  - Cada accion pertenece a un usuario y a un ambiente (sandbox/produccion): nunca se
 *    envia con la sesion de otra persona ni al servidor equivocado.
 */

export type OutboxStatus = 'pending' | 'failed';

export type OutboxItem = {
  id: string;
  kind: string;
  label: string;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  lastError: string | null;
};

export type OutboxSummary = {
  pending: number;
  failed: number;
  syncing: boolean;
  /** Cuantas acciones se enviaron bien desde la ultima vez que se vio el resumen. */
  justSynced: number;
};

type Row = {
  id: string;
  user_id: number;
  env: string;
  kind: string;
  label: string;
  url: string;
  body: string;
  created_at: number;
  attempts: number;
  status: string;
  last_error: string | null;
};

const DB_NAME = 'traken_outbox.db';
const MAX_SERVER_ERROR_ATTEMPTS = 8; // 5xx repetidos: despues de esto pasa a "requiere revision"
const POLL_MS = 60_000;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let currentUserId: number | null = null;
let running = false;
let syncing = false;
let justSynced = 0;
let failStreak = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: OutboxSummary) => void>();

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS outbox (
           id TEXT PRIMARY KEY NOT NULL,
           user_id INTEGER NOT NULL,
           env TEXT NOT NULL,
           kind TEXT NOT NULL,
           label TEXT NOT NULL,
           url TEXT NOT NULL,
           body TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           attempts INTEGER NOT NULL DEFAULT 0,
           status TEXT NOT NULL DEFAULT 'pending',
           last_error TEXT
         );`
      );
      return db;
    });
  }
  return dbPromise;
}

/** Identificador unico de la operacion: 8 (hora) + 16 (azar) caracteres [a-z0-9]. */
function newId(): string {
  let rnd = '';
  while (rnd.length < 16) rnd += Math.random().toString(36).slice(2);
  return Date.now().toString(36).padStart(8, '0') + rnd.slice(0, 16);
}

/** Falla "transitoria": sin respuesta del servidor (sin señal / timeout) o el servidor pide reintentar. */
function isTransient(e: any): boolean {
  const status: number | undefined = e?.response?.status;
  if (!e?.response) return true;
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) return true;
  if (status === 409 && e.response?.data?.retry) return true;
  return false;
}

function errorText(e: any): string {
  const d = e?.response?.data;
  if (typeof e?.userMessage === 'string' && e.userMessage) return e.userMessage;
  if (typeof d?.error === 'string' && d.error) return d.error;
  if (typeof d?.msg === 'string' && d.msg) return d.msg;
  return e?.response?.status ? `Error ${e.response.status} del servidor` : 'Sin conexión';
}

async function counts(): Promise<{ pending: number; failed: number }> {
  if (Platform.OS === 'web' || currentUserId === null) return { pending: 0, failed: 0 };
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ status: string; n: number }>(
      'SELECT status, COUNT(*) AS n FROM outbox WHERE user_id = ? AND env = ? GROUP BY status;',
      [currentUserId, getApiEnvironment()]
    );
    const out = { pending: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === 'pending') out.pending = r.n;
      if (r.status === 'failed') out.failed = r.n;
    }
    return out;
  } catch {
    return { pending: 0, failed: 0 };
  }
}

async function emit() {
  if (listeners.size === 0) return;
  const c = await counts();
  const summary: OutboxSummary = { ...c, syncing, justSynced };
  listeners.forEach((l) => l(summary));
}

export function subscribeOutbox(cb: (s: OutboxSummary) => void): () => void {
  listeners.add(cb);
  emit();
  return () => {
    listeners.delete(cb);
  };
}

/** Se llama al iniciar/cerrar sesion: la cola solo se envia con la sesion de su dueño. */
export function setOutboxUser(userId: number | null) {
  currentUserId = userId;
  failStreak = 0;
  justSynced = 0;
  emit();
  if (userId !== null) processOutbox();
}

export async function getOutboxItems(): Promise<OutboxItem[]> {
  if (Platform.OS === 'web' || currentUserId === null) return [];
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM outbox WHERE user_id = ? AND env = ? ORDER BY created_at ASC;',
      [currentUserId, getApiEnvironment()]
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      createdAt: r.created_at,
      attempts: r.attempts,
      status: r.status === 'failed' ? 'failed' : 'pending',
      lastError: r.last_error,
    }));
  } catch {
    return [];
  }
}

export async function retryOutboxItem(id: string) {
  try {
    const db = await getDb();
    await db.runAsync("UPDATE outbox SET status = 'pending', attempts = 0, last_error = NULL WHERE id = ?;", [id]);
  } catch {
    // No critico.
  }
  failStreak = 0;
  await emit();
  processOutbox();
}

/** Solo para acciones "requiere revision": la persona decide descartarla. */
export async function discardOutboxItem(id: string) {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM outbox WHERE id = ? AND status = 'failed';", [id]);
  } catch {
    // No critico.
  }
  await emit();
}

async function insertRow(id: string, spec: { kind: string; label: string; url: string; body: unknown }) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO outbox (id, user_id, env, kind, label, url, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
    [id, currentUserId as number, getApiEnvironment(), spec.kind, spec.label, spec.url, JSON.stringify(spec.body), Date.now()]
  );
}

/**
 * Envia una escritura. Con internet: igual que siempre (devuelve la respuesta del servidor,
 * y los errores de servidor se lanzan como antes). Sin internet o con la señal caida: la
 * guarda en la cola y devuelve `queuedResult` para que la pantalla siga normal.
 */
export async function sendOrQueue<T>(
  spec: { kind: string; label: string; url: string; body: unknown },
  queuedResult: T
): Promise<T> {
  // Web o sin sesion conocida: sin cola, comportamiento de siempre.
  if (Platform.OS === 'web' || currentUserId === null) {
    const { data } = await api.post<T>(spec.url, spec.body);
    return data;
  }

  const id = newId();
  let offline = false;
  try {
    const net = await NetInfo.fetch();
    offline = net.isConnected === false || net.isInternetReachable === false;
  } catch {
    offline = false;
  }

  if (!offline) {
    try {
      const { data } = await api.post<T>(spec.url, spec.body, { headers: { 'X-Idempotency-Key': id } });
      return data;
    } catch (e) {
      if (!isTransient(e)) throw e; // el servidor contesto con un error real: se muestra como siempre
    }
  }

  await insertRow(id, spec);
  await emit();
  scheduleRetry(5_000);
  return queuedResult;
}

function scheduleRetry(ms: number) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    processOutbox();
  }, ms);
}

async function markFailed(id: string, message: string) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status = 'failed', last_error = ? WHERE id = ?;", [message.slice(0, 300), id]);
}

/** Envia lo pendiente, en orden. Segura de llamar muchas veces: solo corre una a la vez. */
export async function processOutbox(): Promise<void> {
  if (Platform.OS === 'web' || running || currentUserId === null) return;
  running = true;
  syncing = true;
  await emit();
  let stoppedForRetry = false;
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      "SELECT * FROM outbox WHERE user_id = ? AND env = ? AND status = 'pending' ORDER BY created_at ASC;",
      [currentUserId, getApiEnvironment()]
    );

    for (const row of rows) {
      try {
        const { data } = await api.post(row.url, JSON.parse(row.body), {
          headers: {
            'X-Idempotency-Key': row.id,
            'X-Offline': '1',
            'X-Client-Time': new Date(row.created_at).toISOString(),
          },
        });
        if (data && data.ok === false) {
          // Respuesta 200 pero el servidor no la acepto (regla de negocio): requiere revision.
          await markFailed(row.id, data.error ?? data.msg ?? 'El servidor no aceptó la operación.');
          continue;
        }
        await db.runAsync('DELETE FROM outbox WHERE id = ?;', [row.id]); // solo se borra si SI se guardo
        justSynced += 1;
        failStreak = 0;
        await emit();
      } catch (e: any) {
        const status: number | undefined = e?.response?.status;
        if (status === 401) {
          stoppedForRetry = false; // sesion vencida: todo se conserva; se reanuda al volver a entrar
          break;
        }
        if (isTransient(e)) {
          if (e?.response) {
            const attempts = row.attempts + 1;
            if (attempts >= MAX_SERVER_ERROR_ATTEMPTS) {
              await markFailed(row.id, errorText(e));
              continue;
            }
            await db.runAsync('UPDATE outbox SET attempts = ?, last_error = ? WHERE id = ?;', [attempts, errorText(e), row.id]);
          }
          stoppedForRetry = true; // se respeta el orden: no se salta esta accion
          break;
        }
        await markFailed(row.id, errorText(e)); // 4xx: el servidor la rechazo
      }
    }
  } catch {
    stoppedForRetry = true;
  } finally {
    running = false;
    syncing = false;
    await emit();
  }

  if (stoppedForRetry) {
    failStreak += 1;
    scheduleRetry(Math.min(300, 15 * 2 ** Math.min(failStreak, 5)) * 1000);
  }
}

/** Marca el resumen como "ya visto" (apaga el aviso verde de "enviado"). */
export function clearJustSynced() {
  justSynced = 0;
  emit();
}

/** Engancha los disparadores: volver la conexion, abrir la app y un reloj de respaldo. */
export function startOutboxMonitor(): () => void {
  if (Platform.OS === 'web') return () => {};
  const unsubNet = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      failStreak = 0;
      processOutbox();
    }
  });
  const unsubApp = AppState.addEventListener('change', (s) => {
    if (s === 'active') processOutbox();
  });
  const poll = setInterval(() => processOutbox(), POLL_MS);
  return () => {
    unsubNet();
    unsubApp.remove();
    clearInterval(poll);
    if (retryTimer) clearTimeout(retryTimer);
  };
}
