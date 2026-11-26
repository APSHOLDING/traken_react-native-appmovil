import axios from 'axios';
import { ApiEnvironment, DEFAULT_ENVIRONMENT, SITE_BASE_URLS } from '../config/environment';

// Backend real de Traken -- por defecto el ambiente sandbox (datos de
// prueba, base de datos separada de la real). El ambiente activo se puede
// cambiar en tiempo de ejecucion (ver setApiEnvironment, usado por
// AuthContext al arrancar la app segun lo que haya guardado el usuario) sin
// tener que recompilar nada. Se usa directo el dominio real (no el Laragon
// local) para que el celular funcione sin depender de que la PC este
// prendida ni de estar en la misma WiFi.
let currentEnvironment: ApiEnvironment = DEFAULT_ENVIRONMENT;
let siteBaseUrl = SITE_BASE_URLS[DEFAULT_ENVIRONMENT];

export const api = axios.create({
  baseURL: `${siteBaseUrl}/op/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Sesion vencida/revocada: el servidor contesta 401 ("Sesion invalida o
// vencida") en cualquier endpoint que exige token. El login tambien usa 401
// pero para "contrasena incorrecta" -- ese NO cierra sesion. AuthContext
// registra aqui la funcion que limpia la sesion y manda al Login.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

// Mensajes del servidor que no son error de red: 503 = modo proteccion
// ("escudo"), 410 = app en desuso. Se deja el texto del servidor en
// `userMessage` para que cualquier pantalla pueda mostrarlo.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | undefined = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    if (status === 401 && !url.includes('/auth/login.php') && onUnauthorized) {
      onUnauthorized();
    }
    if (status === 503 || status === 410) {
      const msg = error?.response?.data?.error;
      error.userMessage =
        typeof msg === 'string' && msg
          ? msg
          : status === 410
            ? 'Esta versión de la app ya no está disponible. Actualiza la app.'
            : 'El servidor está en mantenimiento. Intenta de nuevo en unos minutos.';
    }
    return Promise.reject(error);
  }
);

/** Cambia a que ambiente (sandbox/production) le pega TODA la app -- las
 * URLs absolutas que arman otras funciones de este archivo (PDF de
 * vouchers, imagen de Delay, descarga de reportes) tambien se recalculan
 * solas porque leen siteBaseUrl() en el momento en que se llaman. */
export function setApiEnvironment(env: ApiEnvironment) {
  currentEnvironment = env;
  siteBaseUrl = SITE_BASE_URLS[env];
  api.defaults.baseURL = `${siteBaseUrl}/op/api`;
}

export function getApiEnvironment(): ApiEnvironment {
  return currentEnvironment;
}

function siteBase(): string {
  return siteBaseUrl;
}

/** URL base del sitio (sandbox o producción, según el ambiente activo) para armar enlaces absolutos fuera de /op/api (ej. el QR de pre-registro). */
export function getSiteBaseUrl(): string {
  return siteBaseUrl;
}

/** Se llama al iniciar sesion (o al restaurar una guardada) para que TODAS
 * las peticiones siguientes manden el token automaticamente. */
export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export interface StationDTO {
  id: number;
  iata: string;
  name: string;
}

export interface UserDTO {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  role_id: number;
  role_name: string;
  acceso_sc_incidencias?: boolean;
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  user?: UserDTO;
  stations?: StationDTO[];
  error?: string;
}

export interface MeResponse {
  ok: boolean;
  user?: UserDTO;
  stations?: StationDTO[];
  error?: string;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login.php', {
    email,
    password,
    device: 'expo-app',
  });
  return data;
}

export async function meRequest(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/me.php');
  return data;
}

export async function logoutRequest(): Promise<void> {
  try {
    await api.post('/auth/logout.php');
  } catch (e) {
    // Si no hay conexion, no importa: igual se borra la sesion localmente.
  }
}

export interface OpenOrderDTO {
  id: number;
  folio: number;
  folio_display: string;
  id_airport: number;
  iata: string;
  airline: string;
  flight: string | null;
  date_in: string | null;
  type_airline: string;
  es_prueba: boolean;
}

export interface OpenOrdersResponse {
  ok: boolean;
  total?: number;
  total_anteriores?: number;
  orders?: OpenOrderDTO[];
  error?: string;
}

export async function getOpenOrders(): Promise<OpenOrdersResponse> {
  const { data } = await api.get<OpenOrdersResponse>('/orders/open.php');
  return data;
}

export interface ExportListUrlResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Pide la URL firmada (sin sesión) del Excel de Órdenes Abiertas --
 * equivalente de op/modulos/open/exportOpenList.php, que no se reimplementa:
 * solo se arma su enlace firmado (op/include/linkToken.php). */
export async function getOpenOrdersExportUrl(pairs: { folio: number; idAirport: number }[]): Promise<ExportListUrlResponse> {
  const f = pairs.map((p) => `${p.folio}-${p.idAirport}`).join(',');
  const { data } = await api.get<ExportListUrlResponse>('/open/exportListUrl.php', { params: { f } });
  return data;
}

export interface ManualUrlResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Pide la URL firmada (sin sesión) del Manual de Operaciones en PDF --
 * equivalente de op/modulos/ayuda/guiaOperaciones.php. */
export async function getManualUrl(): Promise<ManualUrlResponse> {
  const { data } = await api.get<ManualUrlResponse>('/ayuda/manualUrl.php');
  return data;
}

export interface PruebaOkResponse {
  ok: boolean;
  prueba?: boolean;
  error?: string;
}

/** Pide por correo (a Gerencia TI) el código para marcar/quitar la etiqueta
 * PRUEBA de una O.S. -- equivalente de op/modulos/open/marcarPrueba.php
 * (accion=pedir). */
export async function requestPruebaCode(folio: number, idAirport: number, accion: 'marcar' | 'quitar'): Promise<PruebaOkResponse> {
  const { data } = await api.post<PruebaOkResponse>('/open/pruebaRequest.php', { folio, ap: idAirport, accion });
  return data;
}

/** Confirma el código y marca/quita la etiqueta PRUEBA. */
export async function confirmPruebaCode(
  folio: number,
  idAirport: number,
  accion: 'marcar' | 'quitar',
  codigo: string
): Promise<PruebaOkResponse> {
  const { data } = await api.post<PruebaOkResponse>('/open/pruebaConfirm.php', { folio, ap: idAirport, accion, codigo });
  return data;
}

// ===== Mover pasajero de otra O.S. (misma estación) =====

export interface OtraOsItem {
  id: number;
  nombre: string;
  tipo: string;
  os: string;
  hotel: string;
}

export interface OtraOsSearchResponse {
  ok: boolean;
  items?: OtraOsItem[];
  error?: string;
}

/** Busca un pasajero en otra O.S. abierta de la misma estación --
 * equivalente de op/modulos/open/otraOs.php (accion=buscar). */
export async function searchOtraOs(folio: number, idAirport: number, q: string): Promise<OtraOsSearchResponse> {
  const { data } = await api.get<OtraOsSearchResponse>('/open/otraOsSearch.php', { params: { folio, ap: idAirport, q } });
  return data;
}

export interface OtraOsRequestResponse {
  ok: boolean;
  sol_id?: number;
  minutos?: number;
  error?: string;
}

/** Pide el código de confirmación (le llega a Santiago, con copia a Gerencia
 * TI) para mover a ese pasajero -- accion=pedir. */
export async function requestOtraOsCode(folio: number, idAirport: number, paxId: number): Promise<OtraOsRequestResponse> {
  const { data } = await api.post<OtraOsRequestResponse>('/open/otraOsRequest.php', { folio, ap: idAirport, pax_id: paxId });
  return data;
}

export interface OtraOsConfirmResponse {
  ok: boolean;
  token?: string;
  pax?: { nombre: string; tipo: string; edad: string; voucher: string; origen: string };
  error?: string;
}

/** Confirma el código y entrega el token que hay que mandar en addPax()
 * (otra_os_tokens) para que el movimiento se aplique al guardar -- accion=confirmar. */
export async function confirmOtraOsCode(
  folio: number,
  idAirport: number,
  solId: number,
  codigo: string
): Promise<OtraOsConfirmResponse> {
  const { data } = await api.post<OtraOsConfirmResponse>('/open/otraOsConfirm.php', { folio, ap: idAirport, sol_id: solId, codigo });
  return data;
}

export interface CommentDTO {
  user_name: string;
  comment: string;
  created_at: string;
}

export interface CommentsResponse {
  ok: boolean;
  items?: CommentDTO[];
  error?: string;
}

export async function getComments(idOrder: number, idAirport: number): Promise<CommentsResponse> {
  const { data } = await api.get<CommentsResponse>('/orders/comments.php', {
    params: { id_order: idOrder, id_airport: idAirport },
  });
  return data;
}

export interface AddCommentResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export interface SendEmailResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function sendOrderEmail(folio: number, idAirport: number): Promise<SendEmailResponse> {
  const { data } = await api.post<SendEmailResponse>('/orders/sendEmail.php', {
    folio,
    id_airport: idAirport,
  });
  return data;
}

export async function addComment(
  idOrder: number,
  idAirport: number,
  comment: string
): Promise<AddCommentResponse> {
  const { data } = await api.post<AddCommentResponse>('/orders/commentAdd.php', {
    id_order: idOrder,
    id_airport: idAirport,
    comment,
  });
  return data;
}

export interface HotelDTO {
  id: number;
  name: string;
  rooms_dis: number;
}

export interface HotelsResponse {
  ok: boolean;
  hotels?: HotelDTO[];
  default_date_out?: string | null;
  default_hour?: string | null;
  error?: string;
}

export async function getHotelsForOrder(idOrder: number, idAirport: number): Promise<HotelsResponse> {
  const { data } = await api.get<HotelsResponse>('/orders/hotels.php', {
    params: { id_order: idOrder, id_airport: idAirport },
  });
  return data;
}

export type PaxType = 'adulto' | 'nino' | 'infante';

export interface PaxEntry {
  name: string;
  voucher?: string;
  f_salida: string;
  hora: string;
  type: PaxType;
  chek?: 0 | 1 | 2;
  age_c?: number;
  age_i?: number;
  breakfast?: number;
  lunch?: number;
  dinner?: number;
}

export interface AddPaxPayload {
  id_order: number;
  id_airport: number;
  id_hotel: number;
  type_airline: string;
  ocupation?: string;
  /** Una habitacion puede traer varios pasajeros (ej. una familia); todos
   * comparten la misma habitacion y solo cuentan como 1 cuarto ocupado. */
  passengers: PaxEntry[];
  /** Tokens de "mover pasajero de otra O.S." (ver otraOsSearch/Request/Confirm
   * más abajo) -- uno por pasajero autorizado en este mismo guardado. */
  otra_os_tokens?: string[];
}

export interface AddPaxResponse {
  ok: boolean;
  status?: 'exito' | 'dispo' | 'error';
  msg?: string;
  error?: string;
}

export async function addPax(payload: AddPaxPayload): Promise<AddPaxResponse> {
  const { data } = await api.post<AddPaxResponse>('/orders/addPax.php', payload);
  return data;
}

export interface NamedOption {
  id: number;
  name: string;
}

export interface TransportOptionsResponse {
  ok: boolean;
  hotels?: NamedOption[];
  transports?: NamedOption[];
  units?: NamedOption[];
  error?: string;
}

export async function getTransportOptions(idOrder: number, idAirport: number): Promise<TransportOptionsResponse> {
  const { data } = await api.get<TransportOptionsResponse>('/orders/transportOptions.php', {
    params: { id_order: idOrder, id_airport: idAirport },
  });
  return data;
}

export type TransportDirection = 'in' | 'out';

export interface AddTransportPayload {
  id_order: number;
  id_airport: number;
  id_hotel: number;
  id_transport: number;
  unit: number;
  quantity: number;
  pax: number;
  direction: TransportDirection;
}

export interface AddTransportResponse {
  ok: boolean;
  status?: 'exito' | 'error';
  msg?: string;
  error?: string;
}

export async function addTransport(payload: AddTransportPayload): Promise<AddTransportResponse> {
  const { data } = await api.post<AddTransportResponse>('/orders/addTransport.php', payload);
  return data;
}

export interface TransportRowDTO {
  id: number;
  id_hotel: number;
  hotel_name: string;
  id_transport: number;
  transport_name: string;
  unit: number;
  unit_name: string;
  quantity: number;
  pax: number;
}

export interface TransportListResponse {
  ok: boolean;
  items?: TransportRowDTO[];
  error?: string;
}

/** Transporte ya registrado de una O.S. (llegada o salida) -- para mostrarlo arriba del formulario de agregar. */
export async function getTransportList(
  idOrder: number,
  idAirport: number,
  direction: TransportDirection
): Promise<TransportListResponse> {
  const { data } = await api.get<TransportListResponse>('/orders/transportList.php', {
    params: { id_order: idOrder, id_airport: idAirport, direction },
  });
  return data;
}

export interface UpdateTransportPayload {
  id_transport_row: number;
  id_order: number;
  id_airport: number;
  id_hotel: number;
  id_transport: number;
  unit: number;
  quantity: number;
  pax: number;
}

export interface UpdateTransportResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function updateTransport(payload: UpdateTransportPayload): Promise<UpdateTransportResponse> {
  const { data } = await api.post<UpdateTransportResponse>('/orders/updateTransport.php', payload);
  return data;
}

export interface DeleteTransportResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function deleteTransport(
  idTransportRow: number,
  idOrder: number,
  idAirport: number
): Promise<DeleteTransportResponse> {
  const { data } = await api.post<DeleteTransportResponse>('/orders/deleteTransport.php', {
    id_transport_row: idTransportRow,
    id_order: idOrder,
    id_airport: idAirport,
  });
  return data;
}

export interface CloseOrderResponse {
  ok: boolean;
  status?: 'exito' | 'error';
  msg?: string;
  reasons?: string[];
  error?: string;
}

export async function closeOrder(folio: number, idAirport: number): Promise<CloseOrderResponse> {
  const { data } = await api.post<CloseOrderResponse>('/orders/closeOrder.php', {
    id_order: folio,
    id_airport: idAirport,
  });
  return data;
}

export interface CancelOrderResponse {
  ok: boolean;
  status?: 'exito' | 'error';
  msg?: string;
  error?: string;
}

export async function cancelOrder(folio: number, idAirport: number): Promise<CancelOrderResponse> {
  const { data } = await api.post<CancelOrderResponse>('/orders/cancelOrder.php', {
    id_order: folio,
    id_airport: idAirport,
  });
  return data;
}

/**
 * Crear O.S. -- equivalente movil de op/modulos/create/inicio.php +
 * insertNewOrder.php. Catalogos en 3 pasos (igual que la web: primero
 * estacion+evento, luego aerolineas de esa estacion, luego hoteles de esa
 * estacion) y el envio final que crea la orden de verdad.
 */
export interface StationOption {
  id: number;
  iata: string;
  name: string;
}

export interface CreateOrderOptionsResponse {
  ok: boolean;
  stations?: StationOption[];
  events?: NamedOption[];
  error?: string;
}

export async function getCreateOrderOptions(): Promise<CreateOrderOptionsResponse> {
  const { data } = await api.get<CreateOrderOptionsResponse>('/orders/createOrderOptions.php');
  return data;
}

export interface CreateOrderCatalogResponse {
  ok: boolean;
  airlines?: NamedOption[];
  hotels?: NamedOption[];
  error?: string;
}

export async function getCreateOrderAirlines(idAirport: number): Promise<CreateOrderCatalogResponse> {
  const { data } = await api.get<CreateOrderCatalogResponse>('/orders/createOrderAirlines.php', {
    params: { id_airport: idAirport },
  });
  return data;
}

export async function getCreateOrderHotels(idAirport: number): Promise<CreateOrderCatalogResponse> {
  const { data } = await api.get<CreateOrderCatalogResponse>('/orders/createOrderHotels.php', {
    params: { id_airport: idAirport },
  });
  return data;
}

export interface CreateOrderHotelInput {
  id_hotel: number;
  dispo: number;
}

export interface CreateOrderPayload {
  id_airport: number;
  flight: string;
  event: number;
  airline: number;
  date_in: string;
  date_out: string;
  hour: string;
  hotels: CreateOrderHotelInput[];
  codigo_verif?: string;
}

export interface CreateOrderResponse {
  ok: boolean;
  error?: string;
  msg?: string;
  sc?: boolean;
  code?: string;
  folio?: number;
}

export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  const { data } = await api.post<CreateOrderResponse>('/orders/createOrder.php', payload);
  return data;
}

/**
 * El PDF de vouchers vive fuera de op/api/ (op/modulos/open/voucherPdfDownload.php,
 * el mismo generador que ya usa la web) porque genera un PDF con TCPDF, no
 * JSON. voucherPdfDownload.php se modifico para aceptar TAMBIEN un token
 * Bearer ademas de la sesion de navegador (ver el comentario en ese archivo).
 *
 * La descarga en si NO pasa por este cliente axios: un PDF de varias
 * centenas de KB como ArrayBuffer via axios/XHR en React Native no es
 * confiable (el puente JS<->nativo viejo no maneja bien binarios grandes
 * asi). En vez de eso, la pantalla usa expo-file-system
 * (File.createDownloadTask) para bajarlo nativo directo a disco, mandando
 * el token como header. Aqui solo se arma la URL + el valor del header.
 */
export function getVoucherPdfUrl(folio: number, idAirport: number): string {
  return `${siteBase()}/op/modulos/open/voucherPdfDownload.php?id=${folio}&id_airport=${idAirport}`;
}

export function getAuthHeader(): string | undefined {
  return api.defaults.headers.common['Authorization'] as string | undefined;
}

/**
 * Delay Info (Aviso de Retraso) -- misma pareja de endpoints que usa el
 * modal "Delay" en op/modulos/open/inicio.php (descargar.php / enviar_correo.php).
 * Esos 2 archivos NUNCA validaron $_SESSION (ni siquiera en la web), asi que
 * el movil los llama directo con su URL completa, sin token: es exactamente
 * la misma llamada que ya hace el navegador, solo que desde la app. Cero
 * cambios en el backend para esta funcion.
 */
export interface DelayFormData {
  lang: string;
  airline: string;
  flight: string;
  dest: string;
  pickup: string;
  departure: string;
  date: string;
  folio: string;
  estacion: string;
}

function delayBase(): string {
  return `${siteBase()}/op/modulos/delayInfo`;
}

export function getDelayImageUrl(d: DelayFormData): string {
  const qs = new URLSearchParams({ ...d, dl: '1' }).toString();
  return `${delayBase()}/descargar.php?${qs}`;
}

/** Igual que getDelayImageUrl pero SIN forzar la descarga (inline) -- para
 * mostrar la imagen real (con el logo de la aerolinea y el QR de verdad,
 * generados por el servidor) directo en un <Image> como vista previa. */
export function getDelayPreviewUrl(d: DelayFormData): string {
  const qs = new URLSearchParams({ ...d }).toString();
  return `${delayBase()}/descargar.php?${qs}`;
}

export interface SendDelayEmailResponse {
  ok: boolean;
  msg?: string;
}

export async function sendDelayEmail(to: string, d: DelayFormData): Promise<SendDelayEmailResponse> {
  const body = new URLSearchParams({ to, ...d }).toString();
  const { data } = await axios.post<SendDelayEmailResponse>(`${delayBase()}/enviar_correo.php`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });
  return data;
}

export interface ExistingPaxDTO {
  id: number;
  id_orders_open: number;
  name: string;
  voucher: string;
  date_out: string;
  hour: string;
  type: PaxType;
  id_hotel: number;
  hotel_name: string;
  age_c: number;
  age_i: number;
  chek: 0 | 1 | 2;
  ocupation: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  voucher_img_url: string | null;
  voucher_img_removed: boolean;
  voucher_img_rotation: number;
}

export interface PaxListResponse {
  ok: boolean;
  items?: ExistingPaxDTO[];
  error?: string;
}

export async function getOrderPax(idOrder: number, idAirport: number): Promise<PaxListResponse> {
  const { data } = await api.get<PaxListResponse>('/orders/pax.php', {
    params: { id_order: idOrder, id_airport: idAirport },
  });
  return data;
}

export interface UpdatePaxPayload {
  id_pax: number;
  id_order: number;
  id_airport: number;
  name: string;
  voucher?: string;
  f_salida: string;
  hora: string;
  type: PaxType;
  id_hotel: number;
  chek?: 0 | 1 | 2;
  age_c?: number;
  age_i?: number;
  ocupation?: string;
  breakfast?: number;
  lunch?: number;
  dinner?: number;
}

export interface UpdatePaxResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function updatePax(payload: UpdatePaxPayload): Promise<UpdatePaxResponse> {
  const { data } = await api.post<UpdatePaxResponse>('/orders/updatePax.php', payload);
  return data;
}

export interface DeletePaxResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

/** Elimina un pasajero -- si su habitación se queda vacía, el servidor también la borra y regresa el cupo al hotel. */
export async function deletePax(idPax: number, idOrder: number, idAirport: number): Promise<DeletePaxResponse> {
  const { data } = await api.post<DeletePaxResponse>('/orders/deletePax.php', {
    id_pax: idPax,
    id_order: idOrder,
    id_airport: idAirport,
  });
  return data;
}

export interface DeleteRoomResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

/** Elimina una habitación completa (todos sus pasajeros de un jalón) y regresa el cupo al hotel. */
export async function deleteRoom(idOrdersOpen: number, idOrder: number, idAirport: number): Promise<DeleteRoomResponse> {
  const { data } = await api.post<DeleteRoomResponse>('/orders/deleteRoom.php', {
    id_orders_open: idOrdersOpen,
    id_order: idOrder,
    id_airport: idAirport,
  });
  return data;
}

export interface RegisterPushTokenResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function registerPushToken(token: string, device?: string): Promise<RegisterPushTokenResponse> {
  const { data } = await api.post<RegisterPushTokenResponse>('/push/register.php', { token, device });
  return data;
}

// ===== Escaneo y manejo de foto de voucher =====================

export interface ScanVoucherResponse {
  ok: boolean;
  nombre?: string;
  msg?: string;
}

/** Manda la foto a la IA (Claude), igual que la web. Puede tardar -- quien
 * llama debe manejar sus propios timeouts/UI de espera (ver
 * src/utils/voucherScan.ts, que replica los mismos tiempos que la web). */
export async function scanVoucherAI(
  fileUri: string,
  idOrder?: number,
  idAirport?: number
): Promise<ScanVoucherResponse> {
  const form = new FormData();
  form.append('foto', { uri: fileUri, name: 'voucher.jpg', type: 'image/jpeg' } as any);
  if (idOrder) form.append('id_order', String(idOrder));
  if (idAirport) form.append('id_airport', String(idAirport));
  const { data } = await api.post<ScanVoucherResponse>('/vouchers/scan.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 50000,
  });
  return data;
}

export async function logVoucherScan(
  modo: 'ocr' | 'manual',
  exito: boolean,
  idOrder?: number,
  idAirport?: number,
  mensaje?: string
): Promise<void> {
  try {
    await api.post('/vouchers/logScan.php', { modo, exito, id_order: idOrder, id_airport: idAirport, mensaje });
  } catch (e) {
    // No es critico si este aviso no llega.
  }
}

export interface VoucherPhotoResponse {
  ok: boolean;
  filename?: string;
  url?: string;
  msg?: string;
  error?: string;
}

export async function uploadVoucherPhoto(
  idPax: number,
  idOrder: number,
  idAirport: number,
  fileUri: string
): Promise<VoucherPhotoResponse> {
  const form = new FormData();
  form.append('foto', { uri: fileUri, name: 'voucher.jpg', type: 'image/jpeg' } as any);
  form.append('id_pax', String(idPax));
  form.append('id_order', String(idOrder));
  form.append('id_airport', String(idAirport));
  const { data } = await api.post<VoucherPhotoResponse>('/vouchers/upload.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
  return data;
}

export interface ScanSupportResponse {
  ok: boolean;
  voucher?: string;
  pnr?: string;
  codigo?: string;
  tipo?: 'PNR' | 'voucher';
  vuelo?: string;
  vuelo_os?: string;
  vuelo_ok?: boolean | null;
  msg?: string;
}

/** Lee el PNR/número de voucher (y compara el vuelo contra la O.S.) de una
 * foto -- equivalente de op/modulos/open/leerSoporte.php (solo IA). Distinto
 * de scanVoucherAI, que lee el NOMBRE del pasajero. */
export async function scanSupportAI(
  fileUri: string,
  idOrder?: number,
  idAirport?: number
): Promise<ScanSupportResponse> {
  const form = new FormData();
  form.append('foto', { uri: fileUri, name: 'soporte.jpg', type: 'image/jpeg' } as any);
  if (idOrder) form.append('id_order', String(idOrder));
  if (idAirport) form.append('id_airport', String(idAirport));
  const { data } = await api.post<ScanSupportResponse>('/vouchers/scanSupport.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 50000,
  });
  return data;
}

export async function removeVoucherPhoto(idPax: number, idOrder: number, idAirport: number): Promise<VoucherPhotoResponse> {
  const { data } = await api.post<VoucherPhotoResponse>('/vouchers/remove.php', {
    id_pax: idPax,
    id_order: idOrder,
    id_airport: idAirport,
  });
  return data;
}

export async function restoreVoucherPhoto(idPax: number, idOrder: number, idAirport: number): Promise<VoucherPhotoResponse> {
  const { data } = await api.post<VoucherPhotoResponse>('/vouchers/restore.php', {
    id_pax: idPax,
    id_order: idOrder,
    id_airport: idAirport,
  });
  return data;
}

export interface RotateVoucherPhotoResponse {
  ok: boolean;
  deg?: number;
  error?: string;
}

/** Guarda el giro (0/90/180/270) de la foto de soporte, para que el PDF descargado respete la orientación corregida. */
export async function rotateVoucherPhoto(
  idPax: number,
  idOrder: number,
  idAirport: number,
  deg: number
): Promise<RotateVoucherPhotoResponse> {
  const { data } = await api.post<RotateVoucherPhotoResponse>('/vouchers/rotate.php', {
    id_pax: idPax,
    id_order: idOrder,
    id_airport: idAirport,
    deg,
  });
  return data;
}

/**
 * Bitacora / Auditoria -- SOLO para el admin maestro (misma cuenta que
 * admin/modulos/appUsage/inicio.php en la web). Misma tabla `auditoria` que
 * ya usa toda la web (aps_audit()); cada evento trae 'origen' ('movil' o
 * 'web') para poder distinguir de un vistazo que accion vino de la app.
 */
export type AuditOrigen = 'movil' | 'web';

export interface AuditLogItem {
  id: number;
  fecha: string;
  usuario: string;
  origen: AuditOrigen;
  modulo: string;
  entidad: string;
  registro_id: string;
  referencia: string;
  accion: string;
  campo: string;
  valor_anterior: string;
  valor_nuevo: string;
  detalle: string;
}

export interface AuditLogResponse {
  ok: boolean;
  items?: AuditLogItem[];
  total?: number;
  page?: number;
  per_page?: number;
  has_more?: boolean;
  error?: string;
}

export interface AuditLogFilters {
  page?: number;
  modulo?: string;
  accion?: string;
  origen?: AuditOrigen;
  q?: string;
}

export async function getAuditLog(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
  const { data } = await api.get<AuditLogResponse>('/admin/auditLog.php', { params: filters });
  return data;
}

/**
 * Historial de QR -- equivalente movil de op/modulos/qrHist/ (lista +
 * detalle de pre-registro por O.S.). Solo lectura.
 */
export interface QrHistoryItem {
  folio: number;
  folio_display: string;
  id_airport: number;
  iata: string;
  flight: string | null;
  date_in: string | null;
  regs: number;
  grupos: number;
  cerrados: number;
  generado: number;
  ultima: string | null;
}

export interface QrHistoryResponse {
  ok: boolean;
  items?: QrHistoryItem[];
  error?: string;
}

/**
 * Incidencias por Evento Especial -- equivalente movil de
 * op/modulos/scIncidencias/ (solo lectura/auditoria). Los registros los
 * genera createOrder.php; aqui solo se listan con filtros. Acceso
 * restringido por permiso individual (user.acceso_sc_incidencias).
 */
export interface IncidenciaScItem {
  folio: number;
  folio_display: string;
  id_airport: number;
  airport_iata: string;
  airport_name: string;
  airline_name: string;
  event_name: string;
  flight: string | null;
  date_service: string | null;
  date_registro: string | null;
  desfase_dias: number;
  status: 'open' | 'close' | 'cancel' | '';
  user_name: string;
}

export interface IncidenciaScEventOption {
  id_event: number;
  event_name: string;
}

export interface IncidenciasScResponse {
  ok: boolean;
  items?: IncidenciaScItem[];
  total?: number;
  avg_desfase?: number;
  max_desfase?: number;
  airports?: StationDTO[];
  events?: IncidenciaScEventOption[];
  error?: string;
}

export interface IncidenciasScFilters {
  mes?: string;
  status?: 'open' | 'close' | 'cancel';
  airport?: number;
  evento?: number;
}

export async function getIncidenciasSc(filters: IncidenciasScFilters = {}): Promise<IncidenciasScResponse> {
  const { data } = await api.get<IncidenciasScResponse>('/incidencias/list.php', { params: filters });
  return data;
}

export async function getQrHistory(): Promise<QrHistoryResponse> {
  const { data } = await api.get<QrHistoryResponse>('/qr/history.php');
  return data;
}

export type QrEventKind = 'os_generado' | 'grupo_unido' | 'grupo_cerrado' | 'grupo_reabierto' | string;

export interface QrEventDTO {
  kind: QrEventKind;
  who: string | null;
  created_at: string;
}

export interface QrGroupDTO {
  name: string;
  code: string;
  created: string;
  closed: string | null;
  party: number;
  miembros: number;
}

export interface QrHistoryDetailResponse {
  ok: boolean;
  events?: QrEventDTO[];
  groups?: QrGroupDTO[];
  error?: string;
}

export async function getQrHistoryDetail(folio: number, idAirport: number): Promise<QrHistoryDetailResponse> {
  const { data } = await api.get<QrHistoryDetailResponse>('/qr/historyDetail.php', {
    params: { folio, id_airport: idAirport },
  });
  return data;
}

/**
 * SLA de Operaciones -- equivalente movil de op/modulos/sla/ (formulario de
 * 11 tiempos por O.S., solo aplica a motivos CXLD/DLY). El semaforo, las
 * reglas (min_ok/max_ok) y la conversion de zona horaria SIEMPRE vienen del
 * backend -- nunca se recalculan aqui.
 */
export type SlaPasoTipo = 'sla' | 'info' | 'sin';
export type SlaSemaforo = 'verde' | 'amarillo' | 'rojo';
export type SlaEstado = 'na' | 'sin' | 'curso' | 'fin' | 'sin_cierre';
export type SlaModo = 'ahora' | 'manual';

export interface SlaPasoItem {
  paso: number;
  nombre: string;
  tipo: SlaPasoTipo;
  ayuda: string;
  hecho: boolean;
  hora?: string;
  fecha?: string;
  origen?: SlaModo;
  por?: string;
  nota?: string;
  drift?: number | null;
  local?: string;
  desde_anterior?: number | null;
}

export interface SlaComentarioItem {
  texto: string;
  por: string;
  hora: string;
}

export interface SlaBitacoraItem {
  paso: number | null;
  accion: string;
  antes: string;
  despues: string;
  nota: string;
  por: string;
  created_at: string;
}

export interface SlaOrderInfo {
  folio: number;
  ap: number;
  ref: string;
  iata: string;
  apname: string;
  aerolinea: string;
  vuelo: string | null;
  fecha: string | null;
  status: string;
  id_event: number;
  evento: string;
}

export interface SlaRegla {
  min: number | null;
  max: number;
  pax_min: number;
  pax_max: number;
}

export interface SlaStateResponse {
  ok: boolean;
  os?: SlaOrderInfo;
  grupo?: 'sla' | 'noaplica';
  prueba?: boolean;
  cerrada?: boolean;
  comentarios?: SlaComentarioItem[];
  tz?: string;
  tz_offset?: string;
  hora_local_ahora?: string;
  config?: { modalidad: string; temporada: string; pax: number };
  regla?: SlaRegla | null;
  sin_regla?: string | null;
  pasos?: SlaPasoItem[];
  minutos_sla?: number | null;
  semaforo?: SlaSemaforo | null;
  en_curso?: boolean;
  minutos_en_curso?: number | null;
  sin_cierre?: boolean;
  horas_abierta?: number | null;
  bitacora?: SlaBitacoraItem[];
  error?: string;
}

export async function getSlaState(folio: number, idAirport: number): Promise<SlaStateResponse> {
  const { data } = await api.get<SlaStateResponse>('/sla/state.php', { params: { folio, ap: idAirport } });
  return data;
}

export interface SlaSavePayload {
  folio: number;
  ap: number;
  paso: number;
  modo: SlaModo;
  /** Solo si modo='manual': hora local de la estacion 'YYYY-MM-DD HH:MM'. */
  local?: string;
  /** Obligatorio si modo='manual' (minimo 3 caracteres). */
  nota?: string;
  /** Date.now() del dispositivo -- el backend lo usa solo para detectar
   * desfase de reloj y avisar; la hora que se guarda siempre es la del
   * servidor (modo 'ahora') o la convertida de 'local' (modo 'manual'). */
  device_ms: number;
}

export async function saveSlaPaso(payload: SlaSavePayload): Promise<SlaStateResponse> {
  const { data } = await api.post<SlaStateResponse>('/sla/save.php', payload);
  return data;
}

export async function setSlaModalidad(
  folio: number,
  ap: number,
  modalidad: string,
  nota?: string
): Promise<SlaStateResponse> {
  const { data } = await api.post<SlaStateResponse>('/sla/config.php', { folio, ap, modalidad, nota });
  return data;
}

export async function addSlaComentario(folio: number, ap: number, texto: string): Promise<SlaStateResponse> {
  const { data } = await api.post<SlaStateResponse>('/sla/comentario.php', { folio, ap, texto });
  return data;
}

export interface SlaListItem {
  folio: number;
  folio_display: string;
  id_airport: number;
  iata: string;
  airline: string;
  flight: string | null;
  date_in: string | null;
  event_name: string;
  status: string;
  estado: SlaEstado;
  semaforo: SlaSemaforo | null;
  minutos_sla: number | null;
  hechos: number;
  pax: number;
}

export interface SlaListResponse {
  ok: boolean;
  items?: SlaListItem[];
  counts?: Record<string, number>;
  dias?: number;
  error?: string;
}

export async function getSlaList(dias?: number): Promise<SlaListResponse> {
  const { data } = await api.get<SlaListResponse>('/sla/list.php', { params: dias ? { dias } : undefined });
  return data;
}

/**
 * Resumen por Estacion -- equivalente movil de op/modulos/resumen/inicio.php.
 * Solo lectura: operaciones/habitaciones/pasajeros del mes, por estacion.
 */
export interface ResumenRow {
  iata: string;
  airportName: string;
  operaciones: number;
  habitaciones: number;
  adultos: number;
  menores: number;
  infantes: number;
}

export interface ResumenTotales {
  operaciones: number;
  habitaciones: number;
  adultos: number;
  menores: number;
  infantes: number;
}

export interface ResumenResponse {
  ok: boolean;
  periodo?: string;
  mes_label?: string;
  es_admin_general?: boolean;
  rows?: ResumenRow[];
  totales?: ResumenTotales;
  error?: string;
}

export async function getResumenEstacion(periodo?: string): Promise<ResumenResponse> {
  const { data } = await api.get<ResumenResponse>('/reports/resumen.php', {
    params: periodo ? { periodo } : {},
  });
  return data;
}

/**
 * Vuelos en Tiempo Real -- equivalente movil (solo vista de lista; el mapa
 * Leaflet de la web queda pendiente) de op/modulos/open/live_flights.php.
 * Mismo cache en disco del lado del servidor (ver op/include/liveFlights.php).
 */
export interface LiveFlightRow {
  icao24: string | null;
  callsign: string;
  airline: string | null;
  lat: number;
  lon: number;
  origen: string | null;
  alt_ft: number | null;
  alt_m: number | null;
  speed_kmh: number | null;
  speed_kt: number | null;
  vrate_ms: number | null;
  track_deg: number | null;
  fase: 'ascenso' | 'descenso' | 'nivel';
  dist_km: number;
  bearing: number | null;
  rumbo: string | null;
  mi_os: boolean;
  mi_os_folio: string | null;
}

export interface LiveFlightAirport {
  iata: string;
  name: string;
  unsupported?: boolean;
  icao?: string;
  lat?: number;
  lon?: number;
  live?: LiveFlightRow[];
  updated_at?: number;
}

export interface LiveFlightsResponse {
  ok: boolean;
  airports?: LiveFlightAirport[];
  server_time?: number;
  error?: string;
}

export async function getLiveFlights(): Promise<LiveFlightsResponse> {
  const { data } = await api.get<LiveFlightsResponse>('/orders/liveFlights.php');
  return data;
}

/**
 * TODAS las ordenes del usuario (no solo abiertas) -- fuente comun para
 * Detalles O.S., Reportes y Editar O.S. en el movil.
 */
export interface AnyOrderDTO {
  id: number;
  folio: number;
  folio_display: string;
  id_airport: number;
  iata: string;
  airline: string;
  flight: string | null;
  status: 'open' | 'close' | 'cancel';
  event_name: string | null;
  date_in: string | null;
  type_airline: string;
}

export interface AllOrdersResponse {
  ok: boolean;
  total?: number;
  total_anteriores?: number;
  orders?: AnyOrderDTO[];
  error?: string;
}

export async function getAllOrders(): Promise<AllOrdersResponse> {
  const { data } = await api.get<AllOrdersResponse>('/orders/allOrders.php');
  return data;
}

/**
 * Buscador de pasajero por NOMBRE en todas las O.S. de las estaciones del
 * usuario -- equivalente movil de op/modulos/open/buscarPax.php (la cajita
 * que la web inyecta sobre Órdenes Abiertas y Reportes).
 */
export interface PaxSearchItem {
  pax: string;
  tipo: string;
  voucher: string;
  hab: string;
  hotel: string;
  os: string;
  folio: number;
  id_airport: number;
  iata: string;
  aerolinea: string;
  fecha: string;
  status: 'open' | 'close' | 'cancel' | string;
}

export interface PaxSearchResponse {
  ok: boolean;
  items?: PaxSearchItem[];
  mas?: boolean;
  msg?: string;
  error?: string;
}

export async function searchPaxByName(q: string, estado: 'open' | 'all' = 'all'): Promise<PaxSearchResponse> {
  const { data } = await api.get<PaxSearchResponse>('/orders/paxSearch.php', {
    params: { q, estado },
  });
  return data;
}

/** Detalle de una O.S. -- equivalente movil de op/modulos/details/details.php. */
export interface OrderDetailInfo {
  folio_display: string;
  airline: string;
  flight: string | null;
  event_name: string | null;
  status: string;
  date_in: string | null;
  date_out: string | null;
  hour: string | null;
  hotels: string[];
}

export interface OrderDetailPax {
  id: number;
  name: string;
  type: string;
  date_out: string | null;
}

export interface OrderDetailRoom {
  id_orders_open: number;
  updated_by: string | null;
  pax: OrderDetailPax[];
}

export interface OrderDetailHotelGroup {
  hotel_name: string;
  rooms: OrderDetailRoom[];
}

export interface OrderDetailResponse {
  ok: boolean;
  order?: OrderDetailInfo;
  hoteles_pax?: OrderDetailHotelGroup[];
  error?: string;
}

export async function getOrderDetail(folio: number, idAirport: number): Promise<OrderDetailResponse> {
  const { data } = await api.get<OrderDetailResponse>('/orders/orderDetail.php', {
    params: { id: folio, id_airport: idAirport },
  });
  return data;
}

/**
 * Reportes -- equivalente movil de op/modulos/reports/inicio.php +
 * report.php. La lista comparte getAllOrders(); esto es el "picker" por
 * O.S. (un reporte Excel por hotel + uno General) y el envio por correo.
 */
export interface ReportHotel {
  id_hotel: number;
  name: string;
  total_pax: number;
  download_path: string;
}

export interface ReportListResponse {
  ok: boolean;
  folio_display?: string;
  script?: 'paxes' | 'paxes_ep';
  hotels?: ReportHotel[];
  total_general?: number;
  download_path_general?: string;
  error?: string;
}

/** Enlaces firmados del reporte "PARA FIRMAR" (op/api/reports/firmaLinks.php, archivo nuevo de la web). */
export interface FirmaLinksResponse {
  ok: boolean;
  folio_display?: string;
  hotels?: ReportHotel[];
  total_general?: number;
  download_path_general?: string;
  error?: string;
}

export async function getFirmaLinks(folio: number, idAirport: number): Promise<FirmaLinksResponse> {
  const { data } = await api.get<FirmaLinksResponse>('/reports/firmaLinks.php', {
    params: { id: folio, id_airport: idAirport },
  });
  return data;
}

/** "Resumen de Hab. y Pax" de una O.S. (op/api/reports/resumenOs.php, archivo nuevo de la web). */
export interface ResumenOsPax {
  name: string;
  type: 'A' | 'N' | 'I';
  date_out: string | null;
  extended: boolean;
}

export interface ResumenOsHotel {
  id_hotel: number;
  name: string;
  rooms: number;
  pax: number;
  adults: number;
  children: number;
  infants: number;
  habs: { pax: ResumenOsPax[] }[];
}

export interface ResumenOsResponse {
  ok: boolean;
  folio_display?: string;
  airline?: string;
  flight?: string | null;
  totals?: { rooms: number; pax: number; adults: number; children: number; infants: number };
  hotels?: ResumenOsHotel[];
  error?: string;
}

export async function getResumenOs(folio: number, idAirport: number): Promise<ResumenOsResponse> {
  const { data } = await api.get<ResumenOsResponse>('/reports/resumenOs.php', {
    params: { id: folio, id_airport: idAirport },
  });
  return data;
}

export async function getReportList(folio: number, idAirport: number): Promise<ReportListResponse> {
  const { data } = await api.get<ReportListResponse>('/reports/list.php', {
    params: { id: folio, id_airport: idAirport },
  });
  return data;
}

/**
 * Descarga directa del Excel -- a diferencia de descargar.php (Delay Info),
 * paxes.php/paxes_ep.php SÍ exigen sesión o un enlace firmado
 * (op/include/authGuard.php + linkToken.php), así que no se puede armar la
 * URL a mano: hay que usar el `download_path`/`download_path_general` que
 * ya regresa getReportList() (viene firmado con aps_link_token_qs()).
 */
export function getReportDownloadUrl(path: string): string {
  return `${getSiteBaseUrl()}${path}`;
}

export interface SendReportResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function sendReportByEmail(payload: {
  id_order: number;
  id_hotel: number;
  id_airport: number;
  email: string;
  script: 'paxes' | 'paxes_ep';
}): Promise<SendReportResponse> {
  const { data } = await api.post<SendReportResponse>('/reports/sendReport.php', payload, {
    timeout: 60000,
  });
  return data;
}

/**
 * Editar O.S. -- equivalente movil de op/modulos/createEdit/*. Aeropuerto y
 * aerolinea son de solo lectura aqui (igual que en el formulario web).
 */
export interface EditOrderInfo {
  folio_display: string;
  iata: string;
  airline: string;
  flight: string | null;
  id_event: number;
  date_in: string | null;
  date_out: string | null;
  hour: string | null;
  status: 'open' | 'close' | 'cancel';
}

export interface EditOrderHotel {
  id_orders_hotels: number;
  id_hotel: number;
  name: string;
  rooms_dis: number;
}

export interface EditOrderInfoResponse {
  ok: boolean;
  order?: EditOrderInfo;
  hotels?: EditOrderHotel[];
  error?: string;
}

export async function getEditOrderInfo(folio: number, idAirport: number): Promise<EditOrderInfoResponse> {
  const { data } = await api.get<EditOrderInfoResponse>('/orders/editOrderInfo.php', {
    params: { id: folio, id_airport: idAirport },
  });
  return data;
}

export interface UpdateOrderHotelInput {
  id_orders_hotels?: number;
  id_hotel: number;
  dispo: number;
}

export interface UpdateOrderPayload {
  id_order: number;
  id_airport: number;
  flight: string;
  event: number;
  date_in: string;
  date_out: string;
  hour: string;
  hotels: UpdateOrderHotelInput[];
  deleted_hotel_ids: number[];
}

export interface UpdateOrderResponse {
  ok: boolean;
  msg?: string;
  error?: string;
}

export async function updateOrder(payload: UpdateOrderPayload): Promise<UpdateOrderResponse> {
  const { data } = await api.post<UpdateOrderResponse>('/orders/updateOrder.php', payload);
  return data;
}

export interface ToggleStatusResponse {
  ok: boolean;
  status?: string;
  msg?: string;
  error?: string;
}

export async function toggleOrderStatus(
  folio: number,
  idAirport: number,
  re: 'reopen' | 'reclose'
): Promise<ToggleStatusResponse> {
  const { data } = await api.post<ToggleStatusResponse>('/orders/toggleStatus.php', {
    id_order: folio,
    id_airport: idAirport,
    re,
  });
  return data;
}

/**
 * Comprobantes (fotos/PDF) de una O.S. -- equivalente movil de
 * op/modulos/details/up.php + insert.php + view.php.
 */
export interface OrderFileDTO {
  name: string;
  url: string;
  type: 'image' | 'pdf';
  size: number;
  uploaded_at: number | null;
}

export interface OrderFilesResponse {
  ok: boolean;
  files?: OrderFileDTO[];
  error?: string;
}

export async function getOrderFiles(folio: number, idAirport: number): Promise<OrderFilesResponse> {
  const { data } = await api.get<OrderFilesResponse>('/details/files.php', {
    params: { id: folio, id_airport: idAirport },
  });
  return data;
}

export interface UploadOrderFilesResponse {
  ok: boolean;
  subidos?: string[];
  rechazados?: string[];
  error?: string;
}

/**
 * Historial de notificaciones -- lee push_notifications_log (la misma tabla
 * que llena aps_push_notify_station() en cada creacion/cierre/cancelacion
 * de O.S. y alta/edicion de pax/transporte). Sirve como bandeja aunque el
 * push remoto todavia no funcione en este dispositivo (Expo Go en Android
 * no lo soporta -- se necesita una build compilada).
 */
export interface NotificationItem {
  id: number;
  iata: string | null;
  evento: string | null;
  titulo: string | null;
  cuerpo: string | null;
  sent_at: string;
}

export interface NotificationsResponse {
  ok: boolean;
  items?: NotificationItem[];
  total?: number;
  page?: number;
  has_more?: boolean;
  error?: string;
}

export async function getNotifications(page = 1): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>('/notifications/list.php', { params: { page } });
  return data;
}

export async function uploadOrderFiles(
  folio: number,
  idAirport: number,
  pickedFiles: { uri: string; name: string; mimeType: string }[]
): Promise<UploadOrderFilesResponse> {
  const form = new FormData();
  form.append('id_order', String(folio));
  form.append('id_airport', String(idAirport));
  pickedFiles.forEach((f) => {
    // @ts-expect-error React Native's FormData acepta este shape para archivos locales.
    form.append('file[]', { uri: f.uri, name: f.name, type: f.mimeType });
  });
  const { data } = await api.post<UploadOrderFilesResponse>('/details/upload.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data;
}

/**
 * Pre-registro de Pax -- equivalente movil de op/modulos/prereg/ (sub-fases
 * 3A/3B/3C: lectura, asignacion de hotel, y grupos familiares). El QR real
 * (3D) y la subida de listas con IA (3E) se agregan despues.
 */
export interface PreregOrderListItem {
  folio: number;
  id_airport: number;
  folio_display: string;
  iata: string;
  flight: string | null;
  date_in: string | null;
  total: number;
  pendientes: number;
  capturados?: number;
  habitaciones?: number;
}

export interface PreregOrdersResponse {
  ok: boolean;
  orders?: PreregOrderListItem[];
  error?: string;
}

export async function getPreregOrders(): Promise<PreregOrdersResponse> {
  const { data } = await api.get<PreregOrdersResponse>('/prereg/orders.php');
  return data;
}

export interface PreregCompanion {
  name: string;
  type: 'adulto' | 'nino' | 'infante' | string;
  age: number | null;
  room: number | null;
}

export type PreregFlightState = 'none' | 'ok' | 'num' | 'bad';
export type PreregVoucherState = 'none' | 'missing' | 'ok' | 'other';

export interface PreregCheck {
  flight: { state: PreregFlightState; scan: string; order: string };
  in_os: { name: string; id_hotel: number; hotel: string } | null;
  voucher: { state: PreregVoucherState; owner?: string; hotel?: string };
}

export interface PreregPaxItem {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  voucher: string | null;
  party_size: number;
  flight: string | null;
  notes: string | null;
  source: string | null;
  scan_method: string | null;
  scan_name: string | null;
  scan_flight: string | null;
  fam_code: string | null;
  group_code: string | null;
  done_at: string | null;
  room: number | null;
  status: 'pendiente' | 'asignado';
  id_hotel: number | null;
  hotel_name: string | null;
  assigned_by: string | null;
  created_at: string;
  comps: PreregCompanion[];
  check: PreregCheck;
}

export interface PreregOsListItem {
  name: string;
  voucher: string;
  hotel: string;
  pre: boolean;
}

export interface PreregDetailResponse {
  ok: boolean;
  token?: string;
  type?: string;
  hotels?: { id: number; name: string }[];
  pax?: PreregPaxItem[];
  os_flight?: string;
  os_pax?: number;
  os_list?: PreregOsListItem[];
  error?: string;
}

export async function getPreregDetail(folio: number, idAirport: number): Promise<PreregDetailResponse> {
  const { data } = await api.get<PreregDetailResponse>('/prereg/detail.php', { params: { folio, ap: idAirport } });
  return data;
}

export interface PreregAssignResponse {
  ok: boolean;
  status?: 'pendiente' | 'asignado';
  hotel_name?: string;
  error?: string;
}

export async function assignPreregHotel(id: number, idHotel: number): Promise<PreregAssignResponse> {
  const { data } = await api.post<PreregAssignResponse>('/prereg/assign.php', { id, id_hotel: idHotel });
  return data;
}

export interface PreregAssignManyResponse {
  ok: boolean;
  n?: number;
  hotel?: string;
  error?: string;
}

export async function assignPreregHotelMany(
  ids: number[],
  idHotel: number,
  room?: number
): Promise<PreregAssignManyResponse> {
  const { data } = await api.post<PreregAssignManyResponse>('/prereg/assignMany.php', { ids, id_hotel: idHotel, room });
  return data;
}

export interface PreregOkResponse {
  ok: boolean;
  error?: string;
}

export async function reopenPreregPax(id: number): Promise<PreregOkResponse> {
  const { data } = await api.post<PreregOkResponse>('/prereg/reopen.php', { id });
  return data;
}

export interface PreregJoinResponse {
  ok: boolean;
  leader?: string;
  error?: string;
}

export async function joinPreregGroup(id: number, target: number): Promise<PreregJoinResponse> {
  const { data } = await api.post<PreregJoinResponse>('/prereg/join.php', { id, target });
  return data;
}

export async function unjoinPreregGroup(id: number): Promise<PreregOkResponse> {
  const { data } = await api.post<PreregOkResponse>('/prereg/unjoin.php', { id });
  return data;
}

export interface PreregJoinManyResponse {
  ok: boolean;
  unidos?: number;
  error?: string;
}

export async function joinManyPreregGroup(leader: number, ids: number[]): Promise<PreregJoinManyResponse> {
  const { data } = await api.post<PreregJoinManyResponse>('/prereg/joinMany.php', { leader, ids });
  return data;
}

/**
 * Sub-fase 3D: QR en el dispositivo. El QR de la O.S. (para que los
 * pasajeros se pre-registren) se pinta en el cliente con el token ya
 * firmado por el servidor (pr_token) -- no hace falta un endpoint para
 * generarlo. Lo que sí es nuevo es el escaneo del QR PERSONAL del
 * pasajero (su código único, mostrado al terminar su auto-registro) para
 * jalar sus datos y pre-llenar el alta en la O.S.
 */
export interface PreregLookupComp {
  name: string;
  type: string;
  age: number | null;
}

export interface PreregLookupResponse {
  ok: boolean;
  id?: number;
  code?: string;
  name?: string;
  voucher?: string | null;
  party?: number;
  comps?: PreregLookupComp[];
  folio?: number;
  id_airport?: number;
  type_airline?: string;
  folio_display?: string;
  iata?: string;
  flight?: string | null;
  status?: 'pendiente' | 'asignado';
  id_hotel?: number | null;
  hotel_name?: string | null;
  already_in_os?: { hotel: string } | null;
  flight_state?: PreregFlightState;
  qr_closed?: boolean;
  error?: string;
}

/** `q` es lo leído de la cámara (la URL completa del QR) o el código de 4-10 caracteres tecleado a mano. */
export async function lookupPreregByQr(q: string): Promise<PreregLookupResponse> {
  const { data } = await api.get<PreregLookupResponse>('/prereg/lookup.php', { params: { q } });
  return data;
}

/** Bitácora: se mostró el QR de pre-registro de esta O.S. (igual que hace la web al abrir el QR). Mejor esfuerzo, no bloquea la UI. */
export async function logPreregOsQr(folio: number, idAirport: number): Promise<PreregOkResponse> {
  const { data } = await api.post<PreregOkResponse>('/prereg/logOs.php', { folio, ap: idAirport });
  return data;
}

export interface PreregListItem {
  id: number;
  name: string;
  party: number;
  hotel_name: string;
  ya: boolean;
  voucher: string;
  id_hotel: number | null;
  comps: PreregLookupComp[];
}

export interface PreregListForOsResponse {
  ok: boolean;
  items?: PreregListItem[];
  pending?: number;
  error?: string;
}

/** Aviso pasivo (alta manual, sin pasar por el escaneo de QR): quiénes ya
 * se pre-registraron para esta O.S. -- equivalente de
 * op/modulos/open/preregLista.php (aps_prereg_lista), usado por add.php. */
export async function getPreregListForOs(folio: number, idAirport: number): Promise<PreregListForOsResponse> {
  const { data } = await api.get<PreregListForOsResponse>('/prereg/listForOs.php', { params: { folio, ap: idAirport } });
  return data;
}

// ===== Listas de aerolínea + subida con IA (Pre-registro de Pax) =====

export interface PreregBatchItem {
  id: number;
  airline: string;
  flight: string;
  date: string;
  items: number;
  imported: number;
  match: boolean;
}

export interface PreregBatchesResponse {
  ok: boolean;
  batches?: PreregBatchItem[];
  error?: string;
}

export async function getPreregBatches(folio: number, idAirport: number): Promise<PreregBatchesResponse> {
  const { data } = await api.get<PreregBatchesResponse>('/prereg/batches.php', { params: { folio, ap: idAirport } });
  return data;
}

export interface PreregImportResponse {
  ok: boolean;
  nuevos?: number;
  omitidos?: number;
  error?: string;
}

export async function importPreregBatch(folio: number, idAirport: number, batch: number): Promise<PreregImportResponse> {
  const { data } = await api.post<PreregImportResponse>('/prereg/import.php', { folio, ap: idAirport, batch });
  return data;
}

export interface PreregUploadListResponse {
  ok: boolean;
  leidos?: number;
  nuevos?: number;
  omitidos?: number;
  error?: string;
}

/** Sube una foto o PDF de una lista de pasajeros para que la IA la lea --
 * puede tardar hasta 2 minutos (PDFs grandes a veces reintentan pagina por
 * pagina en el servidor), por eso el timeout largo. */
export async function uploadPreregList(
  folio: number,
  idAirport: number,
  file: { uri: string; name: string; mimeType: string }
): Promise<PreregUploadListResponse> {
  const form = new FormData();
  form.append('lista', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('folio', String(folio));
  form.append('ap', String(idAirport));
  const { data } = await api.post<PreregUploadListResponse>('/prereg/uploadList.php', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data;
}
