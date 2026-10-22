/**
 * changelog.js — El changelog PÚBLICO (CHANGELOG_PUBLIC.md) dentro de la app: el easter egg de la versión en Acerca de.
 * Se lee en vivo del archivo (una sola fuente; nada que copiar a mano) y se agrupa por época (Eltanin, Zenith, Izar…).
 * parse() es pura y tiene pruebas (tests/changelog.test.js).
 */
const PublicChangelog = {
  URL: 'CHANGELOG_PUBLIC.md',
  _cache: null,

  /** "## Versión 2.0.0 beta 8 Eltanin — Título (Octubre 2026) [PREVIEW]" + viñetas "* …" → [{ version, era, title, date, tag, items }] */
  parse(md) {
    const rx = /^##\s+Versión\s+(.+?)\s+([A-ZÁÉÍÓÚ][\wáéíóú]+)\s+[—–-]\s+(.+?)\s*\(([^)]+)\)\s*(?:\[([A-Z]+)\])?\s*$/;
    const out = [];
    let cur = null;
    for (const line of String(md).split('\n')) {
      const h = line.match(rx);
      if (h) { cur = { version: h[1], era: h[2], title: h[3], date: h[4], tag: h[5] || '', items: [] }; out.push(cur); continue; }
      if (/^##\s/.test(line)) { cur = null; continue; }           // encabezado con otro formato: no se inventa nada
      const b = line.match(/^\s*[*-]\s+(.+)$/);
      if (cur && b) cur.items.push(b[1].trim());
    }
    return out;
  },

  /** Viñeta en Markdown → HTML seguro: sin el emoji inicial (la interfaz no usa emojis como iconos), con **negritas** y `código` */
  itemHtml(text) {
    const noEmoji = text.replace(/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍)+\s*/u, '');
    return escapeHtml(noEmoji)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  },

  async load() {
    if (this._cache) return this._cache;
    const res = await fetch(this.URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    this._cache = this.parse(await res.text());
    return this._cache;
  },

  /** HTML agrupado por época, la versión en curso resaltada */
  html(entries, currentLabel) {
    if (!entries.length) return '<p class="drawer-empty">Aún no hay versiones publicadas.</p>';
    const eras = [];
    for (const e of entries) { const last = eras[eras.length - 1]; if (last && last.era === e.era) last.list.push(e); else eras.push({ era: e.era, list: [e] }); }
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return eras.map(g => `
      <div class="clog-era">
        <h3 class="clog-era-name">${escapeHtml(g.era)}</h3>
        ${g.list.map(e => `
          <article class="clog-entry${norm(e.version) === norm(currentLabel) ? ' clog-entry--current' : ''}">
            <header class="clog-head">
              <span class="clog-ver">${escapeHtml(e.version)}</span>
              <span class="clog-date">${escapeHtml(e.date)}</span>
              ${norm(e.version) === norm(currentLabel) ? '<span class="clog-tag">Actual</span>' : ''}
            </header>
            <h4 class="clog-title">${escapeHtml(e.title)}</h4>
            <ul class="clog-items">${e.items.map(i => `<li>${this.itemHtml(i)}</li>`).join('')}</ul>
          </article>`).join('')}
      </div>`).join('');
  }
};
