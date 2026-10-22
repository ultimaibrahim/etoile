/**
 * views/not-found.js — Vista 404 SPA (Ruta o sucursal no encontrada) y 403 (Acceso restringido).
 */

const NotFoundView = {
  render(params = {}) {
    Charts.destroyAll();
    const hash = window.location.hash || '';
    const isForbidden = params.type === 'forbidden';
    const authenticated = typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated();

    const title = isForbidden ? 'Acceso Restringido' : 'Página no encontrada';
    const subtitle = isForbidden 
      ? (authenticated ? '403 · Permisos Insuficientes' : '403 · Requiere Inicio de Sesión')
      : '404 · Ruta no disponible';
      
    const description = isForbidden
      ? (authenticated
          ? (params.message || 'Tu rol operativo actual no cuenta con permisos para consultar la información de esta región o módulo.')
          : 'Esta sección está reservada para personal autorizado de Grupo MYT. Inicia sesión con tus credenciales operativas para acceder.')
      : (authenticated
          ? `La dirección <code>${escapeHtml(hash)}</code> no existe o cambió de lugar dentro de Étoile.`
          : `La dirección solicitada no existe dentro del sistema o requiere credenciales de acceso activas.`);

    // Topbar condicional: Si no está autenticado, no expone enlaces a módulos privados
    const topbarHtml = authenticated && typeof buildTopbar === 'function'
      ? buildTopbar(false)
      : `
        <header class="topbar">
          <div class="topbar-left">
            <a href="${authenticated ? '#/' : '#/login'}" class="topbar-brand"><span class="accent">étoile</span></a>
          </div>
          <div class="topbar-right">
            <div class="topbar-actions">
              <button class="dark-toggle" onclick="toggleDark()" aria-label="Cambiar tema">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              </button>
            </div>
          </div>
        </header>
      `;

    // Botones de acción según estado de sesión
    const actionButtons = authenticated
      ? `
        <a href="#/" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; background: var(--verde); color: var(--sobre-acento); font-size: 13px; font-weight: 700; text-decoration: none;">
          <span>← Volver al Inicio</span>
        </a>
        ${isForbidden ? '' : `
          <a href="#/acerca" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font-size: 13px; font-weight: 600; text-decoration: none;">
            <span>Cómo funciona Étoile</span>
          </a>
        `}
      `
      : `
        <a href="#/login" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; background: var(--verde); color: var(--sobre-acento); font-size: 13px; font-weight: 700; text-decoration: none;">
          <span>Iniciar Sesión</span>
        </a>
        <a href="#/privacidad" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font-size: 13px; font-weight: 600; text-decoration: none;">
          <span>Aviso de Privacidad</span>
        </a>
      `;

    document.getElementById('app').innerHTML = `
      ${topbarHtml}
      <section class="section" style="max-width: 640px; margin: 40px auto; padding: 0 20px;">
        <div class="access-denied-wrapper" style="padding: 44px 32px;">
          <div class="ad-icon-wrap" style="background: ${isForbidden ? 'rgba(198, 40, 40, 0.12)' : 'rgba(184, 144, 47, 0.12)'}; color: ${isForbidden ? 'var(--alerta-ink)' : 'var(--oro)'};">
            ${isForbidden ? `
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            ` : `
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            `}
          </div>
          <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${isForbidden ? 'var(--alerta-ink)' : 'var(--oro)'}; display: block; margin-bottom: 8px;">
            ${subtitle}
          </span>
          <h1 style="font-family: var(--serif); font-size: clamp(26px, 5vw, 36px); color: var(--text); margin-bottom: 12px; line-height: 1.2;">
            ${title}
          </h1>
          <p style="font-size: 14.5px; color: var(--text-muted); line-height: 1.6; margin-bottom: 28px;">
            ${description}
          </p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            ${actionButtons}
          </div>
        </div>
      </section>
    `;

    requestAnimationFrame(() => {
      if (typeof initReveal === 'function') initReveal();
    });
  }
};
