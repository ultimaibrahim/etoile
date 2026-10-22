/**
 * reporte.js — Reporte de sucursal (2.1.0), al estilo de los reportes de SIGNO: un pliego con folio propio que se
 * compone en vivo y sale como PDF (solo el pliego, no la página), tarjeta para compartir, texto para chat o documento.
 * Datos (Reporte.datos) separados del dibujo (html, texto, tarjeta, documento). Las cifras siguen las reglas de Étoile:
 * queja = 1–2★ con texto (Metrics), estado y señal con el brillo ajustado (Brillo), horas en la zona de cada sucursal.
 */
const Reporte = {
  /** Folio: RE-AAAA-MM-ABR (ABR = abreviatura de la sucursal en letras, sin acentos, 4 como máximo) */
  folio(meta, y, m) {
    const abr = String(meta.abr || meta.nombre || 'SUC').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
    return `RE-${y}-${String(m).padStart(2, '0')}-${abr}`;
  },

  mesLargo(y, m) { const t = MONTH_NAMES[m - 1]; return `${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()} ${y}`; },
  mesCorto(y, m) { return MONTH_NAMES[m - 1].slice(0, 3).toLowerCase(); },
  atras(y, m, k) { const t = y * 12 + (m - 1) - k; return [Math.floor(t / 12), t % 12 + 1]; },

  /** Carga lo necesario (12 meses hasta el elegido) y arma los datos del reporte */
  async datos(branchId, y, m) {
    const meta = getBranchById(branchId);
    const meses = Array.from({ length: 12 }, (_, k) => this.atras(y, m, 11 - k));
    await Promise.all(meses.filter(([a, b]) => DataLoader.hasMonth(a, b)).map(([a, b]) => DataLoader.loadMonth(a, b)));
    const ids = SUCURSALES_META.some(s => s.id === meta.id) ? SUCURSALES_META.map(s => s.id) : [meta.id];
    const brillo = DataLoader.brillo(y, m, ids), br = brillo[meta.id];
    const rv = DataLoader.getReviewsForBranch(y, m, meta.id);
    const [py, pm] = this.atras(y, m, 1), prev = DataLoader.computeBranchStats(py, pm, meta.id);
    const ranking = Brillo.ordena(ids.map(id => ({ id, estado: brillo[id].estado }))).filter(r => r.estado.id !== 'sin');
    const posicion = ranking.findIndex(r => r.id === meta.id) + 1;
    const quejas = Metrics.complaints(rv);
    const pendientes = Metrics.unrepliedComplaints(rv).sort((a, b) => (Severity.isCritical(b) - Severity.isCritical(a)) || Date.parse(a.publishedAtDate) - Date.parse(b.publishedAtDate));
    const temas = { Servicio: 0, Calidad: 0, Valor: 0 };
    quejas.forEach(r => {
      const c = r.classification && r.classification.es_queja && r.classification.categoria_queja;
      const tiene = k => c ? !!c[k] : classifyReviewCategory(r.text, COMPLAINT_KEYWORDS[k]);
      if (tiene('servicio')) temas.Servicio++; if (tiene('calidad')) temas.Calidad++; if (tiene('valor')) temas.Valor++;
    });
    const halagos = rv.filter(r => r.stars === 5 && Metrics.hasText(r) && r.text.trim().length >= 30).sort((a, b) => b.text.length - a.text.length).slice(0, 3);
    const tendencia = meses.map(([a, b]) => { const s = DataLoader.computeBranchStats(a, b, meta.id); return { y: a, m: b, avg: s.count ? s.avg : null, count: s.count }; });
    return {
      meta, y, m, folio: this.folio(meta, y, m), mes: this.mesLargo(y, m), region: getRegionName(meta.region || activeRegion),
      cliente: typeof CLIENTE !== 'undefined' ? CLIENTE.nombre : '',
      avg: br.avg, count: br.count, nTexto: br.nTexto, prev, br, posicion, deN: ranking.length,
      quejas: quejas.length, graves: quejas.filter(r => Severity.isCritical(r)).length, pendientes, temas, halagos, tendencia
    };
  },

  esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  num(v, d = 2) { return v == null || !(v > 0) ? '—' : Number(v).toFixed(d); },
  delta(a, b, d = 2, unidad = '') {
    if (a == null || b == null || !(b > 0) || !(a > 0) || a === b) return '';
    const x = a - b; return `<em>${x > 0 ? '▲' : '▼'} ${Math.abs(x).toFixed(d)}${unidad} vs. mes anterior</em>`;
  },

  /** Tendencia de 12 meses en SVG, a escala: meta 4.60 punteada, puntos con su promedio, meses sin reseñas como hueco */
  graficaSVG(t) {
    const W = 640, H = 170, x0 = 34, x1 = W - 12, y0 = 14, y1 = H - 30;
    const vals = t.filter(p => p.avg != null).map(p => p.avg), lo = Math.min(4.2, Math.floor((Math.min(...vals, 5) - .1) * 10) / 10), hi = 5;
    const X = i => x0 + (x1 - x0) * i / (t.length - 1), Y = v => y1 - (y1 - y0) * (v - lo) / (hi - lo);
    let tramos = [], cur = [];
    t.forEach((p, i) => { if (p.avg == null) { if (cur.length) tramos.push(cur); cur = []; } else cur.push([X(i), Y(p.avg)]); });
    if (cur.length) tramos.push(cur);
    const linea = tramos.map(tr => 'M' + tr.map(q => q.map(v => v.toFixed(1)).join(' ')).join('L')).join('');
    const marcas = []; for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-9; v += .5) marcas.push(v);   // cada 0.5, en valores redondos
    const ticks = marcas.map(v => `<text x="${x0 - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v.toFixed(1)}</text><line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" class="g"/>`).join('');
    const meta = `<line x1="${x0}" x2="${x1}" y1="${Y(Brillo.BRILLA)}" y2="${Y(Brillo.BRILLA)}" class="m"/><text x="${x1}" y="${Y(Brillo.BRILLA) - 5}" text-anchor="end" class="mt">meta ${Brillo.BRILLA.toFixed(2)}</text>`;
    const pts = t.map((p, i) => p.avg == null ? '' : `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.avg).toFixed(1)}" r="${i === t.length - 1 ? 4.5 : 2.6}" class="${p.avg >= Brillo.BRILLA ? 'pb' : p.avg >= Brillo.TENUE ? 'pt' : 'pa'}"/>`).join('');
    const meses = t.map((p, i) => `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${this.mesCorto(p.y, p.m)}</text>`).join('');
    const ult = t[t.length - 1];
    const etiqueta = ult.avg != null ? `<text x="${X(t.length - 1) - 8}" y="${Y(ult.avg) - 9}" text-anchor="end" class="v">${ult.avg.toFixed(2)}</text>` : '';
    return `<svg class="hoja-graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calificación mensual de los últimos 12 meses">${ticks}${meta}<path d="${linea}" class="l"/>${pts}${etiqueta}${meses}</svg>`;
  },

  /** El pliego (misma hoja en pantalla, en el PDF y en el documento) */
  /** edit: la hoja dentro del compositor (secciones marcadas para quitar o poner, comentario editable en la hoja) */
  html(r, op, edit = false) {
    const e = this.esc, br = r.br, breve = op.formato === 'breve';
    const rosa = (() => { const est = Rosa.deTienda(br.estado, op.estado ? br.senal : null, br.inicio, 'papel'); if (br.estado.id === 'brilla' || br.estado.id === 'polar') est.carta = 1; return Rosa.html(est, { size: 112, tema: 'papel', label: br.lectura }); })();
    const pend = breve ? r.pendientes.slice(0, 3) : r.pendientes;
    const fila = x => `<tr><td class="n">${e(typeof reviewWhen === 'function' ? reviewWhen(x, 'short') : x.publishedAtDate.slice(0, 10))}</td><td class="n">${x.stars}★</td><td>${Severity.isCritical(x) ? '<b class="grave">Grave</b> ' : ''}${e((x.text || '').trim().replace(/\s+/g, ' ').slice(0, breve ? 110 : 220))}${(x.text || '').length > (breve ? 110 : 220) ? '…' : ''}</td></tr>`;
    const evidencia = br.estado.id !== 'sin' && br.estado.fill < 1 ? ` Con ${r.nTexto} de ${Brillo.N_MIN} reseñas con texto, la estrella aún no está completa.` : '';
    return `<article class="hoja" aria-label="Reporte ${e(r.folio)}">
      <header class="hoja-cab">
        <div><div class="hoja-marca">${Rosa.html('brilla', { size: 26, tema: 'papel' })}<span>étoile</span><i>Reporte de sucursal</i></div>
          <h1>${e(r.meta.nombre)}</h1><p class="hoja-sub">${e(r.mes)} · ${e(r.region)}${r.cliente ? ` · ${e(r.cliente)}` : ''}</p></div>
        <div class="hoja-folio"><b>${e(r.folio)}</b>${e(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }))}</div>
      </header>
      ${op.cifras ? `<section data-sec="cifras"><h2>El mes en números</h2><div class="hoja-cifras">
        <div><b>${this.num(r.avg)}</b><span>calificación promedio</span>${this.delta(r.avg, r.prev.avg)}</div>
        <div><b>${r.count}</b><span>reseñas</span>${r.prev.count ? this.delta(r.count, r.prev.count, 0) : ''}</div>
        <div><b>${r.quejas}</b><span>quejas (1–2★ con texto)</span><em>${r.pendientes.length} sin respuesta${r.graves ? ` · ${r.graves} grave${r.graves === 1 ? '' : 's'}` : ''}</em></div>
        <div><b>${r.posicion || '—'}</b><span>lugar en ${e(r.region)}</span>${r.deN ? `<em>de ${r.deN} con reseñas</em>` : ''}</div></div></section>` : ''}
      ${op.estado ? `<section class="hoja-estado" data-sec="estado"><div class="hoja-rosa">${rosa}</div><div><h2>Cómo cerró</h2><p class="hoja-lectura">${e(br.lectura)}</p>
        <p class="hoja-sec">Estado: ${e(Brillo.lectura(br.estado).toLowerCase())}${br.senal ? `; señal: ${e(Brillo.NOMBRE_SENAL[br.senal].toLowerCase())}` : ''}. La forma usa el brillo ajustado (${br.estado.aj ? br.estado.aj.toFixed(2) : '—'}), que pide evidencia; el número es el promedio real.${e(evidencia)}${br.estado.id === 'brilla' || br.estado.id === 'polar' ? ' Cerró en la meta y gana su carta de 24 horas.' : ''}</p></div></section>` : ''}
      ${op.tendencia ? `<section data-sec="tendencia"><h2>Últimos 12 meses</h2>${this.graficaSVG(r.tendencia)}</section>` : ''}
      ${op.quejas ? `<section data-sec="quejas"><h2>Quejas${breve && r.pendientes.length > 3 ? ` (3 de ${r.pendientes.length} sin respuesta)` : ''}</h2>
        ${r.quejas ? `<p class="hoja-temas">${Object.entries(r.temas).filter(([, v]) => v).map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('') || '<span>Sin tema dominante</span>'}</p>` : ''}
        ${pend.length ? `<table><thead><tr><th>Cuándo</th><th>★</th><th>Sin respuesta</th></tr></thead><tbody>${pend.map(fila).join('')}</tbody></table>` : `<p class="hoja-sec">${r.quejas ? 'Todas las quejas del mes tienen respuesta.' : 'Sin quejas este mes.'}</p>`}</section>` : ''}
      ${op.halagos && r.halagos.length ? `<section data-sec="halagos"><h2>Lo que más gustó</h2>${(breve ? r.halagos.slice(0, 1) : r.halagos).map(x => `<blockquote>«${e(x.text.trim().replace(/\s+/g, ' ').slice(0, 280))}${x.text.length > 280 ? '…' : ''}»</blockquote>`).join('')}</section>` : ''}
      ${op.nota && edit ? `<section data-sec="nota"><h2>Comentario</h2><textarea class="hoja-nota hoja-nota-ed" id="rpNota" maxlength="1200" rows="3" placeholder="Escribe aquí lo más importante del mes: lo que se va a hacer y a quién se le pidió. Se guarda en este navegador.">${e(op.textoNota || '')}</textarea></section>`
        : op.nota && op.textoNota && op.textoNota.trim() ? `<section data-sec="nota"><h2>Comentario</h2><p class="hoja-nota">${e(op.textoNota.trim())}</p></section>` : ''}
      <footer class="hoja-pie"><span>Étoile, un sistema de Ultima Ibrahim</span><span>${e(location.host)}</span></footer>
    </article>`;
  },

  /** Texto para pegar en un chat o correo (con *negritas* de WhatsApp) */
  texto(r, op) {
    const l = [], br = r.br;
    l.push(`*étoile · Reporte ${r.folio}*`, `${r.meta.nombre} · ${r.mes} · ${r.region}`, '');
    if (op.cifras) l.push(`Calificación ${this.num(r.avg)} · Reseñas ${r.count} · Quejas ${r.quejas} (${r.pendientes.length} sin respuesta)${r.posicion ? ` · Lugar ${r.posicion} de ${r.deN} en ${r.region}` : ''}`, '');
    if (op.estado) l.push(`*Cómo cerró:* ${br.lectura}${br.senal ? ` (${Brillo.NOMBRE_SENAL[br.senal].toLowerCase()})` : ''}`, '');
    if (op.quejas && r.pendientes.length) { l.push('*Quejas sin respuesta*'); (op.formato === 'breve' ? r.pendientes.slice(0, 3) : r.pendientes).forEach(x => l.push(`• ${x.stars}★${Severity.isCritical(x) ? ' (grave)' : ''} ${(x.text || '').trim().replace(/\s+/g, ' ').slice(0, 120)}`)); l.push(''); }
    if (op.halagos && r.halagos.length) l.push('*Lo que más gustó*', `«${r.halagos[0].text.trim().replace(/\s+/g, ' ').slice(0, 200)}»`, '');
    if (op.nota && op.textoNota && op.textoNota.trim()) l.push('*Comentario*', op.textoNota.trim(), '');
    return l.join('\n').trim();
  },

  /** Hoja de estilo del pliego: papel claro propio, igual en pantalla, en el PDF y en el documento, en cualquier tema */
  CSS: `
.hoja { --tinta: #0E1636; --tinta-2: #4E5573; --papel: #F7F8FC; --linea: #DCE0EC; --acento: #2D47B5; --luz: #8A5A00; --luz-f: #D99A3A; --tenue: #5E5A50; --brasa: #B5361C;
  background: var(--papel); color: var(--tinta); border-radius: 18px; padding: clamp(20px, 4vw, 44px); font-family: "Plus Jakarta Sans", system-ui, sans-serif; line-height: 1.45; box-shadow: 0 30px 80px -34px rgba(10,15,36,.45); }
.hoja * { box-sizing: border-box; }
.hoja-cab { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 18px; border-bottom: 1px solid var(--linea); position: relative; }
.hoja-cab::after { content: ''; position: absolute; left: 0; right: 0; bottom: -5px; height: 3px; background: repeating-linear-gradient(90deg, var(--linea) 0 1px, transparent 1px calc(100% / 24)); }
.hoja-marca { display: flex; gap: 8px; align-items: center; color: var(--tinta-2); font: 500 13px/1 "JetBrains Mono", ui-monospace, monospace; }
.hoja-marca span { font: italic 600 20px/1 "Playfair Display", Georgia, serif; color: var(--tinta); }
.hoja-marca i { font-style: normal; padding-left: 8px; border-left: 1px solid var(--linea); }
.hoja h1 { margin: 12px 0 2px; font: 700 clamp(26px, 4vw, 36px)/1.05 "Playfair Display", Georgia, serif; letter-spacing: -.01em; }
.hoja-sub { margin: 0; color: var(--tinta-2); }
.hoja-folio { font: 500 13px/1.4 "JetBrains Mono", ui-monospace, monospace; color: var(--tinta-2); text-align: right; white-space: nowrap; }
.hoja-folio b { display: block; font-size: 15px; color: var(--tinta); }
.hoja section { margin-top: 26px; }
.hoja h2 { margin: 0 0 12px; font: 600 12px/1 "JetBrains Mono", ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--tinta-2); }
.hoja-cifras { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.hoja-cifras div { border: 1px solid var(--linea); border-radius: 12px; padding: 12px 14px; }
.hoja-cifras b { display: block; font: 500 28px/1.1 "JetBrains Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.hoja-cifras span { color: var(--tinta-2); font-size: 13px; }
.hoja-cifras em { display: block; font: 400 12px/1.3 "JetBrains Mono", ui-monospace, monospace; font-style: normal; color: var(--tinta-2); margin-top: 4px; }
.hoja-estado { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 18px; align-items: center; }
.hoja-rosa { display: grid; place-items: center; }
.hoja-lectura { margin: 0 0 6px; font: italic 600 26px/1.15 "Playfair Display", Georgia, serif; }
.hoja-sec { margin: 0; color: var(--tinta-2); font-size: 14px; max-width: 64ch; }
.hoja-graf { width: 100%; height: auto; display: block; }
.hoja-graf text { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--tinta-2); }
.hoja-graf .g { stroke: var(--linea); stroke-width: 1; }
.hoja-graf .m { stroke: var(--luz-f); stroke-width: 1.2; stroke-dasharray: 4 4; }
.hoja-graf .mt { fill: var(--luz); }
.hoja-graf .l { fill: none; stroke: var(--acento); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.hoja-graf .pb { fill: var(--luz-f); } .hoja-graf .pt { fill: var(--tenue); } .hoja-graf .pa { fill: var(--brasa); }
.hoja-graf .v { font: 600 12px "JetBrains Mono", ui-monospace, monospace; fill: var(--tinta); }
.hoja-temas { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
.hoja-temas span { border: 1px solid var(--linea); border-radius: 999px; padding: 4px 12px; font-size: 13px; color: var(--tinta-2); }
.hoja-temas b { color: var(--tinta); font-family: "JetBrains Mono", ui-monospace, monospace; }
.hoja table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.hoja th { text-align: left; font: 600 11px/1 "JetBrains Mono", ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--tinta-2); padding: 8px 6px; border-bottom: 1px solid var(--linea); }
.hoja td { padding: 9px 6px; border-bottom: 1px solid var(--linea); vertical-align: top; }
.hoja td.n { white-space: nowrap; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; color: var(--tinta-2); }
.hoja .grave { color: var(--brasa); font-size: 12px; }
.hoja blockquote { margin: 0 0 10px; padding: 10px 14px; border: 1px solid var(--linea); border-radius: 12px; font: italic 500 15px/1.5 "Playfair Display", Georgia, serif; }
.hoja-nota { margin: 0; padding: 12px 16px; border: 1px dashed var(--acento); border-radius: 12px; white-space: pre-wrap; }
.hoja-nota-ed { display: block; width: 100%; min-height: 84px; resize: vertical; background: transparent; color: var(--tinta); font: 400 15px/1.5 "Plus Jakarta Sans", system-ui, sans-serif; outline: none; }
.hoja-nota-ed:focus { border-style: solid; }
.hoja-pie { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--linea); display: flex; justify-content: space-between; gap: 12px; font: 400 12px "JetBrains Mono", ui-monospace, monospace; color: var(--tinta-2); }
@media (max-width: 600px) { .hoja-cifras { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hoja-estado { grid-template-columns: 1fr; } .hoja-cab { flex-direction: column; } .hoja-folio { text-align: left; } }
`,

  /** Documento autónomo (se abre en cualquier navegador; al imprimirlo sale solo la hoja) */
  documento(r, op) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${this.esc(r.folio)} · ${this.esc(r.meta.nombre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Playfair+Display:ital,wght@0,700;1,600&family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>body{margin:0;background:#E7EAF3;padding:clamp(12px,4vw,48px)}.hoja{max-width:880px;margin:0 auto}@page{margin:14mm}@media print{body{background:#fff;padding:0}.hoja{box-shadow:none;border-radius:0;padding:0;max-width:none}.hoja section,.hoja tr{break-inside:avoid}}${this.CSS}</style></head><body>${this.html(r, op)}</body></html>`;
  },

  /** PDF: imprime solo el pliego desde un marco oculto (el diálogo del sistema ofrece «Guardar como PDF») */
  pdf(r, op) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const d = f.contentDocument; d.open(); d.write(this.documento(r, op)); d.close();
    const listo = () => { try { f.contentWindow.document.title = `${r.folio} · ${r.meta.nombre}`; f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 60000); } };
    // espera las fuentes del documento para que el PDF no salga con las de respaldo
    (f.contentDocument.fonts ? f.contentDocument.fonts.ready : Promise.resolve()).then(() => setTimeout(listo, 250));
  },

  /** Tarjeta 1080×1350 para WhatsApp o Slack, de noche, con la Rosa de la sucursal */
  async tarjeta(r) {
    await Promise.all(['700 72px "Playfair Display"', '500 40px "JetBrains Mono"', '400 30px "Plus Jakarta Sans"'].map(f => document.fonts.load(f).catch(() => {})));
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), br = r.br;
    const fondo = x.createRadialGradient(W * .5, 260, 40, W * .5, 380, 1100); fondo.addColorStop(0, '#16204A'); fondo.addColorStop(.6, '#0A0F24'); fondo.addColorStop(1, '#070A19');
    x.fillStyle = fondo; x.fillRect(0, 0, W, H);
    let s = 11; const az = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 90; i++) { x.globalAlpha = .15 + az() * .45; x.fillStyle = '#ECE6D6'; x.beginPath(); x.arc(az() * W, az() * H, .6 + az() * 1.6, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    // la Rosa (con su carta si cerró en la meta), dibujada desde su SVG
    const est = Rosa.deTienda(br.estado, br.senal, br.inicio, 'noche'); if (br.estado.id === 'brilla' || br.estado.id === 'polar') est.carta = 1;
    est.grabado = 1;
    const svg = Rosa.html(est, { size: 520, tema: 'noche' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    await new Promise(ok => { const img = new Image(); img.onload = () => { x.drawImage(img, W - 80 - 470, 120, 470, 470); ok(); }; img.onerror = ok; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    x.fillStyle = '#9DB4FF'; x.font = '500 28px "JetBrains Mono", monospace'; x.fillText('étoile · Reporte de sucursal', 80, 120);
    x.fillStyle = '#ECE6D6'; x.font = '700 76px "Playfair Display", serif';
    let linea = '', yT = 250; for (const p of r.meta.nombre.split(' ')) { if (x.measureText(linea + p).width > 480 && linea) { x.fillText(linea.trim(), 80, yT); yT += 84; linea = ''; } linea += p + ' '; } x.fillText(linea.trim(), 80, yT);
    x.fillStyle = '#A9ADBE'; x.font = '400 32px "Plus Jakarta Sans", sans-serif'; x.fillText(`${r.mes} · ${r.region}`, 80, yT + 60);
    x.font = '500 26px "JetBrains Mono", monospace'; x.fillText(r.folio, 80, yT + 106);
    x.fillStyle = '#FFC27A'; x.font = 'italic 700 54px "Playfair Display", serif'; x.fillText(br.lectura, 80, 700);
    const cifras = [[this.num(r.avg), 'calificación'], [String(r.count), 'reseñas'], [String(r.quejas), 'quejas'], [r.posicion ? String(r.posicion) : '—', r.deN ? `lugar de ${r.deN} en ${r.region}` : `en ${r.region}`]];
    cifras.forEach(([v, t], i) => {
      const cx = 80 + (i % 2) * 470, cy = 770 + Math.floor(i / 2) * 190;
      x.strokeStyle = 'rgba(236,230,214,0.16)'; x.lineWidth = 2; x.beginPath(); x.roundRect(cx, cy, 440, 160, 24); x.stroke();
      x.fillStyle = '#ECE6D6'; x.font = '500 72px "JetBrains Mono", monospace'; x.fillText(v, cx + 32, cy + 92);
      x.fillStyle = '#A9ADBE'; x.font = '400 28px "Plus Jakarta Sans", sans-serif'; x.fillText(t, cx + 32, cy + 134);
    });
    x.fillStyle = '#A9ADBE'; x.font = '400 26px "JetBrains Mono", monospace';
    x.fillText(`${r.pendientes.length} queja${r.pendientes.length === 1 ? '' : 's'} sin respuesta`, 80, 1260); x.textAlign = 'right'; x.fillText(location.host, W - 80, 1260);
    return new Promise(ok => c.toBlob(ok, 'image/png'));
  },

  descargar(blob, nombre) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
};
