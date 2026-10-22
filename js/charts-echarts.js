/**
 * charts-echarts.js — Gráficas ECharts de Étoile 2.0 (reemplazan a charts.js / Chart.js).
 * Cada función recibe un contenedor DOM (no un canvas) y devuelve el wrapper de ChartWrapper.
 * Mismas firmas y mismo aspecto que las versiones de Chart.js: tooltip crystal, línea de meta, colores por tema.
 */
const EC = {
  sans: 'Plus Jakarta Sans, sans-serif',
  mono: 'JetBrains Mono, monospace',
  get oro() { return this.cssVar('--luz-fill', '#D99A3A'); },
  /** Colores de la marca para el canvas: estados fijos (luz, tenue, brasa) y acento/apagado del cielo de la marca */
  c(name) { return this.cssVar({ luz: '--luz-fill', tenue: '--tenue', brasa: '--brasa-fill', acento: '--acento', apagado: '--apagado', linea: '--linea', control: '--control', cielo: '--cielo', texto: '--texto', superficie: '--surface' }[name] || name, '#808080'); },

  isDark() { return typeof darkMode !== 'undefined' && darkMode; },

  pal() {
    const d = this.isDark();
    return {
      dark: d,
      axisMono: this.c('apagado'),
      axisSans: this.c('apagado'),
      grid: d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      gridSoft: d ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)',
      goalText: this.cssVar('--luz', '#8A5A00'),
      goalLine: this.c('apagado'),   // la meta es referencia, no alerta: gris punteado
      ptBorder: this.c('superficie')
    };
  },

  /** Resuelve una variable CSS a su color real (un canvas no entiende `var(--x)`) */
  cssVar(name, fallback) {
    try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return (v && typeof Rosa !== 'undefined' ? Rosa.resuelve(v) : v) || fallback; } catch (e) { return fallback; }
  },

  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  isMobile() { return window.innerWidth < 500; },

  /** Color de gráfica de una fase de la escala (marca.md): paleta divergente propia (--dv-*), no la de las estrellas */
  fase(f) { return this.cssVar('--dv-' + String(f).replace('_', '-'), '#808080'); },
  /** Escala de calificación en cinco fases, de la más alta a la más baja (Polar pide evidencia: una celda no la tiene).
   *  La celda lleva su número en ancho, así que no depende solo del color; ink es el texto que contrasta con el relleno. */
  ESCALA: [['brilla_alta', 'Brilla alta'], ['brilla', 'Brilla'], ['tenue_alta', 'Tenue alta'], ['tenue', 'Tenue'], ['apaga', 'Se apaga']],
  /** Texto que se lee encima de un relleno (oscuro o claro, el de más contraste) */
  ink(hex) { return (typeof Rosa !== 'undefined' && Rosa.contraste(hex, '#000000') >= Rosa.contraste(hex, '#ffffff')) ? '#0B1214' : '#F6F4EE'; },
  ratingScale() {
    return this.ESCALA.map(([id, nombre]) => { const fill = this.fase(id); return { id, nombre, fill, ink: this.ink(fill) }; });
  },
  /** Leyenda de la escala de fases, de la más baja a la más alta (va en .mx-legend). polar: los rankings sí la tienen, el mapa no */
  faseLegend(polar) {
    const sw = (f, t) => `<span class="mx-key"><i style="background:var(--dv-${f.replace('_', '-')})"></i>${t}</span>`;
    return sw('apaga', 'Se apaga &lt; 4.30') + sw('tenue', 'Tenue 4.30–4.44') + sw('tenue_alta', 'Tenue alta 4.45–4.59')
      + sw('brilla', 'Brilla 4.60–4.74') + sw('brilla_alta', `Brilla alta ${polar ? '4.75–4.89' : '≥ 4.75'}`) + (polar ? sw('polar', 'Polar ≥ 4.90 con 15 reseñas') : '');
  },
  ratingTier(v) { return this.ESCALA.findIndex(([id]) => id === Brillo.escala(v)); },

  metaRating() { return typeof KpiMeta !== 'undefined' ? KpiMeta.ratingMinimo : 4.60; },
  metaVolumen() { return typeof KpiMeta !== 'undefined' ? KpiMeta.volumenMeta : 15; },

  /** Tarjeta HTML del tooltip: rows = [{ color, text }] */
  card(title, rows, footer) {
    const body = rows.map(r => `<div class="ct-row"><span class="ct-indicator" style="background:${r.color || 'var(--oro)'}"></span><span class="ct-label">${r.text}</span></div>`).join('');
    return `<div class="etoile-tip-card">${title ? `<div class="ct-header">${this.esc(title)}</div>` : ''}<div class="ct-body">${body}</div>${footer ? `<div class="ct-footer">${footer}</div>` : ''}</div>`;
  },

  tooltip(formatter, trigger = 'axis') {
    return {
      trigger, appendToBody: true, confine: true, className: 'etoile-tip',
      backgroundColor: 'transparent', borderWidth: 0, padding: 0, extraCssText: 'box-shadow:none;',
      transitionDuration: 0.12,
      axisPointer: { type: trigger === 'axis' ? 'line' : 'none', lineStyle: { color: this.isDark() ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)', type: 'dashed' } },
      formatter
    };
  },

  /** Ejes de categorías y de valores con el estilo de Étoile */
  catAxis(labels, p, extra = {}) {
    return Object.assign({
      type: 'category', data: labels,
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { fontSize: 10, fontFamily: this.sans, color: p.axisSans }
    }, extra);
  },
  valAxis(p, extra = {}) {
    return Object.assign({
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: p.grid } },
      axisLabel: { fontSize: 10, fontFamily: this.mono, color: p.axisMono }
    }, extra);
  },

  /** Línea de meta punteada con etiqueta (equivale al plugin targetLine) */
  goalLine(axis, value, label, lineColor, width, dash, p, position) {
    return {
      silent: true, symbol: 'none', animation: false,
      data: [{ [axis]: value }],
      lineStyle: { color: lineColor, width, type: dash },
      label: { show: true, formatter: label, position, color: p.goalText, fontWeight: 'bold', fontSize: 10, fontFamily: this.sans }
    };
  },

  /** Entrada escalonada de barras con resorte (cada una llega un instante después y se pasa un poco antes de asentarse) */
  stagger(ms = 35) { return { animationDuration: 800, animationEasing: 'backOut', animationDelay: (i) => i * ms }; },

  /** Estado "atenuado" de lo que no está resaltado (se usa al vincular gráficas o al enfocar una barra) */
  blur() { return { itemStyle: { opacity: 0.32 } }; },

  /**
   * Vincula dos gráficas de barras por nombre de categoría: pasar el cursor por una sucursal en una
   * la resalta (y atenúa el resto) en la otra. Es la interacción que hace sentir las gráficas como un solo sistema.
   */
  linkHover(a, b) {
    if (!a || !b) return;
    const cats = (api) => {
      const o = api.chart.getOption();
      const ax = (o.xAxis && o.xAxis[0] && o.xAxis[0].type === 'category') ? o.xAxis[0] : o.yAxis[0];
      return ax.data || [];
    };
    const wire = (from, to) => {
      const toCats = cats(to);
      from.chart.on('mouseover', e => {
        if (e.componentType !== 'series') return;
        const idx = toCats.indexOf(e.name);
        if (idx >= 0) to.chart.dispatchAction({ type: 'highlight', dataIndex: idx });
      });
      from.chart.on('mouseout', () => to.chart.dispatchAction({ type: 'downplay' }));
    };
    wire(a, b); wire(b, a);
  },

  /** En pantallas táctiles el tooltip se oculta a los 5 s (evita el tooltip "pegado" en iOS) */
  autoHideTip(api) {
    if (!api || !window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
    let t = null;
    api.chart.getZr().on('click', () => {
      clearTimeout(t);
      t = setTimeout(() => api.chart.dispatchAction({ type: 'hideTip' }), 5000);
    });
  },

  /**
   * Clic en cualquier punto de la columna de una categoría del eje X (no solo sobre la barra o el punto):
   * un área de toque amplia, pensada también para el celular. `isActive(i)` decide si esa columna es accionable.
   */
  columnClick(api, count, onSelect, isActive = () => true) {
    if (!api || !onSelect) return;
    const zr = api.chart.getZr();
    const indexAt = (e) => {
      const pt = [e.offsetX, e.offsetY];
      if (!api.chart.containPixel({ gridIndex: 0 }, pt)) return -1;
      const v = api.chart.convertFromPixel({ xAxisIndex: 0 }, e.offsetX);
      const i = Math.round(Array.isArray(v) ? v[0] : v);
      return Number.isFinite(i) && i >= 0 && i < count ? i : -1;
    };
    zr.on('click', e => { const i = indexAt(e); if (i >= 0 && isActive(i)) onSelect(i); });
    zr.on('mousemove', e => { const i = indexAt(e); zr.setCursorStyle(i >= 0 && isActive(i) ? 'pointer' : 'default'); });
  },

  setCursor(api, fn) {
    const zr = api.chart.getZr();
    zr.on('mousemove', e => zr.setCursorStyle(fn(e) ? 'pointer' : 'default'));
  },

  /** Etiquetas del eje X: todas visibles; se rotan 30° cuando no caben horizontalmente (como hacía Chart.js) */
  xLabels(el, labels, p, hideOverlap) {
    const perLabel = (el && el.clientWidth ? el.clientWidth : 600) / Math.max(1, labels.length);
    const longest = labels.reduce((m, l) => Math.max(m, String(l).length), 0);
    const rotate = perLabel < longest * 6.4 ? 30 : 0;
    return { fontSize: 10, fontFamily: this.sans, color: p.axisSans, interval: 0, rotate, hideOverlap: !!hideOverlap };
  },

  rgba(hex, a, fallback) {
    if (typeof hex === 'string' && hex.startsWith('#') && hex.length >= 7) {
      return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;
    }
    return fallback;
  },

  /** Serie de línea de tendencia (compartida por lineTrend y las dos de sucursal) */
  trendSeries({ data, color, border, area, goal, marks = false, clickable = false }) {
    return {
      type: 'line', data, smooth: 0.35, clip: false, cursor: clickable ? 'pointer' : 'default',
      symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 3, color },
      itemStyle: { color, borderColor: border, borderWidth: 2 },
      emphasis: { scale: 1.5 },
      areaStyle: area ? { color: area } : undefined,
      markLine: goal,
      // Mejor y peor punto con su valor: el hallazgo queda señalado en la propia gráfica
      markPoint: marks ? {
        symbol: 'pin', symbolSize: 40, animationDelay: 600, silent: true,
        label: { color: this.c('cielo'), fontSize: 10, fontWeight: 700, fontFamily: this.sans, formatter: pt => Number(pt.value).toFixed(2) },
        data: [
          { type: 'max', name: 'Mejor', itemStyle: { color: this.c('acento') } },
          { type: 'min', name: 'Más bajo', itemStyle: { color: this.c('brasa') } }
        ]
      } : undefined
    };
  }
};

function colLabelsOf(cols, short = false) { return cols.map(c => (short ? c.label.split(' ')[0] : c.label)); }

const EtoileCharts = {
  heroTrend(el, labels, data) {
    const isDark = EC.isDark();
    const hasData = data.some(v => v !== null && v !== undefined);
    return ChartWrapper.mount(el, {
      state: hasData ? 'ready' : 'empty',
      emptyText: '',
      option: {
        animationDuration: 600,
        grid: { left: 0, right: 0, top: 0, bottom: 0 },
        xAxis: { type: 'category', data: labels, show: false, boundaryGap: false },
        yAxis: { type: 'value', min: 3.5, max: 5.1, show: false },
        tooltip: { show: false },
        series: [{
          type: 'line', data, smooth: 0.4, showSymbol: false, silent: true, connectNulls: true,
          // Tendencia de fondo del héroe: el acento de la franja (antes crema sobre verde: en claro quedaba invisible)
          lineStyle: { width: 2, color: EC.c('acento') },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: Rosa.resuelve(`color-mix(in srgb, ${EC.c('acento')} 22%, transparent)`) }, { offset: 1, color: 'rgba(0,0,0,0)' }] } }
        }]
      }
    });
  },

  barVolume(el, labels, data, colors) {
    const p = EC.pal();
    const api = ChartWrapper.mount(el, {
      state: labels.length ? 'ready' : 'empty',
      option: {
        animationDuration: 700,
        grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => {
          const it = items[0];
          return EC.card(it.axisValueLabel, [{ color: 'var(--oro)', text: `${it.value} reseña${it.value !== 1 ? 's' : ''}` }]);
        }),
        xAxis: EC.catAxis(labels, p, { axisLabel: EC.xLabels(el, labels, p, false) }),
        yAxis: EC.valAxis(p, { min: 0, minInterval: 1 }),
        series: [{
          type: 'bar', barMaxWidth: 46,
          data: data.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: 6 } }))
        }]
      }
    });
    EC.autoHideTip(api);
    return api;
  },

  stackedVolume(el, labels, okData, neutralData, warnData, onSelect) {
    const p = EC.pal();
    const d = p.dark;
    const defs = [
      { name: 'Negativas (1-2★)', data: warnData, color: EC.c('brasa') },
      { name: 'Neutrales (3★)', data: neutralData, color: EC.c('control') },
      { name: 'Positivas (4-5★)', data: okData, color: EC.c('acento') }
    ];
    const api = ChartWrapper.mount(el, {
      state: labels.length ? 'ready' : 'empty',
      option: {
        ...EC.stagger(30),
        grid: { left: 8, right: 12, top: (el && el.clientWidth < 420) ? 62 : 36, bottom: 8, containLabel: true },
        legend: {
          top: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, itemGap: 18,
          textStyle: { color: p.axisSans, fontSize: 11, fontFamily: EC.sans }
        },
        tooltip: EC.tooltip(items => {
          let total = 0;
          // Chart.js listaba el dataset de arriba hacia abajo (positivas primero); se conserva ese orden
          const rows = [...items].reverse().map(i => { total += i.value || 0; return { color: i.color, text: `${i.seriesName}: ${i.value}` }; });
          return EC.card(items[0].axisValueLabel, rows, `Total reseñas: ${total}`);
        }),
        xAxis: EC.catAxis(labels, p, { axisLabel: EC.xLabels(el, labels, p, false) }),
        yAxis: EC.valAxis(p, { min: 0, minInterval: 1 }),
        series: defs.map((s, i) => ({
          name: s.name, type: 'bar', stack: 'total', barMaxWidth: 24, barCategoryGap: '25%',
          cursor: onSelect ? 'pointer' : 'default',
          data: s.data,
          itemStyle: { color: s.color, borderRadius: i === 2 ? [4, 4, 0, 0] : 0 },
          emphasis: { focus: 'self' }, blur: EC.blur()
        }))
      }
    });
    if (api && onSelect) api.chart.on('click', e => onSelect(e.dataIndex, e.seriesIndex));
    EC.autoHideTip(api);
    return api;
  },

  barRanking(el, labels, data, colors, onSelect) {
    const p = EC.pal();
    const meta = EC.metaRating();
    const mobile = EC.isMobile();
    const api = ChartWrapper.mount(el, {
      state: labels.length ? 'ready' : 'empty',
      option: {
        ...EC.stagger(45),
        grid: { left: 5, right: 35, top: 26, bottom: 5, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].name, [{ color: 'var(--oro)', text: `${Number(items[0].value).toFixed(2)} ★` }])),
        xAxis: EC.valAxis(p, { min: 1, max: 5, interval: 0.5, splitLine: { lineStyle: { color: p.gridSoft } }, axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, formatter: v => v.toFixed(1) } }),
        yAxis: EC.catAxis(labels, p, { inverse: true }),
        series: [{
          type: 'bar', barMaxWidth: 18, cursor: onSelect ? 'pointer' : 'default',
          emphasis: { focus: 'self' }, blur: EC.blur(),
          // Cada barra lleva su número con la tinta que contrasta con su color (la paleta de fases va de claro a hondo)
          data: data.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: 4 }, label: /^#/.test(colors[i]) ? { color: EC.ink(colors[i]) } : {} })),
          label: {
            show: true, position: 'insideLeft', distance: 8, color: EC.c('cielo'), fontWeight: 'bold', fontSize: 10, fontFamily: EC.sans,
            formatter: e => {
              const v = e.value;
              if (v === undefined || v === null || v === 0) return '';
              const dev = v - meta;
              return mobile ? `${v.toFixed(2)}★` : `${v.toFixed(2)} ★ (${dev >= 0 ? '+' : ''}${dev.toFixed(2)})`;
            }
          },
          markLine: EC.goalLine('xAxis', meta, 'Meta 4.60', EC.oro, 2, [4, 4], p, 'start')
        }]
      }
    });
    if (api && onSelect) api.chart.on('click', e => { if (e.componentType === 'series') onSelect(e.dataIndex); });
    EC.autoHideTip(api);
    return api;
  },

  donutDistribution(el, labels, data, colors, opts = {}) {
    const p = EC.pal();
    const { decimals = 0, unit = '', legendSize = 10, legendGap = 12 } = opts;
    const total = data.reduce((a, b) => a + b, 0);
    const api = ChartWrapper.mount(el, {
      state: total > 0 ? 'ready' : 'empty',
      option: {
        animationDuration: 700,
        legend: { orient: 'vertical', right: 0, top: 'middle', icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: legendGap, textStyle: { color: p.axisSans, fontSize: legendSize, fontFamily: EC.sans } },
        tooltip: EC.tooltip(e => {
          const pct = total > 0 ? ((e.value / total) * 100).toFixed(decimals) : 0;
          return EC.card(null, [{ color: e.color, text: ` ${EC.esc(e.name)}: ${e.value}${unit} (${pct}%)` }]);
        }, 'item'),
        series: [{
          type: 'pie', radius: ['59%', '98%'], center: ['40%', '50%'], label: { show: false }, labelLine: { show: false },
          itemStyle: { borderWidth: p.dark ? 2 : 1, borderColor: p.ptBorder },
          emphasis: { scaleSize: 4 },
          data: labels.map((l, i) => ({ name: l, value: data[i], itemStyle: { color: colors[i] } }))
        }]
      }
    });
    EC.autoHideTip(api);
    return api;
  },

  starDistributionBar(el, labels, data, colors, onSelect) {
    const p = EC.pal();
    const total = data.reduce((a, b) => a + b, 0);
    const pct = v => (total > 0 ? ((v / total) * 100).toFixed(0) : 0);
    const api = ChartWrapper.mount(el, {
      state: labels.length ? 'ready' : 'empty',
      option: {
        ...EC.stagger(60),
        grid: { left: 5, right: EC.isMobile() ? 38 : 60, top: 10, bottom: 5, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].name, [{ color: 'var(--oro)', text: ` ${items[0].value} opiniones (${pct(items[0].value)}%)` }])),
        xAxis: EC.valAxis(p, { min: 0, minInterval: 1 }),
        yAxis: EC.catAxis(labels, p, { inverse: true }),
        series: [{
          type: 'bar', barMaxWidth: 16,
          data: data.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: 4 } })),
          label: { show: true, position: 'right', color: p.axisSans, fontWeight: 'bold', fontSize: 10, fontFamily: EC.sans, formatter: e => `${e.value} (${pct(e.value)}%)` }
        }]
      }
    });
    if (api) {
      // Chart.js seleccionaba por fila ('index', intersect:false): se conserva, clic en cualquier punto de la fila
      const rowAt = e => {
        const pt = [e.offsetX, e.offsetY];
        if (!api.chart.containPixel({ gridIndex: 0 }, pt)) return -1;
        const idx = api.chart.convertFromPixel({ yAxisIndex: 0 }, e.offsetY);
        return typeof idx === 'number' && idx >= 0 && idx < labels.length ? Math.round(idx) : -1;
      };
      if (onSelect) api.chart.getZr().on('click', e => { const i = rowAt(e); if (i >= 0) onSelect(i); });
      EC.setCursor(api, e => onSelect && rowAt(e) >= 0);
    }
    EC.autoHideTip(api);
    return api;
  },

  lineTrend(el, labels, data, label, color, onSelect) {
    const p = EC.pal();
    const meta = EC.metaRating();
    let goalLabel = 'Meta Regional 4.60';
    if (EC.isMobile()) goalLabel = goalLabel.replace('Regional ', '');
    // Rejilla propia: Chart.js ocultaba la línea y la etiqueta por encima de 5.0 (eje hasta 5.15)
    const gridLines = [4.5, 4.6, 4.7, 4.8, 4.9, 5.0].map(v => ({ yAxis: v }));
    const api = ChartWrapper.mount(el, {
      state: data.some(v => v !== null && v !== undefined) ? 'ready' : 'empty',
      option: {
        animationDuration: 800,
        grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].axisValueLabel, [{ color: 'var(--oro)', text: ` ${EC.esc(label)}: ${Number(items[0].value).toFixed(2)}` }], onSelect ? 'Clic: ver este mes' : '')),
        xAxis: EC.catAxis(labels, p, { boundaryGap: false, axisLabel: EC.xLabels(el, labels, p, EC.isMobile()) }),
        yAxis: EC.valAxis(p, {
          min: 4.5, max: 5.15, interval: 0.1, splitLine: { show: false },
          axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, formatter: v => (v > 5.0001 ? '' : v.toFixed(1)) }
        }),
        series: [
          { type: 'line', data: [], silent: true, tooltip: { show: false }, markLine: { silent: true, symbol: 'none', animation: false, label: { show: false }, lineStyle: { color: p.grid, width: 1, type: 'solid' }, data: gridLines } },
          EC.trendSeries({ data, color, border: p.ptBorder, clickable: !!onSelect, marks: data.filter(v => typeof v === 'number').length >= 4, goal: EC.goalLine('yAxis', meta, goalLabel, p.goalLine, 2, [5, 5], p, 'insideEndTop') })
        ]
      }
    });
    EC.columnClick(api, labels.length, onSelect, i => typeof data[i] === 'number');
    EC.autoHideTip(api);
    return api;
  },

  branchRatingTrend(el, labels, data, color, onSelect) {
    const p = EC.pal();
    const meta = EC.metaRating();
    const api = ChartWrapper.mount(el, {
      state: data.some(v => v !== null && v !== undefined) ? 'ready' : 'empty',
      option: {
        animationDuration: 800,
        grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].axisValueLabel, [{ color: 'var(--oro)', text: ` Rating: ${Number(items[0].value).toFixed(2)} ★` }], onSelect ? 'Clic: ver este mes' : '')),
        xAxis: EC.catAxis(labels, p, { boundaryGap: false, axisLabel: EC.xLabels(el, labels, p, EC.isMobile()) }),
        yAxis: EC.valAxis(p, { min: 2.0, max: 5.2, interval: 0.5, axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, formatter: v => v.toFixed(1) } }),
        series: [EC.trendSeries({
          data, color, border: p.ptBorder, clickable: !!onSelect,
          marks: data.filter(v => typeof v === 'number').length >= 4,
          goal: EC.goalLine('yAxis', meta, 'Meta 4.60', p.goalLine, 1.5, [5, 5], p, 'insideEndBottom')
        })]
      }
    });
    EC.columnClick(api, labels.length, onSelect, i => typeof data[i] === 'number');
    EC.autoHideTip(api);
    return api;
  },

  branchVolumeTrend(el, labels, data, color, onSelect) {
    const p = EC.pal();
    const meta = EC.metaVolumen();
    const maxData = Math.max(0, ...data.filter(v => typeof v === 'number'));
    const api = ChartWrapper.mount(el, {
      state: data.some(v => v !== null && v !== undefined) ? 'ready' : 'empty',
      option: {
        animationDuration: 800,
        grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].axisValueLabel, [{ color: 'var(--oro)', text: ` Reseñas: ${items[0].value}` }], onSelect ? 'Clic: ver este mes' : '')),
        xAxis: EC.catAxis(labels, p, { boundaryGap: false, axisLabel: EC.xLabels(el, labels, p, EC.isMobile()) }),
        // +10% de holgura sobre el máximo y la meta siempre visible (antes la línea de meta podía quedar fuera del eje)
        yAxis: EC.valAxis(p, { min: 0, minInterval: 1, max: Math.ceil(Math.max(maxData, meta) * 1.1) }),
        series: [EC.trendSeries({
          data, color, border: p.ptBorder, clickable: !!onSelect,
          area: EC.rgba(color, 0.15, 'rgba(107, 144, 125, 0.1)'),
          goal: EC.goalLine('yAxis', meta, `Meta ${meta}`, EC.oro, 1.5, [5, 5], p, 'insideEndTop')
        })]
      }
    });
    EC.columnClick(api, labels.length, onSelect, i => typeof data[i] === 'number');
    EC.autoHideTip(api);
    return api;
  },

  /** Barras verticales con un valor decimal por categoría (brand: rendimiento ajustado por región) */
  barScore(el, labels, data, colors, opts = {}) {
    const p = EC.pal();
    const { unit = ' pts', title = 'Score', min = 0 } = opts;
    const api = ChartWrapper.mount(el, {
      state: labels.length ? 'ready' : 'empty',
      option: {
        animationDuration: 700,
        grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].axisValueLabel, [{ color: 'var(--oro)', text: ` ${title}: ${Number(items[0].value).toFixed(2)}${unit}` }])),
        xAxis: EC.catAxis(labels, p, { axisLabel: { fontSize: 11, fontFamily: EC.sans, color: p.axisSans, interval: 0, rotate: EC.xLabels(el, labels, p, false).rotate } }),
        yAxis: EC.valAxis(p, { min }),
        series: [{
          type: 'bar', barMaxWidth: 32,
          data: data.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: 8 } }))
        }]
      }
    });
    EC.autoHideTip(api);
    return api;
  },

  /** Radar de equilibrio operativo (compare): indicadores 0-100, hasta dos series */
  radar(el, labels, series) {
    const p = EC.pal();
    const api = ChartWrapper.mount(el, {
      state: series.some(s => s.data.some(v => v !== null && v !== undefined)) ? 'ready' : 'empty',
      option: {
        animationDuration: 800,
        tooltip: EC.tooltip(e => {
          const rows = labels.map((l, i) => ({ color: e.color, text: `${EC.esc(l)}: ${Number(e.value[i]).toFixed(0)}` }));
          return EC.card(e.name, rows);
        }, 'item'),
        radar: {
          indicator: labels.map(l => ({ name: l, max: 100, min: 0 })),
          radius: '78%', splitNumber: 5, shape: 'polygon', startAngle: 90, clockwise: true,
          axisName: { color: EC.c('texto'), fontSize: 11, fontWeight: 600, fontFamily: EC.sans },
          axisLine: { lineStyle: { color: p.dark ? 'rgba(237,230,216,0.1)' : 'rgba(22,22,20,0.08)' } },
          splitLine: { lineStyle: { color: p.dark ? 'rgba(237,230,216,0.08)' : 'rgba(22,22,20,0.06)' } },
          splitArea: { show: false }
        },
        series: [{
          type: 'radar', symbol: 'circle', symbolSize: 9,
          data: [...series].reverse().map(s => ({
            name: s.name, value: s.data,
            lineStyle: { color: s.color, width: 2.5, type: s.dash ? [5, 4] : 'solid' },
            areaStyle: { color: s.fill },
            itemStyle: { color: s.point, borderColor: p.ptBorder, borderWidth: 2 },
            emphasis: { itemStyle: { color: p.ptBorder, borderColor: s.color } }
          }))
        }]
      }
    });
    EC.autoHideTip(api);
    return api;
  },

  /**
   * Quejas por hora local (0-23) — complejidad adaptativa:
   *  · móvil/angosto: solo barras de quejas + franja pico (se lee en 3 segundos);
   *  · ancho (≥ 560 px): suma la tasa de queja por hora (quejas / reseñas con texto).
   * h = Patterns.hourly(...), hl = Patterns.headline(h)
   */
  hourComplaints(el, h, hl, onSelect) {
    const p = EC.pal();
    const rich = !!(el && el.clientWidth >= 560);
    const pad = Patterns.pad;
    const labels = Array.from({ length: 24 }, (_, i) => pad(i));
    const red = p.dark ? 'rgba(244,144,144,0.85)' : 'rgba(198,40,40,0.85)';
    const gold = EC.oro;
    const rate = h.tot.map((t, i) => (t >= 3 ? Math.round((1000 * h.neg[i]) / t) / 10 : null));   // solo con muestra mínima

    // Solo horas: los turnos reales se traslapan y cada tienda abre y cierra distinto, así que no hay franjas de turno
    const w = hl && hl.enough ? hl.window : null;
    const peak = w ? [[
      { xAxis: pad(w.start), name: `Pico ${pad(w.start)}–${pad(w.end + 1)} h`, itemStyle: { color: p.dark ? 'rgba(244,144,144,0.14)' : 'rgba(198,40,40,0.10)' }, label: { position: 'insideTop', distance: 20, color: red, fontWeight: 'bold', fontSize: 10, fontFamily: EC.sans } },
      { xAxis: pad(w.end) }
    ]] : [];

    const series = [{
      name: 'Quejas', type: 'bar', barMaxWidth: 22, data: h.neg, cursor: onSelect ? 'pointer' : 'default',
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(198,40,40,.45)' } },
      itemStyle: { color: red, borderRadius: [4, 4, 0, 0] },
      markArea: { silent: true, data: [...peak] }
    }];
    if (rich) {
      series.push({
        name: 'Tasa de queja', type: 'line', yAxisIndex: 1, data: rate, connectNulls: false,
        symbol: 'circle', symbolSize: 7, lineStyle: { width: 2, color: gold },
        itemStyle: { color: gold, borderColor: p.ptBorder, borderWidth: 1.5 }
      });
    }

    const api = ChartWrapper.mount(el, {
      state: h.nNeg > 0 ? 'ready' : 'empty',
      emptyText: 'Sin quejas con texto en este periodo',
      option: {
        ...EC.stagger(22),
        grid: { left: 8, right: rich ? 40 : 12, top: rich ? 40 : 18, bottom: 8, containLabel: true },
        legend: rich ? { top: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, itemGap: 18, textStyle: { color: p.axisSans, fontSize: 11, fontFamily: EC.sans } } : { show: false },
        tooltip: EC.tooltip(items => {
          const i = items[0].dataIndex;
          const rows = [{ color: red, text: `Quejas: ${h.neg[i]}` }, { color: 'var(--oro)', text: `Reseñas con texto: ${h.tot[i]}` }];
          if (h.tot[i] >= 3) rows.push({ color: gold, text: `Tasa de queja: ${rate[i]}%` });
          return EC.card(`${pad(i)}:00 – ${pad(i)}:59`, rows, onSelect && h.neg[i] > 0 ? 'Clic: ver estas quejas' : '');
        }),
        xAxis: EC.catAxis(labels, p, { axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, interval: rich ? 0 : 2 } }),
        yAxis: rich
          ? [EC.valAxis(p, { min: 0, minInterval: 1, max: v => Math.max(3, Math.ceil(v.max * 1.3)) }), EC.valAxis(p, { min: 0, max: 100, splitLine: { show: false }, axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, formatter: v => `${v}%` } })]
          : EC.valAxis(p, { min: 0, minInterval: 1, max: v => Math.max(3, Math.ceil(v.max * 1.3)) }),
        series
      }
    });
    EC.columnClick(api, 24, onSelect, i => h.neg[i] > 0);
    EC.autoHideTip(api);
    return api;
  },

  /**
   * Heatmap sucursal × mes (Patterns.branchMonthMatrix). metric: 'rating' (color por calificación frente a la meta)
   * o 'volume' (intensidad por número de reseñas). Complejidad adaptativa: en angosto solo los últimos 6 meses y sin números.
   * onSelect(rowIndex, monthIndex) con índices absolutos de la matriz.
   */
  branchMonthHeatmap(el, mx, { metric = 'rating', onSelect } = {}) {
    const p = EC.pal();
    const rich = !!(el && el.clientWidth >= 560);
    const shown = rich ? mx.months.length : Math.min(6, mx.months.length);
    const off = mx.months.length - shown;
    const cols = mx.months.slice(off);
    const rows = mx.rows;
    const MIN_RELIABLE = 3;                       // con menos reseñas el color se atenúa (poca muestra)
    const data = [];
    let maxCount = 1;
    rows.forEach((r, yi) => cols.forEach((c, xi) => {
      const k = off + xi, cnt = r.counts[k];
      if (!cnt) return;
      maxCount = Math.max(maxCount, cnt);
      const faint = metric === 'rating' && cnt < MIN_RELIABLE;
      const tier = metric === 'rating' ? EC.ratingScale()[EC.ratingTier(r.values[k])] : null;
      // Poca muestra: rayado diagonal sobre el color completo (con opacidad, un Brilla alta tenue se confundía con Brilla)
      const raya = { symbol: 'rect', symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: -Math.PI / 4, color: p.dark ? 'rgba(10,15,36,.55)' : 'rgba(255,255,255,.6)' };
      data.push({ value: [xi, yi, metric === 'rating' ? r.values[k] : cnt, cnt, r.values[k]], itemStyle: faint ? { decal: raya } : {}, label: tier ? { color: tier.ink, textBorderWidth: 0 } : {} });
    }));

    const visualMap = metric === 'rating'
      ? (() => { const sc = EC.ratingScale(), cortes = [Brillo.BRILLA_ALTA, Brillo.BRILLA, Brillo.TENUE_ALTA, Brillo.TENUE, -Infinity];
          return { type: 'piecewise', show: false, dimension: 2, pieces: sc.map((t, i) => ({ gte: cortes[i], lt: i ? cortes[i - 1] : Infinity, color: t.fill })) }; })()
      : { type: 'continuous', show: false, dimension: 2, min: 0, max: maxCount, inRange: { color: [EC.c('linea'), EC.c('control'), EC.c('acento')] } };

    const api = ChartWrapper.mount(el, {
      state: rows.length ? 'ready' : 'empty',
      emptyText: 'Aún no hay reseñas para comparar sucursales',
      option: {
        animationDuration: 600, animationEasing: 'cubicOut', animationDelay: (i) => i * 6,
        grid: { left: 6, right: 6, top: 34, bottom: 6, containLabel: true },
        tooltip: EC.tooltip(e => {
          const [xi, yi, , cnt, avg] = e.value;
          const r = rows[yi], k = off + xi;
          const rowsHtml = [{ color: 'var(--oro)', text: `Calificación: ${Number(avg).toFixed(2)}★` }, { color: 'var(--oro)', text: `Reseñas: ${cnt}${cnt < MIN_RELIABLE ? ' (pocas: ojo con la muestra)' : ''}` }];
          if (k > 0 && r.counts[k - 1] > 0) {
            const d = avg - r.values[k - 1];
            rowsHtml.push({ color: d >= 0 ? EC.c('acento') : EC.c('brasa'), text: `Frente a ${mx.months[k - 1].label}: ${d >= 0 ? '+' : ''}${d.toFixed(2)}★` });
          }
          return EC.card(`${r.nombre} · ${mx.months[k].full}`, rowsHtml, onSelect ? 'Clic: ver estas reseñas' : '');
        }, 'item'),
        xAxis: EC.catAxis(colLabelsOf(cols, !rich), p, { position: 'top', axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, interval: 0 } }),
        yAxis: EC.catAxis(rows.map(r => r.abr), p, { inverse: true, axisLabel: { fontSize: 11, fontFamily: EC.sans, color: p.axisSans, interval: 0 } }),
        visualMap,
        series: [{
          type: 'heatmap', data, cursor: onSelect ? 'pointer' : 'default',
          label: {
            show: true, fontSize: rich ? 10 : 11, fontWeight: 700, fontFamily: EC.mono, color: EC.c('texto'),
            formatter: e => (metric === 'rating' ? (e.value[2] < 4 ? '▼' : '') + Number(e.value[2]).toFixed(1) : e.value[2])
          },
          itemStyle: { borderColor: p.ptBorder, borderWidth: 2, borderRadius: 5 },
          emphasis: { itemStyle: { borderColor: EC.oro, borderWidth: 2, shadowBlur: 10, shadowColor: 'rgba(0,0,0,.35)' } }
        }]
      }
    });
    if (api && onSelect) api.chart.on('click', e => { if (e.componentType === 'series') onSelect(e.value[1], off + e.value[0]); });
    EC.autoHideTip(api);
    return api;
  },
  /** Duelo de dos sucursales: calificación mensual de cada una en la misma ventana (huecos = mes sin reseñas) */
  compareDuel(el, labels, a, b, opts, onSelect) {
    const p = EC.pal();
    const meta = EC.metaRating();
    const nums = a.concat(b).filter(v => typeof v === 'number');
    const lo = nums.length ? Math.max(1, Math.floor((Math.min(...nums) - 0.1) * 5) / 5) : 4;
    // A y B se distinguen por color Y por forma (B discontinua con rombos): con daltonismo o en escala de grises el color solo no basta
    const ser = (name, data, color, isB) => ({
      name, type: 'line', data, smooth: 0.25, connectNulls: false, symbol: isB ? 'diamond' : 'circle', symbolSize: isB ? 9 : 7, showSymbol: true,
      lineStyle: { width: 3, color, type: isB ? 'dashed' : 'solid' }, itemStyle: { color, borderColor: p.ptBorder, borderWidth: 2 }, emphasis: { focus: 'series', scale: 1.4 }
    });
    const sa = ser(opts.nameA, a, opts.colorA);
    sa.markLine = { silent: true, symbol: 'none', animation: false, label: { formatter: 'Meta ' + meta.toFixed(2), color: p.goalText, fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: p.goalLine, type: 'dashed', width: 1 }, data: [{ yAxis: meta }] };
    const api = ChartWrapper.mount(el, {
      state: nums.length ? 'ready' : 'empty',
      option: {
        animationDuration: 900,
        grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].axisValueLabel, items.filter(i => typeof i.value === 'number').map(i => ({ color: i.color, text: ` ${EC.esc(i.seriesName)}: ${Number(i.value).toFixed(2)}★` })), onSelect ? 'Clic: ver este mes' : '')),
        xAxis: EC.catAxis(labels, p, { boundaryGap: false, axisLabel: EC.xLabels(el, labels, p, EC.isMobile()) }),
        yAxis: EC.valAxis(p, { min: lo, max: 5, interval: 0.2, axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono, formatter: v => v.toFixed(1) } }),
        series: [sa, ser(opts.nameB, b, opts.colorB, true)]
      }
    });
    EC.columnClick(api, labels.length, onSelect, () => true);
    EC.autoHideTip(api);
    return api;
  },

  /** Quejas por hora de dos sucursales, una al lado de la otra */
  compareHours(el, hA, hB, opts) {
    const p = EC.pal();
    const labels = Array.from({ length: 24 }, (_, i) => Patterns.pad(i));
    const bar = (name, d, color) => ({ name, type: 'bar', data: d.neg, barMaxWidth: 12, barGap: '10%', itemStyle: { color, borderRadius: [4, 4, 0, 0] }, emphasis: { focus: 'series' } });
    const api = ChartWrapper.mount(el, {
      state: (hA.nNeg + hB.nNeg) > 0 ? 'ready' : 'empty',
      option: {
        animationDuration: 700,
        grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
        tooltip: EC.tooltip(items => EC.card(items[0].axisValueLabel + ' h', items.map(i => ({ color: i.color, text: ` ${EC.esc(i.seriesName)}: ${i.value} queja${i.value === 1 ? '' : 's'}` })), '')),
        xAxis: EC.catAxis(labels, p, { axisLabel: EC.xLabels(el, labels, p, EC.isMobile()) }),
        yAxis: EC.valAxis(p, { minInterval: 1, axisLabel: { fontSize: 10, fontFamily: EC.mono, color: p.axisMono } }),
        series: [bar(opts.nameA, hA, opts.colorA), bar(opts.nameB, hB, opts.colorB)]
      }
    });
    EC.autoHideTip(api);
    return api;
  },
};
