/**
 * time.js — Fecha y hora de las reseñas en la zona horaria de cada sucursal (formato de 24 h).
 *
 * Por qué existe: `published_at_date` llega en UTC. Mostrarlo en UTC (como hacía formatDate/formatDateTime) adelanta
 * la hora 6 h y manda al día siguiente toda reseña posterior a las 18:00; usar getHours() del navegador depende de
 * dónde esté quien mira. Aquí todo se calcula en la hora local de la tienda, sin importar desde dónde se consulte.
 *
 * Husos (México no tiene horario de verano salvo la frontera): todas America/Mexico_City, excepto
 * Cancún (America/Cancun, UTC-5) y Tijuana (America/Tijuana, sigue el horario de verano de EE. UU.).
 */
const BranchTime = {
  DEFAULT_TZ: 'America/Mexico_City',
  TZ_BY_REGION: { CUN: 'America/Cancun', TJ: 'America/Tijuana' },
  MESES: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  MESES_CAP: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  _fmt: {},
  _memo: new Map(),
  _off: new Map(),
  _dow: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 },

  /** Zona horaria de una reseña, sucursal (id) o región (id de región) */
  tzFor(x) {
    if (!x) return this.DEFAULT_TZ;
    let region = null;
    if (typeof x === 'object') {
      region = x.region || null;
      if (!region && x.sucursal && typeof resolveBranchMeta === 'function') {
        const m = resolveBranchMeta(x.sucursal); region = m ? m.region : null;
      }
    } else {
      region = this.TZ_BY_REGION[x] ? x : null;
      if (!region && typeof resolveBranchMeta === 'function') { const m = resolveBranchMeta(x); region = m ? m.region : null; }
    }
    return this.TZ_BY_REGION[region] || this.DEFAULT_TZ;
  },

  _formatter(tz) {
    if (!this._fmt[tz]) {
      this._fmt[tz] = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'short'
      });
    }
    return this._fmt[tz];
  },

  /** { year, month (1-12), day, hour (0-23), minute, dow (0 = domingo) } en la zona dada; null si la fecha no es válida */
  parts(iso, tz) {
    tz = tz || this.DEFAULT_TZ;
    // Memoizado por (zona, instante): una vista recorre las mismas reseñas varias veces
    const key = tz + '|' + iso;
    const hit = this._memo.get(key);
    if (hit !== undefined) return hit;
    const t = Date.parse(iso);
    let res = null;
    if (iso && !isNaN(t)) {
      const off = this._offsetMin(tz, t);
      if (off !== null) {
        // Camino rápido: con el desfase del día conocido, las partes salen por aritmética (sin Intl por cada fecha)
        const d = new Date(t + off * 60000);
        res = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), dow: d.getUTCDay() };
      } else {
        res = this._partsExact(tz, t);   // día con cambio de horario: formato exacto
      }
    }
    if (this._memo.size > 60000) this._memo.clear();
    this._memo.set(key, res);
    return res;
  },

  /** Partes exactas con Intl (lento: solo para calcular desfases y para los días con cambio de horario) */
  _partsExact(tz, t) {
    const o = {};
    for (const p of this._formatter(tz).formatToParts(new Date(t))) o[p.type] = p.value;
    return { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour % 24, minute: +o.minute, dow: this._dow[o.weekday] ?? 0 };
  },

  /** Desfase (minutos) de la zona en el instante t, o null si ese día UTC tiene un cambio de horario (no se puede asumir uno solo) */
  _offsetMin(tz, t) {
    const day = Math.floor(t / 86400000), key = tz + '|' + day;
    let v = this._off.get(key);
    if (v !== undefined) return v;
    const at = ms => { const p = this._partsExact(tz, ms); return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000) / 60000; };
    const o0 = at(day * 86400000), o1 = at((day + 1) * 86400000 - 1);
    v = o0 === o1 ? o0 : null;
    this._off.set(key, v);
    return v;
  },

  /**
   * Corte de mes: SIEMPRE en hora de CDMX (decisión de Ibrahim, 2026-10-12), para todas las regiones. Así una reseña de
   * la cena del último día no salta al mes siguiente y todas las vistas cortan igual. Zona IANA (no un -06:00 fijo)
   * para que el historial anterior a 2022 (con horario de verano) también cuadre.
   */
  MONTH_TZ: 'America/Mexico_City',
  /** Instante UTC (ISO) en que empieza el mes `month` (1-12) de `year` a medianoche de CDMX */
  monthStartIso(year, month) {
    const guess = Date.UTC(year, month - 1, 1);
    const p = this.parts(new Date(guess).toISOString(), this.MONTH_TZ);
    const asLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    let start = guess - (asLocal - guess);
    const q = this.parts(new Date(start).toISOString(), this.MONTH_TZ);   // por si el desfase cambió entre el cálculo y el instante real
    start -= Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute) - Date.UTC(year, month - 1, 1);
    return new Date(start).toISOString();
  },
  /** { y, m } del mes (hora de CDMX) al que pertenece un instante */
  monthOf(iso) { const p = this.parts(iso, this.MONTH_TZ); return p ? { y: p.year, m: p.month } : null; },
  /** { y, m } del mes en curso (hora de CDMX) */
  nowMonth() { return this.monthOf(new Date().toISOString()); },

  /** Partes en la zona horaria de la reseña (o del id de sucursal/región que se pase) */
  partsFor(iso, x) { return this.parts(iso, this.tzFor(x)); },

  hhmm(p) { return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`; },

  /**
   * Etiqueta de fecha y hora (24 h).
   *  'short' → "9 oct · 21:47"   'long' → "09 Oct 2026 · 21:47"   'date' → "09 Oct 2026"   'time' → "21:47"
   */
  label(iso, x, mode = 'short') {
    const p = this.partsFor(iso, x);
    if (!p) return '';
    const dd = String(p.day).padStart(2, '0');
    if (mode === 'time') return this.hhmm(p);
    if (mode === 'date') return `${dd} ${this.MESES_CAP[p.month - 1]} ${p.year}`;
    if (mode === 'long') return `${dd} ${this.MESES_CAP[p.month - 1]} ${p.year} · ${this.hhmm(p)}`;
    return `${p.day} ${this.MESES[p.month - 1]} · ${this.hhmm(p)}`;
  }
};

/** Atajo para las vistas: fecha/hora de una reseña en la hora local de su sucursal */
function reviewWhen(r, mode = 'short') {
  if (!r || !r.publishedAtDate) return mode === 'short' ? 'Reciente' : 'Sin fecha';
  return BranchTime.label(r.publishedAtDate, r, mode);
}
