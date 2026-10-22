/**
 * views/reporte.js — Compositor del reporte de sucursal (#/reporte/<id>), «bitácora directa» (2.1.0): sin panel lateral.
 * Arriba, los 12 meses como la curva de la calificación (se elige el mes tocando su punto). Las secciones se quitan y se
 * ponen sobre la hoja misma; el comentario se escribe en la hoja. Abajo, un dock de noche con las cuatro salidas.
 */
const ReporteView = {
  CLAVE_OP: 'etoile-reporte-op',
  SECCIONES: [['cifras', 'Números'], ['estado', 'Cómo cerró'], ['tendencia', '12 meses'], ['quejas', 'Quejas'], ['halagos', 'Halagos'], ['nota', 'Comentario']],
  _r: null, _op: null, _curva: null,

  async render({ id }) {
    Charts.destroyAll();
    const meta = getBranchById(id), app = document.getElementById('app');
    if (!meta) { app.innerHTML = ''; return; }
    let op = { formato: 'completo', cifras: true, estado: true, tendencia: true, quejas: true, halagos: true, nota: true };
    try { op = { ...op, ...JSON.parse(localStorage.getItem(this.CLAVE_OP) || '{}') }; } catch (e) {}
    this._op = op;
    const sello = (idSig, extra) => Rosa.html(Rosa.estadoDe(idSig, extra || {}, 'noche'), { size: 22, tema: 'noche' });

    app.innerHTML = `
      ${buildTopbar(true, meta.nombre)}
      <section class="rb">
        <header class="rb-cab">
          <div class="rb-tit"><span class="eyebrow">Reporte de sucursal</span><h1>${escapeHtml(meta.nombre)}</h1>
            <p>Elige el mes en la curva. Quita o vuelve a poner secciones sobre la hoja, y escribe el comentario en ella.</p></div>
          <div class="rb-formato" role="radiogroup" aria-label="Formato">
            <button type="button" role="radio" data-formato="completo" aria-checked="${op.formato !== 'breve'}">Completo</button>
            <button type="button" role="radio" data-formato="breve" aria-checked="${op.formato === 'breve'}">Breve</button>
          </div>
        </header>
        <div class="rb-meses" id="rbMeses" aria-label="Mes del reporte"><p class="rp-cargando">Leyendo los últimos 12 meses…</p></div>
        <div class="rb-fuera" id="rbFuera" hidden></div>
        <div class="rb-hoja" id="rpVista" aria-live="polite"><p class="rp-cargando">Preparando la hoja…</p></div>
      </section>
      <div class="rb-dock" role="toolbar" aria-label="Salidas del reporte">
        <button type="button" class="rb-sello rb-sello--prim" id="rpPdf">${sello('recompensa')}<span>Guardar PDF</span></button>
        <button type="button" class="rb-sello" id="rpTarjeta">${sello('brilla', { grabado: 1 })}<span>Tarjeta</span></button>
        <button type="button" class="rb-sello" id="rpTexto">${sello('halago')}<span>Texto</span></button>
        <button type="button" class="rb-sello" id="rpDoc">${sello('polar')}<span>Documento</span></button>
        <p class="rb-estado" id="rpEstado" role="status" aria-live="polite"></p>
      </div>
      ${buildFooter(`${meta.nombre} · ${getRegionName(meta.region || activeRegion)}`)}`;

    if (!document.getElementById('css-hoja')) { const st = document.createElement('style'); st.id = 'css-hoja'; st.textContent = Reporte.CSS; document.head.append(st); }
    const estado = t => { const el = document.getElementById('rpEstado'); if (el) el.textContent = t; };
    const guardaOp = () => { try { const { textoNota, ...o } = this._op; localStorage.setItem(this.CLAVE_OP, JSON.stringify(o)); } catch (e) {} };
    const claveNota = () => `etoile-reporte-nota:${meta.id}:${this._r.y}-${this._r.m}`;
    const leerNota = () => { try { return localStorage.getItem(claveNota()) || ''; } catch (e) { return ''; } };

    // La hoja: secciones con «quitar de la hoja»; las que están fuera, como estrellas para volver a ponerlas
    const pinta = () => {
      if (!this._r) return;
      this._op.textoNota = leerNota();
      const vista = document.getElementById('rpVista');
      vista.innerHTML = Reporte.html(this._r, this._op, true);
      vista.querySelectorAll('[data-sec]').forEach(sec => {
        const nombre = (this.SECCIONES.find(([k]) => k === sec.dataset.sec) || [])[1];
        sec.classList.add('hoja-ed');
        sec.insertAdjacentHTML('afterbegin', `<button type="button" class="hoja-quitar" data-quitar="${sec.dataset.sec}" aria-label="Quitar ${nombre} de la hoja">Quitar de la hoja</button>`);
      });
      const nota = document.getElementById('rpNota');
      if (nota) nota.addEventListener('input', () => { try { localStorage.setItem(claveNota(), nota.value); } catch (e) {} });
      const fuera = this.SECCIONES.filter(([k]) => !this._op[k]);
      const caja = document.getElementById('rbFuera');
      caja.hidden = !fuera.length;
      caja.innerHTML = fuera.length ? `<span>Fuera de la hoja</span>${fuera.map(([k, t]) => `<button type="button" class="rb-poner" data-poner="${k}">${Rosa.html('sin', { size: 14 })}<span>${t}</span><i aria-hidden="true">＋</i></button>`).join('')}` : '';
    };
    document.getElementById('rpVista').addEventListener('click', e => { const b = e.target.closest('[data-quitar]'); if (!b) return; this._op[b.dataset.quitar] = false; guardaOp(); pinta(); estado(''); });
    document.getElementById('rbFuera').addEventListener('click', e => { const b = e.target.closest('[data-poner]'); if (!b) return; this._op[b.dataset.poner] = true; guardaOp(); pinta(); });
    document.querySelector('.rb-formato').addEventListener('click', e => {
      const b = e.target.closest('[data-formato]'); if (!b) return;
      this._op.formato = b.dataset.formato; guardaOp();
      document.querySelectorAll('.rb-formato [data-formato]').forEach(x => x.setAttribute('aria-checked', x === b));
      pinta();
    });

    // La curva de los 12 meses (ancla: el mes más reciente con datos); tocar un punto carga ese mes
    const cargar = async (y, m) => {
      document.getElementById('rpVista').classList.add('cargando');
      this._r = await Reporte.datos(meta.id, y, m);
      document.getElementById('rpVista').classList.remove('cargando');
      pintaCurva(); pinta();
    };
    const pintaCurva = () => {
      const t = this._curva, host = document.getElementById('rbMeses');
      const W = 1000, H = 120, x0 = 30, x1 = W - 30, y0 = 26, y1 = H - 30;
      const vals = t.filter(p => p.avg != null).map(p => p.avg), lo = Math.min(4.2, Math.floor((Math.min(...vals, 5) - .1) * 10) / 10);
      const X = i => x0 + (x1 - x0) * i / (t.length - 1), Y = v => y1 - (y1 - y0) * (v - lo) / (5 - lo);
      let d = '', abierto = false;
      t.forEach((p, i) => { if (p.avg == null) { abierto = false; return; } d += `${abierto ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.avg).toFixed(1)}`; abierto = true; });
      const sel = i => this._r && t[i].y === this._r.y && t[i].m === this._r.m;
      // Puntos y etiquetas en HTML, ubicados en % del mismo sistema que la línea (que se estira con el ancho)
      const pos = (x, y) => `left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%`;
      const puntos = t.map((p, i) => {
        const s = sel(i), mes = `<span class="rb-mes-et${s ? ' sel' : ''}${p.avg == null ? ' vacio' : ''}" style="${pos(X(i), H - 12)}">${Reporte.mesCorto(p.y, p.m)}</span>`;
        if (p.avg == null) return mes;
        const est = Brillo.estado({ avg: p.avg, nTexto: Brillo.N_MIN, C: p.avg });
        return `<span class="rb-punto${s ? ' sel' : ''}" style="${pos(X(i), Y(p.avg))}">${Rosa.html(Rosa.deTienda(est), { size: s ? 26 : 14 })}${s ? `<b>${p.avg.toFixed(2)}</b>` : ''}</span>${mes}`;
      }).join('');
      host.innerHTML = `<div class="rb-curva"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <line x1="${x0}" x2="${x1}" y1="${Y(Brillo.BRILLA).toFixed(1)}" y2="${Y(Brillo.BRILLA).toFixed(1)}" class="meta"/><path d="${d}" class="l"/></svg>
          <span class="rb-meta" style="${pos(x1, Y(Brillo.BRILLA))}">meta ${Brillo.BRILLA.toFixed(2)}</span>${puntos}
          ${t.map((p, i) => `<button type="button" class="rb-mes${sel(i) ? ' sel' : ''}" style="left:${(X(i) / W * 100).toFixed(2)}%" ${p.avg == null ? 'disabled' : ''} data-ym="${p.y}-${p.m}" aria-pressed="${sel(i)}" aria-label="${Reporte.mesLargo(p.y, p.m)}${p.avg != null ? `: ${p.avg.toFixed(2)}` : ', sin reseñas'}"></button>`).join('')}</div>`;
      host.querySelectorAll('.rb-mes:not([disabled])').forEach(b => b.addEventListener('click', () => { const [y, m] = b.dataset.ym.split('-').map(Number); cargar(y, m); }));
    };

    // Salidas
    document.getElementById('rpPdf').addEventListener('click', () => { if (!this._r) return; this._op.textoNota = leerNota(); Reporte.pdf(this._r, this._op); estado('Elige «Guardar como PDF» en el diálogo.'); });
    document.getElementById('rpDoc').addEventListener('click', () => { if (!this._r) return; this._op.textoNota = leerNota(); Reporte.descargar(new Blob([Reporte.documento(this._r, this._op)], { type: 'text/html' }), `${this._r.folio}.html`); estado('Documento descargado.'); });
    document.getElementById('rpTarjeta').addEventListener('click', async () => { if (!this._r) return; estado('Dibujando la tarjeta…'); Reporte.descargar(await Reporte.tarjeta(this._r), `${this._r.folio}.png`); estado('Tarjeta descargada.'); });
    document.getElementById('rpTexto').addEventListener('click', async () => {
      if (!this._r) return; this._op.textoNota = leerNota();
      try { await navigator.clipboard.writeText(Reporte.texto(this._r, this._op)); estado('Texto copiado: pégalo en el chat o el correo.'); }
      catch (e) { estado('No se pudo copiar automáticamente.'); }
    });

    // Primer mes: el más reciente con datos de la región
    let y0 = DataLoader.currentYear, m0 = DataLoader.currentMonth;
    for (let k = 0; k < 12; k++) { const [y, m] = Reporte.atras(DataLoader.currentYear, DataLoader.currentMonth, k); if (DataLoader.hasMonth(y, m)) { y0 = y; m0 = m; break; } }
    this._r = await Reporte.datos(meta.id, y0, m0);
    this._curva = this._r.tendencia;
    pintaCurva(); pinta();
  }
};
