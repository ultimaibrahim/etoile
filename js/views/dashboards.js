/**
 * views/dashboards.js — Vista de gráficas: YTD, Alertas Proactivas y 4 Gráficas Analíticas
 */

const DashboardsView = {
  async render() {
    Charts.destroyAll();
    const currYear = DataLoader.currentYear;
    const currMonth = DataLoader.currentMonth;

    const skeletonTimeout = setTimeout(() => {
      this.renderSkeleton();
    }, 250);

    // Load YTD data for current year concurrently
    let ytdReviews = [];
    let quarterData = [];
    try {
      if (DataLoader.manifest && DataLoader.manifest[currYear]) {
        const months = DataLoader.manifest[currYear];
        const monthDataList = await Promise.all(
          months.map(m => DataLoader.loadMonth(currYear, m))
        );
        monthDataList.forEach(d => {
          if (d && d.reviews) {
            ytdReviews = ytdReviews.concat(d.reviews);
          }
        });
      }

      // NUEVO: Cargar estadísticas de los trimestres concluidos en paralelo
      const completedQuarters = getCompletedQuarters(currYear);
      const quartersStats = await Promise.all(
        completedQuarters.map(q => DataLoader.loadQuarterStats(currYear, q))
      );
      quarterData = completedQuarters.map((q, idx) => {
        const stats = quartersStats[idx] || [];
        const totalReviews = stats.reduce((sum, s) => sum + s.totalReviews, 0);
        const avgRating = totalReviews > 0 
          ? stats.reduce((sum, s) => sum + s.avgRating * s.totalReviews, 0) / totalReviews 
          : 0;
        const negativeReviews = stats.reduce((sum, s) => sum + s.negativeReviews, 0);
        return { quarter: q, totalReviews, avgRating, negativeReviews };
      });
    } finally {
      clearTimeout(skeletonTimeout);
    }
    const quarterAccordionHtml = this._buildQuarterAccordion(quarterData, currYear);

    const currStats = DataLoader.getAllBranchStats(currYear, currMonth);
    const currGlobal = DataLoader.getGlobalStats(currYear, currMonth);
    const brillo = DataLoader.brillo(currYear, currMonth, SUCURSALES_META.map(m => m.id));

    const currMonthName = new Date(currYear, currMonth - 1).toLocaleString('es-ES', { month: 'long' });
    const capitalizedCurrMonth = currMonthName.charAt(0).toUpperCase() + currMonthName.slice(1);

    const sortedMonths = [...(DataLoader.manifest[currYear] || [])].sort((a, b) => a - b);
    const customOptionsHtml = sortedMonths.map(m => {
      const monthName = MONTH_NAMES[m - 1];
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const isActive = m === currMonth ? ' active' : '';
      return `<div class="custom-option${isActive}" data-value="${m}" onclick="DashboardsView.selectMonthOption(${m})">${capMonth} ${currYear}</div>`;
    }).join('');

    // Compute YTD avg per branch
    const ytdStats = {};
    SUCURSALES_META.forEach(meta => {
      const names = [meta.nombre, meta.abr];
      if (meta.id === 'gal-gdl') names.push('Galerías GDL');
      if (meta.id === 'sta-anita') names.push('Galerías Santa Anita');
      const bReviews = ytdReviews.filter(r => names.includes(r.sucursal));
      const count = bReviews.length;
      const avg = count > 0 ? bReviews.reduce((a, r) => a + r.stars, 0) / count : 0;
      ytdStats[meta.id] = { count, avg };
    });

    const branches = SUCURSALES_META.map(meta => {
      const c = currStats[meta.id];
      const alerta = c.negativeCount > 0 || (c.avg > 0 && c.avg < KpiMeta.ratingMinimo);
      return {
        ...meta,
        ytd: ytdStats[meta.id],
        curr: { score: c.avg, count: c.count, negativeCount: c.negativeCount },
        alerta,
        brillo: brillo[meta.id],
        estado: brillo[meta.id].estado
      };
    });

    // Compute Proactive Operational Alerts
    const alerts = [];
    const maxNegativeCount = Math.max(...branches.map(b => b.curr.negativeCount));

    branches.forEach(b => {
      const currScore = b.curr.score;
      const currCount = b.curr.count;
      const ytdAvg = b.ytd.avg;
      const negativeCount = b.curr.negativeCount;

      // Count unreplied negative reviews in current month
      const bReviews = DataLoader.getReviewsForBranch(currYear, currMonth, b.id);
      const unrepliedCount = bReviews.filter(r => Metrics.isComplaint(r) && (!r.responseFromOwnerText || r.responseFromOwnerText.trim() === '')).length;

      // 1. Rating Drop: currScore < ytdAvg - 0.20
      if (currCount > 0 && ytdAvg > 0 && currScore < ytdAvg - 0.20) {
        alerts.push({
          type: 'critical',
          title: 'Caída de Calificación',
          tag: 'Crítico',
          branch: b.nombre,
          icon: 'alert',
          desc: `${b.nombre} promedió ${currScore.toFixed(2)} ★ en el mes, una desviación de -${(ytdAvg - currScore).toFixed(2)} ★ respecto a su promedio histórico del año (${ytdAvg.toFixed(2)} ★).`
        });
      }

      // 2. Low Performer: currScore < THRESHOLDS.BAJO
      if (currCount > 0 && currScore < THRESHOLDS.BAJO) {
        alerts.push({
          type: 'attention',
          title: 'Bajo la Meta Regional',
          tag: 'Atención',
          branch: b.nombre,
          icon: 'alert',
          desc: `${b.nombre} promedió ${currScore.toFixed(2)} ★, quedando por debajo del estándar mínimo de ${THRESHOLDS.BAJO.toFixed(2)} ★.`
        });
      }

      // 3. Foco de Incidencias: highest negative count (if negativeCount > 0)
      if (negativeCount > 0 && negativeCount === maxNegativeCount) {
        alerts.push({
          type: 'critical',
          title: 'Foco de Incidencias',
          tag: 'Crítico',
          branch: b.nombre,
          icon: 'alert',
          desc: `${b.nombre} registró la mayor cantidad de quejas del periodo con ${negativeCount} reseña${negativeCount > 1 ? 's' : ''} crítica${negativeCount > 1 ? 's' : ''} (1-2 ★).`
        });
      }

      // 4. Quejas sin Respuesta: unrepliedCount > 0
      if (unrepliedCount > 0) {
        alerts.push({
          type: 'attention',
          title: 'Quejas sin Respuesta',
          tag: 'Pendiente',
          branch: b.nombre,
          icon: 'calendar',
          desc: `${b.nombre} cuenta con ${unrepliedCount} reseña${unrepliedCount > 1 ? 's' : ''} crítica${unrepliedCount > 1 ? 's' : ''} de clientes sin respuesta del propietario.`
        });
      }

      // 4b. Racha a la baja (estrella fugaz): la tienda sigue en su estado, pero lleva tres semanas o más bajando
      if (b.brillo.senal === 'fugaz') {
        alerts.push({
          type: 'attention',
          title: b.brillo.lectura,
          tag: 'Atención',
          branch: b.nombre,
          icon: 'alert',
          desc: `${b.nombre} lleva ${Brillo.SEMANAS} semanas o más bajando seguidas: su promedio semanal cae cada semana.`
        });
      }

      // 5. Líder Regional: score >= 4.80 y count >= 3
      if (currScore >= 4.80 && currCount >= 3) {
        alerts.push({
          type: 'optimal',
          title: 'Líder Regional',
          tag: 'Destacado',
          branch: b.nombre,
          icon: 'starFilled',
          desc: `${b.nombre} mantiene un nivel sobresaliente con un promedio de ${currScore.toFixed(2)} ★ en ${currCount} opiniones recibidas.`
        });
      }
    });

    // Fallback if no alerts
    if (alerts.length === 0) {
      alerts.push({
        type: 'optimal',
        title: 'Operación Estable',
        tag: 'Estable',
        branch: getRegionName(activeRegion),
        icon: 'check',
        desc: 'Sin desviaciones críticas ni alertas de desempeño detectadas en las sucursales para este periodo.'
      });
    }

    // "Qué atender": solo lo accionable, por gravedad; los destacados (positivos) van aparte como contexto
    const idByName = Object.fromEntries(branches.map(b => [b.nombre, b.id]));
    const SEV = { critical: 0, attention: 1, optimal: 2 };
    const actionable = alerts.filter(a => a.type !== 'optimal').sort((x, y) => SEV[x.type] - SEV[y.type]);
    const leaders = alerts.filter(a => a.title === 'Líder Regional').map(a => a.branch);
    const activeAlertsCount = actionable.length;
    // Pendientes: cada punto lleva la Rosa de la tienda con su estado y, si la tiene, su señal (marca.md: aquí sí se ven)
    const byName = Object.fromEntries(branches.map(b => [b.nombre, b]));
    const attendRow = a => {
      const b = byName[a.branch], br = b && b.brillo;
      const rosa = br ? Rosa.html(Rosa.deTienda(br.estado, br.senal, br.inicio), { size: 26, label: br.lectura }) : '<span class="attend-dot" aria-hidden="true"></span>';
      const lect = br && br.lectura !== a.title ? `<span class="attend-brillo">${escapeHtml(br.lectura)}</span>` : '';
      return `
      <button class="attend-row ${a.type}" onclick="${idByName[a.branch] ? `DashboardsView.goAttend('${idByName[a.branch]}')` : ''}">
        ${rosa}
        <span class="attend-main"><strong>${a.branch}</strong><span class="attend-kind">${a.title}</span>${lect}<span class="attend-desc">${a.desc}</span></span>
        <span class="attend-go" aria-hidden="true">→</span>
      </button>`;
    };
    DashboardsView._attendRows = actionable.map(attendRow);
    const attendHtml = `
      <section class="section r" id="attendSection">
        <div class="section-head">
          <div class="section-title">Qué atender <span class="accent">${capitalizedCurrMonth}</span></div>
          <span class="section-sub">${actionable.length ? 'Ordenado por gravedad. Clic para abrir la ficha de la sucursal.' : 'Sin desviaciones que requieran acción este mes.'}</span>
        </div>
        ${actionable.length ? `<div class="attend-list">${DashboardsView._attendRows.slice(0, 4).join('')}</div>
          ${actionable.length > 4 ? `<button class="show-all-btn-link" onclick="DashboardsView.openAttendAll()">Ver las ${actionable.length} →</button>` : ''}`
          : `<p class="attend-calm">Operación estable en ${getRegionName(activeRegion)}.</p>`}
        ${leaders.length ? `<p class="attend-lead">Destacan este mes: <strong>${leaders.join(', ')}</strong> (≥ 4.80★ con muestra suficiente).</p>` : ''}
      </section>`;

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

    // Resumen ejecutivo de dashboards analíticos
    const dashTakeaways = [
      `Volumen total acumulado de <strong>${currGlobal.totalReviews} reseñas</strong> en ${capitalizedCurrMonth} ${currYear}.`,
      `Calificación regional promedio de <strong>${currGlobal.avgRating.toFixed(2)}★</strong> para ${getRegionName(activeRegion)}.`,
      activeAlertsCount ? `<strong>${activeAlertsCount} punto${activeAlertsCount === 1 ? '' : 's'} por atender</strong>, el más urgente en ${actionable[0].branch}.` : 'Sin desviaciones que requieran acción este mes.'
    ];

    const dashTakeawaysHtml = `
      <div class="key-takeaways-card" style="margin-top: 20px;">
        <div class="kt-header">
          <div class="kt-title-wrap">
            <div class="kt-icon-pill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <span class="kt-title">Lo principal · cuadro de mando</span>
          </div>
          <span class="kt-badge">${capitalizedCurrMonth} ${currYear}</span>
        </div>
        <ul class="kt-list">
          ${dashTakeaways.map(t => `<li class="kt-item"><span class="kt-bullet">✦</span><span>${t}</span></li>`).join('')}
        </ul>
      </div>
    `;

    document.getElementById('app').innerHTML = `
      ${concludedBannerHtml}
      ${buildTopbar(false)}
      <style>
        .dashboards-hero-inner {
          display: grid;
          gap: 32px;
          align-items: center;
          grid-template-columns: 1fr;
        }
        @media (min-width: 992px) {
          .dashboards-hero-inner {
            grid-template-columns: 0.85fr 1.15fr !important;
            gap: 48px !important;
          }
        }
      </style>
      <section class="hero" style="padding:48px 22px 80px;">
        <div class="hero-inner dashboards-hero-inner">
          <div class="hero-left">
            <div class="hero-label-row">
              <span class="eyebrow">Visualización de datos</span>
            </div>
            <h1 class="display" style="font-size:clamp(36px,8vw,64px);color:var(--banda-texto);line-height:1.05;">
              Dashboards Analíticos
            </h1>
          </div>
          <div class="hero-right" style="width: 100%;">
            ${quarterAccordionHtml}
          </div>
        </div>
      </section>

      <div class="dashboard-controls-bar">
        <div class="controls-bar-left">
          <span class="controls-bar-title">Análisis Mensual</span>
          <span class="controls-bar-sub">Visualizando estadísticas de ${capitalizedCurrMonth} ${currYear}</span>
        </div>
        <div class="controls-bar-right">
          <div class="custom-select" id="dashMonthDropdown">
            <button class="custom-select-trigger" onclick="DashboardsView.toggleMonthDropdown(event)">
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
      </div>

      ${dashTakeawaysHtml}
      ${attendHtml}

      <div class="home-grid-2">
        <section class="section r">
          <div class="section-head">
            <h2 class="section-title" style="margin:0;">Ranking de Calificación <span class="accent">${capitalizedCurrMonth}</span></h2>
            <span class="section-sub">Promedio real por sucursal en el mes; el orden y el color usan el brillo ajustado, que pide evidencia.</span>
          </div>
          <p class="story-line story-line--center" id="storyRank" aria-live="polite"></p>
          <div class="chart-card spotlight-card"><div class="chart-wrap"><div id="rankingChart" style="width:100%;height:100%"></div></div></div>
          <div class="mx-legend" id="rankLegend">${EC.faseLegend(true)}</div>
        </section>

        <section class="section r">
          <div class="section-head">
            <div class="section-title">Tendencia Regional <span class="accent">YTD</span></div>
            <span class="section-sub">Evolución de la calificación promedio regional durante el año.</span>
          </div>
          <p class="story-line story-line--center" id="storyTrend" aria-live="polite"></p>
          <div class="chart-card"><div class="chart-wrap"><div id="trendChart" style="width:100%;height:100%"></div></div></div>
        </section>

        ${this._buildMatrixSection(currYear, currMonth)}

        <section class="section r">
          <div class="section-head">
            <h2 class="section-title" style="margin:0;">Volumen de Reseñas <span class="accent">${capitalizedCurrMonth}</span></h2>
            <span class="section-sub">${currGlobal.totalReviews} reseñas · Negativas vs Positivas/Neutrales</span>
          </div>
          <p class="story-line story-line--center" id="storyVol" aria-live="polite"></p>
          <div class="chart-card spotlight-card"><div class="chart-wrap"><div id="volChart" style="width:100%;height:100%"></div></div></div>
        </section>

        <section class="section r">
          <div class="section-head">
            <div class="section-title">Distribución de Estrellas <span class="accent">${capitalizedCurrMonth}</span></div>
            <span class="section-sub">Desglose de calificaciones de 1 a 5 estrellas.</span>
          </div>
          <p class="story-line story-line--center" id="storyDist" aria-live="polite"></p>
          <div class="chart-card spotlight-card"><div class="chart-wrap"><div id="distChart" style="width:100%;height:100%"></div></div></div>
        </section>

        ${this._buildRegionHourSection(currYear, currMonth)}
      </div>

      ${buildFooter(getRegionName(activeRegion))}`;

    setTimeout(() => {
      // Close custom select on clicking outside
      const _clickOutsideHandler = (e) => {
        const dropdown = document.getElementById('dashMonthDropdown');
        if (dropdown && !dropdown.contains(e.target)) {
          dropdown.classList.remove('open');
        }
      };
      document.removeEventListener('click', window._dashMonthDropdownOutsideHandler);
      window._dashMonthDropdownOutsideHandler = _clickOutsideHandler;
      document.addEventListener('click', _clickOutsideHandler);

      // Titular de cada gráfica (Narrative) y vínculo entre volumen y ranking
      const story = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
      let apiVol = null, apiRank = null;

      // Render Charts
      // 1. Volume Chart
      const sortedVol = [...branches].sort((a, b) => b.curr.count - a.curr.count);
      const ctxVol = document.getElementById('volChart');
      if (ctxVol) {
        const labels = sortedVol.map(s => s.abr);
        const warnData = [];    // 1-2★
        const neutralData = []; // 3★
        const okData = [];      // 4-5★

        sortedVol.forEach(s => {
          const bReviews = DataLoader.getReviewsForBranch(currYear, currMonth, s.id);
          const negatives = bReviews.filter(r => Metrics.isComplaint(r)).length;
          const neutrals = bReviews.filter(r => r.stars === 3).length;
          const positives = bReviews.filter(r => r.stars >= 4).length;

          warnData.push(negatives);
          neutralData.push(neutrals);
          okData.push(positives);
        });
        story('storyVol', Narrative.volume(sortedVol.map((s, i) => ({ nombre: s.nombre || s.abr, count: s.curr.count, neg: warnData[i] }))));

        apiVol = EtoileCharts.stackedVolume(ctxVol, labels, okData, neutralData, warnData, (index, datasetIdx) => {
          const branchObj = sortedVol[index];
          if (branchObj && typeof HomeView !== 'undefined' && HomeView.openFullFeedModal) {
            HomeView.openFullFeedModal(datasetIdx === 0 ? 'negativas' : (datasetIdx === 1 ? 'neutras' : 'positivas'));
          }
        });
      }

      // 2. Ranking Chart
      const sortedRating = Brillo.ordena(branches);
      const ctxRanking = document.getElementById('rankingChart');
      if (ctxRanking) {
        const labels = sortedRating.map(s => s.abr);
        const data = sortedRating.map(s => s.curr.score);
        story('storyRank', Narrative.ranking(sortedRating.map(s => ({ nombre: s.nombre || s.abr, score: s.curr.score, count: s.curr.count })), KpiMeta.ratingMinimo));
        // El ranking solo muestra el estado (sin señales): el color de su fase en la paleta de las gráficas
        const colors = sortedRating.map(s => s.estado.fase === 'sin' ? EC.c('linea') : EC.fase(s.estado.fase));
        apiRank = EtoileCharts.barRanking(ctxRanking, labels, data, colors, (index) => {
          const branchObj = sortedRating[index];
          if (branchObj && branchObj.id) {
            Router.navigate(`#/sucursal/${branchObj.id}`);
          }
        });
      }

      // Pasar el cursor por una sucursal en una gráfica la resalta en la otra
      EC.linkHover(apiVol, apiRank);

      // 3. Distribution Chart
      const ctxDist = document.getElementById('distChart');
      if (ctxDist) {
        const currMonthData = DataLoader.getMonth(currYear, currMonth);
        const currReviews = currMonthData ? currMonthData.reviews : [];
        const starCounts = [0, 0, 0, 0, 0]; // 5, 4, 3, 2, 1
        currReviews.forEach(r => {
          if (r.stars >= 1 && r.stars <= 5) {
            starCounts[5 - r.stars]++;
          }
        });
        story('storyDist', Narrative.distribution(starCounts));
        const labels = ['5 ★', '4 ★', '3 ★', '2 ★', '1 ★'];
        // Acento de la marca para 4–5★, gris para 3★ y brasa solo en 1–2★
        const colors = [EC.c('acento'), EC.cssVar('--sage', '#5E8F72'), EC.c('control'), EC.c('brasa'), EC.cssVar('--brasa', '#B5361C')];
        EtoileCharts.starDistributionBar(ctxDist, labels, starCounts, colors, (index) => {
          const targetStars = 5 - index;
          DashboardsView.openStarReviewsModal(currYear, currMonth, targetStars);
        });
      }

      // 4. Trend Chart
      const ctxTrend = document.getElementById('trendChart');
      if (ctxTrend) {
        const trendLabels = [];
        const trendData = [];
        for (const m of sortedMonths) {
          const monthName = MONTH_NAMES[m - 1].substring(0, 3);
          trendLabels.push(`${monthName} ${currYear}`);
          const d = DataLoader.getMonth(currYear, m);
          if (d && d.reviews && d.reviews.length > 0) {
            const avg = d.reviews.reduce((sum, r) => sum + r.stars, 0) / d.reviews.length;
            trendData.push(avg);
          } else {
            trendData.push(null);
          }
        }
        const color = EC.c('acento');
        const nowUtc = (() => { const n = BranchTime.nowMonth(); return { getUTCFullYear: () => n.y, getUTCMonth: () => n.m - 1 }; })();   // mes en curso en hora de CDMX
        const lastIsCurrentMonth = currYear === nowUtc.getUTCFullYear() && sortedMonths[sortedMonths.length - 1] === nowUtc.getUTCMonth() + 1;
        story('storyTrend', Narrative.ratingTrend(trendLabels, trendData, KpiMeta.ratingMinimo, lastIsCurrentMonth));
        EtoileCharts.lineTrend(ctxTrend, trendLabels, trendData, 'Promedio Regional', color, i => DashboardsView.selectMonthOption(sortedMonths[i]));
      }

      // 4b. Heatmap sucursal × mes
      DashboardsView._initMatrix();

      // 5. Quejas por hora de la región (últimos 12 meses, hora local de cada tienda)
      const hourEl = document.getElementById('regionHourChart');
      if (hourEl && DashboardsView._hourData) EtoileCharts.hourComplaints(hourEl, DashboardsView._hourData.h, DashboardsView._hourData.hl, hr => HourDrawer.open(hr, DashboardsView._hourData.h, getRegionName(activeRegion)));
    }, 350);

    requestAnimationFrame(() => {
      initReveal();
    });
  },

  goAttend(id) { location.hash = '#/sucursal/' + id; },

  openAttendAll() {
    Drawer.open({ id: 'attendAll', title: 'Qué atender', subtitle: `${(this._attendRows || []).length} puntos, por gravedad`, bodyHtml: `<div class="attend-list">${(this._attendRows || []).join('')}</div>` });
  },


  toggleMonthDropdown(event) {
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
        DashboardsView.selectMonthOption(parseInt(val));
      });
    } else {
      const dropdown = document.getElementById('dashMonthDropdown');
      if (dropdown) {
        dropdown.classList.toggle('open');
      }
    }
  },

  async selectMonthOption(month) {
    const dropdown = document.getElementById('dashMonthDropdown');
    if (dropdown) {
      dropdown.classList.remove('open');
    }
    const currYear = DataLoader.currentYear;
    DataLoader.setMonth(currYear, month);

    // Asegurar que el mes seleccionado y todos los meses YTD estén cargados
    // antes de renderizar (pueden no estar en caché si no se habían visitado).
    const monthsToLoad = DataLoader.manifest[currYear] || [];
    await Promise.all(monthsToLoad.map(m => DataLoader.loadMonth(currYear, m)));

    await this.render();
    initReveal();
  },

  _buildQuarterAccordion(quarterData, currYear) {
    const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
    const cardsHtml = quarterData.map((qd, index) => {
      const isActive = index === 0 ? ' active' : ''; // Q1 activo por defecto
      const avgStr = qd.totalReviews > 0 ? qd.avgRating.toFixed(2) : '—';
      const reviewsStr = qd.totalReviews > 0 ? `${qd.totalReviews}` : '—';
      const negStr = qd.totalReviews > 0 ? `${qd.negativeReviews}` : '—';
      return `
        <div class="quarter-accordion-card${isActive}" data-index="${index}" role="button" tabindex="0" aria-expanded="${index === 0}" aria-label="Resumen del trimestre Q${qd.quarter} ${currYear}" onclick="DashboardsView.setActiveQuarterCard(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();DashboardsView.setActiveQuarterCard(${index});}">
          <div class="qcard-collapsed-label">
            <span class="qcard-collapsed-year">${currYear}</span>
            <span class="qcard-collapsed-q">Q${qd.quarter}</span>
          </div>
          <div class="qcard-expanded-content">
            <div class="qcard-expanded-header">
              <span class="eyebrow">Q${qd.quarter} ${currYear}</span>
              <span class="qcard-title">${qd.quarter === currentQuarter ? 'Trimestre en curso' : 'Trimestre cerrado'}</span>
            </div>
            
            <div class="qcard-stats-grid">
              <div class="qcard-stat-item">
                <span class="qcard-stat-label">Promedio</span>
                <span class="qcard-stat-value num ${qd.totalReviews > 0 && qd.avgRating >= THRESHOLDS.EXCELENTE ? 'gold' : qd.totalReviews > 0 && qd.avgRating < THRESHOLDS.DOWN ? 'down' : ''}">${avgStr}★</span>
              </div>
              <div class="qcard-stat-item">
                <span class="qcard-stat-label">Reseñas</span>
                <span class="qcard-stat-value num">${reviewsStr}</span>
              </div>
              <div class="qcard-stat-item">
                <span class="qcard-stat-label">Críticas</span>
                <span class="qcard-stat-value num ${qd.negativeReviews > 0 ? 'down' : ''}">${negStr}</span>
              </div>
            </div>
            <div class="qcard-expanded-footer">
              <a href="#/trimestre/${currYear}-Q${qd.quarter}" class="qcard-btn-link">
                Ver reporte completo →
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="quarter-accordion-container" style="margin-top: 0;">
        <div class="quarter-accordion-wrapper">
          ${cardsHtml}
        </div>
      </div>
    `;
  },

  setActiveQuarterCard(index) {
    const cards = document.querySelectorAll('.quarter-accordion-card');
    cards.forEach((card, idx) => {
      card.classList.toggle('active', idx === index);
      card.setAttribute('aria-expanded', idx === index ? 'true' : 'false');
    });
  },

  renderSkeleton() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = `
      ${buildTopbar(false, '', true)}
      <div style="max-width:1200px; margin:0 auto; padding:24px; box-sizing:border-box; display:flex; flex-direction:column; gap:24px;">
        <div class="skeleton" style="height: 100px; border-radius: 20px;"></div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div class="skeleton" style="height: 250px; border-radius: 20px;"></div>
          <div class="skeleton" style="height: 250px; border-radius: 20px;"></div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div class="skeleton" style="height: 250px; border-radius: 20px;"></div>
          <div class="skeleton" style="height: 250px; border-radius: 20px;"></div>
        </div>
      </div>
    `;
  },

  /* ── Heatmap sucursal × mes ── */
  _matrixMetric: 'rating',
  _matrixApi: null,

  _matrixLegend(metric) {
    const sw = (c, t) => `<span class="mx-key"><i style="background:${c}"></i>${t}</span>`;
    return metric === 'rating'
      ? EC.faseLegend(false) + '<span class="mx-key mx-faint"><i></i>Rayada = menos de 3 reseñas</span>'
      : sw(EC.c('linea'), 'Pocas reseñas') + sw(EC.c('control'), 'Medio') + sw(EC.c('acento'), 'Muchas reseñas');
  },

  _matrixStory(metric) {
    const mx = this._matrix;
    if (!mx) return '';
    const now = (() => { const n = BranchTime.nowMonth(); return { getUTCFullYear: () => n.y, getUTCMonth: () => n.m - 1 }; })();   // hora de CDMX
    const lastIsCurrent = mx.months.length && mx.months[mx.months.length - 1].y === now.getUTCFullYear() && mx.months[mx.months.length - 1].m === now.getUTCMonth() + 1;
    return metric === 'rating' ? Narrative.matrix(mx, EC.metaRating(), lastIsCurrent) : Narrative.matrixVolume(mx);
  },

  /** ¿Cómo evoluciona cada sucursal? Últimos 12 meses (calificación o volumen) */
  _buildMatrixSection(year, month) {
    this._matrix = Patterns.branchMonthMatrix(SUCURSALES_META.map(s => ({ id: s.id, abr: s.abr, nombre: s.nombre })), year, month, 12);
    this._matrixMetric = 'rating';
    const h = Math.max(240, this._matrix.rows.length * 30 + 70);
    return `
        <section class="section r" style="grid-column: 1 / -1;">
          <div class="section-head">
            <div class="section-title">¿Cómo evoluciona cada sucursal? <span class="accent">12 meses</span></div>
            <span class="section-sub">Cada celda es un mes de una sucursal · toca una para ver sus reseñas</span>
          </div>
          <p class="story-line story-line--center" id="storyMatrix" aria-live="polite">${escapeHtml(this._matrixStory('rating'))}</p>
          <div class="filter-row mx-metric" role="group" aria-label="Métrica del mapa">
            <button type="button" class="chip active" onclick="DashboardsView.setMatrixMetric('rating', this)">Calificación</button>
            <button type="button" class="chip" onclick="DashboardsView.setMatrixMetric('volume', this)">Volumen</button>
          </div>
          <div class="chart-card chart-card--auto"><div class="chart-wrap" style="height:${h}px"><div id="branchMonthMatrix" style="width:100%;height:100%"></div></div></div>
          <div class="mx-legend" id="matrixLegend">${this._matrixLegend('rating')}</div>
        </section>`;
  },

  _initMatrix() {
    const el = document.getElementById('branchMonthMatrix');
    if (!el || !this._matrix) return;
    if (this._matrixApi) { try { this._matrixApi.dispose(); } catch (e) {} }
    this._matrixApi = EtoileCharts.branchMonthHeatmap(el, this._matrix, {
      metric: this._matrixMetric,
      onSelect: (ri, mi) => DashboardsView.openMatrixCell(ri, mi)
    });
  },

  setMatrixMetric(metric, btn) {
    this._matrixMetric = metric;
    document.querySelectorAll('.mx-metric .chip').forEach(c => c.classList.toggle('active', c === btn));
    const st = document.getElementById('storyMatrix'); if (st) st.textContent = this._matrixStory(metric);
    const lg = document.getElementById('matrixLegend'); if (lg) lg.innerHTML = this._matrixLegend(metric);
    this._initMatrix();
  },

  /** Las reseñas de una sucursal en un mes, en el drawer único (las peores primero) */
  openMatrixCell(rowIdx, monthIdx) {
    const r = this._matrix.rows[rowIdx], mo = this._matrix.months[monthIdx];
    if (!r || !mo) return;
    const list = DataLoader.getReviewsForBranch(mo.y, mo.m, r.id)
      .filter(x => x.text && x.text.trim().length > 0)
      .sort((a, b) => a.stars - b.stars || Date.parse(b.publishedAtDate) - Date.parse(a.publishedAtDate));
    const all = DataLoader.getReviewsForBranch(mo.y, mo.m, r.id);
    const avg = r.values[monthIdx];
    Drawer.open({
      id: 'matrixDrawer',
      title: escapeHtml(r.nombre),
      subtitle: `${mo.full} · ${all.length} reseña${all.length === 1 ? '' : 's'} (${list.length} con texto)${avg != null ? ` · promedio ${Number(avg).toFixed(2)}★` : ''}`,
      bodyHtml: list.length ? ReviewCard.list(list) : '<p class="drawer-empty">Sin reseñas con texto en este mes.</p>',
      footerHtml: `<button type="button" class="modal-shortcut-btn" onclick="DashboardsView.goBranchMonth('${r.id}', ${mo.y}, ${mo.m})">Ver ficha de ${escapeHtml(r.abr)} en ${escapeHtml(mo.full)} →</button>`
    });
  },

  goBranchMonth(branchId, y, m) {
    DataLoader.setMonth(y, m);
    Drawer.navigate(`#/sucursal/${branchId}`);
  },

  /** ¿A qué hora llegan las quejas en la región? Últimos 12 meses, hora local de cada tienda */
  _buildRegionHourSection(year, month) {
    const h = Patterns.hourly(Patterns.collect(year, month, 12));
    const hl = Patterns.headline(h);
    this._hourData = { h, hl };
    const regionName = typeof getRegionName === 'function' ? getRegionName(activeRegion) : '';
    return `
        <section class="section r" style="grid-column: 1 / -1;">
          <div class="section-head">
            <div class="section-title">¿A qué hora llegan las quejas? <span class="accent">${regionName}</span></div>
            <span class="section-sub">Quejas de 1-2★ con texto, por hora local de cada tienda (24 h) · últimos 12 meses</span>
          </div>
          <p class="story-line story-line--center${hl.concentrated ? ' is-alert' : ''}">${hl.text}</p>
          <div class="chart-card"><div class="chart-wrap" style="height:280px"><div id="regionHourChart" style="width:100%;height:100%"></div></div></div>
          <div class="story-foot">${h.nNeg} quejas de ${h.n} reseñas con texto en ${regionName}</div>
        </section>`;
  },

  openStarReviewsModal(year, month, stars) {
    this._modalYear = year;
    this._modalMonth = month;
    this._modalStars = stars;

    const activeRegion = typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated() ? AppAuth.getUserRegion() : 'GDL';
    const allReviews = typeof DataLoader.getReviewsForRegion === 'function' 
      ? DataLoader.getReviewsForRegion(year, month, activeRegion)
      : ((DataLoader.getMonth(year, month) || {}).reviews || []);

    // REGLA MANDATORIA: Filtrar EXCLUSIVAMENTE reseñas de la calificación actual que contengan texto real escrito
    this._modalFiltered = allReviews.filter(r => r.stars === stars && r.text && r.text.trim().length > 0);

    // Contar únicamente sucursales que tengan opiniones en esta calificación específica (sin mezclar otras estrellas)
    const branchCountsMap = {};
    this._modalFiltered.forEach(r => {
      const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
      const rawKey = meta ? meta.id : (r.sucursal || 'sucursal').toLowerCase();
      const displayName = meta ? meta.nombre : (r.sucursal || 'Sucursal');
      if (!branchCountsMap[rawKey]) {
        branchCountsMap[rawKey] = { name: displayName, count: 0 };
      }
      branchCountsMap[rawKey].count++;
    });

    const branchOptionsHtml = Object.keys(branchCountsMap).sort((x, y) => branchCountsMap[x].name.localeCompare(branchCountsMap[y].name)).map(rawKey => {
      const bInfo = branchCountsMap[rawKey];
      return `<div class="custom-option" data-value="${escapeHtml(rawKey)}" data-label="${escapeHtml(bInfo.name)} (${bInfo.count})" onclick="DashboardsView.onStarModalOptionClick(this)">${escapeHtml(bInfo.name)} (${bInfo.count})</div>`;
    }).join('');

    const monthName = MONTH_NAMES[month - 1];
    Drawer.open({
      id: 'dashStarModalOverlay',
      bodyId: 'starModalCardsContainer',
      title: `Reseñas de ${stars} ★`,
      subtitle: `${monthName} ${year} · Región ${getRegionName(activeRegion)} · <strong id="starModalCountBadge">${this._modalFiltered.length} verificadas</strong>`,
      filtersHtml: `
        <div class="filter-group" style="grid-column: 1 / -1;">
          <label>Sucursal</label>
          <div class="custom-select" id="starModalBranchDropdown">
            <button class="custom-select-trigger" onclick="DashboardsView.toggleStarModalDropdown(event)">
              <span class="custom-select-value" id="starModalSelectedBranchLabel">Todas las sucursales (${this._modalFiltered.length})</span>
              <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="custom-select-options">
              <div class="custom-option active" data-value="all" data-label="Todas las sucursales (${this._modalFiltered.length})" onclick="DashboardsView.onStarModalOptionClick(this)">Todas las sucursales (${this._modalFiltered.length})</div>
              ${branchOptionsHtml}
            </div>
          </div>
        </div>`,
      bodyHtml: this._buildStarModalCards(this._modalFiltered)
    });
  },

  closeStarReviewsModal() {
    Drawer.close('dashStarModalOverlay');
  },

  toggleStarModalDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('starModalBranchDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) {
      const away = (e) => { if (!dropdown.contains(e.target)) { dropdown.classList.remove('open'); document.removeEventListener('click', away); } };
      setTimeout(() => document.addEventListener('click', away), 0);
    }
  },

  onStarModalOptionClick(el) {
    if (!el) return;
    const rawKey = el.getAttribute('data-value');
    const labelText = el.getAttribute('data-label') || el.textContent.trim();
    this.selectStarModalBranch(rawKey, labelText);
  },

  selectStarModalBranch(branchKey, labelText) {
    const dropdown = document.getElementById('starModalBranchDropdown');
    if (dropdown) dropdown.classList.remove('open');

    const label = document.getElementById('starModalSelectedBranchLabel');
    if (label) label.textContent = labelText;

    const options = dropdown ? dropdown.querySelectorAll('.custom-option') : [];
    options.forEach(opt => {
      if (opt.getAttribute('data-value') === branchKey) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    this.filterStarModalByBranch(branchKey);
  },

  _buildStarModalCards(reviews) {
    if (!reviews || !reviews.length) {
      return '<p class="drawer-empty">No se encontraron opiniones con este criterio.</p>';
    }
    return ReviewCard.list(reviews);
  },

  filterStarModalByBranch(branchKey) {
    const list = this._modalFiltered || [];
    let result = list;

    if (branchKey && branchKey !== 'all') {
      result = list.filter(r => {
        const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
        const key = meta ? meta.id : (r.sucursal || '').toLowerCase();
        return key === branchKey.toLowerCase();
      });
    }

    const container = document.getElementById('starModalCardsContainer');
    const badge = document.getElementById('starModalCountBadge');
    const label = document.getElementById('starModalSelectedBranchLabel');

    if (container) {
      container.innerHTML = this._buildStarModalCards(result);
    }
    if (badge) {
      badge.textContent = `${result.length} ${branchKey === 'all' ? 'verificadas' : 'en sucursal'}`;
    }
    if (label && branchKey === 'all') {
      label.textContent = `Todas las sucursales (${list.length})`;
    }
  }
};
