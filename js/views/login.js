/**
 * views/login.js — Página de login (/login/), independiente de la app.
 * Crea su propio cliente de Supabase con las mismas opciones que la app (auth-storage.js): la sesión queda en la misma
 * cookie y la app la encuentra al llegar. Al entrar, cada rol cae en su pantalla (gerente y zonal en su región,
 * corporativo en el selector nacional). Si ya hay sesión, entra directo.
 */

const LoginView = {
  /*
   * Entrada de Étoile (2.1.0): la Rosa nace sobre un cielo nocturno, con las fases de documentacion/marca.md:
   * llega (un punto) → nacen los rayos largos → abren los cortos → brilla (toma su dorado) → se asienta con un giro
   * corto → gana su carta de 24 h. Corre una vez, con el resorte de js/rosa.js; con reduced-motion aparece ya asentada.
   * Al entrar, la Rosa asciende a Polar; si el acceso falla, se apaga un momento y vuelve a brillar.
   * El login es siempre de noche: es el momento de Étoile, igual que el cargador de la app.
   */
  _rosa: null, _modo: 'entrar', _aviso: '', _correo: '',
  _luz: '#FFC27A', _brasa: '#FF7D5E',
  _fase(p, d = {}, col) { return Rosa.estadoDe({ p, col: col || this._luz, d }); },

  async render(errorMessage = '') {
    const app = document.getElementById('app');
    if (!app) return;
    const yaNacio = !!this._rosa;
    app.innerHTML = `
      <div class="lg">
        <div class="lg-cielo" aria-hidden="true">${this._cielo()}</div>
        <div class="lg-in">
          <figure class="lg-rosa" aria-hidden="true"><svg id="lgRosa" viewBox="-95 -95 190 190"></svg></figure>
          <div class="lg-card">
            <h1 class="lg-marca">étoile</h1>
            <p class="lg-tesis">Cada tienda es una estrella. Sus clientes deciden cuánto brilla.</p>
            <form id="login-form" class="lg-form" onsubmit="LoginView.handleSubmit(event)" novalidate>
              ${errorMessage ? `<p class="lg-error" role="alert">${errorMessage}</p>` : ''}
              ${this._aviso ? `<p class="lg-aviso" role="status">${this._aviso}</p>` : ''}
              ${this._campos()}
            </form>
            <p class="lg-pie">Acceso por invitación · <a href="/info/">Qué es Étoile</a></p>
          </div>
        </div>
      </div>`;

    if (!document.getElementById('login-styles')) {
      const style = document.createElement('style');
      style.id = 'login-styles';
      style.textContent = `
        html.login-noche, html.login-noche body { background: #0A0F24; }
        .lg { min-height: 100vh; min-height: 100dvh; position: relative; overflow: hidden; display: grid; place-items: center; padding: 32px 16px;
          background: radial-gradient(120% 90% at 50% 20%, #131a3a 0%, #0A0F24 60%); color: #ECE6D6; }
        .lg-cielo { position: absolute; inset: 0; pointer-events: none; }
        .lg-cielo svg { width: 100%; height: 100%; display: block; }
        .lg-in { position: relative; width: 100%; max-width: 920px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 380px); gap: clamp(24px, 6vw, 72px); align-items: center; }
        .lg-rosa { margin: 0; display: grid; place-items: center; }
        .lg-rosa svg { width: min(100%, 380px); aspect-ratio: 1; overflow: visible; }
        .lg-card { display: grid; gap: 18px; }
        .lg-marca { margin: 0; font: 400 clamp(56px, 9vw, 84px)/.85 var(--giaza); color: #ECE6D6; opacity: 0; animation: lgSube .8s cubic-bezier(.2,.8,.2,1) 1.1s forwards; }
        .lg-tesis { margin: 0; font: italic 500 18px/1.35 var(--serif); color: color-mix(in srgb, #ECE6D6 74%, #0A0F24); max-width: 30ch; opacity: 0; animation: lgSube .8s cubic-bezier(.2,.8,.2,1) 1.3s forwards; }
        .lg-form { display: grid; gap: 14px; margin-top: 6px; opacity: 0; animation: lgSube .8s cubic-bezier(.2,.8,.2,1) 1.5s forwards; }
        .lg-pie { opacity: 0; animation: lgSube .8s cubic-bezier(.2,.8,.2,1) 1.7s forwards; }
        .lg.ya .lg-marca, .lg.ya .lg-tesis, .lg.ya .lg-form, .lg.ya .lg-pie { animation: none; opacity: 1; }
        @keyframes lgSube { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .lg-campo { display: grid; gap: 6px; }
        .lg-campo span { font: 600 12px/1 var(--sans); letter-spacing: .04em; color: color-mix(in srgb, #ECE6D6 74%, #0A0F24); }
        .lg-campo input { width: 100%; min-height: 46px; border-radius: 12px; border: 1px solid color-mix(in srgb, #ECE6D6 34%, #0A0F24); background: color-mix(in srgb, #ECE6D6 5%, #0A0F24);
          color: #ECE6D6; font: 400 15px/1.4 var(--sans); padding: 12px 14px; outline: none; transition: border-color .2s, background-color .2s; }
        .lg-campo input::placeholder { color: color-mix(in srgb, #ECE6D6 45%, #0A0F24); }
        .lg-campo input:focus { border-color: #9DB4FF; background: color-mix(in srgb, #ECE6D6 8%, #0A0F24); }
        .lg-btn { margin-top: 6px; min-height: 48px; border-radius: 999px; border: 0; background: #ECE6D6; color: #0A0F24; font: 700 15px/1 var(--sans); cursor: pointer; transition: transform .15s, background-color .2s; }
        .lg-btn:hover { background: #FFE6C4; } .lg-btn:active { transform: scale(.98); } .lg-btn:disabled { opacity: .7; cursor: progress; }
        .lg-btn:focus-visible, .lg-campo input:focus-visible { outline: 2px solid #9DB4FF; outline-offset: 2px; }
        .lg-error { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, #FF7D5E 45%, transparent); background: color-mix(in srgb, #FF7D5E 10%, transparent); color: #FF9F86; font-size: 14px; }
        .lg-pie { margin: 0; font-size: 13px; color: color-mix(in srgb, #ECE6D6 62%, #0A0F24); }
        .lg-pie a { color: #9DB4FF; }
        .lg-link { justify-self: start; background: none; border: 0; padding: 6px 0; min-height: 32px; font: 600 13.5px/1 var(--sans); color: #9DB4FF; cursor: pointer; }
        .lg-link:hover { text-decoration: underline; } .lg-link:focus-visible { outline: 2px solid #9DB4FF; outline-offset: 2px; border-radius: 4px; }
        .lg-modo { margin: 0; font-size: 14.5px; line-height: 1.5; color: color-mix(in srgb, #ECE6D6 82%, #0A0F24); }
        .lg-aviso { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, #FFC27A 45%, transparent); background: color-mix(in srgb, #FFC27A 9%, transparent); color: #FFD9A8; font-size: 14px; line-height: 1.45; }
        @media (max-width: 760px) {
          .lg-in { grid-template-columns: minmax(0, 1fr); gap: 8px; max-width: 420px; }
          .lg-rosa svg { width: min(62vw, 240px); }
          .lg-marca, .lg-tesis { text-align: center; justify-self: center; }
        }
        @media (prefers-reduced-motion: reduce) { .lg-marca, .lg-tesis, .lg-form, .lg-pie { animation: none; opacity: 1; } }
      `;
      document.head.appendChild(style);
    }
    document.documentElement.classList.add('login-noche');
    if (yaNacio) { app.querySelector('.lg').classList.add('ya'); this._rosa = Rosa.Estrella(document.getElementById('lgRosa'), 48); this._rosa.salta(this._asentada()); }
    else this._nace();
    if (this._rosa) this._rosa.sigueCursor();   // la luz de las facetas sigue al cursor
  },

  /** Campos según el modo: entrar, pedir el enlace («¿Olvidaste tu contraseña?») o elegir la nueva (al volver del correo) */
  _campos() {
    const correo = `<label class="lg-campo"><span>Correo</span>
                <input type="email" id="login-email" required placeholder="nombre@empresa.com" autocomplete="email" value="${(this._correo || '').replace(/"/g, '&quot;')}"></label>`;
    if (this._modo === 'olvido') return `
              <p class="lg-modo">Escribe el correo de tu cuenta y te enviamos un enlace para elegir una contraseña nueva.</p>
              ${correo}
              <button type="submit" class="lg-btn" id="lg-olvido-btn"><span>Enviar enlace</span></button>
              <button type="button" class="lg-link" onclick="LoginView.modo('entrar')">← Volver a entrar</button>`;
    if (this._modo === 'nueva') return `
              <p class="lg-modo">Elige tu contraseña nueva. Al guardarla entras directo.</p>
              <label class="lg-campo"><span>Contraseña nueva</span>
                <input type="password" id="lg-nueva" required minlength="8" placeholder="Al menos 8 caracteres" autocomplete="new-password"></label>
              <label class="lg-campo"><span>Repítela</span>
                <input type="password" id="lg-confirma" required minlength="8" placeholder="La misma contraseña" autocomplete="new-password"></label>
              <button type="submit" class="lg-btn" id="lg-nueva-btn"><span>Guardar y entrar</span></button>`;
    return `
              ${correo}
              <label class="lg-campo"><span>Contraseña</span>
                <input type="password" id="login-password" required placeholder="••••••••" autocomplete="current-password"></label>
              <button type="submit" class="lg-btn" id="login-submit-btn"><span>Entrar</span></button>
              <button type="button" class="lg-link" onclick="LoginView.modo('olvido')">¿Olvidaste tu contraseña?</button>`;
  },

  /** Cambia de modo conservando la Rosa (ya nació) y el correo escrito */
  async modo(m, aviso = '', error = '') {
    const c = document.getElementById('login-email'); if (c) this._correo = c.value.trim();
    this._modo = m; this._aviso = aviso;
    await this.render(error);
    const primero = document.querySelector('.lg-form input'); if (primero) primero.focus();
  },

  /** Cielo fijo (semilla fija: el mismo en cada visita), sin titilar: lo único que se mueve es la Rosa */
  _cielo() {
    let s = 11; const az = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const pts = Array.from({ length: 70 }, () => `<circle cx="${(az() * 100).toFixed(2)}" cy="${(az() * 100).toFixed(2)}" r="${(.08 + az() * .16).toFixed(2)}" fill="#ECE6D6" opacity="${(.15 + az() * .45).toFixed(2)}"/>`).join('');
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${pts}</svg>`;
  },
  // Asentada: con su carta, el grabado de instrumento y la temperatura de Eltanin (ronda 5; el login es ilustración)
  _asentada() { return this._fase({ L: 1, S: .5 }, { carta: 1, grabado: 1, temp: 1 }); },

  /** Las fases de la marca, una tras otra, con el resorte (cada paso persigue al siguiente antes de asentarse) */
  _nace() {
    const el = document.getElementById('lgRosa'); if (!el) return;
    this._rosa = Rosa.Estrella(el, 48);
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quieto) { this._rosa.salta(this._asentada()); return; }
    const pasos = [
      [120, this._fase({ L: .09, S: .09, F: .09, I: .09, rot: -40 })],               // llega
      [520, this._fase({ L: 1, S: .09, F: .09, I: .09, rot: -30 })],                 // nacen los rayos largos
      [980, this._fase({ L: 1, S: .5, F: .13, I: .13, rot: -18 })],                  // abren los cortos
      [1400, this._fase({ L: 1.06, S: .52, rot: 6 })],                               // brilla
      [1800, this._fase({ L: 1, S: .5, rot: 0 })],                                   // se asienta
      [2300, this._asentada()]                                                        // gana su carta
    ];
    // Si se llegó por «Entrar» en /info/, la semilla ya está en su sitio: la Rosa arranca en «llega» y nace de ahí
    let dePuerta = false;
    try { dePuerta = sessionStorage.getItem('etoile-puerta') === '1'; sessionStorage.removeItem('etoile-puerta'); } catch (e) {}
    this._rosa.salta(dePuerta ? pasos[0][1] : this._fase({ L: .02, S: .02, F: .02, I: .02, rot: -45 }));
    (dePuerta ? pasos.slice(1).map(([t, e]) => [t - 80, e]) : pasos).forEach(([t, e]) => setTimeout(() => this._rosa && this._rosa.a(e), t));
  },

  async handleSubmit(event) {
    event.preventDefault();
    if (this._modo === 'olvido') return this.pideEnlace();
    if (this._modo === 'nueva') return this.guardaNueva();
    this._aviso = '';
    const btn = document.getElementById('login-submit-btn');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { this.render('Escribe tu correo y tu contraseña.'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Verificando…</span>'; }
    // Mientras verifica, la Rosa asciende a Polar (abre sus 16 rayos)
    if (this._rosa) this._rosa.a(this._fase({ L: 1.08, S: .62, F: .42, I: .12 }, { carta: 1, grabado: 1, temp: 1 }));
    try {
      const destino = await LoginPage.signIn(email, password);
      await new Promise(r => setTimeout(r, 450));
      window.location.replace(destino);
      return;
    } catch (e) {
      console.error('Error en login UI:', e);
      // Se apaga un momento (brasa) y vuelve a brillar
      if (this._rosa) { this._rosa.a(this._fase({ L: .5, S: .42, F: .2, I: .2 }, { carta: 0, grabado: 0, temp: 0 }, this._brasa)); setTimeout(() => this._rosa && this._rosa.a(this._asentada()), 900); }
      let msg = 'Correo o contraseña incorrectos.';
      if (e.message === 'email_unconfirmed') msg = 'Confirma tu correo electrónico: revisa tu bandeja de entrada para ver el enlace de verificación.';
      else if (e.status === 429 || (e.message && (e.message.includes('too many') || e.message.includes('rate limit')))) msg = 'Demasiados intentos. Por seguridad, espera 15 minutos.';
      else if (e.message === 'Sin perfil') msg = 'Tu cuenta no tiene acceso configurado. Pide a la administración que lo revise.';
      const r = this._rosa;
      await this.render(msg);
      if (r) { this._rosa.salta(this._fase({ L: .5, S: .42, F: .2, I: .2 }, { carta: 0, grabado: 0, temp: 0 }, this._brasa)); setTimeout(() => this._rosa && this._rosa.a(this._asentada()), 700); }
    }
  }
};

/* ── Recuperar la contraseña (netlify/functions/recuperar.js envía el enlace con Resend) ── */
Object.assign(LoginView, {
  async pideEnlace() {
    const email = (document.getElementById('login-email').value || '').trim();
    this._correo = email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.render('Escribe el correo de tu cuenta.'); return; }
    const btn = document.getElementById('lg-olvido-btn'); if (btn) { btn.disabled = true; btn.innerHTML = '<span>Enviando…</span>'; }
    try {
      const r = await fetch('/.netlify/functions/recuperar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { this.render(j.error || 'No se pudo enviar el enlace. Intenta de nuevo en un momento.'); return; }
      if (this._rosa) this._rosa.a(this._fase({ L: 1.08, S: .62, F: .42, I: .12 }, { carta: 1, grabado: 1, temp: 1 }));
      await this.modo('entrar', `${j.mensaje} Revisa también tu carpeta de spam; el enlace vence en una hora.`);
    } catch (e) {
      this.render('No se pudo enviar el enlace. Revisa tu conexión e intenta de nuevo.');
    }
  },

  async guardaNueva() {
    const a = document.getElementById('lg-nueva').value, b = document.getElementById('lg-confirma').value;
    if (a.length < 8) { this.render('La contraseña necesita al menos 8 caracteres.'); return; }
    if (a !== b) { this.render('Las dos contraseñas no coinciden.'); return; }
    const btn = document.getElementById('lg-nueva-btn'); if (btn) { btn.disabled = true; btn.innerHTML = '<span>Guardando…</span>'; }
    try {
      if (LoginPage.listo) await LoginPage.listo;
      const { data, error } = await LoginPage.client.auth.updateUser({ password: a });
      if (error) throw error;
      if (this._rosa) this._rosa.a(this._fase({ L: 1.08, S: .62, F: .42, I: .12 }, { carta: 1, grabado: 1, temp: 1 }));
      const profile = await LoginPage.profileOf(data.user.id);
      await new Promise(r => setTimeout(r, 450));
      window.location.replace(profile ? LoginPage.destination(profile) : '/login/');
    } catch (e) {
      console.error('[Login] No se pudo guardar la contraseña:', e);
      const vencida = /session|expired|jwt/i.test(e.message || '');
      if (vencida) { await this.modo('olvido', '', 'El enlace venció o ya se usó. Pide otro.'); return; }
      this.render(/same|different/i.test(e.message || '') ? 'Elige una contraseña distinta de la anterior.' : 'No se pudo guardar la contraseña. Intenta de nuevo.');
    }
  }
});

/* ── Arranque de la página ── */
const LoginPage = {
  client: null,

  /** Pantalla de entrada según el rol (mismo criterio que AppAuth.entersOwnRegion en la app) */
  destination(profile) {
    return ['gerente', 'zonal'].includes(profile && profile.rol) ? '/#/' : '/#/llegada';
  },

  async profileOf(userId) {
    const { data } = await this.client.from('profiles').select('rol, region').eq('id', userId).maybeSingle();
    return data || null;
  },

  listo: null,   // promesa: el cliente de Supabase ya está creado (la vista se pinta antes)
  async signIn(email, password) {
    if (this.listo) await this.listo;
    if (!this.client) throw new Error('Supabase no configurado.');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message && (error.message.includes('confirm') || error.message.includes('verified'))) throw new Error('email_unconfirmed');
      throw error;
    }
    if (data.user && !data.user.email_confirmed_at) { await this.client.auth.signOut(); throw new Error('email_unconfirmed'); }
    const profile = await this.profileOf(data.user.id);
    if (!profile) { await this.client.auth.signOut(); throw new Error('Sin perfil'); }
    return this.destination(profile);
  },

  async boot() {
    document.documentElement.setAttribute('data-theme', 'dark');   // el login es siempre de noche (no cambia la preferencia guardada)
    // ¿Se llegó desde el enlace del correo? Supabase devuelve la sesión de recuperación (o el error) en el hash
    const h = window.location.hash || '';
    const recuperando = /type=recovery/.test(h);
    if (recuperando) LoginView._modo = 'nueva';
    else if (/error_code=otp_expired|error=access_denied/.test(h)) { LoginView._modo = 'olvido'; LoginView._errorInicial = 'El enlace venció o ya se usó. Pide otro.'; }
    // Se pinta de inmediato (la Rosa empieza a nacer mientras se prepara el acceso); con sesión vigente se sigue a la app
    await LoginView.render(LoginView._errorInicial || ''); LoginView._errorInicial = '';
    document.documentElement.classList.add('login-ready');
    this.listo = (async () => {
      try {
        const res = await fetch('/.netlify/functions/get-config');
        const config = await res.json();
        if (config.supabaseUrl && config.supabaseAnonKey) {
          this.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, SUPABASE_AUTH_OPTIONS);
          // Con sesión vigente no hay nada que pedir: directo a la app
          const { data: { session } } = await this.client.auth.getSession();
          if (recuperando || LoginView._modo === 'olvido') history.replaceState(null, '', '/login/');   // sin tokens a la vista
          if (recuperando && !session) await LoginView.modo('olvido', '', 'El enlace venció o ya se usó. Pide otro.');
          if (session && !recuperando) {
            const profile = await this.profileOf(session.user.id);
            if (profile) { window.location.replace(this.destination(profile)); return; }
          }
        }
      } catch (e) {
        console.error('[Login] No se pudo preparar el acceso:', e);
      }
    })();
    await this.listo;
  }
};
