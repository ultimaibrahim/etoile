/**
 * narrative.js — El hallazgo de cada gráfica, escrito por reglas (sin LLM).
 * Principio de Étoile: ninguna gráfica va sola; cada una lleva una frase que dice qué se ve y por qué importa.
 * Honestidad primero: con muestras pequeñas la frase lo avisa en lugar de afirmar.
 * Funciones puras (reciben datos, devuelven texto): fáciles de probar y de ajustar.
 */
const Narrative = {
  MIN_SAMPLE: 5,   // reseñas mínimas para afirmar algo de una sucursal
  fmt(n, d = 2) { return Number(n).toFixed(d); },
  pct(a, b) { return b > 0 ? Math.round((100 * a) / b) : 0; },
  plural(n, uno, varios) { return n === 1 ? uno : varios; },

  /** Ranking de calificación. rows: [{ nombre, score, count }] (solo sucursales con reseñas) */
  ranking(rows, meta) {
    const r = rows.filter(x => x.count > 0).sort((a, b) => b.score - a.score);
    if (r.length === 0) return 'Aún no hay reseñas este mes.';
    const top = r[0];
    const below = r.filter(x => x.score < meta);
    if (below.length === 0) {
      return `Las ${r.length} sucursales con reseñas cumplen la meta de ${this.fmt(meta)}★; lidera ${top.nombre} con ${this.fmt(top.score)}★.`;
    }
    const worst = below[below.length - 1];
    const gap = this.fmt(meta - worst.score);
    const caution = worst.count < this.MIN_SAMPLE ? ` (son solo ${worst.count} ${this.plural(worst.count, 'reseña', 'reseñas')}: poca muestra)` : ` (${worst.count} reseñas)`;
    return `${below.length} de ${r.length} sucursales están bajo la meta de ${this.fmt(meta)}★; la más rezagada es ${worst.nombre} con ${this.fmt(worst.score)}★, a ${gap} de la meta${caution}.`;
  },

  /** Volumen y quejas. rows: [{ nombre, count, neg }] */
  volume(rows) {
    const r = rows.filter(x => x.count > 0);
    const total = r.reduce((s, x) => s + x.count, 0);
    if (total === 0) return 'Aún no hay reseñas este mes.';
    const top = [...r].sort((a, b) => b.count - a.count)[0];
    const totalNeg = r.reduce((s, x) => s + x.neg, 0);
    let s = `${top.nombre} concentra el ${this.pct(top.count, total)}% de las ${total} reseñas del mes`;
    if (totalNeg === 0) return s + '; no hay quejas (1-2★) en ninguna sucursal.';
    const worst = r.filter(x => x.count >= this.MIN_SAMPLE && x.neg > 0).sort((a, b) => (b.neg / b.count) - (a.neg / a.count))[0];
    if (!worst) return s + `; hay ${totalNeg} ${this.plural(totalNeg, 'queja', 'quejas')} repartidas en sucursales con pocas reseñas.`;
    return s + `; ${worst.nombre} tiene la mayor proporción de quejas: ${worst.neg} de ${worst.count} (${this.pct(worst.neg, worst.count)}%).`;
  },

  /** Distribución de estrellas. counts: [n5, n4, n3, n2, n1] */
  distribution(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return 'Aún no hay reseñas este mes.';
    const [n5, , , , n1] = counts;
    const base = `El ${this.pct(n5, total)}% de las ${total} opiniones son de 5★`;
    return n1 === 0 ? `${base}; no hay reseñas de 1★ este mes.` : `${base}; las de 1★ son ${n1} (${this.pct(n1, total)}%).`;
  },

  /**
   * Tendencia de calificación. labels/values paralelos (values puede tener null); meta = calificación mínima.
   * partialLast: el último punto es el mes en curso (incompleto).
   */
  ratingTrend(labels, values, meta, partialLast = false) {
    const pts = values.map((v, i) => ({ v, label: labels[i] })).filter(p => typeof p.v === 'number' && p.v > 0);
    if (pts.length === 0) return 'Aún no hay calificaciones para ver una tendencia.';
    if (pts.length === 1) return `Solo hay un mes con datos: ${pts[0].label} con ${this.fmt(pts[0].v)}★.`;
    const best = pts.reduce((a, b) => (b.v > a.v ? b : a));
    const low = pts.reduce((a, b) => (b.v < a.v ? b : a));
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const d = last.v - prev.v;
    const dir = Math.abs(d) < 0.02 ? 'se mantiene' : d > 0 ? `sube ${this.fmt(d)}` : `baja ${this.fmt(-d)}`;
    const tail = partialLast ? ` (${last.label} aún está en curso)` : '';
    const range = best.v === low.v ? `Calificación estable en ${this.fmt(best.v)}★.` : `Mejor mes: ${best.label} (${this.fmt(best.v)}★); más bajo: ${low.label} (${this.fmt(low.v)}★).`;
    const under = pts.filter(p => p.v < meta).length;
    const metaTxt = under === 0 ? ` Todos los meses cumplen la meta de ${this.fmt(meta)}★.` : ` ${under} de ${pts.length} meses quedaron bajo la meta de ${this.fmt(meta)}★.`;
    return `${range} ${last.label} ${dir} frente a ${prev.label}${tail}.${metaTxt}`;
  },

  /**
   * Matriz sucursal × mes (calificación). mx = Patterns.branchMonthMatrix(...); meta = calificación mínima;
   * partialLast: el último mes es el mes en curso. Solo compara sucursales con muestra suficiente en ambos meses.
   */
  matrix(mx, meta, partialLast = false) {
    const n = mx.months.length;
    if (!n || !mx.rows.length) return 'Aún no hay reseñas para comparar sucursales.';
    const last = n - 1, prev = n - 2;
    const lastLabel = mx.months[last].full + (partialLast ? ' (en curso)' : '');
    const ok = mx.rows.filter(r => r.counts[last] >= this.MIN_SAMPLE);
    if (ok.length === 0) return `Aún hay pocas reseñas en ${lastLabel} para comparar sucursales.`;
    const below = ok.filter(r => r.values[last] < meta);
    let s = `${below.length} de ${ok.length} sucursales con reseñas suficientes están bajo la meta de ${this.fmt(meta)}★ en ${lastLabel}.`;
    // Calificaciones muy bajas pero con pocas reseñas: no se afirma nada de ellas, pero tampoco se callan
    const watch = mx.rows.filter(r => r.counts[last] > 0 && r.counts[last] < this.MIN_SAMPLE && r.values[last] < 4.0)
      .sort((a, b) => a.values[last] - b.values[last]).slice(0, 3);
    const watchTxt = watch.length ? ` A vigilar (pocas reseñas): ${watch.map(r => `${r.nombre} (${this.fmt(r.values[last])}★, ${r.counts[last]} ${this.plural(r.counts[last], 'reseña', 'reseñas')})`).join(', ')}.` : '';
    if (prev < 0) return s + watchTxt;
    const ch = ok.filter(r => r.counts[prev] >= this.MIN_SAMPLE).map(r => ({ r, d: r.values[last] - r.values[prev] }));
    const worst = ch.reduce((a, b) => (!a || b.d < a.d ? b : a), null);
    const best = ch.reduce((a, b) => (!a || b.d > a.d ? b : a), null);
    const prevLabel = mx.months[prev].label;
    if (worst && worst.d <= -0.1) s += ` Mayor caída: ${worst.r.nombre} (${this.fmt(worst.d)}★ frente a ${prevLabel}: ${this.fmt(worst.r.values[prev])} → ${this.fmt(worst.r.values[last])}).`;
    if (best && best.d >= 0.1) s += ` Mayor mejora: ${best.r.nombre} (+${this.fmt(best.d)}★).`;
    if (!(worst && worst.d <= -0.1) && !(best && best.d >= 0.1)) s += ` Ninguna sucursal se movió más de 0.10★ frente a ${prevLabel}.`;
    return s + watchTxt;
  },

  /**
   * Duelo entre dos sucursales. a/b: { nombre, avg, count, negPct, resp, above, withData }
   * (above = meses de la ventana sobre la meta, withData = meses con reseñas).
   * Solo afirma lo que la muestra sostiene (MIN_SAMPLE reseñas en el mes).
   */
  compare(a, b, meta) {
    if (!a.count || !b.count) return `${!a.count ? a.nombre : b.nombre} no tiene reseñas en este periodo: no hay con qué comparar.`;
    const small = [a, b].filter(x => x.count < this.MIN_SAMPLE);
    const d = a.avg - b.avg, ad = Math.abs(d);
    const [hi, lo] = d >= 0 ? [a, b] : [b, a];
    let s = ad < 0.05
      ? `${a.nombre} y ${b.nombre} están empatadas (${this.fmt(a.avg)}★ y ${this.fmt(b.avg)}★).`
      : `${hi.nombre} supera a ${lo.nombre} por ${this.fmt(ad)}★ (${this.fmt(hi.avg)}★ frente a ${this.fmt(lo.avg)}★).`;
    if (small.length) {
      s += ` Cuidado: ${small.map(x => `${x.nombre} tiene solo ${x.count} ${this.plural(x.count, 'reseña', 'reseñas')}`).join(' y ')} en el mes, la diferencia puede ser ruido.`;
      return s;
    }
    // Qué más las separa: quejas (puntos porcentuales) y respuesta al cliente
    const gaps = [
      { k: 'neg', g: Math.abs(a.negPct - b.negPct), txt: () => { const [w, l] = a.negPct <= b.negPct ? [a, b] : [b, a]; return `${w.nombre} tiene menos quejas (${this.fmt(w.negPct, 1)} % de sus reseñas con texto frente a ${this.fmt(l.negPct, 1)} %)`; } },
      { k: 'resp', g: Math.abs(a.resp - b.resp), txt: () => { const [w, l] = a.resp >= b.resp ? [a, b] : [b, a]; return `${w.nombre} responde más (${Math.round(w.resp)} % frente a ${Math.round(l.resp)} %)`; } }
    ].filter(x => x.g >= 5).sort((x, y) => y.g - x.g);
    if (gaps.length) s += ` Lo que más las separa: ${gaps[0].txt()}.`;
    if (a.withData >= 4 && b.withData >= 4 && a.above !== b.above) {
      const [w, l] = a.above > b.above ? [a, b] : [b, a];
      s += ` En el año, ${w.nombre} estuvo sobre la meta ${w.above} de ${w.withData} meses; ${l.nombre}, ${l.above} de ${l.withData}.`;
    }
    return s;
  },

  /**
   * Titular del briefing de una región (o de la marca). Devuelve segmentos para que la vista les dé forma y enlace:
   * { k: 't' texto | 'n' cifra | 'ev' sucursal (clicable) | 'good' todo bien, v, id? }.
   * attention: [{ id, nombre, avg, count, unreplied }] ya ordenadas por urgencia.
   */
  briefingRegion({ name, avg, goal, count, attention }) {
    if (!count) return [{ k: 't', v: `${name} aún no tiene reseñas este mes.` }];
    const seg = [], T = v => seg.push({ k: 't', v });
    const d = avg - goal;
    // La calificación ya está en grande junto al titular; aquí solo su relación con la meta
    T(`${name} está `); seg.push({ k: 'n', v: `${this.fmt(Math.abs(d))}★` });
    T(` ${d >= 0 ? 'sobre' : 'bajo'} la meta. `);
    if (!attention.length) { seg.push({ k: 'good', v: 'Sin quejas abiertas ni sucursales bajo la meta.' }); return seg; }
    const top = attention.slice(0, 2);
    T(top.length === 1 ? 'Necesita atención: ' : 'Necesitan atención: ');
    top.forEach((a, i) => {
      if (i) T(i === top.length - 1 ? ' y ' : ', ');
      seg.push({ k: 'ev', v: a.nombre, id: a.id });
      const bits = [];
      if (a.count > 0) bits.push(`${this.fmt(a.avg)}★${a.count < this.MIN_SAMPLE ? ', pocas reseñas' : ''}`);
      if (a.unreplied) bits.push(`${a.unreplied} ${this.plural(a.unreplied, 'queja', 'quejas')} sin respuesta`);
      if (bits.length) T(` (${bits.join(', ')})`);
    });
    if (attention.length > 2) T(`, y ${attention.length - 2} más`);
    T('.');
    return seg;
  },

  /** Titular del briefing de una sucursal (la primera pantalla del gerente de tienda) */
  briefingBranch({ nombre, avg, count, rank, of, regionName, unreplied, oldestDays }) {
    if (!count && !unreplied) return [{ k: 't', v: `${nombre} aún no tiene reseñas este mes.` }];
    const seg = [], T = v => seg.push({ k: 't', v });
    T(`${nombre} va en `); seg.push({ k: 'n', v: `${this.fmt(avg)}★` });
    T(` este mes (${count} ${this.plural(count, 'reseña', 'reseñas')}). `);
    if (count >= this.MIN_SAMPLE && rank && of > 1) T(`Es la ${rank}.ª de ${of} en ${regionName}. `);
    if (count < this.MIN_SAMPLE) T(`Con tan pocas reseñas, una sola calificación mueve el promedio. `);
    if (unreplied) {
      T('Tienes '); seg.push({ k: 'ev', v: `${unreplied} ${this.plural(unreplied, 'queja', 'quejas')} sin respuesta` });
      T(oldestDays > 0 ? `, la más antigua de hace ${oldestDays} ${this.plural(oldestDays, 'día', 'días')}.` : ', la más antigua de hoy.');
    } else seg.push({ k: 'good', v: 'No tienes quejas abiertas.' });
    return seg;
  },

  SYNC_STALE_MIN: 90,   // el cron revisa cada sucursal cada 30 min: tres vueltas perdidas ya es una falla

  /** Antigüedad legible en minutos/horas/días */
  ago(min) {
    if (min < 1) return 'hace menos de un minuto';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} días`;
  },

  /**
   * Nota de "última sincronización con Google" para un alcance (sucursal, región o marca).
   * rows: [{ nombre, at }] (at = ISO o null). Cuenta la más atrasada: es la que puede estar perdiendo reseñas.
   * Devuelve null si ninguna sucursal tiene marca (columna sin crear o sync aún sin correr).
   */
  syncNote(rows, nowMs) {
    const known = rows.map(r => ({ nombre: r.nombre, min: Math.max(0, Math.floor((nowMs - Date.parse(r.at)) / 60000)) }))
      .filter(r => !isNaN(r.min));
    if (!known.length) return null;
    const stale = known.filter(r => r.min > this.SYNC_STALE_MIN).sort((a, b) => b.min - a.min);
    if (!stale.length) {
      const oldest = Math.max(...known.map(r => r.min));
      return { stale: false, text: `Reseñas de Google al día: última consulta ${this.ago(oldest)}.` };
    }
    const who = known.length === 1 ? '' : stale.length === known.length ? ' en ninguna sucursal'
      : ` en ${stale[0].nombre}${stale.length > 1 ? ` y ${stale.length - 1} más` : ''}`;
    return { stale: true, text: `Google no se consulta${who} desde ${this.ago(stale[0].min)}: pueden faltar reseñas recientes.` };
  },

  /** Matriz sucursal × mes (volumen) */
  matrixVolume(mx) {
    if (!mx.rows.length) return 'Aún no hay reseñas para comparar sucursales.';
    const months = mx.months.map((m, i) => ({ m, tot: mx.rows.reduce((s, r) => s + r.counts[i], 0) }));
    const topMonth = months.reduce((a, b) => (b.tot > a.tot ? b : a));
    const top = [...mx.rows].sort((a, b) => b.total - a.total)[0];
    return `El mes con más reseñas fue ${topMonth.m.full} (${topMonth.tot}). ${top.nombre} es la sucursal con más volumen: ${top.total} reseñas en ${mx.months.length} meses (${Math.round(top.total / mx.months.length)} al mes).`;
  },

  /** Tendencia de volumen. partialLast: el último punto es el mes en curso (no se compara contra un mes completo). */
  volumeTrend(labels, values, partialLast = false) {
    const pts = values.map((v, i) => ({ v, label: labels[i] })).filter(p => typeof p.v === 'number');
    if (pts.length === 0) return 'Aún no hay reseñas para ver una tendencia.';
    const max = pts.reduce((a, b) => (b.v > a.v ? b : a));
    const last = pts[pts.length - 1];
    if (partialLast) return `${last.label} va con ${last.v} ${this.plural(last.v, 'reseña', 'reseñas')} (mes en curso). El mes con más reseñas fue ${max.label}: ${max.v}.`;
    if (pts.length < 2) return `${last.label}: ${last.v} reseñas.`;
    const prev = pts[pts.length - 2];
    const ch = prev.v > 0 ? Math.round((100 * (last.v - prev.v)) / prev.v) : 0;
    const dir = ch === 0 ? 'se mantiene' : ch > 0 ? `sube ${ch}%` : `baja ${-ch}%`;
    return `El volumen ${dir} frente a ${prev.label} (${prev.v} → ${last.v}). El mes con más reseñas fue ${max.label}: ${max.v}.`;
  }
};
