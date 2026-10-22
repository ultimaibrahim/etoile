/**
 * views/privacy.js — Vista de Aviso de Privacidad
 */

const PrivacyView = {
  async render() {
    const app = document.getElementById('app');
    if (!app) return;

    this.injectStyles();

    const authenticated = typeof AppAuth !== 'undefined' && AppAuth.isAuthenticated();
    const backRoute = authenticated ? '#/select-region' : '#/login';
    const backLabel = authenticated ? 'Volver a Selección de Región' : 'Volver a Iniciar Sesión';

    app.innerHTML = `
      <div class="privacy-container">
        <div class="privacy-card">
          <div class="privacy-header">
            <span class="eyebrow">Legal & Cumplimiento</span>
            <h1 class="privacy-title">Aviso de Privacidad</h1>
            <p class="privacy-subtitle">Última actualización: 16 de Junio, 2026</p>
          </div>

          <div class="privacy-content">
            <section class="privacy-section">
              <h2>1. Identidad y Domicilio del Responsable</h2>
              <p>
                <strong>${escapeHtml(CLIENTE.responsable)}</strong>, con domicilio para oír y recibir notificaciones en ${escapeHtml(CLIENTE.domicilio)}, es responsable del tratamiento de los datos personales recabados en este portal de análisis de reputación y reseñas (<strong>étoile</strong>).
              </p>
            </section>

            <section class="privacy-section">
              <h2>2. Datos Personales Recabados</h2>
              <p>
                Para cumplir con las finalidades descritas en este aviso, tratamos los siguientes datos de identificación y laborales de nuestros colaboradores autorizados:
              </p>
              <ul>
                <li>Nombre completo</li>
                <li>Correo electrónico corporativo o autorizado</li>
                <li>Puesto laboral, región asignada y sucursal de supervisión</li>
              </ul>
              <p>
                Este portal <strong>no recopila ni trata datos personales sensibles</strong> (tales como origen étnico, estado de salud, información genética, creencias religiosas, filosóficas y morales, afiliación sindical, opiniones políticas o preferencia sexual).
              </p>
            </section>

            <section class="privacy-section">
              <h2>3. Finalidades del Tratamiento</h2>
              <p>
                Los datos personales recabados se utilizan para las siguientes finalidades primarias y necesarias:
              </p>
              <ul>
                <li>Validar la identidad del usuario y otorgar permisos de acceso condicional según el rol jerárquico asignado (Admin, Director, Regional, Zonal o Gerente).</li>
                <li>Asociar los reportes de auditoría operativa y respuestas de quejas críticas a los supervisores correspondientes.</li>
                <li>Garantizar la seguridad del portal, evitar accesos no autorizados y realizar auditorías de seguridad del sistema.</li>
              </ul>
            </section>

            <section class="privacy-section">
              <h2>4. Uso de Cookies y Almacenamiento Local (Local Storage)</h2>
              <p>
                El portal utiliza tecnologías de almacenamiento local para garantizar el funcionamiento técnico del servicio:
              </p>
              <ul>
                <li><strong>Sesión y Autenticación:</strong> Empleamos almacenamiento de Supabase para guardar tokens JWT de sesión de forma segura. Sin estos datos de primer origen, no es posible validar y mantener tu sesión activa.</li>
                <li><strong>Preferencias de Interfaz:</strong> Guardamos tu preferencia de diseño (Modo Oscuro o Modo Claro) para ofrecer una experiencia visual consistente en tus visitas.</li>
                <li><strong>Consentimiento de Cookies:</strong> Almacenamos tu elección sobre este aviso para evitar mostrarte el banner de consentimiento de forma repetitiva.</li>
              </ul>
              <p>
                Estas cookies y datos locales de primer origen <strong>no se utilizan con fines publicitarios</strong> ni se comparten con terceras empresas de marketing.
              </p>
            </section>

            <section class="privacy-section">
              <h2>5. Medios para Ejercer los Derechos ARCO</h2>
              <p>
                Como titular de los datos, tienes derecho a conocer qué datos personales tenemos, para qué los utilizamos y las condiciones de su uso (Acceso); a solicitar la corrección en caso de estar desactualizados o ser inexactos (Rectificación); a que los eliminemos de nuestros registros cuando consideres que no están siendo adecuados (Cancelación); así como a oponerte al uso para fines específicos (Oposición).
              </p>
              <p>
                Para el ejercicio de cualquiera de los derechos ARCO, deberás enviar una solicitud formal al correo <strong>${escapeHtml(CLIENTE.privacidad)}</strong>, adjuntando tu identificación y una descripción clara de los datos sobre los que deseas ejercer tus derechos.
              </p>
            </section>
          </div>

          <div class="privacy-footer">
            <a href="${backRoute}" class="privacy-back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12,19 5,12 12,5"></polyline></svg>
              <span>${backLabel}</span>
            </a>
          </div>
        </div>
      </div>
    `;

    window.scrollTo(0, 0);
  },

  injectStyles() {
    if (document.getElementById('privacy-styles')) return;

    const style = document.createElement('style');
    style.id = 'privacy-styles';
    style.textContent = `
      .privacy-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        box-sizing: border-box;
      }
      .privacy-card {
        width: 100%;
        max-width: 760px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--sombra-lg);
        padding: 40px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 32px;
      }
      .privacy-header {
        text-align: center;
        border-bottom: 1px solid var(--border);
        padding-bottom: 20px;
      }
      .privacy-title {
        font-family: var(--serif);
        font-size: 36px;
        font-weight: 400;
        color: var(--text);
        margin: 8px 0;
      }
      .privacy-subtitle {
        color: var(--text-dim);
        font-size: 13px;
        margin: 0;
      }
      .privacy-content {
        display: flex;
        flex-direction: column;
        gap: 24px;
        color: var(--text);
        font-size: 13.5px;
        line-height: 1.6;
      }
      .privacy-section h2 {
        font-size: 15px;
        font-weight: 700;
        color: var(--text);
        margin-top: 0;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .privacy-content ul {
        margin: 8px 0;
        padding-left: 20px;
      }
      .privacy-content li {
        margin-bottom: 6px;
      }
      .privacy-footer {
        display: flex;
        justify-content: center;
        border-top: 1px solid var(--border);
        padding-top: 24px;
      }
      .privacy-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 10px 20px;
        border-radius: 12px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .privacy-back-btn:hover {
        background: var(--surface-2);
        border-color: var(--sage);
        transform: translateY(-1px);
        box-shadow: var(--sombra);
      }
    `;
    document.head.appendChild(style);
  }
};
