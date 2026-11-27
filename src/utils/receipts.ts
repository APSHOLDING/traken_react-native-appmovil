import { getCache, saveCache } from './offlineCache';

/**
 * Comprobantes de envio: cada vez que algo SI llega al servidor (al instante o al volver el internet) se guarda aqui
 * con la hora en que se capturo, la hora en que se subio y lo que el servidor confirmo. Es la prueba, en el telefono,
 * de que "si se subio". Se conservan los ultimos 40 por persona.
 */
export type Receipt = {
  id: string;
  label: string;
  createdAt: number; // cuando la persona lo capturo
  syncedAt: number; // cuando el servidor lo recibio
  viaQueue: boolean; // true = se hizo sin internet y se envio despues
  msg: string; // confirmacion del servidor
  folio?: number;
};

const key = (uid: number) => `sync_receipts_${uid}`;
const listeners = new Set<() => void>();
const openers = new Set<() => void>();

export async function addReceipt(uid: number | null, r: Receipt): Promise<void> {
  if (uid === null) return;
  try {
    const cur = await getCache<Receipt[]>(key(uid));
    const list = [r, ...(cur?.data ?? []).filter((x) => x.id !== r.id)].slice(0, 40);
    await saveCache(key(uid), list);
    listeners.forEach((f) => f());
  } catch {
    // un comprobante nunca debe romper un envio
  }
}

export async function getReceipts(uid: number | null): Promise<Receipt[]> {
  if (uid === null) return [];
  const cur = await getCache<Receipt[]>(key(uid));
  return cur?.data ?? [];
}

export function onReceiptsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Abre el panel de envios desde cualquier pantalla (el panel vive en el aviso global). */
export function openReceipts() {
  openers.forEach((f) => f());
}
export function onOpenReceipts(fn: () => void): () => void {
  openers.add(fn);
  return () => {
    openers.delete(fn);
  };
}

export function hhmmss(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
