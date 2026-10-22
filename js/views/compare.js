/**
 * views/compare.js — Cara a cara de dos sucursales (#/comparar?a=&b=)
 *
 * Una pregunta por pieza: ¿quién va mejor y por cuánto? (titular por reglas), ¿en qué más se separan? (filas de
 * contraste), ¿cómo han evolucionado en el año? (duelo de 12 meses, clic para cambiar de mes) y ¿a qué hora se quejan
 * sus clientes? (quejas por hora, lado a lado). Todo con los datos reales: nada de índices inventados.
 */
const CompareView = {
  branchA: null,
  branchB: null,
  COLOR_A: () => EC.c('acento'),
  COLOR_B: () => EC.cssVar('--oro-line', '#8A5A00'),

  _branches() {
    return (typeof SUCURSALES_META_ALL !== 'undefined' && Array.isArray(SUCURSALES_META_ALL))
      ? SUCURSALES_META_ALL
      : (typeof SUCURSALES_META !== 'undefined' && Array.isArray(SUCURSALES_META) ? SUCURSALES_META : []);
  },

  _same(r, id) { return typeof isSameBranch === 'function' ? isSameBranch(r.sucursal, id) : (r.sucursal || '').toLowerCase() === (id || '').toLowerCase(); },

  /** Estadísticas del mes de una sucursal: solo cifras reales (Regla LCP #11 para las quejas) */
  _stats(meta, allReviews) {
    const rv = allReviews.filter(r => this._same(r, meta.id));
    const count = rv.length;
    const avg = count ? rv.reduce((s, r) => s + (r.stars || 0), 0) / count : 0;
    const withText = rv.filter(r => r.text && r.text.trim());
    const neg = withText.filter(r => r.stars <= 2);
    const replied = rv.filter(r => r.responseFromOwnerText && r.responseFromOwnerText.trim()).length;
    const graves = (typeof Severity !== 'undefined') ? Severity.criticalIn(rv).length : 0;
    return {
      nombre: meta.nombre, count, avg,
      negCount: neg.length, negPct: withText.length ? (100 * neg.length) / withText.length : 0,
      resp: count ? (100 * replied) / count : 0, graves
    };
  },

  async render(params = {}) {
    Charts.destroyAll();
    const app = document.getElementById('app');
    if (!app) return;

    const y = DataLoader.currentYear, m = DataLoader.currentMonth;
    // Ventana de 12 meses: se cargan los que existan para que el duelo anual tenga datos
    const span = Patterns.monthSpan(y, m, 12);
    await Promise.all(span.filter(s => DataLoader.hasMonth(s.y, s.m)).map(s => DataLoader.loadMonth(s.y, s.m)));
    const monthData = DataLoader.getMonth(y, m);
    const allReviews = (monthData && monthData.reviews) || [];
    const monthName = BranchTime.MESES_CAP[m - 1];

    const branches = this._branches();
    if (!branches.length) { app.innerHTML = '<div class="empty-state">No se encontró catálogo de sucursales.</div>'; return; }

    const qs = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const pa = params.a || qs.get('a'), pb = params.b || qs.get('b');
    let metaA = pa ? branches.find(b => b.id === pa) : null;
    let metaB = pb ? branches.find(b => b.id === pb) : null;
    if (!metaA || !metaB) {
      // Por defecto: la mejor y la peor sucursal de la región en el mes (lo que un gerente querría contrastar)
      const regional = (typeof SUCURSALES_META !== 'undefined' ? SUCURSALES_META : branches)
        .map(b => ({ b, s: this._stats(b, allReviews) })).filter(x => x.s.count >= Narrative.MIN_SAMPLE).sort((p, q) => q.s.avg - p.s.avg);
      metaA = metaA || (regional[0] ? regional[0].b : branches[0]);
      metaB = metaB || (regional.length > 1 ? regional[regional.length - 1].b : (branches.find(b => b.id !== metaA.id) || branches[0]));
    }
    if (metaA.id === metaB.id) metaB = branches.find(b => b.id !== metaA.id) || metaB;   // comparar una sucursal consigo misma no dice nada
    this.branchA = metaA.id; this.branchB = metaB.id;

    const sA = this._stats(metaA, allReviews), sB = this._stats(metaB, allReviews);
    const goal = EC.metaRating();
    const series = (meta) => span.map(s => { const st = DataLoader.computeBranchStats(s.y, s.m, meta.id); return st.count > 0 ? st.avg : null; });
    const vA = series(metaA), vB = series(metaB);
    const above = v => v.filter(x => typeof x === 'number' && x >= goal).length;
    const withData = v => v.filter(x => typeof x === 'number').length;
    const story = Narrative.compare(
      { ...sA, above: above(vA), withData: withData(vA) },
      { ...sB, above: above(vB), withData: withData(vB) }, goal);

    const opts = (sel) => branches.map(b => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${escapeHtml(b.nombre)} · ${typeof getRegionName === 'function' ? getRegionName(b.region) : b.region}</option>`).join('');

    // Selector propio (sin <select> nativo a la vista): botón con la sucursal y su región, y una lista con búsqueda agrupada
    // por región. El <select> queda oculto como la fuente del valor (lo leen el cambio de ruta y las pruebas)
    const regionDe = b => typeof getRegionName === 'function' ? getRegionName(b.region) : b.region;
    const grupos = [...new Set(branches.map(b => b.region))];
    const elige = (k, meta) => `
      <div class="cmp-sel ${k.toLowerCase()}" data-lado="${k}">
        <span id="cmpLbl${k}">Sucursal ${k}</span>
        <select id="compareSelect${k}" class="sr-only" tabindex="-1" aria-hidden="true" onchange="CompareView.onSelectChange()">${opts(meta.id)}</select>
        <button type="button" class="cmp-elige" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="cmpLbl${k} cmpVal${k}">
          <span class="cmp-elige-t"><b id="cmpVal${k}">${escapeHtml(meta.nombre)}</b><small>${escapeHtml(regionDe(meta))}</small></span>
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true"><path d="M1 1.5l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <div class="cmp-lista" hidden>
          <input type="search" class="cmp-busca" placeholder="Buscar sucursal o región" aria-label="Buscar sucursal o región" autocomplete="off">
          <div class="cmp-ops" role="listbox" aria-label="Sucursal ${k}">
            ${grupos.map(g => `<div class="cmp-grupo" role="group" aria-label="${escapeHtml(regionDe({ region: g }))}"><p aria-hidden="true">${escapeHtml(regionDe({ region: g }))}</p>${branches.filter(b => b.region === g).map(b => `<button type="button" role="option" class="cmp-op" data-id="${b.id}" data-busca="${escapeHtml((b.nombre + ' ' + regionDe(b)).toLowerCase())}" aria-selected="${b.id === meta.id}">${escapeHtml(b.nombre)}</button>`).join('')}</div>`).join('')}
            <p class="cmp-nada" hidden>Ninguna sucursal coincide.</p>
          </div>
        </div>
      </div>`;

    // Fila de contraste: valor A | barra repartida | valor B. "better" = cuál gana (menor o mayor es mejor)
    const row = (label, a, b, fmt, higherIsBetter = true) => {
      const mx = Math.max(Math.abs(a), Math.abs(b)) || 1;   // cada barra crece desde el centro en proporción al mayor de los dos
      const wa = Math.round((100 * Math.abs(a)) / mx), wb = Math.round((100 * Math.abs(b)) / mx);
      const win = a === b ? '' : ((a > b) === higherIsBetter ? 'a' : 'b');
      return `<div class="cmp-row">
        <span class="cmp-val a ${win === 'a' ? 'win' : ''}">${fmt(a)}</span>
        <div class="cmp-mid"><span class="cmp-label">${label}</span><div class="cmp-bar"><span class="half l"><i class="a" style="width:${wa}%"></i></span><span class="half r"><i class="b" style="width:${wb}%"></i></span></div></div>
        <span class="cmp-val b ${win === 'b' ? 'win' : ''}">${fmt(b)}</span>
      </div>`;
    };
    const side = (meta, s, k) => `
      <div class="cmp-side ${k}">
        <a class="cmp-name" href="#/sucursal/${meta.id}"><i class="cmp-dot ${k}"></i>${escapeHtml(meta.nombre)}<span class="cmp-go">Ver ficha →</span></a>
        <div class="cmp-score num">${s.count ? s.avg.toFixed(2) : '—'}<small>★</small></div>
        <div class="cmp-sub">${s.count} ${s.count === 1 ? 'reseña' : 'reseñas'} en ${monthName}</div>
      </div>`;

    app.innerHTML = `
      ${buildTopbar(false, 'Comparar')}
      <div class="cmp">
        <header class="cmp-head">
          <div class="cmp-kicker">Comparar · ${monthName} ${y}</div>
          <h1 class="cmp-title">Cara a cara</h1>
        </header>

        <div class="cmp-pick">
          ${elige('A', metaA)}
          <button class="cmp-swap" onclick="CompareView.swap()" aria-label="Intercambiar sucursales" title="Intercambiar">⇄</button>
          ${elige('B', metaB)}
        </div>

        <p class="story-line" id="cmpStory">${story}</p>

        <div class="cmp-duel">${side(metaA, sA, 'a')}<span class="cmp-vs">vs</span>${side(metaB, sB, 'b')}</div>

        <section class="cmp-card">
          <h2 class="cmp-h">En qué se separan <span class="cmp-hint">${monthName}</span></h2>
          ${row('Calificación', sA.avg, sB.avg, v => v ? v.toFixed(2) + '★' : '—')}
          ${row('Reseñas', sA.count, sB.count, v => v, true)}
          ${row('Quejas (≤ 2★, con texto)', sA.negPct, sB.negPct, v => v.toFixed(1) + ' %', false)}
          ${row('Reseñas graves', sA.graves, sB.graves, v => v, false)}
          ${row('Respuesta del propietario', sA.resp, sB.resp, v => Math.round(v) + ' %', true)}
        </section>

        <section class="cmp-card">
          <h2 class="cmp-h">Los últimos 12 meses <span class="cmp-hint">clic en un mes para verlo</span></h2>
          <div class="chart-wrap cmp-chart"><div id="cmpDuelChart" style="width:100%;height:100%"></div></div>
        </section>

        <section class="cmp-card">
          <h2 class="cmp-h">A qué hora se quejan <span class="cmp-hint">quejas de 1–2★, últimos 12 meses, hora local</span></h2>
          <p class="story-line story-line--sm" id="cmpHourStory"></p>
          <div class="chart-wrap cmp-chart"><div id="cmpHourChart" style="width:100%;height:100%"></div></div>
        </section>
      </div>`;

    requestAnimationFrame(() => {
      const cA = this.COLOR_A(), cB = this.COLOR_B();
      EtoileCharts.compareDuel(document.getElementById('cmpDuelChart'), span.map(s => s.label), vA, vB,
        { nameA: metaA.nombre, nameB: metaB.nombre, colorA: cA, colorB: cB },
        i => { DataLoader.setMonth(span[i].y, span[i].m); this.render({ a: metaA.id, b: metaB.id }); });
      const hA = Patterns.hourly(Patterns.collect(y, m, 12, r => this._same(r, metaA.id)));
      const hB = Patterns.hourly(Patterns.collect(y, m, 12, r => this._same(r, metaB.id)));
      const hs = document.getElementById('cmpHourStory');
      const hl = (h, n) => `${n}: ${Patterns.headline(h).text}`;
      if (hs) hs.innerHTML = `${escapeHtml(hl(hA, metaA.nombre))}<br>${escapeHtml(hl(hB, metaB.nombre))}`;
      EtoileCharts.compareHours(document.getElementById('cmpHourChart'), hA, hB, { nameA: metaA.nombre, nameB: metaB.nombre, colorA: cA, colorB: cB });
      initReveal();
    });
    this.enlazaElige();
  },

  /** Selector de sucursal: abrir, buscar, moverse con flechas, elegir con Enter o clic, cerrar con Esc o clic fuera */
  enlazaElige() {
    const cierra = (sel, foco) => { const l = sel.querySelector('.cmp-lista'), bt = sel.querySelector('.cmp-elige'); if (l.hidden) return; l.hidden = true; bt.setAttribute('aria-expanded', 'false'); if (foco) bt.focus(); };
    const visibles = sel => [...sel.querySelectorAll('.cmp-op')].filter(o => !o.hidden);
    document.querySelectorAll('.cmp-sel[data-lado]').forEach(sel => {
      const bt = sel.querySelector('.cmp-elige'), l = sel.querySelector('.cmp-lista'), q = sel.querySelector('.cmp-busca'), nada = sel.querySelector('.cmp-nada');
      const abre = () => {
        document.querySelectorAll('.cmp-sel[data-lado]').forEach(o => o !== sel && cierra(o));
        l.hidden = false; bt.setAttribute('aria-expanded', 'true'); q.value = ''; filtra();
        const act = sel.querySelector('.cmp-op[aria-selected="true"]'); if (act) act.scrollIntoView({ block: 'nearest' });
        q.focus();
      };
      const filtra = () => {
        const t = q.value.trim().toLowerCase();
        sel.querySelectorAll('.cmp-grupo').forEach(g => { let n = 0; g.querySelectorAll('.cmp-op').forEach(o => { o.hidden = !!t && !o.dataset.busca.includes(t); if (!o.hidden) n++; }); g.hidden = !n; });
        nada.hidden = visibles(sel).length > 0;
      };
      const elige = id => { const s = sel.querySelector('select'); cierra(sel, true); if (s.value !== id) { s.value = id; this.onSelectChange(); } };
      bt.addEventListener('click', () => (l.hidden ? abre() : cierra(sel, true)));
      bt.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); abre(); } });
      q.addEventListener('input', filtra);
      q.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); const v = visibles(sel); if (v[0]) v[0].focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); const v = visibles(sel); if (v.length === 1) elige(v[0].dataset.id); }
        else if (e.key === 'Escape') cierra(sel, true);
      });
      sel.querySelectorAll('.cmp-op').forEach(o => {
        o.addEventListener('click', () => elige(o.dataset.id));
        o.addEventListener('keydown', e => {
          const v = visibles(sel), i = v.indexOf(o);
          if (e.key === 'ArrowDown') { e.preventDefault(); (v[i + 1] || v[i]).focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); i > 0 ? v[i - 1].focus() : q.focus(); }
          else if (e.key === 'Escape') cierra(sel, true);
          else if (e.key === 'Tab') cierra(sel);
        });
      });
    });
    if (!this._fuera) {
      this._fuera = e => document.querySelectorAll('.cmp-sel[data-lado]').forEach(sel => { if (!sel.contains(e.target)) cierra(sel); });
      document.addEventListener('pointerdown', this._fuera);
    }
  },

  onSelectChange() {
    const a = document.getElementById('compareSelectA'), b = document.getElementById('compareSelectB');
    if (a && b) window.location.hash = `#/comparar?a=${encodeURIComponent(a.value)}&b=${encodeURIComponent(b.value)}`;
  },

  swap() {
    if (this.branchA && this.branchB) window.location.hash = `#/comparar?a=${encodeURIComponent(this.branchB)}&b=${encodeURIComponent(this.branchA)}`;
  }
};
