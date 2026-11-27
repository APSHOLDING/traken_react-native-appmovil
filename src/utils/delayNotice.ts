import { ARIAL_BOLD, ARIAL_REG } from './arialMetrics';

/**
 * Aviso de Retraso (Delay Info) dibujado EN EL TELEFONO, sin servidor.
 *
 * Es un calco de op/modulos/delayInfo/di_render.php (el generador de la web): mismas medidas, mismos
 * textos en los 6 idiomas, mismos colores y el mismo acomodo de renglones (con las medidas reales de
 * Arial). Aqui solo se CALCULA el diseno; DelayNoticeSvg lo dibuja y el celular lo exporta a PNG.
 */
export type NoticeParams = {
  lang: string;
  airline: string;
  flight: string;
  dest: string;
  pickup: string;
  departure: string;
  date: string; // 'YYYY-MM-DD'
  folio: string;
  estacion: string;
};

/** Logo de la aerolinea ya recortado: w/h son las medidas del logo recortado ORIGINAL (para calcular el tamano como la web). */
export type NoticeLogo = { uri: string; w: number; h: number } | null;

export type NoticeItem =
  | { k: 'grad'; x: number; y: number; w: number; h: number }
  | { k: 'text'; x: number; y: number; text: string; size: number; bold: boolean; fill: string; anchor: 'start' | 'middle' }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { k: 'rrect'; x: number; y: number; w: number; h: number; r: number; fill: string }
  | { k: 'qr'; x: number; y: number; size: number; path: string; color: string }
  | { k: 'logo'; x: number; y: number; w: number; h: number; uri: string };

export type NoticeLayout = { W: number; H: number; items: NoticeItem[] };

const T: Record<string, Record<string, string>> = {
  es: { title: 'INFORMACION SOBRE\nRETRASOS', msg: 'Estimados huespedes, nos disculpamos por las molestias causadas por el retraso. Su bienestar es nuestra prioridad. Para ayudarle, le proporcionamos la siguiente informacion.', flight: 'NO. DE VUELO:', dest: 'DESTINO:', pickup: 'HORA DE RECOGIDA:', departure: 'HORA ESTIMADA DE SALIDA:', paxFrom: 'SOLO PASAJEROS DEL:', qrText: 'Escanea este codigo QR para completar nuestra encuesta de satisfaccion', folioLbl: 'Folio' },
  en: { title: 'DELAY\nINFORMATION', msg: 'Dear guests, we apologize for the inconvenience caused by the delay. Your well-being is our priority. To assist you, we provide the following information.', flight: 'FLIGHT NO:', dest: 'DESTINATION:', pickup: 'PICK UP TIME:', departure: 'ESTIMATED TIME DEPARTURE:', paxFrom: 'ONLY PASSENGERS FROM:', qrText: 'Scan this QR code to complete our satisfaction survey', folioLbl: 'Folio' },
  it: { title: 'INFORMAZIONI SUI\nRITARDI', msg: 'Gentili ospiti, ci scusiamo per il disagio causato dal ritardo. Il vostro benessere e la nostra priorita. Per venirvi in aiuto, vi forniamo le seguenti informazioni.', flight: 'FLIGHT NO:', dest: 'DESTINATION:', pickup: 'PICK UP TIME:', departure: 'ESTIMATED TIME DEPARTURE:', paxFrom: 'ONLY PASSENGERS FROM:', qrText: 'Scansiona questo codice QR per completare il nostro sondaggio di soddisfazione', folioLbl: 'Folio' },
  fr: { title: 'INFORMATIONS SUR\nLES RETARDS', msg: 'Chers clients, nous nous excusons pour la gene causee par le retard. Votre bien-etre est notre priorite. Pour vous aider, nous vous fournissons les informations suivantes.', flight: 'NO. DE VOL:', dest: 'DESTINATION:', pickup: 'HEURE DE PRISE EN CHARGE:', departure: 'HEURE ESTIMEE DE DEPART:', paxFrom: 'UNIQUEMENT PASSAGERS DU:', qrText: 'Scannez ce code QR pour completer notre enquete de satisfaction', folioLbl: 'Folio' },
  de: { title: 'INFORMATIONEN ZU\nVERSPATUNGEN', msg: 'Liebe Gaste, wir entschuldigen uns fur die Unannehmlichkeiten durch die Verspatung. Ihr Wohlbefinden hat fur uns Prioritat. Um Ihnen zu helfen, stellen wir Ihnen folgende Informationen zur Verfugung.', flight: 'FLUGNUMMER:', dest: 'ZIEL:', pickup: 'ABHOLZEIT:', departure: 'VORAUSSICHTLICHE ABFLUGZEIT:', paxFrom: 'NUR PASSAGIERE VOM:', qrText: 'Scannen Sie diesen QR-Code, um an unserer Zufriedenheitsumfrage teilzunehmen', folioLbl: 'Folio' },
  pt: { title: 'INFORMACOES SOBRE\nATRASOS', msg: 'Prezados hospedes, pedimos desculpas pelo inconveniente causado pelo atraso. Seu bem-estar e nossa prioridade. Para ajuda-lo, fornecemos as seguintes informacoes.', flight: 'NO. DO VOO:', dest: 'DESTINO:', pickup: 'HORARIO DE BUSCA:', departure: 'HORARIO ESTIMADO DE PARTIDA:', paxFrom: 'APENAS PASSAGEIROS DE:', qrText: 'Escaneie este codigo QR para completar nossa pesquisa de satisfacao', folioLbl: 'Folio' },
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const CYAN = '#0891b2';
const NAVY = '#16214d';
const RED = '#c8102e';
const GRAY = '#334155';
const GRAY_L = '#64748b';
const CARD_BG = '#f1f5f9';
const LINE = '#e2e8f0';

/** Los tamanos de la web estan en puntos (96 dpi): px = pt x 4/3. */
const PX = 4 / 3;

/** Ancho en px de un texto en Arial al tamano dado (en puntos), con las medidas reales de la fuente. */
function textWidth(sizePt: number, bold: boolean, text: string): number {
  const tbl = bold ? ARIAL_BOLD : ARIAL_REG;
  let em = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    em += tbl[cp] ?? 0.55;
  }
  return em * sizePt * PX;
}

function wrap(sizePt: number, bold: boolean, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line === '' ? w : line + ' ' + w;
    if (textWidth(sizePt, bold, test) > maxW && line !== '') {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** Igual que rawurlencode de PHP (solo deja sin codificar - _ . ~). */
function rawurlencode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Matriz del QR (nivel de correccion H, como la web). */
function qrMatrix(text: string): boolean[][] {
  // Se importa igual que lo hace react-native-qrcode-svg (ya viene en el proyecto).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const QRCode = require('qrcode');
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const size: number = qr.modules.size;
  const data: ArrayLike<number> = qr.modules.data;
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(!!data[r * size + c]);
    rows.push(row);
  }
  return rows;
}

function formatDate(raw: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw.trim());
  if (!m) return '---';
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return '---';
  return `${MONTHS[mon - 1]} ${String(Number(m[3])).padStart(2, '0')} ${m[1]}`;
}

export function buildNotice(p: NoticeParams, logo: NoticeLogo): NoticeLayout {
  const lang = T[p.lang] ? p.lang : 'es';
  const t = T[lang];

  const airline = p.airline.trim();
  const flight = (p.flight.trim() || '---').toUpperCase();
  const dest = (p.dest.trim() || '---').toUpperCase();
  const pickup = p.pickup.trim() || '00:00';
  const departure = p.departure.trim() || '00:00';
  const folio = p.folio.trim();
  const estacion = p.estacion.trim();

  let surveyUrl = 'https://apsholding.mx/encuestas/satisfaccion';
  if (folio !== '') {
    surveyUrl += '?folio=' + rawurlencode(folio);
    if (estacion !== '') surveyUrl += '&estacion=' + rawurlencode(estacion);
  }

  const W = 760;
  const pad = 56;
  const maxW = W - pad * 2;
  const titleLines = t.title.split('\n');

  const fields = [
    { l: t.flight, v: flight, big: false, bar: CYAN, val: NAVY },
    { l: t.dest, v: dest, big: false, bar: NAVY, val: NAVY },
    { l: t.pickup, v: pickup + ' hrs.', big: true, bar: RED, val: RED },
    { l: t.departure, v: departure + ' hrs.', big: true, bar: RED, val: RED },
    { l: t.paxFrom, v: formatDate(p.date), big: false, bar: NAVY, val: NAVY },
  ];

  // Tamanos en puntos (igual que la web)
  const SZ_TITLE = 30, SZ_MSG = 15, SZ_LBL = 11, SZ_BIG = 30, SZ_VAL = 24, SZ_CAP = 12, SZ_FOLIO = 13;
  const BAR_W = 5, TXT_X = 16;

  const msgLines = wrap(SZ_MSG, false, t.msg, maxW);

  // Logo (tamano igual que la web: cabe en 230x120 y nunca se agranda)
  let logoDW = 0, logoDH = 0;
  if (logo && logo.w > 0 && logo.h > 0) {
    const sc = Math.min(230 / logo.w, 120 / logo.h, 1);
    logoDW = Math.round(logo.w * sc);
    logoDH = Math.round(logo.h * sc);
  }

  const colGap = 30;
  const leftW = Math.round(maxW * 0.56);
  const rightW = maxW - leftW - colGap;
  const leftX = pad;
  const rightX = pad + leftW + colGap;

  // QR de encuesta (solo si hay folio)
  let modules: boolean[][] | null = null;
  let qrCell = 0, qrDim = 0;
  const qrCardPad = 18;
  if (folio !== '') {
    modules = qrMatrix(surveyUrl);
    qrCell = Math.max(2, Math.floor(150 / modules.length));
    qrDim = modules.length * qrCell + 8 * 2;
  }
  const qrCapLines = modules ? wrap(SZ_CAP, false, t.qrText, rightW - qrCardPad * 2) : [];
  const qrBlockH = modules ? qrDim + 14 + qrCapLines.length * (SZ_CAP + 6) + 6 + SZ_FOLIO + qrCardPad * 2 : 0;

  let leftH = 0;
  for (const f of fields) leftH += SZ_LBL + 12 + (f.big ? SZ_BIG + 12 : SZ_VAL + 12) + 14;
  let rightH = 0;
  if (modules) rightH += qrBlockH + 14;
  if (logoDH) rightH += logoDH;
  const colH = Math.max(leftH, rightH);

  let y = pad;
  y += titleLines.length * (SZ_TITLE + 16);
  y += 20;
  y += msgLines.length * (SZ_MSG + 12);
  y += 26;
  y += colH;
  y += pad;
  const H = Math.floor(y);

  const items: NoticeItem[] = [];
  items.push({ k: 'grad', x: 0, y: 0, w: W, h: 6 });
  items.push({ k: 'grad', x: 0, y: H - 6, w: W, h: 6 });

  let yy = pad;
  for (const tl of titleLines) {
    yy += SZ_TITLE + 6;
    items.push({ k: 'text', x: W / 2, y: yy, text: tl, size: SZ_TITLE * PX, bold: true, fill: CYAN, anchor: 'middle' });
    yy += 10;
  }
  yy += 14;
  for (const ml of msgLines) {
    yy += SZ_MSG + 6;
    items.push({ k: 'text', x: pad, y: yy, text: ml, size: SZ_MSG * PX, bold: false, fill: GRAY, anchor: 'start' });
    yy += 6;
  }
  yy += 6;
  items.push({ k: 'line', x1: pad, y1: yy, x2: W - pad, y2: yy, stroke: LINE });
  yy += 14;
  const colTop = yy;

  // Columna izquierda: campos con barra de acento
  let ly = colTop;
  for (const f of fields) {
    const blockTop = ly;
    ly += SZ_LBL + 8;
    items.push({ k: 'text', x: leftX + TXT_X, y: ly, text: f.l.toUpperCase(), size: SZ_LBL * PX, bold: true, fill: GRAY_L, anchor: 'start' });
    const sz = f.big ? SZ_BIG : SZ_VAL;
    ly += sz + 8;
    items.push({ k: 'text', x: leftX + TXT_X, y: ly, text: f.v, size: sz * PX, bold: true, fill: f.val, anchor: 'start' });
    items.push({ k: 'rrect', x: leftX, y: blockTop, w: BAR_W, h: ly - blockTop, r: BAR_W / 2, fill: f.bar });
    ly += 14;
  }

  // Columna derecha: tarjeta QR + folio, logo debajo
  let ry = colTop;
  if (modules) {
    items.push({ k: 'rrect', x: rightX, y: ry, w: rightW, h: qrBlockH, r: 16, fill: CARD_BG });
    let cy = ry + qrCardPad;
    const qx = rightX + Math.round((rightW - qrDim) / 2);
    let d = '';
    for (let r = 0; r < modules.length; r++) {
      for (let c = 0; c < modules.length; c++) {
        if (modules[r][c]) d += `M${8 + c * qrCell} ${8 + r * qrCell}h${qrCell}v${qrCell}h-${qrCell}z`;
      }
    }
    items.push({ k: 'qr', x: qx, y: cy, size: qrDim, path: d, color: NAVY });
    cy += qrDim + 14;
    for (const cl of qrCapLines) {
      cy += SZ_CAP;
      items.push({ k: 'text', x: rightX + rightW / 2, y: cy, text: cl, size: SZ_CAP * PX, bold: false, fill: GRAY_L, anchor: 'middle' });
      cy += 6;
    }
    cy += 6;
    cy += SZ_FOLIO;
    items.push({ k: 'text', x: rightX + rightW / 2, y: cy, text: `${t.folioLbl} ${folio}`, size: SZ_FOLIO * PX, bold: true, fill: CYAN, anchor: 'middle' });
    ry += qrBlockH + 14;
  }
  if (logo && logoDH) {
    items.push({ k: 'logo', x: rightX + Math.round((rightW - logoDW) / 2), y: ry, w: logoDW, h: logoDH, uri: logo.uri });
  }

  // Sin folio nombre de aerolinea no se imprime (la web tampoco lo imprime con TTF); se deja por claridad.
  void airline;

  return { W, H, items };
}
