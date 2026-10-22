/**
 * patterns.js — Patrones de las reseñas (EDA): a qué hora llegan las quejas y el titular que lo cuenta.
 * Todo por reglas, sin LLM. Respeta la regla LCP #11: solo cuentan las reseñas con texto.
 * Las horas son siempre la hora local de la sucursal (js/time.js), nunca UTC ni la del navegador.
 */
const Patterns = {
  MIN_COMPLAINTS: 5,     // por debajo de esto no se afirma ningún patrón
  WINDOW: 3,             // ancho (en horas) de la ventana pico
  CONCENTRATION_GAP: 10, // puntos porcentuales sobre el volumen para decir que "se concentra"
  pad(h) { return String(h).padStart(2, '0'); },

  /** Reseñas de los últimos `months` meses (hasta el mes dado), opcionalmente filtradas, desde la caché del DataLoader */
  collect(endYear, endMonth, months = 12, filter = null) {
    const out = [];
    let y = endYear, m = endMonth;
    for (let i = 0; i < months; i++) {
      const d = (typeof DataLoader !== 'undefined') ? DataLoader.getMonth(y, m) : null;
      if (d && d.reviews) for (const r of d.reviews) if (!filter || filter(r)) out.push(r);
      m--; if (m === 0) { m = 12; y--; }
    }
    return out;
  },

  /** Los últimos `months` meses terminando en (endYear, endMonth), del más antiguo al más reciente: [{ y, m, label, full }] */
  monthSpan(endYear, endMonth, months = 12) {
    const out = [];
    let y = endYear, m = endMonth;
    for (let i = 0; i < months; i++) {
      out.unshift({ y, m, label: `${BranchTime.MESES_CAP[m - 1]} ${String(y).slice(2)}`, full: `${BranchTime.MESES_CAP[m - 1]} ${y}` });
      m--; if (m === 0) { m = 12; y--; }
    }
    return out;
  },

  /**
   * Matriz sucursal × mes de calificación y volumen (EDA: ¿quién cae, quién mejora, es una tienda o toda la región?).
   * branches: [{ id, abr, nombre }]. Devuelve { months, rows: [{ id, abr, nombre, values, counts, total, mean }] }
   * con las filas ordenadas de mejor a peor calificación media ponderada; las sucursales sin reseñas en la ventana se omiten.
   */
  branchMonthMatrix(branches, endYear, endMonth, months = 12) {
    const span = this.monthSpan(endYear, endMonth, months);
    const rows = [];
    for (const b of branches) {
      const values = [], counts = [];
      let total = 0, sum = 0;
      for (const { y, m } of span) {
        const st = DataLoader.computeBranchStats(y, m, b.id);
        counts.push(st.count);
        values.push(st.count > 0 ? st.avg : null);
        total += st.count; sum += st.avg * st.count;
      }
      if (total > 0) rows.push({ id: b.id, abr: b.abr, nombre: b.nombre || b.abr, values, counts, total, mean: sum / total });
    }
    rows.sort((a, b) => b.mean - a.mean);
    return { months: span, rows };
  },

  /** Quejas (≤ 2★) y reseñas con texto por hora local (0-23) */
  hourly(reviews) {
    const neg = Array(24).fill(0), tot = Array(24).fill(0);
    const negReviews = Array.from({ length: 24 }, () => []);   // las quejas de cada hora (para abrirlas desde la gráfica)
    let n = 0, nNeg = 0;
    for (const r of reviews) {
      if (!r || !r.text || r.text.trim().length === 0) continue;   // Regla LCP #11
      const p = BranchTime.partsFor(r.publishedAtDate, r);
      if (!p) continue;
      tot[p.hour]++; n++;
      if (r.stars <= 2) { neg[p.hour]++; nNeg++; negReviews[p.hour].push(r); }
    }
    return { neg, tot, n, nNeg, negReviews };
  },

  /** Ventana de `width` horas consecutivas con más quejas: { start, end, count } o null si no hay quejas */
  peakWindow(neg, width = this.WINDOW) {
    let best = null;
    for (let s = 0; s + width <= 24; s++) {
      let c = 0;
      for (let k = 0; k < width; k++) c += neg[s + k];
      if (c > 0 && (!best || c > best.count)) best = { start: s, end: s + width - 1, count: c };
    }
    return best;
  },

  /** { text, window, share, expected, concentrated, enough } — el titular y los datos que lo respaldan */
  headline(h) {
    if (h.nNeg < this.MIN_COMPLAINTS) {
      return { enough: false, concentrated: false, window: null, text: `Aún hay pocas quejas (${h.nNeg}) para ver un patrón por hora.` };
    }
    const w = this.peakWindow(h.neg);
    const share = Math.round((100 * w.count) / h.nNeg);
    let totInWindow = 0;
    for (let k = w.start; k <= w.end; k++) totInWindow += h.tot[k];
    const expected = h.n > 0 ? Math.round((100 * totInWindow) / h.n) : 0;
    const span = `${this.pad(w.start)}:00 y ${this.pad(w.end)}:59`;
    const concentrated = share >= expected + this.CONCENTRATION_GAP;
    const text = concentrated
      ? `El ${share}% de las quejas llega entre las ${span}, aunque esa franja solo trae el ${expected}% de las reseñas: ahí se concentra el problema.`
      : `Las quejas siguen el ritmo del volumen: el ${share}% llega entre las ${span}, y esa franja trae el ${expected}% de las reseñas.`;
    return { enough: true, concentrated, window: w, share, expected, text };
  }
};
