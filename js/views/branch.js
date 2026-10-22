/**
 * views/branch.js — Vista de sucursal con selector de mes, scorecard de KPIs y reseñas mensuales.
 */

const BranchView = {
  async render(params, isHomeMode = false) {
    this.activeParams = params;
    const meta = getBranchById(params.id);
    if (!meta) {
      window.location.hash = '#/404';
      return;
    }

    const activeYear = DataLoader.currentYear;
    // `let`: si el mes elegido no tiene reseñas de esta sucursal se cambia al más reciente que sí tenga (antes era const y la ficha se rompía)
    let activeMonth = DataLoader.currentMonth;

    const skeletonTimeout = setTimeout(() => {
      this.renderSkeleton();
    }, 250);

    let prevStats = null;
    let hasPrevMonth = false;
    let prevMonth = activeMonth - 1;
    let prevYear = activeYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = activeYear - 1;
    }
    let availableMonths = [];

    try {
      // Asegurar carga de los meses en paralelo para máxima velocidad de respuesta
      availableMonths = DataLoader.manifest[activeYear] || [];
      await Promise.all(availableMonths.map(m => DataLoader.loadMonth(activeYear, m)));

      // Si el mes seleccionado por defecto no tiene reseñas para esta sucursal,
      // seleccionar automáticamente el mes con reseñas más reciente de esta tienda.
      const branchMonthsWithData = typeof DataLoader.getAvailableMonthsForBranch === 'function'
        ? DataLoader.getAvailableMonthsForBranch(meta.id, activeYear)
        : [];
      if (branchMonthsWithData.length > 0 && (!branchMonthsWithData.includes(activeMonth) || DataLoader.computeBranchStats(activeYear, activeMonth, meta.id).count === 0)) {
        activeMonth = branchMonthsWithData[branchMonthsWithData.length - 1];
        DataLoader.currentMonth = activeMonth;
      }

      // Carga de mes anterior para comparativas
      prevMonth = activeMonth - 1;
      prevYear = activeYear;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = activeYear - 1;
      }

      hasPrevMonth = DataLoader.hasMonth(prevYear, prevMonth);
      if (hasPrevMonth) {
        await DataLoader.loadMonth(prevYear, prevMonth);
        prevStats = DataLoader.computeBranchStats(prevYear, prevMonth, meta.id);
      }
    } finally {
      clearTimeout(skeletonTimeout);
    }

    const reviews = DataLoader.getReviewsForBranch(activeYear, activeMonth, meta.id);
    const stats = DataLoader.computeBranchStats(activeYear, activeMonth, meta.id);
    // Brillo de la tienda (marca.md): estado con ajuste contra su región y, aquí en el detalle, su señal
    const regionIds = SUCURSALES_META.some(m => m.id === meta.id) ? SUCURSALES_META.map(m => m.id) : [meta.id];
    const br = DataLoader.brillo(activeYear, activeMonth, regionIds)[meta.id];
    const brLectura = `${br.lectura}${br.senal ? ` (${Brillo.NOMBRE_SENAL[br.senal].toLowerCase()})` : ''}${stats.avg > 0 ? `: ${stats.avg.toFixed(2)} de 5.00` : ''}`;

    const monthName = new Date(activeYear, activeMonth - 1).toLocaleString('es-ES', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const delta = stats.avg > 0 ? (stats.avg - meta.historico) : 0;
    const dStr = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    const dClass = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';

    // Evaluación de KPIs (Scorecard)
    const kpiVolClass = stats.count >= KpiMeta.volumenMeta ? 'optimal' : 'attention';
    
    // Calidad de reseña: Mide cuántas reseñas positivas (4 o 5 estrellas) tuvieron texto.
    // Ignora por completo las reseñas negativas para no penalizar el score de calidad.
    const positivas = reviews.filter(r => r.stars >= 4);
    const positivasConTexto = positivas.filter(r => r.text && r.text.trim().length > 5).length;
    
    const hasTextRatio = positivas.length > 0 ? (positivasConTexto / positivas.length) : 0;
    const kpiCalClass = hasTextRatio >= KpiMeta.calidadTextoMeta ? 'optimal' : 'attention';
    const kpiRatClass = stats.avg >= KpiMeta.ratingMinimo || stats.avg === 0 ? 'optimal' : 'critical';

    // Deltas con mes anterior
    const volDiff = prevStats ? (stats.count - prevStats.count) : 0;
    const volDiffStr = volDiff >= 0 ? `+${volDiff}` : `${volDiff}`;
    
    let prevHasTextRatio = 0;
    if (hasPrevMonth) {
      const prevReviews = DataLoader.getReviewsForBranch(prevYear, prevMonth, meta.id);
      const prevPositivas = prevReviews.filter(r => r.stars >= 4);
      const prevPositivasConTexto = prevPositivas.filter(r => r.text && r.text.trim().length > 5).length;
      prevHasTextRatio = prevPositivas.length > 0 ? (prevPositivasConTexto / prevPositivas.length) : 0;
    }
    const calDiff = (hasTextRatio - prevHasTextRatio) * 100;
    const calDiffStr = calDiff >= 0 ? `+${calDiff.toFixed(0)}%` : `${calDiff.toFixed(0)}%`;

    const ratDiff = (prevStats && prevStats.avg > 0) ? (stats.avg - prevStats.avg) : 0;
    const ratDiffStr = ratDiff >= 0 ? `+${ratDiff.toFixed(2)}` : `${ratDiff.toFixed(2)}`;

    // Cálculo de progreso de calificación histórica (Idea 1)
    const R = meta.historico;
    const N = meta.historicoCount || 0;
    let targetRating = Math.floor(R * 10) / 10 + 0.1;
    if (targetRating - R < 0.01) {
      targetRating += 0.1;
    }
    targetRating = Math.round(targetRating * 10) / 10;
    if (targetRating > 4.9) {
      targetRating = 4.9;
    }

    let progressBannerHtml = '';
    if (N > 0) {
      if (R >= 4.9) {
        progressBannerHtml = `
          <div class="rating-progress-banner" style="background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--sombra-card);">
            <div class="rpb-icon" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(61, 138, 95, 0.12); color: var(--ok-ink); flex-shrink: 0;">
              ${svgIcon('starFilled')}
            </div>
            <div class="rpb-content" style="flex-grow: 1;">
              <div class="rpb-title" style="font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                Progreso de Calificación Histórica
                <span class="badge badge-optimal" style="margin-left: 0;">Excelente</span>
              </div>
              <div class="rpb-text" style="font-size: 12.5px; color: var(--text-dim); line-height: 1.4;">
                La sucursal tiene un promedio histórico sobresaliente de <strong>${R.toFixed(2)}★</strong> (basado en ${N} reseñas). ¡Felicidades por mantener un estándar de excelencia operativa!
              </div>
            </div>
          </div>
        `;
      } else {
        const x = Math.ceil((N * (targetRating - R)) / (5 - targetRating));
        progressBannerHtml = `
          <div class="rating-progress-banner" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--sombra-card);">
            <div class="rpb-icon" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(212, 175, 55, 0.1); color: var(--oro-ink); flex-shrink: 0;">
              ${svgIcon('starFilled')}
            </div>
            <div class="rpb-content" style="flex-grow: 1;">
              <div class="rpb-title" style="font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px;">Progreso de Calificación Histórica</div>
              <div class="rpb-text" style="font-size: 12.5px; color: var(--text-dim); line-height: 1.4;">
                Calificación histórica: <strong>${R.toFixed(2)}★</strong> (${N} reseñas). Para elevar la calificación histórica al siguiente punto porcentual de <strong>${targetRating.toFixed(1)}★</strong>, se necesitan recibir consecutivamente <strong>${x}</strong> reseñas perfectas de 5 estrellas.
              </div>
            </div>
          </div>
        `;
      }
    } else {
      progressBannerHtml = `
        <div class="rating-progress-banner" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--sombra-card);">
          <div class="rpb-icon" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); flex-shrink: 0;">
            ${svgIcon('star')}
          </div>
          <div class="rpb-content" style="flex-grow: 1;">
            <div class="rpb-title" style="font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px;">Progreso de Calificación Histórica</div>
            <div class="rpb-text" style="font-size: 12.5px; color: var(--text-dim); line-height: 1.4;">
              Aún no hay suficientes reseñas registradas en el historial de esta sucursal para proyectar metas.
            </div>
          </div>
        </div>
      `;
    }

    const scorecardSection = `
      <div class="scorecard-grid" style="margin-bottom:14px;">
        <div class="scorecard status-${kpiVolClass}">
          <div class="sc-label">Volumen de reseñas</div>
          <div class="sc-value num">${stats.count}</div>
          <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${Math.min(stats.count / KpiMeta.volumenMeta * 100, 100).toFixed(0)}%"></div></div>
          <span class="badge badge-${kpiVolClass}">${kpiVolClass === 'optimal' ? 'Cumple' : 'Atención'}</span>
          <div class="sc-sub" style="margin-top:6px; display:flex; justify-content:space-between; font-size:10px;">
            <span>Meta: ≥${KpiMeta.volumenMeta}</span>
            <span style="color:${volDiff > 0 ? 'var(--verde-ink)' : volDiff < 0 ? 'var(--alerta-ink)' : 'var(--text-muted)'}; font-weight:600;">
              ${volDiffStr} vs anterior
            </span>
          </div>
        </div>
        <div class="scorecard status-${kpiCalClass}">
          <div class="sc-label">Calidad de reseña</div>
          <div class="sc-value num">${(hasTextRatio * 100).toFixed(0)}%</div>
          <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${Math.min(hasTextRatio / KpiMeta.calidadTextoMeta * 100, 100).toFixed(0)}%"></div></div>
          <span class="badge badge-${kpiCalClass}">${kpiCalClass === 'optimal' ? 'Cumple' : 'Atención'}</span>
          <div class="sc-sub" style="margin-top:6px; display:flex; justify-content:space-between; font-size:10px;">
            <span>Meta: ≥${(KpiMeta.calidadTextoMeta * 100).toFixed(0)}%</span>
            <span style="color:${calDiff > 0.5 ? 'var(--verde-ink)' : calDiff < -0.5 ? 'var(--alerta-ink)' : 'var(--text-muted)'}; font-weight:600;">
              ${calDiffStr} vs anterior
            </span>
          </div>
        </div>
        <div class="scorecard status-${kpiRatClass}">
          <div class="sc-label">Rating Mensual</div>
          <div class="sc-value num">${stats.avg > 0 ? stats.avg.toFixed(2) : '—'}</div>
          <div class="kpi-progress"><div class="kpi-progress-bar" style="width:${stats.avg > 0 ? Math.min(stats.avg / KpiMeta.ratingMinimo * 100, 100).toFixed(0) : 0}%"></div></div>
          <span class="badge badge-${kpiRatClass}">${kpiRatClass === 'optimal' ? 'Cumple' : 'Crítico'}</span>
          <div class="sc-sub" style="margin-top:6px; display:flex; justify-content:space-between; font-size:10px;">
            <span>Meta: ≥${KpiMeta.ratingMinimo.toFixed(2)}</span>
            <span style="color:${ratDiff > 0.01 ? 'var(--verde-ink)' : ratDiff < -0.01 ? 'var(--alerta-ink)' : 'var(--text-muted)'}; font-weight:600;">
              ${ratDiffStr} vs anterior
            </span>
          </div>
        </div>
        <div class="scorecard status-${dClass === 'up' ? 'optimal' : dClass === 'down' ? 'attention' : 'optimal'}">
          <div class="sc-label">Δ vs Histórico (${meta.historico.toFixed(1)})</div>
          <div class="sc-value num ${dClass}">${stats.avg > 0 ? dStr : '—'}</div>
          <div class="kpi-progress"><div class="kpi-progress-bar" style="width:100%"></div></div>
          <div class="sc-sub" style="margin-top:6px;">${dClass === 'up' ? '↑ Mejora' : dClass === 'down' ? '↓ Caída' : '→ Estable'}</div>
        </div>
      </div>`;

    // Dynamic Insights based on LLM classifications
    const negativeReviews = reviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);
    const categoryCounts = { servicio: 0, calidad: 0, valor: 0 };
    const summaries = [];

    negativeReviews.forEach(r => {
      if (r.classification && typeof r.classification.es_queja === 'boolean') {
        if (r.classification.es_queja) {
          const cat = r.classification.categoria_queja;
          if (cat) {
            if (cat.servicio) categoryCounts.servicio++;
            if (cat.calidad) categoryCounts.calidad++;
            if (cat.valor) categoryCounts.valor++;
          }
          if (r.classification.resumen_tema) {
            summaries.push(`"${escapeHtml(r.classification.resumen_tema)}"`);
          } else {
            summaries.push(`"${escapeHtml(r.text.substring(0, 60))}..."`);
          }
        }
      } else {
        const hasService = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.servicio);
        const hasQuality = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.calidad);
        const hasValue = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.valor);
        
        if (hasService) categoryCounts.servicio++;
        if (hasQuality) categoryCounts.calidad++;
        if (hasValue) categoryCounts.valor++;
        summaries.push(`"${escapeHtml(r.text.substring(0, 60))}..."`);
      }
    });

    // El clasificador repite el mismo tema en varias quejas («Detalle en servicio y calidad»): una línea por tema, con cuántas veces
    const resumenes = [...summaries.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map())].sort((x, y) => y[1] - x[1]);

    let alertTheme = null;
    const maxCat = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
    if (negativeReviews.length > 0) {
      if (maxCat && maxCat[1] > 0) {
        alertTheme = maxCat[0] === 'servicio' ? 'Atención y Servicio' : maxCat[0] === 'calidad' ? 'Calidad del Producto' : 'Relación Valor/Precio';
      } else {
        alertTheme = 'Comentarios diversos';
      }
    }

    const insightsHtml = this._buildInsights(meta, reviews, stats);
    const problemSection = negativeReviews.length > 0 ? `
      <div class="status-warn-box" style="margin-bottom:14px;">
        <div class="topic">Alerta: ${alertTheme}</div>
        <ul class="problem-list">
          ${resumenes.slice(0, 3).map(([t, n]) => `<li>${t}${n > 1 ? ` <span class="problem-veces">× ${n}</span>` : ''}</li>`).join('')}
        </ul>
      </div>` : `<div class="status-ok-box" style="margin-bottom:14px;">
        <div class="check" style="display:flex; align-items:center; justify-content:center; width:20px; height:20px; flex-shrink:0;">${svgIcon('check')}</div>
        <div class="ok-text">
          <strong>Estable</strong>
          Sin incidencias recurrentes de gravedad en este periodo.
        </div>
      </div>`;

    // Calculate Monthly Evolution Trends for current year
    const trendLabels = [];
    const ratingTrendData = [];
    const volumeTrendData = [];
    const sortedMonths = [...availableMonths].sort((a, b) => a - b);
    for (const m of sortedMonths) {
      const monthName = new Date(activeYear, m - 1).toLocaleString('es-ES', { month: 'short' });
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      trendLabels.push(`${capMonth} ${activeYear}`);
      const statsM = DataLoader.computeBranchStats(activeYear, m, meta.id);
      ratingTrendData.push(statsM.count > 0 ? statsM.avg : null);
      volumeTrendData.push(statsM.count);
    }
    const nowUtcT = (() => { const n = BranchTime.nowMonth(); return { getUTCFullYear: () => n.y, getUTCMonth: () => n.m - 1 }; })();   // mes en curso en hora de CDMX
    const lastIsCurrentMonth = activeYear === nowUtcT.getUTCFullYear() && sortedMonths[sortedMonths.length - 1] === nowUtcT.getUTCMonth() + 1;
    const ratingStory = Narrative.ratingTrend(trendLabels, ratingTrendData, KpiMeta.ratingMinimo, lastIsCurrentMonth);
    const volumeStory = Narrative.volumeTrend(trendLabels, volumeTrendData, lastIsCurrentMonth);

    const sortedMonthsDesc = [...availableMonths].sort((a, b) => b - a);
    const customOptionsHtml = sortedMonthsDesc.map(m => {
      const monthName = new Date(activeYear, m - 1).toLocaleString('es-ES', { month: 'long' });
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const isActive = m === activeMonth ? ' active' : '';
      return `<div class="custom-option${isActive}" data-value="${m}" onclick="BranchView.selectMonthOption(${m})">${capMonth} ${activeYear}</div>`;
    }).join('');

    const dropdownHtml = `
      <div class="custom-select" id="branchMonthDropdown">
        <button class="custom-select-trigger" onclick="BranchView.toggleMonthDropdown(event)">
          <span class="custom-select-value">${capitalizedMonth} ${activeYear}</span>
          <svg class="custom-select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="custom-select-options">
          ${customOptionsHtml}
        </div>
      </div>
    `;

    // Mensaje de bienvenida personalizado (Idea 4)
    const userName = (typeof AppAuth !== 'undefined' && AppAuth.profile?.nombre) || 'Usuario';
    const userRole = (typeof AppAuth !== 'undefined' && AppAuth.getUserRole()) || 'gerente';
    // Atención inmediata: críticas recientes de esta sucursal (independiente del mes elegido)
    const nowUtc = (() => { const n = BranchTime.nowMonth(); return { getUTCFullYear: () => n.y, getUTCMonth: () => n.m - 1 }; })();   // mes en curso en hora de CDMX
    const recentCritical = Severity.criticalIn(
      Patterns.collect(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() + 1, 2, r => isSameBranch(r.sucursal, meta.id)), Severity.RECENT_DAYS);
    const attentionHtml = AttentionCard.html(Incidents.unresolved(recentCritical), { key: 'branch', scope: meta.nombre, incidentFilter: i => i.location_id === meta.id });

    const pendingCritical = reviews.filter(r => Metrics.isComplaint(r) && (!r.responseFromOwnerText || r.responseFromOwnerText.trim() === '')).length;

    let welcomeBannerHtml = '';
    if (userRole === 'gerente') {
      welcomeBannerHtml = `
        <div class="welcome-banner-gerente" style="margin-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 18px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--oro-ink); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Estatus de Operación</div>
          <div style="font-family: var(--sans); font-size: 18px; font-weight: 700; color: var(--banda-texto); margin-bottom: 4px;">¡Hola, ${userName}!</div>
          <div style="font-size: 13px; color: color-mix(in srgb, var(--banda-texto) 85%, transparent); line-height: 1.45;">
            Bienvenido, gerente de <strong>${meta.nombre}</strong>. Este mes tienes <strong>${pendingCritical}</strong> opiniones críticas pendientes por responder.
          </div>
        </div>
      `;
    } else {
      const roleMap = { corporate: 'Corporativo', admin: 'Administrador', director: 'Director', regional: 'Corporativo', zonal: 'Gerente zonal' };
      const roleLabel = roleMap[userRole] || userRole;
      welcomeBannerHtml = `
        <div class="welcome-banner-gerente" style="margin-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 18px;">
          <div style="font-family: var(--sans); font-size: 16px; font-weight: 700; color: var(--banda-texto); margin-bottom: 4px;">¡Hola, ${userName}!</div>
          <div style="font-size: 12.5px; color: color-mix(in srgb, var(--banda-texto) 70%, transparent); line-height: 1.4;">
            Sesión activa como <strong>${roleLabel}</strong>. Visualizando el desempeño de <strong>${meta.nombre}</strong>.
          </div>
        </div>
      `;
    }

    // Cluster de sucursales hermanas en la misma región
    const sisterBranches = (typeof SUCURSALES_META_ALL !== 'undefined' ? SUCURSALES_META_ALL : SUCURSALES_META)
      .filter(b => b.region === meta.region && b.id !== meta.id);
    const clusterPillsHtml = sisterBranches.length > 0 ? `
      <div class="cluster-nav-wrap">
        <span class="cluster-label">Sucursales de ${escapeHtml(getRegionName(meta.region))}:</span>
        ${sisterBranches.slice(0, 6).map(b => `<a href="#/sucursal/${b.id}" class="cluster-pill">${b.nombre}</a>`).join('')}
      </div>
    ` : '';

    // Generar Key Takeaways ejecutivos (TL;DR)
    const takeawayItems = [];
    takeawayItems.push(`Calificación promedio de <strong>${stats.avg > 0 ? stats.avg.toFixed(2) : '—'}★</strong> en ${capitalizedMonth} (${stats.count} reseñas procesadas).`);
    if (negativeReviews.length === 0) {
      takeawayItems.push(`<strong>Cero incidencias críticas:</strong> 100% de comentarios positivos o neutrales durante este periodo.`);
    } else {
      takeawayItems.push(`<strong>Foco de atención:</strong> ${negativeReviews.length} reseña(s) crítica(s) detectada(s), con énfasis en <em>${alertTheme}</em>.`);
    }
    takeawayItems.push(`Volumen mensual de reseñas <strong>${volDiff >= 0 ? `subió (+${volDiff})` : `varió (${volDiff})`}</strong> respecto al mes previo.`);

    const keyTakeawaysHtml = `
      <div class="key-takeaways-card">
        <div class="kt-header">
          <div class="kt-title-wrap">
            <div class="kt-icon-pill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <span class="kt-title">Lo principal del mes</span>
          </div>
          <span class="kt-badge">${capitalizedMonth} ${activeYear}</span>
        </div>
        <ul class="kt-list">
          ${takeawayItems.map(item => `
            <li class="kt-item">
              <span class="kt-bullet">✦</span>
              <span>${item}</span>
            </li>
          `).join('')}
        </ul>
        <div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button onclick="BranchView.shareExecutiveSummary()" class="btn-primary" style="padding: 6px 14px; font-size: 12px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: var(--verde); color: var(--sobre-acento); border: none; font-weight: 700;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            <span>Compartir Resumen</span>
          </button>
          <button onclick="Router.navigate('#/reporte/' + encodeURIComponent(BranchView.activeParams.id))" style="padding: 6px 14px; font-size: 12px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: var(--surface); color: var(--text); border: 1px solid var(--border); font-weight: 600;">
            <span>Reporte del mes</span>
          </button>
        </div>
      </div>
    `;

    // Schema JSON-LD de LocalBusiness / Bakery para la sucursal
    const branchSchemaJson = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Bakery",
      "name": `${CLIENTE.nombre} · ${meta.nombre}`,
      "branchOf": {
        "@type": "Organization",
        "name": CLIENTE.nombre
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": stats.avg > 0 ? stats.avg.toFixed(2) : meta.historico.toFixed(2),
        "reviewCount": stats.count > 0 ? stats.count : (meta.historicoCount || 10)
      }
    });

    document.getElementById('app').innerHTML = `
      <script type="application/ld+json" id="branch-schema-ld">
        ${branchSchemaJson}
      </script>
      ${buildTopbar(!isHomeMode, isHomeMode ? '' : meta.nombre)}
      <section class="branch-hero">
        ${welcomeBannerHtml}
        <div class="bh-eyebrow">
          <span>${getRegionName(activeRegion)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px;">
            <h1 class="bh-name" style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 4px; margin-top: 0;">
              ${meta.nombre}
              ${Rosa.anim(Rosa.deTienda(br.estado, br.senal, br.inicio, 'banda'), { size: 56, R: 40, tema: 'banda', cls: 'bh-rosa', luz: true, label: brLectura })}
            </h1>
            <p class="bh-brillo"><b>${escapeHtml(br.lectura)}</b>${br.senal ? ` · ${escapeHtml(Brillo.NOMBRE_SENAL[br.senal])}` : ''}${br.estado.id !== 'sin' && br.estado.fill < 1 ? ` · ${br.nTexto} de ${Brillo.N_MIN} reseñas con texto` : ''}</p>
            ${meta.isCinemex ? `<div style="margin-bottom: 4px;"><span class="bh-cinemex-badge">${svgIcon('cinema')} Cinemex</span></div>` : ''}
            ${dropdownHtml}
          </div>
          
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
            <a href="#/comparar?a=${meta.id}" class="btn-compare-link" style="padding: 10px 16px; font-size: 13px; height: 40px; border-radius: 12px; background: rgba(184, 144, 47, 0.16); color: var(--oro-ink); border: 1px solid rgba(184, 144, 47, 0.35); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all 0.2s ease;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              <span>Comparar Tienda</span>
            </a>
            <button class="print-btn-no-export" onclick="Router.navigate('#/reporte/' + encodeURIComponent(BranchView.activeParams.id))" style="padding: 10px 16px; font-size: 13px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.08); color: var(--banda-texto); border: 1px solid rgba(255,255,255,0.12); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              <span>Reporte del mes</span>
            </button>
            <button class="btn-primary" onclick="BranchView.shareExecutiveSummary()" style="padding: 10px 18px; font-size: 13px; height: 40px; border-radius: 12px; background: var(--verde); color: var(--sobre-acento); border: 1px solid rgba(255,255,255,0.08); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>Compartir</span>
            </button>
          </div>
        </div>
        ${clusterPillsHtml}
      </section>

      ${attentionHtml}

      ${keyTakeawaysHtml}

      <section class="section r">
        <div class="section-head">
          <h2 class="section-title" style="margin:0;">Indicadores <span class="accent">${capitalizedMonth}</span></h2>
          <span class="section-sub">Cómo va contra sus metas del mes</span>
        </div>
        ${scorecardSection}
        ${progressBannerHtml}
        ${problemSection}
      </section>

      <section class="section r">
        <div class="section-head">
          <div class="section-title">Insights <span class="accent">${capitalizedMonth}</span></div>
        </div>
        <div class="insight-grid">${insightsHtml}</div>
      </section>

      <section class="section r">
        <div class="section-head">
          <div class="section-title">Evolución de los indicadores <span class="accent">${activeYear}</span></div>
          <span class="section-sub">Tendencia histórica mensual de calificación y volumen</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px; box-shadow:var(--sombra-card);">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px; letter-spacing:0.05em;">Rating Promedio Mensual</div>
            <p class="story-line story-line--sm">${ratingStory}</p>
            <div style="height:180px; position:relative;">
              <div id="branchRatingTrendChart" style="width:100%;height:100%"></div>
            </div>
          </div>
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px; box-shadow:var(--sombra-card);">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px; letter-spacing:0.05em;">Volumen de Reseñas Mensual</div>
            <p class="story-line story-line--sm">${volumeStory}</p>
            <div style="height:180px; position:relative;">
              <div id="branchVolumeTrendChart" style="width:100%;height:100%"></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section r">
        <div class="section-head">
          <div class="section-title">Áreas de Oportunidad <span class="accent">${capitalizedMonth}</span></div>
          <span class="section-sub">Aspectos críticos a mejorar según quejas de 1 a 3 estrellas</span>
        </div>
        ${this._buildOpportunityAreas(reviews, meta.id)}
      </section>

      ${this._buildHourSection(meta, activeYear, activeMonth)}

      <section class="section r" id="reviewsSection">
        <div class="section-head" style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div class="section-title">Reseñas</div>
            <span class="section-sub">${reviews.filter(r => r.text && r.text.trim().length > 0).length} verificadas con texto en ${capitalizedMonth} · ${reviews.length} totales</span>
          </div>
        </div>
        <div class="reviews-panel">
          <div class="branch-feed-controls" style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 16px; padding: 12px; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div class="search-wrapper" style="max-width: 280px; width: 100%;">
              <span class="search-icon-svg">${svgIcon('search')}</span>
              <input type="text" id="branchFeedSearch" class="branch-search-input" placeholder="Buscar en esta tienda..." oninput="BranchView.filterBranchFeed(this.value)" value="${this.feedSearchQuery || ''}">
            </div>
            <div class="filter-row" style="margin: 0;">
              <button class="chip ${(!this.feedStarFilter || this.feedStarFilter === 'all') ? 'active' : ''}" onclick="BranchView.filterBranchStars('all')">Todas (${reviews.filter(r => r.text && r.text.trim().length > 0).length})</button>
              <button class="chip ${this.feedStarFilter === 'critical' ? 'active' : ''}" onclick="BranchView.filterBranchStars('critical')">Quejas ≤2★ (${reviews.filter(r => Metrics.isComplaint(r) && r.text && r.text.trim().length > 0).length})</button>
              <button class="chip ${this.feedStarFilter === '5' ? 'active' : ''}" onclick="BranchView.filterBranchStars('5')">5 ★ (${reviews.filter(r => r.stars === 5 && r.text && r.text.trim().length > 0).length})</button>
            </div>
          </div>
          <div class="reviews-list" id="revList">${this._buildRevList(this._getFilteredReviews(reviews))}</div>
          ${reviews.filter(r => r.text && r.text.trim().length > 0).length > 5 && !this.feedSearchQuery && (!this.feedStarFilter || this.feedStarFilter === 'all') ? `<button class="show-all-btn" id="showAllBtn">Mostrar todas las ${reviews.filter(r => r.text && r.text.trim().length > 0).length} reseñas ↓</button>` : ''}
        </div>
      </section>

      ${buildFooter(`${meta.nombre} · ${getRegionName(activeRegion)}`)}`;

    // Re-run progress bars animation and load charts after DOM insert
    requestAnimationFrame(() => {
      document.querySelectorAll('.kpi-progress-bar').forEach(bar => {
        const w = bar.style.width;
        bar.style.width = '0%';
        requestAnimationFrame(() => { bar.style.width = w; });
      });
      initReveal();

      // Render Evolution Trend Charts
      setTimeout(() => {
        const ratingCtx = document.getElementById('branchRatingTrendChart');
        const volumeCtx = document.getElementById('branchVolumeTrendChart');
        const color = EC.c('acento');

        if (ratingCtx) {
          EtoileCharts.branchRatingTrend(ratingCtx, trendLabels, ratingTrendData, color, i => BranchView.selectMonthOption(sortedMonths[i]));
        }
        if (volumeCtx) {
          EtoileCharts.branchVolumeTrend(volumeCtx, trendLabels, volumeTrendData, color, i => BranchView.selectMonthOption(sortedMonths[i]));
        }
        const hourEl = document.getElementById('branchHourChart');
        if (hourEl && this._hourData) EtoileCharts.hourComplaints(hourEl, this._hourData.h, this._hourData.hl, hr => HourDrawer.open(hr, this._hourData.h, meta.nombre));
      }, 100);

      // Montar Sticky Action Bar para móviles (Mobile-First)
      if (typeof MobileStickyBarManager !== 'undefined') {
        MobileStickyBarManager.mount({
          title: `${meta.nombre} · ${stats.avg > 0 ? `${stats.avg.toFixed(2)}★` : '—'}`,
          subtitle: `${capitalizedMonth} ${activeYear} · ${stats.count} reseñas`,
          primaryBtnText: 'Compartir',
          onPrimaryClick: () => BranchView.shareExecutiveSummary(),
          secondaryBtnText: 'Reporte',
          onSecondaryClick: () => Router.navigate('#/reporte/' + encodeURIComponent(meta.id))
        });
      }

      // Check for welcome onboarding / walkthrough (Idea 3)
      if (RECORRIDO_ACTIVO && localStorage.getItem('lcp_walkthrough_seen') !== 'true') {
        setTimeout(() => {
          if (typeof LcpWalkthrough !== 'undefined') {
            LcpWalkthrough.showWelcomeOnboarding(userName, userRole, meta.nombre);
          }
        }, 1000);
      }
    });

    // Close custom select on clicking outside
    const _clickOutsideHandler = (e) => {
      document.querySelectorAll('.custom-select.open').forEach(dropdown => {
        if (!dropdown.contains(e.target)) {
          dropdown.classList.remove('open');
        }
      });
    };
    document.removeEventListener('click', window._branchDropdownOutsideHandler);
    window._branchDropdownOutsideHandler = _clickOutsideHandler;
    document.addEventListener('click', _clickOutsideHandler);

    const btn = document.getElementById('showAllBtn');
    if (btn) {
      const reviewsConTexto = reviews.filter(r => r.text && r.text.trim().length > 0);
      let exp = false;
      btn.onclick = () => {
        exp = !exp;
        document.getElementById('revList').innerHTML = this._buildRevList(exp ? reviewsConTexto : reviewsConTexto.slice(0, 5));
        btn.textContent = exp ? '↑ Mostrar menos' : `Mostrar todas las ${reviewsConTexto.length} reseñas ↓`;
      };
    }
  },

  _buildInsights(meta, reviews, stats) {
    const allText = reviews.map(r => r.text ? r.text.toLowerCase() : '').join(' ');
    const items = [];
    const delta = stats.avg > 0 ? (stats.avg - meta.historico).toFixed(2) : '0.00';
    const trendTxt = Number(delta) > 0
      ? `+${delta} sobre histórico (${meta.historico.toFixed(1)})`
      : Number(delta) < 0
        ? `${delta} bajo histórico`
        : `Sin cambio vs ${meta.historico.toFixed(1)}`;
    items.push({ m: 'Δ', label: 'Tendencia', val: trendTxt, cls: 'gold' });

    if (/(amable|atentos?|servicio|atenci[oó]n|amabilidad)/.test(allText))
      items.push({ m: '01', label: 'Tema dominante', val: 'Atención y servicio al cliente' });
    if (/(rique?[aá]|delici|bueno|sabor|rico|exquisit)/.test(allText))
      items.push({ m: '02', label: 'Producto', val: 'Sabor y calidad mencionados positivamente' });

    const employeesMap = {};
    reviews.forEach(r => {
      if (r.classification && Array.isArray(r.classification.empleados_mencionados)) {
        r.classification.empleados_mencionados.forEach(emp => {
          if (emp && emp.nombre) {
            const normalizedName = emp.nombre.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
            const confidence = emp.confianza || 'media';
            if (confidence === 'alta') {
              employeesMap[normalizedName] = (employeesMap[normalizedName] || 0) + 1;
            }
          }
        });
      }
    });
    let names = Object.keys(employeesMap).sort((a, b) => employeesMap[b] - employeesMap[a]);
    if (!names.length) {
      names = [...new Set((allText.match(/\b(valentina|osvaldo|oswaldo|arely|vale|areli|daniela|ulises|ale|amanda|bryan|brayan|roman|sergio|jacqueline|valeria|gael|alejandra|brandon|dylan|iker|denisse|andy|paulina|victor|cesar|lizbeth)\b/g) || []))]
        .map(n => n[0].toUpperCase() + n.slice(1));
    }
    if (names.length) items.push({ m: '03', label: 'Personal destacado', val: names.join(' · ') });

    if (/(r[aá]pido|tiempo|eficiente|rapidez)/.test(allText))
      items.push({ m: '04', label: 'Operación', val: 'Rapidez y eficiencia comentadas' });

    const guides = reviews.filter(r => r.isLocalGuide).length;
    if (guides) items.push({ m: 'LG', label: 'Local Guides', val: `${guides} de ${reviews.length} reseñas son de Local Guides` });

    if (items.length === 1) {
       items.push({ m: '--', label: 'Sin insights de texto', val: 'Las reseñas del mes no contienen suficientes palabras clave.'});
    }

    return items.slice(0, 5).map(t => `
      <div class="insight-card">
        <span class="insight-marker ${t.cls || ''}">${t.m}</span>
        <div><div class="insight-label">${t.label}</div><div class="insight-val">${t.val}</div></div>
      </div>`).join('');
  },

  _buildOpportunityAreas(reviews, branchId) {
    const negativeReviews = reviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);

    let serviceCount = 0;
    let qualityCount = 0;
    let valueCount = 0;

    negativeReviews.forEach(r => {
      if (r.classification && typeof r.classification.es_queja === 'boolean') {
        if (r.classification.es_queja) {
          const cat = r.classification.categoria_queja;
          if (cat) {
            if (cat.servicio) serviceCount++;
            if (cat.calidad) qualityCount++;
            if (cat.valor) valueCount++;
          }
        }
      } else {
        const hasService = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.servicio);
        const hasQuality = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.calidad);
        const hasValue = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.valor);
        if (hasService) serviceCount++;
        if (hasQuality) qualityCount++;
        if (hasValue) valueCount++;
      }
    });

    const getSeverity = (count) => {
      if (count > 2) return { cls: 'critical', tag: 'Crítico' };
      if (count > 0) return { cls: 'attention', tag: 'Atención' };
      return { cls: 'optimal', tag: 'Óptimo' };
    };

    const serviceSev = getSeverity(serviceCount);
    const qualitySev = getSeverity(qualityCount);
    const valueSev = getSeverity(valueCount);

    const serviceDesc = serviceCount > 0
      ? `Se detectaron <strong>${serviceCount}</strong> comentarios señalando demoras o detalles en la atención (ej. meseros, tiempos de espera).`
      : 'Sin incidencias reportadas sobre tiempos de espera o atención al cliente.';
    
    const qualityDesc = qualityCount > 0
      ? `Se registraron <strong>${qualityCount}</strong> menciones sobre calidad de producto, temperatura de alimentos o higiene.`
      : 'Sin incidencias reportadas sobre el sabor, temperatura o higiene de los alimentos.';

    const valueDesc = valueCount > 0
      ? `Se identificaron <strong>${valueCount}</strong> opiniones cuestionando la relación valor-precio o el tamaño de las porciones.`
      : 'Sin quejas relativas al precio o tamaño de las porciones.';

    const serviceRec = serviceCount > 2
      ? 'Revisar tiempos de despacho y reentrenar al personal en servicio al cliente urgente. Posible falta de personal en horas pico.'
      : serviceCount > 0
        ? 'Monitorear la velocidad de entrega y recordar al equipo el protocolo de bienvenida y trato al cliente.'
        : 'Mantener el estándar actual. Reforzar el reconocimiento al equipo por el excelente trato.';

    const qualityRec = qualityCount > 2
      ? 'Auditar urgentemente la temperatura de los platos, recetas y protocolo de limpieza en cocina. Posible falla en control de calidad.'
      : qualityCount > 0
        ? 'Revisar la temperatura de salida de las crepas y asegurar el apego a la receta estándar.'
        : 'Mantener la constancia en sabor y presentación. Asegurar que las estaciones de trabajo sigan impecables.';

    const valueRec = valueCount > 2
      ? 'Evaluar la relación valor-precio. Garantizar que el gramaje de los ingredientes coincida exactamente con la ficha técnica.'
      : valueCount > 0
        ? 'Asegurar que la presentación de los platos justifique el ticket y vigilar el porcionamiento estándar.'
        : 'El valor percibido es adecuado. Continuar con la consistencia del tamaño y calidad del producto.';

    const serviceAttr = serviceCount > 0
      ? `class="proactive-alert-card ${serviceSev.cls} alert-card-interactive" onclick="BranchView.openProblemCategoryModal('servicio', '${branchId}')" title="Haz clic para auditar comentarios de servicio"`
      : `class="proactive-alert-card ${serviceSev.cls}"`;

    const qualityAttr = qualityCount > 0
      ? `class="proactive-alert-card ${qualitySev.cls} alert-card-interactive" onclick="BranchView.openProblemCategoryModal('calidad', '${branchId}')" title="Haz clic para auditar comentarios de producto"`
      : `class="proactive-alert-card ${qualitySev.cls}"`;

    const valueAttr = valueCount > 0
      ? `class="proactive-alert-card ${valueSev.cls} alert-card-interactive" onclick="BranchView.openProblemCategoryModal('precio', '${branchId}')" title="Haz clic para auditar comentarios de precio"`
      : `class="proactive-alert-card ${valueSev.cls}"`;

    return `
      <div class="proactive-alerts-grid">
        <div ${serviceAttr}>
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">${svgIcon(serviceCount > 0 ? 'alert' : 'check')}</span>
              <span class="pac-branch">Servicio y Atención</span>
            </div>
            <span class="pac-tag">${serviceSev.tag}</span>
          </div>
          <p class="pac-desc">${serviceDesc}</p>
          <div class="pac-action-box">
            <strong>Recomendación:</strong> ${serviceRec}
          </div>
        </div>

        <div ${qualityAttr}>
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">${svgIcon(qualityCount > 0 ? 'alert' : 'check')}</span>
              <span class="pac-branch">Calidad y Limpieza</span>
            </div>
            <span class="pac-tag">${qualitySev.tag}</span>
          </div>
          <p class="pac-desc">${qualityDesc}</p>
          <div class="pac-action-box">
            <strong>Recomendación:</strong> ${qualityRec}
          </div>
        </div>

        <div ${valueAttr}>
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">${svgIcon(valueCount > 0 ? 'alert' : 'check')}</span>
              <span class="pac-branch">Precio y Porción</span>
            </div>
            <span class="pac-tag">${valueSev.tag}</span>
          </div>
          <p class="pac-desc">${valueDesc}</p>
          <div class="pac-action-box">
            <strong>Recomendación:</strong> ${valueRec}
          </div>
        </div>
      </div>
    `;
  },

  _buildRevList(reviews) {
    if (!reviews.length) {
      const activeYear = DataLoader.currentYear;
      const activeMonth = DataLoader.currentMonth;
      const availableMonths = DataLoader.manifest[activeYear] || [];
      const sortedMonths = [...availableMonths].sort((a, b) => b - a);
      const currentIdx = sortedMonths.indexOf(activeMonth);
      let prevMonthInManifest = null;
      if (currentIdx !== -1 && currentIdx < sortedMonths.length - 1) {
        prevMonthInManifest = sortedMonths[currentIdx + 1];
      }
      
      const monthName = new Date(activeYear, activeMonth - 1).toLocaleString('es-ES', { month: 'long' });
      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      
      const actionAttr = prevMonthInManifest ? `onclick="BranchView.selectMonthOption(${prevMonthInManifest})"` : '';
      const actionLabel = prevMonthInManifest ? 'Ver mes anterior' : '';
      
      return typeof emptyState !== 'undefined' ? emptyState({
        title: `Sin reseñas en ${capitalizedMonth}`,
        hint: 'Las reseñas se sincronizan desde Google Maps de manera programada.',
        actionLabel: actionLabel,
        actionAttr: actionAttr
      }) : `<div class="empty-state">Sin reseñas para mostrar en este mes</div>`;
    }
    return ReviewCard.list(reviews, { showBranch: false, onclick: r => `HomeView.openReviewDetailModal('${r.globalId}')` });
  },

  toggleMonthDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('branchMonthDropdown');
    if (dropdown) {
      dropdown.classList.toggle('open');
    }
  },

  async selectMonthOption(month) {
    const dropdown = document.getElementById('branchMonthDropdown');
    if (dropdown) {
      dropdown.classList.remove('open');
    }
    const activeYear = DataLoader.currentYear;
    DataLoader.setMonth(activeYear, month);
    await this.render(this.activeParams);
    initReveal();
  },

  openProblemCategoryModal(category, branchId) {
    const activeYear = DataLoader.currentYear;
    const activeMonth = DataLoader.currentMonth;
    const branchReviews = DataLoader.getReviewsForBranch(activeYear, activeMonth, branchId);
    
    let regex;
    let title;
    let checkFn;
    if (category === 'servicio') {
      regex = /mesero|lento|espera|atenci[oó]n|servicio|tade|tarde|tardaron|trato|amabilidad/i;
      title = 'Opiniones sobre Servicio y Atención';
      checkFn = (r) => r.classification?.categoria_queja?.servicio;
    } else if (category === 'calidad') {
      regex = /sabor|fr[ií]o|sucio|malo|crudo|calidad|ingrediente|pelo/i;
      title = 'Opiniones sobre Calidad y Limpieza';
      checkFn = (r) => r.classification?.categoria_queja?.calidad;
    } else if (category === 'precio') {
      regex = /caro|precio|porci[oó]n|costo|tama[ñn]o|car[ií]simo|cantidad/i;
      title = 'Opiniones sobre Precio y Porción';
      checkFn = (r) => r.classification?.categoria_queja?.valor;
    }
    
    const categoryKey = category === 'precio' ? 'valor' : category;
    const matchedReviews = branchReviews.filter(r => {
      if (!r.text) return false;
      if (r.classification && typeof r.classification.es_queja === 'boolean') {
        return checkFn(r);
      }
      return classifyReviewCategory(r.text, COMPLAINT_KEYWORDS[categoryKey] || []);
    });
    this.openProblemDetailModal(title, matchedReviews);
  },

  _getFilteredReviews(reviews) {
    let list = reviews.filter(r => r.text && r.text.trim().length > 0);
    if (this.feedStarFilter === 'critical') {
      list = list.filter(r => Metrics.isComplaint(r));
    } else if (this.feedStarFilter === '5') {
      list = list.filter(r => r.stars === 5);
    }
    if (this.feedSearchQuery) {
      const q = this.feedSearchQuery.toLowerCase();
      list = list.filter(r => r.text.toLowerCase().includes(q));
    }
    return (this.feedSearchQuery || (this.feedStarFilter && this.feedStarFilter !== 'all') ) ? list : list.slice(0, 5);
  },

  filterBranchFeed(query) {
    this.feedSearchQuery = query;
    this._updateRevListDOM();
  },

  filterBranchStars(filter) {
    this.feedStarFilter = filter;
    this._updateRevListDOM();
  },

  _updateRevListDOM() {
    const activeYear = DataLoader.currentYear;
    const activeMonth = DataLoader.currentMonth;
    const meta = getBranchById(this.activeParams?.id);
    if (!meta) return;
    const reviews = DataLoader.getReviewsForBranch(activeYear, activeMonth, meta.id);
    const container = document.getElementById('revList');
    if (container) {
      container.innerHTML = this._buildRevList(this._getFilteredReviews(reviews));
    }
    const chipRow = document.querySelector('.branch-feed-controls .filter-row');
    if (chipRow) {
      const chips = chipRow.querySelectorAll('.chip');
      const activeFilter = this.feedStarFilter || 'all';
      chips.forEach(chip => {
        const onClickAttr = chip.getAttribute('onclick') || '';
        if (onClickAttr.includes(`'${activeFilter}'`)) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }
  },

  /** ¿A qué hora llegan las quejas? Últimos 12 meses de la sucursal, en la hora local de la tienda */
  _buildHourSection(meta, year, month) {
    const reviews = Patterns.collect(year, month, 12, r => isSameBranch(r.sucursal, meta.id));
    const h = Patterns.hourly(reviews);
    const hl = Patterns.headline(h);
    this._hourData = { h, hl };
    return `
      <section class="section r">
        <div class="section-head">
          <div class="section-title">¿A qué hora llegan las quejas? <span class="accent">12 meses</span></div>
          <span class="section-sub">Quejas de 1-2★ con texto, por hora local de la tienda (24 h)</span>
        </div>
        <p class="story-line${hl.concentrated ? ' is-alert' : ''}">${hl.text}</p>
        <div class="chart-card"><div class="chart-wrap" style="height:260px"><div id="branchHourChart" style="width:100%;height:100%"></div></div></div>
        <div class="story-foot">${h.nNeg} quejas de ${h.n} reseñas con texto · las horas son las de la tienda, no las de tu dispositivo</div>
      </section>`;
  },

  openProblemDetailModal(title, reviews) {
    Drawer.open({
      id: 'problemDetailModal',
      title,
      subtitle: reviews.length ? `${reviews.length} opinión${reviews.length !== 1 ? 'es' : ''} en esta categoría` : '',
      bodyHtml: reviews.length
        ? ReviewCard.list(reviews, { showBranch: false })
        : '<p class="drawer-empty">No hay opiniones en esta categoría.</p>'
    });
  },

  closeProblemDetailModal() {
    Drawer.close('problemDetailModal');
  },

  renderSkeleton() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = `
      ${buildTopbar(true, 'Cargando...')}
      <div style="max-width:1200px; margin:0 auto; padding:24px; box-sizing:border-box; display:flex; flex-direction:column; gap:24px;">
        <div class="skeleton" style="height: 120px; border-radius: 20px;"></div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;">
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
          <div class="skeleton" style="height: 110px; border-radius: 14px;"></div>
        </div>
        <div class="skeleton" style="height: 300px; border-radius: 20px;"></div>
      </div>
    `;
  },

  async shareExecutiveSummary() {
    const meta = getBranchById(this.activeParams.id);
    if (!meta) return;
    const activeYear = DataLoader.currentYear;
    const activeMonth = DataLoader.currentMonth;
    const reviews = DataLoader.getReviewsForBranch(activeYear, activeMonth, meta.id);
    const stats = DataLoader.computeBranchStats(activeYear, activeMonth, meta.id);
    
    // Calcular quejas y pendientes
    const negatives = reviews.filter(r => r.stars <= 3);
    const unreplied = negatives.filter(r => !r.responseFromOwnerText || r.responseFromOwnerText.trim().length === 0).length;

    // Calcular categorías de quejas heurísticas
    let serviceCount = 0;
    let qualityCount = 0;
    let valueCount = 0;
    const negativeReviews = reviews.filter(r => r.stars <= 3 && r.text && r.text.trim().length > 0);

    negativeReviews.forEach(r => {
      if (r.classification && typeof r.classification.es_queja === 'boolean') {
        if (r.classification.es_queja) {
          const cat = r.classification.categoria_queja;
          if (cat) {
            if (cat.servicio) serviceCount++;
            if (cat.calidad) qualityCount++;
            if (cat.valor) valueCount++;
          }
        }
      } else {
        const hasService = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.servicio);
        const hasQuality = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.calidad);
        const hasValue = classifyReviewCategory(r.text, COMPLAINT_KEYWORDS.valor);
        if (hasService) serviceCount++;
        if (hasQuality) qualityCount++;
        if (hasValue) valueCount++;
      }
    });

    let topTheme = '';
    if (negativeReviews.length > 0) {
      const themes = [];
      if (serviceCount > 0) themes.push(`Servicio (${serviceCount})`);
      if (qualityCount > 0) themes.push(`Calidad (${qualityCount})`);
      if (valueCount > 0) themes.push(`Valor (${valueCount})`);
      if (themes.length > 0) {
        topTheme = themes.join(', ');
      } else {
        topTheme = 'Otros';
      }
    }

    const monthName = new Date(activeYear, activeMonth - 1).toLocaleString('es-ES', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    const statsObj = {
      avg: stats.avg,
      totalReviews: stats.count,
      negatives: negatives.length,
      unreplied: unreplied,
      topTheme: topTheme,
      monthLabel: `${capitalizedMonth} ${activeYear}`
    };

    if (typeof buildBranchSummary === 'function' && typeof shareSummary === 'function') {
      const text = buildBranchSummary(meta, statsObj);
      const shareResult = await shareSummary(text);
      
      if (shareResult === 'copied') {
        if (typeof ToastManager !== 'undefined') {
          ToastManager.show({ type: 'success', message: 'Resumen copiado al portapapeles. ¡Listo para compartir!' });
        } else if (typeof Toast !== 'undefined') {
          Toast.show('Resumen copiado al portapapeles. ¡Listo para compartir!', 3000);
        }
      } else if (shareResult === 'shared') {
        if (typeof ToastManager !== 'undefined') {
          ToastManager.show({ type: 'success', message: 'Resumen compartido con éxito' });
        } else if (typeof Toast !== 'undefined') {
          Toast.show('Resumen compartido con éxito', 2500);
        }
      } else {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
      }
    }
  }
};
