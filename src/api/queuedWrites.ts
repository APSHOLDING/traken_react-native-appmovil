import {
  AddCommentResponse,
  AddPaxPayload,
  AddPaxResponse,
  AddTransportPayload,
  AddTransportResponse,
  CloseOrderResponse,
} from './client';
import { sendOrQueue } from '../utils/outbox';

/**
 * Versiones de las escrituras que funcionan SIN INTERNET: con conexion se
 * comportan igual que las de client.ts; sin conexion se guardan en la cola del
 * telefono (ver utils/outbox.ts) y devuelven `queued: true` para que la
 * pantalla avise "guardado, se enviara cuando vuelva el internet".
 *
 * Solo se encolan acciones que se pueden enviar despues sin riesgo gracias a la
 * clave anti-duplicados del servidor. Crear O.S. (necesita el folio/codigo que
 * asigna el servidor), correos y codigos de verificacion siguen exigiendo
 * conexion por diseño.
 */
export type Queueable<T> = T & { queued?: boolean };

const QUEUED_MSG = 'Guardado en el teléfono. Se enviará solo cuando vuelva el internet.';

export function addPax(payload: AddPaxPayload): Promise<Queueable<AddPaxResponse>> {
  const n = payload.passengers?.length ?? 0;
  return sendOrQueue<Queueable<AddPaxResponse>>(
    {
      kind: 'add_pax',
      label: `Habitación con ${n} pasajero${n === 1 ? '' : 's'} · O.S. ${payload.id_order}`,
      url: '/orders/addPax.php',
      body: payload,
    },
    { ok: true, status: 'exito', msg: QUEUED_MSG, queued: true }
  );
}

export function addTransport(payload: AddTransportPayload): Promise<Queueable<AddTransportResponse>> {
  return sendOrQueue<Queueable<AddTransportResponse>>(
    {
      kind: 'add_transport',
      label: `Transporte de ${payload.direction === 'out' ? 'salida' : 'llegada'} · O.S. ${payload.id_order}`,
      url: '/orders/addTransport.php',
      body: payload,
    },
    { ok: true, status: 'exito', msg: QUEUED_MSG, queued: true }
  );
}

export function addComment(
  idOrder: number,
  idAirport: number,
  comment: string
): Promise<Queueable<AddCommentResponse>> {
  const preview = comment.length > 40 ? comment.slice(0, 40) + '…' : comment;
  return sendOrQueue<Queueable<AddCommentResponse>>(
    {
      kind: 'comment',
      label: `Comentario en O.S. ${idOrder}: "${preview}"`,
      url: '/orders/commentAdd.php',
      body: { id_order: idOrder, id_airport: idAirport, comment },
    },
    { ok: true, msg: QUEUED_MSG, queued: true }
  );
}

export function closeOrder(folio: number, idAirport: number, folioDisplay?: string): Promise<Queueable<CloseOrderResponse>> {
  return sendOrQueue<Queueable<CloseOrderResponse>>(
    {
      kind: 'close_order',
      label: `Cerrar O.S. ${folioDisplay ?? folio}`,
      url: '/orders/closeOrder.php',
      body: { id_order: folio, id_airport: idAirport },
    },
    {
      ok: true,
      status: 'exito',
      msg: 'Cierre guardado en el teléfono. Se enviará cuando vuelva el internet; ahí se revisarán los requisitos y, si falta algo, te avisaremos.',
      queued: true,
    }
  );
}
