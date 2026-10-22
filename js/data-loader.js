/**
 * data-loader.js — Carga lazy de reseñas desde Supabase o JSON mensuales locales,
 * y cálculo de estadísticas agregadas.
 */

const DataLoader = {
  manifest: null,
  // Regiones ya precargadas en esta sesión: { [region]: { cache, manifest, at } }. Se vacía al iniciar/cerrar sesión.
  _regionStore: {},
  _brandCache: {},
  REGION_CACHE_TTL_MS: 5 * 60 * 1000,
  cache: {},
  currentYear: null,
  currentMonth: null,
  previousYear: null,
  previousMonth: null,

  async init() {
    this.manifest = {};
    const manifestKey = 'manifest_' + (typeof activeRegion !== 'undefined' && activeRegion ? activeRegion : 'ALL');

    // 1. Cargar manifest local desde EtoileCache (IndexedDB) inmediatamente (<2ms)
    if (typeof EtoileCache !== 'undefined') {
      try {
        const localManifest = await EtoileCache.get('manifest_cache', manifestKey);
        if (localManifest && Object.keys(localManifest).length > 0) {
          this.manifest = localManifest;
          this.setupCurrentPeriods();
        }
      } catch (e) {
        console.warn('[DataLoader] Lectura de manifest local omitida:', e);
      }
    }

    // 2. Si Supabase está inicializado, sincronizar en paralelo el manifest dinámico de la base de datos
    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
      try {
        const { data, error } = await supabaseClient
          .from('review_months')
          .select('*')
          .eq('region', activeRegion);

        if (error) throw error;

        if (data && data.length > 0) {
          const dbManifest = {};
          data.forEach(row => {
            const y = String(row.year);
            if (!dbManifest[y]) dbManifest[y] = [];
            if (!dbManifest[y].includes(row.month)) {
              dbManifest[y].push(row.month);
            }
          });
          // Ordenar ascendentemente los meses en cada año
          for (const y in dbManifest) {
            dbManifest[y].sort((a, b) => a - b);
          }
          this.manifest = dbManifest;
          if (typeof EtoileCache !== 'undefined') {
            EtoileCache.set('manifest_cache', manifestKey, dbManifest);
          }
        }
      } catch (e) {
        console.error('No se pudo cargar el manifest dinámico desde Supabase:', e);
      }
    }

    this.setupCurrentPeriods();
  },

  setupCurrentPeriods() {
    if (!this.manifest || Object.keys(this.manifest).length === 0) {
      this.currentYear = new Date().getFullYear();
      this.currentMonth = new Date().getMonth() + 1;
      this.previousYear = this.currentMonth === 1 ? this.currentYear - 1 : this.currentYear;
      this.previousMonth = this.currentMonth === 1 ? 12 : this.currentMonth - 1;
      return;
    }
    
    // Si hay un mes guardado y es válido, lo usamos
    if (typeof ViewState !== 'undefined') {
      const saved = ViewState.get('month');
      if (saved && saved.y && saved.m && this.manifest[saved.y] && this.manifest[saved.y].includes(saved.m)) {
        this.setMonth(saved.y, saved.m);
        return;
      }
    }

    const years = Object.keys(this.manifest).map(Number).sort((a, b) => b - a);
    if (years.length > 0) {
      this.currentYear = years[0];
      const months = [...this.manifest[this.currentYear]].sort((a, b) => b - a);
      if (months.length > 0) {
        this.currentMonth = months[0];
        // Determinar periodo anterior para comparaciones
        if (months.length > 1) {
          this.previousMonth = months[1];
          this.previousYear = this.currentYear;
        } else {
          this.previousMonth = this.currentMonth === 1 ? 12 : this.currentMonth - 1;
          this.previousYear = this.currentMonth === 1 ? this.currentYear - 1 : this.currentYear;
        }
      }
    }
  },

  async switchRegion(region) {
    if (setRegionActiva(region)) {
      // Región ya cargada hace poco (p. ej. la del perfil, precargada en el login): se reutiliza sin red
      const hit = this._regionStore[region];
      if (hit && Date.now() - hit.at < this.REGION_CACHE_TTL_MS) {
        this.cache = hit.cache;
        this.manifest = hit.manifest;
        this.setupCurrentPeriods();
        this._applyHistoricalRatings();
        return true;
      }
      this.cache = {}; // Vaciar la caché al cambiar de región
      await Promise.all([this.init(), this.computeHistoricalRatings()]);
      return true;
    }
    return false;
  },

  async loadQuarterStats(year, quarter) {
    const key = `q-${year}-Q${quarter}`;
    const storageKey = `${key}-${typeof activeRegion !== 'undefined' ? activeRegion : 'ALL'}`;
    if (this.cache[key]) return this.cache[key];

    // 1. Chequeo SWR en EtoileCache (IndexedDB)
    if (typeof EtoileCache !== 'undefined') {
      try {
        const cachedStats = await EtoileCache.get('stats_cache', storageKey);
        if (cachedStats && cachedStats.length > 0) {
          this.cache[key] = cachedStats;
          this._revalidateQuarter(year, quarter, key, storageKey, cachedStats);
          return cachedStats;
        }
      } catch (e) {
        console.warn('[DataLoader] Lectura de stats locales omitida:', e);
      }
    }

    return await this._fetchQuarterStats(year, quarter, key, storageKey);
  },

  async _fetchQuarterStats(year, quarter, key, storageKey) {
    // Cargar desde Supabase vista
    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
      try {
        const { data, error } = await supabaseClient
          .from('quarterly_stats')
          .select('*')
          .eq('region', activeRegion)
          .eq('year', year)
          .eq('quarter', quarter);

        if (error) throw error;

        if (data && data.length > 0) {
          const stats = data.map(r => ({
            sucursalId: r.sucursal,
            avgRating: r.avg_rating,
            totalReviews: r.total_reviews,
            negativeReviews: r.negative_reviews
          }));
          this.cache[key] = stats;
          if (typeof EtoileCache !== 'undefined') {
            EtoileCache.set('stats_cache', storageKey, stats);
          }
          return stats;
        }
      } catch (e) {
        console.error(`Error al consultar estadísticas trimestrales de Supabase para ${key}:`, e);
      }
    }

    // Fallback: calcularlo dinámicamente a partir de los meses correspondientes
    const months = [1, 2, 3].map(m => m + (quarter - 1) * 3);
    const branchStats = [];

    // Cargar los meses en paralelo
    await Promise.all(
      months
        .filter(m => this.hasMonth(year, m))
        .map(m => this.loadMonth(year, m))
    );

    for (const s of SUCURSALES_META) {
      let totalStars = 0;
      let totalCount = 0;
      let totalNeg = 0;

      for (const m of months) {
        const monthData = this.getMonth(year, m);
        if (monthData) {
          const branchRevs = monthData.reviews.filter(r => typeof isSameBranch === 'function' ? isSameBranch(r.sucursal, s.id) : r.sucursal === s.id);
          totalStars += branchRevs.reduce((sum, r) => sum + r.stars, 0);
          totalCount += branchRevs.length;
          totalNeg += branchRevs.filter(r => Metrics.isComplaint(r)).length;
        }
      }

      branchStats.push({
        sucursalId: s.id,
        avgRating: totalCount > 0 ? Number((totalStars / totalCount).toFixed(2)) : 0,
        totalReviews: totalCount,
        negativeReviews: totalNeg
      });
    }

    this.cache[key] = branchStats;
    if (typeof EtoileCache !== 'undefined') {
      EtoileCache.set('stats_cache', storageKey, branchStats);
    }
    return branchStats;
  },

  async _revalidateQuarter(year, quarter, key, storageKey, cachedStats) {
    try {
      const freshStats = await this._fetchQuarterStats(year, quarter, key, storageKey);
      if (freshStats && cachedStats && JSON.stringify(freshStats) !== JSON.stringify(cachedStats)) {
        window.dispatchEvent(new CustomEvent('etoile:data-synced', {
          detail: { key, year, quarter, type: 'quarter', region: activeRegion }
        }));
      }
    } catch (e) {
      // Background revalidation silently caught
    }
  },

  async loadMonth(year, month) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const storageKey = `${key}-${typeof activeRegion !== 'undefined' ? activeRegion : 'ALL'}`;
    if (this.cache[key]) return this.cache[key];

    // 1. Chequeo SWR en EtoileCache (IndexedDB: resolución en <5ms sin esperar red)
    if (typeof EtoileCache !== 'undefined') {
      try {
        const cached = await EtoileCache.get('reviews_cache', storageKey);
        if (cached && cached.reviews && cached.reviews.length > 0) {
          this.cache[key] = cached;
          this._revalidateMonth(year, month, key, storageKey, cached);
          return cached;
        }
      } catch (e) {
        console.warn('[DataLoader] Lectura de reseñas locales omitida:', e);
      }
    }

    // 2. Si no hay caché previa, esperar a Supabase
    return await this._fetchMonthFromSupabase(year, month, key, storageKey);
  },

  async _fetchMonthFromSupabase(year, month, key, storageKey) {
    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
      try {
        const startIso = BranchTime.monthStartIso(year, month);
        const nextM = month === 12 ? 1 : month + 1;
        const nextY = month === 12 ? year + 1 : year;
        const endIso = BranchTime.monthStartIso(nextY, nextM);

        let allData = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          let query = supabaseClient
            .from('reviews')
            .select('*')
            .gte('published_at_date', startIso)
            .lt('published_at_date', endIso);

          if (activeRegion && activeRegion !== 'BRAND') {
            query = query.eq('region', activeRegion);
          }

          const { data, error } = await query.order('id').range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;

          if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < pageSize) hasMore = false;
            else page++;
          } else {
            hasMore = false;
          }
        }

        const mappedReviews = allData.filter(r => Metrics.rawKeep(r)).map((r, idx) => {
          const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
          const canonicalId = meta ? meta.id : (r.sucursal || '').toLowerCase();
          const canonicalRegion = meta ? meta.region : (r.region || '');

          return {
            id: r.id,
            globalId: `${key}-${idx}`,
            sucursal: canonicalId,
            stars: r.stars,
            text: r.text,
            publishedAtDate: r.published_at_date,
            isLocalGuide: r.is_local_guide,
            responseText: r.response_text,
            responseFromOwnerText: r.response_text,
            responseDate: r.response_date,
            responseFromOwnerDate: r.response_date,
            region: canonicalRegion,
            classification: r.classification
          };
        });

        const filtered = (activeRegion && activeRegion !== 'BRAND')
          ? mappedReviews.filter(r => r.region === activeRegion)
          : mappedReviews;

        const result = { reviews: filtered };
        this.cache[key] = result;

        if (typeof EtoileCache !== 'undefined') {
          EtoileCache.set('reviews_cache', storageKey, result);
        }

        return result;
      } catch (e) {
        console.error(`Error al consultar reseñas de Supabase para ${key}:`, e);
      }
    }

    return { reviews: [] };
  },

  async _revalidateMonth(year, month, key, storageKey, cached) {
    try {
      const fresh = await this._fetchMonthFromSupabase(year, month, key, storageKey);
      if (fresh && fresh.reviews && cached && cached.reviews) {
        if (fresh.reviews.length !== cached.reviews.length) {
          console.log(`[DataLoader SWR] Sincronización en segundo plano completada para ${key}: ${cached.reviews.length} -> ${fresh.reviews.length} reseñas.`);
          window.dispatchEvent(new CustomEvent('etoile:data-synced', {
            detail: { key, year, month, type: 'month', region: activeRegion }
          }));
        }
      }
    } catch (e) {
      // Revalidación silenciosa
    }
  },

  async loadBrandData(year, month) {
    const key = `brand-${year}-${String(month).padStart(2, '0')}`;
    // Datos de todas las regiones: no dependen de la región activa, así que viven fuera de `cache` (que se cambia al entrar a una región)
    const brandHit = this._brandCache[key];
    if (brandHit && Date.now() - brandHit.at < this.REGION_CACHE_TTL_MS) return brandHit.data;

    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
      try {
        const startIso = BranchTime.monthStartIso(year, month);
        const nextM = month === 12 ? 1 : month + 1;
        const nextY = month === 12 ? year + 1 : year;
        const endIso = BranchTime.monthStartIso(nextY, nextM);

        let allData = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabaseClient
            .from('reviews')
            .select('*')
            .gte('published_at_date', startIso)
            .lt('published_at_date', endIso)
            .order('id')
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < pageSize) hasMore = false;
            else page++;
          } else {
            hasMore = false;
          }
        }

        const mappedReviews = allData.filter(r => Metrics.rawKeep(r)).map((r, idx) => {
          const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
          const canonicalId = meta ? meta.id : (r.sucursal || '').toLowerCase();
          const canonicalRegion = meta ? meta.region : (r.region || '');

          return {
            id: r.id,
            globalId: `${key}-${idx}`,
            sucursal: canonicalId,
            stars: r.stars,
            text: r.text,
            publishedAtDate: r.published_at_date,
            isLocalGuide: r.is_local_guide,
            responseText: r.response_text,
            responseFromOwnerText: r.response_text,
            responseDate: r.response_date,
            responseFromOwnerDate: r.response_date,
            region: canonicalRegion,
            classification: r.classification
          };
        });

        this._brandCache[key] = { data: mappedReviews, at: Date.now() };
        return mappedReviews;
      } catch (e) {
        console.error(`Error al consultar reseñas globales de Supabase para ${key}:`, e);
      }
    }

    return [];
  },

  getMonth(year, month) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return this.cache[key] || null;
  },

  getReviewByGlobalId(globalId) {
    if (!globalId) return null;
    const parts = globalId.split('-');
    if (parts.length < 3) return null;
    const key = `${parts[0]}-${parts[1]}`;
    const idx = parseInt(parts[2]);
    const data = this.cache[key];
    if (data && data.reviews && data.reviews[idx]) {
      return data.reviews[idx];
    }
    return null;
  },

  hasMonth(year, month) {
    const y = String(year);
    const m = Number(month);
    return this.manifest && this.manifest[y] && this.manifest[y].includes(m);
  },

  getReviewsForBranch(year, month, branchId) {
    const data = this.getMonth(year, month);
    if (!data || !data.reviews) return [];
    
    const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(branchId) : SUCURSALES_META_ALL.find(s => s.id === branchId);
    if (!meta) return [];

    return data.reviews.filter(r => typeof isSameBranch === 'function' ? isSameBranch(r.sucursal, branchId) : r.sucursal === branchId);
  },

  getAvailableMonthsForBranch(branchId, year = new Date().getFullYear()) {
    const available = [];
    const yearMonths = (this.manifest && this.manifest[year]) ? this.manifest[year] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const m of yearMonths) {
      const monthData = this.getMonth(year, m);
      if (monthData && monthData.reviews) {
        const revs = monthData.reviews.filter(r => typeof isSameBranch === 'function' ? isSameBranch(r.sucursal, branchId) : r.sucursal === branchId);
        if (revs.length > 0) {
          available.push(m);
        }
      }
    }
    return available;
  },

  computeBranchStats(year, month, branchId) {
    const reviews = this.getReviewsForBranch(year, month, branchId);
    if (!reviews.length) {
      return { count: 0, avg: 0, negativeCount: 0, guideCount: 0 };
    }
    const count = reviews.length;
    const avg = reviews.reduce((a, r) => a + r.stars, 0) / count;
    const negativeCount = reviews.filter(r => Metrics.isComplaint(r)).length;
    const guideCount = reviews.filter(r => r.isLocalGuide).length;
    const textCount = reviews.filter(r => Metrics.hasText(r)).length;
    return { count, avg, negativeCount, guideCount, textCount };
  },

  /**
   * Brillo de cada tienda en el mes (documentacion/marca.md, js/rosa.js): estado con brillo ajustado y evidencia,
   * estado con que empezó el mes (el del mes anterior), una señal y el nombre de la combinación.
   * C = promedio de todas las reseñas de las tiendas dadas (la región). → { [id]: { avg, count, nTexto, estado, inicio, senal, lectura } }
   */
  brillo(year, month, ids) {
    const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
    const lee = (y, m) => {
      const rows = ids.map(id => { const rv = this.getReviewsForBranch(y, m, id); return { id, rv, count: rv.length, avg: rv.length ? rv.reduce((a, r) => a + r.stars, 0) / rv.length : 0, nTexto: rv.filter(r => Metrics.hasText(r)).length }; });
      const C = Metrics.weightedAvg(rows);
      rows.forEach(r => { r.estado = Brillo.estado({ avg: r.avg, nTexto: r.nTexto, C }); });
      return rows;
    };
    const ahora = lee(year, month), antes = this.hasMonth(prev[0], prev[1]) ? lee(prev[0], prev[1]) : [];
    const now = BranchTime.nowMonth();
    const hasta = year === now.y && month === now.m ? Date.now() : Date.parse(BranchTime.monthStartIso(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)) - 1;
    const out = {};
    ahora.forEach(r => {
      const p = antes.find(x => x.id === r.id), inicio = p ? p.estado.id : null;
      const senal = Brillo.senal({ semanas: Brillo.semanas([...r.rv, ...(p ? p.rv : [])], hasta), inicio, ahora: r.estado.id });
      out[r.id] = { avg: r.avg, count: r.count, nTexto: r.nTexto, estado: r.estado, inicio, senal, lectura: Brillo.lectura(r.estado, senal, inicio) };
    });
    return out;
  },

  getAllBranchStats(year, month) {
    const result = {};
    for (const meta of SUCURSALES_META) {
      result[meta.id] = this.computeBranchStats(year, month, meta.id);
    }
    return result;
  },

  getGlobalStats(year, month) {
    const data = this.getMonth(year, month);
    if (!data) return { totalReviews: 0, avgRating: 0, withText: 0 };
    const reviews = data.reviews;
    const totalReviews = reviews.length;
    const avgRating = totalReviews ? reviews.reduce((a, r) => a + r.stars, 0) / totalReviews : 0;
    const withText = reviews.filter(r => r.text && r.text.trim().length > 0).length;
    return { totalReviews, avgRating, withText };
  },

  computeBranchHistoricalStats(branchId) {
    let totalStars = 0;
    let totalCount = 0;
    for (const key in this.cache) {
      if (/^\d{4}-\d{2}$/.test(key)) {
        const data = this.cache[key];
        if (data && data.reviews) {
          const branchReviews = data.reviews.filter(r => typeof isSameBranch === 'function' ? isSameBranch(r.sucursal, branchId) : r.sucursal === branchId);
          totalCount += branchReviews.length;
          totalStars += branchReviews.reduce((sum, r) => sum + r.stars, 0);
        }
      }
    }
    const avg = totalCount > 0 ? totalStars / totalCount : 0;
    return { count: totalCount, avg: avg };
  },

  async preloadAllReviews() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient !== null) {
      try {
        const pageSize = 1000;
        const pageQuery = (p, withCount) => {
          let query = supabaseClient.from('reviews').select('*', withCount ? { count: 'exact' } : undefined);
          if (activeRegion && activeRegion !== 'BRAND') {
            query = query.eq('region', activeRegion);
          }
          return query.order('id').range(p * pageSize, (p + 1) * pageSize - 1);
        };

        // Página 0 con el total; el resto de páginas se piden en paralelo (antes: una tras otra, ~400 ms c/u)
        const first = await pageQuery(0, true);
        if (first.error) throw first.error;
        let allData = first.data || [];
        const totalRows = first.count;
        if (allData.length === pageSize) {
          if (typeof totalRows === 'number') {
            const extraPages = Math.ceil(totalRows / pageSize) - 1;
            const rest = await Promise.all(Array.from({ length: Math.max(0, extraPages) }, (_, i) => pageQuery(i + 1, false)));
            for (const r of rest) {
              if (r.error) throw r.error;
              allData = allData.concat(r.data || []);
            }
          } else {
            // Sin total disponible: respaldo secuencial
            for (let p = 1; ; p++) {
              const r = await pageQuery(p, false);
              if (r.error) throw r.error;
              if (!r.data || r.data.length === 0) break;
              allData = allData.concat(r.data);
              if (r.data.length < pageSize) break;
            }
          }
        }

        // Agrupar todas las reseñas en sus respectivos meses resolviendo la sucursal y región canónicas
        const grouped = {};
        allData.forEach((r, idx) => {
          if (!r.published_at_date) return;
          if (!Metrics.rawKeep(r)) return;   // 1–2★ sin texto: descartadas
          const meta = typeof resolveBranchMeta === 'function' ? resolveBranchMeta(r.sucursal) : null;
          const canonicalId = meta ? meta.id : (r.sucursal || '').toLowerCase();
          const canonicalRegion = meta ? meta.region : (r.region || '');

          if (activeRegion && activeRegion !== 'BRAND' && canonicalRegion && canonicalRegion !== activeRegion) {
            return;
          }

          const date = new Date(r.published_at_date);
          const mo = BranchTime.monthOf(r.published_at_date) || { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1 };
          const y = String(mo.y);
          const m = mo.m;
          const mStr = String(m).padStart(2, '0');
          const key = `${y}-${mStr}`;

          if (!grouped[key]) {
            grouped[key] = { reviews: [] };
          }

          grouped[key].reviews.push({
            id: r.id,
            // Índice dentro del MES (getReviewByGlobalId lo busca en cache[mes].reviews[idx]); antes se usaba la
            // posición en todo el historial de la región y el detalle de una reseña del feed nunca se encontraba.
            globalId: `${key}-${grouped[key].reviews.length}`,
            sucursal: canonicalId,
            stars: r.stars,
            text: r.text,
            publishedAtDate: r.published_at_date,
            isLocalGuide: r.is_local_guide,
            responseText: r.response_text,
            responseFromOwnerText: r.response_text,
            responseDate: r.response_date,
            responseFromOwnerDate: r.response_date,
            region: canonicalRegion,
            classification: r.classification
          });

          // Actualizar manifest dinámico
          if (!this.manifest) this.manifest = {};
          if (!this.manifest[y]) this.manifest[y] = [];
          if (!this.manifest[y].includes(m)) {
            this.manifest[y].push(m);
            this.manifest[y].sort((a, b) => a - b);
          }
        });

        // Llenar el caché con las reseñas agrupadas
        for (const key in grouped) {
          this.cache[key] = grouped[key];
        }
      } catch (e) {
        console.error("Error precargando reseñas globales de la región:", e);
      }
    }
  },

  async computeHistoricalRatings() {
    // Carga masiva en un solo query en lugar de multiples llamadas HTTP concurrentes
    await this.preloadAllReviews();
    if (typeof activeRegion !== 'undefined' && activeRegion) {
      this._regionStore[activeRegion] = { cache: this.cache, manifest: this.manifest, at: Date.now() };
    }
    this._applyHistoricalRatings();
  },

  _applyHistoricalRatings() {
    for (const meta of SUCURSALES_META_ALL) {
      const stats = this.computeBranchHistoricalStats(meta.id);
      if (stats.count > 0) {
        meta.historico = stats.avg;
        meta.historicoCount = stats.count;
      } else {
        meta.historicoCount = 0;
      }
    }
  },

  setMonth(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    if (typeof ViewState !== 'undefined') {
      ViewState.set('month', { y: year, m: month });
    }
    const availableMonths = this.manifest[year] || [];
    const sortedMonths = [...availableMonths].sort((a, b) => a - b);
    const idx = sortedMonths.indexOf(month);
    if (idx > 0) {
      this.previousMonth = sortedMonths[idx - 1];
      this.previousYear = year;
    } else {
      this.previousMonth = month === 1 ? 12 : month - 1;
      this.previousYear = month === 1 ? year - 1 : year;
    }
  }
};
