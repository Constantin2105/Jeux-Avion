// Génération du document A4 (HTML) à partir d'un modèle et des valeurs saisies.
// Utilisable dans l'interface et dans les tests Node.
(function (root) {
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const DOTS = '…………………………………………';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // "2026-09-30" -> "30 septembre 2026"
  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    const d = parseInt(m[3], 10);
    return `${d === 1 ? '1er' : d} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
  }

  function formatShortDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatNumber(v) {
    const s = String(v == null ? '' : v).trim();
    if (!/^-?\d+([.,]\d+)?$/.test(s)) return s;
    const [i, dec] = s.replace(',', '.').split('.');
    const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return dec ? `${int},${dec}` : int;
  }

  function formatSimple(type, v) {
    if (v == null || String(v).trim() === '') return '';
    if (type === 'date') return formatDate(v);
    if (type === 'number') return formatNumber(v);
    return String(v).trim();
  }

  // Valeur affichée d'un champ (texte brut, non échappé). Chaîne vide si non renseigné.
  function formatValue(field, value) {
    if (!field) return value == null ? '' : String(value);
    let out = '';
    if (field.type === 'double') {
      const parts = field.parts || [];
      const vals = Array.isArray(value) ? value : [];
      out = parts
        .map((p, i) => formatSimple(p.type, vals[i]))
        .filter(Boolean)
        .join(field.separator == null ? ' ' : field.separator);
    } else {
      out = formatSimple(field.type, value);
    }
    if (out && field.suffix) out += ' ' + field.suffix;
    if (field.uppercase) out = out.toUpperCase();
    return out;
  }

  function allFields(template) {
    const list = [];
    for (const s of (template && template.sections) || []) {
      if (s.type !== 'fields') continue;
      for (const f of s.fields || []) if (f.type !== 'subtitle') list.push(f);
    }
    return list;
  }

  function fieldMap(template) {
    const map = {};
    allFields(template).forEach((f) => (map[f.key] = f));
    return map;
  }

  function defaultValues(template) {
    const v = {};
    allFields(template).forEach((f) => {
      if (f.type === 'double') v[f.key] = (f.parts || []).map(() => '');
      else if (f.type === 'date' && f.defaultToday) v[f.key] = todayIso();
      else v[f.key] = f.defaultValue || '';
    });
    return v;
  }

  // Remplace {{code}} par la valeur du champ (texte brut).
  function fillText(text, template, values, emptyMark) {
    const map = fieldMap(template);
    return String(text || '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (all, key) => {
      if (key === 'reference') return (values && values.__reference) || emptyMark;
      if (!(key in map)) return all;
      return formatValue(map[key], values && values[key]) || emptyMark;
    });
  }

  function textHtml(text, template, values, emptyMark) {
    return esc(fillText(text, template, values, emptyMark)).replace(/\n/g, '<br>');
  }

  function missingRequired(template, values) {
    return allFields(template)
      .filter((f) => f.required)
      .filter((f) => !formatValue({ ...f, suffix: '' }, values[f.key]))
      .map((f) => f.label);
  }

  function qrText(reference, beneficiary) {
    return `${reference} | Fiche d'attribution de parcelle${beneficiary ? ' | ' + beneficiary : ''}`;
  }

  // Retrouve une référence (ex. GBF-2026-0001) dans un texte saisi ou lu dans un QR code.
  function extractReference(text) {
    const m = /\b([A-Z0-9]{1,12}-\d{4}-\d{4,})\b/i.exec(String(text || ''));
    return m ? m[1].toUpperCase() : null;
  }

  /**
   * @param template  structure du modèle
   * @param values    valeurs saisies
   * @param meta      { reference, qrDataUrl, draft }
   */
  function renderDocument(template, values, meta) {
    meta = meta || {};
    values = Object.assign({}, values, { __reference: meta.reference || '' });
    const t = template || {};
    const pos = t.qrPosition || 'top-right';
    const qrBox = () => {
      const img = meta.qrDataUrl
        ? `<img src="${esc(meta.qrDataUrl)}" alt="QR code">`
        : `<div class="qr-placeholder">QR code<br><small>${meta.draft ? 'généré à l’enregistrement' : ''}</small></div>`;
      return `<div class="doc-qr">${img}<div class="doc-ref">${meta.reference ? 'Réf. : ' + esc(meta.reference) : 'Réf. : à attribuer'}</div></div>`;
    };

    let html = '';
    const headerLines = (t.header || []).filter((l) => String(l).trim());
    html += `<div class="doc-header ${pos === 'top-right' ? 'with-qr' : ''}">`;
    html += `<div class="doc-header-side"></div><div class="doc-header-text">${headerLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
    html += `<div class="doc-header-side">${pos === 'top-right' ? qrBox() : ''}</div></div>`;
    if (t.title) html += `<div class="doc-title"><span>${esc(t.title)}</span></div>`;

    let num = 0;
    for (const s of t.sections || []) {
      if (s.type === 'text') {
        if (String(s.content || '').trim()) html += `<p class="doc-text">${textHtml(s.content, t, values, DOTS)}</p>`;
      } else if (s.type === 'fields') {
        if (s.hidden) continue;
        const n = s.numbered ? ++num : null;
        html += '<div class="doc-section">';
        if (s.title) html += `<div class="doc-section-title">${n ? n + '.&nbsp;&nbsp;&nbsp;' : ''}${esc(s.title)}</div>`;
        for (const f of s.fields || []) {
          if (f.type === 'subtitle') {
            html += `<div class="doc-line doc-subtitle">${esc(f.label)} :</div>`;
            continue;
          }
          const val = formatValue(f, values[f.key]);
          const cls = `doc-line${f.indent ? ' indent' : ''}${f.type === 'textarea' ? ' multiline' : ''}`;
          html += `<div class="${cls}"><span class="doc-label">${esc(f.label)} :</span> ${
            val ? `<span class="doc-value">${esc(val).replace(/\n/g, '<br>')}</span>` : `<span class="doc-dots"></span>`
          }</div>`;
        }
        html += '</div>';
      } else if (s.type === 'signatures') {
        const n = s.numbered ? ++num : null;
        html += '<div class="doc-section doc-signatures">';
        if (s.title) html += `<div class="doc-section-title">${n ? n + '.&nbsp;&nbsp;&nbsp;' : ''}${esc(s.title)}</div>`;
        if (s.placeLine) html += `<div class="doc-place">${textHtml(s.placeLine, t, values, DOTS)}</div>`;
        const col = (c) => {
          if (!c) return '<div class="sig-col"></div>';
          const signers = (c.signers || []).filter((x) => x && (x.name || x.note));
          return `<div class="sig-col"><div class="sig-title">${esc(c.title || '')}</div>${signers
            .map(
              (x, i) =>
                `<div class="sig-signer"><div class="sig-name">${c.numbered ? i + 1 + '.&nbsp;&nbsp;' : ''}${textHtml(x.name, t, values, DOTS)}</div>${
                  x.note ? `<div class="sig-note">${textHtml(x.note, t, values, '')}</div>` : ''
                }</div>`
            )
            .join('')}</div>`;
        };
        html += `<div class="sig-cols">${col(s.left)}${pos === 'bottom-center' ? `<div class="sig-qr">${qrBox()}</div>` : ''}${col(s.right)}</div>`;
        html += '</div>';
      }
    }

    if (pos === 'bottom-left' || pos === 'bottom-right' || (pos === 'bottom-center' && !(t.sections || []).some((s) => s.type === 'signatures'))) {
      html += `<div class="doc-footer-qr ${pos}">${qrBox()}</div>`;
    }

    return `<div class="a4-page"><div class="a4-content">${html}</div></div>`;
  }

  const api = { renderDocument, formatDate, formatShortDate, formatValue, allFields, fieldMap, defaultValues, fillText, missingRequired, qrText, extractReference, todayIso, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FicheDoc = api;
})(typeof window !== 'undefined' ? window : globalThis);
