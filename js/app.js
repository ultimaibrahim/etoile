/**
 * app.js — Bootstrap, estado global e integración con Supabase.
 */

/* ── SUPABASE CONFIG ───────────────────────────────────── */
// La configuración de Supabase se carga de forma dinámica desde el servidor de Netlify.

var supabaseClient = null;

/* ── STATE ─────────────────────────────────────────────── */
let darkMode = localStorage.getItem('lcpDark') === '1';
let premiumUi = true;
let homeFilter = 'todas';
let branchView = 'abril';

function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
}
applyTheme();

function applyPremiumUi() {
  document.documentElement.setAttribute('data-ui-premium', 'true');
}
applyPremiumUi();

/** Cambio de tema en sitio: sin fundido, sin volver arriba y sin repetir las animaciones de entrada.
 *  Durante el cambio se apagan las transiciones (cientos de colores a la vez traban el cuadro) y la vista
 *  se vuelve a pintar quieta para que las gráficas y las Rosas tomen los colores nuevos */
function toggleDark() {
  darkMode = !darkMode;
  localStorage.setItem('lcpDark', darkMode ? '1' : '0');
  const raiz = document.documentElement;
  raiz.classList.add('repintando');
  window.ETOILE_REPINTA = true;
  applyTheme();
  if (typeof Rosa !== 'undefined') Rosa.olvida();
  const listo = () => requestAnimationFrame(() => requestAnimationFrame(() => { raiz.classList.remove('repintando'); window.ETOILE_REPINTA = false; }));
  window.addEventListener('etoile:route-rendered', listo, { once: true });
  Router.resolve({ quieto: true });
}

/* ── AUTHENTICATION ENGINE ────────────────────────────── */
const AppAuth = {
  session: null,
  profile: null,

  async init() {
    if (!supabaseClient) {
      console.error("Supabase no configurado. Acceso denegado.");
      this.session = null;
      this.profile = null;
      return false;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      this.session = session;
      if (session) {
        await this.loadProfile(session.user.id);
        if (!this.profile) {
          console.warn("Sesión activa detectada pero sin perfil de usuario válido. Cerrando sesión...");
          await this.logout();
          return false;
        }
      }
      return this.isAuthenticated();
    } catch (e) {
      console.error("Error inicializando sesión:", e);
      return false;
    }
  },

  async loadProfile(uid) {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (data) {
        this.profile = data;
        setRegionActiva(data.region); // Sincroniza la región en data.js
      } else {
        console.warn("Perfil no encontrado en la base de datos.");
        this.profile = null;
      }
    } catch (e) {
      console.error("Error cargando perfil:", e);
      this.profile = null;
    }
  },

  async logout() {
    if (typeof ViewState !== 'undefined') {
      ViewState.clear();
    }
    if (supabaseClient) {
      try { await supabaseClient.auth.signOut(); } catch (e) { console.warn('[Auth] signOut:', e && e.message); }
    }
    // Aunque el cliente no exista todavía (app a medio cargar) o signOut falle, la cookie de sesión se borra:
    // si quedara, /login/ vería una sesión vigente y regresaría a la app
    document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(k => k.startsWith('sb-')).forEach(k => CookieStorage.removeItem(k));
    this.session = null;
    this.profile = null;
    if (typeof EtoileCache !== 'undefined') await EtoileCache.clearAll();
    
    if (typeof DataLoader !== 'undefined') {
      DataLoader.cache = {};
      DataLoader._regionStore = {};
      DataLoader._brandCache = {};
      DataLoader.manifest = null;
      if (typeof Incidents !== 'undefined') Incidents.reset();
    }
    if (typeof setRegionActiva === 'function') {
      setRegionActiva('GDL');
    }
    
    window.location.replace('/login/');   // el login es su propia página
  },

  isAuthenticated() {
    return !!this.session && !!this.profile;
  },

  getUserRole() {
    return this.profile ? this.profile.rol : null;
  },

  getUserRegion() {
    return this.profile ? this.profile.region : null;
  },

  getUserSucursal() {
    return this.profile ? this.profile.sucursal : null;
  },

  /**
   * Gerente (su tienda, dentro de su región) y zonal (su región; puede ir a otras desde "Regiones") entran
   * directo a Inicio de su región. Corporativo (admin/regional) pasa por la llegada al selector nacional, con Étoile Astra.
   */
  entersOwnRegion() {
    const r = this.getUserRole();
    return (r === 'gerente' || r === 'zonal') && typeof REGION_NAME_MAP !== 'undefined' && !!REGION_NAME_MAP[this.getUserRegion()];
  }
};

/* ── LOADER HELPER ────────────────────────────────────── */
window.updateLcpLoader = function(progress) {
  const stop1 = document.getElementById('gradient-stop-1');
  const stop2 = document.getElementById('gradient-stop-2');
  if (stop1 && stop2) {
    stop1.setAttribute('offset', `${progress}%`);
    stop2.setAttribute('offset', `${progress}%`);
  }
};

window.showLcpLoader = function() {
  window.ETOILE_REVELADA = false;
  const loader = document.getElementById('lcp-loader');
  const plancha = document.getElementById('lcp-loader-plancha');
  const appEl = document.getElementById('app');
  
  if (loader) {
    window.updateLcpLoader(0);
    loader.className = '';
    if (plancha) {
      plancha.removeAttribute('style');
    }
    if (appEl) {
      appEl.classList.remove('entrance-active');
      appEl.classList.add('loading-active');
    }
    loader.style.display = 'flex';
    delete loader.dataset.leaving;
    const mark = loader.querySelector('.loader-mark'), svgText = loader.querySelector('.loader-logo-svg-text');
    if (mark) { mark.removeAttribute('style'); mark.getAnimations().forEach(a => a.cancel()); }
    loader.querySelector('.loader-dough')?.getAnimations().forEach(a => a.cancel());
    if (svgText) svgText.style.opacity = '';
  }
};

window.hideLcpLoader = function() {
  const loader = document.getElementById('lcp-loader');
  const appEl = document.getElementById('app');
  if (!loader || loader.style.display === 'none' || loader.dataset.leaving) return;
  loader.dataset.leaving = '1';
  window.updateLcpLoader(100);

  const finish = () => {
    loader.style.display = 'none';
    loader.className = '';
    delete loader.dataset.leaving;
    if (appEl) { appEl.classList.remove('loading-active', 'entrance-active', 'entrance-dough'); appEl.style.transform = ''; }
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !Element.prototype.animate) {
    loader.classList.add('reveal-active');
    if (appEl) appEl.classList.remove('loading-active');
    window.ETOILE_REVELADA = true; window.dispatchEvent(new Event('etoile:revela'));
    setTimeout(finish, 400);
    return;
  }

  // La frase termina de dorarse y se va; luego el cielo de la vista se abre desde el centro y el nombre sube a la barra
  setTimeout(() => {
    const svgText = loader.querySelector('.loader-logo-svg-text');
    const mark = loader.querySelector('.loader-mark');
    const dough = loader.querySelector('.loader-dough');
    if (appEl) appEl.style.transform = 'none'; // la app ya en su sitio (invisible) para medir a dónde va el nombre
    const from = svgText.getBoundingClientRect();
    const svgScale = loader.querySelector('.loader-curve-svg').getBoundingClientRect().width / 300;
    const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    mark.style.cssText = `left:${fx}px;top:${fy}px;font-size:${52 * svgScale}px;opacity:1`;
    svgText.style.opacity = '0';
    loader.classList.add('wrap-active');

    // El cielo que se abre toma el color de lo que queda arriba de la vista (franja o página), así no entra
    // en un tono y luego «se invierte» al aparecer la app
    const arriba = appEl && appEl.querySelector('.cg, .topbar, .hero, .branch-hero');
    const tono = arriba ? getComputedStyle(arriba).getPropertyValue('--banda') : getComputedStyle(document.documentElement).getPropertyValue('--bg');
    dough.style.background = typeof Rosa !== 'undefined' ? Rosa.resuelve(tono) : tono;
    const target = appEl && appEl.querySelector('.topbar-brand .accent, .srv-brand .accent');
    const ink = getComputedStyle(target || document.body).color;

    // Cubre la diagonal completa desde el centro, con un respiro a medio camino
    const cover = Math.hypot(innerWidth, innerHeight) / (dough.offsetWidth || 1) * 1.15;
    dough.animate([
      { transform: 'scale(0) rotate(-8deg)', offset: 0 },
      { transform: 'scale(.9) rotate(-2deg)', offset: .26 },
      { transform: 'scale(.82) rotate(1deg)', offset: .4 },
      { transform: 'scale(1.05) rotate(3deg)', offset: .58 },
      { transform: `scale(${cover}) rotate(8deg)`, offset: 1 }
    ], { duration: 1150, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
    mark.animate([{ color: '' }, { color: ink }], { duration: 320, delay: 80, easing: 'ease', fill: 'forwards' });
    // Se mide el destino justo al despegar (la vista ya terminó su propia entrada) y se escala por tamaño de letra
    setTimeout(() => {
      const to = target && target.getBoundingClientRect();
      const ok = to && to.width;
      const dx = ok ? (to.left + to.width / 2) - fx : 0;
      const dy = ok ? (to.top + to.height / 2) - fy : -fy + 28;
      const s = ok ? parseFloat(getComputedStyle(target).fontSize) / parseFloat(mark.style.fontSize) : 0.45;
      const ls = ok ? (parseFloat(getComputedStyle(target).letterSpacing) || 0) / parseFloat(getComputedStyle(target).fontSize) : .06;
      mark.animate([
        { transform: 'translate(-50%,-50%)', letterSpacing: '.06em' },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`, letterSpacing: `${ls}em` }
      ], { duration: 780, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
    }, 420);

    // El cielo ya cubrió todo: la app aparece debajo y el cargador se funde sobre ella, con el nombre ya en la barra
    setTimeout(() => {
      if (appEl) { appEl.classList.remove('loading-active'); appEl.classList.add('entrance-dough'); }
      loader.classList.add('reveal-active');
      window.ETOILE_REVELADA = true; window.dispatchEvent(new Event('etoile:revela'));   // la vista ya se ve: su entrada puede empezar
    }, 1150);
    setTimeout(finish, 1650);
  }, 250);
};

/* ── INIT ──────────────────────────────────────────────── */
async function initApp() {
  const appEl = document.getElementById('app');
  if (appEl) appEl.classList.add('loading-active');
  window.updateLcpLoader(10);
  // Obtener configuración pública de Supabase desde Netlify Serverless Function
  try {
    const res = await fetch('/.netlify/functions/get-config');
    window.updateLcpLoader(30);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const config = await res.json();
    if (config.supabaseUrl && config.supabaseAnonKey) {
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, SUPABASE_AUTH_OPTIONS);
    }
  } catch (e) {
    console.error("No se pudo obtener la configuración de Supabase desde el servidor:", e);
  }
  window.updateLcpLoader(50);

  // Inicializar autenticación y sesión
  await AppAuth.init();
  window.updateLcpLoader(70);
  
  if (AppAuth.isAuthenticated()) {
    // Al refrescar en select-region o brand solo hace falta el manifiesto; el resto de rutas precarga la región
    const lazyRegion = AppAuth.getUserRole() !== 'gerente' && ['#/select-region', '#/llegada', '#/brand'].includes(window.location.hash);
    if (lazyRegion) {
      await Promise.all([DataLoader.init(), Incidents.load(true)]);
    } else {
      await Promise.all([DataLoader.init(), DataLoader.computeHistoricalRatings(), Incidents.load(true)]);
    }
    window.updateLcpLoader(85);
  }
  window.updateLcpLoader(100);

  // Registrar vistas en el Router
  Router.register('select-region', () => SelectRegionView.render());
  Router.register('llegada', () => LlegadaView.render());
  Router.register('brand', () => BrandView.render());
  Router.register('home', () => HomeView.render());
  Router.register('branch', params => BranchView.render(params));
  Router.register('reporte', params => ReporteView.render(params));
  Router.register('compare', params => CompareView.render(params));
  Router.register('quarter', params => QuarterView.render(params));
  Router.register('about', () => AboutView.render());
  Router.register('dashboards', () => DashboardsView.render());
  Router.register('privacy', () => PrivacyView.render());
  Router.register('not-found', params => NotFoundView.render(params));

  Router.init();
  Router.resolve();

  // Paleta de Comandos Cmd+K (desactivada temporalmente a petición de Ibrahim)
  // if (typeof CommandPaletteManager !== 'undefined') {
  //   CommandPaletteManager.init();
  // }

  // Inicializar Detección de Red Offline en Tiempo Real
  if (typeof OfflineManager !== 'undefined') {
    OfflineManager.init();
  }

  // Desvanecer la pantalla de carga tras inicialización completa
  setTimeout(() => {
    window.hideLcpLoader();
  }, 500);

  // Inicializar banner de cookies (Deshabilitado temporalmente para revisión legal)
  // initCookieBanner();
}

function initCookieBanner() {
  // Si ya se tomó una decisión, no mostrar el banner
  if (localStorage.getItem('lcpCookieConsent') === 'accepted' || localStorage.getItem('lcpCookieConsent') === 'declined') {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'lcp-cookie-banner';
  banner.className = 'cookie-banner-wrap';
  
  banner.innerHTML = `
    <div class="cookie-banner-content">
      <div class="cookie-banner-text">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--oro-ink); flex-shrink: 0; margin-top: 1px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        <span>
          Utilizamos cookies esenciales y almacenamiento local para mantener tu sesión activa y guardar tus preferencias. Consulta nuestro <a href="#/privacidad" style="text-decoration: underline; color: var(--oro-ink); font-weight: 700;">Aviso de Privacidad</a> para más detalles.
        </span>
      </div>
      <div class="cookie-banner-actions">
        <button class="cookie-btn accept" onclick="acceptLcpCookies()">Aceptar</button>
        <button class="cookie-btn decline" onclick="declineLcpCookies()">Rechazar</button>
      </div>
    </div>
  `;

  if (!document.getElementById('cookie-banner-styles')) {
    const style = document.createElement('style');
    style.id = 'cookie-banner-styles';
    style.textContent = `
      .cookie-banner-wrap {
        position: fixed;
        bottom: 24px;
        left: 24px;
        right: 24px;
        background: var(--surface-2);
        border: 1px solid var(--border-strong);
        border-radius: 16px;
        box-shadow: var(--sombra-lg);
        padding: 16px 24px;
        z-index: 2000;
        box-sizing: border-box;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        animation: bannerSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @media (min-width: 768px) {
        .cookie-banner-wrap {
          max-width: 480px;
          right: auto;
        }
      }
      .cookie-banner-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      @media (min-width: 576px) {
        .cookie-banner-content {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
      }
      .cookie-banner-text {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--text);
      }
      .cookie-banner-text span {
        flex-grow: 1;
      }
      .cookie-banner-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .cookie-btn {
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }
      .cookie-btn.accept {
        background: var(--verde);
        color: #FAF5EB;
      }
      .cookie-btn.accept:hover {
        background: var(--verde-soft);
      }
      .cookie-btn.decline {
        background: transparent;
        border-color: var(--border-strong);
        color: var(--text-dim);
      }
      .cookie-btn.decline:hover {
        background: var(--border);
        color: var(--text);
      }
      @keyframes bannerSlideUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  window.acceptLcpCookies = () => {
    localStorage.setItem('lcpCookieConsent', 'accepted');
    const el = document.getElementById('lcp-cookie-banner');
    if (el) el.remove();
  };

  window.declineLcpCookies = () => {
    localStorage.setItem('lcpCookieConsent', 'declined');
    const el = document.getElementById('lcp-cookie-banner');
    if (el) el.remove();
  };

  document.body.appendChild(banner);
}

initApp();

