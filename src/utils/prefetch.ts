import NetInfo from '@react-native-community/netinfo';
import {
  getHotelsForOrder,
  getOpenOrders,
  getOrderDetail,
  getOrderPax,
  getQrHistory,
  getQrHistoryDetail,
  getSlaList,
  getSlaState,
} from '../api/client';
import { getCache, saveCache } from './offlineCache';
import { isSavingMode } from './netQuality';

/**
 * Precarga en segundo plano: con internet, deja guardado en el telefono lo que
 * normalmente solo se guardaba AL ABRIR cada pantalla (SLA, Historial de QR,
 * Ordenes Abiertas y, de las primeras O.S., su detalle/pasajeros/hoteles). Asi
 * si despues no hay señal, esas pantallas ya traen datos casi al dia.
 *
 * Cuida que la app siga ligera y rapida: corre como maximo cada 10 minutos,
 * una peticion a la vez, solo si hay internet, y nunca lanza errores.
 * Las claves de cache son las MISMAS que usa cada pantalla.
 */
const WARM_KEY = 'warm_last_run';
const WARM_EVERY_MS = 10 * 60 * 1000;
const MAX_ORDERS = 12;
const MAX_QR = 8;

let running = false;

async function safe(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    // Silencioso: es un extra de velocidad, nunca debe romper nada.
  }
}

export async function warmOfflineData(force = false): Promise<void> {
  if (running) return;
  running = true;
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false || net.isInternetReachable === false) return;
    // Con señal baja o si el telefono va lento, la precarga espera (no se quita tiempo ni datos a lo que la persona esta haciendo).
    if (isSavingMode()) return;

    if (!force) {
      const last = await getCache<number>(WARM_KEY);
      if (last && Date.now() - last.savedAt < WARM_EVERY_MS) return;
    }
    await saveCache<number>(WARM_KEY, Date.now());

    // 1) Ordenes abiertas (mismo formato que OpenOrdersScreen).
    let orders: { folio: number; id_airport: number }[] = [];
    await safe(async () => {
      const res = await getOpenOrders();
      if (res.ok) {
        orders = (res.orders ?? []).map((o) => ({ folio: o.folio, id_airport: o.id_airport }));
        await saveCache('open_orders', { orders: res.orders ?? [], totalAnteriores: res.total_anteriores ?? 0 });
      }
    });

    // 2) Lista de SLA (ventana por defecto, 45 dias).
    await safe(async () => {
      const res = await getSlaList(45);
      if (res.ok) await saveCache('sla_list_45', res.items ?? []);
    });

    // 3) Historial de QR y detalle de los mas recientes.
    await safe(async () => {
      const res = await getQrHistory();
      if (!res.ok) return;
      const items = res.items ?? [];
      await saveCache('qr_history_list', items);
      for (const it of items.slice(0, MAX_QR)) {
        await safe(async () => {
          const d = await getQrHistoryDetail(it.folio, it.id_airport);
          if (d.ok) {
            await saveCache(`qr_history_detail_${it.folio}_${it.id_airport}`, {
              events: d.events ?? [],
              groups: d.groups ?? [],
            });
          }
        });
      }
    });

    // 4) Por cada una de las primeras O.S. abiertas: detalle, pasajeros, hoteles y SLA.
    for (const o of orders.slice(0, MAX_ORDERS)) {
      const { folio, id_airport: ap } = o;
      await safe(async () => {
        const d = await getOrderDetail(folio, ap);
        if (d.ok) await saveCache(`order_detail_${folio}_${ap}`, { order: d.order!, hotelesPax: d.hoteles_pax ?? [] });
      });
      await safe(async () => {
        const r = await getOrderPax(folio, ap);
        if (r.ok) await saveCache(`edit_pax_list_${folio}_${ap}`, r.items ?? []);
      });
      await safe(async () => {
        const h = await getHotelsForOrder(folio, ap);
        if (h.ok) {
          await saveCache(`add_pax_hotels_${folio}_${ap}`, {
            hotels: (h.hotels ?? []).filter((x) => x.rooms_dis !== 0),
            defaultFSalida: h.default_date_out ? h.default_date_out.slice(0, 10) : '',
            defaultHora: h.default_hour ? h.default_hour.slice(0, 5) : '',
          });
        }
      });
      await safe(async () => {
        const s = await getSlaState(folio, ap);
        if (s.ok) await saveCache(`sla_state_${folio}_${ap}`, s);
      });
    }
  } finally {
    running = false;
  }
}
