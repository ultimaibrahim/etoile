/**
 * js/components/command-palette.js — Command Palette Universal (Ctrl+K / Cmd+K)
 * Modal omnibox flotante con estética Crystal & Squircle para navegación instantánea,
 * búsqueda difusa de sucursales, directores de región, métricas y comandos del sistema.
 */

const CommandPalette = (function() {
  'use strict';

  let isOpen = false;
  let selectedIndex = 0;
  let filteredItems = [];
  let modalEl = null;

  /**
   * Catálogo de acciones estáticas y módulos del sistema
   */
  const SYSTEM_ACTIONS = [
    {
      id: 'nav-home',
      category: 'Navegación',
      title: 'Inicio · Tablero Principal',
      subtitle: 'Vista general de la región activa con métricas de desempeño',
      icon: 'home',
      action: () => { window.location.hash = '#/'; }
    },
    {
      id: 'nav-dashboards',
      category: 'Navegación',
      title: 'Cuadro de Mando · Analítica',
      subtitle: 'Gráficas de volumen, distribución de estrellas y rankings',
      icon: 'barChart',
      action: () => { window.location.hash = '#/dashboards'; }
    },
    {
      id: 'nav-select-region',
      category: 'Navegación',
      title: 'Explorar Regiones y Años',
      subtitle: 'Explorador histórico multinacional y ranking bayesiano',
      icon: 'globe',
      action: () => { window.location.hash = '#/select-region'; }
    },
    {
      id: 'nav-about',
      category: 'Navegación',
      title: 'Acerca de Étoile',
      subtitle: 'Metodología CSAT, umbrales y créditos de plataforma',
      icon: 'info',
      action: () => { window.location.hash = '#/acerca'; }
    },
    {
      id: 'nav-privacy',
      category: 'Navegación',
      title: 'Aviso de Privacidad',
      subtitle: 'Políticas de tratamiento de datos y confidencialidad',
      icon: 'shield',
      action: () => { window.location.hash = '#/privacidad'; }
    },
    {
      id: 'act-theme',
      category: 'Comando',
      title: 'Alternar Tema (Claro / Oscuro)',
      subtitle: 'Cambiar la paleta visual de la interfaz',
      icon: 'moon',
      action: () => { if (typeof toggleDark === 'function') toggleDark(); }
    },
    {
      id: 'act-clear-cache',
      category: 'Comando',
      title: 'Limpiar Caché Local (Zenith Core)',
      subtitle: 'Purgar almacenamiento IndexedDB y forzar sincronización',
      icon: 'refresh',
      action: async () => {
        if (typeof EtoileCache !== 'undefined') {
          await EtoileCache.clearAll();
          if (typeof DataLoader !== 'undefined') DataLoader.cache = {};
          alert('Caché local de Étoile purgada con éxito.');
          window.location.reload();
        }
      }
    }
  ];

  /**
   * Genera el conjunto completo de elementos buscables
   */
  function getAllItems() {
    const items = [...SYSTEM_ACTIONS];

    // 1. Sucursales de todas las regiones
    const branches = (typeof SUCURSALES_META_ALL !== 'undefined' && Array.isArray(SUCURSALES_META_ALL))
      ? SUCURSALES_META_ALL
      : (typeof SUCURSALES_META !== 'undefined' && Array.isArray(SUCURSALES_META) ? SUCURSALES_META : []);

    branches.forEach(b => {
      const regionName = typeof getRegionName === 'function' ? getRegionName(b.region) : b.region;
      items.push({
        id: `branch-${b.id}`,
        category: 'Sucursales',
        title: b.nombre,
        subtitle: `Región ${regionName} · Ver ficha y opiniones`,
        badge: b.region,
        icon: 'store',
        action: () => {
          if (typeof setRegionActiva === 'function' && b.region) {
            setRegionActiva(b.region);
          }
          window.location.hash = `#/branch/${b.id}`;
        }
      });
    });

    // 2. Histórico de Años
    if (typeof DataLoader !== 'undefined' && DataLoader.manifest) {
      Object.keys(DataLoader.manifest).sort((a, b) => b - a).forEach(year => {
        items.push({
          id: `year-${year}`,
          category: 'Periodo',
          title: `Año ${year}`,
          subtitle: `Consultar datos consolidados del año ${year}`,
          badge: `${DataLoader.manifest[year].length} meses`,
          icon: 'calendar',
          action: () => {
            if (typeof DataLoader.setMonth === 'function') {
              const lastMonth = DataLoader.manifest[year][DataLoader.manifest[year].length - 1];
              DataLoader.setMonth(Number(year), lastMonth);
            }
            window.location.hash = '#/';
          }
        });
      });
    }

    return items;
  }

  /**
   * Renderiza el DOM del modal
   */
  function buildDOM() {
    if (modalEl) return;

    modalEl = document.createElement('div');
    modalEl.id = 'commandPaletteOverlay';
    modalEl.className = 'cmd-palette-backdrop';
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.innerHTML = `
      <div class="cmd-palette-dialog" role="dialog" aria-modal="true" aria-label="Buscador global">
        <div class="cmd-input-wrap">
          <svg class="cmd-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="cmdPaletteInput" class="cmd-search-input" placeholder="Escribe para buscar sucursales, métricas, periodos o acciones..." autocomplete="off" spellcheck="false">
          <kbd class="cmd-kbd-badge">Esc</kbd>
        </div>
        <div id="cmdPaletteResults" class="cmd-results-list" role="listbox"></div>
        <div class="cmd-palette-footer">
          <span class="cmd-footer-hint"><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
          <span class="cmd-footer-hint"><kbd>↵</kbd> Seleccionar</span>
          <span class="cmd-footer-hint"><kbd>Esc</kbd> Cerrar</span>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    // Eventos del modal
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });

    const input = document.getElementById('cmdPaletteInput');
    input.addEventListener('input', () => {
      filter(input.value);
    });

    input.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Filtra los elementos según la consulta
   */
  function filter(query) {
    const all = getAllItems();
    const cleanQuery = (query || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    if (!cleanQuery) {
      filteredItems = all.slice(0, 10);
    } else {
      filteredItems = all.filter(item => {
        const titleClean = (item.title || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const subClean = (item.subtitle || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const catClean = (item.category || '').toLowerCase();
        return titleClean.includes(cleanQuery) || subClean.includes(cleanQuery) || catClean.includes(cleanQuery);
      }).slice(0, 12);
    }

    selectedIndex = 0;
    renderResults();
  }

  /**
   * Renderiza la lista de resultados
   */
  function renderResults() {
    const listEl = document.getElementById('cmdPaletteResults');
    if (!listEl) return;

    if (filteredItems.length === 0) {
      listEl.innerHTML = `
        <div class="cmd-empty-state">
          <span>No se encontraron coincidencias para la búsqueda.</span>
        </div>
      `;
      return;
    }

    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => String(s || ''));

    listEl.innerHTML = filteredItems.map((item, idx) => {
      const isSelected = idx === selectedIndex;
      const badgeHtml = item.badge ? `<span class="cmd-item-badge">${esc(item.badge)}</span>` : '';

      return `
        <div class="cmd-item ${isSelected ? 'selected' : ''}" data-index="${idx}" role="option" aria-selected="${isSelected}">
          <div class="cmd-item-left">
            <span class="cmd-item-category">${esc(item.category)}</span>
            <span class="cmd-item-title">${esc(item.title)}</span>
            <span class="cmd-item-sub">${esc(item.subtitle)}</span>
          </div>
          <div class="cmd-item-right">
            ${badgeHtml}
            <span class="cmd-item-enter-icon">↵</span>
          </div>
        </div>
      `;
    }).join('');

    // Listener para clic en items
    listEl.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-index'));
        executeItem(idx);
      });
      el.addEventListener('mouseenter', () => {
        const idx = Number(el.getAttribute('data-index'));
        setSelectedIndex(idx, false);
      });
    });

    scrollSelectedIntoView();
  }

  function setSelectedIndex(idx, shouldScroll = true) {
    if (idx < 0 || idx >= filteredItems.length) return;
    selectedIndex = idx;
    const listEl = document.getElementById('cmdPaletteResults');
    if (!listEl) return;

    listEl.querySelectorAll('.cmd-item').forEach((el, i) => {
      if (i === selectedIndex) {
        el.classList.add('selected');
        el.setAttribute('aria-selected', 'true');
      } else {
        el.classList.remove('selected');
        el.setAttribute('aria-selected', 'false');
      }
    });

    if (shouldScroll) scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    const listEl = document.getElementById('cmdPaletteResults');
    const selectedEl = listEl ? listEl.querySelector('.cmd-item.selected') : null;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((selectedIndex + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((selectedIndex - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeItem(selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function executeItem(idx) {
    const item = filteredItems[idx];
    if (item && typeof item.action === 'function') {
      close();
      item.action();
    }
  }

  function open() {
    buildDOM();
    isOpen = true;
    modalEl.classList.add('active');
    modalEl.setAttribute('aria-hidden', 'false');

    const input = document.getElementById('cmdPaletteInput');
    if (input) {
      input.value = '';
      filter('');
      setTimeout(() => input.focus(), 50);
    }
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modalEl || !isOpen) return;
    isOpen = false;
    modalEl.classList.remove('active');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  /**
   * Atajo de teclado global Ctrl+K / Cmd+K
   */
  function initGlobalShortcut() {
    window.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    });
  }

  // Atajo desactivado temporalmente a petición de Ibrahim para evitar interferencias
  // if (typeof window !== 'undefined') {
  //   initGlobalShortcut();
  // }

  return {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function() { return isOpen; }
  };
})();
