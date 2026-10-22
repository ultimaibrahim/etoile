/**
 * briefing.js — El briefing de turno: lo primero que lee cada rol (titular por reglas + lo que sigue abierto).
 * La lógica del texto vive en Narrative (pura y con pruebas); aquí se le da forma, enlaces y el listado "Por atender".
 * Queja pendiente = queja (1–2★ con texto, Metrics) sin respuesta del propietario.
 */
const Briefing = {
  MAX_ROWS: 4,
  WINDOW_DAYS: 30,   // una queja sin respuesta de hace más de un mes ya no es del turno: se deja de listar
  _rows: [],

  ageDays(r) { const t = Date.parse(r && r.publishedAtDate); return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000)); },
  branchName(r) { const m = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null; return m ? m.nombre : (r.sucursal || ''); },

  /** Quejas sin responder (últimos WINDOW_DAYS días) de las sucursales dadas: graves primero, luego la más antigua */
  pending(branchIds, months = 2) {
    const now = BranchTime.nowMonth();
    const mine = r => branchIds.some(id => isSameBranch(r.sucursal, id));
    return Metrics.unrepliedComplaints(Patterns.collect(now.y, now.m, months, mine))
      .filter(r => this.ageDays(r) <= this.WINDOW_DAYS)
      // Las graves primero (Severity); entre iguales, la más antigua: lleva más tiempo esperando
      .sort((a, b) => (Severity.isCritical(b) - Severity.isCritical(a)) || (Date.parse(a.publishedAtDate) - Date.parse(b.publishedAtDate)));
  },

  /** Sucursales que piden atención: quejas sin respuesta o, con muestra suficiente, bajo la meta; las más urgentes primero */
  attention(branches, pendingReviews, goal) {
    const out = [];
    for (const b of branches) {
      const unreplied = pendingReviews.filter(r => isSameBranch(r.sucursal, b.id)).length;
      const below = b.count >= Narrative.MIN_SAMPLE && b.avg < goal;
      if (unreplied || below) out.push({ id: b.id, nombre: b.nombre, avg: b.avg, count: b.count, unreplied });
    }
    return out.sort((a, b) => b.unreplied - a.unreplied || a.avg - b.avg);
  },

  /**
   * Nota de "última sincronización con Google" (Narrative.syncNote) en el elemento dado.
   * Alcance: la marca (sin región), una región o una sucursal. Si la consulta falla (p. ej. la columna
   * gbp_synced_at aún no existe) o no hay marcas, la nota queda oculta.
   */
  async fillSyncNote(elId, region = null, branchId = null) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
      let q = supabaseClient.from('locations').select('id, nombre, gbp_synced_at').eq('active', true).not('gbp_location_id', 'is', null);
      if (region) q = q.eq('region', region);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []).filter(l => !branchId || isSameBranch(l.id, branchId))
        .map(l => { const m = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(l.id) : null; return { nombre: m ? m.nombre : l.nombre, at: l.gbp_synced_at }; });
      const note = Narrative.syncNote(rows, Date.now());
      const el = document.getElementById(elId);   // se busca después de la consulta: la vista pudo cambiar
      if (!note || !el) return;
      el.textContent = note.text;
      el.classList.toggle('stale', note.stale);
      el.hidden = false;
    } catch (e) {
      console.warn('[Briefing] Sin nota de sincronización:', e.message || e);
    }
  },

  /** Segmentos del titular → HTML (cifras destacadas, sucursales y pendientes clicables) */
  headline(segments, evHandler = id => `Briefing.openFor('${id}')`) {
    return segments.map(s => {
      const v = escapeHtml(s.v);
      if (s.k === 'n') return `<span class="brf-n">${v}</span>`;
      if (s.k === 'good') return `<span class="brf-good">${v}</span>`;
      if (s.k === 'ev') return `<button class="brf-ev" onclick="${escapeHtml(evHandler(s.id || ''))}">${v}</button>`;
      return v;
    }).join('');
  },

  /** Lista "Por atender" (hasta MAX_ROWS) para colocarla bajo el hero.
   *  brillo (DataLoader.brillo): si se pasa, cada fila lleva la Rosa de su tienda con estado y señal (Pendientes, marca.md) */
  rowsHtml(pendingReviews, scopeIds, brillo = null) {
    this._rows = pendingReviews; this._scope = scopeIds;
    if (!pendingReviews.length) return '';
    const rows = pendingReviews.slice(0, this.MAX_ROWS).map((r, i) => {
      const d = this.ageDays(r), grave = Severity.isCritical(r);
      const snip = escapeHtml((r.text || '').trim().replace(/\s+/g, ' ').slice(0, 150));
      const m = brillo && typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null, br = m && brillo[m.id];
      const rosa = br ? Rosa.html(Rosa.deTienda(br.estado, br.senal, br.inicio), { size: 20, label: br.lectura, cls: 'brf-rosa' }) : '';
      return `<button class="brf-row" onclick="Briefing.openReview(${i})">
        <span class="brf-age">${d === 0 ? 'hoy' : `hace ${d} ${d === 1 ? 'día' : 'días'}`}</span>
        <span class="brf-main">${rosa}<b>${escapeHtml(this.branchName(r))}</b>${br && br.senal ? `<i class="brf-brillo">${escapeHtml(br.lectura)}</i>` : ''}${grave ? '<i class="brf-grave">Grave</i>' : ''}<span class="brf-snip">${snip}${(r.text || '').length > 150 ? '…' : ''}</span></span>
        <span class="brf-st">${r.stars}★</span></button>`;
    }).join('');
    const more = pendingReviews.length > this.MAX_ROWS ? `<button class="show-all-btn-link" onclick="Briefing.openFor('')">Ver las ${pendingReviews.length} →</button>` : '';
    return `<section class="section brf-sec" id="porAtender"><div class="section-head"><div class="section-title">Por atender</div><span class="section-sub">Quejas sin respuesta de los últimos 30 días: las graves primero, luego la más antigua</span></div><div class="brf-list">${rows}</div>${more}</section>`;
  },

  openReview(i) {
    const r = this._rows[i]; if (!r) return;
    Drawer.open({ id: 'briefReview', title: this.branchName(r), subtitle: `${r.stars}★ · ${reviewWhen(r, 'long')}`, bodyHtml: ReviewCard.html(r, { showBranch: false }) });
  },

  /** Todas las quejas pendientes del alcance, o solo las de una sucursal */
  openFor(id) {
    const list = id ? this._rows.filter(r => isSameBranch(r.sucursal, id)) : this._rows;
    const m = id && typeof resolveBranchMeta === 'function' ? resolveBranchMeta(id) : null;
    Drawer.open({ id: 'briefAll', title: m ? m.nombre : 'Por atender', subtitle: `${list.length} ${list.length === 1 ? 'queja sin respuesta' : 'quejas sin respuesta'}`,
      bodyHtml: list.length ? ReviewCard.list(list, { showBranch: !m }) : '<p class="drawer-empty">Nada pendiente.</p>' });
  }
};
