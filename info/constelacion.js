/* Constelación de sucursales sobre el mapa de México (solo en la página pública de Étoile).
 * Cada estrella es una sucursal (la Rosa de la Étoile, documentacion/marca.md); se encienden de la Ciudad de México hacia afuera.
 * Constelaciones en dos niveles: dentro de cada región, un árbol de expansión mínima entre sus tiendas (lleva el nombre de la
 * región); entre regiones, otro árbol entre sus centroides, empezando por CDMX.
 * Coordenadas a 3 decimales (~100 m), iguales a locations.latitude/longitude: 11 vienen del pin de su ficha de Google (2026-10-16)
 * y 22 se ubicaron a mano por su plaza y las confirmó Ibrahim (2026-10-20). Corre una vez; sin movimiento si el sistema lo pide. */
(function () {
  const host = document.getElementById('mapa');
  if (!host) return;

  // [región, latitud, longitud]
  const SUC = [
    ['CDMX', 19.387, -99.252], ['CDMX', 19.314, -99.219], ['CDMX', 19.415, -99.196], ['CDMX', 19.362, -99.276], ['CDMX', 19.357, -99.172],
    ['CDMX', 19.346, -99.179], ['CDMX', 19.440, -99.094], ['CDMX', 19.403, -99.242], ['CDMX', 19.357, -99.270], ['CDMX', 19.299, -99.137],
    ['CDMX', 19.442, -99.204], ['CDMX', 19.511, -99.234], ['CDMX', 19.430, -99.197], ['CDMX', 19.471, -99.119],
    ['GDL', 20.711, -103.412], ['GDL', 20.647, -103.320], ['GDL', 20.677, -103.432], ['GDL', 20.555, -103.469], ['GDL', 20.645, -103.412],
    ['GDL', 20.695, -103.376], ['GDL', 20.712, -103.375], ['GDL', 20.656, -103.399],
    ['MTY', 25.651, -100.335], ['MTY', 25.682, -100.354], ['MTY', 25.638, -100.314],
    ['TOL', 19.256, -99.616], ['TOL', 19.267, -99.606],
    ['QRO', 20.674, -100.436],
    ['SLP', 22.118, -101.006],
    ['AGS', 21.924, -102.289],
    ['LEON', 21.093, -101.625],
    ['CUN', 21.161, -86.808],
    ['TJ', 32.513, -116.965]
  ];
  const NOMBRE = { CDMX: 'Ciudad de México', GDL: 'Guadalajara', MTY: 'Monterrey', TOL: 'Toluca', QRO: 'Querétaro', SLP: 'San Luis Potosí', AGS: 'Aguascalientes', LEON: 'León', CUN: 'Cancún', TJ: 'Tijuana' };
  // Posición de la etiqueta respecto a la región (en unidades del mapa) para que no choquen en el Bajío
  const ETQ = { CDMX: [6, 7, 'start'], GDL: [-5, 9, 'end'], MTY: [5, -3, 'start'], TOL: [-5, 5, 'end'], QRO: [5, -1, 'start'], SLP: [5, -2, 'start'],
                AGS: [-3, -5, 'end'], LEON: [-3, 4, 'end'], CUN: [-4, -4, 'end'], TJ: [4, 6, 'start'] };

  // Contorno simplificado de México [longitud, latitud]: frontera norte, golfo, Yucatán, Pacífico y la península de Baja California
  const MX = [[-117.1,32.5],[-114.7,32.7],[-111,31.3],[-108.2,31.3],[-108.2,31.8],[-106.5,31.8],[-105,30.7],[-104.5,29.6],[-103.2,29],[-102.4,29.8],
    [-101.4,29.8],[-100.3,28.3],[-99.5,27.5],[-99.1,26.4],[-97.5,25.9],[-97.2,25],[-97.6,23.5],[-97.85,22.2],[-97.2,20.6],[-96.1,19.2],[-94.4,18.15],
    [-92.5,18.6],[-91.8,18.65],[-90.5,19.85],[-90.4,21],[-89.6,21.3],[-87,21.6],[-86.8,21.1],[-87.5,19.5],[-88.3,18.5],[-89.15,17.8],[-90.98,17.8],
    [-91,17.25],[-91.4,17.25],[-90.4,16.1],[-91.7,16.07],[-92.2,15.25],[-92.2,14.55],[-93.9,15.9],[-95.2,16.17],[-96.5,15.65],[-98.5,16.3],[-99.9,16.85],
    [-101.5,17.6],[-102.2,17.95],[-103.5,18.3],[-104.3,19.1],[-105.3,20],[-105.5,20.7],[-105.2,21.5],[-105.7,22.5],[-106.4,23.2],[-107.5,24.5],
    [-108.5,25.5],[-109.4,26.3],[-110,27],[-110.9,27.9],[-111.9,29],[-112.8,30.3],[-113.1,31.2],[-114.1,31.5],[-114.8,31.8],[-114.84,31],
    [-114.2,30],[-113.55,28.95],[-112.27,27.34],[-111.34,26],[-110.7,24.8],[-110.3,24.15],[-109.9,22.88],[-110.2,23.45],[-111.6,24.4],[-112.1,24.6],
    [-112.2,25.9],[-113.2,26.7],[-114.05,27.97],[-115.1,27.85],[-114.3,28.6],[-114.9,29.6],[-115.7,30.07],[-115.95,30.5],[-116.6,31.85]];

  // Proyección equirrectangular corregida a la latitud media de México
  const K = 10, COS = Math.cos(23 * Math.PI / 180);
  const P = (lat, lng) => [+((lng + 118) * COS * K).toFixed(1), +((33.5 - lat) * K).toFixed(1)];
  const W = Math.ceil((-86 + 118) * COS * K), H = Math.ceil((33.5 - 14) * K);

  const pts = SUC.map(([r, la, lo]) => ({ r, p: P(la, lo) }));
  const regs = {};
  pts.forEach(s => { (regs[s.r] = regs[s.r] || []).push(s); });
  const cen = Object.fromEntries(Object.entries(regs).map(([r, l]) => [r, [l.reduce((a, s) => a + s.p[0], 0) / l.length, l.reduce((a, s) => a + s.p[1], 0) / l.length]]));
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Árbol de expansión mínima entre regiones, creciendo desde la Ciudad de México: así se dibuja la constelación
  const orden = ['CDMX'], aristas = [];
  while (orden.length < Object.keys(cen).length) {
    let best = null;
    orden.forEach(a => Object.keys(cen).forEach(b => { if (!orden.includes(b) && (!best || d(cen[a], cen[b]) < best[2])) best = [a, b, d(cen[a], cen[b])]; }));
    orden.push(best[1]); aristas.push(best);
  }
  // Constelación regional: árbol de expansión mínima (Prim) entre las tiendas de cada región
  const regAristas = [];
  Object.entries(regs).forEach(([r, l]) => {
    const dentro = [l[0]];
    while (dentro.length < l.length) {
      let best = null;
      dentro.forEach(a => l.forEach(b => { if (!dentro.includes(b) && (!best || d(a.p, b.p) < best[2])) best = [a, b, d(a.p, b.p)]; }));
      dentro.push(best[1]); regAristas.push([r, best[0].p, best[1].p]);
    }
  });
  const t0 = 900, paso = 260; // el contorno se traza primero; luego cada región se enciende a su turno
  const turno = Object.fromEntries(orden.map((r, i) => [r, t0 + i * paso]));

  const outline = 'M' + MX.map(([lo, la]) => P(la, lo).join(' ')).join('L') + 'Z';
  const lines = aristas.map(([a, b]) => {
    const [x1, y1] = cen[a], [x2, y2] = cen[b];
    return `<line class="cl" pathLength="1" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="--t:${turno[b] - 120}ms"/>`;
  }).join('');
  const regLines = regAristas.map(([r, a, b]) => `<line class="cl cr" pathLength="1" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="--t:${turno[r] + 160}ms"/>`).join('');
  // Cada tienda es una Rosa (si rosa.js no cargó, un punto)
  const forma = r => typeof Rosa !== 'undefined' ? `<path class="cd" d="${Rosa.d(Rosa.par({}), r * 1.9)}"` : `<circle class="cd" r="${r}"`;
  const dots = pts.map((s, i) => `<g transform="translate(${s.p[0]} ${s.p[1]})">${forma(regs[s.r].length > 1 ? 1.3 : 1.9)} style="--t:${turno[s.r] + (i % 5) * 40}ms"/></g>`).join('');
  const halos = Object.entries(cen).map(([r, c]) => `<circle class="ch" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(3 + Math.sqrt(regs[r].length) * 2.2).toFixed(1)}" style="--t:${turno[r]}ms"/>`).join('');
  const labels = Object.entries(cen).map(([r, c]) => {
    const [dx, dy, an] = ETQ[r] || [4, -3, 'start'];
    return `<text class="ct${regs[r].length > 1 || r === 'TJ' || r === 'CUN' ? '' : ' ct-min'}" x="${(c[0] + dx).toFixed(1)}" y="${(c[1] + dy).toFixed(1)}" text-anchor="${an}" style="--t:${turno[r] + 180}ms">${NOMBRE[r] || r}</text>`;
  }).join('');

  host.innerHTML = `<svg viewBox="-4 -4 ${W + 8} ${H + 8}" role="img" aria-labelledby="mapaT">
    <title id="mapaT">Mapa de México con las ${pts.length} sucursales del primer cliente de Étoile, La Crêpe Parisienne, en ${orden.length} regiones, cada región unida como su propia constelación</title>
    <path class="cm" pathLength="1" d="${outline}"/>${lines}${regLines}${halos}${dots}${labels}</svg>
    <p class="mapa-pie">Primer cliente: La Crêpe Parisienne · <b>${pts.length}</b> sucursales en <b>${orden.length}</b> regiones</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('on')));

  // Después del trazo, las cifras cuentan hasta su valor: es parte del mismo momento de carga y nada se repite después
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  host.querySelectorAll('.mapa-pie b').forEach(b => {
    const fin = +b.textContent, t1 = performance.now() + t0;
    b.textContent = '0';
    const paso = now => { const k = Math.min(1, Math.max(0, (now - t1) / 900)); b.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  });
})();
