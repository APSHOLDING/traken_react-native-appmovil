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

/** Distancia de edicion (con letras cambiadas de lugar contando como 1). */
function dist(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Palabras clave que se entienden aunque vengan mal escritas ("dobel", "sensilla", "hotle", "noviembe"...). */
const KEYWORDS = [
  'sencilla', 'sencillo', 'doble', 'triple', 'cuadruple', 'cuadruplo', 'habitacion', 'hotel', 'salida', 'voucher',
  'manana', 'infante', 'bebe', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre',
];

function fixTypos(seg: string): string {
  return seg.replace(/[A-Za-zÁÉÍÓÚÑáéíóúñÜü]{4,}/g, (w) => {
    const pw = plain(w);
    if (KEYWORDS.indexOf(pw) >= 0) return w;
    const thr = pw.length >= 8 ? 2 : 1; // palabras cortas: 1 error; largas: hasta 2 (cuida que un apellido no se confunda)
    let best = '';
    let bestD = 99;
    for (const k of KEYWORDS) {
      if (k[0] !== pw[0] || Math.abs(k.length - pw.length) > 2) continue;
      const dd = dist(pw, k);
      if (dd <= thr && dd < bestD) {
        best = k;
        bestD = dd;
      }
    }
    return best || w;
  });
}

/** Hotel mencionado sin la palabra "hotel": una palabra (o dos) del nombre del hotel, aunque tenga un error de letra. */
function looseHotel(text: string, hotels: { id: number; name: string }[]): { hotel: { id: number; name: string }; word: string } | null {
  const words = plain(text).match(/[a-z0-9]{5,}/g) || [];
  const found: { hotel: { id: number; name: string }; word: string }[] = [];
  for (const h of hotels) {
    const toks = plain(h.name).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((t) => t.length >= 5 && ['hotel', 'resort', 'suites'].indexOf(t) < 0);
    for (const t of toks) {
      for (const w of words) {
        if (w === t || (w[0] === t[0] && dist(w, t) <= 1)) found.push({ hotel: h, word: w });
      }
    }
  }
  const ids = Array.from(new Set(found.map((x) => x.hotel.id)));
  return ids.length === 1 ? found[0] : null;
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
      const phWords = ph.split(' ');
      const hits = toks.filter((t) => ph.includes(t) || phWords.some((w) => w.length >= 5 && w[0] === t[0] && dist(w, t) <= 1)).length;
      const full = hn.includes(ph) || ph.includes(hn);
      return { h, score: (full ? 100 : 0) + hits };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null; // ambiguo: que lo elija la persona
  return scored[0].h;
}

/**
 * Separa las habitaciones: un renglon (o ;) por habitacion y, para cuando se DICTA
 * (el dictado no trae saltos de renglon), tambien con "otra habitacion", "siguiente", "luego"...
 */
function splitRooms(text: string): string[] {
  const out: string[] = [];
  text.split(/\n|;/).forEach((line) => {
    const pl = plain(line);
    const re = /\b(?:otra habitacion|otro cuarto|otra hab|siguiente habitacion|siguiente cuarto|siguiente|nueva habitacion|despues|luego)\b/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pl))) {
      out.push(line.slice(last, m.index));
      last = m.index + m[0].length;
    }
    out.push(line.slice(last));
  });
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

export function parseCapture(text: string, ctx: CaptureContext, now: Date = new Date()): CaptureRoom[] {
  const segments = splitRooms(text);

  const rooms: CaptureRoom[] = [];
  segments.forEach((seg, idx) => {
    const work = { s: fixTypos(seg) };
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
    if (idHotel === null && ctx.hotels.length > 1) {
      const lh = looseHotel(work.s, ctx.hotels);
      if (lh) {
        idHotel = lh.hotel.id;
        hotelName = lh.hotel.name.trim();
        take(work, new RegExp('\\b' + lh.word + '\\b'));
        // Otras palabras del mismo hotel (ej. "city" de "City Express") tampoco son nombres de pasajero.
        plain(lh.hotel.name)
          .replace(/[^a-z0-9 ]/g, ' ')
          .split(' ')
          .filter((t) => t.length >= 3 && ['hotel', 'resort', 'suites', 'inn'].indexOf(t) < 0)
          .forEach((t) => take(work, new RegExp('\\b' + t + '\\b')));
        notes.push('Hotel entendido por su nombre');
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
    } else if ((mt = take(work, /\b(\d{1,2})(?::(\d{2}))?\s*(?:de la|en la|por la)\s*(manana|tarde|noche|madrugada)\b/))) {
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
      .replace(/\(([^)]*)\)/g, (_m, inner: string) => {
        const pi = plain(inner);
        if (/infante|bebe/.test(pi)) return ' @INF ';
        if (/nin[oa]|menor|hij[oa]/.test(pi)) return ' @NIN ';
        return ' ' + inner + ' ';
      })
      .replace(/\b(habitacion(?:es)?|hab|cuarto|pasajeros?|pax|hotel|salida|sale|salen|fecha|el dia|dia)\b/gi, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const chunks = rest
      .split(/\s+y\s+|\s+con\s+|,|\+|&|\//i)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const pax: CapturePax[] = [];
    chunks.forEach((c) => {
      let type: PaxType = 'adulto';
      const pc = plain(c);
      // "Nina" tambien es un nombre: solo cuenta como niña si va entre parentesis o al final del nombre.
      if (/@inf/.test(pc) || /^(infante|bebe)\s+\S/.test(pc) || /\S\s+(infante|bebe)$/.test(pc)) type = 'infante';
      else if (/@nin/.test(pc) || /^(nino|menor)\s+\S/.test(pc) || /\S\s+(nino|nina|menor|hijo|hija)$/.test(pc)) type = 'nino';
      const clean = c
        .replace(/@(inf|nin)/gi, ' ')
        .replace(/^(infante|bebé|bebe|niño|nino|menor)\s+(?=\S)/i, ' ')
        .replace(/\s+(infante|bebé|bebe|niño|niña|nino|nina|menor|hijo|hija)$/i, ' ')
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
