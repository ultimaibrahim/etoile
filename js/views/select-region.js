/**
 * views/select-region.js — Regiones (rol corporativo y zonal). Desde 2.1.0 (ronda 9): el saludo y el titular sobre la noche
 * que se funde con la página, y el catálogo de regiones: una lámina por región con su constelación real (las Rosas de sus
 * sucursales sobre sus pines), su puesto por brillo ajustado, promedio, evidencia y quejas; la otra vista es la tabla.
 * Debajo, «Por atender» y el acceso a Étoile Astra.
 */

const SelectRegionView = {
  selectedYear: null,
  selectedMonth: null,
  filterStatus: 'all', // 'all' | 'critical' | 'optimal'
  sortBy: 'urgency',  // 'urgency' | 'adjusted' | 'rating-desc' | 'rating-asc' | 'volume-desc' | 'delta-desc'
  // Catálogo: orden (puesto | urgencia | nombre) y vista (laminas | tabla); se recuerdan por persona en este navegador
  orden: (() => { try { return localStorage.getItem('etoile-regiones-orden') || 'puesto'; } catch (e) { return 'puesto'; } })(),
  vista: (() => { try { return localStorage.getItem('etoile-regiones-vista') || 'laminas'; } catch (e) { return 'laminas'; } })(),
  searchQuery: '',
  _documentClickBound: false,

  async render() {
    const app = document.getElementById('app');
    if (!app) return;

    // Verificar seguridad: solo roles de liderazgo pueden elegir región
    const role = AppAuth.getUserRole();
    if (!AppAuth.isAuthenticated()) {
      Router.navigate('#/login');
      return;
    }
    if (role === 'gerente') {
      Router.navigate('#/');
      return;
    }

    // Inicializar año y mes de forma 100% dinámica usando Date() y manifest
    if (!this.selectedYear || !this.selectedMonth) {
      const def = this.getDefaultPeriod();
      this.selectedYear = def.year;
      this.selectedMonth = def.month;
    }

    if (typeof DataLoader !== 'undefined') {
      DataLoader.setMonth(this.selectedYear, this.selectedMonth);
    }

    // Listener global para cerrar dropdowns al hacer clic fuera
    if (!this._documentClickBound) {
      this._documentClickBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
          document.querySelectorAll('.custom-select.open').forEach(d => d.classList.remove('open'));
        }
      });
    }

    // Inyectar estilos para esta pantalla si no se han cargado
    if (!document.getElementById('select-region-styles')) {
      const style = document.createElement('style');
      style.id = 'select-region-styles';
      style.textContent = `
        .srv-wrapper {
          min-height: 100vh;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 0 20px 60px 20px;
          box-sizing: border-box;
          overflow-y: auto;
        }
        /* El cielo va de lado a lado y se funde con la página (fundido A, ronda 8); el contenido sube un poco dentro */
        .srv-wrapper > .cg { margin: 0 -20px; width: calc(100% + 40px); }
        .srv-wrapper > .srv-container { margin-top: -44px; position: relative; z-index: 1; }
        .srv-container {
          width: 100%;
          max-width: 1120px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: srvEntrance 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transition: transform 0.4s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.4s ease;
        }
        .srv-container.exit-transition {
          transform: scale(0.94);
          opacity: 0;
        }
        @keyframes srvEntrance {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── SECCIÓN EXPLORAR REGIONES & TOOLBAR COMPACTO ── */
        .srv-section-box {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
        }
        .srv-brand { align-self: flex-start; text-decoration: none; line-height: 1; margin-bottom: -6px; }
        .srv-brand .accent { font-family: var(--giaza); font-size: 30px; letter-spacing: .02em; color: var(--verde); }
        [data-theme="dark"] .srv-brand .accent { color: var(--text); }
        .srv-header-row {
          display: flex;
          justify-content: center;
          align-items: center;
          text-align: center;
          width: 100%;
        }
        .srv-header-text {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 6px;
        }
        .srv-title {
          font-family: var(--serif);
          font-size: 38px;
          color: var(--text);
          margin: 0;
          font-weight: 400;
          letter-spacing: 0.01em;
          line-height: 1.1;
        }
        .srv-subtitle {
          font-size: 14px;
          color: var(--text-dim);
          max-width: 580px;
          line-height: 1.4;
          margin: 0;
        }
        .srv-filter-badge {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          color: var(--oro-ink);
          background: rgba(184, 144, 47, 0.12);
          border: 1px solid rgba(184, 144, 47, 0.25);
          padding: 3px 10px;
          border-radius: 20px;
        }

        /* ── TOOLBAR DE CONTROLES COMPACTO ── */
        .srv-toolbar {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          box-shadow: var(--sombra-card);
          box-sizing: border-box;
          width: 100%;
        }

        .srv-compact-select {
          position: relative;
          flex: 1 1 140px;
          min-width: 130px;
        }
        .srv-compact-select .custom-select-trigger {
          width: 100%;
          padding: 8px 12px;
          font-size: 12.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--surface-2);
          color: var(--text);
          cursor: pointer;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .srv-compact-select .custom-select-trigger:hover {
          border-color: var(--border-strong);
          background: var(--surface);
        }
        .srv-compact-select.open .custom-select-trigger {
          border-color: var(--oro);
          box-shadow: 0 0 0 3px rgba(184, 144, 47, 0.15);
        }
        .srv-compact-select .custom-select-options {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 100%;
          min-width: 190px;
          max-height: 260px;
          overflow-y: auto;
          z-index: 2000;
          background: #FAF6F0;
          border: 1.5px solid var(--border-strong);
          border-radius: var(--radius-sm);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.08);
          display: none;
          padding: 6px;
          box-sizing: border-box;
        }
        [data-theme="dark"] .srv-compact-select .custom-select-options {
          background: #1C2220;
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
        }
        .srv-compact-select.open .custom-select-options {
          display: block;
        }
        .srv-compact-select .custom-option {
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #2D3748;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          margin-bottom: 2px;
        }
        [data-theme="dark"] .srv-compact-select .custom-option {
          color: #E2E8F0;
        }
        .srv-compact-select .custom-option:hover {
          background: rgba(61, 90, 71, 0.1);
          color: var(--verde-deep);
        }
        [data-theme="dark"] .srv-compact-select .custom-option:hover {
          background: rgba(184, 144, 47, 0.15);
          color: var(--text);
        }
        .srv-compact-select .custom-option.active {
          font-weight: 700;
          color: var(--sobre-acento) !important;
          background: var(--verde) !important;
          box-shadow: 0 2px 8px rgba(61, 90, 71, 0.25);
        }
        [data-theme="dark"] .srv-compact-select .custom-option.active {
          background: var(--oro) !important;
          color: #1A1A1A !important;
        }

        /* ── CONTROLES STEPPER 1-CLIC Y GRID DE MESES 4x3 ── */
        .srv-stepper-wrap {
          display: flex;
          align-items: center;
          gap: 3px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 3px;
          box-sizing: border-box;
        }
        .srv-stepper-btn {
          background: transparent;
          border: none;
          color: var(--text);
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .srv-stepper-btn:hover {
          background: var(--surface);
          color: var(--oro-ink);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }
        .srv-stepper-btn:active {
          transform: scale(0.92);
        }
        .srv-stepper-wrap .srv-compact-select .custom-select-trigger {
          border: none !important;
          background: transparent !important;
          padding: 4px 8px !important;
          box-shadow: none !important;
        }
        .srv-popover-grid {
          width: 250px !important;
          min-width: 250px !important;
          padding: 8px !important;
        }
        .srv-month-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          width: 100%;
        }
        .srv-month-pill {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 2px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          cursor: pointer;
          text-align: center;
          transition: all 0.15s ease;
          outline: none;
        }
        .srv-month-pill:hover {
          background: rgba(61, 90, 71, 0.12);
          border-color: var(--verde);
          color: var(--verde-deep);
        }
        .srv-month-pill.active {
          background: var(--verde) !important;
          color: var(--sobre-acento) !important;
          border-color: var(--verde) !important;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(61, 90, 71, 0.25);
        }
        [data-theme="dark"] .srv-month-pill.active {
          background: var(--oro) !important;
          color: #1A1A1A !important;
          border-color: var(--oro) !important;
        }

        .srv-search-box {
          position: relative;
          flex: 2 1 180px;
          min-width: 160px;
        }
        .srv-search-input {
          width: 100%;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 8px 12px 8px 34px;
          font-size: 12.5px;
          color: var(--text);
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
          font-family: var(--sans);
        }
        .srv-search-input:focus {
          border-color: var(--oro);
          background: var(--surface);
          box-shadow: 0 0 0 3px rgba(184, 144, 47, 0.15);
        }
        .srv-search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .srv-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 18px;
          width: 100%;
        }
        .srv-card {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 145px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--sombra);
          box-sizing: border-box;
        }
        .srv-card .srv-card-deco {
          position: absolute;
          bottom: -8px;
          right: -8px;
          width: 72px;
          height: 72px;
          color: var(--oro-ink);
          opacity: 0.05;
          pointer-events: none;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .srv-card .srv-card-deco svg {
          width: 100%;
          height: 100%;
        }
        .srv-card:hover {
          transform: translateY(-4px);
          border-color: var(--oro);
          box-shadow: 0 12px 30px rgba(184, 144, 47, 0.12);
        }
        .srv-card:hover .srv-card-deco {
          opacity: 0.15;
          transform: scale(1.1) rotate(12deg);
        }
        .srv-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        .srv-card-code {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          background: var(--surface-2);
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.3s ease;
        }
        .srv-card:hover .srv-card-code {
          background: var(--verde);
          color: var(--sobre-acento);
        }
        .srv-card-bottom {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 20px;
        }
        .srv-card-name {
          font-size: 17px;
          font-weight: 700;
          color: var(--text);
          margin: 0;
        }

        .srv-footer {
          margin-top: 16px;
        }
        .srv-back-login {
          background: var(--surface-2);
          border: 1px solid var(--border-strong);
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 30px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }
        .srv-back-login:hover {
          background: var(--border);
          color: var(--text);
          border-color: var(--border-strong);
        }

        /* ── INDICADORES DE RATING EN TARJETAS ── */
        .srv-card-rating-container {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .srv-rating-val {
          font-family: var(--sans);
          font-size: 15px;
          font-weight: 800;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .srv-rating-trend {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .srv-rating-trend.trend-up {
          color: #2e7d32;
          background: rgba(46, 125, 50, 0.08);
        }
        .srv-rating-trend.trend-down {
          color: #c62828;
          background: rgba(198, 40, 40, 0.08);
        }
        .srv-rating-trend.trend-equal {
          color: #f57f17;
          background: rgba(245, 127, 23, 0.08);
        }
        [data-theme="dark"] .srv-rating-trend.trend-up {
          color: #7AD89A;
          background: rgba(61, 138, 95, 0.18);
        }
        [data-theme="dark"] .srv-rating-trend.trend-down {
          color: #F4A090;
          background: rgba(178, 58, 43, 0.18);
        }
        [data-theme="dark"] .srv-rating-trend.trend-equal {
          color: #E8C878;
          background: rgba(232, 200, 120, 0.15);
        }
        /* Cargando: una línea que se escribe (banco de movimiento), en lugar de un spinner */
        .srv-rating-spinner {
          display: inline-block;
          width: 42px;
          height: 8px;
          border-radius: 4px;
          background: rgba(184, 144, 47, 0.45);
          transform-origin: left center;
          animation: etoileWrite 1.6s cubic-bezier(.6, 0, .3, 1) 6 both;
        }

        /* ── SILUETAS GEOGRÁFICAS DE FONDO ── */
        .srv-card-map-overlay {
          position: absolute;
          bottom: 12px;
          right: 12px;
          width: 60px;
          height: 60px;
          opacity: 0.08;
          color: var(--verde-ink);
          pointer-events: none;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        }
        .srv-card:hover .srv-card-map-overlay {
          transform: scale(1.08) rotate(-4deg);
          opacity: 0.15;
        }
        [data-theme="dark"] .srv-card-map-overlay {
          color: var(--oro-ink);
          opacity: 0.06;
        }
        [data-theme="dark"] .srv-card:hover .srv-card-map-overlay {
          opacity: 0.12;
        }

        /* ── TABLA DE RANKINGS BISTRO ── */
        .srv-ranking-table-placeholder-box {
          margin-top: 10px;
          width: 100%;
        }
        .ranking-table-card {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--sombra);
          padding: 26px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          box-sizing: border-box;
        }
        .ranking-table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .ranking-table-title {
          font-family: var(--serif);
          font-size: 26px;
          color: var(--text);
          margin: 0;
          font-weight: 400;
        }
        .ranking-table-subtitle {
          font-size: 13px;
          color: var(--text-dim);
          margin: 4px 0 0 0;
        }
        .ranking-table-wrapper {
          overflow-x: auto;
          width: 100%;
        }
        .ranking-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .ranking-table th {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          padding: 12px 16px;
          border-bottom: 1.5px solid var(--border);
        }
        .ranking-table td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 13.5px;
          color: var(--text-muted);
        }
        .ranking-row:last-child td {
          border-bottom: none;
        }
        .ranking-row:hover {
          background: var(--surface-2);
        }
        .ranking-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          font-size: 12px;
          font-weight: 800;
          background: var(--border-strong);
          color: var(--text);
        }
        .ranking-badge.rank-gold {
          background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
          color: #1A1A1A;
          box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
        }
        .ranking-badge.rank-silver {
          background: linear-gradient(135deg, #E0E0E0 0%, #B0B0B0 100%);
          color: #1A1A1A;
          box-shadow: 0 2px 8px rgba(176, 176, 176, 0.3);
        }
        .ranking-badge.rank-bronze {
          background: linear-gradient(135deg, #CD7F32 0%, #A0522D 100%);
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(205, 127, 50, 0.3);
        }
        .rank-shift {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .rank-shift.up {
          color: #2e7d32;
          background: rgba(46, 125, 50, 0.08);
        }
        .rank-shift.down {
          color: #c62828;
          background: rgba(198, 40, 40, 0.08);
        }
        .rank-shift.equal {
          color: var(--text-dim);
          background: transparent;
          padding: 0;
        }
        .rank-shift.new {
          color: var(--oro-ink);
          background: rgba(184, 144, 47, 0.08);
          font-size: 9px;
        }
        .srv-table-spinner {
          display: block;
          margin: 40px auto;
          width: 120px;
          height: 10px;
          border-radius: 5px;
          background: rgba(184, 144, 47, 0.45);
          transform-origin: left center;
          animation: etoileWrite 1.6s cubic-bezier(.6, 0, .3, 1) 6 both;
        }
        @keyframes etoileWrite {
          0% { transform: scaleX(0); opacity: 1; }
          55%, 85% { transform: scaleX(1); opacity: 1; }
          100% { transform: scaleX(1); opacity: .3; }
        }

        /* ── BRAND DASHBOARD SHORTCUT BANNER ── */
        .brand-shortcut-card {
          background: var(--surface-2);
          border: 1px solid var(--border-strong);
          border-radius: 20px;
          padding: 22px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
          box-shadow: var(--sombra-lg);
          box-sizing: border-box;
          width: 100%;
          transition: all 0.3s ease;
        }
        .brand-shortcut-card:hover {
          border-color: var(--oro);
          box-shadow: var(--sombra-card);
        }
        .brand-shortcut-content {
          flex: 1;
          min-width: 260px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .brand-shortcut-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand-shortcut-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--oro);
        }
        .brand-shortcut-eyebrow {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--oro-ink);
        }
        .brand-shortcut-title {
          font-family: var(--serif);
          font-size: 28px;
          color: var(--text);
          margin: 0;
          font-weight: 400;
        }
        .brand-shortcut-desc {
          font-size: 13px;
          color: var(--text-dim);
          margin: 0;
          line-height: 1.4;
          max-width: 650px;
        }
        .brand-shortcut-btn {
          background: var(--verde);
          border: 1px solid var(--verde);
          color: var(--sobre-acento);
          padding: 12px 24px;
          border-radius: 14px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
          box-shadow: 0 4px 15px rgba(61,90,71,0.25);
        }
        .brand-shortcut-btn:hover {
          filter: brightness(1.15);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(61,90,71,0.35);
        }

        @media (max-width: 768px) {
          .srv-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .srv-compact-select, .srv-search-box {
            width: 100%;
            flex: 1 1 100%;
          }
        }

        @media (max-width: 600px) {
          .brand-shortcut-card {
            padding: 18px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 14px !important;
          }
          .brand-shortcut-title {
            font-size: 22px !important;
          }
          .brand-shortcut-desc {
            font-size: 12px !important;
          }
          .brand-shortcut-btn {
            width: 100% !important;
            justify-content: center !important;
            padding: 11px 18px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let brandDashboardHtml = '';
    const canSeeBrandDashboard = ['corporate', 'admin', 'director', 'regional'].includes(role);

    if (canSeeBrandDashboard) {
      brandDashboardHtml = `
        <button type="button" class="rg-astra" onclick="SelectRegionView.handleSelectCorporate()">
          ${Rosa.html('polar', { size: 26 })}
          <span><b>Étoile Astra</b><small>Todas las regiones en una lectura: la calificación del grupo, las quejas críticas y el ranking.</small></span>
          <i aria-hidden="true">→</i>
        </button>`;
    }

    // Años disponibles desde manifest
    const manifestYears = (typeof DataLoader !== 'undefined' && DataLoader.manifest) 
      ? Object.keys(DataLoader.manifest).map(Number).sort((a, b) => b - a)
      : [];
    const availableYears = manifestYears.length > 0 ? manifestYears : [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

    // Opciones de Año
    const yearOptionsHtml = availableYears.map(y => `
      <div class="custom-option ${y === this.selectedYear ? 'active' : ''}" data-value="${y}" onclick="SelectRegionView.onYearOptionClick(${y}, event)">${y}</div>
    `).join('');

    // Opciones de Mes (Cuadrícula 4x3 de 0 Scroll)
    const monthNames = MONTH_NAMES || ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthShortNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const monthOptionsHtml = `
      <div class="srv-month-grid">
        ${monthShortNames.map((mShort, idx) => {
          const mNum = idx + 1;
          return `<button type="button" class="srv-month-pill ${mNum === this.selectedMonth ? 'active' : ''}" data-value="${mNum}" onclick="SelectRegionView.onMonthOptionClick(${mNum}, event)">${mShort}</button>`;
        }).join('')}
      </div>
    `;

    // Opciones de Ordenamiento
    const sortLabels = {
      'urgency': 'Urgencia (quejas sin respuesta)',
      'adjusted': 'Brillo ajustado',
      'rating-desc': 'Rating (Alto a Bajo)',
      'rating-asc': 'Rating (Alertas)',
      'volume-desc': 'Volumen Reseñas',
      'delta-desc': 'Mayor Crecimiento'
    };
    const sortOptionsHtml = Object.entries(sortLabels).map(([k, label]) => `
      <div class="custom-option ${k === this.sortBy ? 'active' : ''}" data-value="${k}" onclick="SelectRegionView.onSortOptionClick('${k}', event)">${label}</div>
    `).join('');

    // Opciones de Estado
    const statusLabels = {
      'all': 'Todas las Regiones',
      'critical': 'Bajo la meta (< 4.60)',
      'optimal': 'En la meta (≥ 4.60)'
    };
    const statusOptionsHtml = Object.entries(statusLabels).map(([k, label]) => `
      <div class="custom-option ${k === this.filterStatus ? 'active' : ''}" data-value="${k}" onclick="SelectRegionView.onStatusOptionClick('${k}', event)">${label}</div>
    `).join('');

    // Lista de tarjetas de región
    const regionsList = Object.entries(REGION_NAME_MAP).map(([id, name]) => {
      const branches = SUCURSALES_META_ALL.filter(s => s.region === id);
      const count = branches.length;

      return {
        id,
        name,
        count
      };
    });

    const cardsHtml = regionsList.map(r => `
      <div class="srv-card" id="srv-card-${r.id}" role="button" tabindex="0" aria-label="Abrir región ${r.id}" onclick="SelectRegionView.handleSelect('${r.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();SelectRegionView.handleSelect('${r.id}')}">
        ${SelectRegionView.getRegionMapSVG(r.id)}
        <div class="srv-card-top">
          <span class="srv-card-code">${r.count === 1 ? `${r.id} - UNICA` : `${r.id} - ${r.count} SUC`}</span>
          <div class="srv-card-rating-container" data-region-rating="${r.id}">
            <span class="srv-rating-spinner"></span>
          </div>
        </div>
        <div class="srv-card-bottom">
          <h3 class="srv-card-name" style="margin:0;">${escapeHtml(r.name)}</h3>
          ${role === 'zonal' && r.id === AppAuth.getUserRegion() ? '<span class="srv-card-mine">Tu región</span>' : ''}
        </div>
      </div>
    `).join('');

    // La primera vez de la sesión, el cielo hace su «llegada» (viene del login); después aparece ya asentado
    let llegada = false;
    try { llegada = sessionStorage.getItem('etoile-llegada') !== '1'; } catch (e) {}
    app.innerHTML = `
      <div class="srv-wrapper">
        ${CieloGrupo.html({ llegada, mapa: false, lista: false })}
        <div class="srv-container" id="srvContainer">
          <!-- Catálogo de regiones (ronda 9, opción 1): una lámina por región con su constelación real; la tabla es la otra vista -->
          <section class="rg" id="srvCatalogo" aria-labelledby="rgTit">
            <div class="rg-cab">
              <div class="rg-txt">
                <span class="rg-eti">Catálogo de regiones</span>
                <h2 class="rg-tit" id="rgTit">Todas las regiones</h2>
                <p class="rg-sub">El puesto sale del brillo ajustado, que pide evidencia; el promedio que ves es el real. Toca una región para entrar.</p>
              </div>
              <div class="rg-ctrl">
                <span class="rg-mes" role="group" aria-label="Mes">
                  <button type="button" onclick="SelectRegionView.stepMonth(-1, event)" aria-label="Mes anterior">‹</button>
                  <span id="srvPeriodBadge" aria-live="polite">${monthNames[this.selectedMonth - 1]} ${this.selectedYear}</span>
                  <button type="button" onclick="SelectRegionView.stepMonth(1, event)" aria-label="Mes siguiente">›</button>
                </span>
                <span class="rg-seg" role="group" aria-label="Orden">${[['puesto', 'Puesto'], ['urgencia', 'Urgencia'], ['nombre', 'Nombre']].map(([k, t]) => `<button type="button" data-orden="${k}" aria-pressed="${this.orden === k}">${t}</button>`).join('')}</span>
                <span class="rg-seg" role="group" aria-label="Vista">${[['laminas', 'Láminas'], ['tabla', 'Tabla']].map(([k, t]) => `<button type="button" data-vista="${k}" aria-pressed="${this.vista === k}">${t}</button>`).join('')}</span>
              </div>
            </div>
            <div id="srv-ranking-table-placeholder" class="rg-cuerpo"></div>
          </section>

          <!-- Por atender nacional: las quejas sin respuesta -->
          <section class="srv-briefing" id="srvBriefing" aria-live="polite"></section>

          ${brandDashboardHtml}

          <div class="srv-header srv-footer">
            <button class="srv-back-login" onclick="AppAuth.logout()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12,19 5,12 12,5"></polyline></svg>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // La página se entrega completa: el cargador (o el telón) sigue arriba hasta que llegan las cifras, el titular nacional
    // y las alertas. Antes se soltaba vacía y al llegar los datos todo se recorría hacia abajo
    SelectRegionView.enlazaCatalogo();
    await SelectRegionView.loadRatingsAndRankings();
    CieloGrupo.enlaza();
    CieloGrupo.llegada();
  },

  getDefaultPeriod() {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1; // 1-indexed (1-12)

    // Se monitorea lo último de lo último: por defecto, el mes más reciente con datos (el mes en curso).
    // El resumen del mes recién cerrado se avisa aparte con el banner de los primeros 7 días (getConcludedMonthInfo).
    let defaultYear = curYear;
    let defaultMonth = curMonth;

    if (typeof DataLoader !== 'undefined' && DataLoader.manifest) {
      const manifestYears = Object.keys(DataLoader.manifest).map(Number).sort((a, b) => b - a);
      if (manifestYears.length > 0) {
        const latestYear = manifestYears[0];
        const monthsInYear = [...DataLoader.manifest[latestYear]].sort((a, b) => a - b);
        if (monthsInYear.length > 0) {
          defaultYear = latestYear;
          defaultMonth = monthsInYear[monthsInYear.length - 1];
        }
      }
    }

    return { year: defaultYear, month: defaultMonth };
  },


  stepMonth(delta, event) {
    if (event) event.stopPropagation();
    let newM = (this.selectedMonth || 1) + delta;
    let newY = this.selectedYear || new Date().getFullYear();

    if (newM > 12) {
      newM = 1;
      newY += 1;
    } else if (newM < 1) {
      newM = 12;
      newY -= 1;
    }

    this.selectedYear = newY;
    this.onMonthOptionClick(newM, event);
  },

  stepYear(delta, event) {
    if (event) event.stopPropagation();
    const newY = (this.selectedYear || new Date().getFullYear()) + delta;
    this.onYearOptionClick(newY, event);
  },

  toggleDropdown(id, event) {
    if (event) event.stopPropagation();
    const el = document.getElementById(id);
    document.querySelectorAll('.custom-select.open').forEach(d => {
      if (d !== el) d.classList.remove('open');
    });
    if (el) el.classList.toggle('open');
  },

  showCardSpinners() {
    Object.keys(REGION_NAME_MAP).forEach(id => {
      const container = document.querySelector(`[data-region-rating="${id}"]`);
      if (container) {
        container.innerHTML = `<span class="srv-rating-spinner"></span>`;
      }
    });
    const tablePlaceholder = document.getElementById('srv-ranking-table-placeholder');
    if (tablePlaceholder) {
      tablePlaceholder.classList.add('loading');
      tablePlaceholder.innerHTML = `<div class="srv-table-spinner"></div>`;
    }
  },

  onYearOptionClick(yearNum, event) {
    if (event) event.stopPropagation();
    this.selectedYear = parseInt(yearNum);
    
    const valEl = document.querySelector('#srvYearDropdown .custom-select-value');
    if (valEl) valEl.textContent = `Año: ${this.selectedYear}`;
    
    document.querySelectorAll('#srvYearDropdown .custom-option').forEach(opt => {
      opt.classList.toggle('active', parseInt(opt.getAttribute('data-value')) === this.selectedYear);
    });
    
    const dropdown = document.getElementById('srvYearDropdown');
    if (dropdown) dropdown.classList.remove('open');

    const monthNames = MONTH_NAMES || ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const badge = document.getElementById('srvPeriodBadge');
    if (badge) badge.textContent = `${monthNames[this.selectedMonth - 1]} ${this.selectedYear}`;

    if (typeof DataLoader !== 'undefined') {
      DataLoader.setMonth(this.selectedYear, this.selectedMonth);
    }
    this.showCardSpinners();
    this.loadRatingsAndRankings();
  },

  onMonthOptionClick(monthNum, event) {
    if (event) event.stopPropagation();
    this.selectedMonth = parseInt(monthNum);
    
    const monthNames = MONTH_NAMES || ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthName = monthNames[this.selectedMonth - 1];

    const valEl = document.querySelector('#srvMonthDropdown .custom-select-value');
    if (valEl) valEl.textContent = `Mes: ${monthName}`;
    
    document.querySelectorAll('#srvMonthDropdown .custom-option').forEach(opt => {
      opt.classList.toggle('active', parseInt(opt.getAttribute('data-value')) === this.selectedMonth);
    });

    const dropdown = document.getElementById('srvMonthDropdown');
    if (dropdown) dropdown.classList.remove('open');

    const badge = document.getElementById('srvPeriodBadge');
    if (badge) badge.textContent = `${monthName} ${this.selectedYear}`;

    if (typeof DataLoader !== 'undefined') {
      DataLoader.setMonth(this.selectedYear, this.selectedMonth);
    }
    this.showCardSpinners();
    this.loadRatingsAndRankings();
  },

  /** Titular nacional + "Por atender": lo primero que lee un rol que ve todas las regiones */
  _renderBriefing(reviews, regionStats, recent) {
    const el = document.getElementById('srvBriefing');
    if (!el || typeof Briefing === 'undefined') return;
    const goal = EC.metaRating();
    const rows = Object.values(regionStats).filter(s => s.count > 0);   // regiones con reseñas este mes
    const count = reviews.length;
    const avg = count ? reviews.reduce((s, r) => s + r.stars, 0) / count : 0;
    // Una región sin reseñas este mes puede tener quejas pendientes del mes pasado: también cuenta
    const attention = Object.values(regionStats)
      .filter(s => s.unreplied > 0 || (s.count >= Narrative.MIN_SAMPLE && s.avg < goal))
      .sort((a, b) => (b.unreplied - a.unreplied) || (a.avg - b.avg))
      .map(s => ({ id: s.id, nombre: s.name, avg: s.avg, count: s.count, unreplied: s.unreplied }));
    const segs = Narrative.briefingRegion({ name: 'La marca', avg, goal, count, attention });
    const sorted = [...recent].sort((a, b) => (Severity.isCritical(b) - Severity.isCritical(a)) || (Date.parse(a.publishedAtDate) - Date.parse(b.publishedAtDate)));
    const nowLong = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: BranchTime.MONTH_TZ });
    const noData = Object.values(regionStats).filter(s => s.count === 0).length;
    // El titular nacional vive en el cielo; aquí abajo quedan las quejas por atender
    CieloGrupo.titular(`${Briefing.headline(segs, id => `CieloGrupo.entrar('${id}')`)}<span class="cg-sub">${escapeHtml(nowLong)} · ${count} ${count === 1 ? 'reseña' : 'reseñas'} este mes en ${rows.length} de ${Object.keys(regionStats).length} regiones${noData ? ` (${noData} sin reseñas)` : ''}.</span>`);
    el.innerHTML = `
      ${Briefing.rowsHtml(sorted, null)}
      <p class="sync-note" id="syncNote" hidden></p>`;
    Briefing.fillSyncNote('syncNote');
  },

  onSortOptionClick(sortKey, event) {
    if (event) event.stopPropagation();
    this.sortBy = sortKey;
    
    const sortLabels = {
      'urgency': 'Urgencia (quejas sin respuesta)',
      'adjusted': 'Brillo ajustado',
      'rating-desc': 'Rating (Alto a Bajo)',
      'rating-asc': 'Rating (Alertas)',
      'volume-desc': 'Volumen Reseñas',
      'delta-desc': 'Mayor Crecimiento'
    };

    const valEl = document.querySelector('#srvSortDropdown .custom-select-value');
    if (valEl) valEl.textContent = `Orden: ${sortLabels[sortKey] || sortKey}`;

    document.querySelectorAll('#srvSortDropdown .custom-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-value') === sortKey);
    });

    const dropdown = document.getElementById('srvSortDropdown');
    if (dropdown) dropdown.classList.remove('open');

    this.applyFiltersAndSorting();
  },

  onStatusOptionClick(statusKey, event) {
    if (event) event.stopPropagation();
    this.filterStatus = statusKey;

    const statusLabels = {
      'all': 'Todas las Regiones',
      'critical': 'Bajo la meta (< 4.60)',
      'optimal': 'En la meta (≥ 4.60)'
    };

    const valEl = document.querySelector('#srvStatusDropdown .custom-select-value');
    if (valEl) valEl.textContent = `Estado: ${statusLabels[statusKey] || statusKey}`;

    document.querySelectorAll('#srvStatusDropdown .custom-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-value') === statusKey);
    });

    const dropdown = document.getElementById('srvStatusDropdown');
    if (dropdown) dropdown.classList.remove('open');

    this.applyFiltersAndSorting();
  },

  handleSearch(val) {
    this.searchQuery = (val || '').toLowerCase().trim();
    this.applyFiltersAndSorting();
  },

  applyFiltersAndSorting() { this.renderCatalogo(); },

  /** Catálogo: láminas o tabla, en el orden elegido */
  renderCatalogo() {
    const host = document.getElementById('srv-ranking-table-placeholder');
    if (!host || !this._cachedRegionStats) return;
    host.classList.remove('loading');
    const g = CieloGrupo.geo(), mia = AppAuth.getUserRole() === 'zonal' ? AppAuth.getUserRegion() : null;
    const cuenta = id => { const c = { brilla: 0, tenue: 0, apaga: 0 }; (g.regs[id] || []).forEach(x => { const k = x.estado ? (x.estado.id === 'polar' ? 'brilla' : x.estado.id) : 'sin'; if (k in c) c[k]++; }); return c; };
    let filas = Object.values(this._cachedRegionStats).map(st => ({ ...st, puesto: this._rankMap[st.id] || null, previo: (this._prevRankMap || {})[st.id] || null, c: cuenta(st.id), n: (g.regs[st.id] || []).length }));
    const conPuesto = (a, b) => (a.puesto ? 0 : 1) - (b.puesto ? 0 : 1);
    if (this.orden === 'urgencia') filas.sort((a, b) => (b.unreplied || 0) - (a.unreplied || 0) || b.c.apaga - a.c.apaga || conPuesto(a, b) || (a.adjusted - b.adjusted));
    else if (this.orden === 'nombre') filas.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    else filas.sort((a, b) => conPuesto(a, b) || (a.puesto - b.puesto) || a.name.localeCompare(b.name, 'es'));
    const plural = (k, a, b) => `${k} ${k === 1 ? a : b}`;
    const ev = st => `<span class="rg-ev" title="${st.nTexto || 0} reseñas con texto de ${Brillo.N_MIN} que pide la marca"><i style="width:${Math.min(100, (st.nTexto || 0) / Brillo.N_MIN * 100).toFixed(0)}%"></i></span>`;
    const estados = st => [['brilla', 'brilla', 'brillan'], ['tenue', 'tenue', 'tenues'], ['apaga', 'se apaga', 'se apagan']].filter(([k]) => st.c[k]).map(([k, uno, varios]) => `${st.c[k]} ${st.c[k] === 1 ? uno : varios}`).join(' · ') || 'sin señal';
    const cambio = st => !st.puesto || !st.previo ? (st.puesto && !st.previo ? '<span class="rg-cambio nuevo">nuevo</span>' : '') : st.previo > st.puesto ? `<span class="rg-cambio sube" aria-label="Subió ${st.previo - st.puesto}">▲ ${st.previo - st.puesto}</span>` : st.previo < st.puesto ? `<span class="rg-cambio baja" aria-label="Bajó ${st.puesto - st.previo}">▼ ${st.puesto - st.previo}</span>` : '<span class="rg-cambio">=</span>';
    if (this.vista === 'tabla') {
      host.innerHTML = `<div class="rg-tabla" role="table" aria-label="Ranking de regiones">
        <div class="rg-fila rg-fila--cab" role="row"><span role="columnheader">Puesto</span><span role="columnheader">Región</span><span role="columnheader">Brillo ajustado</span><span role="columnheader">Promedio</span><span role="columnheader">Evidencia</span><span role="columnheader">Quejas</span><span role="columnheader">Cambio</span></div>
        ${filas.map(st => `<button type="button" class="rg-fila${st.id === mia ? ' rg--mia' : ''}" role="row" id="rg-${st.id}" data-reg="${st.id}" aria-label="${escapeHtml(st.name)}: entrar">
          <span class="rg-pu">${st.puesto || '—'}</span>
          <span class="rg-nm">${Rosa.html(Rosa.deTienda(st.estado), { size: 18 })}${escapeHtml(st.name)}${st.id === mia ? ' <i>· tu región</i>' : ''}</span>
          <span class="num">${st.count ? st.adjusted.toFixed(2) : '—'}</span>
          <span class="num">${st.count ? st.avg.toFixed(2) : '—'}</span>
          <span>${ev(st)}<small class="num">${st.nTexto || 0}/${Brillo.N_MIN}</small></span>
          <span class="num${st.unreplied ? ' rg-q' : ''}">${st.unreplied || '—'}</span>
          <span>${cambio(st)}</span></button>`).join('')}</div>`;
    } else {
      host.innerHTML = `<div class="rg-cat">${filas.map((st, i) => `
        <button type="button" class="rg-lam${st.count ? '' : ' rg-lam--sin'}${st.id === mia ? ' rg--mia' : ''}" id="rg-${st.id}" data-reg="${st.id}" aria-label="${escapeHtml(st.name)}${st.puesto ? `, puesto ${st.puesto}` : ', sin reseñas este mes'}: entrar">
          <span class="rg-cielo">
            <span class="rg-cod">R·${String(i + 1).padStart(2, '0')} · ${st.id}</span>
            ${st.puesto ? `<span class="rg-puesto"><small>Puesto</small>${st.puesto}</span>` : ''}
            ${this.constelacion(st.id)}
          </span>
          <span class="rg-lam-cuerpo">
            <span class="rg-lam-n"><b>${escapeHtml(st.name)}</b><small>${st.id === mia ? 'tu región · ' : ''}${plural(st.n, 'sucursal', 'sucursales')}</small></span>
            ${st.count ? `<span class="rg-cif">
              <span><b>${Rosa.html(Rosa.deTienda(st.estado), { size: 16, label: Brillo.lectura(st.estado) })}${st.adjusted.toFixed(2)}</b>brillo ajustado</span>
              <span><b>${st.avg.toFixed(2)}</b>promedio</span>
              <span><b>${ev(st)}</b>${st.nTexto || 0}/${Brillo.N_MIN} evidencia</span></span>` : '<span class="rg-sin">Sin reseñas este mes</span>'}
            <span class="rg-lam-pie"><span>${estados(st)}</span>${st.unreplied ? `<span class="rg-q">${plural(st.unreplied, 'queja', 'quejas')}</span>` : cambio(st)}</span>
          </span>
        </button>`).join('')}</div>`;
    }
    host.querySelectorAll('[data-reg]').forEach(b => b.addEventListener('click', () => this.handleSelect(b.dataset.reg)));
  },

  /**
   * La constelación de una región para su lámina: las Rosas de sus sucursales sobre sus pines reales (a esta escala ya
   * no se enciman, así que no hace falta separarlas como en el mapa del país) y su árbol de expansión mínima, ajustada a la caja
   */
  constelacion(id) {
    const l = (CieloGrupo.geo().regs[id] || []);
    if (!l.length) return '';
    const pts = l.map(x => ({ p: [x.pin[0], x.pin[1]], estado: x.estado }));
    const xs0 = pts.map(q => q.p[0]), ys0 = pts.map(q => q.p[1]);
    const lado0 = Math.max(Math.max(...xs0) - Math.min(...xs0), Math.max(...ys0) - Math.min(...ys0), .2);
    // Sucursales en la misma plaza o a unos metros: separación mínima del 9 % de la región, nada más
    const D = lado0 * .09;
    for (let it = 0; it < 60; it++) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i].p, b = pts[j].p; let dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
      if (d >= D) continue; if (d < 1e-9) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1e-3; }
      const m = (D - d) / 2 / d; a[0] -= dx * m; a[1] -= dy * m; b[0] += dx * m; b[1] += dy * m;
    }
    const dist = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
    const dentro = [0], ar = [];
    while (dentro.length < pts.length) { let best = null; dentro.forEach(i => pts.forEach((_, j) => { if (!dentro.includes(j)) { const d = dist(pts[i], pts[j]); if (!best || d < best[2]) best = [i, j, d]; } })); dentro.push(best[1]); ar.push(best); }
    const xs = pts.map(q => q.p[0]), ys = pts.map(q => q.p[1]);
    const W = 232, H = 104, x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = pts.length > 1 ? Math.min((W - 28) / Math.max(x1 - x0, 1e-6), (H - 28) / Math.max(y1 - y0, 1e-6)) : 1;
    const X = v => pts.length > 1 ? W / 2 + (v - (x0 + x1) / 2) * k : W / 2, Y = v => pts.length > 1 ? H / 2 + (v - (y0 + y1) / 2) * k : H / 2;
    const r = 7;
    return `<svg class="rg-const" viewBox="0 0 ${W} ${H}" aria-hidden="true">${ar.map(([i, j]) => `<line x1="${X(pts[i].p[0]).toFixed(1)}" y1="${Y(pts[i].p[1]).toFixed(1)}" x2="${X(pts[j].p[0]).toFixed(1)}" y2="${Y(pts[j].p[1]).toFixed(1)}"/>`).join('')}${pts.map(q => Rosa.html(Rosa.deTienda(q.estado || { id: 'sin' }, null, null, 'noche'), { size: 30, tema: 'noche' }).replace('<svg class="rosa"', `<svg x="${(X(q.p[0]) - r).toFixed(1)}" y="${(Y(q.p[1]) - r).toFixed(1)}"`).replace(/width="30" height="30"/, `width="${2 * r}" height="${2 * r}"`)).join('')}</svg>`;
  },

  /** Orden y vista del catálogo (se recuerdan) */
  enlazaCatalogo() {
    const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    document.querySelectorAll('#srvCatalogo [data-orden]').forEach(b => b.addEventListener('click', () => {
      this.orden = b.dataset.orden; guarda('etoile-regiones-orden', this.orden);
      document.querySelectorAll('#srvCatalogo [data-orden]').forEach(x => x.setAttribute('aria-pressed', x === b)); this.renderCatalogo();
    }));
    document.querySelectorAll('#srvCatalogo [data-vista]').forEach(b => b.addEventListener('click', () => {
      this.vista = b.dataset.vista; guarda('etoile-regiones-vista', this.vista);
      document.querySelectorAll('#srvCatalogo [data-vista]').forEach(x => x.setAttribute('aria-pressed', x === b)); this.renderCatalogo();
    }));
  },


  async handleSelect(regionId) {
    const container = document.getElementById('srvContainer');
    if (container) {
      container.classList.add('exit-transition');
    }

    const regionName = getRegionName(regionId);
    // La descarga empieza al instante y corre mientras dura la animación del loader (antes arrancaba al terminar)
    let regionReady = Promise.resolve();
    if (typeof DataLoader !== 'undefined') {
      DataLoader.setMonth(this.selectedYear, this.selectedMonth);
      regionReady = DataLoader.switchRegion(regionId);
    }
    if (typeof showRegionTransitionLoader !== 'undefined') {
      showRegionTransitionLoader(regionName, 'Accediendo al panel regional...', async () => {
        await regionReady;
        Router.navigate('#/');
      });
    } else {
      setTimeout(async () => {
        if (typeof DataLoader !== 'undefined') {
          DataLoader.setMonth(this.selectedYear, this.selectedMonth);
          await DataLoader.switchRegion(regionId);
        }
        Router.navigate('#/');
      }, 400);
    }
  },

  handleSelectCorporate() {
    const container = document.getElementById('srvContainer');
    if (container) {
      container.classList.add('exit-transition');
    }

    if (typeof showRegionTransitionLoader !== 'undefined') {
      showRegionTransitionLoader('étoile astra', 'Accediendo al centro de mando...', () => {
        Router.navigate('#/brand');
      });
    } else {
      setTimeout(() => {
        Router.navigate('#/brand');
      }, 400);
    }
  },

  getRegionMapSVG(regionId) {
    const paths = {
      'GDL': 'M50 15 L65 30 L80 35 L75 55 L85 75 L60 85 L45 80 L25 85 L15 65 L20 45 L35 30 Z',
      'CDMX': 'M35 15 L65 15 L75 30 L70 50 L60 65 L65 90 L45 90 L35 75 L30 55 L38 35 Z',
      'MTY': 'M20 20 L55 15 L85 25 L80 50 L75 80 L45 85 L25 70 L30 45 L15 35 Z',
      'LEON': 'M30 20 L70 15 L85 40 L75 70 L50 85 L20 70 L15 45 Z',
      'SLP': 'M25 15 L50 25 L80 20 L75 45 L90 60 L70 85 L45 75 L30 80 L15 50 Z',
      'AGS': 'M40 15 L65 20 L75 45 L60 85 L35 85 L25 55 L30 30 Z',
      'TOL': 'M40 10 L65 15 L75 35 L70 60 L80 85 L50 90 L30 75 L20 50 L25 25 Z',
      'QRO': 'M50 10 L65 25 L55 45 L75 60 L60 90 L40 85 L30 60 L45 40 Z',
      'CUN': 'M20 15 L50 15 L55 35 L75 35 L75 75 L65 75 L65 45 L45 45 L40 85 L20 85 Z',
      'TJ': 'M15 25 L85 25 L85 45 L65 55 L70 80 L45 80 L35 60 L15 50 Z'
    };
    
    const p = paths[regionId] || 'M 20,20 L 80,20 L 80,80 L 20,80 Z';
    return `
      <svg class="srv-card-map-overlay" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
        <path d="${p}" />
      </svg>
    `;
  },

  async loadRatingsAndRankings() {
    const tablePlaceholder = document.getElementById('srv-ranking-table-placeholder');
    const skeletonTimeout = setTimeout(() => {
      if (tablePlaceholder && typeof renderSkeleton === 'function') {
        renderSkeleton(tablePlaceholder, 'row', 6);
      }
    }, 250);

    try {
      if (typeof DataLoader !== 'undefined') {
        if (!DataLoader.currentYear) {
          await DataLoader.init();
        }

        const currYear = this.selectedYear || DataLoader.currentYear;
        const currMonth = this.selectedMonth || DataLoader.currentMonth;
        const prevMonth = currMonth === 1 ? 12 : currMonth - 1;
        const prevYear = currMonth === 1 ? currYear - 1 : currYear;

        DataLoader.setMonth(currYear, currMonth);

        // Cargar datos globales asíncronamente
        const [currReviews, prevReviews] = await Promise.all([
          DataLoader.loadBrandData(currYear, currMonth),
          DataLoader.loadBrandData(prevYear, prevMonth)
        ]);

        // Calcular métricas por región
        const regionStats = {};
        const prevRegionStats = {};

        // Brillo ajustado de la marca (marca.md): cada región contra el promedio del grupo en el mes, n = reseñas con texto
        const media = rv => rv.length ? rv.reduce((a, r) => a + r.stars, 0) / rv.length : 0;
        const conTexto = rv => rv.filter(r => Metrics.hasText(r)).length;
        const C = media(currReviews), Cprev = media(prevReviews);
        for (const [id, name] of Object.entries(REGION_NAME_MAP)) {
          const regionBranches = SUCURSALES_META_ALL.filter(s => s.region === id);
          
          // Mes actual
          const currRegReviews = currReviews.filter(r => r.region === id);
          const currCount = currRegReviews.length;
          const currAvg = currCount ? currRegReviews.reduce((sum, r) => sum + r.stars, 0) / currCount : 0;
          const currBranchCount = regionBranches.length;
          const currEstado = Brillo.estado({ avg: currAvg, nTexto: conTexto(currRegReviews), C });

          // Mes anterior
          const prevRegReviews = prevReviews.filter(r => r.region === id);
          const prevCount = prevRegReviews.length;
          const prevAvg = prevCount ? prevRegReviews.reduce((sum, r) => sum + r.stars, 0) / prevCount : 0;
          const prevBranchCount = regionBranches.length;
          const prevEstado = Brillo.estado({ avg: prevAvg, nTexto: conTexto(prevRegReviews), C: Cprev });

          regionStats[id] = {
            id,
            name,
            avg: currAvg,
            count: currCount,
            estado: currEstado,
            adjusted: currEstado.aj,
            nTexto: conTexto(currRegReviews),
            delta: currAvg - prevAvg
          };

          prevRegionStats[id] = {
            id,
            name,
            avg: prevAvg,
            count: prevCount,
            estado: prevEstado,
            adjusted: prevEstado.aj
          };
        }

        // Quejas sin respuesta de los últimos 30 días por región (mes actual + anterior), las graves primero
        const recent = Metrics.unrepliedComplaints(currReviews.concat(prevReviews)).filter(r => Briefing.ageDays(r) <= Briefing.WINDOW_DAYS);
        for (const id of Object.keys(regionStats)) regionStats[id].unreplied = recent.filter(r => r.region === id).length;
        this._cachedRegionStats = regionStats;
        CieloGrupo.pinta(currReviews, regionStats);
        this._renderBriefing(currReviews, regionStats, recent);

        // Puesto = orden por brillo ajustado (el mismo del cielo y de las sucursales), sin importar el orden de la tabla
        const rankedPrev = Brillo.ordena(Object.values(prevRegionStats)).filter(s => s.estado.id !== 'sin');
        this._rankMap = {};
        Brillo.ordena(Object.values(regionStats)).filter(s => s.estado.id !== 'sin').forEach((s, i) => { this._rankMap[s.id] = i + 1; });

        this._prevRankMap = {};
        rankedPrev.forEach((s, idx) => {
          this._prevRankMap[s.id] = idx + 1;
        });

        // Actualizar cada tarjeta en la interfaz
        for (const [id, stats] of Object.entries(regionStats)) {
          const container = document.querySelector(`[data-region-rating="${id}"]`);
          if (container) {
            if (stats.count > 0) {
              let arrowHtml = '';
              let badgeClass = '';
              const deltaVal = stats.delta;
              if (deltaVal > 0.01) {
                arrowHtml = `<span class="trend-arrow up">▲ +${deltaVal.toFixed(2)}</span>`;
                badgeClass = 'trend-up';
              } else if (deltaVal < -0.01) {
                arrowHtml = `<span class="trend-arrow down">▼ ${deltaVal.toFixed(2)}</span>`;
                badgeClass = 'trend-down';
              } else {
                arrowHtml = `<span class="trend-arrow equal">● =</span>`;
                badgeClass = 'trend-equal';
              }

              container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                  <div class="srv-rating-val">${stats.avg.toFixed(2)} <span style="font-size:11px;color:var(--text-muted);margin-left:2px;">★</span></div>
                  <div class="srv-rating-trend ${badgeClass}" style="margin-top:2px;">${arrowHtml}</div>
                </div>
              `;
            } else {
              container.innerHTML = `<span style="font-size:11px;color:var(--text-dim)">Sin reseñas</span>`;
            }
          }
        }

        // Aplicar filtros y construir tabla
        this.applyFiltersAndSorting();
      }
    } catch (e) {
      console.error('Error al cargar ratings y rankings:', e);
      const tablePlaceholder = document.getElementById('srv-ranking-table-placeholder');
      if (tablePlaceholder) {
        tablePlaceholder.innerHTML = `<div class="ranking-error" style="text-align:center;padding:40px;color:var(--alerta-ink);background:rgba(178,58,43,0.06);border:1px solid rgba(178,58,43,0.2);border-radius:var(--radius);">Error al cargar datos desde Supabase. Reintente más tarde.</div>`;
      }
    } finally {
      clearTimeout(skeletonTimeout);
    }
  },
};
