/**
 * incidents.js — Seguimiento de incidencias por reseña (pilar F): de la alerta a la acción.
 * Estados: nueva → en revisión → respondida → resuelta. Cada cambio queda en una bitácora (quién, cuándo, qué).
 * Tabla: supabase_incidents.sql. Si la tabla aún no existe, el módulo se apaga solo y la interfaz no muestra nada.
 *
 * Activo desde 2.0.0-beta.8 (tabla creada). Con `ENABLED = false` no pide la tabla ni muestra botones.
 * Permisos (iguales a la RLS de supabase_incidents.sql): todos ven las de su alcance; zonal y corporativo abren/actualizan
 * cualquiera que ven; el gerente solo las de su tienda (canEdit).
 */
const Incidents = {
  ENABLED: true,
  TABLE: 'review_incidents',
  STATUS: [
    { id: 'nueva', label: 'Nueva' },
    { id: 'en_revision', label: 'En revisión' },
    { id: 'respondida', label: 'Respondida' },
    { id: 'resuelta', label: 'Resuelta' }
  ],
  available: null,            // null = aún no se sabe · true / false
  byReview: new Map(),        // review_id → incidencia
  _seen: new Map(),           // review_id → reseña (las que ya se pintaron), para abrir su detalle
  _loadedAt: 0,

  label(status) { return (this.STATUS.find(s => s.id === status) || this.STATUS[0]).label; },
  reset() { this.byReview = new Map(); this._seen = new Map(); this.available = null; this._loadedAt = 0; },

  /** Trae las incidencias visibles para el usuario (la propia RLS recorta por alcance) */
  async load(force = false) {
    if (!this.ENABLED) { this.available = false; return false; }
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
    if (!force && this.available !== null && Date.now() - this._loadedAt < 60000) return this.available;
    try {
      const { data, error } = await supabaseClient.from(this.TABLE).select('*');
      if (error) {
        // Tabla inexistente (aún no se corrió el SQL) o sin permiso: el seguimiento queda apagado
        this.available = false;
        if (error.code !== 'PGRST205' && error.code !== '42P01') console.warn('[Incidents] No disponible:', error.message);
        return false;
      }
      this.byReview = new Map((data || []).map(r => [r.review_id, r]));
      this.available = true;
      this._loadedAt = Date.now();
      return true;
    } catch (e) {
      this.available = false;
      return false;
    }
  },

  get(reviewId) { return this.byReview.get(reviewId) || null; },
  /** ¿Puede quien está en sesión abrir/actualizar la incidencia de esta reseña? (espejo de editable_location_ids()) */
  canEdit(r) {
    if (typeof AppAuth === 'undefined' || !r) return false;
    const role = AppAuth.getUserRole();
    if (role === 'gerente') { const mine = AppAuth.getUserSucursal(); return !!mine && isSameBranch(r.sucursal, mine); }
    return ['corporate', 'admin', 'regional', 'zonal'].includes(role);
  },
  isResolved(r) { const i = r && this.byReview.get(r.id); return !!(i && i.status === 'resuelta'); },
  /** Quita de una lista las reseñas ya resueltas (la "Atención inmediata" no debe insistir en lo que ya se atendió) */
  unresolved(list) { return this.available ? list.filter(r => !this.isResolved(r)) : list; },
  open(filter = () => true) {
    return [...this.byReview.values()].filter(i => i.status !== 'resuelta' && filter(i));
  },

  /** Botón o estado que se coloca en la tarjeta de una queja */
  badgeHtml(r, { critical = false, variant = 'full' } = {}) {
    if (!this.available || !r || !r.id || r.stars > 2) return '';
    this._seen.set(r.id, r);
    const id = escapeHtml(r.id);
    const rec = this.byReview.get(r.id);
    if (rec) {
      return `<button type="button" class="rv-incident rv-incident--${rec.status}" onclick="event.stopPropagation(); Incidents.openDrawer('${id}')">${escapeHtml(this.label(rec.status))}${rec.owner ? ` · ${escapeHtml(rec.owner)}` : ''}</button>`;
    }
    if (this.canEdit(r) && (critical || variant === 'full')) {
      return `<button type="button" class="rv-incident rv-incident--none" onclick="event.stopPropagation(); Incidents.openDrawer('${id}')">Dar seguimiento</button>`;
    }
    return '';
  },

  async _insert(r, patch, note) {
    const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
    const by = (typeof AppAuth !== 'undefined' && AppAuth.profile && AppAuth.profile.nombre) || 'Usuario';
    const status = patch.status || 'nueva';
    const row = {
      review_id: r.id,
      location_id: meta ? meta.id : r.sucursal,
      status,
      owner: patch.owner || null,
      severity: (typeof Severity !== 'undefined' && Severity.isCritical(r)) ? 'grave' : 'queja',
      history: [{ at: new Date().toISOString(), by, status, owner: patch.owner || null, note: note || 'Incidencia abierta' }]
    };
    if (status === 'resuelta') row.resolved_at = new Date().toISOString();
    const { data, error } = await supabaseClient.from(this.TABLE).insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async _update(rec, patch, note) {
    const by = (typeof AppAuth !== 'undefined' && AppAuth.profile && AppAuth.profile.nombre) || 'Usuario';
    const status = patch.status || rec.status;
    const owner = patch.owner !== undefined ? (patch.owner || null) : rec.owner;
    const entry = { at: new Date().toISOString(), by, status, owner, note: note || '' };
    const upd = { status, owner, history: [...(rec.history || []), entry] };
    if (status === 'resuelta' && !rec.resolved_at) upd.resolved_at = entry.at;
    if (status !== 'resuelta') upd.resolved_at = null;
    const { data, error } = await supabaseClient.from(this.TABLE).update(upd).eq('id', rec.id).select().single();
    if (error) throw error;
    return data;
  },

  /** Crea la incidencia si no existe o la actualiza; deja la bitácora al día. Devuelve la incidencia guardada */
  async save(r, patch, note = '') {
    const rec = this.byReview.get(r.id);
    const saved = rec ? await this._update(rec, patch, note) : await this._insert(r, patch, note);
    this.byReview.set(r.id, saved);
    return saved;
  },

  _reviewIndex() {
    const idx = new Map(this._seen);
    if (typeof DataLoader !== 'undefined') {
      for (const key in DataLoader.cache) {
        if (!/^\d{4}-\d{2}$/.test(key)) continue;
        const d = DataLoader.cache[key];
        if (d && d.reviews) for (const r of d.reviews) if (!idx.has(r.id)) idx.set(r.id, r);
      }
    }
    return idx;
  },

  /* ── Interfaz ── */

  _statusChips(current) {
    return this.STATUS.map(s => `<button type="button" class="inc-chip inc-chip--${s.id}${s.id === current ? ' active' : ''}" data-status="${s.id}" onclick="Incidents._pick(this)">${s.label}</button>`).join('');
  },
  _pick(btn) {
    btn.parentElement.querySelectorAll('.inc-chip').forEach(b => b.classList.toggle('active', b === btn));
  },
  _historyHtml(rec) {
    const h = [...((rec && rec.history) || [])].reverse();
    if (!h.length) return '<p class="drawer-empty">Aún no hay movimientos.</p>';
    return h.map(e => `
      <li class="inc-event">
        <span class="inc-event-dot inc-chip--${e.status}"></span>
        <div><strong>${escapeHtml(this.label(e.status))}</strong>${e.owner ? ` · ${escapeHtml(e.owner)}` : ''}
          <time>${typeof BranchTime !== 'undefined' ? BranchTime.label(e.at, null, 'long') : e.at} · ${escapeHtml(e.by || '')}</time>
          ${e.note ? `<p>${escapeHtml(e.note)}</p>` : ''}</div>
      </li>`).join('');
  },

  openDrawer(reviewId) {
    const r = this._reviewIndex().get(reviewId);
    if (!r) return;
    const rec = this.byReview.get(reviewId);
    const form = this.canEdit(r) ? `
      <div class="inc-form" id="incForm" data-rid="${escapeHtml(reviewId)}">
        <div class="inc-label">Estado</div>
        <div class="inc-chips" id="incChips">${this._statusChips(rec ? rec.status : 'nueva')}</div>
        <label class="inc-label" for="incOwner">Responsable</label>
        <input id="incOwner" class="inc-input" type="text" maxlength="80" placeholder="¿Quién le da seguimiento?" value="${escapeHtml((rec && rec.owner) || '')}">
        <label class="inc-label" for="incNote">Nota</label>
        <textarea id="incNote" class="inc-input" rows="3" maxlength="500" placeholder="¿Qué se hizo o qué sigue?"></textarea>
        <button type="button" class="inc-save" id="incSave" onclick="Incidents.submit('${escapeHtml(reviewId)}')">${rec ? 'Guardar seguimiento' : 'Abrir incidencia'}</button>
        <p class="inc-msg" id="incMsg" role="status"></p>
      </div>` : `<p class="inc-readonly">Solo la tienda, su zonal o corporativo actualizan esta incidencia.${rec ? ` Estado: <strong>${escapeHtml(this.label(rec.status))}</strong>${rec.owner ? ` · ${escapeHtml(rec.owner)}` : ''}.` : ''}</p>`;
    const body = `
      ${ReviewCard.html(r, { variant: 'full', index: 0, noIncident: true })}
      ${form}
      <div class="inc-label">Bitácora</div>
      <ul class="inc-history" id="incHistory">${this._historyHtml(rec)}</ul>`;
    Drawer.show({ id: 'incidentDrawer', title: 'Seguimiento de incidencia', subtitle: rec ? `Abierta ${BranchTime.label(rec.opened_at, null, 'long')}` : 'Aún sin seguimiento', bodyHtml: body });
  },

  async submit(reviewId) {
    const r = this._reviewIndex().get(reviewId);
    const form = document.getElementById('incForm');
    if (!r || !form) return;
    const status = (form.querySelector('.inc-chip.active') || {}).dataset.status || 'nueva';
    const owner = document.getElementById('incOwner').value.trim();
    const note = document.getElementById('incNote').value.trim();
    const btn = document.getElementById('incSave'); const msg = document.getElementById('incMsg');
    btn.disabled = true; msg.textContent = 'Guardando…'; msg.className = 'inc-msg';
    const wasResolved = this.isResolved(r);
    try {
      const saved = await this.save(r, { status, owner }, note);
      msg.textContent = 'Guardado ✓'; msg.className = 'inc-msg ok';
      Drawer.update('incidentDrawer', { subtitle: `Abierta ${BranchTime.label(saved.opened_at, null, 'long')}` });
      document.getElementById('incHistory').innerHTML = this._historyHtml(saved);
      document.getElementById('incNote').value = '';
      btn.textContent = 'Guardar seguimiento';
      this.refreshBadges(reviewId);
      if (status === 'resuelta' && !wasResolved) this._stamp(reviewId);
    } catch (e) {
      msg.textContent = 'No se pudo guardar. Revisa tu conexión o tus permisos.'; msg.className = 'inc-msg err';
      console.warn('[Incidents] Error al guardar:', e && e.message);
    } finally { btn.disabled = false; }
  },

  /** Al cerrar una incidencia nace una Rosa (llega → brilla, con el resorte de la marca) y queda «Atendida».
   *  Entra una vez en el formulario; con reduced-motion aparece ya abierta */
  doneHtml() {
    return `<div class="inc-done" role="status">${Rosa.anim(Rosa.estadoDe('brilla'), { size: 30, R: 40 })}<span>Atendida</span></div>`;
  },
  _stamp(reviewId) {
    const form = document.getElementById('incForm');
    if (form && !form.querySelector('.inc-done')) form.insertAdjacentHTML('afterbegin', this.doneHtml());
    document.querySelectorAll(`.rv-card[data-rid="${CSS.escape(reviewId)}"] .rv-incident--resuelta`).forEach(b => b.classList.add('rv-incident--stamped'));
  },

  /** Actualiza en sitio el estado visible en las tarjetas de esa reseña; si quedó resuelta, la saca de "Atención inmediata" */
  refreshBadges(reviewId) {
    const r = this._seen.get(reviewId) || this._reviewIndex().get(reviewId);
    if (!r) return;
    const crit = typeof Severity !== 'undefined' && Severity.isCritical(r);
    document.querySelectorAll('.rv-card').forEach(card => {
      if (card.dataset.rid !== reviewId) return;
      const slot = card.querySelector('.rv-inc-slot');
      if (slot) slot.innerHTML = this.badgeHtml(r, { critical: crit, variant: card.classList.contains('rv-card--compact') ? 'compact' : 'full' });
    });
    if (this.isResolved(r)) {
      document.querySelectorAll('.attn .rv-card').forEach(card => { if (card.dataset.rid === reviewId) card.remove(); });
      document.querySelectorAll('.attn').forEach(a => { if (!a.querySelector('.rv-card')) a.remove(); });
    }
  },

  /** Lista de incidencias abiertas (no resueltas); `scope` filtra por sucursal o región */
  openList(title = 'Incidencias en seguimiento', filter = () => true) {
    const idx = this._reviewIndex();
    const items = this.open(filter).sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));
    const body = items.length
      ? items.map((i, n) => { const r = idx.get(i.review_id); return r ? ReviewCard.html(r, { variant: 'full', index: n, onclick: `Incidents.openDrawer('${escapeHtml(r.id)}')` }) : ''; }).join('')
      : '<p class="drawer-empty">No hay incidencias abiertas. ✅</p>';
    Drawer.open({ id: 'incidentList', title, subtitle: `${items.length} abierta${items.length === 1 ? '' : 's'} · toca una para ver su bitácora`, bodyHtml: body });
  }
};
