/**
 * kpis.js — Cálculo de KPIs con cacheo inteligente en localStorage.
 */

function computeReviewsHash(reviews) {
  const str = reviews.map(r => `${r.stars}|${r.text?.length || 0}|${r.publishedAtDate}`).join(';');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

const KpiStore = {
  prefix: 'lcp_kpis_v4_',

  _key(year, month) {
    return `${this.prefix}${year}_${String(month).padStart(2, '0')}`;
  },

  get(year, month) {
    try {
      const raw = localStorage.getItem(this._key(year, month));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  set(year, month, data) {
    try {
      localStorage.setItem(this._key(year, month), JSON.stringify(data));
    } catch (e) {
      console.warn('KPI cache failed:', e);
    }
  },

  shouldCompute(year, month) {
    if (!isMonthComplete(year, month)) {
      const cached = this.get(year, month);
      if (cached && cached.computedAt) {
        const cachedDate = new Date(cached.computedAt).toISOString().split('T')[0];
        const todayDate = new Date().toISOString().split('T')[0];
        if (cachedDate === todayDate) return false;
      }
      return true; // Mes en curso: recalcular si no es del mismo día
    }
    if (!this.get(year, month)) return true; // Mes cerrado sin cache: calcular
    return false; // Mes cerrado con cache: usar cache
  }
};

const Kpis = {
  async computeMonth(year, month) {
    await DataLoader.loadMonth(year, month);
    const data = DataLoader.getMonth(year, month);
    const reviews = data ? data.reviews : [];

    const currentHash = computeReviewsHash(reviews);
    const cached = KpiStore.get(year, month);
    if (cached && cached.global && cached.global.totalReviews === reviews.length && cached.global.reviewsHash === currentHash) {
      return cached;
    }

    const allStats = DataLoader.getAllBranchStats(year, month);
    const global = DataLoader.getGlobalStats(year, month);

    // Volumen
    const volumenOk = Object.entries(allStats).filter(([id, s]) => s.count >= KpiMeta.volumenMeta).length;
    const volumenTotal = SUCURSALES_META.length;

    // Calidad de texto: reseñas positivas (4-5★) que tienen texto substantivo
    // Definición acordada: cuántas reseñas positivas incluyen un comentario real
    const positivas = reviews.filter(r => r.stars >= 4);
    const positivasConTexto = positivas.filter(r => r.text && r.text.trim().length > 5).length;
    const calidadRatio = positivas.length ? positivasConTexto / positivas.length : 0;

    // Rating mínimo
    const ratings = Object.entries(allStats).map(([id, s]) => ({ id, avg: s.avg }));
    const belowMin = ratings.filter(r => r.avg > 0 && r.avg < KpiMeta.ratingMinimo);

    // Negativas
    const negativasReviews = reviews.filter(r => Metrics.isComplaint(r));
    const totalNegativas = negativasReviews.length;

    // Tasa de respuesta
    const negativasConRespuesta = negativasReviews.filter(r => r.responseFromOwnerText !== null && r.responseFromOwnerText !== undefined);
    const tasaRespuesta = totalNegativas ? negativasConRespuesta.length / totalNegativas : 1;

    const result = {
      year, month,
      computedAt: new Date().toISOString(),
      volumen: { ok: volumenOk, total: volumenTotal, meta: KpiMeta.volumenMeta },
      calidadTexto: { withText: positivasConTexto, total: positivas.length, ratio: calidadRatio, meta: KpiMeta.calidadTextoMeta },
      ratingMinimo: { belowMin: belowMin.map(r => r.id), meta: KpiMeta.ratingMinimo },
      negativas: totalNegativas,
      tasaRespuesta: { value: tasaRespuesta, totalNegativas, conRespuesta: negativasConRespuesta.length },
      global: { totalReviews: global.totalReviews, avgRating: global.avgRating, reviewsHash: currentHash }
    };

    KpiStore.set(year, month, result);
    return result;
  },

  badge(kpiValue, metaValue, type = 'higher') {
    if (type === 'higher') {
      return kpiValue >= metaValue ? 'optimal' : 'attention';
    }
    return kpiValue <= metaValue ? 'optimal' : 'attention';
  },

  statusLabel(status) {
    const map = {
      critical: 'Crítica',
      atencion: 'Atención',
      optima: 'Óptima',
      optimal: 'Óptima',
      attention: 'Atención'
    };
    return map[status] || status;
  }
};
