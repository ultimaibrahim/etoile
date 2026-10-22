/**
 * rosa.js — La Rosa de la Étoile y el brillo de cada tienda (documentacion/marca.md, fuente de verdad).
 *
 * Brillo (puro, con pruebas en tests/rosa.test.js): estado de la tienda con brillo ajustado bayesiano, Polar con evidencia,
 * su fase en la escala de seis (2.1.1), la señal (cometa, fugaz o variable; nunca dos) y el nombre de la combinación.
 * Rosa (dibujo): una sola figura de 16 rayos; cada signo es la misma Rosa con otros valores, así que pasar de uno a otro es
 * continuo. Rosa.html() la dibuja quieta (ranking, listas); Rosa.Estrella() la anima con un resorte por valor.
 * Portado de la página de marca (rosaPts, rosaSVG, Estrella). Nada se repite solo y con reduced-motion salta al destino.
 */
const Brillo = {
  BRILLA: 4.60, TENUE: 4.30, POLAR: 4.90,
  TENUE_ALTA: 4.45, BRILLA_ALTA: 4.75,   // la mitad de tenue y de brilla (escala de seis fases)
  M_PESO: 10,          // m del ajuste bayesiano (al estilo IMDb)
  N_MIN: 15,           // reseñas con texto en el mes para Polar; también llenan la estrella (evidencia)
  SEMANAS: 3,          // subidas o bajadas seguidas para cometa o estrella fugaz

  /** (n·prom + m·C) / (n + m). C = promedio de la región; sin reseñas, el ajustado es C */
  ajustado(prom, n, C) { return n > 0 ? (n * prom + this.M_PESO * C) / (n + this.M_PESO) : C; },

  /** Estado por calificación sola (sin evidencia): se usa para el color de una Variable y en lecturas rápidas */
  fase(v) { return v >= this.BRILLA ? 'brilla' : v >= this.TENUE ? 'tenue' : 'apaga'; },

  /** Escala de seis fases por calificación (sin evidencia, así que nunca Polar): forma y color de la Rosa y de las gráficas */
  escala(v) {
    return v >= this.BRILLA_ALTA ? 'brilla_alta' : v >= this.BRILLA ? 'brilla' : v >= this.TENUE_ALTA ? 'tenue_alta' : v >= this.TENUE ? 'tenue' : 'apaga';
  },
  FASES: ['apaga', 'tenue', 'tenue_alta', 'brilla', 'brilla_alta', 'polar'],

  /**
   * Estado de una tienda en el mes. avg = promedio real (el que se muestra), nTexto = reseñas con texto, C = promedio de la región.
   * Lo ajustado decide la forma, el color y el orden; el número que se muestra sigue siendo avg.
   * id: los cuatro estados (conteos, señales y nombres de combinación). fase: la escala de seis (lo que se dibuja).
   * → { id: 'sin'|'apaga'|'tenue'|'brilla'|'polar', fase: 'sin'|'apaga'|'tenue'|'tenue_alta'|'brilla'|'brilla_alta'|'polar', aj, fill }
   */
  estado({ avg, nTexto, C }) {
    const n = Math.max(0, nTexto || 0);
    if (!n || !(avg > 0)) return { id: 'sin', fase: 'sin', aj: 0, fill: 0 };
    const aj = this.ajustado(avg, n, C > 0 ? C : avg);
    const fill = Math.min(1, n / this.N_MIN);
    if (aj >= this.POLAR && n >= this.N_MIN) return { id: 'polar', fase: 'polar', aj, fill };
    return { id: this.fase(aj), fase: this.escala(aj), aj, fill };
  },

  /** Orden del ranking: ajustado de mayor a menor; las tiendas sin señal al final */
  ordena(rows) {
    return [...rows].sort((a, b) => (b.estado.id !== 'sin') - (a.estado.id !== 'sin') || b.estado.aj - a.estado.aj);
  },

  /**
   * Promedio por semana (7 días hacia atrás desde `hasta`), de la más antigua a la más reciente; null si la semana no tuvo reseñas.
   * reviews: [{ stars, publishedAtDate }]
   */
  semanas(reviews, hasta = Date.now(), k = this.SEMANAS + 1) {
    const out = Array.from({ length: k }, () => ({ s: 0, n: 0 })), DIA = 864e5;
    for (const r of reviews || []) {
      const t = Date.parse(r && r.publishedAtDate);
      if (isNaN(t) || t > hasta) continue;
      const w = Math.floor((hasta - t) / (7 * DIA));
      if (w < k) { out[k - 1 - w].s += r.stars; out[k - 1 - w].n++; }
    }
    return out.map(x => x.n ? x.s / x.n : null);
  },

  /**
   * Una sola señal: hacia dónde va la tienda. Prioridad: fugaz (riesgo) > cometa > variable.
   * semanas: promedios semanales (Brillo.semanas). inicio/ahora: ids de estado al empezar el mes y hoy.
   * Polar no lleva variable (la forma ya lo dice) y sin señal no lleva ninguna.
   */
  senal({ semanas = [], inicio = null, ahora }) {
    if (!ahora || ahora === 'sin') return null;
    const w = semanas.slice(-(this.SEMANAS + 1));
    if (w.length === this.SEMANAS + 1 && w.every(v => v != null)) {
      const d = w.slice(1).map((v, i) => v - w[i]);
      if (d.every(x => x < 0)) return 'fugaz';
      if (d.every(x => x > 0)) return 'cometa';
    }
    if (inicio && inicio !== 'sin' && inicio !== ahora && ahora !== 'polar') return 'variable';
    return null;
  },

  NOMBRES: {
    apaga:  { _: 'Se apaga', cometa: 'Remonta', fugaz: 'Se hunde', variable: 'Se apagó este mes' },
    tenue:  { _: 'Tenue', cometa: 'Con potencial', fugaz: 'En riesgo', variable: 'Bajó de brilla' },
    brilla: { _: 'Brilla', cometa: 'Va por Polar', fugaz: 'Se le escapa', variable: 'Recién encendida' },
    polar:  { _: 'Polar', cometa: 'En su mejor racha', fugaz: 'Pierde Polar' },
    sin:    { _: 'Sin señal' }
  },
  NOMBRE_FASE: { apaga: 'Se apaga', tenue: 'Tenue', tenue_alta: 'Tenue alta', brilla: 'Brilla', brilla_alta: 'Brilla alta', polar: 'Polar', sin: 'Sin señal' },
  /** Nombre de la combinación estado + señal ("Con potencial", "En riesgo"…). La variable de tenue depende de dónde venía.
   *  estado: el objeto de Brillo.estado() (sin señal se nombra su fase: «Tenue alta») o solo el id de los cuatro estados */
  lectura(estado, senal, inicio) {
    const id = estado && typeof estado === 'object' ? estado.id : estado, fase = estado && typeof estado === 'object' ? estado.fase : null;
    const fila = this.NOMBRES[id] || this.NOMBRES.sin;
    if (senal === 'variable' && id === 'tenue' && inicio === 'apaga') return 'Se encendió a medias';
    if (senal && fila[senal]) return fila[senal];
    return (fase && this.NOMBRE_FASE[fase]) || fila._;
  },
  NOMBRE_SENAL: { cometa: 'Racha al alza', fugaz: 'Racha a la baja', variable: 'Cambió de estado en el mes' }
};

const Rosa = (() => {
  const RAD = Math.PI / 180;
  const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cl01 = v => Math.max(0, Math.min(1, v));

  /* ---------- Color: hex ↔ rgb, contraste y OKLCH (para la magnitud del dorado) ---------- */
  const hexRgb = h => { h = String(h).trim(); if (h.startsWith('rgb')) return h.match(/[\d.]+/g).slice(0, 3).map(Number); if (h.length === 4) h = '#' + [1, 2, 3].map(i => h[i] + h[i]).join(''); return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgbHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const lin = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  const lum = h => { const c = hexRgb(h).map(v => lin(v / 255)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => m - n); return (y + .05) / (x + .05); };
  function oklch(h) {
    const [r, g, b] = hexRgb(h).map(v => lin(v / 255));
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    const L = .2104542553 * l + .7936177850 * m - .0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .8086757660 * s;
    return [L, Math.hypot(A, B), Math.atan2(B, A) / RAD];
  }
  /** OKLCH → hex; si sale de gama, reduce el croma hasta que entre */
  function deOklch(L, C, H) {
    for (let c = C; c >= 0; c -= .004) {
      const A = c * Math.cos(H * RAD), B = c * Math.sin(H * RAD);
      const l = (L + .3963377774 * A + .2158037573 * B) ** 3, m = (L - .1055613458 * A - .0638541728 * B) ** 3, s = (L - .0894841775 * A - 1.2914855480 * B) ** 3;
      const rgb = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s];
      if (rgb.every(v => v >= -.001 && v <= 1.001)) return rgbHex(rgb.map(v => { v = Math.max(0, Math.min(1, v)); return (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055) * 255; }));
    }
    return '#808080';
  }
  /** Mueve la luz (L) hasta que el color quede a ≥ 3:1 del cielo (gráficos, WCAG 1.4.11) */
  function aContraste(hex, cielo, min = 3) {
    if (contraste(hex, cielo) >= min) return hex;
    const [L, C, H] = oklch(hex), dir = lum(cielo) > .4 ? -1 : 1;
    for (let k = 1; k <= 40; k++) { const c = deOklch(Math.max(0, Math.min(1, L + dir * k * .015)), C, H); if (contraste(c, cielo) >= min) return c; }
    return hex;
  }

  /** Color CSS → hex/rgba que entiende un canvas. Resuelve color-mix(in srgb, A p%, B), también anidado, de los tokens de marca */
  function resuelve(v) {
    v = String(v || '').trim();
    if (!/^color-mix\(in srgb,/.test(v) || !v.endsWith(')')) return v;
    const cuerpo = v.slice('color-mix(in srgb,'.length, -1);
    let prof = 0, corte = -1;
    for (let i = 0; i < cuerpo.length; i++) { const ch = cuerpo[i]; if (ch === '(') prof++; else if (ch === ')') prof--; else if (ch === ',' && !prof) { corte = i; break; } }
    if (corte < 0) return v;
    const arg = t => { const m = t.trim().match(/^(.*?)(?:\s+([\d.]+)%)?$/); return [m[1].trim(), m[2] == null ? null : +m[2] / 100]; };
    const [ca, pa] = arg(cuerpo.slice(0, corte)), [cb, pb] = arg(cuerpo.slice(corte + 1));
    const p = pa != null ? pa : pb != null ? 1 - pb : .5;
    const rgba = c => { if (c === 'transparent') return [0, 0, 0, 0]; const x = resuelve(c); const m = x.match(/^rgba\(([^)]+)\)$/); if (m) { const n = m[1].split(',').map(Number); return [n[0], n[1], n[2], n[3]]; } return [...hexRgb(x), 1]; };
    const A = rgba(ca), B = rgba(cb), al = A[3] * p + B[3] * (1 - p);
    if (!al) return 'rgba(0,0,0,0)';
    // Mezcla premultiplicada por alfa, como la hace el navegador
    const c = [0, 1, 2].map(i => (A[i] * A[3] * p + B[i] * B[3] * (1 - p)) / al);
    return al >= .999 ? rgbHex(c) : `rgba(${c.map(Math.round).join(',')},${+al.toFixed(3)})`;
  }

  const raiz = () => typeof document !== 'undefined' ? document.documentElement : null;
  const css = n => { const r = raiz(); return r ? resuelve(getComputedStyle(r).getPropertyValue(n)) : ''; };
  const oscuro = () => { const r = raiz(); return !!r && (r.dataset.theme ? r.dataset.theme === 'dark' : typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches); };

  /** Colores de los estados (fijos en todo el grupo) leídos del tema; se recalculan al cambiar de tema.
      tema 'banda': la franja de la barra y los héroes (mismos estados, pero el contraste se mide contra --banda) */
  const cache = {};
  /* Temas fijos (no dependen de la página): papel = la hoja clara de los reportes; noche = la tarjeta para compartir */
  const FIJOS = {
    papel: { od: false, cielo: '#F7F8FC', luz: '#D99A3A', tenue: '#5E5A50', brasa: '#D9583A', apagado: '#6B7088', acento: '#2D47B5' },
    noche: { od: true, cielo: '#0A0F24', luz: '#FFC27A', tenue: '#C9C3B4', brasa: '#FF7D5E', apagado: '#A9ADBE', acento: '#9DB4FF' }
  };
  function colores(tema) {
    if (FIJOS[tema]) {
      if (cache[tema]) return cache[tema];
      const f = FIJOS[tema], [L0, C0, H0] = oklch(f.luz);
      const mag = [deOklch(Math.max(.2, Math.min(.97, L0 + (f.od ? -.12 : .08))), C0, H0), f.luz, deOklch(Math.max(.2, Math.min(.97, L0 + (f.od ? .035 : -.09))), C0, H0)];
      const c = Object.assign({}, f, { mag, tenueAlta: deMezcla(f.tenue, f.luz, .65) }); c.borde = x => aContraste(x, f.cielo);
      return (cache[tema] = c);
    }
    const banda = tema === 'banda', r = raiz();
    const clave = (r && r.dataset.theme) + '|' + (r && r.dataset.marca) + '|' + (banda ? 'b' : '');
    if (cache[clave]) return cache[clave];
    const od = oscuro();
    const luz = css('--luz-fill') || '#FFC27A', cielo = (banda ? css('--banda') : css('--cielo')) || '#0A0F24', [L0, C0, H0] = oklch(luz);
    // Dorado en tres pasos (menos luz · Eltanin · más luz). Brilla usa Eltanin; Brilla alta y Polar, más luz
    const mag = [deOklch(Math.max(.2, Math.min(.97, L0 + (od ? -.12 : .08))), C0, H0), luz, deOklch(Math.max(.2, Math.min(.97, L0 + (od ? .035 : -.09))), C0, H0)];
    const c = { cielo, luz, mag,
      tenue: css('--tenue') || '#C9C3B4', brasa: css('--brasa-fill') || '#FF7D5E',
      apagado: banda ? deMezcla(css('--banda-texto') || '#ECE6D6', cielo, .66) : (css('--apagado') || '#8A8F99'), acento: css('--acento') || '#9DB4FF' };
    c.tenueAlta = deMezcla(c.tenue, luz, .65);   // tenue 65 % + luz 35 %
    // El relleno claro del dorado no llega a 3:1 sobre el cielo claro: el contorno sí (mismo tono, más tinta)
    c.borde = x => aContraste(x, cielo);
    return (cache[clave] = c);
  }
  const deMezcla = (a, b, p) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v * p + y[i] * (1 - p))); };
  const colDe = (c, tema) => !c ? colores(tema).luz : c[0] === '#' ? c : c === 'mas' ? colores(tema).mag[2] : (colores(tema)[c] || colores(tema).luz);

  /* ---------- Geometría ---------- */
  const par = o => Object.assign({ L: 1, S: .5, F: .13, I: .13, rot: 0 }, o);
  function pts(p, R) {
    const out = [], F = Math.max(p.F, p.I);
    for (let j = 0; j < 16; j++) {
      const a = (j * 22.5 - 90 + p.rot) * RAD, r = (j % 2 ? F : (j / 2) % 2 ? p.S : p.L) * R;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
      const b = a + 11.25 * RAD; out.push([Math.cos(b) * p.I * R, Math.sin(b) * p.I * R]);
    }
    return out;
  }
  const d = (p, R) => 'M' + pts(p, R).map(q => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L') + 'Z';

  /* Estado completo de una estrella: forma + capas, todo numérico para que el resorte lo interpole.
     fill: corte izq→der (evidencia) · fant: cuánto se ve lo que falta · r,g,b color A · r2,g2,b2 color B · suave, ang: paso de A a B
     anillo, media, carta, halo, cola (cometa), fugaz, ecl (ocultación), meri (meridiano) */
  /* Ronda 5 (2026-10-20): luz (ángulo de la lámpara sobre las facetas, en grados; −135 = arriba a la izquierda),
     grabado (líneas de construcción, solo en tamaños grandes) y temp (temperatura de Eltanin, solo en login e ilustración) */
  /* 2.1.1: aura, el halo propio de Polar; solo arriba de 24 px (en el ícono la distinguen sus 16 rayos girados) */
  const CAPAS = { fill: 1, fant: 1, ang: 0, suave: 1, anillo: 0, media: 0, carta: 0, halo: 0, cola: 0, fugaz: 0, ecl: 0, meri: 0, luz: -135, grabado: 0, temp: 0, aura: 0 };

  const SIGNOS = {
    llega:      { n: 'Llega', p: { L: .09, S: .09, F: .09, I: .09 }, col: 'luz' },
    sin:        { n: 'Sin señal', p: { L: .34, S: .3, F: .26, I: .26 }, col: 'apagado', d: { fill: 0 } },
    // Escala de seis fases (2.1.1): más picos y más dorado = va ganando. Centro angosto: los picos siempre puntiagudos
    apaga:      { n: 'Se apaga', p: { L: .55, S: .2, F: .06, I: .07 }, col: 'brasa' },
    tenue:      { n: 'Tenue', p: { L: .68, S: .3, F: .07, I: .09 }, col: 'tenue' },
    tenue_alta: { n: 'Tenue alta', p: { L: .8, S: .46, F: .08, I: .1 }, col: 'tenueAlta' },
    brilla:     { n: 'Brilla', p: { L: 1, S: .5 }, col: 'luz' },
    brilla_alta: { n: 'Brilla alta', p: { L: 1.04, S: .56, F: .3, I: .12 }, col: 'mas' },
    polar:      { n: 'Polar', p: { L: 1.1, S: .66, F: .5, I: .11, rot: 11.25 }, col: 'mas', d: { aura: 1 } },
    halago:     { n: 'Halago', p: { L: .98, S: .2, F: .1, I: .08 }, col: 'luz' },
    atencion:   { n: 'Atención', p: { L: .72, S: .48, rot: 22.5 }, col: 'tenue', d: { media: 1 } },
    alerta:     { n: 'Alerta', p: { L: .62, S: .62, F: .62, I: .34 }, col: 'brasa', d: { anillo: 1 } },
    recompensa: { n: 'Recompensa', p: { L: 1, S: .5 }, col: 'luz', d: { carta: 1 } },
    ocultacion: { n: 'Ocultación', p: { L: 1, S: .5 }, col: 'tenue', d: { ecl: .8 } },
    nova:       { n: 'Nova', p: { L: 1.15, S: .32, F: .5, I: .07 }, col: 'luz', d: { halo: 1 } },
    cometa:     { n: 'Cometa', p: { L: .9, S: .45 }, col: 'luz', d: { cola: 1 } },
    fugaz:      { n: 'Estrella fugaz', p: { L: .9, S: .45 }, col: 'luz', d: { fugaz: 1 } },
    culmina:    { n: 'Culminación', p: { L: 1, S: .5 }, col: 'luz', d: { meri: 1, carta: 1 } },
    variable:   { n: 'Variable', p: { L: .86, S: .49 }, col: 'tenue', col2: 'luz', d: { suave: .25 } }
  };

  function estadoDe(sig, extra = {}, tema) {
    const s = typeof sig === 'string' ? SIGNOS[sig] : sig;
    const [r, g, b] = hexRgb(colDe(s.col, tema)), [r2, g2, b2] = hexRgb(colDe(s.col2 || s.col, tema));
    return Object.assign({}, CAPAS, par(s.p), s.d || {}, { r, g, b, r2, g2, b2 }, extra);
  }

  /** Color de la Rosa de una tienda según su fase (o uno de los cuatro estados: brilla = Eltanin, polar = más luz) */
  function colorEstado(fase, tema) {
    const c = colores(tema);
    return { apaga: c.brasa, tenue: c.tenue, tenue_alta: c.tenueAlta, brilla: c.mag[1], brilla_alta: c.mag[2], polar: c.mag[2] }[fase] || c.apagado;
  }

  /**
   * Signo de una tienda: su estado (forma, color con magnitud, evidencia) y, si se pide, UNA señal.
   * est: Brillo.estado(); senal: 'cometa'|'fugaz'|'variable'|null; inicio: estado al empezar el mes (para la variable)
   */
  function deTienda(est, senal = null, inicio = null, tema) {
    const id = est && (est.fase || est.id) || 'sin', base = SIGNOS[id] || SIGNOS.sin;
    const sig = Object.assign({}, base, { col: colorEstado(id, tema) });
    const extra = { fill: id === 'sin' ? 0 : (est.fill == null ? 1 : est.fill) };
    if (senal === 'cometa') extra.cola = 1;
    if (senal === 'fugaz') extra.fugaz = 1;
    if (senal === 'variable' && inicio) { sig.col = colorEstado(inicio, tema); sig.col2 = colorEstado(id, tema); extra.suave = .25; }
    return estadoDe(sig, extra, tema);
  }

  /** SVG interior de la Rosa con sus capas (rosaSVG de la página de marca) */
  /** opts.icono: versión de tamaño chico (≤ 24 px): sin facetas, sin hilo de contorno, núcleo más ancho */
  function svg(e, R, u, tema, opts = {}) {
    let c1 = rgbHex([e.r, e.g, e.b]), c2 = rgbHex([e.r2, e.g2, e.b2]);
    const bo = colores(tema).borde;
    const b1 = bo(c1), b2 = bo(c2);
    // Icono: sin hilo de contorno, así que la propia silueta toma el tono que llega a 3:1 contra el cielo
    if (opts.icono) { c1 = b1; c2 = b2; }
    const dd = d({ L: e.L, S: e.S, F: e.F, I: e.I, rot: e.rot }, R);
    const a = e.ang * RAD, s = cl01(e.suave), f = cl01(e.fill), fa = cl01(e.fant), n = v => v.toFixed(2);
    const grad = (id, x, y) => `<linearGradient id="${u}${id}" gradientUnits="userSpaceOnUse" x1="${n(-Math.cos(a) * R)}" y1="${n(-Math.sin(a) * R)}" x2="${n(Math.cos(a) * R)}" y2="${n(Math.sin(a) * R)}"><stop offset="${(.5 - s / 2).toFixed(3)}" stop-color="${x}"/><stop offset="${(.5 + s / 2).toFixed(3)}" stop-color="${y}"/></linearGradient>`;
    let o = '<defs>' + grad('g', c1, c2) + (b1 !== c1 || b2 !== c2 ? grad('b', b1, b2) : '')
      + `<radialGradient id="${u}h"><stop offset="0" stop-color="${c1}" stop-opacity=".5"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${u}t" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n(3.4 * R)}" y2="0"><stop offset="0" stop-color="${c1}" stop-opacity=".6"/><stop offset=".55" stop-color="${c1}" stop-opacity=".18"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></linearGradient>`
      + `<clipPath id="${u}c"><rect x="${-1.25 * R}" y="${-1.25 * R}" width="${n(2.5 * R * f)}" height="${2.5 * R}"/></clipPath>`;
    const ec = cl01(e.ecl), ex = R * (2.2 - 2.02 * ec), ey = -R * .35 * (1 - ec);
    if (ec > .005) o += `<mask id="${u}m" maskUnits="userSpaceOnUse" x="${-3 * R}" y="${-3 * R}" width="${6 * R}" height="${6 * R}"><rect x="${-3 * R}" y="${-3 * R}" width="${6 * R}" height="${6 * R}" fill="#fff"/><circle cx="${n(ex)}" cy="${n(ey)}" r="${n(.84 * R)}" fill="#000"/></mask>`;
    o += '</defs>';
    // Contorno de grabado: hilo fino con puntas afiladas (inglete), no un trazo grueso redondeado
    const trazo = b1 !== c1 || b2 !== c2 ? `url(#${u}b)` : `url(#${u}g)`, sw = Math.max(.45, R * .03).toFixed(2);
    // Facetas de rosa de los vientos: cada rayo principal en dos mitades. Cada mitad se ilumina según cuánto mira hacia
    // la lámpara (capa luz, en grados): la luz puede seguir al cursor. Se desvanecen cuando la estrella es apenas un punto
    const P = pts({ L: e.L, S: e.S, F: e.F, I: e.I, rot: e.rot }, R), oscuroTema = colores(tema).cielo && lum(colores(tema).cielo) < .2;
    const relieve = opts.icono ? 0 : cl01((Math.max(e.L, e.S) - .2) / .4), lz = (e.luz == null ? -135 : e.luz) * RAD;
    let luzD = '', sombraD = '', medias = '';
    for (let j = 0; j < 16; j += 2) {   // solo los 8 rayos principales: en los finos la faceta sería ruido junto al centro
      const t = P[2 * j], a = P[(2 * j + 31) % 32], b = P[2 * j + 1], th = Math.atan2(t[1], t[0]);
      [[a, th - Math.PI / 2], [b, th + Math.PI / 2]].forEach(([v, nrm]) => {
        const k = (Math.cos(nrm - lz) + 1) / 2;   // 1 de frente a la lámpara, 0 de espaldas
        const op = k > .5 ? (k - .5) * .62 : (.5 - k) * (oscuroTema ? .62 : .44);
        if (op > .01) medias += `<path d="M0 0L${n(v[0])} ${n(v[1])}L${n(t[0])} ${n(t[1])}Z" fill="${k > .5 ? '#fff' : '#000'}" fill-opacity="${(op * relieve).toFixed(3)}"/>`;
      });
    }
    // Temperatura de Eltanin: núcleo pálido y caliente, puntas intensas (OKLCH desde el color del estado, como marca.md)
    let temperatura = '';
    if (e.temp > .005 && !opts.icono) {
      const [L0, C0, H0] = oklch(c1), palida = deOklch(Math.min(.97, L0 + .09), C0 * .45, H0 + 14), intensa = deOklch(Math.max(.2, L0 - .09), C0 * 1.5, H0 - 12);
      o = o.replace('</defs>', `<radialGradient id="${u}k" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${n(R * Math.max(.3, e.L))}"><stop offset="0" stop-color="${palida}"/><stop offset=".28" stop-color="${palida}"/><stop offset=".62" stop-color="${c1}"/><stop offset="1" stop-color="${intensa}"/></radialGradient></defs>`);
      temperatura = `<path d="${dd}" fill="url(#${u}k)" opacity="${cl01(e.temp).toFixed(3)}"/>`;
    }
    const nucleo = R * Math.max(.045, e.I * .5);
    const facetas = relieve > .01
      ? medias
        // Botón central: un disco del color de la estrella, más claro, con su hilo de contorno
        + `<circle r="${n(nucleo)}" fill="${c1}"/><circle r="${n(nucleo)}" fill="#fff" fill-opacity="${(.4 * relieve).toFixed(3)}" stroke="${b1}" stroke-width="${n(R * .016)}" stroke-opacity="${(.8 * relieve).toFixed(3)}"/>`
      : '';
    // Grabado de instrumento (Space Trash Signs, ronda 5): círculo de los rayos cortos, núcleo y alcance, ejes, nodos
    // cuadrados en las puntas y las horas mayores de la carta, en hilo muy fino. Solo en tamaños grandes
    if (e.grabado > .005 && !opts.icono) {
      const gr = cl01(e.grabado), tinta = colores(tema).apagado, fondo = colores(tema).cielo, hilo = n(R * .008);
      o += `<g fill="none" stroke="${tinta}" stroke-width="${hilo}" opacity="${(.9 * gr).toFixed(3)}">`
        + `<circle r="${n(e.S * R)}" stroke-dasharray="${n(R * .025)} ${n(R * .05)}"/><circle r="${n(e.I * R * 1.6)}"/><circle r="${n(e.L * R * 1.12)}" opacity=".5"/>`;
      for (let k = 0; k < 4; k++) { const aa = (k * 45 - 90 + e.rot) * RAD, Lx = e.L * R * 1.22; o += `<line x1="${n(-Math.cos(aa) * Lx)}" y1="${n(-Math.sin(aa) * Lx)}" x2="${n(Math.cos(aa) * Lx)}" y2="${n(Math.sin(aa) * Lx)}" opacity="${k % 2 ? .35 : .6}"/>`; }
      o += '</g>';
      // los nodos van encima de la estrella (ver más abajo)
      e = Object.assign({}, e, { _nodos: { P, tinta, fondo, gr } });
    }
    if (e.halo > .005) o += `<circle r="${n(2 * R)}" fill="url(#${u}h)" opacity="${cl01(e.halo).toFixed(3)}"/>`;
    // Aura de Polar: el mismo resplandor que el halo, más corto y más suave, para que no se confunda con Nova
    if (e.aura > .005 && !opts.icono) o += `<circle r="${n(1.5 * R)}" fill="url(#${u}h)" opacity="${(.7 * cl01(e.aura)).toFixed(3)}"/>`;
    // Cometa: coma (cabeza difusa), cola de polvo ancha y curva y cola de iones recta; la cola sale a 150°
    if (e.cola > .005) {
      const c = cl01(e.cola), Lc = 3.2 * R * c, w0 = .3 * R, W = 1.05 * R * c, b = .55 * R * c;
      o += `<circle r="${n(.75 * R)}" fill="url(#${u}h)" opacity="${n(c)}"/><g transform="rotate(150)">`
        + `<path d="M0 ${n(-w0)}C${n(Lc * .35)} ${n(-w0 * 1.6)} ${n(Lc * .7)} ${n(-W * .55 + b * .5)} ${n(Lc)} ${n(-W * .35 + b)}L${n(Lc)} ${n(W * .55 + b)}C${n(Lc * .6)} ${n(W * .8 + b * .4)} ${n(Lc * .25)} ${n(w0 * 1.5)} 0 ${n(w0)}Z" fill="url(#${u}t)"/>`
        + [-.05, 0, .045].map((t, i) => `<line x1="0" y1="0" x2="${n(Lc * (1.05 - i * .12) * Math.cos(t))}" y2="${n(Lc * (1.05 - i * .12) * Math.sin(t))}" stroke="url(#${u}t)" stroke-width="${n(R * (i === 1 ? .14 : .08))}"/>`).join('') + '</g>';
    }
    // Estrella fugaz: un solo trazo que cae, a −140°
    if (e.fugaz > .005) { const c = cl01(e.fugaz), Lf = 3.4 * R * c, w = .07 * R; o += `<g transform="rotate(-140)"><path d="M0 ${n(-w)}L${n(Lf)} 0L0 ${n(w)}Z" fill="url(#${u}t)"/></g>`; }
    // Carta de 24 h: un círculo base de hilo y las marcas horarias (las de 0, 6, 12 y 18 h más largas), con punta redonda
    if (e.carta > .005) {
      const r0 = R * 1.5;
      o += `<circle r="${n(r0)}" fill="none" stroke="${b1}" stroke-width="${n(R * .018)}" opacity="${(.35 * cl01(e.carta)).toFixed(3)}"/>`;
      for (let t = 0; t < 24; t++) { const aa = (t * 15 - 90) * RAD, on = cl01(e.carta * 24 - t), Lt = (t % 6 ? .09 : .22) * R; o += `<line x1="${n(Math.cos(aa) * r0)}" y1="${n(Math.sin(aa) * r0)}" x2="${n(Math.cos(aa) * (r0 - Lt * on))}" y2="${n(Math.sin(aa) * (r0 - Lt * on))}" stroke="${b1}" stroke-width="${n(R * (t % 6 ? .045 : .075))}" stroke-linecap="round" opacity="${on.toFixed(3)}"/>`; }
    }
    // Alerta: anillo doble, como grabado
    if (e.anillo > .005) o += `<g fill="none" stroke="${b1}" opacity="${cl01(e.anillo).toFixed(3)}"><circle r="${n(1.34 * R)}" stroke-width="${n(R * .07)}"/><circle r="${n(1.2 * R)}" stroke-width="${n(R * .02)}" opacity=".6"/></g>`;
    if (e.media > .005) o += `<circle r="${n(1.32 * R)}" fill="none" stroke="${b1}" stroke-width="${n(R * .08)}" pathLength="100" stroke-dasharray="${(50 * cl01(e.media)).toFixed(1)} 100" transform="rotate(180)" opacity="${cl01(e.media).toFixed(3)}"/>`;
    if (e.meri > .005) o += `<g opacity="${cl01(e.meri).toFixed(3)}"><line y1="${n(-1.8 * R)}" y2="${n(1.8 * R)}" stroke="${b1}" stroke-width="${n(R * .05)}" stroke-dasharray="2 5"/><path d="M${n(-.09 * R)} ${n(-1.95 * R)}L${n(.09 * R)} ${n(-1.95 * R)}L0 ${n(-1.78 * R)}Z" fill="${b1}"/></g>`;
    o += `<g${ec > .005 ? ` mask="url(#${u}m)"` : ''}>`;
    // Lo que falta de evidencia: la silueta en hilo tenue (se lee como «aún no está»), no un relleno a medias
    // En el icono no hay hilo: la parte que falta va como relleno tenue, para que a 20 px la estrella se siga leyendo entera
    o += opts.icono
      ? `<path d="${dd}" fill="url(#${u}g)" fill-opacity="${(.3 * fa).toFixed(3)}"/>`
      : `<path d="${dd}" fill="url(#${u}g)" fill-opacity="${(.08 * fa).toFixed(3)}" stroke="${trazo}" stroke-opacity="${(.5 * fa).toFixed(3)}" stroke-width="${sw}" stroke-linejoin="miter" stroke-miterlimit="12"/>`;
    // Icono (≤ 24 px): solo la silueta llena; el hilo de contorno a ese tamaño es ruido (salvo sin señal, que es solo contorno)
    const contorno = opts.icono && f > .05 ? '' : `<path d="${dd}" fill="none" stroke="${trazo}" stroke-width="${opts.icono ? n(R * .09) : sw}" stroke-linejoin="miter" stroke-miterlimit="12"/>`;
    o += `<g clip-path="url(#${u}c)"><path d="${dd}" fill="url(#${u}g)"/>${temperatura}${facetas}${contorno}</g></g>`;
    if (e._nodos) {
      const { P: Q, tinta, fondo, gr } = e._nodos;
      let nd = '';
      for (let j = 0; j < 16; j += 2) { const t = Q[2 * j], q = R * (j % 4 ? .022 : .032); nd += `<rect x="${n(t[0] - q)}" y="${n(t[1] - q)}" width="${n(2 * q)}" height="${n(2 * q)}" fill="${fondo}" stroke="${tinta}" stroke-width="${n(R * .009)}"/>`; }
      for (let j = 1; j < 32; j += 4) nd += `<circle cx="${n(Q[j][0])}" cy="${n(Q[j][1])}" r="${n(R * .013)}" fill="${tinta}"/>`;
      // las horas mayores de la carta (0, 6, 12 y 18 h) como cifras de instrumento
      nd += [['0', 0], ['6', 90], ['12', 180], ['18', 270]].map(([h, deg]) => { const aa = (deg - 90) * RAD, r = e.L * R * 1.34; return `<text x="${n(Math.cos(aa) * r)}" y="${n(Math.sin(aa) * r + R * .035)}" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-size="${n(R * .09)}" fill="${tinta}">${h}</text>`; }).join('');
      o += `<g opacity="${(.9 * gr).toFixed(3)}">${nd}</g>`;
    }
    if (ec > .005) o += `<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(.84 * R)}" fill="none" stroke="${c1}" stroke-opacity="${(.3 * ec).toFixed(3)}" stroke-width="1"/>`;
    return o;
  }

  let uid = 0;
  /** Caja del dibujo según sus capas: la cola y el trazo fugaz salen lejos; la carta y los anillos, a 1.5 R */
  const caja = (e, icono) => (e.cola > .005 || e.fugaz > .005) ? 3.1 : (e.carta > .005 || e.meri > .005) ? 2 : (e.anillo > .005 || e.media > .005 || e.halo > .005) ? 1.6 : (e.aura > .005 && !icono) ? 1.5 : Math.max(1.12, e.L * 1.04);

  /**
   * Rosa quieta como <svg> (ranking, listas, tarjetas). e = estado (estadoDe/deTienda) o id de signo.
   * opts: { size (px), label (texto accesible; sin él es decorativa), cls, tema ('banda' en la franja de noche) }
   */
  function html(e, opts = {}) {
    if (typeof e === 'string') e = estadoDe(e);
    const R = 10, size = opts.size || 18, u = 'ro' + (++uid) + '-';
    // Tamaño de icono (ronda 5): a 24 px o menos la Rosa se dibuja para el píxel: núcleo más ancho, sin rayos finos
    // escondidos, sin facetas ni hilo. Solo con la estrella sola: con cola o carta la caja crece y la estrella ya es chica
    // El núcleo sube a .12, no más: con I ≥ .16 la estrella se lee redonda y las fases de abajo pierden sus picos
    const icono = size <= 24 && e.L > .3 && caja(e, true) < 1.5;
    if (icono) e = Object.assign({}, e, { I: Math.max(e.I, .12), F: e.F > .3 ? e.F : 0 });
    const k = caja(e, icono) * R;
    const a11y = opts.label ? `role="img" aria-label="${String(opts.label).replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
    return `<svg class="rosa${opts.cls ? ' ' + opts.cls : ''}" viewBox="${-k} ${-k} ${2 * k} ${2 * k}" width="${size}" height="${size}" ${a11y}>${svg(e, R, u, opts.tema, { icono })}</svg>`;
  }

  /* ---------- Motor de resorte ----------
     Un resorte por valor, un poco subamortiguado: arranca rápido, frena suave y se asienta con un rebote corto.
     Rigidez 170 / amortiguamiento 19 para la forma; 60 / 15.5 para el color, la carta, el corte y el paso entre colores. */
  const LENTOS = new Set(['r', 'g', 'b', 'r2', 'g2', 'b2', 'carta', 'suave', 'fill', 'luz', 'grabado', 'temp']);
  function Estrella(el, R = 40, tema) {
    const u = 're' + (++uid) + '-';
    const cur = estadoDe('llega', {}, tema), vel = Object.fromEntries(Object.keys(cur).map(k => [k, 0]));
    let dst = { ...cur }, raf = 0, last = 0;
    const dibuja = () => { el.innerHTML = svg(cur, R, u, tema); };
    function paso(now) {
      if (!el.isConnected) { raf = 0; return; }
      const dt = Math.min(.032, (now - (last || now)) / 1000) || .016; last = now;
      let mov = false;
      for (const k in cur) {
        const lento = LENTOS.has(k), rig = lento ? 60 : 170, am = lento ? 15.5 : 19;
        vel[k] += ((dst[k] - cur[k]) * rig - vel[k] * am) * dt; cur[k] += vel[k] * dt;
        if (Math.abs(dst[k] - cur[k]) > .002 || Math.abs(vel[k]) > .002) mov = true; else { cur[k] = dst[k]; vel[k] = 0; }
      }
      dibuja();
      raf = mov ? requestAnimationFrame(paso) : 0;
    }
    dibuja();
    return {
      /** Va hacia el estado e (con resorte) */
      a(e) {
        dst = Object.assign({}, CAPAS, e);
        for (const k in dst) if (!(k in cur)) { cur[k] = dst[k]; vel[k] = 0; }
        if (quieto) { Object.assign(cur, dst); dibuja(); return; }
        if (!raf) { last = 0; raf = requestAnimationFrame(paso); }
      },
      salta(e) { dst = Object.assign({}, CAPAS, e); Object.assign(cur, dst); Object.keys(vel).forEach(k => vel[k] = 0); dibuja(); },
      /** Mueve la lámpara de las facetas a `grados`, por el camino corto (sin dar la vuelta entera al cruzar ±180°) */
      luz(grados) {
        const d = ((grados - dst.luz) % 360 + 540) % 360 - 180;
        dst.luz += d;
        if (quieto) { cur.luz = dst.luz; dibuja(); return; }
        if (!raf) { last = 0; raf = requestAnimationFrame(paso); }
      },
      /** La luz de las facetas sigue al cursor (solo con puntero fino y sin reduced-motion); vuelve arriba a la izquierda al salir */
      sigueCursor() {
        if (quieto || typeof matchMedia !== 'function' || !matchMedia('(pointer: fine)').matches) return;
        const yo = this;
        const mueve = ev => {
          if (!el.isConnected) { removeEventListener('pointermove', mueve); return; }
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          yo.luz(Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) / RAD);
        };
        addEventListener('pointermove', mueve, { passive: true });
        document.addEventListener('pointerleave', () => yo.luz(-135));
      }
    };
  }

  /** Contenedor <svg> para una Rosa animada: al entrar al DOM nace (llega) y va con resorte a su estado e.
   *  opts.luz: la luz de las facetas sigue al cursor (ronda 5) */
  function anim(e, opts = {}) {
    const R = opts.R || 40, k = caja(e) * R, size = opts.size || 48, id = 'rsa' + (++uid);
    const a11y = opts.label ? `role="img" aria-label="${String(opts.label).replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
    // Las vistas arman el HTML y lo insertan en la misma tarea; la microtarea corre justo después, con el <svg> ya en el DOM
    if (typeof queueMicrotask === 'function') queueMicrotask(() => {
      const el = document.getElementById(id); if (!el) return;
      const s = Estrella(el, R, opts.tema);
      if (typeof window !== 'undefined' && window.ETOILE_REPINTA) s.salta(e); else requestAnimationFrame(() => s.a(e));
      if (opts.luz) s.sigueCursor();
    });
    return `<svg id="${id}" class="rosa rosa-anim${opts.cls ? ' ' + opts.cls : ''}" viewBox="${-k} ${-k} ${2 * k} ${2 * k}" width="${size}" height="${size}" ${a11y}></svg>`;
  }

  return { SIGNOS, par, pts, d, estadoDe, deTienda, colorEstado, svg, html, anim, Estrella, colores, contraste, oklch, deOklch, resuelve,
    /** Al cambiar de tema hay que releer los colores */
    olvida() { Object.keys(cache).forEach(k => { if (!FIJOS[k]) delete cache[k]; }); } };
})();

if (typeof module !== 'undefined') module.exports = { Brillo, Rosa };
