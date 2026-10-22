/**
 * views/llegada.js — «La llegada» (#/llegada, 2.1.0): la página entre el login y las regiones (rol corporativo).
 * Una secuencia de cine en tres capítulos sobre un cielo fijo (sticky) que la cámara recorre con el scroll, de norte a sur:
 *   1. Tijuana y el norte: el cielo se arma (la Rosa del login se reparte en las sucursales; cada una llega con resorte a
 *      su lugar, en su estado real, y su región se une al asentarse sus estrellas) mientras la bitácora escribe su entrada.
 *   2. El Bajío: los apuntes de la noche (lo urgente, lo que mejoró, lo que viene).
 *   3. El sur, de Vallarta a Cancún: el cielo completo y «Ver las regiones», que sale como cometa hacia la marca de la
 *      página de regiones mientras la noche se cierra sobre ella.
 * La cámara sigue al scroll con amortiguación (encuadres por capítulo que dejan su lugar al texto). Siempre de noche.
 * Un toque en el cielo o Esc termina el armado; con movimiento reducido todo aparece asentado y sin viajes.
 */
const LlegadaView = {
  _raf: 0, _tecleo: 0, _listo: false, _entrada: '', _cam: null, _camRaf: 0, _saliendo: false,
  // Encuadre de cada capítulo: caja del mapa [x0, y0, x1, y1] y margen que deja al texto [izq, arriba, der, abajo] (fracción de pantalla)
  TOMAS: {
    ancha: [{ caja: [-4, 2, 205, 95], m: [0, .05, 0, .42] }, { caja: [100, 72, 200, 150], m: [0, .08, .44, .08] }, { caja: [100, 98, 296, 182], m: [.02, .06, .02, .34] }],
    alta: [{ caja: [-4, 2, 180, 95], m: [0, .05, 0, .5] }, { caja: [118, 92, 192, 150], m: [0, .05, 0, .55] }, { caja: [100, 98, 296, 182], m: [0, .06, 0, .44] }]
  },

  async render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (!AppAuth.isAuthenticated()) { Router.navigate('#/login'); return; }
    if (AppAuth.getUserRole() === 'gerente') { Router.navigate('#/'); return; }
    cancelAnimationFrame(this._raf); cancelAnimationFrame(this._camRaf); clearInterval(this._tecleo);
    this._listo = false; this._cam = null; this._saliendo = false;

    // Cifras del mes (el mismo periodo que abrirá select-region)
    let datos = null;
    try { datos = await this.datos(); } catch (e) { console.error('Llegada: no se pudieron leer las cifras', e); }
    if (!datos) { Router.navigate('#/select-region'); return; }
    this._entrada = datos.entrada;
    try { sessionStorage.setItem('etoile-llegada', '1'); } catch (e) {}   // el encabezado de las regiones ya no repite su llegada

    const CG = CieloGrupo, g = CG.geo(), reg = datos.reg;
    const contorno = 'M' + CG.MX.map(([lo, la]) => CG.P(la, lo).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
    const L = (a, b, cls) => `<line class="${cls}" pathLength="1" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
    const regiones = g.orden.map(r => {
      const l = g.regs[r], c = g.cen[r], [dx, dy, an] = CG.ETQ[r] || [5, -3, 'start'], d = reg[r];
      const hit = Math.max(6, ...l.map(s => CG.dist(s.p, c) + 3.5));
      return `<g class="cg-reg ll-reg" data-reg="${r}" tabindex="0" role="button" aria-label="${escapeHtml(d.nombre)}: ${d.count ? `${d.avg.toFixed(2)}, ` : ''}${escapeHtml(Brillo.lectura(d.estado))}. Entrar">
        <circle class="cg-hit" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${hit.toFixed(1)}"/>${g.lineasReg[r].map(([a, b]) => L(a, b, 'cg-lr')).join('')}
        ${l.map(s => `<g class="ll-suc" data-suc="${s.id}">${Rosa.svg(Rosa.deTienda(s.estado, null, null, 'noche'), CG.R, 'll' + s.id, 'noche')}</g>`).join('')}
        <text class="cg-et" x="${(c[0] + dx * .75).toFixed(1)}" y="${(c[1] + dy * .75).toFixed(1)}" text-anchor="${an}">${escapeHtml(d.nombre)}</text></g>`;
    }).join('');
    const cliente = typeof CLIENTE !== 'undefined' ? CLIENTE.nombre : '';
    const ahora = new Date(), tz = BranchTime.MONTH_TZ;
    const fecha = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
    const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    const apunte = ([sig, t, p], i) => `<li class="ll-apunte" style="--i:${i + 1}">${Rosa.html(Rosa.estadoDe(sig, {}, 'noche'), { size: 28, tema: 'noche' })}<b>${t}</b><p>${p}</p></li>`;
    const cuenta = { brilla: 0, tenue: 0, apaga: 0 };
    g.suc.forEach(s => { const k = s.estado.id === 'polar' ? 'brilla' : s.estado.id; if (k in cuenta) cuenta[k]++; });
    const resumen = [['brilla', 'brilla', 'brillan'], ['tenue', 'tenue', 'tenues'], ['apaga', 'se apaga', 'se apagan']].filter(([k]) => cuenta[k]).map(([k, uno, varios]) => `<span>${Rosa.html(k, { size: 16, tema: 'noche' })}${cuenta[k]} ${cuenta[k] === 1 ? uno : varios}</span>`).join('');

    app.innerHTML = `
      <section class="cg ll" id="llegada" aria-labelledby="llSaludo">
        <div class="ll-cielo" id="llCielo">
          <svg id="llMapa" viewBox="-4 2 300 190" preserveAspectRatio="xMidYMid slice" role="group" aria-label="Las sucursales de ${escapeHtml(cliente)} llegan a su lugar y cada región se une en su constelación">
            <path class="cg-mx" pathLength="1" d="${contorno}"/>
            ${g.lineasNac.map(([a, b]) => L(g.cen[a], g.cen[b], 'cg-ln')).join('')}${regiones}
          </svg>
          <div class="cg-ficha" id="llFicha" hidden></div>
          <svg class="cg-viaje ll-viaje" id="llViaje" viewBox="-95 -95 190 190" aria-hidden="true"></svg>
          <div class="ll-marco" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <p class="ll-coord" id="llCoord" aria-hidden="true"></p>
        </div>
        <div class="ll-capitulos">
          <section class="ll-cap ll-cap--1">
            <div class="ll-bitacora ll-velo">
              <a class="srv-brand cg-marca" href="#/select-region" aria-label="étoile, regiones">${Rosa.html('brilla', { size: 18, tema: 'noche' })}<span class="accent">étoile</span><span class="cg-cliente">${escapeHtml(cliente)}</span></a>
              <p class="ll-linea">Bitácora · ${escapeHtml(fecha)} · ${hora}&nbsp;h</p>
              <h1 class="cg-saludo" id="llSaludo">${CG.saludo()}</h1>
              <p class="ll-entrada" id="llEntrada"><span class="sr-only">${datos.entrada.replace(/<[^>]+>/g, '')}</span><span class="ll-fantasma" aria-hidden="true">${datos.entrada}</span><span id="llTecla" aria-hidden="true"></span></p>
              <p class="ll-baja" aria-hidden="true">Desliza · el cielo sigue al sur <i>↓</i></p>
            </div>
          </section>
          <section class="ll-cap ll-cap--2" aria-labelledby="llApTit">
            <div class="ll-panel ll-velo">
              <p class="ll-linea" id="llApTit">Apuntes de la noche</p>
              <ol class="ll-apuntes">${datos.apuntes.map(apunte).join('')}</ol>
            </div>
          </section>
          <section class="ll-cap ll-cap--3" aria-labelledby="llFinTit">
            <div class="ll-final ll-velo">
              <p class="ll-linea">El cielo completo</p>
              <h2 id="llFinTit">${g.suc.length} sucursales en ${g.orden.length} regiones</h2>
              <p class="ll-resumen">${resumen}</p>
              <p class="ll-pista" id="llPista">Toca una región en el mapa para entrar, o mira todas juntas.</p>
              <a class="ll-ir" href="#/select-region" id="llIr"><span class="ll-ir-rosa">${Rosa.html('brilla', { size: 20, tema: 'papel' })}</span>Ver las regiones <span aria-hidden="true">→</span></a>
            </div>
          </section>
        </div>
      </section>`;

    this.enlaza(datos);
    this.camara();
    this.arma(datos);
  },


  /** Cifras: regiones (con estado y cambio contra el mes anterior), entrada de la bitácora y los tres apuntes */
  async datos() {
    const SR = SelectRegionView;
    if (!DataLoader.currentYear) await DataLoader.init();
    if (!SR.selectedYear || !SR.selectedMonth) { const p = SR.getDefaultPeriod(); SR.selectedYear = p.year; SR.selectedMonth = p.month; }
    const y = SR.selectedYear, m = SR.selectedMonth, [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    DataLoader.setMonth(y, m);
    const [curr, prev] = await Promise.all([DataLoader.loadBrandData(y, m), DataLoader.loadBrandData(py, pm)]);
    const media = rv => rv.length ? rv.reduce((a, r) => a + r.stars, 0) / rv.length : 0;
    const recientes = Metrics.unrepliedComplaints(curr.concat(prev)).filter(r => Briefing.ageDays(r) <= Briefing.WINDOW_DAYS);
    const stats = {};
    Object.entries(REGION_NAME_MAP).forEach(([id, name]) => {
      const c = curr.filter(r => r.region === id), p = prev.filter(r => r.region === id);
      stats[id] = { id, name, avg: media(c), count: c.length, prevAvg: media(p), prevCount: p.length, unreplied: recientes.filter(r => r.region === id).length };
    });
    const reg = CieloGrupo.calcula(curr, stats);
    const suc = CieloGrupo.geo().suc, meta = Brillo.BRILLA, C = media(curr);
    const mes = (yy, mm) => new Date(yy, mm - 1, 15).toLocaleDateString('es-MX', { month: 'long' });
    const b = v => `<b>${v}</b>`, plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

    // Entrada: el grupo contra la meta, la región que más brilla y la que más pide atención (brillo ajustado)
    const con = Brillo.ordena(Object.values(reg).filter(d => d.count));
    let entrada;
    if (!curr.length) entrada = `El grupo aún no tiene reseñas en ${mes(y, m)}.`;
    else {
      const d = C - meta;
      entrada = `El grupo va en ${b(C.toFixed(2))} en ${mes(y, m)}, ${b(Math.abs(d).toFixed(2))} ${d >= 0 ? 'sobre' : 'bajo'} la meta de ${b(meta.toFixed(2))}, con ${b(curr.length)} ${curr.length === 1 ? 'reseña' : 'reseñas'}.`;
      if (con.length > 1) {
        const mejor = con[0], peor = con[con.length - 1];
        entrada += ` ${escapeHtml(mejor.nombre)} es la región que más brilla (${b(mejor.avg.toFixed(2))}); ${escapeHtml(peor.nombre)}, la que más pide atención (${b(peor.avg.toFixed(2))}${peor.count < Narrative.MIN_SAMPLE ? `, ${plural(peor.count, 'reseña', 'reseñas')}` : ''}).`;
      }
    }

    // Lo urgente: quejas sin respuesta (graves y viejas) y sucursales que se apagan
    const apagan = suc.filter(s => s.estado && s.estado.id === 'apaga').length;
    const graves = recientes.filter(r => Severity.isCritical(r)).length, viejas = recientes.filter(r => Briefing.ageDays(r) > 3).length;
    const urg = [];
    if (recientes.length) urg.push(`${plural(recientes.length, 'queja', 'quejas')} sin respuesta${graves ? ` (${graves} ${graves === 1 ? 'grave' : 'graves'})` : ''}${viejas ? `, ${viejas} con más de 3 días` : ''}`);
    if (apagan) urg.push(plural(apagan, 'sucursal se apaga', 'sucursales se apagan'));
    const urgente = urg.length ? `${urg.join('; ')}.` : 'Nada urgente: sin quejas abiertas y ninguna sucursal se apaga.';

    // Lo que mejoró: la región que más subió contra el mes anterior (con muestra suficiente en los dos meses)
    const min = Narrative.MIN_SAMPLE;
    const subio = Object.values(stats).filter(s => s.count >= min && s.prevCount >= min).map(s => ({ ...s, d: s.avg - s.prevAvg })).sort((a, b2) => b2.d - a.d)[0];
    const mejoro = subio && subio.d > .005 ? `${escapeHtml(subio.name)} subió ${subio.d.toFixed(2)} contra ${mes(py, pm)}.` : `Ninguna región subió contra ${mes(py, pm)}.`;

    // Lo que viene: cuánto falta para cerrar el mes, cuántas regiones van bajo la meta y la hora en que se juntan las quejas
    const hoy = BranchTime.parts(new Date().toISOString(), BranchTime.MONTH_TZ);
    const bajo = con.filter(d => d.avg < meta).length;
    let viene = hoy && hoy.year === y && hoy.month === m
      ? `Faltan ${plural(new Date(y, m, 0).getDate() - hoy.day, 'día', 'días')} para cerrar ${mes(y, m)}`
      : `${mes(y, m).replace(/^./, c => c.toUpperCase())} ya cerró`;
    viene += bajo ? `; ${plural(bajo, 'región va', 'regiones van')} bajo la meta.` : '; todas las regiones van sobre la meta.';
    const horas = new Array(24).fill(0);
    Metrics.complaints(curr).forEach(r => { const p = BranchTime.parts(r.publishedAtDate, BranchTime.tzFor(r)); if (p) horas[p.hour]++; });
    const pico = horas.map((v, h) => [h, v + horas[(h + 1) % 24]]).sort((a, b2) => b2[1] - a[1])[0];
    if (pico[1] >= 3) viene += ` Las quejas se juntan de ${String(pico[0]).padStart(2, '0')}:00 a ${String((pico[0] + 2) % 24).padStart(2, '0')}:00.`;

    return { reg, entrada, apuntes: [[urg.length ? 'alerta' : 'brilla', 'Lo urgente', urgente], ['nova', 'Lo que mejoró', mejoro], ['culmina', 'Lo que viene', viene]] };
  },


  /** Regiones: encender (cursor o foco) con su ficha y entrar (clic o Enter); capítulos que aparecen al llegar; salida */
  enlaza() {
    const sec = document.getElementById('llegada'), mapa = document.getElementById('llMapa'), ficha = document.getElementById('llFicha'), cielo = document.getElementById('llCielo');
    const enciende = r => {
      if (!this._listo || this._saliendo) return;
      mapa.classList.toggle('cg-foco', !!r);
      mapa.querySelectorAll('.ll-reg').forEach(e => e.classList.toggle('on', e.dataset.reg === r));
      if (!r) { ficha.hidden = true; return; }
      const d = CieloGrupo._reg[r], c = CieloGrupo.geo().cen[r], er = cielo.getBoundingClientRect();
      const pt = mapa.createSVGPoint(); pt.x = c[0]; pt.y = c[1]; const q = pt.matrixTransform(mapa.getScreenCTM());
      const x = q.x - er.left, y = q.y - er.top;
      ficha.innerHTML = CieloGrupo.fichaHtml(d);
      ficha.style.left = `${Math.max(12, Math.min(er.width - 252, x > er.width * .55 ? x - 256 : x + 18))}px`;
      ficha.hidden = false;
      const alto = ficha.offsetHeight || 200;
      ficha.style.top = `${Math.max(12, Math.min(er.height - alto - 12, y - alto / 2))}px`;
    };
    const entra = r => { if (this._listo && !this._saliendo) { this._saliendo = true; SelectRegionView.handleSelect(r); } };
    sec.querySelectorAll('.ll-reg').forEach(e => {
      ['pointerenter', 'focus'].forEach(t => e.addEventListener(t, () => enciende(e.dataset.reg)));
      ['pointerleave', 'blur'].forEach(t => e.addEventListener(t, () => enciende(null)));
      e.addEventListener('click', () => entra(e.dataset.reg));
      e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); entra(e.dataset.reg); } });
    });
    window.addEventListener('scroll', () => { if (!ficha.hidden) enciende(null); }, { passive: true });
    // Saltar: un toque en el cielo o Esc mientras se arma lo deja armado (el scroll no lo interrumpe)
    cielo.addEventListener('pointerdown', () => this.termina());
    const esc = ev => { if (!sec.isConnected) { document.removeEventListener('keydown', esc); return; } if (ev.key === 'Escape') this.termina(); };
    document.addEventListener('keydown', esc);
    // Cada capítulo entra al llegar a él
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('ver'); io.unobserve(e.target); } }), { threshold: .3 });
    sec.querySelectorAll('.ll-cap--2, .ll-cap--3').forEach(c => io.observe(c));
    document.getElementById('llIr').addEventListener('click', ev => {
      if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault(); this.aRegiones();
    });
  },

  /** Encuadre: la caja de la toma dentro del hueco que deja el texto → viewBox de toda la pantalla */
  encuadre({ caja: [x0, y0, x1, y1], m: [l, t, r, b] }, W, H) {
    const iw = W * (1 - l - r), ih = H * (1 - t - b), bw = x1 - x0, bh = y1 - y0, k = Math.min(iw / bw, ih / bh);
    return [x0 - (W * l + (iw - bw * k) / 2) / k, y0 - (H * t + (ih - bh * k) / 2) / k, W / k, H / k];
  },

  /** Cámara: el scroll de la página elige entre las tres tomas (con curva suave) y la cámara la sigue con amortiguación */
  camara() {
    const sec = document.getElementById('llegada'), mapa = document.getElementById('llMapa'), cielo = document.getElementById('llCielo'), coord = document.getElementById('llCoord');
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const suave = x => x * x * (3 - 2 * x);
    const meta = () => {
      const W = cielo.clientWidth, H = cielo.clientHeight, tomas = this.TOMAS[W / H < .9 ? 'alta' : 'ancha'].map(t => this.encuadre(t, W, H));
      const rec = sec.getBoundingClientRect(), p = Math.max(0, Math.min(1, -rec.top / Math.max(1, rec.height - H))) * (tomas.length - 1);
      const i = Math.min(tomas.length - 2, Math.floor(p)), f = suave(p - i);
      return tomas[i].map((v, k) => v + (tomas[i + 1][k] - v) * f);
    };
    const pon = vb => {
      mapa.setAttribute('viewBox', vb.map(v => v.toFixed(2)).join(' '));
      // lectura de instrumento: latitud y longitud del centro de la toma
      const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2, lat = 33.5 - cy / CieloGrupo.K, lng = 118 - cx / (CieloGrupo.COS * CieloGrupo.K);
      coord.textContent = `${lat.toFixed(2)}° N · ${lng.toFixed(2)}° O`;
    };
    let antes = performance.now();
    const paso = now => {
      if (!sec.isConnected) return;
      const dt = Math.min(.05, (now - antes) / 1000); antes = now;
      const obj = meta();
      if (!this._cam || quieto) this._cam = obj;
      else { const a = 1 - Math.exp(-dt * 5.5); this._cam = this._cam.map((v, k) => v + (obj[k] - v) * a); }
      pon(this._cam);
      const falta = this._cam.some((v, k) => Math.abs(v - obj[k]) > .02);
      this._camRaf = falta ? requestAnimationFrame(paso) : 0;
    };
    const mueve = () => { if (!sec.isConnected) { window.removeEventListener('scroll', mueve); window.removeEventListener('resize', mueve); return; } if (!this._camRaf) { antes = performance.now(); this._camRaf = requestAnimationFrame(paso); } };
    window.addEventListener('scroll', mueve, { passive: true });
    window.addEventListener('resize', mueve);
    this._cam = meta(); pon(this._cam);
  },

  /** El cielo se arma: la Rosa se reparte, las estrellas llegan con resorte y cada región se une al llegar las suyas */
  arma(datos) {
    const sec = document.getElementById('llegada'), mapa = document.getElementById('llMapa'), cielo = document.getElementById('llCielo');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.termina(); return; }
    const arranca = () => {
      if (!sec.isConnected || this._listo) return;
      sec.classList.add('ll--arma');
      const g = CieloGrupo.geo();
      // Origen: el centro de la pantalla en unidades del mapa (donde está la Rosa del login)
      const er = cielo.getBoundingClientRect(), pt = mapa.createSVGPoint();
      pt.x = er.left + er.width / 2; pt.y = er.top + er.height * .42; const o = pt.matrixTransform(mapa.getScreenCTM().inverse());
      const nodos = [...mapa.querySelectorAll('.ll-suc')].map(el => {
        const s = g.suc.find(x => x.id === el.dataset.suc), a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
        return { el, s, r: s.r, x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: 380 + Math.random() * 520 };
      });
      // La Rosa del login (la del cierre de «la Rosa nace») aparece y se reparte
      const viaje = document.getElementById('llViaje'), est = Rosa.Estrella(viaje, 48, 'noche');
      viaje.style.top = `${er.height * .42}px`;
      est.salta(Rosa.estadoDe({ p: { L: 1, S: .5 }, col: '#FFC27A' }, { carta: 1, grabado: 1, temp: 1 }, 'noche'));
      setTimeout(() => est.a(Rosa.estadoDe({ p: { L: .09, S: .09, F: .09, I: .09 }, col: '#FFC27A' }, { carta: 0, grabado: 0 }, 'noche')), 320);
      viaje.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.08)', offset: .35 }, { opacity: 0, transform: 'scale(.2)' }], { duration: 760, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
      setTimeout(() => this.escribe(datos), 900);
      const unidas = new Set(), t0 = performance.now(); let antes = t0;
      const paso = now => {
        if (!sec.isConnected || this._listo) return;
        const t = now - t0, dt = Math.min(.033, (now - antes) / 1000); antes = now;
        const quietas = {};
        nodos.forEach(n => {
          if (t < n.t0) { n.el.setAttribute('transform', `translate(${n.x.toFixed(2)} ${n.y.toFixed(2)}) scale(0)`); quietas[n.r] = false; return; }
          // resorte (k 60, amortiguación 11): cruza un poco su lugar y se asienta
          n.vx += ((n.s.p[0] - n.x) * 60 - n.vx * 11) * dt; n.vy += ((n.s.p[1] - n.y) * 60 - n.vy * 11) * dt;
          n.x += n.vx * dt; n.y += n.vy * dt;
          const lejos = Math.hypot(n.s.p[0] - n.x, n.s.p[1] - n.y), k = Math.min(1, (t - n.t0) / 260);
          n.el.setAttribute('transform', `translate(${n.x.toFixed(2)} ${n.y.toFixed(2)}) scale(${(.35 + .65 * k).toFixed(3)})`);
          if (quietas[n.r] !== false) quietas[n.r] = lejos < .35 && Math.hypot(n.vx, n.vy) < 2;
        });
        if (t > 260) sec.classList.add('ll--mx');
        Object.entries(quietas).forEach(([r, q]) => { if (q && !unidas.has(r)) { unidas.add(r); mapa.querySelector(`.ll-reg[data-reg="${r}"]`).classList.add('unida'); } });
        if (unidas.size === Object.keys(quietas).length || t > 4200) { this.termina(); return; }
        this._raf = requestAnimationFrame(paso);
      };
      this._raf = requestAnimationFrame(paso);
    };
    // Si el cargador aún cubre la pantalla, el cielo espera a que la descubra
    const cargador = document.getElementById('lcp-loader');
    if (cargador && cargador.style.display !== 'none' && !window.ETOILE_REVELADA) window.addEventListener('etoile:revela', () => setTimeout(arranca, 120), { once: true });
    else requestAnimationFrame(arranca);
  },

  /** La entrada de la bitácora se escribe letra por letra */
  escribe(datos) {
    const host = document.getElementById('llTecla'); if (!host || this._listo) return;
    const tokens = datos.entrada.split(/(<[^>]+>)/).filter(Boolean);
    let i = 0, j = 0, salida = '';
    clearInterval(this._tecleo);
    this._tecleo = setInterval(() => {
      if (!host.isConnected) { clearInterval(this._tecleo); return; }
      if (i >= tokens.length) { clearInterval(this._tecleo); host.innerHTML = datos.entrada; return; }
      const t = tokens[i];
      if (t.startsWith('<')) { salida += t; i++; return; }
      salida += t[j++] || ''; if (j >= t.length) { i++; j = 0; }
      host.innerHTML = salida + '<span class="ll-cursor"></span>';
    }, 16);
  },

  /** Todo en su lugar: estrellas, constelaciones y la entrada completa; desde aquí el mapa responde */
  termina() {
    const sec = document.getElementById('llegada'); if (!sec || this._listo) return;
    this._listo = true; cancelAnimationFrame(this._raf);
    const g = CieloGrupo.geo();
    sec.querySelectorAll('.ll-suc').forEach(el => { const s = g.suc.find(x => x.id === el.dataset.suc); el.setAttribute('transform', `translate(${s.p[0].toFixed(2)} ${s.p[1].toFixed(2)})`); });
    sec.querySelectorAll('.ll-reg').forEach(e => e.classList.add('unida'));
    sec.classList.add('ll--arma', 'll--mx', 'll--listo');
    // la entrada que falta se completa de golpe (el lector de pantalla ya la tenía completa)
    clearInterval(this._tecleo);
    const tecla = document.getElementById('llTecla'); if (tecla) tecla.innerHTML = this._entrada;
  },

  /**
   * «Ver las regiones»: la estrella del botón sale como cometa (estela dibujada en canvas) hacia la marca de la página de
   * regiones. Un telón de la misma noche cubre mientras las regiones se pintan debajo; cuando el cometa llega, la noche se
   * cierra en círculo sobre la marca, que destella, y la página aparece por capas.
   */
  aRegiones() {
    if (this._saliendo) return; this._saliendo = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { Router.navigate('#/select-region'); return; }
    this.termina();
    const sec = document.getElementById('llegada'), r0 = document.querySelector('#llIr .ll-ir-rosa').getBoundingClientRect();
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    const capa = document.createElement('div'); capa.className = 'll-capa'; capa.setAttribute('aria-hidden', 'true');
    capa.innerHTML = `<div class="ll-telon"></div><canvas width="${Math.round(W * dpr)}" height="${Math.round(H * dpr)}"></canvas><div class="ll-cometa">${Rosa.html(Rosa.estadoDe('brilla', { halo: 1 }, 'noche'), { size: 26, tema: 'noche' })}</div>`;
    document.body.append(capa);
    sec.classList.add('ll--sale');
    const telon = capa.querySelector('.ll-telon'), cv = capa.querySelector('canvas'), ctx = cv.getContext('2d'), cometa = capa.querySelector('.ll-cometa');
    ctx.scale(dpr, dpr);
    telon.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    const s = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let fin = null, listo = false, marca = null;
    setTimeout(() => {
      window.addEventListener('etoile:route-rendered', () => {
        marca = document.querySelector('#cieloGrupo .cg-marca .rosa');
        if (marca) { const r = marca.getBoundingClientRect(); fin = [r.left + r.width / 2, r.top + r.height / 2]; marca.classList.add('cg-marca-espera'); }
        const w = document.querySelector('.srv-wrapper'); if (w) w.classList.add('srv--llega');
        listo = true;
      }, { once: true });
      Router.navigate('#/select-region');
    }, 300);
    // Destino aproximado (la marca del encabezado de las regiones) hasta medir el real; el cambio se suaviza
    let e = [Math.max(20, (W - 1240) / 2) + 109, 85];
    const bez = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;
    const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const estela = [], dur = 1700, VIDA = 520;
    let t = 0, antes = performance.now(), cerrado = false;
    const cierra = e => {
      cerrado = true;
      // la noche se cierra en círculo sobre la marca
      telon.animate([{ clipPath: `circle(${Math.hypot(W, H)}px at ${e[0]}px ${e[1]}px)` }, { clipPath: `circle(0px at ${e[0]}px ${e[1]}px)` }], { duration: 1050, easing: 'cubic-bezier(.7, 0, .2, 1)', fill: 'forwards' });
    };
    const paso = now => {
      const dt = now - antes; antes = now;
      // mientras la página de regiones no está pintada, el cometa desacelera al acercarse (nunca se detiene en seco)
      const v = listo ? 1 : Math.max(.08, Math.min(1, (.94 - t) / .34)); t = Math.min(1, t + dt / dur * v);
      if (fin) { const a = 1 - Math.exp(-dt / 90); e = [e[0] + (fin[0] - e[0]) * a, e[1] + (fin[1] - e[1]) * a]; }
      const c = [s[0] - (s[0] - e[0]) * .2 + W * .08, e[1] + (s[1] - e[1]) * .12];
      const u = ease(t), x = bez(s[0], c[0], e[0], u), y = bez(s[1], c[1], e[1], u);
      if (t < 1) estela.push([x, y, now]);
      while (estela.length && now - estela[0][2] > VIDA) estela.shift();
      ctx.clearRect(0, 0, W, H); ctx.lineCap = 'round';
      for (let i = 1; i < estela.length; i++) {
        const [xa, ya, ta] = estela[i - 1], [xb, yb] = estela[i], a = Math.max(0, 1 - (now - ta) / VIDA);
        ctx.strokeStyle = `rgba(255, 194, 122, ${(a * .9).toFixed(3)})`; ctx.lineWidth = .6 + a * a * 6;
        ctx.shadowColor = 'rgba(255, 194, 122, .9)'; ctx.shadowBlur = 14 * a;
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
      }
      const esc = 1.3 - .6 * u;   // llega del tamaño de la marca
      cometa.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${esc.toFixed(3)}) rotate(${(u * 200).toFixed(1)}deg)`;
      if (listo && t > .8 && !cerrado) cierra(e);
      if (t >= 1 && fin) e = fin;
      if (t < 1 || estela.length) requestAnimationFrame(paso);
      else aterriza();
    };
    const aterriza = () => {
      if (marca) { marca.classList.remove('cg-marca-espera'); marca.classList.add('cg-marca-llega'); }
      cometa.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      setTimeout(() => { capa.remove(); this._saliendo = false; }, 420);
    };
    requestAnimationFrame(paso);
  }
};
