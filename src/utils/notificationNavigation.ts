import { createNavigationContainerRef } from '@react-navigation/native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { RootStackParamList } from '../navigation/RootNavigator';

/**
 * Al tocar una notificacion push (app abierta, en segundo plano o cerrada) se
 * abre el detalle de la O.S. Los push del servidor (op/include/pushNotify.php)
 * traen `data: { type, id_order, id_airport }`. Si el usuario aun no inicio
 * sesion (o el navegador no esta listo) se guarda como pendiente y se abre en
 * cuanto haya sesion.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type Pending = { folio: number; idAirport: number } | null;
let pending: Pending = null;

function parse(data: unknown): Pending {
  const d = (data ?? {}) as Record<string, unknown>;
  const folio = Number(d.id_order);
  const idAirport = Number(d.id_airport);
  if (!Number.isFinite(folio) || folio <= 0 || !Number.isFinite(idAirport) || idAirport <= 0) return null;
  return { folio, idAirport };
}

function open(target: NonNullable<Pending>): boolean {
  if (!navigationRef.isReady()) return false;
  // Sin sesion el navegador solo tiene la pantalla Login: no se puede abrir.
  const names = navigationRef.getRootState()?.routeNames ?? [];
  if (!names.includes('DetalleOrden')) return false;
  navigationRef.navigate('DetalleOrden', {
    folio: target.folio,
    idAirport: target.idAirport,
    folioDisplay: `#${target.folio}`,
  });
  return true;
}

function handle(data: unknown) {
  const target = parse(data);
  if (!target) return;
  if (!open(target)) pending = target;
}

/** Abre la O.S. pendiente (si la hay). Llamar cuando el navegador ya esta listo / hay sesion. */
export function flushPendingNotification() {
  if (!pending) return;
  const target = pending;
  if (open(target)) pending = null;
}

/** Engancha los toques de notificacion. Devuelve la funcion para desengancharlos. */
export function setupNotificationTapHandler(): () => void {
  if (isExpoGo && Platform.OS === 'android') return () => {};
  let sub: { remove: () => void } | null = null;
  let cancelled = false;

  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;
      sub = Notifications.addNotificationResponseReceivedListener((resp) => {
        handle(resp.notification.request.content.data);
      });
      // App cerrada: la notificacion que la abrio.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) handle(last.notification.request.content.data);
    } catch {
      // Nunca debe romper el arranque.
    }
  })();

  return () => {
    cancelled = true;
    sub?.remove();
  };
}
