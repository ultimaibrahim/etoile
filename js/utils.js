function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── VIEW STATE PERSISTENCE ────────────────────────────── */
const ViewState = {
  KEY: 'lcpViewState',
  _read() {
    try { return JSON.parse(sessionStorage.getItem(this.KEY)) || {}; }
    catch (e) { return {}; }
  },
  get(k, fallback) { const s = this._read(); return (k in s) ? s[k] : fallback; },
  set(k, v) {
    const s = this._read(); s[k] = v;
    try { sessionStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {}
  },
  clear() { try { sessionStorage.removeItem(this.KEY); } catch (e) {} }
};

/* ── UNIFIED MODAL MANAGER ────────────────────────────── */
const ModalManager = {
  _stack: [],
  _ignoreNextPop: false,
  
  open(el, onClose) {
    if (!el) return;
    const activeEl = document.activeElement;
    
    // Congelar scroll de documento estricto (Mandatorio ibrahim-agent-core / reviews-lcp-gdl)
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    
    // Accesibilidad básica
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    
    this._stack.push({ el, onClose, activeElement: activeEl });
    
    // Crear entrada en el historial
    history.pushState({ lcpModal: true }, '');
    
    if (this._stack.length === 1) {
      this._escHandlerBound = this._escHandler.bind(this);
      this._popHandlerBound = this._popHandler.bind(this);
      document.addEventListener('keydown', this._escHandlerBound);
      window.addEventListener('popstate', this._popHandlerBound);
    }
    
    // Mover foco a algún botón de cierre o al contenedor mismo
    setTimeout(() => {
      const closeBtn = el.querySelector('button[class*="close"], button[class*="cerrar"], .btn-close, .modal-close');
      if (closeBtn) closeBtn.focus();
      else el.focus();
    }, 50);
  },
  
  close(fromPop = false) {
    const top = this._stack.pop();
    if (!top) return;
    
    if (!fromPop) {
      this._ignoreNextPop = true;
      history.back();
    }
    
    this._doClose(top);
    if (this._stack.length === 0) this._teardown();
  },
  
  /**
   * Cierra TODOS los paneles abiertos y ejecuta `fn` cuando el historial ya terminó de retroceder.
   * Necesario para "cerrar y navegar": close() llama a history.back() (asíncrono) y, si se navega justo después,
   * el retroceso deshace la navegación. Un solo history.go(-n) cubre también paneles apilados (feed → detalle).
   */
  closeAllThen(fn) {
    const n = this._stack.length;
    if (!n) { fn(); return; }
    const entries = this._stack.splice(0, n).reverse();
    const done = () => { window.removeEventListener('popstate', done); fn(); };
    window.addEventListener('popstate', done);
    entries.forEach(e => this._doClose(e));
    this._teardown();
    history.go(-n);
  },

  _doClose(entry) {
    if (entry.onClose) {
      entry.onClose();
    } else if (entry.el) {
      entry.el.remove();
    }
    
    // Restaurar foco
    if (entry.activeElement && typeof entry.activeElement.focus === 'function') {
      entry.activeElement.focus();
    }
    
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  },
  
  _escHandler(e) {
    if (e.key === 'Escape') {
      this.close(false);
    }
  },
  
  _popHandler() {
    if (this._ignoreNextPop) {
      this._ignoreNextPop = false;
      return;
    }
    const top = this._stack.pop();
    if (top) {
      this._doClose(top);
    }
    if (this._stack.length === 0) this._teardown();
  },
  
  _teardown() {
    document.removeEventListener('keydown', this._escHandlerBound);
    window.removeEventListener('popstate', this._popHandlerBound);
    this._ignoreNextPop = false;
  }
};

/* ── SKELETON RENDERER ─────────────────────────────────── */
function renderSkeleton(container, type = 'card', count = 4) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `<div class="skeleton skeleton-${type}"></div>`).join('');
}

/* ── EMPTY STATE RENDERER ──────────────────────────────── */
function emptyState({ icon = '—', title, hint = '', actionLabel = '', actionAttr = '' }) {
  return `<div class="empty-state">
    <span class="glyph">${icon}</span>
    <p class="es-title">${title}</p>
    ${hint ? `<p class="es-hint">${hint}</p>` : ''}
    ${actionLabel ? `<button class="es-action" ${actionAttr}>${actionLabel}</button>` : ''}
  </div>`;
}

/* ── AVISOS ─────────────────────────────────────────────
 * Un solo aviso para toda la app (banco de movimiento: «aviso que cae»): baja desde arriba con un rebote corto,
 * se queda y se retira hacia arriba. Toast.show(msg, duración) o Toast.show(msg, { type: 'success'|'warn'|'info', duration }).
 */
const Toast = {
  show(message, opts = {}) {
    const { type = 'info', duration = 2800 } = typeof opts === 'number' ? { duration: opts } : opts;
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `lcp-toast lcp-toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 600);   // por si no hay animación (movimiento reducido)
    }, duration);
  }
};

/* ── WHATSAPP SUMMARY SHARING ──────────────────────────── */
function buildBranchSummary(branchMeta, stats) {
  // stats: { avg, totalReviews, negatives, unreplied, topTheme, monthLabel }
  const truncatedTheme = stats.topTheme ? (stats.topTheme.length > 80 ? stats.topTheme.substring(0, 77) + '...' : stats.topTheme) : '';
  return [
    `📊 étoile · ${branchMeta.nombre} · ${stats.monthLabel}`,
    `⭐ Promedio: ${stats.avg.toFixed(2)} (${stats.totalReviews} reseñas)`,
    `🔴 Quejas 1-2★: ${stats.negatives}${stats.unreplied ? ` (${stats.unreplied} sin responder)` : ''}`,
    stats.topTheme ? `⚠️ Tema principal: ${truncatedTheme}` : null,
    `— generado desde etoile.ultimaibrahim.dev`
  ].filter(Boolean).join('\n');
}

async function shareSummary(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return 'failed';
  }
}

/* ── SPARKLINE GENERATOR ───────────────────────────────── */
function sparklineSvg(values, { w = 64, h = 20 } = {}) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(' ');
  const trendUp = values[values.length - 1] >= values[0];
  
  return `<svg class="sparkline ${trendUp ? 'up' : 'down'}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

function starStr(n) {
  const num = Math.round(Number(n) || 0);
  const safeN = Math.max(0, Math.min(5, num));
  return '★'.repeat(safeN) + '☆'.repeat(5 - safeN);
}

/** Reportes de étoile: van al espacio de La Crêpe en SIGNO (privado: se abre en su pestaña, con su propio acceso) */
const SIGNO_REPORT_URL = 'https://signo.ultimaibrahim.dev/e/lcp/reportar?sistema=etoile';

function svgIcon(name) {
  const i = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    barChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16"/><path d="M17 4v16"/><path d="M3 9l4-5 4 5"/><path d="M13 15l4 5 4-5"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    starFilled: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.00 1.00L12.28 10.60L12.55 10.68L12.79 10.81L15.89 8.11L13.19 11.21L13.32 11.45L13.40 11.72L23.00 12.00L13.40 12.28L13.32 12.55L13.19 12.79L15.89 15.89L12.79 13.19L12.55 13.32L12.28 13.40L12.00 23.00L11.72 13.40L11.45 13.32L11.21 13.19L8.11 15.89L10.81 12.79L10.68 12.55L10.60 12.28L1.00 12.00L10.60 11.72L10.68 11.45L10.81 11.21L8.11 8.11L11.21 10.81L11.45 10.68L11.72 10.60Z"/></svg>',   // la Rosa de la Étoile (marca.md)
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12.00 1.00L12.28 10.60L12.55 10.68L12.79 10.81L15.89 8.11L13.19 11.21L13.32 11.45L13.40 11.72L23.00 12.00L13.40 12.28L13.32 12.55L13.19 12.79L15.89 15.89L12.79 13.19L12.55 13.32L12.28 13.40L12.00 23.00L11.72 13.40L11.45 13.32L11.21 13.19L8.11 15.89L10.81 12.79L10.68 12.55L10.60 12.28L1.00 12.00L10.60 11.72L10.68 11.45L10.81 11.21L8.11 8.11L11.21 10.81L11.45 10.68L11.72 10.60Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
    cinema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>',
    fleur: '<svg class="deco-fleur" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C12 2 14.5 6.5 17 8C19.5 9.5 22 10 22 10C22 10 18 11.5 16 14C14 16.5 12 22 12 22C12 22 10 16.5 8 14C6 11.5 2 10 2 10C2 10 4.5 9.5 7 8C9.5 6.5 12 2 12 2Z" /></svg>'
  };
  return i[name] || '';
}

function formatDate(isoString, regionOrBranch) {
  return BranchTime.label(isoString, regionOrBranch, 'date');
}

function formatDateTime(isoString, regionOrBranch) {
  return BranchTime.label(isoString, regionOrBranch, 'long');
}

function isMonthComplete(year, month) {
  const now = new Date();
  const target = new Date(year, month, 0, 23, 59, 59);
  return now > target;
}

function isLastDayOfMonth() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return tomorrow.getMonth() !== now.getMonth();
}

function initReveal() {
  const obs = new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.r').forEach(el => obs.observe(el));
  initSpotlightCards();
  initStagger();
}

/**
 * Entrada escalonada de las tarjetas de una rejilla: cada hija entra una tras otra cuando la rejilla aparece en pantalla.
 * Se activa por JS (si el script no corre, nada queda oculto) y respeta prefers-reduced-motion.
 */
function initStagger() {
  const sel = '.scorecard-grid, .insight-grid, .kt-list, .brand-kpi-grid, .compare-analytics-grid';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('stagger-go'); obs.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(sel).forEach(c => {
    if (c.dataset.stg) return;
    c.dataset.stg = '1';
    [...c.children].forEach((ch, i) => { ch.classList.add('stagger-item'); ch.style.setProperty('--i', Math.min(i, 10)); });
    if (reduce) c.classList.add('stagger-go'); else obs.observe(c);
  });
}

function getBranchById(id) {
  return SUCURSALES_META_ALL.find(s => s.id === id) || SUCURSALES_META.find(s => s.id === id);
}

function getBranchNameToId(name) {
  return SUCURSAL_NAME_MAP[name] || null;
}

function normalizeBranchToken(str) {
  if (!str) return '';
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Memoización: resolveBranchMeta se llama cientos de miles de veces (isSameBranch × reseñas × sucursales) y cada
// llamada normalizaba todos los ids/nombres. Medido: _applyHistoricalRatings bloqueaba el hilo ~2.5 s con 4,775 reseñas.
let _rbmCache = new Map();
let _rbmSource = null;
let _rbmSourceLen = -1;
function resolveBranchMeta(input) {
  if (!input) return null;
  if (_rbmSource !== SUCURSALES_META_ALL || _rbmSourceLen !== SUCURSALES_META_ALL.length) {
    _rbmCache = new Map();
    _rbmSource = SUCURSALES_META_ALL;
    _rbmSourceLen = SUCURSALES_META_ALL.length;
  }
  const key = String(input);
  if (_rbmCache.has(key)) return _rbmCache.get(key);
  const found = _resolveBranchMetaUncached(input);
  _rbmCache.set(key, found);
  return found;
}

function _resolveBranchMetaUncached(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const norm = normalizeBranchToken(raw);
  if (!norm) return null;

  // 1. Coincidencia directa por ID en SUCURSALES_META_ALL
  let found = SUCURSALES_META_ALL.find(s => normalizeBranchToken(s.id) === norm);
  if (found) return found;

  // 2. Coincidencia directa por nombre o abreviatura
  found = SUCURSALES_META_ALL.find(s => 
    normalizeBranchToken(s.nombre) === norm || 
    normalizeBranchToken(s.abr) === norm
  );
  if (found) return found;

  // 3. Coincidencia via SUCURSAL_NAME_MAP
  if (typeof SUCURSAL_NAME_MAP !== 'undefined') {
    if (SUCURSAL_NAME_MAP[raw]) {
      const targetId = SUCURSAL_NAME_MAP[raw];
      found = SUCURSALES_META_ALL.find(s => s.id === targetId);
      if (found) return found;
    }
    
    for (const [key, targetId] of Object.entries(SUCURSAL_NAME_MAP)) {
      if (normalizeBranchToken(key) === norm) {
        found = SUCURSALES_META_ALL.find(s => s.id === targetId);
        if (found) return found;
      }
    }
  }

  // 4. Coincidencia por subcadena/parcial para nombres extensos traídos del scraper
  found = SUCURSALES_META_ALL.find(s => {
    const sIdNorm = normalizeBranchToken(s.id);
    const sNomNorm = normalizeBranchToken(s.nombre);
    const sAbrNorm = normalizeBranchToken(s.abr);
    return norm.includes(sIdNorm) || norm.includes(sNomNorm) || (sAbrNorm.length >= 4 && norm.includes(sAbrNorm));
  });
  if (found) return found;

  return null;
}

function isSameBranch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const metaA = resolveBranchMeta(a);
  const metaB = resolveBranchMeta(b);
  if (metaA && metaB) return metaA.id === metaB.id;
  const idA = metaA ? metaA.id : normalizeBranchToken(a);
  const idB = metaB ? metaB.id : normalizeBranchToken(b);
  return idA === idB;
}

/* ── QUARTER HELPERS ───────────────────────────────────── */
function getQuarterMonths(q) {
  const map = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };
  return map[q] || [];
}

function quarterLabel(q, year) {
  const y = year || new Date().getFullYear();
  return `Q${q} ${y}`;
}

function parseQuarterParam(param) {
  if (!param) return { year: new Date().getFullYear(), quarter: 1 };
  const qMatch = param.match(/Q(\d)/i);
  if (!qMatch) return null;
  const yearMatch = param.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return { year, quarter: parseInt(qMatch[1]) };
}

function getCompletedQuarters(year) {
  const now = new Date();
  const currentYearReal = now.getFullYear();
  const currentMonthReal = now.getMonth() + 1; // 1-12
  
  const completed = [];
  for (let q = 1; q <= 4; q++) {
    const qEndMonth = q * 3; // 3, 6, 9, 12
    if (year < currentYearReal) {
      completed.push(q);
    } else if (year === currentYearReal) {
      if (currentMonthReal > qEndMonth) {
        completed.push(q);
      }
    }
  }
  return completed.length > 0 ? completed : [1]; // Garantiza mostrar al menos Q1
}

/* ── TOPBAR ────────────────────────────────────────────── */
/** Pie del portal (todas las vistas): Étoile, el cliente y el alcance a la izquierda; enlaces al centro; versión y firma.
 *  alcance: texto opcional (región o sucursal) */
function buildFooter(alcance = '') {
  const cliente = typeof CLIENTE !== 'undefined' ? CLIENTE.nombre : '';
  const ver = typeof APP_VERSION !== 'undefined' ? APP_VERSION.label : '';
  const rosa = typeof Rosa !== 'undefined' ? Rosa.html('brilla', { size: 16 }) : '';
  return `
      <footer class="pie-app">
        <div class="pie-app-marca">
          <span class="pie-app-logo">${rosa}<span>étoile</span></span>
          <span>${escapeHtml(cliente)}${alcance ? ` · ${escapeHtml(alcance)}` : ''}</span>
          <span class="pie-app-fuente">Reseñas de Google Business Profile, por hora local de cada sucursal</span>
        </div>
        <nav class="pie-app-links" aria-label="Pie de página">
          <a href="#/acerca">Acerca de</a>
          <a href="#/privacidad">Privacidad</a>
          <a href="/info/">Qué es Étoile</a>
          <a href="${SIGNO_REPORT_URL}" target="_blank" rel="noopener">Reportar un problema</a>
        </nav>
        <div class="pie-app-firma">
          ${ver ? `<span class="num">v${escapeHtml(ver)}</span>` : ''}
          <a href="https://ultimaibrahim.dev" rel="noopener">Un sistema de&nbsp;<b>Ultima Ibrahim</b></a>
        </div>
      </footer>`;
}

function buildTopbar(showBack = false, branchName = '', isCorporate = false) {
  const currentHash = window.location.hash;
  const isHome = currentHash === '#/' || currentHash === '';
  const isDash = currentHash === '#/dashboards';
  const isCompare = currentHash.startsWith('#/comparar') || currentHash.startsWith('#/compare');
  const isAbout = currentHash.startsWith('#/acerca');

  const back = showBack
    ? `<button class="topbar-back" onclick="window.history.back()">${svgIcon('arrow')}<span>Atrás</span></button>`
    : '';
  // Marca: la Rosa y «étoile»; a su lado, el cliente de esta instalación. En una ficha, el nombre de la sucursal
  const rosaMarca = typeof Rosa !== 'undefined' ? Rosa.html('brilla', { size: 20, cls: 'topbar-rosa' }) : '';
  const cliente = typeof CLIENTE !== 'undefined' ? `<span class="topbar-cliente">${escapeHtml(CLIENTE.nombre)}</span>` : '';
  const titleArea = showBack
    ? `<span class="topbar-brand topbar-brand--ficha"><span class="accent">${branchName}</span></span>`
    : `<a href="#/" class="topbar-brand" aria-label="étoile, inicio">${rosaMarca}<span class="accent">étoile</span>${cliente}</a>`;

  const showDashboards = typeof SUCURSALES_META !== 'undefined' && SUCURSALES_META.length > 1;
  // Cuenta de tienda: acceso directo a la ficha de su sucursal
  const myBranch = typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated() && AppAuth.getUserRole() === 'gerente' ? AppAuth.getUserSucursal() : null;
  const myBranchLink = myBranch && typeof resolveBranchMeta === 'function' && resolveBranchMeta(myBranch)
    ? `<a href="#/sucursal/${encodeURIComponent(resolveBranchMeta(myBranch).id)}" class="topbar-link ${currentHash === '#/sucursal/' + resolveBranchMeta(myBranch).id ? 'active' : ''}" title="Mi sucursal">${svgIcon('store')} <span>Mi sucursal</span></a>`
    : '';

  let nav = '';
  let desktopNav = '';
  if (isCorporate) {
    const activeTab = (window.BrandView && window.BrandView.activeTab) || 'resumen';
    nav = `<nav class="topbar-nav" id="mainNav">
      <button class="topbar-link ${activeTab === 'resumen' ? 'active' : ''}" onclick="BrandView.switchTab('resumen')" style="background:none; border:none; cursor:pointer;" title="Resumen General">${svgIcon('home')} <span>Resumen</span></button>
      <button class="topbar-link ${activeTab === 'comparativa' ? 'active' : ''}" onclick="BrandView.switchTab('comparativa')" style="background:none; border:none; cursor:pointer;" title="Comparativa">${svgIcon('barChart')} <span>Comparativa</span></button>
      <button class="topbar-link ${activeTab === 'alertas' ? 'active' : ''}" onclick="BrandView.switchTab('alertas')" style="background:none; border:none; cursor:pointer;" title="Alertas Críticas">${svgIcon('alert')} <span>Alertas Nac.</span></button>
    </nav>`;

    desktopNav = `
      <div class="topbar-nav topbar-nav--desktop" id="mainNavDesktop">
        <button class="topbar-link ${activeTab === 'resumen' ? 'active' : ''}" onclick="BrandView.switchTab('resumen')" style="background:none; border:none; cursor:pointer;" title="Resumen General">${svgIcon('home')} <span>Resumen</span></button>
        <button class="topbar-link ${activeTab === 'comparativa' ? 'active' : ''}" onclick="BrandView.switchTab('comparativa')" style="background:none; border:none; cursor:pointer;" title="Comparativa">${svgIcon('barChart')} <span>Comparativa</span></button>
        <button class="topbar-link ${activeTab === 'alertas' ? 'active' : ''}" onclick="BrandView.switchTab('alertas')" style="background:none; border:none; cursor:pointer;" title="Alertas Críticas">${svgIcon('alert')} <span>Alertas Nac.</span></button>
      </div>
    `;
  } else {
    nav = `<nav class="topbar-nav" id="mainNav">
      <a href="#/" class="topbar-link ${isHome ? 'active' : ''}" title="Inicio">${svgIcon('home')} <span>Inicio</span></a>
      ${myBranchLink}
      ${showDashboards ? `<a href="#/dashboards" class="topbar-link ${isDash ? 'active' : ''}" title="Gráficas">${svgIcon('barChart')} <span>Dashboards</span></a>` : ''}
      <a href="#/comparar" class="topbar-link ${isCompare ? 'active' : ''}" title="Comparar">${svgIcon('chart')} <span>Comparar</span></a>
      <a href="#/acerca" class="topbar-link ${isAbout ? 'active' : ''}" title="Acerca de">${svgIcon('info')} <span>Acerca de</span></a>
    </nav>`;

    desktopNav = `
      <div class="topbar-nav topbar-nav--desktop" id="mainNavDesktop">
        <a href="#/" class="topbar-link ${isHome ? 'active' : ''}" title="Inicio">${svgIcon('home')} <span>Inicio</span></a>
        ${myBranchLink}
        ${showDashboards ? `<a href="#/dashboards" class="topbar-link ${isDash ? 'active' : ''}" title="Gráficas">${svgIcon('barChart')} <span>Dashboards</span></a>` : ''}
        <a href="#/comparar" class="topbar-link ${isCompare ? 'active' : ''}" title="Comparar">${svgIcon('chart')} <span>Comparar</span></a>
        <a href="#/acerca" class="topbar-link ${isAbout ? 'active' : ''}" title="Acerca de">${svgIcon('info')} <span>Acerca de</span></a>
      </div>
    `;
  }

  // Botón de regreso a selección de región
  let backToSelectBtn = '';
  let backToSelectBtnMobile = '';
  if (typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated()) {
    const role = AppAuth.getUserRole();
    if (['corporate', 'admin', 'director', 'regional', 'zonal'].includes(role)) {
      backToSelectBtn = `
        <a href="#/select-region" class="topbar-pill" title="Volver a la selección de región">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>Regiones</span>
        </a>
      `;
      backToSelectBtnMobile = `
        <a href="#/select-region" class="topbar-mobile-link" onclick="window.toggleMobileMenu()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>Regiones</span>
        </a>
      `;
    }
  }

  // Selector de región para administradores, regionales y zonales
  let regionSelect = '';
  let regionSelectMobile = '';
  if (!isCorporate && typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated()) {
    const role = AppAuth.getUserRole();
    if (['corporate', 'admin', 'regional', 'zonal'].includes(role)) {
      const activeName = (typeof REGION_NAME_MAP !== 'undefined' && REGION_NAME_MAP[activeRegion]) || activeRegion;
      const optionsHtml = Object.entries(typeof REGION_NAME_MAP !== 'undefined' ? REGION_NAME_MAP : { 'GDL': 'Guadalajara', 'CDMX': 'CDMX' })
        .map(([id, name]) => {
          const isActive = id === activeRegion ? ' active' : '';
          return `<div class="custom-option${isActive}" data-value="${id}" onclick="handleRegionChange('${id}')">${name}</div>`;
        })
        .join('');
      regionSelect = `
        <div class="custom-select" id="topbarRegionDropdown">
          <button class="custom-select-trigger topbar-pill" onclick="event.stopPropagation(); document.getElementById('topbarRegionDropdown').classList.toggle('open');">
            <span class="custom-select-value">${activeName}</span>
            <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="custom-select-options" style="right: 0; left: auto;">
            ${optionsHtml}
          </div>
        </div>
      `;
      regionSelectMobile = `
        <div class="topbar-mobile-select-wrap" style="display: flex; flex-direction: column; gap: 6px; padding: 10px 16px;">
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-dim);">Región</span>
          <div class="custom-select" id="topbarRegionDropdownMobile" style="width: 100%;">
            <button class="custom-select-trigger" onclick="event.stopPropagation(); document.getElementById('topbarRegionDropdownMobile').classList.toggle('open');" style="width: 100%; justify-content: space-between; background: var(--surface-2); border-color: var(--border-strong);">
              <span class="custom-select-value" style="color: var(--text);">${activeName}</span>
              <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="custom-select-options" style="width: 100%; left: 0;">
              ${Object.entries(typeof REGION_NAME_MAP !== 'undefined' ? REGION_NAME_MAP : { 'GDL': 'Guadalajara', 'CDMX': 'CDMX' })
                .map(([id, name]) => `<div class="custom-option${id === activeRegion ? ' active' : ''}" data-value="${id}" onclick="handleRegionChange('${id}'); window.toggleMobileMenu();">${name}</div>`)
                .join('')}
            </div>
          </div>
        </div>
      `;
    }
  }

  // Botón de cerrar sesión
  let logoutBtn = '';
  let logoutBtnMobile = '';
  if (typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated()) {
    logoutBtn = `
      <button class="topbar-logout" onclick="AppAuth.logout()" title="Cerrar sesión" aria-label="Cerrar sesión">
        ${svgIcon('logout')}
      </button>
    `;
    logoutBtnMobile = `
      <a class="topbar-mobile-link" href="${SIGNO_REPORT_URL}" target="_blank" rel="noopener">
        ${svgIcon('flag')}
        <span>Reportar un problema</span>
      </a>
      <button class="topbar-mobile-link" onclick="AppAuth.logout(); window.toggleMobileMenu();" style="border:none; background:none; text-align:left; width:100%; cursor:pointer; color:inherit;">
        ${svgIcon('logout')}
        <span>Cerrar Sesión</span>
      </button>
    `;
  }

  // Registrar handler para menú móvil si no existe
  if (!window.toggleMobileMenu) {
    window.toggleMobileMenu = (e) => {
      if (e) e.stopPropagation();
      const dropdown = document.getElementById('topbarMobileDropdown');
      if (dropdown) {
        dropdown.classList.toggle('active');
        const hamburger = document.querySelector('.topbar-hamburger');
        if (hamburger) {
          hamburger.classList.toggle('active');
        }
      }
    };
    
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('topbarMobileDropdown');
      const hamburger = document.querySelector('.topbar-hamburger');
      if (dropdown && dropdown.classList.contains('active')) {
        if (!dropdown.contains(e.target) && !hamburger.contains(e.target)) {
          dropdown.classList.remove('active');
          if (hamburger) hamburger.classList.remove('active');
        }
      }
      // Cerrar dropdowns de región al hacer clic fuera
      document.querySelectorAll('.custom-select.open').forEach(ds => {
        if (!ds.contains(e.target)) {
          ds.classList.remove('open');
        }
      });
    });
  }

  const header = `
    <header class="topbar">
      <div class="topbar-left">${back}${titleArea}</div>
      <div class="topbar-right">
        ${desktopNav}
        <div class="topbar-actions">
          ${backToSelectBtn}
          ${regionSelect}
          ${typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated() ? `<a class="dark-toggle" href="${SIGNO_REPORT_URL}" target="_blank" rel="noopener" title="Reportar un problema o sugerir algo (SIGNO)" aria-label="Reportar un problema (abre SIGNO en otra pestaña)">${svgIcon('flag')}</a>` : ''}
          <button class="dark-toggle" onclick="toggleDark()" aria-label="Cambiar tema">${darkMode ? svgIcon('sun') : svgIcon('moon')}</button>
          ${logoutBtn}
        </div>
        
        <!-- Botón hamburguesa para móviles -->
        <button class="topbar-hamburger" onclick="window.toggleMobileMenu(event)" aria-label="Menú">
          <svg class="hamburger-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line class="line-top" x1="3" y1="6" x2="21" y2="6"></line>
            <line class="line-mid" x1="3" y1="12" x2="21" y2="12"></line>
            <line class="line-bot" x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Menú desplegable móvil colapsable -->
      <div class="topbar-mobile-dropdown" id="topbarMobileDropdown">
        <a href="#/comparar" class="topbar-mobile-link" onclick="window.toggleMobileMenu();">
          ${svgIcon('chart')}
          <span>Comparar Tiendas</span>
        </a>
        ${backToSelectBtnMobile}
        ${regionSelectMobile}
        <button class="topbar-mobile-link" onclick="toggleDark(); window.toggleMobileMenu();" style="border:none; background:none; text-align:left; width:100%; cursor:pointer;">
          ${darkMode ? svgIcon('sun') : svgIcon('moon')}
          <span>Tema: ${darkMode ? 'Claro' : 'Oscuro'}</span>
        </button>
        ${logoutBtnMobile}
      </div>
    </header>${nav}
  `;

  return header;
}

function showRegionTransitionLoader(titleText, subtitleText, callback) {
  let loader = document.getElementById('region-transition-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'region-transition-loader';
    loader.className = 'region-transition-loader';
    loader.innerHTML = `
      <div class="region-transition-content">
        ${typeof Rosa !== 'undefined' ? Rosa.html('brilla', { size: 34, cls: 'region-transition-star' }) : ''}
        <h1 class="region-transition-title" id="region-transition-title"></h1>
        <p class="region-transition-subtitle" id="region-transition-subtitle"></p>
      </div>
    `;
    document.body.appendChild(loader);
  }

  document.getElementById('region-transition-title').textContent = titleText;
  document.getElementById('region-transition-subtitle').textContent = subtitleText;

  // Forzar reflow
  loader.getBoundingClientRect();
  loader.classList.add('active');
  document.body.style.overflow = 'hidden';

  // El telón se mantiene hasta que la vista de destino ya se pintó (evento del Router), con mínimo de animación
  // y un tope de seguridad. Antes subía a los 1100 ms fijos y dejaba ver la pantalla anterior mientras cargaba.
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const routeRendered = new Promise(resolve => {
    const done = () => { window.removeEventListener('etoile:route-rendered', done); resolve(); };
    window.addEventListener('etoile:route-rendered', done);
    setTimeout(done, 10000);
  });

  // La carga empieza en cuanto el telón cubre la pantalla (su fundido dura 300 ms); antes esperaba 800 ms fijos.
  const work = (async () => {
    await sleep(320);
    try {
      if (callback) {
        await callback();
        await routeRendered;
      }
    } catch (e) {
      console.error('[RegionTransition] Error en la transición:', e);
    }
  })();

  Promise.all([sleep(700), work]).then(() => {   // mínimo: que la estrella termine de entrar
    document.body.style.overflow = '';
    window.scrollTo({ top: 0, behavior: 'instant' });   // la vista nueva se descubre desde arriba (con el body bloqueado, el scroll de la anterior seguía ahí)
    loader.classList.remove('active');
    setTimeout(() => {
      if (loader && loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
      document.body.style.overflow = '';
    }, 300);
  });
}

async function handleRegionChange(region) {
  if (typeof DataLoader !== 'undefined') {
    const regionName = getRegionName(region);
    showRegionTransitionLoader(regionName, 'Accediendo al panel regional...', async () => {
      await DataLoader.switchRegion(region);
      Router.resolve();
    });
  }
}


function createSparklineSVG(data, width = 120, height = 36, color = '#6B907D') {
  if (!Array.isArray(data) || data.length < 2) {
    return `<svg width="${width}" height="${height}" class="sparkline"></svg>`;
  }
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const padding = 2;
  
  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * (width - 2 * padding) + padding;
    const y = range === 0 
      ? height / 2 
      : height - padding - ((val - min) / range) * (height - 2 * padding);
    return { x, y };
  });

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  const fillD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const gradId = `spark-grad-${Math.random().toString(36).substr(2, 9)}`;

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline" style="overflow: visible;">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${fillD}" fill="url(#${gradId})" />
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="3" fill="${color}" />
    </svg>
  `;
}

/**
 * Abre una Bottom Sheet (hoja deslizante inferior) en móvil.
 * @param {string} title - Título de la Bottom Sheet.
 * @param {Array<{value: any, label: string, active: boolean}>} options - Opciones a mostrar.
 * @param {Function} onSelect - Callback que recibe la opción seleccionada.
 */
function showBottomSheet(title, options, onSelect) {
  const existing = document.getElementById('globalBottomSheet');
  if (existing) existing.remove();

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const optionsHtml = options.map(opt => {
    const activeClass = opt.active ? ' active' : '';
    const checkIcon = opt.active ? svgIcon('check') : '';
    return `
      <div class="bottom-sheet-option${activeClass}" data-value="${opt.value}">
        <span>${opt.label}</span>
        <span class="bottom-sheet-check">${checkIcon}</span>
      </div>
    `;
  }).join('');

  const html = `
    <div class="bottom-sheet-overlay" id="globalBottomSheet">
      <div class="bottom-sheet-container">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-header">
          <h3 class="bottom-sheet-title">${title}</h3>
          <button class="bottom-sheet-close" id="closeBottomSheetBtn">×</button>
        </div>
        <div class="bottom-sheet-options">
          ${optionsHtml}
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const overlay = document.getElementById('globalBottomSheet');

  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  const closeBottomSheet = () => {
    overlay.classList.remove('active');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    setTimeout(() => {
      overlay.remove();
    }, 300);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBottomSheet();
  });
  document.getElementById('closeBottomSheetBtn').addEventListener('click', closeBottomSheet);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeBottomSheet();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  overlay.querySelectorAll('.bottom-sheet-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.getAttribute('data-value');
      onSelect(val);
      closeBottomSheet();
    });
  });
}

/**
 * Retorna información del último mes concluido disponible en los datos si ya pasó cronológicamente.
 */
function getConcludedMonthInfo() {
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1; // 1-indexed (1-12)
  const curDay = today.getDate(); // 1-31
  
  if (!DataLoader || !DataLoader.manifest) return null;
  
  // 1. Durante los primeros 7 días del mes, forzar a que el mes concluido sea el mes calendario anterior
  if (curDay <= 7) {
    const targetMonth = curMonth === 1 ? 12 : curMonth - 1;
    const targetYear = curMonth === 1 ? curYear - 1 : curYear;
    
    if (DataLoader.hasMonth(targetYear, targetMonth)) {
      return { year: targetYear, month: targetMonth };
    }
  }
  
  // 2. A partir del día 8, usar lógica histórica (último disponible en manifest si ya pasó cronológicamente)
  const years = Object.keys(DataLoader.manifest).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return null;
  const latestYear = years[0];
  const months = [...DataLoader.manifest[latestYear]].sort((a, b) => b - a);
  if (months.length === 0) return null;
  const latestMonth = months[0];
  
  if (curYear > latestYear || (curYear === latestYear && curMonth > latestMonth)) {
    return { year: latestYear, month: latestMonth };
  }
  return null;
}

/**
 * Abre el modal con el resumen ejecutivo del mes concluido.
 */
function showConcludedMonthModal(year, month) {
  const monthName = MONTH_NAMES[month - 1];
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Obtener estadísticas
  const currGlobal = DataLoader.getGlobalStats(year, month);
  const currStats = DataLoader.getAllBranchStats(year, month);

  // Mes anterior para comparativas
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  const hasPrev = DataLoader.hasMonth(prevYear, prevMonth);
  const prevGlobal = hasPrev ? DataLoader.getGlobalStats(prevYear, prevMonth) : { totalReviews: 0, avgRating: 0 };

  // Construir datos de sucursales en el mes concluido
  const branchesData = SUCURSALES_META.map(meta => {
    const c = currStats[meta.id] || { avg: 0, count: 0, negativeCount: 0 };
    return {
      ...meta,
      score: c.avg,
      count: c.count,
      negativeCount: c.negativeCount
    };
  });

  const activeBranches = branchesData.filter(b => b.count > 0);

  // Brillo de cada tienda al cierre (marca.md): el líder sale del brillo ajustado, que pide evidencia
  const brillo = DataLoader.brillo(year, month, SUCURSALES_META.map(m => m.id));
  branchesData.forEach(b => { b.brillo = brillo[b.id]; b.estado = brillo[b.id].estado; });
  const sortedForLeader = Brillo.ordena(activeBranches);
  
  const sortedByScoreAsc = [...activeBranches].sort((a, b) => {
    // Si la calificación es 0, ponerla al final para no distorsionar como crítica
    if (a.score === 0) return 1;
    if (b.score === 0) return -1;
    return a.score - b.score;
  });

  const sucursalLider = sortedForLeader[0] || null;
  const sucursalCritica = sortedByScoreAsc[0] || null;

  // Contador de quejas desatendidas
  const data = DataLoader.getMonth(year, month);
  const reviews = data ? data.reviews : [];
  const unrepliedCount = reviews.filter(r => Metrics.isComplaint(r) && (!r.responseFromOwnerText || r.responseFromOwnerText.trim() === '')).length;
  const totalNegatives = reviews.filter(r => Metrics.isComplaint(r)).length;

  // Comparativas de KPIs
  const scoreDiff = currGlobal.avgRating - prevGlobal.avgRating;
  const scoreDiffStr = scoreDiff >= 0 ? `+${scoreDiff.toFixed(2)}` : `${scoreDiff.toFixed(2)}`;
  
  const reviewsDiff = currGlobal.totalReviews - prevGlobal.totalReviews;
  const reviewsDiffStr = reviewsDiff >= 0 ? `+${reviewsDiff}` : `${reviewsDiff}`;

  const modalHtml = `
    <div class="modal-overlay active" id="concludedMonthModal" onclick="if(event.target === this) { this.remove(); document.documentElement.style.overflow = ''; document.body.style.overflow = ''; }">
      <div class="modal-box" style="max-width: 680px; width: 90%;">
        <div class="modal-header">
          <div>
            <span class="cmb-badge" style="margin-bottom:4px; background: var(--verde); color: var(--sobre-acento); border: 1px solid rgba(255,255,255,0.15); display: inline-block;">Análisis Operativo GDL</span>
            <h2 class="modal-title" style="font-family: var(--serif); font-size: 24px; color: var(--text); margin: 0;">Resumen Ejecutivo — ${capitalizedMonth} ${year}</h2>
          </div>
          <button class="modal-close" onclick="document.getElementById('concludedMonthModal').remove(); document.documentElement.style.overflow = ''; document.body.style.overflow = '';">×</button>
        </div>
        <div class="modal-body" style="padding-top:16px;">
          
          <!-- Métricas Macro -->
          <div class="scorecard-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px;">
            <div class="scorecard status-optimal" style="padding: 14px; background: var(--surface-2); display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border);">
              <div class="sc-label" style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Rating Promedio</div>
              <div class="sc-value num" style="font-size:28px; margin: 6px 0; color:var(--text); font-weight:700;">${currGlobal.avgRating.toFixed(2)}★</div>
              <div class="sc-sub" style="font-size:10px; color:${scoreDiff >= 0 ? 'var(--verde)' : 'var(--rojo-soft)'}; font-weight: 600;">
                ${scoreDiff >= 0 ? '↑' : '↓'} ${scoreDiffStr} vs ${MONTH_NAMES[prevMonth - 1] || ''}
              </div>
            </div>
            <div class="scorecard status-optimal" style="padding: 14px; background: var(--surface-2); display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border);">
              <div class="sc-label" style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Volumen Reseñas</div>
              <div class="sc-value num" style="font-size:28px; margin: 6px 0; color:var(--text); font-weight:700;">${currGlobal.totalReviews}</div>
              <div class="sc-sub" style="font-size:10px; color:${reviewsDiff >= 0 ? 'var(--verde)' : 'var(--rojo-soft)'}; font-weight: 600;">
                ${reviewsDiff >= 0 ? '↑' : '↓'} ${reviewsDiffStr} vs ${MONTH_NAMES[prevMonth - 1] || ''}
              </div>
            </div>
            <div class="scorecard status-${totalNegatives > 0 ? 'critical' : 'optimal'}" style="padding: 14px; background: var(--surface-2); display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border);">
              <div class="sc-label" style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Críticas (1-2★)</div>
              <div class="sc-value num" style="font-size:28px; margin: 6px 0; color: ${totalNegatives > 0 ? 'var(--rojo-soft)' : 'var(--verde)'}; font-weight:700;">${totalNegatives}</div>
              <div class="sc-sub" style="font-size:10px; color:var(--text-muted);">
                ${totalNegatives > 0 ? `${unrepliedCount} sin responder` : 'Todas respondidas'}
              </div>
            </div>
          </div>

          <!-- Sucursales Destacadas -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 20px;">
            ${sucursalLider ? `
              <div class="proactive-alert-card optimal" style="margin:0; padding:16px;">
                <div class="pac-header">
                  <div class="pac-title-wrap">
                    <span class="pac-icon" style="color: var(--verde-ink);">${svgIcon('starFilled')}</span>
                    <span class="pac-branch">${sucursalLider.nombre}</span>
                  </div>
                  <span class="pac-tag" style="background: rgba(61, 90, 71, 0.1); color: var(--verde-ink); font-size: 9px; font-weight: 700;">Líder</span>
                </div>
                <p class="pac-desc" style="font-size: 12px; margin-top: 8px; color:var(--text);">
                  Promedio de <strong>${sucursalLider.score.toFixed(2)} ★</strong> en ${sucursalLider.count} opiniones. Máximo desempeño regional del periodo.
                </p>
              </div>
            ` : ''}
            
            ${sucursalCritica && sucursalCritica.score < KpiMeta.ratingMinimo && sucursalCritica.id !== sucursalLider?.id ? `
              <div class="proactive-alert-card critical" style="margin:0; padding:16px;">
                <div class="pac-header">
                  <div class="pac-title-wrap">
                    <span class="pac-icon" style="color: var(--rojo-soft);">${svgIcon('alert')}</span>
                    <span class="pac-branch">${sucursalCritica.nombre}</span>
                  </div>
                  <span class="pac-tag" style="background: rgba(198, 40, 40, 0.1); color: var(--rojo-soft); font-size: 9px; font-weight: 700;">Bajo Rendimiento</span>
                </div>
                <p class="pac-desc" style="font-size: 12px; margin-top: 8px; color:var(--text);">
                  Promedio de <strong>${sucursalCritica.score.toFixed(2)} ★</strong> en ${sucursalCritica.count} opiniones. Foco prioritario de atención operativa.
                </p>
              </div>
            ` : `
              <div class="proactive-alert-card optimal" style="margin:0; padding:16px;">
                <div class="pac-header">
                  <div class="pac-title-wrap">
                    <span class="pac-icon" style="color: var(--verde-ink);">${svgIcon('check')}</span>
                    <span class="pac-branch">Cumplimiento Regional</span>
                  </div>
                  <span class="pac-tag" style="background: rgba(61, 90, 71, 0.1); color: var(--verde-ink); font-size: 9px; font-weight: 700;">100% Ok</span>
                </div>
                <p class="pac-desc" style="font-size: 12px; margin-top: 8px; color:var(--text);">
                  ¡Felicidades! Todas las sucursales activas superaron el mínimo regional de <strong>${KpiMeta.ratingMinimo.toFixed(2)} ★</strong> en este periodo.
                </p>
              </div>
            `}
          </div>

          <!-- Cómo cerró cada tienda: estado y una señal; la que cerró en la meta gana su carta de 24 horas -->
          <div class="rep-cielo">
            <div class="rep-cielo-tit">Cómo cerró cada tienda</div>
            ${Brillo.ordena(branchesData).map(b => {
              const br = b.brillo, meta = br.estado.id === 'brilla' || br.estado.id === 'polar';
              const e = Rosa.deTienda(br.estado, br.senal, br.inicio);
              if (meta) e.carta = 1;
              return `<a class="rep-fila" href="#/sucursal/${b.id}">${Rosa.html(e, { size: 30, label: br.lectura })}<span class="rep-nom"><b>${escapeHtml(b.nombre)}</b><i>${escapeHtml(br.lectura)}${br.senal ? ` · ${escapeHtml(Brillo.NOMBRE_SENAL[br.senal].toLowerCase())}` : ''}${meta ? ' · cerró en la meta' : ''}</i></span><span class="rep-num num">${b.count ? b.score.toFixed(2) : '—'}</span></a>`;
            }).join('')}
          </div>

          <!-- Recomendaciones accionables -->
          <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; letter-spacing: 0.05em;">
              Acciones Recomendadas para Operaciones
            </div>
            <ul style="margin:0; padding-left:18px; font-size:13px; color:var(--text); line-height:1.6; list-style-type:disc;">
              ${totalNegatives > 0 ? `
                <li style="margin-bottom:8px;">
                  <strong>Marketing & Respuesta:</strong> Hay <strong>${unrepliedCount}</strong> opiniones críticas (1-2★) sin respuesta del propietario de este mes. Responder a la brevedad en Google Business Profile.
                </li>
              ` : `
                <li style="margin-bottom:8px;">
                  <strong>Marketing & Respuesta:</strong> ¡Excelente! Sin quejas pendientes de respuesta de este mes.
                </li>
              `}
              ${sucursalCritica && sucursalCritica.score < 4.60 ? `
                <li style="margin-bottom:8px;">
                  <strong>Operación Local:</strong> Implementar plan de mejora y revisión de servicio en <strong>${sucursalCritica.nombre}</strong> para revertir el promedio de ${sucursalCritica.score.toFixed(2)}★.
                </li>
              ` : ''}
              ${sucursalLider ? `
                <li>
                  <strong>Reconocimiento:</strong> Compartir las buenas prácticas y felicitar al equipo de <strong>${sucursalLider.nombre}</strong> por su promedio de ${sucursalLider.score.toFixed(2)}★.
                </li>
              ` : ''}
            </ul>
          </div>

        </div>
      </div>
    </div>
  `;

  // El resumen ahora vive en el Drawer único (mismo panel, Esc, botón "atrás" y scroll que el resto de la app)
  const tpl = document.createElement('template');
  tpl.innerHTML = modalHtml.trim();
  const bodyEl = tpl.content.querySelector('.modal-body');
  Drawer.open({
    id: 'concludedMonthModal',
    title: `Resumen Ejecutivo — ${capitalizedMonth} ${year}`,
    subtitle: `Análisis operativo · ${typeof getRegionName === 'function' ? getRegionName(activeRegion) : ''}`,
    bodyHtml: bodyEl ? bodyEl.innerHTML : ''
  });
}

/** Recorrido guiado y bienvenida: apagados por decisión de Ibrahim (2026-10-20); se retoman en otra versión.
 *  Con false, ni Inicio ni la ficha lo abren y «Acerca de» no ofrece verlo de nuevo */
const RECORRIDO_ACTIVO = false;

const LcpWalkthrough = {
  currentStep: 0,
  activeTour: 'home',
  
  homeSteps: [
    {
      target: null,
      title: "Bienvenido a étoile",
      body: "Étoile lee lo que dicen los clientes de cada sucursal. Te mostramos en un minuto dónde está lo importante."
    },
    {
      target: ".hero",
      title: "Desempeño Regional",
      body: "Aquí visualizas el promedio actual de la región, el volumen de opiniones recibidas y las alertas críticas de un vistazo."
    },
    {
      target: ".scorecard-grid",
      title: "Indicadores de operación",
      body: "Monitorea el cumplimiento de las metas del mes: volumen mínimo, calidad de reseñas y la tasa de respuesta a quejas."
    },
    {
      target: ".branch-controls-bar",
      title: "Filtros y Búsqueda",
      body: "Utiliza estos controles para buscar sucursales específicas, filtrarlas por estado (en alerta o estables) y ordenarlas a tu conveniencia."
    },
    {
      target: ".review-feed-carousel-outer",
      title: "Actividad Reciente",
      body: "El feed de opiniones te muestra en tiempo real lo que dicen tus clientes. Puedes hacer clic en cualquier reseña para ver el detalle."
    }
  ],

  branchSteps: [
    {
      target: null,
      title: "Auditoría de Sucursal",
      body: "Bienvenido a la vista de detalle de sucursal. Aquí analizaremos el comportamiento de tu tienda en el periodo seleccionado."
    },
    {
      target: ".branch-hero",
      title: "Desempeño del Mes",
      body: "Visualiza el nombre de la sucursal, su promedio histórico en estrellas y cambia el mes activo desde el selector desplegable."
    },
    {
      target: ".scorecard-grid",
      title: "Indicadores de la sucursal",
      body: "Mide el volumen de opiniones, la calidad del texto y el promedio mensual de tu tienda contra los objetivos operativos."
    },
    {
      target: ".rating-progress-banner",
      title: "Progreso Histórico",
      body: "Esta sección calcula dinámicamente cuántas calificaciones perfectas (5 estrellas) consecutivas necesita recibir tu sucursal para elevar su promedio histórico al siguiente décimo."
    },
    {
      target: ".proactive-alerts-grid",
      title: "Áreas de Oportunidad",
      body: "Análisis automático de quejas críticas clasificado en Servicio, Calidad y Precio. Haz clic en las tarjetas en rojo para auditar los comentarios directamente."
    },
    {
      target: ".reviews-panel",
      title: "Opiniones del Periodo",
      body: "El listado de comentarios del mes con su calificación, fecha de publicación y texto original. Usa el botón para mostrar todas si hay más de 5."
    }
  ],

  get steps() {
    return this.activeTour === 'branch' ? this.branchSteps : this.homeSteps;
  },

  start() {
    const hash = window.location.hash;
    if (hash.startsWith('#/sucursal/')) {
      this.activeTour = 'branch';
    } else {
      this.activeTour = 'home';
    }
    this.currentStep = 0;
    this.showStep();
  },

  _animFrameId: null,
  _currentRect: null,
  _targetRect: null,
  _listenersAttached: false,

  showStep() {
    this.cleanup();

    if (this.currentStep >= this.steps.length) {
      this.finish();
      return;
    }

    const step = this.steps[this.currentStep];
    
    let overlay = document.getElementById('walkthroughOverlay');
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.id = 'walkthroughOverlay';
      overlay.className = 'walkthrough-overlay';
      document.body.appendChild(overlay);
      setTimeout(() => overlay.classList.add('active'), 10);
    }

    let targetEl = null;
    if (step.target) {
      targetEl = document.querySelector(step.target);
      if (targetEl) {
        targetEl.classList.add('walkthrough-highlight');
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // Calcular el target rect inicial/objetivo para el Lerp
    this.updateTargetRect(targetEl);

    // Iniciar bucle de animación si no está corriendo
    if (!this._animFrameId) {
      this.startAnimationLoop();
    }

    // Adjuntar listeners de redibujado dinámico al scroll o resize
    if (!this._listenersAttached) {
      this._resizeHandler = () => {
        const activeTarget = this.steps[this.currentStep]?.target 
          ? document.querySelector(this.steps[this.currentStep].target) 
          : null;
        this.updateTargetRect(activeTarget);
      };
      window.addEventListener('resize', this._resizeHandler);
      window.addEventListener('scroll', this._resizeHandler, { passive: true });
      this._listenersAttached = true;
    }

    const tooltip = document.createElement('div');
    tooltip.id = 'walkthroughTooltip';
    tooltip.className = 'walkthrough-tooltip';
    
    const isLast = this.currentStep === this.steps.length - 1;
    const stepIndicator = `Paso ${this.currentStep + 1} de ${this.steps.length}`;
    
    const isFirst = this.currentStep === 0;
    const backBtn = isFirst ? '' : '<button class="walkthrough-btn back" onclick="LcpWalkthrough.prev()">← Anterior</button>';
    
    tooltip.innerHTML = `
      <div class="walkthrough-tooltip-title">
        <span>${step.title}</span>
        <span class="walkthrough-tooltip-step">${stepIndicator}</span>
      </div>
      <div class="walkthrough-tooltip-body">${step.body}</div>
      <div class="walkthrough-tooltip-actions">
        <button class="walkthrough-btn skip" onclick="LcpWalkthrough.skip()">${isLast ? 'Cerrar' : 'Saltar'}</button>
        <div style="display:flex;gap:8px;align-items:center;">
          ${backBtn}
          <button class="walkthrough-btn next" onclick="LcpWalkthrough.next()">${isLast ? 'Finalizar' : 'Siguiente'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(tooltip);
    
    // Posicionamiento inmediato e inicial
    setTimeout(() => {
      this.positionTooltip(targetEl, tooltip);
      tooltip.classList.add('active');
    }, 50);
  },

  updateTargetRect(targetEl) {
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const padding = 12;
      this._targetRect = {
        x: rect.left - padding,
        y: rect.top - padding,
        w: rect.width + (padding * 2),
        h: rect.height + (padding * 2)
      };
      
      // Si es el primer elemento con spotlight, inicializamos el rect actual en su lugar
      if (!this._currentRect) {
        this._currentRect = { ...this._targetRect };
      }
    } else {
      this._targetRect = null;
    }
  },

  startAnimationLoop() {
    const loop = () => {
      this._animFrameId = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  },

  tick() {
    const canvas = document.getElementById('walkthroughOverlay');
    if (!canvas) return;

    // Actualizar coordenadas dinámicas en tiempo real del target actual para seguir el scroll/movimiento
    const step = this.steps[this.currentStep];
    const targetEl = (step && step.target) ? document.querySelector(step.target) : null;
    this.updateTargetRect(targetEl);

    // Posición instantánea — sin animación de movimiento
    if (this._targetRect) {
      this._currentRect = { ...this._targetRect };
    } else {
      this._currentRect = null;
    }

    const ctx = canvas.getContext('2d');
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // Dibujar el overlay oscuro
    ctx.fillStyle = 'rgba(20, 24, 26, 0.92)'; // Overlay oscuro al 92%
    ctx.fillRect(0, 0, w, h);

    if (this._currentRect) {
      // Recortar con destination-out
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';

      const rx = this._currentRect.x;
      const ry = this._currentRect.y;
      const rw = this._currentRect.w;
      const rh = this._currentRect.h;
      const radius = Math.min(16, rw / 2, rh / 2); // Evitar radios mayores al elemento

      if (rw > 0 && rh > 0) {
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        ctx.fill();
      }

      // Dibujar borde dorado
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = (typeof EC !== 'undefined' ? EC.oro : '#D99A3A'); // dorado de los estados
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(184, 144, 47, 0.5)';
      ctx.shadowBlur = 12;

      if (rw > 0 && rh > 0) {
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    }

    // Reposicionar el tooltip en tiempo real para evitar brincos o desalineaciones en scroll
    const tooltip = document.getElementById('walkthroughTooltip');
    if (tooltip) {
      this.positionTooltip(targetEl, tooltip);
    }
  },

  positionTooltip(targetEl, tooltip) {
    if (!targetEl) {
      tooltip.style.position = 'fixed';
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
      tooltip.style.bottom = 'auto';
      tooltip.style.right = 'auto';
      tooltip.style.top = '50%';
      return;
    }

    if (window.innerWidth <= 576) {
      // Estilo fijo inferior para mobile
      tooltip.style.position = 'fixed';
      tooltip.style.bottom = '80px';
      tooltip.style.top = 'auto';
      tooltip.style.left = '16px';
      tooltip.style.right = '16px';
      tooltip.style.transform = 'none';
      tooltip.style.width = 'calc(100% - 32px)';
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 400;
    const tooltipHeight = tooltip.offsetHeight || 160;
    const padding = 20; // Separación para evitar colisión de texto

    let top;
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

    // ¿Cabe abajo del spotlight?
    if (rect.bottom + tooltipHeight + padding < window.innerHeight) {
      top = rect.bottom + padding;
    } 
    // ¿Cabe arriba del spotlight?
    else if (rect.top - tooltipHeight - padding > 0) {
      top = rect.top - tooltipHeight - padding;
    } 
    // Si no cabe en ningún lado (elemento muy grande), colocar abajo pero ajustado
    else {
      top = Math.max(15, rect.bottom + 12);
    }

    // Ajustar límites horizontales
    if (left < 15) left = 15;
    if (left + tooltipWidth > window.innerWidth) left = window.innerWidth - tooltipWidth - 15;

    tooltip.style.position = 'absolute';
    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.style.transform = 'none';
    tooltip.style.bottom = 'auto';
    tooltip.style.right = 'auto';
  },

  next() {
    this.currentStep++;
    this.showStep();
  },

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep();
    }
  },

  skip() {
    this.finish();
  },

  cleanup() {
    const prevHighlight = document.querySelector('.walkthrough-highlight');
    if (prevHighlight) {
      prevHighlight.classList.remove('walkthrough-highlight');
    }
    const prevTooltip = document.getElementById('walkthroughTooltip');
    if (prevTooltip) {
      prevTooltip.remove();
    }
  },

  showWelcomeOnboarding(rawUserName, userRole, rawSucursalName = '') {
    if (localStorage.getItem('lcp_walkthrough_seen') === 'true') {
      return;
    }

    const userName = escapeHtml(rawUserName);
    const sucursalName = escapeHtml(rawSucursalName);

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'onboardingWelcomeOverlay';
    overlay.className = 'onboarding-welcome-overlay';
    
    let roleTextHtml = '';
    if (userRole === 'gerente') {
      roleTextHtml = `
        <p style="font-size:13.5px; color:var(--text); line-height:1.6; margin-bottom:20px;">
          Tu rol de <strong>Gerente de Sucursal</strong> te permite supervisar la reputación de tu tienda y de tu región. En tu panel podrás medir el volumen de opiniones, la calidad de reseñas y dar seguimiento a alertas operativas.
        </p>
        <div style="background:rgba(212,175,55,0.06); border:1px solid rgba(212,175,55,0.18); border-radius:12px; padding:12px 16px; font-size:12.5px; color:var(--oro-ink); line-height:1.5; text-align:left;">
          <strong>Sucursal asignada:</strong> Estás asignado a <strong>${sucursalName || 'tu sucursal'}</strong>. Verás tu tienda y también el resto de las sucursales de tu región para comparar tu desempeño.
        </div>
      `;
    } else if (userRole === 'zonal') {
      roleTextHtml = `
        <p style="font-size:13.5px; color:var(--text); line-height:1.6; margin-bottom:20px;">
          Tu rol de <strong>Gerente Zonal</strong> te permite auditar las sucursales de tu zona de control. Puedes navegar y alternar entre regiones desde el selector del menú superior para comparar desempeños de distintas zonas.
        </p>
        <div style="background:rgba(212,175,55,0.06); border:1px solid rgba(212,175,55,0.18); border-radius:12px; padding:12px 16px; font-size:12.5px; color:var(--oro-ink); line-height:1.5; text-align:left;">
          <strong>Tip de navegación:</strong> Puedes ver las métricas de otras regiones mediante los controles del menú superior de la pantalla.
        </div>
      `;
    } else {
      const roleMap = { admin: 'Administrador', director: 'Director', regional: 'Corporativo' };
      const roleLabel = roleMap[userRole] || userRole;
      roleTextHtml = `
        <p style="font-size:13.5px; color:var(--text); line-height:1.6; margin-bottom:20px;">
          Tu rol de <strong>${roleLabel}</strong> te da acceso a <strong>Étoile Astra</strong>, la vista nacional: todas las regiones en una lectura, su ranking por brillo ajustado y las alertas del grupo.
        </p>
        <div style="background:rgba(61,138,95,0.06); border:1px solid rgba(61,138,95,0.15); border-radius:12px; padding:12px 16px; font-size:12.5px; color:var(--ok-ink); line-height:1.5; text-align:left;">
          <strong>Auditoría global:</strong> Usa los reportes consolidados para reportar focos rojos y coordinar soluciones con los gerentes regionales.
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="onboarding-welcome-box">
        <div style="font-family:var(--giaza); font-size:48px; color:var(--oro-ink); margin-bottom:10px; line-height:1;">étoile</div>
        <h2 style="font-family:var(--sans); font-size:18px; font-weight:900; text-stretch:condensed; color:var(--text); text-transform:uppercase; margin-bottom:14px; letter-spacing:0.04em;">
          ¡Bienvenido, ${userName}!
        </h2>
        <div style="font-size:13.5px; color:var(--text); font-weight:600; margin-bottom:16px;">
          A tu dashboard de reseñas y reputación
        </div>
        <div style="margin-bottom:24px;">
          ${roleTextHtml}
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
          <button class="walkthrough-btn next" onclick="LcpWalkthrough.dismissWelcome(true)" style="width:100%; padding:12px; font-size:13px;">Iniciar recorrido guiado</button>
          <button class="walkthrough-btn skip" onclick="LcpWalkthrough.dismissWelcome(false)" style="width:100%; padding:10px; font-size:12px; border-color:var(--border-strong);">Saltar introducción</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 50);
  },

  dismissWelcome(startTour) {
    const overlay = document.getElementById('onboardingWelcomeOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
    
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    if (startTour) {
      this.start();
    } else {
      this.finish();
    }
  },

  finish() {
    this.cleanup();
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this._currentRect = null;
    this._targetRect = null;
    
    const overlay = document.getElementById('walkthroughOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
    if (this._listenersAttached) {
      window.removeEventListener('resize', this._resizeHandler);
      window.removeEventListener('scroll', this._resizeHandler);
      this._listenersAttached = false;
    }
    localStorage.setItem('lcp_walkthrough_seen', 'true');
  }
};

/* ─── REACTBITS & UI/UX ENHANCEMENT UTILITIES ───────────── */

/**
 * Registra escuchadores de cursor en directo sobre tarjetas con .spotlight-card
 * actualizando las variables CSS --mouse-x y --mouse-y para resplandor reactivo.
 */
function initSpotlightCards() {
  const cards = document.querySelectorAll('.spotlight-card, .branch-card, .scorecard, .kpi-card, .chart-card, .topic-card');
  cards.forEach(card => {
    if (card.dataset.spotlightBound) return;
    card.dataset.spotlightBound = 'true';
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

/**
 * Anima contadores numéricos fluidos (CountUp Interpolation) usando RAF.
 * @param {HTMLElement} el - Elemento objetivo
 * @param {number} targetValue - Valor final objetivo
 * @param {number} duration - Duración en ms
 * @param {boolean} isFloat - Si es decimal (ej. rating 4.85)
 */
function animateCounter(el, targetValue, duration = 1200, isFloat = false) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  const target = parseFloat(targetValue);
  if (isNaN(target)) return;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Exponential Ease Out: 1 - Math.pow(2, -10 * progress)
    const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const currentValue = start + (target - start) * easeProgress;

    if (isFloat) {
      el.textContent = currentValue.toFixed(2);
    } else {
      el.textContent = Math.round(currentValue).toLocaleString();
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = isFloat ? target.toFixed(2) : target.toLocaleString();
    }
  }

  requestAnimationFrame(update);
}

/**
 * Revelado progresivo con desenfoque para títulos y secciones (.blur-reveal)
 */
function initBlurReveals() {
  const reveals = document.querySelectorAll('.blur-reveal');
  reveals.forEach((el, index) => {
    setTimeout(() => {
      el.classList.add('revealed');
    }, index * 80 + 50);
  });
}

/**
 * Posiciona dinámicamente la pastilla indicadora flotante (sliding tab pill)
 * persiguiendo suavemente la ruta o pestaña activa en el nav de escritorio.
 */
function updateSlidingTabPill() {
  const nav = document.querySelector('.topbar-nav--desktop');
  if (!nav) return;
  
  let pill = nav.querySelector('.sliding-tab-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'sliding-tab-pill';
    nav.appendChild(pill);
  }

  const activeLink = nav.querySelector('.topbar-link.active');
  if (activeLink) {
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const left = linkRect.left - navRect.left;
    const width = linkRect.width;
    
    pill.style.transform = `translateX(${left}px)`;
    pill.style.width = `${width}px`;
    pill.style.opacity = '1';
  } else {
    pill.style.opacity = '0';
  }
}

/** Compatibilidad: las llamadas viejas a ToastManager usan el mismo aviso */
const ToastManager = {
  show({ type = 'info', message = '', duration = 2800 } = {}) { Toast.show(message, { type, duration }); }
};

/**
 * CommandPaletteManager - Paleta de Comandos Cmd+K Global (Spotlight Search Glass)
 */
const CommandPaletteManager = {
  _initialized: false,
  _backdrop: null,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Registrar atajo de teclado Cmd+K / Ctrl+K (desactivado a petición de Ibrahim)
    // document.addEventListener('keydown', (e) => {
    //   if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    //     e.preventDefault();
    //     this.toggle();
    //   }
    // });
  },

  toggle() {
    if (this._backdrop && this._backdrop.classList.contains('active')) {
      this.close();
    } else {
      this.open();
    }
  },

  open() {
    this._render();
    if (!this._backdrop) return;
    
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    this._backdrop.classList.add('active');
    const input = this._backdrop.querySelector('.cmd-k-input');
    if (input) {
      input.value = '';
      input.focus();
      this._filter('');
    }
  },

  close() {
    if (!this._backdrop) return;
    this._backdrop.classList.remove('active');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  },

  _render() {
    if (this._backdrop) return;

    const branches = typeof SUCURSALES_META !== 'undefined' ? SUCURSALES_META : [];
    
    const backdrop = document.createElement('div');
    backdrop.className = 'cmd-k-backdrop';
    backdrop.innerHTML = `
      <div class="cmd-k-dialog" role="dialog" aria-modal="true">
        <div class="cmd-k-header">
          <span class="cmd-k-search-icon">${svgIcon('search')}</span>
          <input type="text" class="cmd-k-input" placeholder="Buscar sucursal, vista o comando (ej. Andares, Q1, Dashboards)..." />
          <span class="cmd-k-badge">ESC para cerrar</span>
        </div>
        <div class="cmd-k-list" id="cmdKList">
          <div class="cmd-k-group-title">Sucursales Regionales</div>
          ${branches.map(b => `
            <a href="#/sucursal/${b.id}" class="cmd-k-item" data-search="${b.nombre.toLowerCase()} ${b.abr.toLowerCase()} ${b.region.toLowerCase()}">
              <div class="cmd-k-item-main">
                <span class="cmd-k-item-icon">${svgIcon('chart')}</span>
                <span>${escapeHtml(b.nombre)}</span>
              </div>
              <span class="cmd-k-item-meta">${escapeHtml(b.region)}</span>
            </a>
          `).join('')}
          <div class="cmd-k-group-title">Vistas Analíticas</div>
          <a href="#/" class="cmd-k-item" data-search="inicio home resumen principal">
            <div class="cmd-k-item-main">
              <span class="cmd-k-item-icon">${svgIcon('home')}</span>
              <span>Inicio · Resumen Operativo</span>
            </div>
            <span class="cmd-k-item-meta">Vista Principal</span>
          </a>
          <a href="#/dashboards" class="cmd-k-item" data-search="dashboards graficas tendencias cuadro de mando">
            <div class="cmd-k-item-main">
              <span class="cmd-k-item-icon">${svgIcon('chart')}</span>
              <span>Dashboards Executivos & Alertas</span>
            </div>
            <span class="cmd-k-item-meta">Gráficas integradas</span>
          </a>
          <a href="#/trimestre/2026-Q1" class="cmd-k-item" data-search="trimestre q1 ranking comparativa">
            <div class="cmd-k-item-main">
              <span class="cmd-k-item-icon">${svgIcon('calendar')}</span>
              <span>Reporte Trimestral Q1 2026</span>
            </div>
            <span class="cmd-k-item-meta">Ranking regional</span>
          </a>
          <a href="#/acerca" class="cmd-k-item" data-search="acerca metodologia versiones changelog">
            <div class="cmd-k-item-main">
              <span class="cmd-k-item-icon">${svgIcon('info')}</span>
              <span>Acerca de étoile · Metodología & Versiones</span>
            </div>
            <span class="cmd-k-item-meta">Documentación</span>
          </a>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const input = backdrop.querySelector('.cmd-k-input');
    if (input) {
      input.addEventListener('input', (e) => this._filter(e.target.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    const items = backdrop.querySelectorAll('.cmd-k-item');
    items.forEach(item => {
      item.addEventListener('click', () => this.close());
    });

    document.body.appendChild(backdrop);
    this._backdrop = backdrop;
  },

  _filter(query) {
    if (!this._backdrop) return;
    const q = query.trim().toLowerCase();
    const items = this._backdrop.querySelectorAll('.cmd-k-item');
    items.forEach(item => {
      const searchData = item.getAttribute('data-search') || '';
      if (!q || searchData.includes(q)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }
};

/**
 * renderSparklineSVG - Dibuja una curva vectorial SVG de tendencia (3 meses)
 */
function renderSparklineSVG(history = [4.8, 4.5, 4.9]) {
  if (!history || history.length < 2) return '';
  const min = Math.min(...history) - 0.2;
  const max = Math.max(...history) + 0.2;
  const range = max - min || 1;
  const w = 76;
  const h = 26;
  const points = history.map((val, idx) => {
    const x = (idx / (history.length - 1)) * w;
    const y = h - ((val - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const delta = history[history.length - 1] - history[0];
  const dirClass = delta > 0.05 ? 'up' : (delta < -0.05 ? 'down' : 'flat');

  return `
    <svg class="sparkline-svg" viewBox="0 0 76 26" aria-hidden="true">
      <path class="sparkline-path ${dirClass}" d="${pathD}" />
    </svg>
  `;
}

/**
 * Control Segmentado Elástico (Sliding Tab Pills)
 */
function initSegmentedTabs() {
  const controls = document.querySelectorAll('.segmented-elastic-control');
  controls.forEach(ctrl => {
    let pill = ctrl.querySelector('.segmented-pill-bg');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'segmented-pill-bg';
      ctrl.insertBefore(pill, ctrl.firstChild);
    }
    const updatePill = () => {
      const activeBtn = ctrl.querySelector('.segmented-btn.active');
      if (activeBtn) {
        const ctrlRect = ctrl.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        const left = btnRect.left - ctrlRect.left;
        pill.style.transform = `translateX(${left}px)`;
        pill.style.width = `${btnRect.width}px`;
      }
    };
    updatePill();
    ctrl.querySelectorAll('.segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ctrl.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePill();
      });
    });
  });
}

/* ── NATIVE WEB SHARE API & SHARE MANAGER ───────────────── */
const ShareManager = {
  async shareReport({ title, text, url }) {
    const shareUrl = url || window.location.href;
    const fullText = text ? `${text}\n\n${shareUrl}` : shareUrl;

    if (navigator.share) {
      try {
        await navigator.share({
          title: title || document.title,
          text: text || '',
          url: shareUrl
        });
        if (typeof ToastManager !== 'undefined') {
          ToastManager.show({ type: 'success', message: 'Reporte compartido con éxito' });
        }
        return 'shared';
      } catch (err) {
        if (err.name === 'AbortError') return 'aborted';
      }
    }

    // Fallback a Portapapeles
    try {
      await navigator.clipboard.writeText(fullText);
      if (typeof ToastManager !== 'undefined') {
        ToastManager.show({ type: 'success', message: 'Enlace copiado al portapapeles. ¡Listo para compartir!' });
      }
      return 'copied';
    } catch (e) {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(fullText)}`;
      window.open(waUrl, '_blank');
      return 'whatsapp';
    }
  }
};

/* ── STICKY MOBILE ACTION BAR MANAGER ────────────────────── */
const MobileStickyBarManager = {
  mount({ title, subtitle, primaryBtnText, onPrimaryClick, secondaryBtnText, onSecondaryClick }) {
    let bar = document.getElementById('mobileStickyBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mobileStickyBar';
      bar.className = 'mobile-sticky-bar';
      document.body.appendChild(bar);
    }

    bar.innerHTML = `
      <div class="msb-info">
        <span class="msb-title">${escapeHtml(title || '')}</span>
        ${subtitle ? `<span class="msb-sub">${escapeHtml(subtitle)}</span>` : ''}
      </div>
      <div class="msb-actions">
        ${secondaryBtnText ? `<button class="msb-btn msb-btn-secondary" id="msbSecondaryBtn">${escapeHtml(secondaryBtnText)}</button>` : ''}
        ${primaryBtnText ? `<button class="msb-btn msb-btn-primary" id="msbPrimaryBtn">${escapeHtml(primaryBtnText)}</button>` : ''}
      </div>
    `;

    if (primaryBtnText && onPrimaryClick) {
      document.getElementById('msbPrimaryBtn')?.addEventListener('click', onPrimaryClick);
    }
    if (secondaryBtnText && onSecondaryClick) {
      document.getElementById('msbSecondaryBtn')?.addEventListener('click', onSecondaryClick);
    }

    bar.classList.add('active');
    document.body.classList.add('has-sticky-bar');
  },

  unmount() {
    const bar = document.getElementById('mobileStickyBar');
    if (bar) {
      bar.classList.remove('active');
    }
    document.body.classList.remove('has-sticky-bar');
  }
};

/* ── FAQ ACCORDION INTERACTION ───────────────────────────── */
function toggleFaqItem(index) {
  const item = document.getElementById(`faq-item-${index}`);
  if (!item) return;
  const wasActive = item.classList.contains('active');
  document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
  if (!wasActive) {
    item.classList.add('active');
  }
}

/* ── REALTIME OFFLINE CONNECTIVITY MANAGER ───────────────── */
const OfflineManager = {
  _bannerEl: null,

  init() {
    this._createBanner();
    window.addEventListener('offline', () => this.show());
    window.addEventListener('online', () => this.hide());
    if (!navigator.onLine) {
      this.show();
    }
  },

  _createBanner() {
    if (document.getElementById('offlineBannerFloating')) return;
    const banner = document.createElement('div');
    banner.id = 'offlineBannerFloating';
    banner.className = 'offline-banner-floating';
    banner.innerHTML = `
      <div class="offline-pulse-dot"></div>
      <span>Sin conexión a internet · Mostrando datos locales en caché</span>
    `;
    document.body.appendChild(banner);
    this._bannerEl = banner;
  },

  show() {
    if (!this._bannerEl) this._createBanner();
    if (this._bannerEl) this._bannerEl.classList.add('active');
  },

  hide() {
    if (this._bannerEl) {
      this._bannerEl.classList.remove('active');
      if (typeof ToastManager !== 'undefined') {
        ToastManager.show({ type: 'success', message: 'Conexión restablecida con éxito' });
      }
    }
  }
};





