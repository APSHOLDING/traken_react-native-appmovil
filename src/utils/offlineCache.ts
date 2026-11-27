import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

/**
 * Cache generico para pantallas de datos (Ordenes Abiertas, Crear O.S.,
 * Agregar Pax, y las que sigan): cada pantalla guarda aqui lo ultimo que
 * cargo con exito, y si la proxima peticion falla por falta de señal, se
 * muestra esto en vez de una pantalla vacia/de error. Es la version "app
 * nativa" del mismo objetivo que el service worker le da a la version web.
 *
 * Motor: SQLite (expo-sqlite), no AsyncStorage -- misma idea de fondo que
 * usan apps como WhatsApp para guardar datos en el telefono: una base de
 * datos real en vez de banderas sueltas. Aqui es una sola tabla
 * llave/valor porque lo que se guarda son "fotos" de la ultima respuesta
 * buena de cada pantalla (no hace falta relacionar tablas entre si para
 * esto), pero corre sobre el mismo motor de base de datos.
 */
const DB_NAME = 'traken_cache.db';

let dbPromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS cache (
           key TEXT PRIMARY KEY NOT NULL,
           data TEXT NOT NULL,
           saved_at INTEGER NOT NULL
         );`
      );
      return db;
    });
  }
  return dbPromise;
}

type CacheEntry<T> = { data: T; savedAt: number };

export async function saveCache<T>(key: string, data: T) {
  // En web ya existe el service worker para esto (ver comentario arriba) --
  // no se usa SQLite aqui tambien, para no depender de que su WASM cargue
  // bien bajo el bundler de Metro para web.
  if (Platform.OS === 'web') return;
  try {
    const db = await getDb();
    const savedAt = Date.now();
    await db.runAsync(
      'INSERT INTO cache (key, data, saved_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at;',
      [key, JSON.stringify(data), savedAt]
    );
  } catch (e) {
    // No es critico: en el peor caso no hay nada que mostrar offline.
  }
}

export async function getCache<T>(key: string): Promise<CacheEntry<T> | null> {
  if (Platform.OS === 'web') return null;
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ data: string; saved_at: number }>(
      'SELECT data, saved_at FROM cache WHERE key = ?;',
      [key]
    );
    if (!row) return null;
    try {
      return { data: JSON.parse(row.data) as T, savedAt: row.saved_at };
    } catch {
      // Dato dañado: se borra solo para que no vuelva a estorbar (la pantalla simplemente lo pide de nuevo).
      await db.runAsync('DELETE FROM cache WHERE key = ?;', [key]).catch(() => {});
      return null;
    }
  } catch (e) {
    return null;
  }
}

/** Quita lo guardado hace mas de maxAgeMs, SIN tocar las preferencias de la persona. Devuelve cuantos registros borro. */
export async function purgeOldCache(maxAgeMs: number): Promise<number> {
  if (Platform.OS === 'web') return 0;
  const KEEP = ['home_layout_', 'icon_style', 'home_header', 'quick_capture_draft', 'warm_last_run'];
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string }>('SELECT key FROM cache WHERE saved_at < ?;', [Date.now() - maxAgeMs]);
    let n = 0;
    for (const r of rows) {
      if (KEEP.some((k) => r.key.startsWith(k))) continue;
      await db.runAsync('DELETE FROM cache WHERE key = ?;', [r.key]);
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}
