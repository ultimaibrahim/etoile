/**
 * components/drawer.js — El drawer único de Étoile (panel lateral en escritorio, hoja inferior en móvil).
 * Es el mismo diseño del drawer del feed de reseñas, convertido en componente para que TODA ventana
 * secundaria (feed, detalle, incidencias, estrellas, problemas, panel corporativo) se vea y se comporte igual.
 * Se apoya en ModalManager: Esc, botón "atrás" del celular, bloqueo de scroll y devolución del foco.
 */
const Drawer = {
  /**
   * @param {{id?: string, title: string, subtitle?: string, filtersHtml?: string, bodyHtml?: string,
   *          footerHtml?: string, backHtml?: string, bodyId?: string, onClose?: Function}} o
   * @returns {{overlay: HTMLElement, body: HTMLElement}}
   */
  open({ id = 'appDrawer', title, subtitle = '', filtersHtml = '', bodyHtml = '', footerHtml = '', backHtml = '', bodyId = null, onClose = null }) {
    const prev = document.getElementById(id);
    if (prev) prev.remove();
    const titleId = `${id}Title`;
    const bId = bodyId || `${id}Body`;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="sidebar-overlay drawer-overlay" id="${id}" onclick="if(event.target===this) Drawer.close('${id}')">
        <aside class="feed-sidebar drawer" aria-labelledby="${titleId}">
          <span class="drawer-grip" aria-hidden="true"></span>
          <div class="sidebar-header">
            ${backHtml}
            <div class="drawer-heading">
              <h2 class="sidebar-title" id="${titleId}">${title}</h2>
              ${subtitle ? `<p class="sidebar-subtitle">${subtitle}</p>` : ''}
            </div>
            <button class="sidebar-close" aria-label="Cerrar" onclick="Drawer.close('${id}')">×</button>
          </div>
          ${filtersHtml ? `<div class="sidebar-filters">${filtersHtml}</div>` : ''}
          <div class="sidebar-content" id="${bId}">${bodyHtml}</div>
          ${footerHtml ? `<div class="sidebar-footer">${footerHtml}</div>` : ''}
        </aside>
      </div>`);
    const overlay = document.getElementById(id);
    requestAnimationFrame(() => overlay.classList.add('active'));
    const done = () => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('active'); setTimeout(() => el.remove(), 300); }
      if (onClose) onClose();
    };
    if (typeof ModalManager !== 'undefined') ModalManager.open(overlay, done);
    return { overlay, body: document.getElementById(bId) };
  },

  /** Cambia el contenido de un drawer ya abierto (drill-down dentro del mismo panel, sin cerrar ni reabrir) */
  update(id, { title, subtitle, filtersHtml, bodyHtml, footerHtml, backHtml } = {}) {
    const o = document.getElementById(id);
    if (!o) return false;
    const aside = o.querySelector('.feed-sidebar');
    const header = o.querySelector('.sidebar-header');
    const heading = o.querySelector('.drawer-heading');
    if (title !== undefined) o.querySelector('.sidebar-title').innerHTML = title;
    if (subtitle !== undefined) {
      let sub = o.querySelector('.sidebar-subtitle');
      if (subtitle && !sub) { sub = document.createElement('p'); sub.className = 'sidebar-subtitle'; heading.appendChild(sub); }
      if (sub) { if (subtitle) sub.innerHTML = subtitle; else sub.remove(); }
    }
    if (backHtml !== undefined) {
      o.querySelectorAll('.drawer-back').forEach(b => b.remove());
      if (backHtml) heading.insertAdjacentHTML('beforebegin', backHtml);
    }
    const place = (cls, html, after) => {
      let el = o.querySelector('.' + cls);
      if (html === undefined) return;
      if (!html) { if (el) el.remove(); return; }
      if (!el) { el = document.createElement('div'); el.className = cls; after(el); }
      el.innerHTML = html;
    };
    place('sidebar-filters', filtersHtml, el => header.insertAdjacentElement('afterend', el));
    place('sidebar-footer', footerHtml, el => aside.appendChild(el));
    if (bodyHtml !== undefined) { const b = o.querySelector('.sidebar-content'); b.innerHTML = bodyHtml; b.scrollTop = 0; }
    return true;
  },

  /** Abre el drawer o, si ya existe con ese id, solo actualiza su contenido */
  show(opts) {
    if (!this.update(opts.id, opts)) this.open(opts);
  },

  /** Cierra todo lo abierto y navega a `hash` (sin que el retroceso del historial la deshaga) */
  navigate(hash) {
    if (typeof ModalManager !== 'undefined') ModalManager.closeAllThen(() => Router.navigate(hash));
    else Router.navigate(hash);
  },

  setBody(id, html) {
    const b = document.getElementById(`${id}Body`);
    if (b) { b.innerHTML = html; b.scrollTop = 0; }
  },

  close(id = 'appDrawer') {
    const top = typeof ModalManager !== 'undefined' ? ModalManager._stack[ModalManager._stack.length - 1] : null;
    if (top && top.el && top.el.id === id) { ModalManager.close(); return; }
    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); setTimeout(() => el.remove(), 300); }
  }
};
