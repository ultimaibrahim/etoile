/* Glosario de /info/ (documentacion/marca.md): dibuja la Rosa de cada signo junto a su nombre. Quietas: el único momento
 * de movimiento de la página es el mapa. Sin JS la tabla se lee igual, solo sin dibujos. */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Rosa === 'undefined') return;
  const tenue = senal => Rosa.deTienda({ id: 'tenue', fill: 1 }, senal);
  const ESPECIALES = {
    // La escala de seis fases (Se apaga … Polar) sale de Rosa.SIGNOS con su color de tienda
    // Con cola o trazo la caja crece al triple: se dibujan más grandes para que la estrella mida lo mismo que las demás
    'tenue+cometa': () => Rosa.html(tenue('cometa'), { size: 44, cls: 'larga' }),
    'tenue+fugaz': () => Rosa.html(tenue('fugaz'), { size: 44, cls: 'larga' }),
    cometa: () => Rosa.html('cometa', { size: 44, cls: 'larga' }),
    fugaz: () => Rosa.html('fugaz', { size: 44, cls: 'larga' }),
    variable: () => Rosa.html(Rosa.deTienda({ id: 'brilla', fill: 1 }, 'variable', 'tenue'), { size: 30 })
  };
  document.querySelectorAll('.gl-rosa[data-signo]').forEach(el => {
    const id = el.dataset.signo;
    const fase = Brillo.FASES.includes(id) ? Rosa.deTienda({ fase: id, fill: 1 }) : null;
    el.innerHTML = ESPECIALES[id] ? ESPECIALES[id]() : Rosa.html(fase || (Rosa.SIGNOS[id] ? id : 'brilla'), { size: 30 });
  });
});
