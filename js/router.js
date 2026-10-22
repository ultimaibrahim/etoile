/**
 * router.js — Hash router SPA.
 */

const Router = {
  routes: {},
  current: null,

  register(path, handler) {
    this.routes[path] = handler;
  },

  match(hash) {
    if (!hash || hash === '#' || hash === '#/') {
      return { handler: this.routes['home'], params: {} };
    }

    // Normalizar hash: remover query params y slashes finales
    const rawPath = hash.split('?')[0].replace(/\/+$/, '') || '#/';

    if (rawPath === '#/login') return { handler: this.routes['login'], params: {} };
    if (rawPath === '#/404') return { handler: this.routes['not-found'], params: { type: 'not-found' } };
    if (rawPath === '#/403') return { handler: this.routes['not-found'], params: { type: 'forbidden' } };
    if (rawPath === '#/acerca' || rawPath === '#/about') return { handler: this.routes['about'], params: {} };
    if (rawPath === '#/privacidad' || rawPath === '#/privacy') return { handler: this.routes['privacy'], params: {} };
    if (rawPath === '#/select-region') return { handler: this.routes['select-region'], params: {} };
    if (rawPath === '#/brand') return { handler: this.routes['brand'], params: {} };
    if (rawPath === '#/dashboards') return { handler: this.routes['dashboards'], params: {} };
    if (rawPath === '#/comparar' || rawPath === '#/compare') {
      const queryString = hash.includes('?') ? hash.split('?')[1] : '';
      const searchParams = new URLSearchParams(queryString);
      return {
        handler: this.routes['compare'],
        params: {
          a: searchParams.get('a'),
          b: searchParams.get('b')
        }
      };
    }

    if (rawPath.startsWith('#/sucursal/')) {
      const id = rawPath.replace('#/sucursal/', '');
      // Si el ID no existe en el catálogo de sucursales, activar 404 SPA
      const meta = typeof getBranchById === 'function' ? getBranchById(id) : null;
      if (!meta && typeof SUCURSALES_META_ALL !== 'undefined') {
        return { handler: this.routes['not-found'], params: { type: 'not-found', requestedBranch: id } };
      }
      return { handler: this.routes['branch'], params: { id } };
    }

    if (rawPath.startsWith('#/reporte/')) {
      const id = rawPath.replace('#/reporte/', '');
      const meta = typeof getBranchById === 'function' ? getBranchById(id) : null;
      if (!meta) return { handler: this.routes['not-found'], params: { type: 'not-found', requestedBranch: id } };
      return { handler: this.routes['reporte'], params: { id } };
    }

    if (rawPath.startsWith('#/trimestre/')) {
      const q = rawPath.replace('#/trimestre/', '');
      const qParsed = typeof parseQuarterParam === 'function' ? parseQuarterParam(q) : null;
      if (!qParsed || qParsed.quarter < 1 || qParsed.quarter > 4) {
        return { handler: this.routes['not-found'], params: { type: 'not-found', requestedQuarter: q } };
      }
      return { handler: this.routes['quarter'], params: { q } };
    }

    // Rutas dinámicas registradas directamente con Router.register()
    const routeKey = rawPath.replace(/^#\/?/, '');
    if (this.routes[routeKey]) {
      return { handler: this.routes[routeKey], params: {} };
    }

    // Para cualquier otra ruta no reconocida, activar vista 404 SPA
    return { handler: this.routes['not-found'], params: { type: 'not-found', requestedPath: hash } };
  },

  updateRouteMeta(hash, params = {}) {
    // Títulos de Étoile como producto; el cliente de la instalación solo aparece como dato (CLIENTE, config.js)
    let title = 'étoile';
    let description = 'Étoile lee las reseñas de Google de cada sucursal y dice qué pasó y qué atender hoy.';
    const reg = typeof activeRegion !== 'undefined' && typeof getRegionName === 'function' ? getRegionName(activeRegion) : '';

    if (hash === '#/login') {
      title = 'Iniciar sesión · étoile';
    } else if (hash.startsWith('#/sucursal/')) {
      const meta = typeof getBranchById === 'function' ? getBranchById(params.id) : null;
      const branchName = meta ? meta.nombre : (params.id || 'Sucursal');
      title = `${branchName} · étoile`;
      description = `Cómo va ${branchName}: calificación, reseñas, quejas y su seguimiento.`;
    } else if (hash.startsWith('#/reporte/')) {
      const meta = typeof getBranchById === 'function' ? getBranchById(params.id) : null;
      title = `Reporte · ${meta ? meta.nombre : 'Sucursal'} · étoile`;
      description = 'Reporte del mes de la sucursal: PDF, tarjeta para compartir, texto o documento.';
    } else if (hash.startsWith('#/trimestre/')) {
      const q = (params.q || '').toUpperCase();
      title = `Reporte ${q} · étoile`;
      description = `Resumen del trimestre ${q}: ranking, evolución mensual y detalle por mes.`;
    } else if (hash.startsWith('#/comparar') || hash.startsWith('#/compare')) {
      title = 'Comparar sucursales · étoile';
      description = 'Una sucursal frente a otra, o frente a su propio histórico.';
    } else if (hash === '#/dashboards') {
      title = `Dashboards${reg ? ` · ${reg}` : ''} · étoile`;
      description = 'Qué atender, ranking, tendencia, volumen y distribución de calificaciones del mes.';
    } else if (hash === '#/brand') {
      title = 'Astra · étoile';
      description = 'Todas las regiones y sucursales en una sola lectura.';
    } else if (hash === '#/llegada') {
      title = 'Bitácora · étoile';
      description = 'Cómo llega el grupo hoy: el cielo de todas las sucursales y lo que hay que atender.';
    } else if (hash === '#/select-region') {
      title = 'Regiones · étoile';
      description = 'Elige la región que quieres leer.';
    } else if (hash === '#/acerca') {
      title = 'Acerca de · étoile';
      description = 'Qué es Étoile, cómo se calculan sus cifras y cómo leer sus estrellas.';
    } else if (hash === '#/privacidad') {
      title = 'Privacidad · étoile';
      description = 'Qué datos usa Étoile, para qué y cómo se protegen.';
    } else if (hash === '#/403' || (params && params.type === 'forbidden')) {
      title = 'Sin acceso · étoile';
      description = 'Tu rol no tiene permiso para ver esta sección o región.';
    } else if (hash === '#/404' || (params && params.type === 'not-found')) {
      title = 'No encontrada · étoile';
      description = 'La ruta o sucursal que buscas no existe.';
    } else {
      title = `${reg || 'Inicio'} · étoile`;
      description = `Cómo va ${reg || 'la región'} este mes y qué hay que atender.`;
    }

    document.title = title;

    // Actualizar o inyectar meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // Actualizar OpenGraph
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', window.location.href);

    // Notificar a GA4 evento page_view en cambio SPA si está activo
    if (typeof window.gtag === 'function' && window.GA4_MEASUREMENT_ID) {
      window.gtag('event', 'page_view', {
        page_title: title,
        page_location: window.location.href,
        page_path: window.location.hash || '#/'
      });
    }
  },

  navigate(hash) {
    if ((window.location.hash === '#/' || window.location.hash === '') && hash.startsWith('#/sucursal/')) {
      if (typeof ViewState !== 'undefined') {
        ViewState.set('homeScroll', window.scrollY);
      }
    }
    window.location.hash = hash;
  },

  /** quieto: repintar la vista actual en su lugar (cambio de tema): sin cargador, sin fundido y sin mover el scroll */
  async resolve({ quieto = false } = {}) {
    const hash = window.location.hash || '#/';

    // Guardar scroll si navegamos desde Home a Sucursal
    if ((this.current === '#/' || !this.current) && hash.startsWith('#/sucursal/')) {
      if (typeof ViewState !== 'undefined') {
        ViewState.set('homeScroll', window.scrollY);
      }
    }

    // Verificar sesión y aplicar Guards de Rol antes de permitir navegación
    const authenticated = typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated();
    const matchedRoute = this.match(hash);
    const isPublicRoute = hash === '#/login' || 
                          hash === '#/privacidad' || 
                          hash === '#/404' || 
                          hash === '#/403' || 
                          matchedRoute.handler === this.routes['not-found'];

    // El login es su propia página (/login/); los enlaces viejos a #/login siguen funcionando
    if (hash === '#/login') {
      window.location.replace('/login/');
      return;
    }

    if (!authenticated) {
      if (!isPublicRoute) {
        // Sin sesión: quien llega a la raíz ve primero la página de inicio pública; un enlace profundo va directo al login
        window.location.replace(hash === '' || hash === '#/' ? '/info/' : '/login/');
        return;
      }
    } else {
      if (hash === '#/login') {
        window.location.hash = '#/';
        return;
      }

      // Guard por Rol
      const userRole = AppAuth.getUserRole();
      const userRegion = AppAuth.getUserRegion();

      // 1. Gerente de Tienda (gerente): puede ver todas las sucursales de su región, pero no otras regiones ni la vista nacional (#/brand)
      if (userRole === 'gerente') {
        if (hash === '#/brand' || hash === '#/select-region' || hash === '#/llegada') {
          console.warn(`[Guard de Seguridad] Gerente de Tienda no tiene acceso a ${hash}.`);
          window.location.hash = '#/403';
          return;
        }
        if (hash.startsWith('#/sucursal/') || hash.startsWith('#/reporte/')) {
          const targetBranchId = hash.replace(/^#\/(sucursal|reporte)\//, '');
          const targetMeta = typeof getBranchById === 'function' ? getBranchById(targetBranchId) : null;
          if (targetMeta && targetMeta.region && userRegion && targetMeta.region !== userRegion) {
            console.warn(`[Guard de Seguridad] Gerente de Tienda (${userRegion}) intentó acceder a sucursal fuera de su región (${targetMeta.region}).`);
            window.location.hash = '#/403';
            return;
          }
        }
      }

      // 2. Gerente Zonal (zonal): sin acceso a la vista corporativa nacional (#/brand)
      if (userRole === 'zonal' && hash === '#/brand') {
        console.warn(`[Guard de Seguridad] Vista corporativa nacional restringida para Gerente Zonal.`);
        window.location.hash = '#/403';
        return;
      }
    }

    const app = document.getElementById('app');
    if (!app) return;

    // Determinar si es una transición principal (Login, Select Region, o inicial)
    const isMainTransition = !quieto && (!this.current ||
                             (this.current === '#/login' && (hash === '#/select-region' || hash === '#/llegada')) ||
                             hash === '#/login');
    const scrollPrevio = window.scrollY;

    if (isMainTransition && window.showLcpLoader) {
      window.showLcpLoader();
      window.updateLcpLoader(20);
    } else if (!quieto) {
      // Sub-transición rápida usando fade-out en app para evitar parpadeos
      app.classList.add('fade-out');
    }

    // Destroy charts before transition
    Charts.destroyAll();
    if (window.HomeView && typeof HomeView.clearAutoplay === 'function') {
      HomeView.clearAutoplay();
    }
    if (typeof MobileStickyBarManager !== 'undefined') {
      MobileStickyBarManager.unmount();
    }

    const prevRoute = this.current;

    setTimeout(async () => {
      const route = this.match(hash);
      if (isMainTransition && window.updateLcpLoader) {
        window.updateLcpLoader(60);
      }
      
      document.documentElement.classList.remove('login-page-active');
      if (route.handler) {
        await route.handler(route.params);
        this.current = hash;
        this.updateRouteMeta(hash, route.params);
      }
      if (hash === '#/login') {
        document.documentElement.classList.add('login-page-active');
      }
      
      if (isMainTransition) {
        if (window.updateLcpLoader) window.updateLcpLoader(100);
        window.scrollTo({ top: 0, behavior: 'instant' });
        initReveal();
        if (typeof initSpotlightCards === 'function') initSpotlightCards();
        if (typeof initBlurReveals === 'function') initBlurReveals();
        if (typeof updateSlidingTabPill === 'function') updateSlidingTabPill();
        if (typeof initSegmentedTabs === 'function') initSegmentedTabs();
        if (window.hideLcpLoader) {
          setTimeout(() => {
            window.hideLcpLoader();
          }, 300);
        }
      } else {
        app.classList.remove('fade-out');
        if (quieto) {
          window.scrollTo({ top: scrollPrevio, behavior: 'instant' });
        } else if (hash === '#/' && prevRoute && prevRoute.startsWith('#/sucursal/')) {
          const savedScroll = typeof ViewState !== 'undefined' ? ViewState.get('homeScroll', 0) : 0;
          window.scrollTo({ top: savedScroll, behavior: 'instant' });
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
        initReveal();
        if (typeof initSpotlightCards === 'function') initSpotlightCards();
        if (typeof initBlurReveals === 'function') initBlurReveals();
        if (typeof updateSlidingTabPill === 'function') updateSlidingTabPill();
        if (typeof initSegmentedTabs === 'function') initSegmentedTabs();
      }
      // Lectores de pantalla: anunciar la vista nueva (no en la carga inicial, que ya se lee completa)
      const announcer = document.getElementById('routeAnnouncer');
      if (announcer && prevRoute && !quieto) announcer.textContent = document.title.split(' · ')[0];
      window.dispatchEvent(new CustomEvent('etoile:route-rendered', { detail: { hash } }));
    }, quieto ? 0 : 150);
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    window.addEventListener('load', () => this.resolve());
  }
};
