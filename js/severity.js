/**
 * severity.js — Qué reseñas son "muy muy negativas" y por qué.
 *
 * Nombre en la interfaz: "Grave" (el código conserva `critical`). Se llama así para no confundirla con las "quejas críticas"
 * (todas las de ≤ 2★) que ya existen en el hero y en las alertas; una reseña grave es la excepción.
 *
 * Reglas explícitas y explicables (sin LLM): cada reseña crítica muestra sus razones para que nadie dude de la marca.
 * Solo se evalúan reseñas CON texto (Regla LCP #11) y de 1-2★. Los umbrales están arriba para ajustarlos sin tocar la lógica.
 *
 * Puntos: 1★ = +2 · 2★ = +1 · texto muy extenso (≥ 500 caracteres) +1 · categorías (una vez cada una):
 *   GRAVES (+5, bastan por sí solas): salud, plagas, objeto extraño, legal, acoso/discriminación, cobro indebido;
 *   SERIAS (+2, solo cuentan si se acumulan): higiene, trato; matiz (+1): tono muy negativo.
 * Es crítica si suma ≥ CRITICAL_SCORE (6). Calibrada con las quejas reales para que sea la excepción, no la regla.
 */
const Severity = {
  CRITICAL_SCORE: 6,
  VERY_LONG_TEXT: 500,   // solo un texto muy extenso suma
  RECENT_DAYS: 14,
  STAR_POINTS: { 1: 2, 2: 1 },
  LONG_POINTS: 1,

  // Tres niveles: GRAVE (basta por sí solo con 1-2★), SERIO (solo cuenta si se acumula) y TONO (matiz).
  GRAVE: 5, SERIO: 2, TONO: 1,
  CATEGORIES: [
    { id: 'salud',    label: 'Salud',           pts: 5, re: /intoxic|intoxiq|envenen|vomit|diarrea|enfermo de|me enferm|enfermaron|alergi|me cayo mal|mal del estomago/ },
    { id: 'plagas',   label: 'Plagas',          pts: 5, re: /cucaracha|\brata\b|\bratas\b|\braton(es)?\b|plaga|gusano|insecto|\bmoscas?\b en|hormigas? en/ },
    { id: 'objeto',   label: 'Objeto extraño',  pts: 5, re: /pelo en|pelos en|cabello en|un pelo|vidrio|plastico en|pedazo de plastico|metal en|grapa|piedra en/ },
    { id: 'legal',    label: 'Legal',           pts: 5, re: /profeco|denunci|abogad|demandar|voy a demandar|los voy a demandar|acta ministerial/ },
    { id: 'acoso',    label: 'Acoso o discriminación', pts: 5, re: /racis|discrimin|acoso|acosa|manose|tocamiento|insinuac|amenaz/ },
    { id: 'cobro',    label: 'Cobro o estafa',  pts: 5, re: /estafa|fraude|me robaron|cobro indebido|cobraron de mas|cobro de mas|cargo no reconocido|me cobraron dos veces/ },
    { id: 'higiene',  label: 'Higiene',         pts: 2, re: /asco|asquer|sucio|sucia|mugre|inmund|podrid|descompuest|caduc|rancio|mal olor|apesta/ },
    { id: 'trato',    label: 'Trato',           pts: 2, re: /grosero|grosera|maltrat|prepotente|insult|ignoraron|mal trato|nos corrieron|me gritaron|nos gritaron/ },
    { id: 'enfatico', label: 'Tono muy negativo', pts: 1, re: /nunca mas|jamas (vuelvo|regreso|volvere)|asquerosa? experiencia|verguenza|lamentable|inaceptable|la peor/ }
  ],

  /** Minúsculas y sin acentos, para que "pésimo" y "pesimo" cuenten igual */
  _norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); },

  /** { score, critical, reasons: [{ id, label, match? }] } — razones listas para mostrar; `match` es la palabra que la disparó */
  analyze(r) {
    const out = { score: 0, critical: false, reasons: [] };
    if (!r || !r.text || r.text.trim().length === 0) return out;   // Regla LCP #11
    if (r.stars > 2) return out;

    out.score += this.STAR_POINTS[r.stars] || 0;
    out.reasons.push({ id: 'estrellas', label: r.stars === 1 ? '1★' : '2★' });

    if (r.text.trim().length >= this.VERY_LONG_TEXT) { out.score += this.LONG_POINTS; out.reasons.push({ id: 'largo', label: 'Texto extenso' }); }

    const n = this._norm(r.text);
    for (const c of this.CATEGORIES) {
      const m = c.re.exec(n);
      if (m) { out.score += c.pts; out.reasons.push({ id: c.id, label: c.label, match: m[0].trim() }); }
    }
    out.critical = out.score >= this.CRITICAL_SCORE;
    return out;
  },

  isCritical(r) { return this.analyze(r).critical; },

  /** Reseñas críticas de una lista, de la más reciente a la más antigua; `sinceDays` limita a los últimos N días */
  criticalIn(reviews, sinceDays = null, now = Date.now()) {
    const limit = sinceDays ? now - sinceDays * 86400000 : -Infinity;
    return reviews
      .filter(r => r && r.publishedAtDate && Date.parse(r.publishedAtDate) >= limit && this.isCritical(r))
      .sort((a, b) => Date.parse(b.publishedAtDate) - Date.parse(a.publishedAtDate));
  }
};
