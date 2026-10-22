/**
 * components/hour-drawer.js — De la gráfica a las reseñas: abre en el Drawer único las quejas de una hora.
 * Cierra el círculo del storytelling: el titular dice "ahí se concentra el problema" y un clic muestra qué pasó.
 */
const HourDrawer = {
  /** @param {number} hour 0-23  @param {object} h resultado de Patterns.hourly  @param {string} scope sucursal o región */
  open(hour, h, scope = '') {
    const list = [...(h.negReviews[hour] || [])].sort((a, b) => Date.parse(b.publishedAtDate) - Date.parse(a.publishedAtDate));
    if (list.length === 0) return;
    const pad = Patterns.pad;
    const total = h.tot[hour];
    const graves = Severity.criticalIn(list).length;
    Drawer.open({
      id: 'hourDrawer',
      title: `Quejas de las ${pad(hour)}:00 a las ${pad(hour)}:59`,
      subtitle: `${escapeHtml(scope)} · ${list.length} ${list.length === 1 ? 'queja' : 'quejas'} de ${total} reseñas con texto en esa hora${graves ? ` · <strong>${graves} grave${graves === 1 ? '' : 's'}</strong>` : ''} · últimos 12 meses`,
      bodyHtml: ReviewCard.list(list)
    });
  }
};
