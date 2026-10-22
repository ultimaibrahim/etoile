/**
 * components/attention-card.js — "Atención inmediata": las reseñas graves recientes, arriba y a la vista.
 * Solo aparece cuando hay al menos una (si no, la pantalla se queda tranquila). Las reglas viven en Severity.
 */
const AttentionCard = {
  MAX_INLINE: 3,
  _lists: {},
  _filters: {},

  openFollowUp(key) {
    Incidents.openList('Incidencias en seguimiento', this._filters[key] || (() => true));
  },

  /** @param {Array} criticals reseñas críticas (más reciente primero)  @param {{key: string, scope: string}} opts */
  html(criticals, { key = 'attn', scope = '', incidentFilter = () => true } = {}) {
    const openInc = (typeof Incidents !== 'undefined' && Incidents.available) ? Incidents.open(incidentFilter).length : 0;
    this._filters[key] = incidentFilter;
    if (!criticals || criticals.length === 0) {
      // Sin graves nuevas, pero con incidencias abiertas: una franja discreta mantiene el seguimiento a la vista
      return openInc ? `<div class="attn-strip r"><span class="attn-strip-dot"></span>${openInc} incidencia${openInc !== 1 ? 's' : ''} en seguimiento${scope ? ` · ${escapeHtml(scope)}` : ''}<button class="show-all-btn-link" onclick="AttentionCard.openFollowUp('${key}')">Ver seguimiento →</button></div>` : '';
    }
    this._lists[key] = criticals;
    const shown = criticals.slice(0, this.MAX_INLINE);
    const n = criticals.length;
    return `
      <section class="attn r" aria-label="Atención inmediata">
        <div class="attn-head">
          <span class="attn-pulse" aria-hidden="true"></span>
          <div>
            <h2 class="attn-title">Atención inmediata</h2>
            <p class="attn-sub">${n} reseña${n !== 1 ? 's' : ''} grave${n !== 1 ? 's' : ''} en los últimos ${Severity.RECENT_DAYS} días${scope ? ` · ${escapeHtml(scope)}` : ''}</p>
          </div>
          ${openInc ? `<button class="show-all-btn-link" onclick="AttentionCard.openFollowUp('${key}')">Seguimiento (${openInc}) →</button>` : ''}
          ${n > this.MAX_INLINE ? `<button class="show-all-btn-link" onclick="AttentionCard.openAll('${key}')">Ver las ${n} →</button>` : ''}
        </div>
        <div class="attn-grid">
          ${shown.map((r, i) => ReviewCard.html(r, { variant: 'compact', index: i, onclick: `AttentionCard.openAll('${key}')` })).join('')}
        </div>
      </section>`;
  },

  openAll(key) {
    const list = this._lists[key] || [];
    Drawer.open({
      id: 'attnDrawer',
      title: 'Reseñas graves',
      subtitle: `Marcadas por reglas explícitas (salud, plagas, objetos, acoso, cobro, trato…). Últimos ${Severity.RECENT_DAYS} días.`,
      bodyHtml: ReviewCard.list(list)
    });
  }
};
