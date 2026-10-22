/**
 * views/cielo-grupo.js — «El cielo del grupo» (2.1.0): cabecera de select-region. Un mapa de México de noche donde cada
 * sucursal es su Rosa en su estado real y cada región su constelación (árbol de expansión mínima, como info/). Al pasar
 * el cursor (o enfocar la lista) una región se enciende y muestra su ficha; al elegirla, la cámara se acerca a esa
 * constelación y entra. La primera vez de la sesión hay «llegada»: la Rosa del login se aleja hacia la Ciudad de México,
 * el contorno se traza y las regiones se encienden una tras otra mientras aparecen el saludo y el titular nacional.
 * Siempre de noche (es el cielo de Étoile); el resto de la página sigue al tema.
 */
const CieloGrupo = {
  K: 10, COS: Math.cos(23 * Math.PI / 180),
  D: 3.8,            // distancia mínima entre dos sucursales en el mapa (unidades del mapa; ~15 px a ancho completo)
  R: 1.6,            // radio de cada Rosa en el mapa
  // Recorte vertical: México completo de ancho; arriba se corta Baja California (Tijuana va como marcador en el borde)
  VB_Y: [46, 160],
  // Contorno simplificado de México [longitud, latitud] (el mismo de info/constelacion.js)
  MX: [[-117.1,32.5],[-114.7,32.7],[-111,31.3],[-108.2,31.3],[-108.2,31.8],[-106.5,31.8],[-105,30.7],[-104.5,29.6],[-103.2,29],[-102.4,29.8],
    [-101.4,29.8],[-100.3,28.3],[-99.5,27.5],[-99.1,26.4],[-97.5,25.9],[-97.2,25],[-97.6,23.5],[-97.85,22.2],[-97.2,20.6],[-96.1,19.2],[-94.4,18.15],
    [-92.5,18.6],[-91.8,18.65],[-90.5,19.85],[-90.4,21],[-89.6,21.3],[-87,21.6],[-86.8,21.1],[-87.5,19.5],[-88.3,18.5],[-89.15,17.8],[-90.98,17.8],
    [-91,17.25],[-91.4,17.25],[-90.4,16.1],[-91.7,16.07],[-92.2,15.25],[-92.2,14.55],[-93.9,15.9],[-95.2,16.17],[-96.5,15.65],[-98.5,16.3],[-99.9,16.85],
    [-101.5,17.6],[-102.2,17.95],[-103.5,18.3],[-104.3,19.1],[-105.3,20],[-105.5,20.7],[-105.2,21.5],[-105.7,22.5],[-106.4,23.2],[-107.5,24.5],
    [-108.5,25.5],[-109.4,26.3],[-110,27],[-110.9,27.9],[-111.9,29],[-112.8,30.3],[-113.1,31.2],[-114.1,31.5],[-114.8,31.8],[-114.84,31],
    [-114.2,30],[-113.55,28.95],[-112.27,27.34],[-111.34,26],[-110.7,24.8],[-110.3,24.15],[-109.9,22.88],[-110.2,23.45],[-111.6,24.4],[-112.1,24.6],
    [-112.2,25.9],[-113.2,26.7],[-114.05,27.97],[-115.1,27.85],[-114.3,28.6],[-114.9,29.6],[-115.7,30.07],[-115.95,30.5],[-116.6,31.85]],
  // Etiqueta de cada región respecto a su centro (unidades del mapa), para que no choquen en el Bajío
  ETQ: { CDMX: [8, 6, 'start'], GDL: [-7, 2, 'end'], MTY: [5, -5, 'start'], TOL: [-6, 5, 'end'], QRO: [5, -3, 'start'], SLP: [5, -3, 'start'],
    AGS: [-3, -5, 'end'], LEON: [4, 6, 'start'], CUN: [-4, -5, 'end'], TJ: [4, 6, 'start'] },
  _geo: null, _reg: null, _turno: null, _entrando: false, _enciende: null,

  P(lat, lng) { return [(lng + 118) * this.COS * this.K, (33.5 - lat) * this.K]; },
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); },

  /** Geometría: sucursales proyectadas, centro de cada región, árbol regional y nacional (desde CDMX) */
  geo() {
    if (this._geo) return this._geo;
    const suc = SUCURSALES_META_ALL.filter(m => COORDS_SUCURSALES[m.id]).map(m => { const p = this.P(...COORDS_SUCURSALES[m.id]); return { id: m.id, nombre: m.nombre, r: m.region, pin: p, p: [p[0], p[1]] }; });
    // Las sucursales de una misma ciudad están a cientos de metros: a escala de país se encimarían. Se separan lo justo
    // (relajación de colisiones, distancia mínima D) y cada una sigue atada a su pin con un resorte. Constelación legible,
    // geografía reconocible
    const D = this.D;
    for (let it = 0; it < 240; it++) {
      for (let i = 0; i < suc.length; i++) for (let j = i + 1; j < suc.length; j++) {
        const a = suc[i].p, b = suc[j].p; let dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
        if (d >= D) continue;
        if (d < 1e-6) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        const m = (D - d) / 2 / d; a[0] -= dx * m; a[1] -= dy * m; b[0] += dx * m; b[1] += dy * m;
      }
      suc.forEach(x => { x.p[0] += (x.pin[0] - x.p[0]) * .02; x.p[1] += (x.pin[1] - x.p[1]) * .02; });
    }
    const regs = {};
    suc.forEach(s => (regs[s.r] = regs[s.r] || []).push(s));
    const cen = Object.fromEntries(Object.entries(regs).map(([r, l]) => [r, [l.reduce((a, s) => a + s.p[0], 0) / l.length, l.reduce((a, s) => a + s.p[1], 0) / l.length]]));
    const prim = (nodos, d) => { const dentro = [0], ar = []; while (dentro.length < nodos.length) { let best = null; dentro.forEach(i => nodos.forEach((_, j) => { if (!dentro.includes(j)) { const x = d(nodos[i], nodos[j]); if (!best || x < best[2]) best = [i, j, x]; } })); dentro.push(best[1]); ar.push(best); } return { orden: dentro, ar }; };
    const regIds = Object.keys(cen).sort((a, b) => (b === 'CDMX') - (a === 'CDMX'));
    const nac = prim(regIds, (a, b) => this.dist(cen[a], cen[b]));
    const orden = nac.orden.map(i => regIds[i]);
    const lineasNac = nac.ar.map(([i, j]) => [regIds[i], regIds[j]]);
    const lineasReg = {};
    Object.entries(regs).forEach(([r, l]) => { lineasReg[r] = l.length > 1 ? prim(l, (a, b) => this.dist(a.p, b.p)).ar.map(([i, j]) => [l[i].p, l[j].p]) : []; });
    // Caja de cada región (para acercar la cámara)
    const caja = Object.fromEntries(Object.entries(regs).map(([r, l]) => { const xs = l.map(s => s.p[0]), ys = l.map(s => s.p[1]); return [r, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]]; }));
    const W = Math.ceil((-86 + 118) * this.COS * this.K), H = Math.ceil((33.5 - 14) * this.K);
    return (this._geo = { suc, regs, cen, orden, lineasNac, lineasReg, caja, W, H });
  },

  /** «Buenas tardes, Ibrahim» en la hora del grupo (escapado) */
  saludo() {
    const nombre = (typeof AppAuth !== 'undefined' && AppAuth.profile && AppAuth.profile.nombre) ? String(AppAuth.profile.nombre).split(' ')[0] : '';
    const h = Number(new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hour12: false, timeZone: BranchTime.MONTH_TZ }).format(new Date()));
    return `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? `, ${escapeHtml(nombre)}` : ''}`;
  },

  /** Marcado inicial (sin cifras): la escena, el saludo y la lista de regiones. `llegada` = primera vez en la sesión */
  html({ llegada, mapa = true, lista = true }) {
    const g = this.geo(), t0 = 700, paso = 170, turno = Object.fromEntries(g.orden.map((r, i) => [r, t0 + i * paso]));
    this._turno = turno;
    const contorno = 'M' + this.MX.map(([lo, la]) => this.P(la, lo).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
    const nac = g.lineasNac.map(([a, b]) => `<line class="cg-ln" pathLength="1" x1="${g.cen[a][0].toFixed(1)}" y1="${g.cen[a][1].toFixed(1)}" x2="${g.cen[b][0].toFixed(1)}" y2="${g.cen[b][1].toFixed(1)}" style="--t:${turno[b] - 100}ms"/>`).join('');
    const regiones = g.orden.map(r => {
      const l = g.regs[r], c = g.cen[r], [dx, dy, an] = this.ETQ[r] || [5, -3, 'start'];
      const hit = Math.max(6, ...l.map(s => this.dist(s.p, c) + 3.5));
      const lineas = g.lineasReg[r].map(([a, b]) => `<line class="cg-lr" pathLength="1" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`).join('');
      const rosas = l.map((s, i) => `<g class="cg-suc" transform="translate(${s.p[0].toFixed(2)} ${s.p[1].toFixed(2)})"><g class="cg-pop" style="--d:${(i % 6) * 35}ms" data-suc="${s.id}"></g></g>`).join('');
      return `<g class="cg-reg" data-reg="${r}" style="--t:${turno[r]}ms" tabindex="-1">
        <circle class="cg-hit" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${hit.toFixed(1)}"/>${lineas}${rosas}
        <text class="cg-et" x="${(c[0] + dx).toFixed(1)}" y="${(c[1] + dy).toFixed(1)}" text-anchor="${an}">${escapeHtml(REGION_NAME_MAP[r] || r)}</text></g>`;
    }).join('');
    const saludo = this.saludo();
    const cliente = typeof CLIENTE !== 'undefined' ? CLIENTE.nombre : '';
    // El zonal ve todas las regiones, con la suya marcada
    const mia = typeof AppAuth !== 'undefined' && AppAuth.getUserRole() === 'zonal' ? AppAuth.getUserRegion() : null;
    const [vy0, vy1] = this.VB_Y, vb = [-6, vy0, g.W + 12, vy1 - vy0];
    // Regiones fuera del recorte (Tijuana): marcador en el borde, a su altura horizontal
    const bordes = g.orden.filter(r => g.cen[r][1] < vy0 || g.cen[r][1] > vy1).map(r => {
      const x = (g.cen[r][0] - vb[0]) / vb[2] * 100, arriba = g.cen[r][1] < vy0;
      return `<button type="button" class="cg-borde cg-item ${arriba ? 'arriba' : 'abajo'}" data-reg="${r}" style="left:clamp(84px, ${x.toFixed(2)}%, calc(100% - 84px))"><span class="cg-item-rosa" data-reg-rosa="${r}"></span><span class="cg-item-n">${arriba ? '↑' : '↓'} ${escapeHtml(REGION_NAME_MAP[r] || r)}</span><span class="cg-item-v num" data-reg-v="${r}">—</span></button>`;
    }).join('');
    return `
      <section class="cg${llegada ? ' cg--llegada' : ''}${mapa ? '' : ' cg--sin-mapa'}${lista ? '' : ' cg--sin-lista'}" id="cieloGrupo" aria-labelledby="cgSaludo">
        <div class="cg-in">
          <div class="cg-texto">
            <a class="srv-brand cg-marca" href="#/select-region" aria-label="étoile, inicio">${Rosa.html('brilla', { size: 18, tema: 'noche' })}<span class="accent">étoile</span><span class="cg-cliente">${escapeHtml(cliente)}</span></a>
            <h1 class="cg-saludo" id="cgSaludo">${saludo}</h1>
            <p class="cg-titular" id="cgTitular" aria-live="polite"></p>
          </div>
          ${lista ? `<ol class="cg-lista" id="cgLista" aria-label="Regiones">
            ${g.orden.map((r, i) => `<li style="--i:${i}"><button type="button" class="cg-item${r === mia ? ' cg-item--mia' : ''}" data-reg="${r}" id="cg-reg-${r}"><span class="cg-item-rosa" data-reg-rosa="${r}"></span><span class="cg-item-n">${escapeHtml(REGION_NAME_MAP[r] || r)}${r === mia ? ' <i>· tu región</i>' : ''}</span><span class="cg-item-v num" data-reg-v="${r}">—</span></button></li>`).join('')}
          </ol>` : ''}
        </div>
        ${mapa ? `<div class="cg-escena" id="cgEscena">
          <div class="cg-lienzo">
            <svg id="cgMapa" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Mapa de las sucursales de ${escapeHtml(cliente)}: cada región es una constelación">
              <path class="cg-mx" pathLength="1" d="${contorno}"/>${nac}${regiones}
            </svg>
            ${bordes}
            <div class="cg-ficha" id="cgFicha" hidden></div>
          </div>
          <svg class="cg-viaje" id="cgViaje" viewBox="-95 -95 190 190" aria-hidden="true"></svg>
        </div>` : ''}
      </section>`;
  },

  /** Cifras: estado de cada sucursal (brillo ajustado contra su región) y de cada región (contra el grupo) */
  pinta(currReviews, regionStats) {
    this.calcula(currReviews, regionStats);
    const g = this.geo();
    g.suc.forEach(s => { const el = document.querySelector(`#cgMapa [data-suc="${s.id}"]`); if (el) el.innerHTML = Rosa.svg(Rosa.deTienda(s.estado, null, null, 'noche'), this.R, 'cg' + s.id); });
    Object.values(this._reg).forEach(({ id: r, avg, count, estado }) => {
      document.querySelectorAll(`[data-reg-v="${r}"]`).forEach(v => { v.textContent = count ? avg.toFixed(2) : '—'; });
      document.querySelectorAll(`[data-reg-rosa="${r}"]`).forEach(ro => { ro.innerHTML = Rosa.html(Rosa.deTienda(estado, null, null, 'noche'), { size: 16, tema: 'noche' }); });
    });
  },

  /** Solo el cálculo (sin pintar): `s.estado` en cada sucursal de geo() y `_reg` por región. También lo usa la llegada */
  calcula(currReviews, regionStats) {
    const g = this.geo();
    const textoDe = rv => rv.filter(r => Metrics.hasText(r)).length;
    const nacionalAvg = currReviews.length ? currReviews.reduce((a, r) => a + r.stars, 0) / currReviews.length : 0;
    this._reg = {};
    Object.entries(g.regs).forEach(([r, l]) => {
      const rr = currReviews.filter(x => x.region === r), C = rr.length ? rr.reduce((a, x) => a + x.stars, 0) / rr.length : nacionalAvg;
      l.forEach(s => {
        const rv = rr.filter(x => typeof isSameBranch === 'function' ? isSameBranch(x.sucursal, s.id) : x.sucursal === s.id);
        const avg = rv.length ? rv.reduce((a, x) => a + x.stars, 0) / rv.length : 0;
        s.estado = Brillo.estado({ avg, nTexto: textoDe(rv), C });
      });
      const st = regionStats[r] || { avg: 0, count: 0, unreplied: 0 };
      const est = Brillo.estado({ avg: st.avg, nTexto: textoDe(rr), C: nacionalAvg });
      const cuenta = { brilla: 0, tenue: 0, apaga: 0, sin: 0 };
      l.forEach(s => { cuenta[s.estado.id === 'polar' ? 'brilla' : s.estado.id]++; });
      this._reg[r] = { id: r, nombre: REGION_NAME_MAP[r] || r, avg: st.avg, count: st.count, unreplied: st.unreplied || 0, estado: est, n: l.length, cuenta };
    });
    return this._reg;
  },

  /** Titular nacional en la escena (el mismo texto de Narrative que el briefing) */
  titular(html) { const el = document.getElementById('cgTitular'); if (el) el.innerHTML = html; },

  /** Interacción: encender una región (cursor, foco o lista), ficha, y acercar la cámara al elegirla */
  enlaza() {
    const mapa = document.getElementById('cgMapa'), ficha = document.getElementById('cgFicha'), escena = document.querySelector('#cgEscena .cg-lienzo');
    // Sin mapa (las regiones desde 2.1.0: el mapa vive en la llegada): la lista entra directo
    if (!mapa) { document.querySelectorAll('.cg-item').forEach(b => b.addEventListener('click', () => this.entrar(b.dataset.reg))); return; }
    const enciende = r => {
      if (this._entrando) return;   // durante el acercamiento la región elegida ya está encendida
      mapa.classList.toggle('cg-foco', !!r);
      mapa.querySelectorAll('.cg-reg').forEach(g => g.classList.toggle('on', g.dataset.reg === r));
      document.querySelectorAll('.cg-item').forEach(b => b.classList.toggle('on', b.dataset.reg === r));
      if (!r || !this._reg || !this._reg[r]) { ficha.hidden = true; return; }
      const d = this._reg[r], c = this.geo().cen[r], m = mapa.getScreenCTM(), er = escena.getBoundingClientRect();
      const pt = mapa.createSVGPoint(); pt.x = c[0]; pt.y = c[1]; const q = pt.matrixTransform(m);
      const x = q.x - er.left, y = q.y - er.top, izq = x > er.width * .55;
      ficha.innerHTML = this.fichaHtml(d);
      ficha.style.left = `${Math.max(8, Math.min(er.width - 248, izq ? x - 256 : x + 18))}px`;
      ficha.hidden = false;
      // dentro del mapa: si no cabe abajo, se acomoda arriba del punto
      const alto = ficha.offsetHeight || 200;
      ficha.style.top = `${Math.max(8, Math.min(er.height - alto - 8, y - alto / 2))}px`;
    };
    this._enciende = enciende;
    mapa.querySelectorAll('.cg-reg').forEach(g => {
      g.addEventListener('pointerenter', () => enciende(g.dataset.reg));
      g.addEventListener('click', () => this.entrar(g.dataset.reg));
    });
    mapa.addEventListener('pointerleave', () => enciende(null));
    document.querySelectorAll('.cg-item').forEach(b => {
      ['pointerenter', 'focus'].forEach(t => b.addEventListener(t, () => enciende(b.dataset.reg)));
      ['pointerleave', 'blur'].forEach(t => b.addEventListener(t, () => enciende(null)));
      b.addEventListener('click', () => this.entrar(b.dataset.reg));
    });
  },

  /** Ficha de una región (lo que muestra al encenderse) */
  fichaHtml(d) {
    const partes = [['brilla', 'brilla', 'brillan'], ['tenue', 'tenue', 'tenues'], ['apaga', 'se apaga', 'se apagan']].filter(([k]) => d.cuenta[k]).map(([k, uno, varios]) => `${d.cuenta[k]} ${d.cuenta[k] === 1 ? uno : varios}`).join(' · ');
    return `<div class="cg-ficha-cab">${Rosa.html(Rosa.deTienda(d.estado, null, null, 'noche'), { size: 30, tema: 'noche' })}<div><b>${escapeHtml(d.nombre)}</b><span>${escapeHtml(Brillo.lectura(d.estado))}</span></div></div>
        <div class="cg-ficha-cifras"><div><b class="num">${d.count ? d.avg.toFixed(2) : '—'}</b><span>promedio</span></div><div><b class="num">${d.count}</b><span>reseñas</span></div><div><b class="num">${d.unreplied}</b><span>sin respuesta</span></div></div>
        <p>${d.n} ${d.n === 1 ? 'sucursal' : 'sucursales'}${partes ? `: ${partes}` : ''}</p><span class="cg-ficha-ir">Entrar →</span>`;
  },

  /** Elegir región: la cámara se acerca a su constelación (viewBox con resorte suave) y luego entra */
  entrar(r) {
    const mapa = document.getElementById('cgMapa');
    if (!mapa) { SelectRegionView.handleSelect(r); return; }
    if (this._entrando) return; this._entrando = true;
    const g = this.geo(), [x0, y0, x1, y1] = g.caja[r];
    document.getElementById('cgFicha').hidden = true;
    mapa.classList.add('cg-foco', 'cg-entrando');
    mapa.querySelectorAll('.cg-reg').forEach(e => e.classList.toggle('on', e.dataset.reg === r));
    const de = mapa.getAttribute('viewBox').split(' ').map(Number);
    const lado = Math.max((x1 - x0) * 1.6, (y1 - y0) * 1.6, 3.2) * 1.5, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;   // de cerca: las sucursales se separan
    const ar = de[2] / de[3], w = Math.max(lado, lado * ar), h = w / ar;
    const a = [cx - w / 2, cy - h / 2, w, h];
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches, dur = quieto ? 0 : 750, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    const paso = now => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = ease(k);
      const vb = de.map((v, i) => v + (a[i] - v) * e);
      mapa.setAttribute('viewBox', vb.map(v => v.toFixed(2)).join(' '));
      // las Rosas conservan su tamaño en pantalla: la cámara separa las sucursales en vez de agrandarlas
      mapa.style.setProperty('--inv', (vb[2] / de[2]).toFixed(4));
      if (k < 1) requestAnimationFrame(paso);
      else { this._entrando = false; SelectRegionView.handleSelect(r); }
    };
    requestAnimationFrame(paso);
  },

  /** Llegada: la Rosa del login se aleja hacia la Ciudad de México mientras el cielo se enciende (una vez por sesión) */
  llegada() {
    const sec = document.getElementById('cieloGrupo'); if (!sec) return;
    // Si el cargador de la app aún cubre la pantalla, la llegada espera a que la descubra (si no, se vería ya terminada)
    const cargador = document.getElementById('lcp-loader');
    if (cargador && cargador.style.display !== 'none' && !window.ETOILE_REVELADA) {
      window.addEventListener('etoile:revela', () => setTimeout(() => this.llegada(), 120), { once: true });
      return;
    }
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { sessionStorage.setItem('etoile-llegada', '1'); } catch (e) {}
    requestAnimationFrame(() => requestAnimationFrame(() => sec.classList.add('cg--on')));
    if (quieto || !sec.classList.contains('cg--llegada')) { sec.classList.remove('cg--llegada'); return; }
    // al terminar, el cielo queda en su estado normal (las animaciones ya no fijan las escalas y la luz responde al cursor)
    const fin = (this._turno ? Math.max(...Object.values(this._turno)) : 2400) + 1400;
    setTimeout(() => { if (sec.isConnected) sec.classList.remove('cg--llegada'); }, Math.max(fin, 2800));
    const viaje = document.getElementById('cgViaje'), mapa = document.getElementById('cgMapa'), escena = document.getElementById('cgEscena');
    if (!mapa) return;
    const est = Rosa.Estrella(viaje, 48, 'noche');
    est.salta(Rosa.estadoDe({ p: { L: 1, S: .5 }, col: '#FFC27A' }, { carta: 1, grabado: 1, temp: 1 }, 'noche'));
    const c = this.geo().cen.CDMX, m = mapa.getScreenCTM(), er = escena.getBoundingClientRect(), vr = viaje.getBoundingClientRect();
    const pt = mapa.createSVGPoint(); pt.x = c[0]; pt.y = c[1]; const q = pt.matrixTransform(m);
    const dx = q.x - (vr.left + vr.width / 2), dy = q.y - (vr.top + vr.height / 2);
    viaje.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * .55}px, ${dy * .55 - 40}px) scale(.45)`, opacity: 1, offset: .55 }, { transform: `translate(${dx}px, ${dy}px) scale(.05)`, opacity: 0 }],
      { duration: 1100, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
    setTimeout(() => est.a(Rosa.estadoDe({ p: { L: .09, S: .09, F: .09, I: .09 }, col: '#FFC27A' }, { carta: 0, grabado: 0 }, 'noche')), 300);
  }
};
