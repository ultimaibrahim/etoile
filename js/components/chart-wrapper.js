/**
 * components/chart-wrapper.js — Contenedor base de gráficas ECharts (roadmap A5).
 * Estados consistentes (loading / empty / error / ready), redimensionado automático y limpieza.
 * Uso: const c = ChartWrapper.mount(el, { state: 'ready', option: {...} });  c.update({...});  c.setState('empty');
 */
const ChartWrapper = {
  _all: new Set(),

  /** Movimiento común: las barras crecen con resorte (se pasan un poco y se asientan); sin movimiento si el sistema lo pide */
  motion(option) {
    if (!option) return option;
    // Sin movimiento si el sistema lo pide o si solo se repinta la vista (cambio de tema)
    if (window.ETOILE_REPINTA || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return { ...option, animation: false };
    const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
    series.forEach(sr => { if (sr && sr.type === 'bar' && !sr.animationEasing) sr.animationEasing = 'backOut'; });
    return option;
  },

  mount(el, { state = 'ready', option = null, height = null, emptyText = 'Sin datos para mostrar', errorText = 'No se pudo cargar la gráfica' } = {}) {
    if (!el || typeof echarts === 'undefined') return null;
    if (height) el.style.height = height;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'chart-state';
    el.appendChild(overlay);

    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0;';
    el.insertBefore(host, overlay);
    const chart = echarts.init(host, null, { renderer: 'canvas' });

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => chart.resize()) : null;
    if (ro) ro.observe(el);

    const api = {
      chart,
      setState(next, text) {
        const msg = { loading: 'Cargando…', empty: emptyText, error: errorText }[next];
        overlay.textContent = text || msg || '';
        overlay.dataset.state = next;
        overlay.style.display = next === 'ready' ? 'none' : 'flex';
        host.style.visibility = next === 'ready' ? 'visible' : 'hidden';
      },
      update(nextOption, opts = {}) {
        chart.setOption(ChartWrapper.motion(nextOption), opts.notMerge !== false);
        api.setState('ready');
      },
      dispose() {
        if (ro) ro.disconnect();
        chart.dispose();
        overlay.remove();
        host.remove();
        ChartWrapper._all.delete(api);
      }
    };

    ChartWrapper._all.add(api);
    if (state === 'ready' && option) api.update(option); else api.setState(state === 'ready' ? 'empty' : state);
    return api;
  },

  disposeAll() {
    [...this._all].forEach(a => { try { a.dispose(); } catch (e) {} });
    this._all.clear();
  }
};
