/**
 * views/home.js — Vista principal: mes en curso vs anterior + KPIs + Feed.
 */

const HomeView = {
  filter: 'todas',
  highlightIdx: 0,
  searchQuery: '',
  sortBy: 'default',
  carouselPool: [],
  carouselStartIndex: 0,
  carouselBatchSize: 8,
  autoplayInterval: null,
  scrollFraction: 0,
  isPaused: false,
  scrollAnimationFrame: null,
  scrollAnimationActive: false,

  async render() {
    if (typeof ViewState !== 'undefined') {
      this.filter = ViewState.get('homeFilter', 'todas');
      this.searchQuery = ViewState.get('homeSearch', '');
      this.sortBy = ViewState.get('homeSort', 'default');
    }
    if (typeof SUCURSALES_META !== 'undefined' && SUCURSALES_META.length === 1) {
      await BranchView.render({ id: SUCURSALES_META[0].id }, true);
      return;
    }
    Charts.destroyAll();

    const skeletonTimeout = setTimeout(() => {
      this.renderSkeleton();
    }, 250);

    const currYear = DataLoader.currentYear;
    const prevYear = DataLoader.previousYear;
    const currMonth = DataLoader.currentMonth;
    const prevMonth = DataLoader.previousMonth;

    // Load YTD months concurrently for current year to calculate sparklines
    const ytdMonths = (DataLoader.manifest && DataLoader.manifest[currYear]) 
      ? [...DataLoader.manifest[currYear]].filter(m => m <= currMonth).sort((a,b) => a - b)
      : [currMonth];

    const hasPrevMonth = DataLoader.hasMonth(prevYear, prevMonth);
    const loadPromises = ytdMonths.map(m => DataLoader.loadMonth(currYear, m));
    if (hasPrevMonth) {
      loadPromises.push(DataLoader.loadMonth(prevYear, prevMonth));
    }
    
    try {
      await Promise.all(loadPromises);
    } finally {
      clearTimeout(skeletonTimeout);
    }

    const prevStats = hasPrevMonth ? DataLoader.getAllBranchStats(prevYear, prevMonth) : {};
    const currStats = DataLoader.getAllBranchStats(currYear, currMonth);
    const prevGlobal = hasPrevMonth ? DataLoader.getGlobalStats(prevYear, prevMonth) : { totalReviews: 0, avgRating: 0, withText: 0 };
    const currGlobal = DataLoader.getGlobalStats(currYear, currMonth);

    const currMonthName = new Date(currYear, currMonth - 1).toLocaleString('es-ES', { month: 'long' });
    const prevMonthName = new Date(prevYear, prevMonth - 1).toLocaleString('es-ES', { month: 'long' });
    const capitalizedCurrMonth = currMonthName.charAt(0).toUpperCase() + currMonthName.slice(1);
    const capitalizedPrevMonth = prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1);
    const currMonthShort = capitalizedCurrMonth.substring(0, 3).toUpperCase();

    const brillo = DataLoader.brillo(currYear, currMonth, SUCURSALES_META.map(m => m.id));
    const branches = SUCURSALES_META.map(meta => {
      const p = prevStats[meta.id] || { avg: 0, count: 0 };
      const c = currStats[meta.id] || { avg: 0, count: 0, negativeCount: 0 };
      const branchReviews = DataLoader.getReviewsForBranch(currYear, currMonth, meta.id);
      const negativeWithTextCount = branchReviews.filter(r => Metrics.isComplaint(r) && r.text && r.text.trim().length > 0).length;
      const hasAlert = negativeWithTextCount > 0;
      return {
        ...meta,
        prev: { score: p.avg, count: p.count },
        curr: { score: c.avg, count: c.count, negativeCount: negativeWithTextCount },
        hasAlert,
        alerta: hasAlert,
        estado: brillo[meta.id].estado,
        statusMayo: hasAlert ? {
          negativas: negativeWithTextCount,
          tema: meta.alertTheme || 'Problemas operativos',
          detalle: `${negativeWithTextCount} reseña${negativeWithTextCount !== 1 ? 's' : ''} negativa${negativeWithTextCount !== 1 ? 's' : ''} en ${capitalizedCurrMonth.toLowerCase()}.`
        } : null
      };
    });

    const conAlerta = branches.filter(s => s.alerta);
    const sinAlerta = branches.filter(s => !s.alerta);
    const totalNegativasActivas = conAlerta.reduce((a, s) => a + (s.statusMayo?.negativas || 0), 0);
    const totalNegativasTotal = branches.reduce((a, s) => a + s.curr.negativeCount, 0);
    const promHistorico = (branches.reduce((a, s) => a + s.historico, 0) / branches.length).toFixed(2);

    let visible = branches;
    if (this.filter === 'alerta') visible = conAlerta;
    else if (this.filter === 'estables') visible = sinAlerta;

    // Orden por brillo ajustado (marca.md): un 5.0 con dos reseñas no pasa delante de un 4.80 con sesenta
    const sorted = Brillo.ordena(visible);

    // KPIs
    const kpiData = await Kpis.computeMonth(currYear, currMonth);
    const prevKpi = hasPrevMonth ? await Kpis.computeMonth(prevYear, prevMonth) : null;

    // Compute YTD KPIs for sparklines
    const ytdKpiPromises = ytdMonths.map(m => Kpis.computeMonth(currYear, m));
    const ytdKpis = await Promise.all(ytdKpiPromises);

    const sparklines = {
      volumen: ytdKpis.map(k => k.volumen.ok),
      calidad: ytdKpis.map(k => k.calidadTexto.ratio * 100),
      rating: ytdKpis.map(k => k.global.avgRating),
      respuestas: ytdKpis.map(k => k.tasaRespuesta.value * 100)
    };

    const kpiSection = this._buildKpiSection(kpiData, currStats, prevKpi, capitalizedCurrMonth, currYear, capitalizedPrevMonth, hasPrevMonth, sparklines);



    // Reviews data for Feed
    const currentData = DataLoader.getMonth(currYear, currMonth);
    const reviewsList = currentData ? currentData.reviews : [];

    // Set up infinite carousel pool
    const textReviews = reviewsList.filter(r => r.text && r.text.trim().length > 5);
    const negativesPool = textReviews.filter(r => Metrics.isComplaint(r) && r.text.length > 10);
    const positivesPool = textReviews.filter(r => r.stars === 5 && r.text.length > 20);
    const restPool = textReviews.filter(r => !negativesPool.includes(r) && !positivesPool.includes(r));
    
    // Combine and shuffle the pool for randomization
    const combinedPool = [...negativesPool, ...positivesPool, ...restPool];
    for (let i = combinedPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combinedPool[i], combinedPool[j]] = [combinedPool[j], combinedPool[i]];
    }

    // Limit to maximum 40 reviews in the carousel pool to avoid rendering too many items
    if (combinedPool.length > 40) {
      combinedPool.length = 40;
    }

    this.carouselPool = combinedPool.map((r, index) => {
      r.carouselId = index;
      return r;
    });
    this.carouselBatchSize = 8;
    this.carouselStartIndex = 0;

    // Render all elements of the pool. If size > 3, duplicate them for seamless wrapping.
    let activeReviews = [];
    if (this.carouselPool.length > 0) {
      if (this.carouselPool.length > 3) {
        activeReviews = [...this.carouselPool, ...this.carouselPool];
      } else {
        activeReviews = [...this.carouselPool];
      }
    }
    const countWithText = textReviews.length;

    const avgRating = currGlobal.avgRating;
    const cards = sorted.map(s => {
      const delta = (s.curr.score - s.historico);
      const noData = !(s.curr.count > 0);   // sin reseñas en el mes no hay con qué comparar: un delta contra nada es ficción
      const dClass = noData ? 'flat' : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
      const dStr = noData ? 'sin reseñas' : delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
      const currScoreStr = s.curr.score > 0 ? s.curr.score.toFixed(2) : '—';
      const mayoBlock = s.hasAlert
        ? `<div class="bc-mayo warn"><span class="mono">${currMonthShort}</span> <span>${s.curr.negativeCount} negativa${s.curr.negativeCount !== 1 ? 's' : ''}</span></div>`
        : `<div class="bc-mayo"><span class="mono">${currMonthShort}</span> <span>Sin incidencias</span></div>`;

      let hoverClass = ' stable-green';
      let statusClass = 'ok';
      let statusTitle = 'Estable';
      if (s.curr.count === 0) {
        hoverClass = ' no-activity';
        statusClass = 'no-activity';
        statusTitle = 'Sin actividad';
      } else if (s.alerta) {
        if (s.curr.score >= KpiMeta.ratingMinimo) {
          hoverClass = ' alerta-orange';
          statusClass = 'warn-orange';
          statusTitle = 'Atención requerida';
        } else {
          hoverClass = ' alerta-red';
          statusClass = 'warn-red';
          statusTitle = 'Crítico';
        }
      }
      
      const cardMayoBlock = s.curr.count === 0
        ? `<div class="bc-mayo" style="background: rgba(138, 135, 124, 0.08); color: var(--text-dim);"><span class="mono">${currMonthShort}</span> <span>Sin actividad</span></div>`
        : mayoBlock;

      return `
      <a class="branch-card${hoverClass}" href="#/sucursal/${s.id}">
        ${svgIcon('fleur')}
        <div class="bc-top">
          <div class="bc-name">${s.abr}</div>
          <div class="bc-card-stars">${Rosa.html(Rosa.deTienda(s.estado), { size: 22, label: Brillo.lectura(s.estado) })}</div>
          <span class="bc-status ${statusClass}" title="${statusTitle}"></span>
        </div>
        <div class="bc-score-row">
          <span class="bc-score num">${currScoreStr}</span>
        </div>
        <div class="bc-meta">
          <span><strong>${s.curr.count}</strong> reseña${s.curr.count !== 1 ? 's' : ''} ${capitalizedCurrMonth.substring(0,3).toLowerCase()}</span>
          <span class="bc-delta ${dClass} num">${noData ? dStr : dStr + ' vs hist'}</span>
        </div>
        ${cardMayoBlock}
      </a>`;
    }).join('');

    // Dynamic Alert Strip / Banner
    let alertBannerHtml = '';
    if (conAlerta.length > 0) {
      alertBannerHtml = `
        <div class="alert-strip alert-box-sunken clickable r" onclick="HomeView.openAllAlertsModal()">
          <div class="watermark-stars" style="opacity: 0.05;">
            ${svgIcon('starFilled')}
            ${svgIcon('star')}
            ${svgIcon('star')}
            ${svgIcon('star')}
            ${svgIcon('star')}
          </div>
          <div class="alert-header-row" style="display:flex; align-items:center; gap:12px; margin-bottom:12px; z-index:1; position:relative;">
            <div class="alert-icon-box" style="margin-top:0;">${svgIcon('alert')}</div>
            <div class="alert-title" style="margin-bottom:0;">Alerta Activa · ${capitalizedCurrMonth} ${currYear}</div>
          </div>
          <div class="alert-content" style="z-index:1; position:relative; flex-grow:1; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="alert-text">${conAlerta.length} sucursal${conAlerta.length !== 1 ? 'es' : ''} con alerta activa (${totalNegativasActivas} reseñas negativas). Reportar a Marketing.</div>
            <div style="border-top: 1px solid var(--border); margin-top: 16px; padding-top: 16px;">
              <div class="alert-pills" style="margin-top:0;">
                ${conAlerta.map(s => `<button class="alert-pill" onclick="event.stopPropagation(); HomeView.openAlertModal('${s.id}')">${s.abr} · ${s.curr.negativeCount}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      alertBannerHtml = `
        <div class="alert-strip ok-box-sunken r">
          <div class="alert-header-row" style="display:flex; align-items:center; gap:12px; margin-bottom:12px; z-index:1; position:relative;">
            <div class="alert-icon-box" style="margin-top:0;">${svgIcon('check')}</div>
            <div class="alert-title" style="margin-bottom:0;">Operación Estable</div>
          </div>
          <div class="alert-content" style="z-index:1; position:relative; flex-grow:1; display:flex; flex-direction:column; justify-content:flex-start;">
            <div class="alert-text">Sin alertas registradas en ${capitalizedCurrMonth} ${currYear}. Todo bajo control.</div>
          </div>
        </div>
      `;
    }

    const sortedMonths = [...(DataLoader.manifest[currYear] || [])].sort((a, b) => a - b);
    const customOptionsHtml = sortedMonths.map(m => {
      const monthName = MONTH_NAMES[m - 1];
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const isActive = m === currMonth ? ' active' : '';
      return `<div class="custom-option${isActive}" data-value="${m}" onclick="HomeView.selectHeroMonthOption(${m})">${capMonth} ${currYear}</div>`;
    }).join('');

    const dropdownHtml = `
      <div class="hero-month-select-container">
        <div class="custom-select" id="heroMonthDropdown">
          <button class="custom-select-trigger" onclick="HomeView.toggleHeroMonthDropdown(event)">
            <span class="custom-select-value">${capitalizedCurrMonth} ${currYear}</span>
            <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="custom-select-options">
            ${customOptionsHtml}
          </div>
        </div>
      </div>
    `;

    let trendHtml = hasPrevMonth
      ? `<span class="hero-trend" style="${currGlobal.avgRating >= prevGlobal.avgRating ? 'background:color-mix(in srgb, var(--luz) 12%, transparent);border-color:color-mix(in srgb, var(--luz) 30%, transparent);color:var(--luz);' : 'background:color-mix(in srgb, var(--brasa) 12%, transparent);border-color:color-mix(in srgb, var(--brasa) 30%, transparent);color:var(--brasa);'}">${currGlobal.avgRating >= prevGlobal.avgRating ? '↑' : '↓'} ${Math.abs(currGlobal.avgRating - prevGlobal.avgRating).toFixed(2)} vs ${capitalizedPrevMonth} (${prevGlobal.avgRating.toFixed(2)})</span>`
      : `<span class="hero-trend" style="background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.1);color:var(--banda-texto);">Meta: 4.60★</span>`;

    const prevVolSubHtml = hasPrevMonth
      ? `<span class="hero-stat-sub">${prevGlobal.totalReviews} en ${capitalizedPrevMonth.toLowerCase()}</span>`
      : `<span class="hero-stat-sub">Meta: 4.5+ estrellas</span>`;

    // Briefing: lo que lee primero cada rol (la sucursal propia si la cuenta es de tienda; si no, la región)
    const goal = EC.metaRating();
    const userBranch = (typeof AppAuth !== 'undefined' && AppAuth.getUserRole() === 'gerente') ? AppAuth.getUserSucursal() : null;
    const branchRows = branches.map(b => ({ id: b.id, nombre: b.nombre, avg: b.curr.score, count: b.curr.count }));
    const scopeIds = userBranch ? [userBranch] : branches.map(b => b.id);
    const pendingAll = Briefing.pending(branches.map(b => b.id));
    const pending = userBranch ? pendingAll.filter(r => isSameBranch(r.sucursal, userBranch)) : pendingAll;
    let heroAvg = currGlobal.avgRating, briefSegs, briefKicker, branchHero = null;
    const nowLong = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: BranchTime.MONTH_TZ });
    if (userBranch && resolveBranchMeta(userBranch)) {
      const me = branchRows.find(b => isSameBranch(b.id, userBranch)) || { id: userBranch, nombre: resolveBranchMeta(userBranch).nombre, avg: 0, count: 0 };
      const ranked = branchRows.filter(b => b.count > 0).sort((a, b) => b.avg - a.avg);
      const rank = ranked.findIndex(b => b.id === me.id) + 1;
      heroAvg = me.avg;
      branchHero = { me, rank, nRanked: ranked.length, prev: prevStats[me.id] || { avg: 0, count: 0 } };
      // La flecha compara a la sucursal con su propio mes anterior (no con la región)
      trendHtml = branchHero.prev.count > 0 && me.count > 0
        ? `<span class="hero-trend" style="${me.avg >= branchHero.prev.avg ? 'background:color-mix(in srgb, var(--luz) 12%, transparent);border-color:color-mix(in srgb, var(--luz) 30%, transparent);color:var(--luz);' : 'background:color-mix(in srgb, var(--brasa) 12%, transparent);border-color:color-mix(in srgb, var(--brasa) 30%, transparent);color:var(--brasa);'}">${me.avg >= branchHero.prev.avg ? '↑' : '↓'} ${Math.abs(me.avg - branchHero.prev.avg).toFixed(2)} vs ${capitalizedPrevMonth} (${branchHero.prev.avg.toFixed(2)})</span>`
        : `<span class="hero-trend" style="background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.1);color:var(--banda-texto);">Sin reseñas en ${capitalizedPrevMonth.toLowerCase()}</span>`;
      briefSegs = Narrative.briefingBranch({ nombre: me.nombre, avg: me.avg, count: me.count, rank: rank || null, of: ranked.length, regionName: getRegionName(activeRegion), unreplied: pending.length, oldestDays: pending.length ? Briefing.ageDays(pending[0]) : 0 });
      briefKicker = `${me.nombre} · ${nowLong}`;
    } else {
      briefSegs = Narrative.briefingRegion({ name: getRegionName(activeRegion), avg: currGlobal.avgRating, goal, count: currGlobal.totalReviews, attention: Briefing.attention(branchRows, pendingAll, goal) });
      briefKicker = `${getRegionName(activeRegion)} · ${nowLong}`;
    }
    // Estado del héroe: la tienda propia (con su brillo ajustado) o la región entera (su propio promedio, sin ajuste)
    const heroEstado = branchHero ? (brillo[branchHero.me.id] || { estado: Brillo.estado({ avg: 0 }) }).estado
      : Brillo.estado({ avg: currGlobal.avgRating, nTexto: currGlobal.withText, C: currGlobal.avgRating });
    const briefingHeadHtml = `<div class="brf-pill"><div class="brf-kicker">${escapeHtml(briefKicker)}</div><h1 class="brf-head" id="briefHead">${Briefing.headline(briefSegs)}</h1></div>`;
    const pendingHtml = Briefing.rowsHtml(pending, scopeIds, brillo);
    // Cuenta de tienda: abre con su sucursal y aquí se le invita a recorrer las demás de su región
    const others = branchHero ? branches.length - 1 : 0;
    const exploreHtml = others > 0
      ? `<div class="hero-explore-row"><button class="hero-explore" onclick="HomeView.scrollToBranches()">Explora ${others === 1 ? 'la otra tienda' : `las otras ${others} tiendas`} de ${escapeHtml(getRegionName(activeRegion))} <span aria-hidden="true">↓</span></button><a class="hero-explore hero-explore--ghost" href="#/sucursal/${encodeURIComponent(resolveBranchMeta(userBranch).id)}">Ficha de mi sucursal</a></div>`
      : '';

    const concluded = getConcludedMonthInfo();
    let concludedBannerHtml = '';
    if (concluded) {
      const monthName = MONTH_NAMES[concluded.month - 1];
      concludedBannerHtml = `
        <div class="concluded-month-banner" onclick="showConcludedMonthModal(${concluded.year}, ${concluded.month})">
          <span class="cmb-badge">Reporte Mensual</span>
          <div class="cmb-content-wrap">
            <span class="cmb-title">El mes de <strong>${monthName} ${concluded.year}</strong> ha finalizado. El resumen ejecutivo está listo.</span>
            <span class="cmb-link-btn">Ver Resumen →</span>
          </div>
        </div>
      `;
    }

    document.getElementById('app').innerHTML = `
      ${concludedBannerHtml}
      ${buildTopbar()}
      <section class="hero" style="position: relative;">
        <div class="hero-chart-bg" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1; opacity: 0.42; pointer-events: none;">
          <div id="heroTrendChart" style="width: 100%; height: 100%;"></div>
        </div>
        <div class="hero-inner" style="position: relative; z-index: 2;">
          <div class="hero-left">
            <div class="hero-label-row" style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:16px;">
              <span class="eyebrow">${userBranch ? 'Promedio de tu sucursal' : 'Promedio Regional'}</span>
              ${dropdownHtml}
            </div>
            <div class="hero-score hero-link" role="button" tabindex="0" aria-label="Ver el desglose de la calificación" onclick="HomeView.openRatingDrawer()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();HomeView.openRatingDrawer();}">
              <span class="hero-score-num num" id="heroNum">${heroAvg.toFixed(2)}</span>
              <div class="hero-score-side">
                <span class="hero-stars">${Rosa.anim(Rosa.deTienda(heroEstado, null, null, 'banda'), { size: 44, tema: 'banda', luz: true, label: `${Brillo.lectura(heroEstado)}: ${heroAvg.toFixed(2)} de 5.00` })}<span class="hero-estado" aria-hidden="true">${Brillo.lectura(heroEstado)}</span></span>
                <span class="hero-of">de 5.00</span>
                ${trendHtml}
              </div>
            </div>
            ${briefingHeadHtml}
            ${exploreHtml}
          </div>
          <div class="hero-right">
            ${branchHero ? `
            <div class="hero-stat hero-link" role="button" tabindex="0" onclick="HomeView.openFullFeedModal('todas')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();HomeView.openFullFeedModal('todas');}">
              <span class="hero-stat-val num">${branchHero.me.count}</span>
              <div class="hero-stat-info"><span class="hero-stat-label">Reseñas ${capitalizedCurrMonth}</span><span class="hero-stat-sub">${branchHero.prev.count} en ${capitalizedPrevMonth.toLowerCase()}</span></div>
            </div>
            <div class="hero-stat hero-link" role="button" tabindex="0" onclick="HomeView.openBranchesDrawer()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();HomeView.openBranchesDrawer();}">
              <span class="hero-stat-val num">${branchHero.rank ? branchHero.rank + '.º' : '—'}</span>
              <div class="hero-stat-info"><span class="hero-stat-label">Posición en la región</span><span class="hero-stat-sub">de ${branchHero.nRanked} con reseñas</span></div>
            </div>
            <div class="hero-stat hero-link ${pending.length ? 'warn' : ''}" role="button" tabindex="0" onclick="Briefing.openFor('')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Briefing.openFor('');}">
              <span class="hero-stat-val num">${pending.length}</span>
              <div class="hero-stat-info"><span class="hero-stat-label">Quejas sin respuesta</span><span class="hero-stat-sub">últimos 30 días</span></div>
            </div>`
            : `            <div class="hero-stat hero-link" role="button" tabindex="0" onclick="HomeView.openFullFeedModal('todas')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();HomeView.openFullFeedModal('todas');}">
              <span class="hero-stat-val num">${currGlobal.totalReviews}</span>
              <div class="hero-stat-info">
                <span class="hero-stat-label">Reseñas ${capitalizedCurrMonth}</span>
                ${prevVolSubHtml}
              </div>
            </div>
            <div class="hero-stat hero-link" role="button" tabindex="0" onclick="HomeView.openBranchesDrawer()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();HomeView.openBranchesDrawer();}">
              <span class="hero-stat-val num">${branches.length}</span>
              <div class="hero-stat-info">
                <span class="hero-stat-label">Sucursales</span>
                <span class="hero-stat-sub">Región ${activeRegion}</span>
              </div>
            </div>
            <div class="hero-stat hero-link ${totalNegativasActivas > 0 ? 'warn' : ''}" role="button" tabindex="0" onclick="HomeView.openFullFeedModal('negativas')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();HomeView.openFullFeedModal('negativas');}">
              <span class="hero-stat-val num">${totalNegativasActivas}</span>
              <div class="hero-stat-info">
                <span class="hero-stat-label">Negativas Activas</span>
                <span class="hero-stat-sub">De ${totalNegativasTotal} totales</span>
              </div>
            </div>`}
          </div>
        </div>
      </section>

      ${pendingHtml}
      <div class="section sync-sec"><p class="sync-note" id="syncNote" hidden></p></div>

      <div class="home-grid-2" style="margin-top: 24px; margin-bottom: 24px;">
        ${alertBannerHtml}
        ${this._buildHighlights(branches, currYear, currMonth)}
      </div>

      ${kpiSection}

      <section class="section r">
        <div class="section-head" style="margin-bottom: 8px;">
          <div class="section-title">Evaluación <span class="accent">de sucursales</span></div>
        </div>

        <div class="branch-controls-bar">
          <div class="filter-row">
            <button class="chip ${this.filter === 'todas' ? 'active' : ''}" onclick="HomeView.setFilter('todas')">Todas <span class="chip-count">${branches.length}</span></button>
            <button class="chip ${this.filter === 'alerta' ? 'active' : ''}" onclick="HomeView.setFilter('alerta')">Con alerta <span class="chip-count">${conAlerta.length}</span></button>
            <button class="chip ${this.filter === 'estables' ? 'active' : ''}" onclick="HomeView.setFilter('estables')">Estables <span class="chip-count">${sinAlerta.length}</span></button>
          </div>
          
          <div class="controls-right">
            <div class="search-wrapper">
              <span class="search-icon-svg">${svgIcon('search')}</span>
              <input type="text" class="branch-search-input" id="branchSearchInput" placeholder="Buscar sucursal…" value="${this.searchQuery}" oninput="HomeView.handleBranchSearch(this.value)">
            </div>
            
            <div class="custom-select" id="branchSortDropdown">
              <button class="custom-select-trigger" onclick="HomeView.toggleSortDropdown(event)">
                <span class="custom-select-label">Orden:</span>
                <span class="custom-select-value" id="sortValLabel">${this.getSortLabel(this.sortBy)}</span>
                <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div class="custom-select-options">
                <div class="custom-option${this.sortBy === 'default' ? ' active' : ''}" data-value="default" onclick="HomeView.selectSortOption('default', 'Predeterminado')">Predeterminado</div>
                <div class="custom-option${this.sortBy === 'rating-desc' ? ' active' : ''}" data-value="rating-desc" onclick="HomeView.selectSortOption('rating-desc', 'Mayor Rating')">Mayor Rating</div>
                <div class="custom-option${this.sortBy === 'rating-asc' ? ' active' : ''}" data-value="rating-asc" onclick="HomeView.selectSortOption('rating-asc', 'Menor Rating')">Menor Rating</div>
                <div class="custom-option${this.sortBy === 'volume-desc' ? ' active' : ''}" data-value="volume-desc" onclick="HomeView.selectSortOption('volume-desc', 'Mayor Volumen')">Mayor Volumen</div>
              </div>
            </div>
          </div>
        </div>

        <div class="branch-grid" id="branchGrid">${cards || (typeof emptyState !== 'undefined' ? emptyState({ title: 'Sin sucursales con este filtro', hint: 'Prueba seleccionando otro estado en los chips superiores.', actionLabel: 'Ver todas', actionAttr: 'onclick="HomeView.setFilter(\'todas\')"' }) : '<div class="empty-state">Sin sucursales para este filtro</div>')}</div>
      </section>

      ${this._buildReviewFeed(activeReviews, countWithText)}

      ${buildFooter(getRegionName(activeRegion))}`;
    Briefing.fillSyncNote('syncNote', activeRegion, userBranch);

    requestAnimationFrame(() => {
      document.getElementById('heroNum')?.classList.add('in');
      initReveal();



      // Close custom selects on clicking outside
      const _clickOutsideHandler = (e) => {
        document.querySelectorAll('.custom-select.open').forEach(dropdown => {
          if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
          }
        });
      };
      document.removeEventListener('click', window._customSelectsOutsideHandler);
      window._customSelectsOutsideHandler = _clickOutsideHandler;
      document.addEventListener('click', _clickOutsideHandler);

      // Counting animation for hero rating
      const heroNumEl = document.getElementById('heroNum');
      if (heroNumEl) {
        // La cifra sube hasta su valor con frenado suave y se queda (sin movimiento si el sistema lo pide)
        const targetVal = heroAvg;
        const startVal = Math.max(0, targetVal - 1.2);
        const duration = window.ETOILE_REPINTA || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400;
        let startTimestamp = null;
        const step = (timestamp) => {
          if (!startTimestamp) startTimestamp = timestamp;
          const progress = duration ? Math.min((timestamp - startTimestamp) / duration, 1) : 1;
          const val = (1 - Math.pow(1 - progress, 4)) * (targetVal - startVal) + startVal;
          heroNumEl.textContent = val.toFixed(2);
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            heroNumEl.textContent = targetVal.toFixed(2);
          }
        };
        window.requestAnimationFrame(step);
      }

      // Animate KPI progress bars: start at 0 → target width
      document.querySelectorAll('.kpi-progress-bar').forEach(bar => {
        const targetWidth = bar.style.width;
        bar.style.width = '0%';
        bar.style.transition = 'none';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            bar.style.transition = '';
            bar.style.width = targetWidth;
          });
        });
      });

      // Render absolute background trend chart in Hero
      const heroChartEl = document.getElementById('heroTrendChart');
      if (heroChartEl && typeof EtoileCharts !== 'undefined') {
        const trendLabels = [];
        const trendData = [];
        const sortedMonths = [...(DataLoader.manifest[currYear] || [])].sort((a, b) => a - b);
        for (const m of sortedMonths) {
          const mName = MONTH_NAMES[m - 1].substring(0, 3);
          trendLabels.push(`${mName}`);
          const d = DataLoader.getMonth(currYear, m);
          if (d && d.reviews && d.reviews.length > 0) {
            const avg = d.reviews.reduce((sum, r) => sum + r.stars, 0) / d.reviews.length;
            trendData.push(avg);
          } else {
            trendData.push(null);
          }
        }
        EtoileCharts.heroTrend(heroChartEl, trendLabels, trendData);
      }

      // Start Carousel Autoplay
      HomeView.initAutoplay();

      // Check for welcome onboarding / walkthrough (Idea 3)
      if (RECORRIDO_ACTIVO && localStorage.getItem('lcp_walkthrough_seen') !== 'true') {
        setTimeout(() => {
          if (typeof LcpWalkthrough !== 'undefined') {
            LcpWalkthrough.showWelcomeOnboarding(userName, userRole);
          }
        }, 1000);
      }

      // Pause carousel autoplay on hover, click, or touch hold
      const carouselOuter = document.querySelector('.review-feed-carousel-outer');
      if (carouselOuter) {
        carouselOuter.addEventListener('mouseenter', () => { HomeView.isPaused = true; });
        carouselOuter.addEventListener('mouseleave', () => { HomeView.isPaused = false; });
        carouselOuter.addEventListener('mousedown', () => { HomeView.isPaused = true; });
        carouselOuter.addEventListener('mouseup', () => { HomeView.isPaused = false; });
        
        // Touch events for mobile
        carouselOuter.addEventListener('touchstart', () => { HomeView.isPaused = true; }, { passive: true });
        carouselOuter.addEventListener('touchend', () => { HomeView.isPaused = false; }, { passive: true });
        carouselOuter.addEventListener('touchcancel', () => { HomeView.isPaused = false; }, { passive: true });
      }
    });
  },

  _buildKpiSection(kpi, currStats, prevKpi, monthName, year, prevMonthName, hasPrevMonth, sparklines) {
    const missingVol = [];
    for (const meta of SUCURSALES_META) {
      const stats = currStats[meta.id] || { count: 0 };
      if (stats.count < kpi.volumen.meta) {
        missingVol.push(meta.abr);
      }
    }
    const volClass = missingVol.length === 0 ? 'optimal' : 'attention';
    const volValue = `${kpi.volumen.ok} de ${kpi.volumen.total}`;
    const volSub = missingVol.length > 0 ? `No cumplen: ${missingVol.join(', ')}` : 'Todas cumplen la meta';

    const calClass = kpi.calidadTexto.ratio >= KpiMeta.calidadTextoMeta ? 'optimal' : 'attention';
    const calValue = `${(kpi.calidadTexto.ratio * 100).toFixed(0)}% con texto`;
    const calTrend = (hasPrevMonth && prevKpi) ? kpi.calidadTexto.ratio - prevKpi.calidadTexto.ratio : 0;
    const calTrendStr = (hasPrevMonth && prevKpi)
      ? (calTrend > 0.005 
        ? `<span class="kpi-arrow up">↑</span> +${(calTrend * 100).toFixed(0)}% vs ${prevMonthName}` 
        : calTrend < -0.005 
          ? `<span class="kpi-arrow down">↓</span> ${(calTrend * 100).toFixed(0)}% vs ${prevMonthName}` 
          : 'Sin cambios vs mes anterior')
      : `Meta: ${(KpiMeta.calidadTextoMeta * 100).toFixed(0)}% con texto`;

    const ratClass = kpi.ratingMinimo.belowMin.length === 0 ? 'optimal' : 'critical';
    const belowDetails = kpi.ratingMinimo.belowMin.map(id => {
      const b = getBranchById(id);
      const s = currStats[id] || { avg: 0 };
      return b ? `${b.abr} (${s.avg.toFixed(2)}★)` : id;
    });
    const ratValue = kpi.ratingMinimo.belowMin.length === 0 ? '✓ Óptimo' : `${kpi.ratingMinimo.belowMin.length} crítica${kpi.ratingMinimo.belowMin.length > 1 ? 's' : ''}`;
    const ratSub = kpi.ratingMinimo.belowMin.length > 0 ? `${belowDetails.join(', ')}` : `Meta: ninguna < ${KpiMeta.ratingMinimo}`;

    const unanswered = kpi.tasaRespuesta.totalNegativas - kpi.tasaRespuesta.conRespuesta;
    const negClass = unanswered === 0 ? 'optimal' : 'critical';
    const negValue = `${unanswered} sin responder`;
    const negSub = `De ${kpi.tasaRespuesta.totalNegativas} negativas totales`;

    // Generate sparklines SVGs
    const volSpark = createSparklineSVG(sparklines?.volumen || [], 110, 32, volClass === 'optimal' ? EC.cssVar('--sage-ink', '#56705F') : EC.cssVar('--oro-line', '#9E7A24'));
    const calSpark = createSparklineSVG(sparklines?.calidad || [], 110, 32, calClass === 'optimal' ? EC.cssVar('--sage-ink', '#56705F') : EC.cssVar('--oro-line', '#9E7A24'));
    const ratSpark = createSparklineSVG(sparklines?.rating || [], 110, 32, ratClass === 'optimal' ? EC.c('acento') : EC.c('brasa'));
    const negSpark = createSparklineSVG(sparklines?.respuestas || [], 110, 32, negClass === 'optimal' ? EC.c('acento') : EC.c('brasa'));

    return `
      <section class="section r">
        <div class="section-head">
          <div class="section-title">Indicadores de operación</div>
          <span class="section-sub">Seguimiento de cumplimiento contra objetivos regionales</span>
        </div>
        <div class="scorecard-grid">
          <!-- Volumen de reseñas: Click opens sidebar -->
          <div class="scorecard status-${volClass} kpi-interactive-card" role="button" tabindex="0" aria-label="Volumen de reseñas: ${volValue}. ${volSub}. Presiona para abrir feed de opiniones." onclick="HomeView.openFullFeedModal('todas')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
            <div class="sc-header-row">
              <span class="sc-label">Volumen de reseñas</span>
              <span class="sc-chevron">→</span>
            </div>
            <div class="sc-value-row">
              <div class="sc-value num">${volValue}</div>
              <div class="sc-sparkline">${volSpark}</div>
            </div>
            <div class="sc-sub" style="margin-bottom: 8px;">${volSub}</div>
            <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${(kpi.volumen.ok / kpi.volumen.total * 100).toFixed(0)}%"></div></div>
            <span class="badge badge-${volClass}">${volClass === 'optimal' ? 'Cumple' : 'Atención'}</span>
          </div>

          <!-- Calidad de reseña: Click opens sidebar -->
          <div class="scorecard status-${calClass} kpi-interactive-card" role="button" tabindex="0" aria-label="Calidad de reseña: ${calValue}. ${calTrendStr.replace(/<[^>]*>/g, '')}. Presiona para abrir feed de positivas." onclick="HomeView.openFullFeedModal('positivas')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
            <div class="sc-header-row">
              <span class="sc-label">Calidad de reseña</span>
              <span class="sc-chevron">→</span>
            </div>
            <div class="sc-value-row">
              <div class="sc-value num">${calValue}</div>
              <div class="sc-sparkline">${calSpark}</div>
            </div>
            <div class="sc-sub" style="margin-bottom: 8px;">${calTrendStr}</div>
            <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${Math.min(kpi.calidadTexto.ratio / KpiMeta.calidadTextoMeta * 100, 100).toFixed(0)}%"></div></div>
            <span class="badge badge-${calClass}">${calClass === 'optimal' ? 'Cumple' : 'Atención'}</span>
          </div>

          <!-- Rating mínimo regional: Collapsible as before -->
          <div class="scorecard status-${ratClass}" role="button" tabindex="0" aria-expanded="false" aria-label="Rating mínimo regional: ${ratValue}. ${ratSub}. Presiona para ver detalles." onclick="this.classList.toggle('active'); this.setAttribute('aria-expanded', this.classList.contains('active') ? 'true' : 'false')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
            <div class="sc-header-row">
              <span class="sc-label">Rating mínimo regional</span>
              <span class="sc-chevron">▼</span>
            </div>
            <div class="sc-value-row">
              <div class="sc-value num">${ratValue}</div>
              <div class="sc-sparkline">${ratSpark}</div>
            </div>
            <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${((kpi.volumen.total - kpi.ratingMinimo.belowMin.length) / kpi.volumen.total * 100).toFixed(0)}%"></div></div>
            <span class="badge badge-${ratClass}">${ratClass === 'optimal' ? 'Cumple' : 'Crítico'}</span>
            <div class="sc-details-wrapper">
              <div class="sc-details-inner">
                <div class="sc-sub">${ratSub}</div>
              </div>
            </div>
          </div>

          <!-- Respuestas a Negativas: Click opens sidebar -->
          <div class="scorecard status-${negClass} kpi-interactive-card" role="button" tabindex="0" aria-label="Respuestas a reseñas negativas: ${negValue}. ${negSub}. Presiona para abrir feed de quejas sin responder." onclick="HomeView.openFullFeedModal('negativas', true)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
            <div class="sc-header-row">
              <span class="sc-label">Respuestas a Negativas</span>
              <span class="sc-chevron">→</span>
            </div>
            <div class="sc-value-row">
              <div class="sc-value num">${negValue}</div>
              <div class="sc-sparkline">${negSpark}</div>
            </div>
            <div class="sc-sub" style="margin-bottom: 8px;">${negSub}</div>
            <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${(kpi.tasaRespuesta.totalNegativas === 0 ? 100 : (kpi.tasaRespuesta.conRespuesta / kpi.tasaRespuesta.totalNegativas * 100)).toFixed(0)}%"></div></div>
            <span class="badge badge-${negClass}">${negClass === 'optimal' ? 'Sin pendientes' : 'Atención'}</span>
          </div>
        </div>
      </section>
    `;
  },

  async setFilter(f) {
    this.filter = f;
    if (typeof ViewState !== 'undefined') {
      ViewState.set('homeFilter', f);
    }
    this.searchQuery = '';
    this.sortBy = 'default';
    await this.render();
    initReveal();
  },

  handleBranchSearch(query) {
    this.searchQuery = query.toLowerCase();
    if (typeof ViewState !== 'undefined') {
      ViewState.set('homeSearch', this.searchQuery);
    }
    this._updateBranchGrid();
  },

  handleBranchSort(value) {
    this.sortBy = value;
    if (typeof ViewState !== 'undefined') {
      ViewState.set('homeSort', this.sortBy);
    }
    this._updateBranchGrid();
  },

  _updateBranchGrid() {
    const currYear = DataLoader.currentYear;
    const currMonth = DataLoader.currentMonth;
    const currStats = DataLoader.getAllBranchStats(currYear, currMonth);
    const brillo = DataLoader.brillo(currYear, currMonth, SUCURSALES_META.map(m => m.id));
    const currMonthName = new Date(currYear, currMonth - 1).toLocaleString('es-ES', { month: 'long' });
    const capitalizedCurrMonth = currMonthName.charAt(0).toUpperCase() + currMonthName.slice(1);
    const currMonthShort = capitalizedCurrMonth.substring(0, 3).toUpperCase();

    let branches = SUCURSALES_META.map(meta => {
      const c = currStats[meta.id] || { avg: 0, count: 0, negativeCount: 0 };
      const branchReviews = DataLoader.getReviewsForBranch(currYear, currMonth, meta.id);
      const negativeWithTextCount = branchReviews.filter(r => Metrics.isComplaint(r) && r.text && r.text.trim().length > 0).length;
      return { ...meta, curr: { score: c.avg, count: c.count, negativeCount: negativeWithTextCount }, alerta: negativeWithTextCount > 0, estado: brillo[meta.id].estado };
    });

    // Apply chip filter
    if (this.filter === 'alerta') branches = branches.filter(s => s.alerta);
    else if (this.filter === 'estables') branches = branches.filter(s => !s.alerta);

    // Apply search
    if (this.searchQuery) {
      branches = branches.filter(s =>
        s.nombre.toLowerCase().includes(this.searchQuery) ||
        s.abr.toLowerCase().includes(this.searchQuery)
      );
    }

    // Apply sort
    switch (this.sortBy) {
      case 'rating-asc': branches = Brillo.ordena(branches).reverse(); break;
      case 'volume-desc': branches.sort((a, b) => b.curr.count - a.curr.count); break;
      default: branches = Brillo.ordena(branches); break;   // predeterminado y «Mayor Rating»: brillo ajustado
    }

    const currGlobal = DataLoader.getGlobalStats(currYear, currMonth);
    const avgRating = currGlobal.avgRating;
    const ytdMonths = (DataLoader.manifest && DataLoader.manifest[currYear])
      ? [...DataLoader.manifest[currYear]].filter(m => m <= currMonth).sort((a,b) => a - b)
      : [currMonth];

    const cards = branches.map(s => {
      const delta = (s.curr.score - s.historico);
      const dClass = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
      const dStr = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
      const currScoreStr = s.curr.score > 0 ? s.curr.score.toFixed(2) : '—';
      const mayoBlock = s.alerta
        ? `<div class="bc-mayo warn"><span class="mono">${currMonthShort}</span> <span>${s.curr.negativeCount} negativa${s.curr.negativeCount !== 1 ? 's' : ''}</span></div>`
        : `<div class="bc-mayo"><span class="mono">${currMonthShort}</span> <span>Sin incidencias</span></div>`;

      let hoverClass = ' stable-green';
      let statusClass = 'ok';
      let statusTitle = 'Estable';
      if (s.curr.count === 0) {
        hoverClass = ' no-activity';
        statusClass = 'no-activity';
        statusTitle = 'Sin actividad';
      } else if (s.alerta) {
        if (s.curr.score >= KpiMeta.ratingMinimo) {
          hoverClass = ' alerta-orange';
          statusClass = 'warn-orange';
          statusTitle = 'Atención requerida';
        } else {
          hoverClass = ' alerta-red';
          statusClass = 'warn-red';
          statusTitle = 'Crítico';
        }
      }
      
      const cardMayoBlock = s.curr.count === 0
        ? `<div class="bc-mayo" style="background: rgba(138, 135, 124, 0.08); color: var(--text-dim);"><span class="mono">${currMonthShort}</span> <span>Sin actividad</span></div>`
        : mayoBlock;

      // Calcular tendencia histórica de los últimos 3-4 meses
      const branchTrendScores = [];
      const trendMonths = [...ytdMonths].sort((a, b) => b - a).slice(0, 4).reverse();
      trendMonths.forEach(m => {
        const bStats = DataLoader.computeBranchStats(currYear, m, s.id);
        if (bStats && bStats.count > 0) {
          branchTrendScores.push(bStats.avg);
        } else {
          branchTrendScores.push(s.historico || 4.0);
        }
      });

      let sparklineHtml = '';
      if (branchTrendScores.length >= 2 && typeof sparklineSvg === 'function') {
        const svg = sparklineSvg(branchTrendScores, { w: 60, h: 20 });
        sparklineHtml = `<div class="bc-sparkline" title="Tendencia últimos meses">${svg}</div>`;
      }

      const isCinemex = s.isCinemex || false;
      return `
      <a class="branch-card${hoverClass}${isCinemex ? ' cinemex-card' : ''}" href="#/sucursal/${s.id}">
        ${svgIcon('fleur')}
        ${isCinemex ? `<div class="bc-cinemex-badge">${svgIcon('cinema')} Cinemex</div>` : ''}
        <div class="bc-top">
          <div class="bc-name">${s.abr}</div>
          <div class="bc-card-stars">${Rosa.html(Rosa.deTienda(s.estado), { size: 22, label: Brillo.lectura(s.estado) })}</div>
          <span class="bc-status ${statusClass}" title="${statusTitle}"></span>
        </div>
        <div class="bc-score-row" style="display: flex; align-items: flex-end; justify-content: space-between; width: 100%;">
          <span class="bc-score num">${currScoreStr}</span>
          ${sparklineHtml}
        </div>
        <div class="bc-meta"><span><strong>${s.curr.count}</strong> reseña${s.curr.count !== 1 ? 's' : ''} ${capitalizedCurrMonth.substring(0,3).toLowerCase()}</span><span class="bc-delta ${dClass} num">${dStr} vs hist</span></div>
        ${cardMayoBlock}
      </a>`;
    }).join('');

    const grid = document.getElementById('branchGrid');
    if (grid) grid.innerHTML = cards || (typeof emptyState !== 'undefined' ? emptyState({ title: 'Sin sucursales con este filtro', hint: 'Prueba seleccionando otro estado en los chips superiores.', actionLabel: 'Ver todas', actionAttr: 'onclick="HomeView.setFilter(\'todas\')"' }) : '<div class="empty-state">Sin sucursales para este filtro</div>');
  },

  changeMonth(direction) {
    const currYear = DataLoader.currentYear;
    const currMonth = DataLoader.currentMonth;
    const availableMonths = DataLoader.manifest[currYear] || [];
    const sortedMonths = [...availableMonths].sort((a, b) => a - b);
    const currentIdx = sortedMonths.indexOf(currMonth);
    
    let newIdx = currentIdx;
    if (direction === 'prev') {
      newIdx = currentIdx - 1;
    } else if (direction === 'next') {
      newIdx = currentIdx + 1;
    }

    if (newIdx >= 0 && newIdx < sortedMonths.length) {
      DataLoader.setMonth(currYear, sortedMonths[newIdx]);
      this.render();
    }
  },

  handleMonthSelect(val) {
    const month = parseInt(val);
    const currYear = DataLoader.currentYear;
    DataLoader.setMonth(currYear, month);
    this.render();
  },

  _buildHeroDiagnosis(conAlerta, currGlobal, branches, currStats) {
    const STANDARD = KpiMeta.ratingMinimo; // 4.60
    if (conAlerta.length > 0) {
      const names = conAlerta.map(s => s.abr).join(', ');
      return `
        <div class="hero-diagnosis status-critical">
          <span class="hero-diagnosis-icon">${svgIcon('alert')}</span>
          <span class="hero-diagnosis-text"><strong>FOCO OPERATIVO:</strong> Incidencias en ${names}. Reportar a Marketing para atención inmediata.</span>
        </div>`;
    }
    if (currGlobal.avgRating < STANDARD) {
      const worst = branches.reduce((min, b) => {
        const s = currStats[b.id] || { avg: 0 };
        return (s.avg > 0 && s.avg < (min.score || 99)) ? { name: b.abr, score: s.avg } : min;
      }, { name: '—', score: 99 });
      return `
        <div class="hero-diagnosis status-warn">
          <span class="hero-diagnosis-icon">${svgIcon('barChart')}</span>
          <span class="hero-diagnosis-text"><strong>FOCO OPERATIVO:</strong> Promedio regional por debajo del objetivo (${STANDARD.toFixed(2)}★). ${worst.name} registra el desempeño más bajo (${worst.score.toFixed(2)}★).</span>
        </div>`;
    }
    return `
      <div class="hero-diagnosis status-optimal">
        <span class="hero-diagnosis-icon">${svgIcon('check')}</span>
        <span class="hero-diagnosis-text"><strong>OPERACIÓN ESTABLE:</strong> Todas las sucursales cumplen con el estándar regional (${STANDARD.toFixed(2)}★). Mantener consistencia operativa.</span>
      </div>`;
  },

  _buildReviewFeed(activeReviews, countWithText) {
    const isCarouselDisabled = this.carouselPool.length <= 3;
    const cards = activeReviews.map((r, i) => ReviewCard.html(r, { variant: 'compact', index: i % 8, onclick: `HomeView.openReviewDetailModal(${r.carouselId})` })).join('');

    return `
      <section class="section review-feed-section r">
        <div class="section-head" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <div class="section-title">Actividad Reciente <span class="accent">de reseñas</span></div>
            <span class="section-sub">Extracto del pulso de la operación en ${getRegionName(activeRegion)}</span>
          </div>
          <button class="show-all-btn-link" onclick="HomeView.openFullFeedModal()">Ver todas con texto (${countWithText}) →</button>
        </div>
        <div class="review-feed-carousel-outer${isCarouselDisabled ? ' carousel-disabled' : ''}" style="position: relative; width: 100%; margin-top: 14px;">
          <button class="carousel-arrow prev" onclick="HomeView.scrollCarousel('prev')" aria-label="Anterior">${svgIcon('arrow')}</button>
          <div class="review-feed-carousel-wrapper" style="margin-top: 0;">
            <div class="review-feed-grid" id="reviewFeedGrid">
              ${cards || '<div class="empty-state">Sin reseñas con texto en este periodo</div>'}
            </div>
          </div>
          <button class="carousel-arrow next" onclick="HomeView.scrollCarousel('next')" aria-label="Siguiente">${svgIcon('arrow')}</button>
        </div>
      </section>
    `;
  },

  /** Desglose de la calificación del mes: cuántas reseñas de cada estrella, contra la meta */
  openRatingDrawer() {
    const y = DataLoader.currentYear, m = DataLoader.currentMonth;
    const revs = SUCURSALES_META.flatMap(s => DataLoader.getReviewsForBranch(y, m, s.id));
    const counts = [0, 0, 0, 0, 0, 0];
    revs.forEach(r => { if (r.stars >= 1 && r.stars <= 5) counts[r.stars]++; });
    const total = revs.length, max = Math.max(1, ...counts);
    const avg = total ? revs.reduce((s, r) => s + r.stars, 0) / total : 0;
    const goal = EC.metaRating();
    const bar = s => `<div class="rd-row"><span class="rd-star">${s}★</span><div class="rd-track"><i class="${s <= 2 ? 'neg' : ''}" style="width:${Math.round((100 * counts[s]) / max)}%"></i></div><span class="rd-n num">${counts[s]}</span><span class="rd-pct">${total ? Math.round((100 * counts[s]) / total) : 0}%</span></div>`;
    const verdict = !total ? 'Aún no hay reseñas este mes.' : avg >= goal ? `La región está ${(avg - goal).toFixed(2)}★ sobre la meta de ${goal.toFixed(2)}★.` : `La región está ${(goal - avg).toFixed(2)}★ bajo la meta de ${goal.toFixed(2)}★.`;
    Drawer.open({ id: 'ratingDrawer', title: 'Calificación regional', subtitle: `${getRegionName(activeRegion)} · ${total} reseñas`, bodyHtml: `<p class="story-line">${verdict} ${total ? `El ${Math.round((100 * (counts[1] + counts[2])) / total)}% de las reseñas son quejas (1–2★).` : ''}</p><div class="rd">${[5, 4, 3, 2, 1].map(bar).join('')}</div>` });
  },

  /** Sucursales de la región ordenadas por calificación del mes, con clic a su ficha */
  scrollToBranches() {
    const grid = document.getElementById('branchGrid');
    if (!grid) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (grid.closest('section') || grid).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  },

  openBranchesDrawer() {
    const y = DataLoader.currentYear, m = DataLoader.currentMonth;
    const rows = SUCURSALES_META.map(s => { const st = DataLoader.computeBranchStats(y, m, s.id); return { s, st }; })
      .sort((a, b) => (b.st.count ? b.st.avg : -1) - (a.st.count ? a.st.avg : -1));
    const goal = EC.metaRating();
    const body = rows.map(({ s, st }) => `<button class="attend-row ${st.count && st.avg < goal ? 'attention' : ''}" onclick="Drawer.navigate('#/sucursal/${s.id}')"><span class="attend-dot" aria-hidden="true"></span><span class="attend-main"><strong>${escapeHtml(s.nombre)}</strong><span class="attend-kind">${st.count ? st.avg.toFixed(2) + '★ · ' + st.count + ' reseñas' : 'sin reseñas este mes'}</span></span><span class="attend-go" aria-hidden="true">→</span></button>`).join('');
    Drawer.open({ id: 'branchesDrawer', title: 'Sucursales', subtitle: `${getRegionName(activeRegion)} · de mejor a peor calificación`, bodyHtml: `<div class="attend-list">${body}</div>` });
  },

  openFullFeedModal(initialSentiment = 'todas', onlyUnreplied = false) {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    if (!data) return;
    
    this.feedSentiment = initialSentiment;
    this.feedBranch = 'todas';
    this.feedOnlyUnreplied = onlyUnreplied;
    
    // Freeze background scrolling
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    
    Drawer.open({
      id: 'feedSidebarOverlay',
      title: 'Feed de Reseñas',
      bodyId: 'sidebarReviewsContainer',
      filtersHtml: `
            <div class="filter-group">
              <label>Sentimiento</label>
              <div class="custom-select" id="sidebarSentimentDropdown">
                <button class="custom-select-trigger" onclick="HomeView.toggleSidebarSentimentDropdown(event)">
                  <span class="custom-select-value" id="sentimentValLabel">${this.getSentimentLabel(initialSentiment)}</span>
                  <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div class="custom-select-options">
                  <div class="custom-option ${initialSentiment === 'todas' ? 'active' : ''}" data-value="todas" onclick="HomeView.selectSidebarSentimentOption('todas', 'Todas las calificaciones')">Todas las calificaciones</div>
                  <div class="custom-option ${initialSentiment === 'positivas' ? 'active' : ''}" data-value="positivas" onclick="HomeView.selectSidebarSentimentOption('positivas', 'Positivas (4-5★)')">Positivas (4-5★)</div>
                  <div class="custom-option ${initialSentiment === 'neutras' ? 'active' : ''}" data-value="neutras" onclick="HomeView.selectSidebarSentimentOption('neutras', 'Neutras (3★)')">Neutras (3★)</div>
                  <div class="custom-option ${initialSentiment === 'negativas' ? 'active' : ''}" data-value="negativas" onclick="HomeView.selectSidebarSentimentOption('negativas', 'Negativas (1-2★)')">Negativas (1-2★)</div>
                </div>
              </div>
            </div>
            
            <div class="filter-group">
              <label>Sucursal</label>
              <div class="custom-select" id="sidebarBranchDropdown">
                <button class="custom-select-trigger" onclick="HomeView.toggleSidebarBranchDropdown(event)">
                  <span class="custom-select-value" id="sidebarBranchValLabel">Todas las sucursales</span>
                  <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div class="custom-select-options">
                  <div class="custom-option active" data-value="todas" onclick="HomeView.selectSidebarBranchOption('todas', 'Todas las sucursales')">Todas las sucursales</div>
                  ${SUCURSALES_META.map(s => `<div class="custom-option" data-value="${s.nombre}" onclick="HomeView.selectSidebarBranchOption('${s.nombre}', '${s.abr}')">${s.abr}</div>`).join('')}
                </div>
              </div>
            </div>

            <div class="filter-group" style="display:flex; flex-direction:row; align-items:center; justify-content:flex-start; gap:8px; margin-top: 4px; grid-column: 1 / -1;">
              <input type="checkbox" id="sidebarUnrepliedCheckbox" ${this.feedOnlyUnreplied ? 'checked' : ''} onchange="HomeView.toggleSidebarUnreplied(this.checked)" style="cursor:pointer; width:16px; height:16px; accent-color:var(--oro);">
              <label for="sidebarUnrepliedCheckbox" style="margin:0; font-size:12px; color:var(--text); cursor:pointer; font-weight:600; text-transform:none;">Solo pendientes de respuesta</label>
            </div>`
    });

    this.filterSidebarReviews();
  },

  getSentimentLabel(val) {
    const labels = {
      'todas': 'Todas las calificaciones',
      'positivas': 'Positivas (4-5★)',
      'neutras': 'Neutras (3★)',
      'negativas': 'Negativas (1-2★)'
    };
    return labels[val] || 'Todas las calificaciones';
  },

  toggleSidebarUnreplied(checked) {
    this.feedOnlyUnreplied = checked;
    this.filterSidebarReviews();
  },

  resetSidebarFilters() {
    this.feedSentiment = 'todas';
    this.feedBranch = 'todas';
    this.feedOnlyUnreplied = false;
    
    // Reset custom dropdown labels
    const sentimentLabel = document.getElementById('sidebarSentimentValLabel');
    if (sentimentLabel) sentimentLabel.innerText = 'Todas las calificaciones';
    const branchLabel = document.getElementById('sidebarBranchValLabel');
    if (branchLabel) branchLabel.innerText = 'Todas las sucursales';
    
    // Clear active classes in dropdown options
    document.querySelectorAll('#sidebarSentimentDropdown .custom-option').forEach(opt => {
      if (opt.getAttribute('data-value') === 'todas') opt.classList.add('active');
      else opt.classList.remove('active');
    });
    document.querySelectorAll('#sidebarBranchDropdown .custom-option').forEach(opt => {
      if (opt.getAttribute('data-value') === 'todas') opt.classList.add('active');
      else opt.classList.remove('active');
    });

    const unrepliedCheckbox = document.getElementById('sidebarUnrepliedCheckbox');
    if (unrepliedCheckbox) unrepliedCheckbox.checked = false;
    
    this.filterSidebarReviews();
  },

  closeSidebar() {
    Drawer.close('feedSidebarOverlay');
  },

  openReviewDetailModal(carouselId) {
    let r;
    if (typeof carouselId === 'string' && carouselId.includes('-')) {
      r = DataLoader.getReviewByGlobalId(carouselId);
    } else {
      r = this.carouselPool.find(item => item.carouselId === carouselId);
    }
    if (!r) return;

    // Pausa el desplazamiento continuo del carrusel mientras el detalle está abierto
    HomeView.isPaused = true;

    const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
    Drawer.open({
      id: 'reviewDetailModal',
      title: 'Detalle de reseña',
      subtitle: meta ? meta.nombre : (r.sucursal || ''),
      bodyHtml: ReviewCard.html(r, { variant: 'full', showBranch: false }) +
        (meta ? `<a class="show-all-btn-link" href="#/sucursal/${meta.id}" onclick="event.preventDefault(); Drawer.navigate('#/sucursal/${meta.id}')">Ver ficha de ${escapeHtml(meta.nombre)} →</a>` : ''),
      onClose: () => { HomeView.isPaused = false; }
    });
  },

  closeReviewDetailModal() {
    Drawer.close('reviewDetailModal');
    HomeView.isPaused = false;
  },

  filterSidebarReviews() {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    if (!data) return;

    const sentiment = this.feedSentiment || 'todas';
    const branchNameFilter = this.feedBranch || 'todas';

    let filtered = data.reviews.filter(r => r.text && r.text.trim().length > 0);

    if (sentiment === 'positivas') {
      filtered = filtered.filter(r => r.stars >= 4);
    } else if (sentiment === 'neutras') {
      filtered = filtered.filter(r => r.stars === 3);
    } else if (sentiment === 'negativas') {
      filtered = filtered.filter(r => Metrics.isComplaint(r));
    }

    if (branchNameFilter !== 'todas') {
      filtered = filtered.filter(r => r.sucursal === branchNameFilter);
    }

    if (this.feedOnlyUnreplied) {
      filtered = filtered.filter(r => !r.responseFromOwnerText || r.responseFromOwnerText.trim().length === 0);
    }

    const container = document.getElementById('sidebarReviewsContainer');
    if (!container) return;

    if (filtered.length === 0) {
      container.innerHTML = typeof emptyState !== 'undefined' ? emptyState({
        title: 'Sin reseñas con estos filtros',
        hint: 'Prueba cambiando las selecciones o desactivando "Solo pendientes".',
        actionLabel: 'Restaurar filtros',
        actionAttr: 'onclick="HomeView.resetSidebarFilters()"'
      }) : '<div class="empty-state">No se encontraron reseñas con estos filtros</div>';
      return;
    }

    container.innerHTML = ReviewCard.list(filtered, { onclick: r => `HomeView.openReviewDetailModal('${r.globalId}')` });
  },

  openAlertModal(branchId) {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    if (!data) return;

    const branchMeta = SUCURSALES_META.find(s => s.id === branchId);
    if (!branchMeta) return;

    const branchReviews = DataLoader.getReviewsForBranch(year, month, branchId);
    const negatives = branchReviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);

    Drawer.open({
      id: 'alertModal',
      title: `Alertas: ${branchMeta.abr}`,
      subtitle: 'Las siguientes reseñas negativas requieren reporte a Marketing para su resolución.',
      footerHtml: negatives.length === 0 ? '' : `
        <div class="copy-report-container" style="margin:0;">
          <button id="copyAlertBtn" class="copy-report-btn" onclick="HomeView.copyAlertSummary('${branchId}')">
            ${svgIcon('clipboard')} Copiar Resumen para Marketing
          </button>
        </div>`,
      bodyHtml: negatives.length === 0
        ? '<p class="drawer-empty">No hay reseñas negativas con texto.</p>'
        : ReviewCard.list(negatives, { showBranch: false })
    });
  },

  async copyAlertSummary(branchId) {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    if (!data) return;
    const branchMeta = SUCURSALES_META.find(s => s.id === branchId);
    if (!branchMeta) return;
    const branchReviews = DataLoader.getReviewsForBranch(year, month, branchId);
    const negatives = branchReviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);
    const monthName = MONTH_NAMES[month - 1] || '';
    let text = `étoile GDL — Reporte de Incidencias — ${branchMeta.abr} ${monthName} ${year}\n`;
    text += `${negatives.length} reseña${negatives.length !== 1 ? 's' : ''} crítica${negatives.length !== 1 ? 's' : ''}:\n\n`;
    negatives.forEach((r, i) => {
      const dateStr = reviewWhen(r, 'short');
      text += `${i + 1}. ${dateStr} (${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}): "${r.text}"\n`;
    });
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('copyAlertBtn');
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '✓ Copiado al portapapeles';
        btn.style.background = 'var(--ok)';
        btn.style.color = 'var(--banda-texto)';
        setTimeout(() => { 
          btn.innerHTML = original; 
          btn.style.background = ''; 
          btn.style.color = ''; 
        }, 2500);
      }
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  },

  openAllAlertsModal() {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    if (!data) return;

    const monthName = MONTH_NAMES[month - 1] || '';
    let branchesHtml = '';
    let hasIncidents = false;
    let idx = 0;

    SUCURSALES_META.forEach(branchMeta => {
      const branchReviews = DataLoader.getReviewsForBranch(year, month, branchMeta.id);
      const negatives = branchReviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);
      if (negatives.length > 0) {
        hasIncidents = true;
        branchesHtml += `
          <div class="drawer-group">
            <h3 class="drawer-group-title"><span class="bc-status warn-red" style="margin-top:0; width:8px; height:8px;"></span>${escapeHtml(branchMeta.nombre)} (${negatives.length})</h3>
            ${negatives.map(r => ReviewCard.html(r, { showBranch: false, index: idx++ })).join('')}
          </div>`;
      }
    });

    Drawer.open({
      id: 'alertModal',
      title: `Todas las Alertas: ${monthName} ${year}`,
      subtitle: 'Consolidado de reseñas negativas en la región durante el mes. Reportar a Marketing.',
      footerHtml: hasIncidents ? `
        <div class="copy-report-container" style="margin:0;">
          <button id="copyAllAlertsBtn" class="copy-report-btn" onclick="HomeView.copyAllAlertsSummary()">
            ${svgIcon('clipboard')} Copiar Reporte Consolidado
          </button>
        </div>` : '',
      bodyHtml: hasIncidents ? branchesHtml : '<p class="drawer-empty">No hay reseñas negativas registradas este mes.</p>'
    });
  },

  async copyAllAlertsSummary() {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    if (!data) return;
    const monthName = MONTH_NAMES[month - 1] || '';

    let text = `étoile GDL — Reporte Consolidado de Incidencias — ${monthName} ${year}\n\n`;
    let totalCount = 0;

    SUCURSALES_META.forEach(branchMeta => {
      const branchReviews = DataLoader.getReviewsForBranch(year, month, branchMeta.id);
      const negatives = branchReviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);
      if (negatives.length > 0) {
        totalCount += negatives.length;
        text += `• ${branchMeta.nombre} (${negatives.length} reseña${negatives.length !== 1 ? 's' : ''} crítica${negatives.length !== 1 ? 's' : ''}):\n`;
        negatives.forEach((r, i) => {
          const dateStr = reviewWhen(r, 'short');
          text += `  ${i + 1}. ${dateStr} (${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}): "${r.text}"\n`;
        });
        text += '\n';
      }
    });

    if (totalCount === 0) {
      text += 'Sin incidencias registradas.';
    }

    try {
      await navigator.clipboard.writeText(text.trim());
      const btn = document.getElementById('copyAllAlertsBtn');
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '✓ Copiado al portapapeles';
        btn.style.background = 'var(--ok)';
        btn.style.color = '#fff';
        setTimeout(() => { 
          btn.innerHTML = original; 
          btn.style.background = ''; 
          btn.style.color = ''; 
        }, 2500);
      }
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  },

  closeAlertModal() {
    Drawer.close('alertModal');
  },

  _buildHighlights(branches, year, month) {
    const data = DataLoader.getMonth(year, month);
    if (!data) return '';
    const goodReviews = data.reviews.filter(r => r.stars === 5 && r.text && r.text.length > 30);
    if (goodReviews.length === 0) return '';
    
    if (this.highlightIdx === 0 && goodReviews.length > 1) {
      this.highlightIdx = Math.floor(Math.random() * goodReviews.length);
    }

    const idx = this.highlightIdx % goodReviews.length;
    const rev = goodReviews[idx];
    const hasMore = goodReviews.length > 1;

    const branchMeta = SUCURSALES_META_ALL.find(s => s.id === rev.sucursal);
    const branchDisplayName = branchMeta ? branchMeta.nombre : rev.sucursal;

    return `
      <div class="chart-card highlight-box r" id="highlightCard" style="display:flex; flex-direction:column; justify-content:space-between; position:relative; min-height:220px; overflow:hidden;">
        <div class="watermark-stars" style="position:absolute; right:-20px; bottom:-20px; font-size:120px; opacity:0.08; color:var(--oro-ink); pointer-events:none;">★</div>
        <div class="highlight-header-row" style="display:flex; align-items:center; gap:12px; margin-bottom:12px; z-index:1; position:relative;">
          <div class="highlight-icon-box" style="width:36px; height:36px; border-radius:50%; background:rgba(184,144,47,0.1); color:var(--oro-ink); display:grid; place-items:center; flex-shrink:0;">
            ${svgIcon('starFilled')}
          </div>
          <div class="highlight-title" style="font-weight:700; font-size:14px; color:var(--sage-ink); text-transform:uppercase; letter-spacing:.06em; margin-bottom:0;">Lo más destacado</div>
        </div>
        <div style="font-size: 15px; line-height: 1.5; font-style:italic; margin-bottom: 12px; position: relative; z-index: 1; flex-grow:1;" data-rev-text>"${escapeHtml(rev.text)}"</div>
        <div style="display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; margin-top: auto; padding-top:12px; border-top: 1px solid var(--border);">
          <span style="font-size: 13px; font-weight: 500; color: var(--text-muted); display:flex; align-items:center; gap:6px;"><span style="display:inline-block;width:12px;height:1px;background:var(--border);"></span>${branchDisplayName}</span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--oro-ink);font-size:13px;letter-spacing:1px;">${'★'.repeat(5)}</span>
            ${hasMore ? `<button onclick="HomeView.nextHighlight()" style="background:transparent;border:1px solid var(--border);color:var(--text);font-size:11px;font-weight:600;padding:4px 12px;min-height:32px;border-radius:20px;cursor:pointer;letter-spacing:.03em;transition:background .15s, border-color .15s;display:flex;align-items:center;gap:4px;" onmouseover="this.style.background='var(--bg)';this.style.borderColor='var(--text-dim)'" onmouseout="this.style.background='transparent';this.style.borderColor='var(--border)'">Siguiente ›</button>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  nextHighlight() {
    const year = DataLoader.currentYear;
    const month = DataLoader.currentMonth;
    const data = DataLoader.getMonth(year, month);
    const goodReviews = data ? data.reviews.filter(r => r.stars === 5 && r.text && r.text.length > 30) : [];
    const card = document.getElementById('highlightCard');
    if (!card || goodReviews.length <= 1) return;

    let newIdx = Math.floor(Math.random() * goodReviews.length);
    if (newIdx === (this.highlightIdx % goodReviews.length)) {
      newIdx = (newIdx + 1) % goodReviews.length;
    }
    this.highlightIdx = newIdx;

    card.style.transition = 'opacity 0.2s ease';
    card.style.opacity = '0';
    setTimeout(() => {
      const idx = this.highlightIdx % goodReviews.length;
      const rev = goodReviews[idx];
      const textEl = card.querySelector('[data-rev-text]');
      if (textEl) textEl.textContent = `"${rev.text}"`;
      
      const allBranches = SUCURSALES_META.map(m => ({ ...m }));
      const newCard = this._buildHighlights(allBranches, year, month);
      const tmp = document.createElement('div');
      tmp.innerHTML = newCard;
      const newEl = tmp.firstElementChild;
      if (newEl) {
        newEl.style.opacity = '0';
        newEl.style.transform = 'translateY(8px)';
        card.replaceWith(newEl);
        requestAnimationFrame(() => {
          newEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          newEl.style.opacity = '1';
          newEl.style.transform = 'translateY(0)';
        });
      }
    }, 200);
  },

  toggleSortDropdown(event) {
    event.stopPropagation();
    if (window.innerWidth < 600) {
      const options = [
        { value: 'default', label: 'Predeterminado', active: this.sortBy === 'default' },
        { value: 'rating-desc', label: 'Mayor Rating', active: this.sortBy === 'rating-desc' },
        { value: 'rating-asc', label: 'Menor Rating', active: this.sortBy === 'rating-asc' },
        { value: 'volume-desc', label: 'Mayor Volumen', active: this.sortBy === 'volume-desc' }
      ];
      showBottomSheet('Ordenar Sucursales', options, (val) => {
        const labels = {
          'default': 'Predeterminado',
          'rating-desc': 'Mayor Rating',
          'rating-asc': 'Menor Rating',
          'volume-desc': 'Mayor Volumen'
        };
        HomeView.selectSortOption(val, labels[val]);
      });
    } else {
      const dropdown = document.getElementById('branchSortDropdown');
      if (dropdown) {
        dropdown.classList.toggle('open');
      }
    }
  },

  selectSortOption(val, labelText) {
    this.sortBy = val;
    const labelEl = document.getElementById('sortValLabel');
    if (labelEl) labelEl.textContent = labelText;
    
    // Update active class on options
    const dropdown = document.getElementById('branchSortDropdown');
    if (dropdown) {
      dropdown.querySelectorAll('.custom-option').forEach(opt => {
        if (opt.getAttribute('data-value') === val) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
      dropdown.classList.remove('open');
    }
    
    this._updateBranchGrid();
  },

  getSortLabel(val) {
    const map = {
      'default': 'Predeterminado',
      'rating-desc': 'Mayor Rating',
      'rating-asc': 'Menor Rating',
      'volume-desc': 'Mayor Volumen'
    };
    return map[val] || 'Predeterminado';
  },

  initAutoplay() {
    this.clearAutoplay();
    if (this.carouselPool.length > 3) {
      this.startContinuousScroll();
    }
  },

  clearAutoplay() {
    this.stopContinuousScroll();
  },

  startContinuousScroll() {
    this.stopContinuousScroll();
    const grid = document.getElementById('reviewFeedGrid');
    if (!grid || this.carouselPool.length <= 3) return;

    this.scrollFraction = grid.scrollLeft;
    this.isPaused = false;
    this.scrollAnimationActive = true;

    // Rendimiento: el carrusel solo se mueve cuando se ve (antes recalculaba layout en cada fotograma, aunque estuviera
    // fuera de pantalla) y las lecturas de layout (scrollWidth/scrollLeft) se espacian en vez de hacerse 60 veces por segundo.
    let visible = true, frame = 0, halfWidth = grid.scrollWidth / 2;
    if ('IntersectionObserver' in window) {
      this._carouselIO = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 });
      this._carouselIO.observe(grid);
    }

    const animate = () => {
      if (!this.scrollAnimationActive) return;
      const gridEl = document.getElementById('reviewFeedGrid');
      if (!gridEl) {
        this.scrollAnimationActive = false;
        return;
      }
      if (!visible || this.isPaused) {                       // fuera de pantalla o en pausa: sin tocar el DOM
        if (this.isPaused) this.scrollFraction = gridEl.scrollLeft;
        this.scrollAnimationFrame = requestAnimationFrame(animate);
        return;
      }

      // Cada 20 fotogramas: refrescar el ancho, detectar arrastre manual y dar la vuelta al bucle
      if (frame++ % 20 === 0) {
        halfWidth = gridEl.scrollWidth / 2;
        const cur = gridEl.scrollLeft;
        if (cur >= halfWidth) { gridEl.scrollLeft = cur - halfWidth; this.scrollFraction = gridEl.scrollLeft; }
        else if (Math.abs(cur - this.scrollFraction) > 30) this.scrollFraction = cur;   // arrastre o flecha
      }

      // Velocidad lenta y continua (0.6 px por fotograma); el bucle da la vuelta al pasar la mitad (segunda copia)
      this.scrollFraction += 0.6;
      if (this.scrollFraction >= halfWidth && halfWidth > 0) this.scrollFraction -= halfWidth;
      gridEl.scrollLeft = Math.floor(this.scrollFraction);

      this.scrollAnimationFrame = requestAnimationFrame(animate);
    };

    this.scrollAnimationFrame = requestAnimationFrame(animate);
  },

  stopContinuousScroll() {
    this.scrollAnimationActive = false;
    if (this._carouselIO) { this._carouselIO.disconnect(); this._carouselIO = null; }
    if (this.scrollAnimationFrame) {
      cancelAnimationFrame(this.scrollAnimationFrame);
      this.scrollAnimationFrame = null;
    }
  },

  scrollCarousel(direction) {
    const grid = document.getElementById('reviewFeedGrid');
    if (!grid || this.carouselPool.length <= 3) return;
    
    const halfWidth = grid.scrollWidth / 2;
    const scrollAmount = 296; // card width + gap (280 + 16)
    
    this.isPaused = true;
    
    if (direction === 'next') {
      if (grid.scrollLeft >= halfWidth - 10) {
        grid.scrollLeft -= halfWidth;
      }
      grid.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    } else {
      if (grid.scrollLeft <= 10) {
        grid.scrollLeft += halfWidth;
      }
      grid.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
    
    clearTimeout(this.carouselResumeTimeout);
    this.carouselResumeTimeout = setTimeout(() => {
      this.scrollFraction = grid.scrollLeft;
      this.isPaused = false;
    }, 400); // Wait for smooth scroll to finish before resuming
  },

  toggleHeroMonthDropdown(event) {
    event.stopPropagation();
    if (window.innerWidth < 600) {
      const currYear = DataLoader.currentYear;
      const currMonth = DataLoader.currentMonth;
      const availableMonths = DataLoader.manifest[currYear] || [];
      const sortedMonths = [...availableMonths].sort((a, b) => a - b);
      const options = sortedMonths.map(m => {
        const monthName = MONTH_NAMES[m - 1];
        const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        return {
          value: m,
          label: `${capMonth} ${currYear}`,
          active: m === currMonth
        };
      });
      showBottomSheet('Seleccionar Periodo', options, (val) => {
        HomeView.selectHeroMonthOption(parseInt(val));
      });
    } else {
      const dropdown = document.getElementById('heroMonthDropdown');
      if (dropdown) {
        dropdown.classList.toggle('open');
      }
    }
  },

  selectHeroMonthOption(month) {
    const dropdown = document.getElementById('heroMonthDropdown');
    if (dropdown) {
      dropdown.classList.remove('open');
    }
    const currYear = DataLoader.currentYear;
    DataLoader.setMonth(currYear, month);
    this.render();
  },

  toggleSidebarSentimentDropdown(event) {
    event.stopPropagation();
    if (window.innerWidth < 600) {
      const options = [
        { value: 'todas', label: 'Todas las calificaciones', active: this.feedSentiment === 'todas' },
        { value: 'positivas', label: 'Positivas (4-5★)', active: this.feedSentiment === 'positivas' },
        { value: 'neutras', label: 'Neutras (3★)', active: this.feedSentiment === 'neutras' },
        { value: 'negativas', label: 'Negativas (1-2★)', active: this.feedSentiment === 'negativas' }
      ];
      showBottomSheet('Filtrar por Calificación', options, (val) => {
        const labels = {
          'todas': 'Todas las calificaciones',
          'positivas': 'Positivas (4-5★)',
          'neutras': 'Neutras (3★)',
          'negativas': 'Negativas (1-2★)'
        };
        HomeView.selectSidebarSentimentOption(val, labels[val]);
      });
    } else {
      const dropdown = document.getElementById('sidebarSentimentDropdown');
      const branchDropdown = document.getElementById('sidebarBranchDropdown');
      if (branchDropdown) branchDropdown.classList.remove('open');
      if (dropdown) {
        dropdown.classList.toggle('open');
      }
    }
  },

  selectSidebarSentimentOption(val, labelText) {
    this.feedSentiment = val;
    const labelEl = document.getElementById('sentimentValLabel');
    if (labelEl) labelEl.textContent = labelText;

    const dropdown = document.getElementById('sidebarSentimentDropdown');
    if (dropdown) {
      dropdown.querySelectorAll('.custom-option').forEach(opt => {
        if (opt.getAttribute('data-value') === val) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
      dropdown.classList.remove('open');
    }
    this.filterSidebarReviews();
  },

  toggleSidebarBranchDropdown(event) {
    event.stopPropagation();
    if (window.innerWidth < 600) {
      const options = [
        { value: 'todas', label: 'Todas las sucursales', active: this.feedBranch === 'todas' },
        ...SUCURSALES_META.map(s => ({
          value: s.nombre,
          label: s.abr,
          active: this.feedBranch === s.nombre
        }))
      ];
      showBottomSheet('Filtrar por Sucursal', options, (val) => {
        const branchMeta = SUCURSALES_META.find(s => s.nombre === val);
        const label = branchMeta ? branchMeta.abr : 'Todas las sucursales';
        HomeView.selectSidebarBranchOption(val, label);
      });
    } else {
      const dropdown = document.getElementById('sidebarBranchDropdown');
      const sentimentDropdown = document.getElementById('sidebarSentimentDropdown');
      if (sentimentDropdown) sentimentDropdown.classList.remove('open');
      if (dropdown) {
        dropdown.classList.toggle('open');
      }
    }
  },

  selectSidebarBranchOption(val, labelText) {
    this.feedBranch = val;
    const labelEl = document.getElementById('sidebarBranchValLabel');
    if (labelEl) labelEl.textContent = labelText;

    const dropdown = document.getElementById('sidebarBranchDropdown');
    if (dropdown) {
      dropdown.querySelectorAll('.custom-option').forEach(opt => {
        if (opt.getAttribute('data-value') === val) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
      dropdown.classList.remove('open');
    }
    this.filterSidebarReviews();
  },



  renderSkeleton() {
    const app = document.getElementById('app');
    if (!app) return;
    
    app.innerHTML = `
      ${buildTopbar()}
      <div style="max-width:1200px; margin:0 auto; padding:24px; box-sizing:border-box; display:flex; flex-direction:column; gap:24px;">
        <!-- Hero Skeleton -->
        <div class="skeleton" style="height: 200px; border-radius: 20px;"></div>
        
        <!-- Alerts and Highlights Skeletons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 12px;">
          <div class="skeleton" style="height: 120px; border-radius: 20px;"></div>
          <div class="skeleton" style="height: 120px; border-radius: 20px;"></div>
        </div>
        
        <!-- KPIs Skeletons -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 12px;">
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
        </div>
        
        <!-- Branch Grid Skeletons -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 24px;">
          <div class="skeleton" style="height: 160px; border-radius: 16px;"></div>
          <div class="skeleton" style="height: 160px; border-radius: 16px;"></div>
          <div class="skeleton" style="height: 160px; border-radius: 16px;"></div>
          <div class="skeleton" style="height: 160px; border-radius: 16px;"></div>
        </div>
      </div>
    `;
    
    app.classList.remove('fade-out');
  }
};
