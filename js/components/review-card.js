/**
 * components/review-card.js — La tarjeta de reseña única de Étoile.
 * Sustituye a las cuatro variantes anteriores (review-card, sidebar-review-card, review-item, modal-rev-card).
 * Muestra: sucursal, fecha y hora local en 24 h, estrellas, texto, respuesta del dueño y, si aplica, la insignia
 * "Crítica" con las razones (Severity) para que se entienda por qué se marcó.
 */
const ReviewCard = {
  /**
   * @param {object} r reseña (stars, text, publishedAtDate, sucursal, responseFromOwnerText)
   * @param {{variant?: 'full'|'compact', onclick?: string|Function, index?: number, showBranch?: boolean, noIncident?: boolean}} opts
   *   (onclick puede ser una función r => string; noIncident oculta el botón de seguimiento, p. ej. dentro del propio drawer de la incidencia)
   */
  html(r, { variant = 'full', onclick = '', index = 0, showBranch = true, noIncident = false } = {}) {
    const sev = (typeof Severity !== 'undefined') ? Severity.analyze(r) : { critical: false, reasons: [] };
    const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
    const branch = meta ? meta.abr : (r.sucursal || '');
    const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
    const iso = r.publishedAtDate || '';
    const isNeg = r.stars <= 2;
    const cls = ['rv-card', `rv-card--${variant}`, isNeg ? 'neg' : '', sev.critical ? 'crit' : ''].filter(Boolean).join(' ');
    const why = sev.critical
      ? sev.reasons.filter(x => x.id !== 'estrellas')
          .map(x => `<span class="rv-why-chip" title="${x.match ? escapeHtml(`Menciona «${x.match}»`) : escapeHtml(x.label)}">${escapeHtml(x.label)}</span>`).join('')
      : '';
    const oc = typeof onclick === 'function' ? onclick(r) : onclick;
    const inc = (!noIncident && typeof Incidents !== 'undefined') ? Incidents.badgeHtml(r, { critical: sev.critical, variant }) : '';
    const replyText = r.responseFromOwnerText || r.responseText || '';
    const hasReply = replyText.trim().length > 0;
    const reply = hasReply ? `<div class="rv-reply"><strong>Respuesta:</strong> “${escapeHtml(replyText)}”</div>` : '';
    // Una queja (≤ 3★) sin respuesta es una acción pendiente: se ve en cualquier pantalla donde aparezca la reseña
    const pending = (!hasReply && r.stars <= 3) ? '<span class="rv-pending">Sin respuesta</span>' : '';
    return `
      <article class="${cls}" data-rid="${escapeHtml(r.id || '')}" style="--i:${Math.min(index, 10)}"${oc ? ` onclick="${oc}" role="button" tabindex="0"` : ''}>
        <div class="rv-head">
          ${showBranch ? `<span class="rv-branch">${escapeHtml(branch)}</span>` : '<span></span>'}
          <time class="rv-time" datetime="${escapeHtml(iso)}">${reviewWhen(r, 'short')}</time>
        </div>
        <div class="rv-row">
          <span class="rv-stars" aria-label="${r.stars} de 5 estrellas">${stars}</span>
          ${sev.critical ? '<span class="rv-crit"><i class="rv-dot"></i>Grave</span>' : ''}
          ${pending}
        </div>
        ${why ? `<div class="rv-why">${why}</div>` : ''}
        <p class="rv-text">“${escapeHtml(r.text || '')}”</p>
        ${reply}
        ${!noIncident && r.stars <= 2 ? `<div class="rv-inc-slot">${inc}</div>` : ''}
      </article>`;
  },

  /** Lista de tarjetas con entrada escalonada */
  list(reviews, opts = {}) {
    return reviews.map((r, i) => this.html(r, { ...opts, index: i })).join('');
  }
};
