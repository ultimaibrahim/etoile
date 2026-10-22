/**
 * views/about.js — Acerca de / Identidad del portal / Contacto
 */

const AboutView = {
  async render() {
    Charts.destroyAll();
    const cliente = typeof CLIENTE !== 'undefined' ? CLIENTE.nombre : '';
    const est = fase => Rosa.deTienda({ fase, fill: 1 });
    const fila = (svg, nombre, que, dice) => `<div class="ac-signo"><span class="ac-signo-rosa">${svg}</span><b>${nombre}</b><span class="ac-signo-que">${que}</span><span class="ac-signo-dice">${dice}</span></div>`;
    const estados = [
      fila(Rosa.html(est('sin'), { size: 34 }), 'Sin señal', 'Sin reseñas con texto en el mes', 'Todavía no hay con qué medir.'),
      fila(Rosa.html(est('apaga'), { size: 34 }), 'Se apaga', 'Menos de 4.30', 'La tienda a la que hay que llamar.'),
      fila(Rosa.html(est('tenue'), { size: 34 }), 'Tenue', 'De 4.30 a 4.44', 'Debajo de la meta.'),
      fila(Rosa.html(est('tenue_alta'), { size: 34 }), 'Tenue alta', 'De 4.45 a 4.59', 'Cerca de la meta.'),
      fila(Rosa.html(est('brilla'), { size: 34 }), 'Brilla', 'De 4.60 a 4.74', 'En la meta.'),
      fila(Rosa.html(est('brilla_alta'), { size: 34 }), 'Brilla alta', 'De 4.75 a 4.89', 'Bien arriba de la meta.'),
      fila(Rosa.html(est('polar'), { size: 34 }), 'Polar', '4.90 o más, con 15 reseñas', 'La mejor forma. Pide evidencia.')
    ].join('');
    const senales = [
      fila(Rosa.html(Rosa.deTienda({ id: 'tenue', fill: 1 }, 'cometa'), { size: 46 }), 'Cometa', 'Tres semanas subiendo', 'Sobre «tenue» se lee «con potencial».'),
      fila(Rosa.html(Rosa.deTienda({ id: 'brilla', fill: 1 }, 'fugaz'), { size: 46 }), 'Estrella fugaz', 'Tres semanas bajando', 'Sobre «brilla» se lee «se le escapa».'),
      fila(Rosa.html(Rosa.deTienda({ id: 'brilla', fill: 1 }, 'variable', 'tenue'), { size: 34 }), 'Variable', 'Cambió de estado en el mes', 'A la izquierda, cómo empezó; a la derecha, cómo va.')
    ].join('');
    const faq = [
      ['¿Qué número es el que veo?', 'El promedio real de las calificaciones del mes (de 1 a 5), con todas las reseñas, tengan o no texto. El mes se corta a medianoche de la Ciudad de México.'],
      ['¿Por qué una tienda con 5.00 aparece debajo de otra con 4.80?', `Porque la forma de la estrella y el orden usan un brillo ajustado que pide evidencia: (n × promedio + ${Brillo.M_PESO} × C) ÷ (n + ${Brillo.M_PESO}), donde n son las reseñas con texto del mes y C el promedio de la región. Con pocas reseñas, la tienda se acerca al promedio de su región. Polar pide además ${Brillo.N_MIN} reseñas con texto.`],
      ['¿Por qué las reseñas sin texto no cuentan como queja?', 'Una calificación sin comentario no dice qué pasó. Cuenta para el volumen y el promedio, pero no para quejas, temas ni horarios. Las de 1 o 2 estrellas sin texto se descartan del todo.'],
      ['¿Qué es una queja grave?', 'Una reseña de 1 o 2 estrellas con texto que menciona salud, plagas, objetos extraños, trato o temas legales. Cada una dice qué palabra la disparó: no hay cajas negras.'],
      ['¿Cómo se clasifican las quejas?', 'Con un motor local de reglas y palabras clave, sin modelos de lenguaje. Se clasifican al llegar.'],
      ['¿Cada cuánto se actualiza?', 'Las reseñas llegan de la API oficial de Google Business Profile cada 30 minutos. Las horas se leen siempre en la hora local de cada sucursal.']
    ].map(([q, r], i) => `<details class="ac-faq"${i === 0 ? ' open' : ''}><summary>${q}</summary><p>${r}</p></details>`).join('');

    document.getElementById('app').innerHTML = `
      ${buildTopbar()}

      <section class="hero ac-hero">
        <div class="ac-hero-in">
          <div class="ac-hero-txt">
            <span class="eyebrow">Acerca de</span>
            <h1 class="ac-marca">étoile</h1>
            <p class="ac-tesis">Cada tienda es una estrella. Sus clientes deciden cuánto brilla.</p>
            <p class="ac-desc">Étoile lee las reseñas de Google de cada sucursal y las convierte en una lectura corta: cómo va cada tienda, qué quejas siguen abiertas y dónde se concentran.</p>
            <dl class="ac-datos">
              <div><dt>Cliente</dt><dd>${escapeHtml(cliente)}</dd></div>
              <div><dt>Cobertura</dt><dd>${SUCURSALES_META.length} sucursales · ${escapeHtml(getRegionName(activeRegion))}</dd></div>
              <div><dt>Versión</dt><dd><button id="versionBtn" class="ac-version" onclick="AboutView.toggleChangelog()" aria-expanded="false" title="Ver novedades">${escapeHtml(APP_VERSION.label)} ${escapeHtml(APP_VERSION.codename || '')}</button></dd></div>
            </dl>
          </div>
          <figure class="ac-hero-rosa" aria-hidden="true">${Rosa.anim(Rosa.estadoDe('recompensa', { grabado: 1 }), { size: 260, R: 60, tema: 'banda', luz: true })}</figure>
        </div>
      </section>

      <!-- Novedades (easter egg): el changelog PÚBLICO, leído en vivo de CHANGELOG_PUBLIC.md -->
      <div id="changelogPanel" hidden>
        <section class="section">
          <div class="section-head">
            <div class="section-title">Novedades <span class="accent">de étoile</span></div>
            <button class="clog-close" onclick="AboutView.toggleChangelog()">Ocultar ×</button>
          </div>
          <div id="changelogBody" aria-live="polite"><p class="drawer-empty">Cargando…</p></div>
        </section>
      </div>

      <section class="section r">
        <div class="section-head">
          <h2 class="section-title">Cómo leer <span class="accent">el cielo</span></h2>
          <span class="section-sub">La forma y el color dicen dónde está la tienda; una sola señal dice hacia dónde va</span>
        </div>
        <div class="ac-cielo">
          <div class="ac-col"><h3>Estados</h3>${estados}</div>
          <div class="ac-col"><h3>Señales</h3>${senales}<p class="ac-nota">Las señales aparecen solo donde alguien va a actuar: la ficha de la tienda, «Por atender», «Qué atender» y el resumen del mes. Nunca dos a la vez.</p></div>
        </div>
      </section>

      <section class="section r">
        <div class="section-head">
          <h2 class="section-title">Cómo se calculan <span class="accent">las cifras</span></h2>
        </div>
        <div class="ac-faqs">${faq}</div>
      </section>

      <section class="section r">
        <div class="ac-autor">
          <div>
            <p class="ac-autor-quien">Un sistema de <b>Ultima Ibrahim</b></p>
            <p class="ac-autor-sub">Diseño, datos y desarrollo de Étoile.</p>
          </div>
          <div class="ac-autor-links">
            ${RECORRIDO_ACTIVO ? `<button class="ac-link" onclick="localStorage.removeItem('lcp_walkthrough_seen'); Router.navigate('#/');">Ver la guía de nuevo</button>` : ''}
            <a class="ac-link" href="${SIGNO_REPORT_URL}" target="_blank" rel="noopener">Reportar un problema</a>
            <a class="ac-link" href="mailto:ultima.ibrahim@proton.me">ultima.ibrahim@proton.me</a>
          </div>
        </div>
      </section>

      ${buildFooter()}`;

    requestAnimationFrame(() => { initReveal(); });
  },

  async toggleChangelog() {
    const panel = document.getElementById('changelogPanel');
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    const btn = document.getElementById('versionBtn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 60);
    const body = document.getElementById('changelogBody');
    try {
      body.innerHTML = PublicChangelog.html(await PublicChangelog.load(), APP_VERSION.label);
    } catch (e) {
      body.innerHTML = '<p class="drawer-empty">No se pudieron cargar las novedades.</p>';
    }
  }
};
