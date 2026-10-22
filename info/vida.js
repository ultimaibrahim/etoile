/* Movimiento de las páginas públicas de Étoile (info/): barra superior, cielo del hero, aparición al hacer scroll y gráficas de Qué hace que se trazan.
 * Se carga sin defer en <head> solo para marcar html.js (así el contenido sin JS nunca queda oculto); lo demás espera al DOM.
 * Todo respeta prefers-reduced-motion: sin él, las cosas aparecen en su lugar final. Sin pulsos ni nada que se repita solo
 * (decisión de Ibrahim, 19-oct), salvo el cielo del hero. */
document.documentElement.classList.add('js');
// Transición entre páginas: si el destino no participa, la saliente se cancela sola; se atiende para no ensuciar la consola
['pageswap', 'pagereveal'].forEach(t => addEventListener(t, e => { const v = e.viewTransition; if (v) { v.ready.catch(() => {}); v.finished.catch(() => {}); v.updateCallbackDone && v.updateCallbackDone.catch(() => {}); } }));
document.addEventListener('DOMContentLoaded', () => {
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Barra superior: fondo al dejar el hero, se esconde al bajar y vuelve al subir; barra de lectura en las páginas largas
  const top = document.querySelector('.top');
  const prog = top && top.querySelector('.top-progreso');
  let ultimo = scrollY, pendiente = false;
  const alScroll = () => {
    pendiente = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    top.classList.toggle('fondo', y > 8);
    if (!top.contains(document.activeElement)) top.classList.toggle('oculta', y > 140 && y > ultimo + 4);
    if (y < ultimo - 4 || y < 140) top.classList.remove('oculta');
    if (prog) prog.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    ultimo = y;
  };
  if (top) {
    addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(alScroll); } }, { passive: true });
    top.addEventListener('focusin', () => top.classList.remove('oculta'));
    alScroll();
  }

  // Indicador que se desliza bajo el enlace activo, o bajo el que tiene el cursor o el foco
  const nav = document.querySelector('.top-nav'), ind = nav && nav.querySelector('.top-ind');
  if (nav && ind) {
    const actual = nav.querySelector('[aria-current]');
    const ir = a => {
      if (!a) { ind.style.opacity = 0; return; }
      ind.style.opacity = 1; ind.style.width = a.offsetWidth + 'px'; ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    nav.querySelectorAll('a').forEach(a => { a.addEventListener('pointerenter', () => ir(a)); a.addEventListener('focus', () => ir(a)); });
    nav.addEventListener('pointerleave', () => ir(actual));
    nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) ir(actual); });
    ir(actual); requestAnimationFrame(() => ind.classList.add('listo'));
    addEventListener('resize', () => ir(actual));
    if (document.fonts) document.fonts.ready.then(() => ir(actual));
  }

  // Cielo del hero: estrellas que titilan (étoile) y un brillo que sigue al cursor en equipos con mouse
  const hero = document.querySelector('.hero');
  if (hero) {
    const cielo = document.createElement('div');
    cielo.className = 'cielo'; cielo.setAttribute('aria-hidden', 'true');
    let s = 7; const az = () => (s = (s * 9301 + 49297) % 233280) / 233280;   // semilla fija: el mismo cielo en cada visita
    cielo.innerHTML = Array.from({ length: 34 }, () =>
      `<i style="left:${(az() * 100).toFixed(1)}%;top:${(az() * 100).toFixed(1)}%;--d:${(2.4 + az() * 4).toFixed(1)}s;--r:${(az() * -6).toFixed(1)}s;--s:${(1 + az() * 1.6).toFixed(1)}px"></i>`).join('');
    hero.prepend(cielo);
    if (!quieto && matchMedia('(pointer: fine)').matches) {
      hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        hero.style.setProperty('--mx', `${e.clientX - r.left}px`); hero.style.setProperty('--my', `${e.clientY - r.top}px`);
        hero.classList.add('brilla');
      });
      hero.addEventListener('pointerleave', () => hero.classList.remove('brilla'));
    }
  }

  // Tarjetas de Qué hace: la gráfica se traza al aparecer y se vuelve a trazar cada vez que el cursor entra
  document.querySelectorAll('.func').forEach(f => f.addEventListener('pointerenter', () => {
    if (quieto || !f.classList.contains('dibuja')) return;
    f.classList.remove('dibuja'); void f.offsetWidth; f.classList.add('dibuja');
  }));

  // Entrar: la noche se abre desde el botón como un círculo que crece, el cielo aparece y una semilla dorada (el «llega»
  // de la Rosa) viaja a donde el login la hará nacer. El login empieza de noche, así que la escena continúa sin corte.
  // Clic con modificadores o botón central: navegación normal. Con reduced-motion: directo.
  document.querySelectorAll('a[href="/login/"]').forEach(a => a.addEventListener('click', e => {
    if (quieto || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !Element.prototype.animate) return;
    e.preventDefault();
    const r = a.getBoundingClientRect(), x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    const W = innerWidth, H = innerHeight;
    // Dónde nace la Rosa en el login (misma rejilla que .lg-in): a la izquierda del formulario en escritorio, arriba en móvil
    const ancho = Math.min(920, W - 32), gap = Math.min(72, Math.max(24, W * .06));
    const destino = W > 760 ? [(W - ancho) / 2 + (ancho - 380 - gap) / 2, H / 2] : [W / 2, Math.max(120, H * .24)];
    let s = 11; const az = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const estrellas = Array.from({ length: 70 }, () => `<circle cx="${(az() * 100).toFixed(2)}" cy="${(az() * 100).toFixed(2)}" r="${(.08 + az() * .16).toFixed(2)}" fill="#ECE6D6" opacity="${(.15 + az() * .45).toFixed(2)}"/>`).join('');
    const p = document.createElement('div');
    p.className = 'puerta'; p.setAttribute('aria-hidden', 'true');
    p.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${estrellas}</svg><i></i>`;
    document.body.appendChild(p);
    const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y));
    p.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 620, easing: 'cubic-bezier(.7, 0, .2, 1)', fill: 'forwards' });
    p.querySelector('svg').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 260, fill: 'both' });
    const semilla = p.querySelector('i');
    // La semilla sale del clic, se encoge a un punto y llega en curva a su sitio, con un rebote corto al asentarse
    const mx = (x + destino[0]) / 2, my = Math.min(y, destino[1]) - 60;
    semilla.animate([
      { transform: `translate(${x}px, ${y}px) scale(2.2)`, opacity: 0 },
      { transform: `translate(${x}px, ${y}px) scale(1.6)`, opacity: 1, offset: .2 },
      { transform: `translate(${mx}px, ${my}px) scale(1)`, offset: .62 },
      { transform: `translate(${destino[0]}px, ${destino[1]}px) scale(.8)`, offset: .9 },
      { transform: `translate(${destino[0]}px, ${destino[1]}px) scale(.55)`, opacity: 1 }
    ], { duration: 980, delay: 120, easing: 'cubic-bezier(.45, 0, .2, 1)', fill: 'forwards' });
    try { sessionStorage.setItem('etoile-puerta', '1'); } catch (err) {}   // el login sabe que la semilla ya llegó
    setTimeout(() => { location.href = a.href; }, 1120);
  }));
  // Al volver con «atrás» (bfcache) la página regresa tal como quedó: se quita la noche
  addEventListener('pageshow', ev => { if (ev.persisted) document.querySelectorAll('.puerta').forEach(n => n.remove()); });

  // Aparición al hacer scroll (una vez por elemento)
  const rv = document.querySelectorAll('.rv');
  const ver = el => el.classList.add('vis', 'dibuja');
  if (quieto || !('IntersectionObserver' in window)) { rv.forEach(ver); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { ver(e.target); io.unobserve(e.target); } }),
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  rv.forEach(el => io.observe(el));
});
