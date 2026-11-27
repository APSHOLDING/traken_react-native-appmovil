import type { PaxType } from '../api/client';

/**
 * Captura rapida (BETA): interpreta texto escrito o dictado ("Juan Perez y
 * Maria Lopez, doble, hotel Fiesta, salida 28 nov 6am") y arma el "machote"
 * de habitaciones para confirmarlo antes de guardar.
 *
 * Es un interprete de reglas que corre en el telefono: funciona SIN internet,
 * no manda nada a ningun servicio externo y no pesa. Una habitacion por
 * renglon (o separadas con ;).
 */
export type CapturePax = { name: string; type: PaxType };

export type CaptureRoom = {
  id: number;
  raw: string;
  pax: CapturePax[];
  ocupation: string; // SGL | DBL | TPL | CDPL | ''
  idHotel: number | null;
  hotelName: string;
  fSalida: string; // YYYY-MM-DD
  hora: string; // HH:MM
  voucher: string;
  /** Cosas que faltan o estan mal: bloquean el guardado hasta corregirlas. */
  problems: string[];
  /** Avisos que no bloquean (ej. "usé la fecha de la O.S."). */
  notes: string[];
};

export type CaptureContext = {
  hotels: { id: number; name: string }[];
  defaultDate: string;
  defaultHora: string;
  showOcupation: boolean;
};

export const OCUPATION_CAP: Record<string, number> = { SGL: 1, DBL: 2, TPL: 3, CDPL: 4 };
export const OCUPATION_NAME: Record<string, string> = { SGL: 'Sencilla', DBL: 'Doble', TPL: 'Triple', CDPL: 'Cuádruple' };

const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
};

function plain(s: string): string {
  // Quita acentos caracter por caracter para que el largo no cambie (los indices coinciden).
  return Array.from(s)
    .map((ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .join('')
    .toLowerCase();
}

/** Busca con regex sobre el texto sin acentos y, si encuentra, quita ese tramo del original. */
function take(work: { s: string }, re: RegExp): RegExpExecArray | null {
  const m = re.exec(plain(work.s));
  if (!m) return null;
  work.s = (work.s.slice(0, m.index) + ' ' + work.s.slice(m.index + m[0].length)).replace(/\s+/g, ' ');
  return m;
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function todayParts(now: Date) {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function addDays(now: Date, n: number): Date {
  const x = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function titleCase(s: string): string {
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (letters && letters === letters.toLowerCase()) {
    return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  }
  return s;
}

function bestHotel(phrase: string, hotels: { id: number; name: string }[]): { id: number; name: string } | null {
  const ph = plain(phrase).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!ph) return null;
  const scored = hotels
    .map((h) => {
      const hn = plain(h.name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const toks = hn.split(' ').filter((t) => t.length >= 3 && !['hotel', 'the', 'del', 'los', 'las', 'resort', 'suites', 'inn'].includes(t));
      const hits = toks.filter((t) => ph.includes(t)).length;
      const full = hn.includes(ph) || ph.includes(hn);
      return { h, score: (full ? 100 : 0) + hits };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null; // ambiguo: que lo elija la persona
  return scored[0].h;
}

export function parseCapture(text: string, ctx: CaptureContext, now: Date = new Date()): CaptureRoom[] {
  const segments = text
    .split(/\n|;/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const rooms: CaptureRoom[] = [];
  segments.forEach((seg, idx) => {
    const work = { s: seg };
    const problems: string[] = [];
    const notes: string[] = [];

    // Voucher
    let voucher = '';
    const mv = take(work, /\b(?:voucher|vch|vouch)\s*[:#]?\s*([a-z0-9-]{3,})/);
    if (mv) voucher = mv[1].toUpperCase();

    // Ocupacion
    let ocupation = '';
    const mo = take(work, /\b(?:habitacion|hab|cuarto)?\s*(sencilla|sencillo|sgl|doble|dbl|triple|tpl|cuadruple|cuadruplo|cdpl)\b/);
    if (mo) {
      const k = mo[1];
      ocupation = k.startsWith('sen') || k === 'sgl' ? 'SGL' : k.startsWith('dob') || k === 'dbl' ? 'DBL' : k.startsWith('tri') || k === 'tpl' ? 'TPL' : 'CDPL';
    }

    // Hotel
    let idHotel: number | null = null;
    let hotelName = '';
    const mh = take(work, /\bhotel\s+(.+?)(?=\s+(?:salida|sale|salen|vuelo|voucher|hoy|manana|a las)\b|\s+\d|,|$)/);
    if (mh) {
      const h = bestHotel(mh[1], ctx.hotels);
      if (h) {
        idHotel = h.id;
        hotelName = h.name.trim();
      }
    }
    if (idHotel === null && ctx.hotels.length === 1) {
      idHotel = ctx.hotels[0].id;
      hotelName = ctx.hotels[0].name.trim();
      notes.push('Hotel: el único disponible');
    }

    // Hora
    let hora = '';
    let mt = take(work, /\b(?:a las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/);
    if (mt) {
      let h = parseInt(mt[1], 10);
      const mm = mt[2] ? parseInt(mt[2], 10) : 0;
      const pm = mt[3].startsWith('p');
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
      hora = `${pad(h)}:${pad(mm)}`;
    } else if ((mt = take(work, /\b(\d{1,2}):(\d{2})\s*(?:hrs|h)?\b/))) {
      hora = `${pad(parseInt(mt[1], 10))}:${mt[2]}`;
    } else if ((mt = take(work, /\ba las\s+(\d{1,2})(?::(\d{2}))?\s*(?:de la\s+)?(manana|tarde|noche)?\b/))) {
      let h = parseInt(mt[1], 10);
      const mm = mt[2] ? parseInt(mt[2], 10) : 0;
      if ((mt[3] === 'tarde' || mt[3] === 'noche') && h < 12) h += 12;
      hora = `${pad(h)}:${pad(mm)}`;
    } else if ((mt = take(work, /\b(\d{1,2})\s*(?:hrs|horas)\b/))) {
      hora = `${pad(parseInt(mt[1], 10))}:00`;
    }
    if (hora) {
      const [hh, mi] = hora.split(':').map(Number);
      if (hh > 23 || mi > 59) {
        problems.push(`La hora "${hora}" no es válida`);
        hora = '';
      }
    }

    // Fecha
    let fSalida = '';
    let dateBad = false;
    const t = todayParts(now);
    let md: RegExpExecArray | null;
    if ((md = take(work, /\b(pasado manana)\b/))) {
      const d = addDays(now, 2);
      fSalida = isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    } else if ((md = take(work, /\b(manana)\b/))) {
      const d = addDays(now, 1);
      fSalida = isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    } else if ((md = take(work, /\b(hoy)\b/))) {
      fSalida = isoDate(t.y, t.m, t.d);
    } else if ((md = take(work, /\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)[a-z]*\b(?:\s*(?:de\s+)?(\d{4}))?/))) {
      const day = parseInt(md[1], 10);
      const mon = MONTHS[md[2]];
      let year = md[3] ? parseInt(md[3], 10) : t.y;
      if (!md[3] && new Date(year, mon - 1, day).getTime() < addDays(now, -45).getTime()) year += 1;
      fSalida = isoDate(year, mon, day);
    } else if ((md = take(work, /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/))) {
      const day = parseInt(md[1], 10);
      const mon = parseInt(md[2], 10);
      let year = md[3] ? parseInt(md[3], 10) : t.y;
      if (year < 100) year += 2000;
      if (!md[3] && new Date(year, mon - 1, day).getTime() < addDays(now, -45).getTime()) year += 1;
      fSalida = isoDate(year, mon, day);
    }
    if (fSalida) {
      const [yy, mm2, dd] = fSalida.split('-').map(Number);
      const chk = new Date(yy, mm2 - 1, dd);
      if (chk.getMonth() !== mm2 - 1 || chk.getDate() !== dd) {
        problems.push(`La fecha ${dd}/${mm2} no existe`);
        fSalida = '';
        dateBad = true;
      }
    }

    // Lo que sobra son los nombres (y su tipo)
    const rest = work.s
      .replace(/\b(habitacion(?:es)?|hab|cuarto|pasajeros?|pax|hotel|salida|sale|salen|fecha|el dia|dia)\b/gi, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const chunks = rest
      .split(/\s+y\s+|,|\+|&|\//i)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const pax: CapturePax[] = [];
    chunks.forEach((c) => {
      let type: PaxType = 'adulto';
      const pc = plain(c);
      if (/\b(infante|bebe)\b/.test(pc)) type = 'infante';
      else if (/\b(nino|nina|menor|hijo|hija)\b/.test(pc)) type = 'nino';
      const clean = c
        .replace(/\b(infante|bebe|niñ[oa]|nin[oa]|menor|hij[oa])\b/gi, ' ')
        .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñÜü' ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean.length >= 2) pax.push({ name: titleCase(clean), type });
    });

    if (pax.length === 0) return; // renglon sin nombres: se ignora

    // Ocupacion
    const people = pax.filter((x) => x.type !== 'infante').length;
    if (ctx.showOcupation) {
      if (!ocupation) {
        ocupation = people <= 1 ? 'SGL' : people === 2 ? 'DBL' : people === 3 ? 'TPL' : 'CDPL';
        notes.push(`Tipo de habitación según personas: ${OCUPATION_NAME[ocupation]}`);
      }
      if (people > OCUPATION_CAP[ocupation]) {
        problems.push(`Caben ${OCUPATION_CAP[ocupation]} en ${OCUPATION_NAME[ocupation]} y hay ${people} (los infantes no cuentan)`);
      }
    } else {
      ocupation = '';
    }

    if (idHotel === null) problems.push('Falta elegir el hotel');

    if (!fSalida && !dateBad) {
      if (ctx.defaultDate) {
        fSalida = ctx.defaultDate;
        notes.push('Fecha de salida: la de la O.S.');
      } else problems.push('Falta la fecha de salida (ej. "salida 28 nov")');
    }
    if (!hora) {
      if (ctx.defaultHora) {
        hora = ctx.defaultHora;
        notes.push('Hora de salida: la de la O.S.');
      } else problems.push('Falta la hora de salida (ej. "6am")');
    }

    rooms.push({ id: idx + 1, raw: seg, pax, ocupation, idHotel, hotelName, fSalida, hora, voucher, problems, notes });
  });
  return rooms;
}
