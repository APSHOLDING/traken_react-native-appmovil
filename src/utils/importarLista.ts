import { HotelDTO, PaxType } from '../api/client';

/**
 * Parseo y validación de listas de pasajeros pegadas/importadas desde Excel
 * -- puerto a TypeScript de la lógica (100% cliente) de
 * op/modulos/open/importar_lista.php (exclusiva de la estación SJD). Aquí
 * no hay backend nuevo: el guardado real lo hace addPax() (ya existente),
 * una habitación a la vez, igual que la web llama a insertDetailOrder.php.
 */

const CAP: Record<string, number> = { SGL: 1, DBL: 2, TPL: 3, CDPL: 4 };

export function normalize(s: string): string {
  let v = String(s == null ? '' : s).toLowerCase();
  try {
    v = v.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (e) {
    // normalize no disponible: se sigue sin quitar acentos
  }
  return v.replace(/[^a-z0-9]/g, '');
}

function splitLine(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t').map((x) => x.trim());
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (ch === '"') {
      if (inQuotes && line.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export interface ImportParsedRow {
  hab: string;
  hotel: string;
  nombre: string;
  tipo: string;
  edad: string;
  voucher: string;
  ocup: string;
  n: number;
  /** Resueltos al validar. */
  t?: PaxType | '';
  e?: number;
}

export function parseText(text: string): { rows: ImportParsedRow[] } | { error: string } {
  const ls = String(text)
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.replace(/[\t;,\s]/g, '') !== '');
  if (!ls.length) return { error: 'No hay nada que revisar. Pega la lista primero.' };

  const l0 = ls[0];
  const sep = l0.indexOf('\t') >= 0 ? '\t' : l0.split(';').length >= l0.split(',').length ? ';' : ',';
  let T = ls.map((l) => splitLine(l, sep));

  let idx = { hab: 0, hotel: 1, nombre: 2, tipo: 3, edad: 4, voucher: 5, ocup: 6 };
  const h0 = T[0].map(normalize);
  let conEncabezado = false;

  if (h0.some((c) => c.indexOf('nombre') >= 0 || c.indexOf('pasajero') >= 0)) {
    conEncabezado = true;
    idx = { hab: -1, hotel: -1, nombre: -1, tipo: -1, edad: -1, voucher: -1, ocup: -1 };
    h0.forEach((c, i) => {
      if (/^(hab|habitacion|cuarto|room)/.test(c)) idx.hab = i;
      else if (c.indexOf('hotel') === 0) idx.hotel = i;
      else if (c.indexOf('nombre') >= 0 || c.indexOf('pasajero') >= 0) idx.nombre = i;
      else if (c.indexOf('tipo') === 0) idx.tipo = i;
      else if (c.indexOf('edad') === 0) idx.edad = i;
      else if (c.indexOf('voucher') === 0) idx.voucher = i;
      else if (/^ocup|^tipohab/.test(c)) idx.ocup = i;
    });
    T = T.slice(1);
  } else if (Math.max(...T.map((r) => r.length)) <= 2) {
    idx = { hab: -1, hotel: -1, nombre: 0, tipo: 1, edad: -1, voucher: -1, ocup: -1 };
  }

  const g = (r: string[], k: keyof typeof idx): string => (idx[k] >= 0 && r[idx[k]] != null ? r[idx[k]] : '');

  const rows: ImportParsedRow[] = [];
  let lastHab = '';
  let lastHotel = '';
  const hayHab = T.some((r) => g(r, 'hab') !== '');

  T.forEach((r, n) => {
    const nom = g(r, 'nombre');
    if (!nom) return;
    let hb = g(r, 'hab');
    let ht = g(r, 'hotel');
    // celdas combinadas de Excel: si la habitacion/hotel viene vacio, es la misma de la fila de arriba
    if (hayHab) {
      if (hb === '') {
        hb = lastHab;
        if (ht === '') ht = lastHotel;
      } else {
        lastHab = hb;
        lastHotel = ht;
      }
    }
    rows.push({
      hab: hb,
      hotel: ht,
      nombre: nom.replace(/\s+/g, ' '),
      tipo: g(r, 'tipo'),
      edad: g(r, 'edad'),
      voucher: g(r, 'voucher'),
      ocup: g(r, 'ocup'),
      n: n + 1 + (conEncabezado ? 1 : 0),
    });
  });

  if (!rows.length) return { error: 'No encontré nombres de pasajeros. Revisa que la columna "Nombre" tenga datos.' };
  if (rows.length > 400) return { error: `La lista trae ${rows.length} pasajeros. Divídela en partes de máximo 400.` };
  return { rows };
}

export function hotelMatch(text: string, hotels: HotelDTO[]): HotelDTO | null {
  const k = normalize(text);
  if (!k) return null;
  const m = hotels.filter((h) => {
    const n = normalize(h.name);
    return n === k || (k.length >= 4 && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0));
  });
  return m.length === 1 ? m[0] : null;
}

export function typeFromText(text: string): PaxType | '' {
  const k = normalize(text);
  if (!k || k.charAt(0) === 'a') return 'adulto';
  if (k.charAt(0) === 'n' || k.charAt(0) === 'm' || k.charAt(0) === 'c') return 'nino';
  if (k.charAt(0) === 'i') return 'infante';
  return '';
}

const OCUP_MAP: Record<string, string> = {
  SGL: 'SGL',
  SENCILLA: 'SGL',
  SENCILLO: 'SGL',
  SINGLE: 'SGL',
  DBL: 'DBL',
  DOBLE: 'DBL',
  DOUBLE: 'DBL',
  TPL: 'TPL',
  TRIPLE: 'TPL',
  CDPL: 'CDPL',
  CUADRUPLE: 'CDPL',
  CUADRUPLO: 'CDPL',
  QUAD: 'CDPL',
};

export function occupationFromText(text: string, count: number): string {
  const k = normalize(text).toUpperCase();
  if (!k) return count === 1 ? 'SGL' : count === 2 ? 'DBL' : count === 3 ? 'TPL' : count === 4 ? 'CDPL' : '';
  return OCUP_MAP[k] || '';
}

export interface ImportGroup {
  key: string;
  pax: ImportParsedRow[];
  htxt: string;
  hid: number | null;
  hotel: HotelDTO | null;
  octxt: string;
  oc: string;
  ocAuto: boolean;
  errors: string[];
  warnings: string[];
  skip: boolean;
  force: boolean;
  done: boolean;
}

export function buildGroups(rows: ImportParsedRow[], hotels: HotelDTO[]): ImportGroup[] {
  const mapa: Record<string, ImportGroup> = {};
  const grupos: ImportGroup[] = [];
  const unico = hotels.length === 1 ? hotels[0] : null;

  rows.forEach((r, i) => {
    const k = r.hab !== '' ? 'H' + normalize(r.hab) : 'S' + i;
    if (!mapa[k]) {
      mapa[k] = {
        key: k,
        pax: [],
        htxt: '',
        hid: null,
        hotel: null,
        octxt: '',
        oc: '',
        ocAuto: true,
        errors: [],
        warnings: [],
        skip: false,
        force: false,
        done: false,
      };
      grupos.push(mapa[k]);
    }
    mapa[k].pax.push(r);
  });

  grupos.forEach((g) => {
    let ht = '';
    g.pax.forEach((p) => {
      if (!ht && p.hotel) ht = p.hotel;
    });
    g.htxt = ht;
    const h = ht ? hotelMatch(ht, hotels) : unico;
    g.hid = h ? h.id : null;

    let oc = '';
    g.pax.forEach((p) => {
      if (!oc && p.ocup) oc = p.ocup;
    });
    g.octxt = oc;
    g.oc = occupationFromText(oc, g.pax.length);
    g.ocAuto = !oc;
  });

  return grupos;
}

function hotelById(id: number | null, hotels: HotelDTO[]): HotelDTO | null {
  if (id == null) return null;
  return hotels.find((h) => h.id === id) ?? null;
}

/** Muta cada grupo (errors/warnings/skip/hotel/pax[].t/pax[].e) -- mismo estilo que la web. */
export function validateGroups(groups: ImportGroup[], hotels: HotelDTO[], existingNames: Set<string>): void {
  const usados: Record<number, number> = {};
  const vistos: Record<string, boolean> = {};

  groups.forEach((g) => {
    g.errors = [];
    g.warnings = [];

    const iguales = g.pax.filter((p) => existingNames.has(normalize(p.nombre))).length;
    g.skip = !g.force && iguales === g.pax.length;
    if (g.done || g.skip) return;

    if (iguales) g.warnings.push(`${iguales} de ${g.pax.length} pasajero(s) ya están en esta orden.`);
    g.pax.forEach((p) => {
      const k = normalize(p.nombre);
      if (vistos[k]) g.warnings.push(`"${p.nombre}" aparece más de una vez en tu lista.`);
      vistos[k] = true;
    });

    g.hotel = hotelById(g.hid, hotels);
    if (!g.hotel) {
      g.errors.push(
        g.htxt
          ? `👉 AQUÍ MISMO: el hotel "${g.htxt}" no coincide con ninguno de esta O.S. Elígelo en la lista "¿Hotel?" de esta habitación (arriba de este aviso).`
          : '👉 AQUÍ MISMO: elige el hotel en la lista "¿Hotel?" de esta habitación.'
      );
    } else {
      usados[g.hotel.id] = (usados[g.hotel.id] || 0) + 1;
    }

    g.pax.forEach((p) => {
      p.t = typeFromText(p.tipo);
      if (!p.t) {
        g.errors.push(
          `👉 EN TU EXCEL, renglón ${p.n} (${p.nombre}): el Tipo "${p.tipo}" no es válido. Cámbialo a Adulto, Niño o Infante y vuelve a pegar.`
        );
      }
      const e = parseInt(p.edad, 10);
      p.e = 0;
      if (p.t === 'nino') {
        if (Number.isNaN(e) || e < 2 || e > 12) {
          g.errors.push(
            `👉 EN TU EXCEL, renglón ${p.n} (${p.nombre}): a un niño hay que ponerle la Edad entre 2 y 12 (hoy: ${p.edad || 'vacía'}). Corrígela y vuelve a pegar.`
          );
        } else {
          p.e = e;
        }
      } else if (p.t === 'infante') {
        p.e = Number.isNaN(e) ? 0 : e;
        if (p.e < 0 || p.e > 1) {
          g.errors.push(
            `👉 EN TU EXCEL, renglón ${p.n} (${p.nombre}): un infante debe tener 0 o 1 año (hoy: ${p.edad}). Corrígelo y vuelve a pegar; si tiene 2 a 12 es Niño.`
          );
        }
      }
      if (!/[a-z]/.test(normalize(p.nombre).replace(/[0-9]/g, ''))) {
        g.errors.push(`👉 EN TU EXCEL, renglón ${p.n}: el Nombre "${p.nombre}" no es válido (debe llevar letras). Corrígelo y vuelve a pegar.`);
      }
    });

    if (!g.oc) {
      g.errors.push(
        g.octxt
          ? `👉 AQUÍ MISMO: la ocupación "${g.octxt}" no es válida. Elígela en la lista "¿Ocupación?" de esta habitación.`
          : '👉 AQUÍ MISMO: hay más de 4 personas; elige la ocupación en la lista "¿Ocupación?". (Si son de habitaciones distintas, en tu Excel ponles distinto número de Habitación.)'
      );
    } else if (CAP[g.oc] && g.pax.length > CAP[g.oc]) {
      g.errors.push(
        `👉 AQUÍ MISMO: hay ${g.pax.length} personas y la ocupación es ${g.oc}. Cámbiala en la lista "Ocupación". (Si son de habitaciones distintas, corrige el número de Habitación en tu Excel.)`
      );
    } else if (CAP[g.oc] && g.pax.length < CAP[g.oc] && g.octxt) {
      g.warnings.push(`Ocupación ${g.oc} con solo ${g.pax.length} persona(s).`);
    }
  });

  groups.forEach((g) => {
    if (g.done || g.skip || !g.hotel) return;
    const dis = g.hotel.rooms_dis;
    if (usados[g.hotel.id] > dis) {
      g.errors.push(
        `👉 En esta O.S. solo quedan ${dis} habitaciones disponibles en ${g.hotel.name} y tu lista trae ${usados[g.hotel.id]}. Cambia el hotel de esta habitación en su lista "Hotel", o agrega habitaciones a ese hotel en la orden y vuelve a revisar.`
      );
    }
  });
}

export function activeGroups(groups: ImportGroup[]): ImportGroup[] {
  return groups.filter((g) => !g.skip && !g.done);
}
