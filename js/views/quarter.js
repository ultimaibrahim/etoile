/**
 * views/quarter.js — Vista trimestral con acordeón, ranking y comparativas.
 */

const QuarterView = {
  async render(params) {
    try {
    const defaultQParam = `${new Date().getFullYear()}-Q1`;
    const qParam = parseQuarterParam((params && params.q) || defaultQParam);
    if (!qParam) {
      Router.navigate('#/');
      return;
    }

    const { year, quarter } = qParam;
    const months = getQuarterMonths(quarter);

    // Cargar estadísticas trimestrales agregadas
    const qStats = await DataLoader.loadQuarterStats(year, quarter);

    // Cargar todos los meses del trimestre en paralelo para detalles secundarios (acordeones/evolución)
    await Promise.all(months.map(m => DataLoader.loadMonth(year, m)));

    // Cargar trimestre anterior para comparativa en paralelo
    const prevQ = quarter > 1 ? quarter - 1 : null;
    const prevMonths = prevQ ? getQuarterMonths(prevQ) : [];
    await Promise.all(
      prevMonths
        .filter(m => DataLoader.hasMonth(year, m))
        .map(m => DataLoader.loadMonth(year, m))
    );

    // Ranking del trimestre
    const branchQStats = SUCURSALES_META.map(meta => {
      const dbStat = qStats.find(qs => qs.sucursalId === meta.id);
      
      const qAvg = dbStat ? dbStat.avgRating : 0;
      const totalCount = dbStat ? dbStat.totalReviews : 0;
      const totalNeg = dbStat ? dbStat.negativeReviews : 0;

      const monthVals = [];
      for (const m of months) {
        const stats = DataLoader.computeBranchStats(year, m, meta.id);
        monthVals.push({ month: m, avg: stats.avg, count: stats.count });
      }

      // Obtener mejor y peor reseña del trimestre de los meses cargados
      let allRevs = [];
      for (const m of months) {
        allRevs = allRevs.concat(DataLoader.getReviewsForBranch(year, m, meta.id));
      }
      const best = allRevs.length ? allRevs.reduce((a, b) => a.stars >= b.stars ? a : b) : null;
      const worst = allRevs.length ? allRevs.reduce((a, b) => a.stars <= b.stars ? a : b) : null;

      return { ...meta, qAvg, totalCount, totalNeg, monthVals, best, worst };
    }).sort((a, b) => b.qAvg - a.qAvg);

    // Quarter comparison
    let prevQAvg = null;
    if (prevQ) {
      let pStars = 0, pCount = 0;
      for (const m of prevMonths) {
        const g = DataLoader.getGlobalStats(year, m);
        pStars += g.avgRating * g.totalReviews;
        pCount += g.totalReviews;
      }
      prevQAvg = pCount > 0 ? pStars / pCount : 0;
    }

    const currQTotal = branchQStats.reduce((a, b) => a + b.totalCount, 0);
    const currQAvg = branchQStats.reduce((a, b) => a + b.qAvg * b.totalCount, 0) / (currQTotal || 1);

    const rankingRows = branchQStats.map((s, i) => {
      const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const delta = s.qAvg - s.historico;
      const dClass = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
      const dStr = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
      // Estado con los cortes de la marca (marca.md: brilla ≥ 4.60, tenue ≥ 4.30), los mismos de la ficha y del cielo
      const fase = s.totalCount ? Brillo.fase(s.qAvg) : 'sin';
      const status = { brilla: 'optimal', tenue: 'attention', apaga: 'critical', sin: 'attention' }[fase];
      const nombreFase = { brilla: 'Brilla', tenue: 'Tenue', apaga: 'Se apaga', sin: 'Sin reseñas' }[fase];
      return `
        <tr>
          <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
          <td><strong>${s.nombre}</strong></td>
          <td class="num">${s.qAvg.toFixed(2)}</td>
          <td class="num">${s.totalCount}</td>
          <td class="num">${s.totalNeg}</td>
          <td><span class="badge badge-${status}" style="display:inline-flex;align-items:center;gap:6px;">${Rosa.html(fase, { size: 14 })}${nombreFase}</span></td>
          <td class="num"><span class="sc-delta ${dClass}">${dStr}</span></td>
        </tr>`;
    }).join('');

    const evolutionRows = branchQStats.map(s => {
      const cells = s.monthVals.map(mv => {
        const val = mv.count > 0 ? mv.avg.toFixed(2) : '—';
        return `<td class="num">${val}</td>`;
      }).join('');
      const prevCells = prevMonths.map(pm => {
        const stats = DataLoader.computeBranchStats(year, pm, s.id);
        const val = stats.count > 0 ? stats.avg.toFixed(2) : '—';
        return `<td class="num" style="color:var(--text-dim);">${val}</td>`;
      }).join('');
      return `<tr><td><strong>${s.abr}</strong></td>${prevCells}${cells}<td class="num" style="font-weight:700;">${s.qAvg.toFixed(2)}</td></tr>`;
    }).join('');

    const prevHeaders = prevMonths.map(m => `<th class="num">${MONTH_NAMES[m - 1]}</th>`).join('');
    const currHeaders = months.map(m => `<th class="num">${MONTH_NAMES[m - 1]}</th>`).join('');

    // Accordion content for each month
    const accordionItems = months.map((m, i) => {
      let mTotalCount = 0;
      let mTotalNeg = 0;
      let mTotalStars = 0;
      
      const mRanking = SUCURSALES_META.map(meta => {
        const stats = DataLoader.computeBranchStats(year, m, meta.id);
        mTotalCount += stats.count;
        mTotalNeg += stats.negativeCount;
        mTotalStars += stats.avg * stats.count;
        return { ...meta, avg: stats.avg, count: stats.count, neg: stats.negativeCount };
      }).sort((a, b) => b.avg - a.avg);

      const mAvg = mTotalCount > 0 ? mTotalStars / mTotalCount : 0;
      
      const monthData = DataLoader.getMonth(year, m);
      const mReviews = monthData ? monthData.reviews : [];
      const mTexted = mReviews.filter(r => Metrics.hasText(r));   // la cita destacada siempre es una reseña con texto
      const mBest = mTexted.length ? mTexted.reduce((a, b) => a.stars >= b.stars ? a : b) : null;
      const mWorst = mTexted.length ? mTexted.reduce((a, b) => a.stars <= b.stars ? a : b) : null;

      const bestBlock = mBest ? `
        <div class="quote-block">
          <div class="quote-meta">★ ${mBest.stars} · ${escapeHtml(mBest.sucursal)} · ${reviewWhen(mBest, 'long')}</div>
          "${escapeHtml((mBest.text || '').substring(0, 200))}${(mBest.text || '').length > 200 ? '...' : ''}"
        </div>` : '<p style="color:var(--text-muted);font-size:13px;">Sin reseñas destacadas</p>';
      
      const worstBlock = mWorst && Metrics.isComplaint(mWorst) ? `
        <div class="quote-block warn">
          <div class="quote-meta">★ ${mWorst.stars} · ${escapeHtml(mWorst.sucursal)} · ${reviewWhen(mWorst, 'long')}</div>
          "${escapeHtml((mWorst.text || '').substring(0, 200))}${(mWorst.text || '').length > 200 ? '...' : ''}"
        </div>` : '';

      return `
        <div class="accordion-item">
          <div class="accordion-header" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.accordion-chevron').classList.toggle('open')">
            <div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="accordion-title">${MONTH_NAMES[m - 1]} ${year}</span>
              </div>
              <div class="accordion-sub">${mTotalCount} reseñas · Promedio ${mAvg.toFixed(2)} · ${mTotalNeg} negativas</div>
            </div>
            <span class="accordion-chevron">▾</span>
          </div>
          <div class="accordion-body">
            <div style="display:grid;gap:12px;margin-bottom:16px;">
              <div class="scorecard-grid" style="grid-template-columns:repeat(3,1fr);gap:10px;">
                <div class="scorecard" style="padding:14px;">
                  <div class="sc-label">Promedio Regional</div>
                  <div class="sc-value num ${mAvg >= 4.8 ? 'gold' : mAvg >= 4.5 ? '' : 'down'}">${mAvg.toFixed(2)}</div>
                </div>
                <div class="scorecard" style="padding:14px;">
                  <div class="sc-label">Reseñas Totales</div>
                  <div class="sc-value num">${mTotalCount}</div>
                </div>
                <div class="scorecard" style="padding:14px;">
                  <div class="sc-label">Reseñas Negativas</div>
                  <div class="sc-value num ${mTotalNeg > 0 ? 'down' : 'up'}">${mTotalNeg}</div>
                </div>
              </div>
              
              <div>
                <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:8px;">Ranking del mes</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                  ${mRanking.map((s, idx) => {
                    if (s.count === 0) return '';
                    const badgeClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
                    return `<div style="background: var(--bg-card); border: 1px solid var(--border); padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 13px;">
                      ${badgeClass ? `<span class="rank-badge ${badgeClass}" style="width: 16px; height: 16px; font-size: 9px;">${idx + 1}</span>` : `<span style="color: var(--text-dim); font-weight: 600; width: 16px; text-align: center;">${idx + 1}</span>`}
                      <span>${s.abr}</span>
                      <strong class="num">${s.avg.toFixed(2)}</strong>
                    </div>`;
                  }).join('')}
                </div>
              </div>

              <div style="margin-top: 8px;">
                <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:8px;">Mejor reseña de ${MONTH_NAMES[m - 1]}</div>
                ${bestBlock}
              </div>
              ${worstBlock ? `<div>
                <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--alerta-ink);font-weight:700;margin-bottom:8px;">Peor reseña de ${MONTH_NAMES[m - 1]}</div>
                ${worstBlock}
              </div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    document.getElementById('app').innerHTML = `
      ${buildTopbar(true, `Trimestre Q${quarter} ${year}`)}
      <section class="hero" style="padding:48px 22px 80px;">
        <div class="hero-inner">
          <div class="hero-left">
            <div class="hero-label-row">
              <span class="eyebrow" style="color:color-mix(in srgb, var(--banda-texto) 80%, transparent);">Comparativa Trimestral</span>
            </div>
            <h1 class="display" style="font-size:clamp(48px,10vw,96px);color:var(--banda-texto);line-height:1;">Q${quarter} ${year}</h1>
            <div style="display:flex;gap:18px;margin-top:18px;flex-wrap:wrap;">
              <div class="hero-stat" style="background:color-mix(in srgb, var(--banda-texto) 6%, transparent);border:1px solid color-mix(in srgb, var(--banda-texto) 10%, transparent);border-radius:12px;padding:14px 16px;">
                <span class="hero-stat-val num">${currQAvg.toFixed(2)}</span>
                <div class="hero-stat-info">
                  <span class="hero-stat-label">Promedio regional</span>
                </div>
              </div>
              <div class="hero-stat" style="background:color-mix(in srgb, var(--banda-texto) 6%, transparent);border:1px solid color-mix(in srgb, var(--banda-texto) 10%, transparent);border-radius:12px;padding:14px 16px;">
                <span class="hero-stat-val num">${currQTotal}</span>
                <div class="hero-stat-info">
                  <span class="hero-stat-label">Reseñas totales</span>
                </div>
              </div>
              ${prevQAvg ? `
              <div class="hero-stat" style="background:color-mix(in srgb, var(--banda-texto) 6%, transparent);border:1px solid color-mix(in srgb, var(--banda-texto) 10%, transparent);border-radius:12px;padding:14px 16px;">
                <span class="hero-stat-val num">${prevQAvg.toFixed(2)}</span>
                <div class="hero-stat-info">
                  <span class="hero-stat-label">Q${prevQ} anterior</span>
                  <span class="hero-stat-sub">Δ ${(currQAvg - prevQAvg) > 0 ? '+' : ''}${(currQAvg - prevQAvg).toFixed(2)}</span>
                </div>
              </div>` : ''}
            </div>
          </div>
        </div>
      </section>

      <section class="section r">
        <div class="section-head">
          <div class="section-title">Ranking <span class="accent">Q${quarter}</span></div>
        </div>
        <div class="chart-card" style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sucursal</th>
                <th class="num">Promedio</th>
                <th class="num">Reseñas</th>
                <th class="num">Negativas</th>
                <th>Estado</th>
                <th class="num">Δ Hist</th>
              </tr>
            </thead>
            <tbody>
              ${rankingRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section r">
        <div class="section-head">
          <div class="section-title">Evolución <span class="accent">mensual</span></div>
        </div>
        <div class="chart-card" style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Sucursal</th>
                ${prevHeaders}
                ${currHeaders}
                <th class="num">Prom Q${quarter}</th>
              </tr>
            </thead>
            <tbody>
              ${evolutionRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section r">
        <div class="section-head">
          <div class="section-title">Detalle <span class="accent">por mes</span></div>
        </div>
        ${accordionItems}
      </section>

      ${buildFooter(getRegionName(activeRegion))}`;
    } catch (err) {
      console.error('Error al renderizar vista trimestral:', err);
      document.getElementById('app').innerHTML = `
        ${buildTopbar(true, 'Error')}
        <section class="section" style="padding: 80px 24px; text-align: center;">
          <div style="max-width: 480px; margin: 0 auto;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">No se pudo cargar el reporte trimestral</h2>
            <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
              Puede que no haya datos suficientes para este trimestre en la región seleccionada, o que la conexión a la base de datos haya fallado.
            </p>
            <a href="#/" class="reporte-especial-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; background: var(--verde); color: var(--sobre-acento); border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 13px;">
              ← Volver al inicio
            </a>
          </div>
        </section>`;
    }
  }
};
