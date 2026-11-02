/* Interface de l'application (sans framework). */
(() => {
  const D = window.FicheDoc;
  const esc = D.esc;
  const $view = document.getElementById('view');

  const FIELD_TYPES = {
    text: 'Texte court',
    textarea: 'Texte long',
    number: 'Nombre',
    date: 'Date',
    double: 'Double (2 valeurs)',
    subtitle: 'Sous-titre (sans saisie)',
  };
  const PART_TYPES = { text: 'Texte', number: 'Nombre', date: 'Date' };
  const QR_POSITIONS = {
    'top-right': 'En haut à droite (à côté de l’en-tête)',
    'bottom-center': 'En bas, entre les signatures',
    'bottom-left': 'En bas à gauche',
    'bottom-right': 'En bas à droite',
  };

  const state = { view: null, dirty: false };

  // ------------------------------------------------------------------ utilitaires
  async function call(promise) {
    const res = await promise;
    if (!res || !res.ok) throw new Error((res && res.error) || 'Erreur inconnue');
    return res.data;
  }

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3500);
  }

  async function guard(fn) {
    try {
      return await fn();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), 'error');
    }
  }

  function modal(html, { wide = false, onMount } = {}) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
      root.appendChild(overlay);
      let cleanup = null;
      const close = (value) => {
        if (cleanup) cleanup();
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => {
        const b = e.target.closest('[data-close]');
        if (b) close(b.dataset.close);
        else if (e.target === overlay) close(null);
      });
      if (onMount) cleanup = onMount(overlay.querySelector('.modal'), close) || null;
      const focus = overlay.querySelector('[data-autofocus]');
      if (focus) focus.focus();
    });
  }

  async function confirmBox(title, message, okLabel = 'Confirmer', danger = false) {
    const r = await modal(`<h2>${esc(title)}</h2><p>${message}</p>
      <div class="actions"><button class="btn" data-close="no">Annuler</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-close="yes" data-autofocus>${esc(okLabel)}</button></div>`);
    return r === 'yes';
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function slug(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'champ';
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  function beneficiaryOf(template, values) {
    const f = D.fieldMap(template)[template.nameField];
    return f ? D.formatValue(f, values[template.nameField]) : '';
  }

  // Réduit légèrement la taille du texte si le contenu dépasse une page A4.
  function fitPages(container) {
    container.querySelectorAll('.a4-page').forEach((p) => {
      let fs = 12;
      p.style.setProperty('--fs', fs + 'pt');
      while (p.scrollHeight > p.clientHeight + 1 && fs > 8) {
        fs -= 0.25;
        p.style.setProperty('--fs', fs + 'pt');
      }
    });
  }

  async function waitImages(container) {
    await Promise.all([...container.querySelectorAll('img')].map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
  }

  async function documentHtml(template, values, reference) {
    const qrDataUrl = reference ? await call(window.api.qr(D.qrText(reference, beneficiaryOf(template, values)))) : null;
    return D.renderDocument(template, values, { reference, qrDataUrl, draft: !reference });
  }

  async function renderInto(container, template, values, reference) {
    container.innerHTML = await documentHtml(template, values, reference);
    await waitImages(container);
    fitPages(container);
  }

  // Place la fiche dans la zone d'impression puis lance le PDF ou l'impression.
  async function outputFiche(fiche, mode) {
    const root = document.getElementById('print-root');
    await renderInto(root, fiche.template, fiche.values, fiche.reference);
    try {
      if (mode === 'pdf') {
        const name = `${fiche.reference} - ${fiche.beneficiary || 'fiche'}`;
        const file = await call(window.api.pdf(name));
        if (file) toast('PDF enregistré : ' + file, 'ok');
      } else {
        await call(window.api.print());
      }
    } finally {
      root.innerHTML = '';
    }
  }

  // ------------------------------------------------------------------ navigation
  async function navigate(view, params = {}) {
    if (state.dirty) {
      const ok = await confirmBox('Modifications non enregistrées', 'Quitter cette page sans enregistrer les modifications ?', 'Quitter sans enregistrer', true);
      if (!ok) return;
    }
    state.dirty = false;
    state.view = view;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
    $view.scrollTop = 0;
    await guard(() => VIEWS[view](params));
  }

  document.querySelector('.sidebar nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]');
    if (b) navigate(b.dataset.nav);
  });

  // ------------------------------------------------------------------ liste des fiches
  async function viewFiches({ query = '' } = {}) {
    $view.innerHTML = `
      <div class="page-head">
        <div><h1>Fiches enregistrées</h1><div class="sub" id="count"></div></div>
        <div class="actions"><button class="btn primary" id="btn-new">＋ Nouvelle fiche</button></div>
      </div>
      <div class="toolbar">
        <input type="search" id="search" placeholder="Rechercher par référence, nom du bénéficiaire, téléphone, n° de pièce…" value="${esc(query)}" autofocus>
        <button class="btn" id="btn-scan">📷 Lire un QR code</button>
      </div>
      <div id="list"></div>`;
    const input = document.getElementById('search');
    const listEl = document.getElementById('list');

    const load = async () => {
      const q = input.value;
      const ref = D.extractReference(q);
      const rows = await call(window.api.fiches.search(ref || q));
      document.getElementById('count').textContent = `${rows.length} fiche${rows.length > 1 ? 's' : ''}${q ? ' trouvée' + (rows.length > 1 ? 's' : '') : ' au total'}`;
      if (!rows.length) {
        listEl.innerHTML = `<div class="card empty">${q ? 'Aucune fiche ne correspond à cette recherche.' : 'Aucune fiche pour le moment. Cliquez sur « Nouvelle fiche » pour commencer.'}</div>`;
        return;
      }
      listEl.innerHTML = `<table class="list"><thead><tr><th>Référence</th><th>Bénéficiaire</th><th>Date d’établissement</th><th>Modèle</th><th>Enregistrée le</th><th></th></tr></thead><tbody>
        ${rows
          .map(
            (f) => `<tr class="row" data-id="${f.id}">
              <td class="ref">${esc(f.reference)}</td>
              <td>${esc(f.beneficiary) || '<span class="muted">—</span>'}</td>
              <td>${esc(D.formatShortDate(f.dateEtab))}</td>
              <td class="muted small-text">${esc(f.templateName)}</td>
              <td class="muted small-text">${esc(formatDateTime(f.createdAt))}</td>
              <td><div class="actions">
                <button class="btn small" data-act="pdf" data-id="${f.id}">PDF</button>
                <button class="btn small" data-act="print" data-id="${f.id}">Imprimer</button>
                <button class="btn small" data-act="edit" data-id="${f.id}">Modifier</button>
              </div></td></tr>`
          )
          .join('')}</tbody></table>`;
    };

    input.addEventListener('input', debounce(() => guard(load), 200));
    // Un lecteur de QR code (douchette) tape le contenu puis « Entrée » : on ouvre directement la fiche.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const ref = D.extractReference(input.value);
      if (ref) guard(() => openByReference(ref));
    });
    document.getElementById('btn-new').onclick = () => navigate('new');
    document.getElementById('btn-scan').onclick = () => scanQr();
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        e.stopPropagation();
        const id = Number(b.dataset.id);
        guard(async () => {
          const f = await call(window.api.fiches.get(id));
          if (b.dataset.act === 'edit') navigate('editFiche', { id });
          else await outputFiche(f, b.dataset.act);
        });
        return;
      }
      const row = e.target.closest('tr.row');
      if (row) navigate('viewFiche', { id: Number(row.dataset.id) });
    });
    await load();
  }

  async function openByReference(ref) {
    const f = await call(window.api.fiches.byRef(ref));
    if (!f) {
      toast(`Aucune fiche avec la référence ${ref} dans cet ordinateur.`, 'error');
      return false;
    }
    await navigate('viewFiche', { id: f.id });
    return true;
  }

  // ------------------------------------------------------------------ lecture de QR code
  function scanQr() {
    modal(
      `<h2>Lire un QR code</h2>
      <p class="muted small-text">Présentez le QR code de la fiche devant la caméra, ou choisissez une image (photo, capture d’écran). La fiche correspondante s’ouvrira si elle existe dans cet ordinateur.</p>
      <video class="scan-video" autoplay playsinline muted></video>
      <p id="scan-status" class="muted small-text">Démarrage de la caméra…</p>
      <div class="actions">
        <label class="btn">🖼 Choisir une image…<input type="file" accept="image/*" id="scan-file" hidden></label>
        <button class="btn" data-close="cancel">Fermer</button>
      </div>`,
      {
        onMount: (el, close) => {
          const video = el.querySelector('video');
          const status = el.querySelector('#scan-status');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          let stream = null;
          let raf = null;
          let done = false;

          const found = async (text) => {
            if (done) return;
            const ref = D.extractReference(text);
            if (!ref) {
              status.textContent = 'QR code lu, mais il ne contient pas de référence de fiche : ' + text;
              return;
            }
            done = true;
            close('found');
            await guard(() => openByReference(ref));
          };

          const decode = (source, w, h) => {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(source, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            return window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
          };

          const tick = () => {
            if (done) return;
            if (video.readyState >= 2 && video.videoWidth) {
              const r = decode(video, video.videoWidth, video.videoHeight);
              if (r && r.data) return found(r.data);
            }
            raf = requestAnimationFrame(tick);
          };

          navigator.mediaDevices
            .getUserMedia({ video: { facingMode: 'environment' } })
            .then((s) => {
              stream = s;
              video.srcObject = s;
              status.textContent = 'Caméra active : placez le QR code dans le cadre.';
              tick();
            })
            .catch(() => {
              video.style.display = 'none';
              status.textContent = 'Aucune caméra disponible. Utilisez « Choisir une image… ».';
            });

          el.querySelector('#scan-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const img = new Image();
            img.onload = () => {
              const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
              const r = decode(img, Math.round(img.width * scale), Math.round(img.height * scale));
              URL.revokeObjectURL(img.src);
              if (r && r.data) found(r.data);
              else status.textContent = 'Aucun QR code détecté dans cette image. Essayez une image plus nette.';
            };
            img.src = URL.createObjectURL(file);
          });

          return () => {
            done = true;
            if (raf) cancelAnimationFrame(raf);
            if (stream) stream.getTracks().forEach((t) => t.stop());
          };
        },
      }
    );
  }

  // ------------------------------------------------------------------ consultation d'une fiche
  async function viewFiche({ id }) {
    const f = await call(window.api.fiches.get(id));
    if (!f) {
      toast('Fiche introuvable', 'error');
      return navigate('fiches');
    }
    $view.innerHTML = `
      <div class="page-head">
        <div><h1>Fiche ${esc(f.reference)}</h1>
          <div class="sub">${esc(f.beneficiary || '')} · enregistrée le ${esc(formatDateTime(f.createdAt))}${f.updatedAt !== f.createdAt ? ' · modifiée le ' + esc(formatDateTime(f.updatedAt)) : ''}</div></div>
        <div class="actions">
          <button class="btn primary" id="b-pdf">⬇ Télécharger en PDF</button>
          <button class="btn primary" id="b-print">🖨 Imprimer</button>
          <button class="btn" id="b-edit">Modifier</button>
          <button class="btn" id="b-new">Nouvelle fiche (même modèle)</button>
          <button class="btn danger" id="b-del">Supprimer</button>
        </div>
      </div>
      <div class="preview-center"><div class="preview zoom-l" id="pv"></div></div>`;
    await renderInto(document.getElementById('pv'), f.template, f.values, f.reference);
    document.getElementById('b-pdf').onclick = () => guard(() => outputFiche(f, 'pdf'));
    document.getElementById('b-print').onclick = () => guard(() => outputFiche(f, 'print'));
    document.getElementById('b-edit').onclick = () => navigate('editFiche', { id });
    document.getElementById('b-new').onclick = () => navigate('new', { templateId: f.templateId });
    document.getElementById('b-del').onclick = () =>
      guard(async () => {
        const ok = await confirmBox('Supprimer la fiche', `La fiche <b>${esc(f.reference)}</b> (${esc(f.beneficiary)}) sera définitivement supprimée de la base. Cette action est irréversible.`, 'Supprimer', true);
        if (!ok) return;
        await call(window.api.fiches.remove(id));
        toast('Fiche supprimée', 'ok');
        navigate('fiches');
      });
  }

  // ------------------------------------------------------------------ saisie d'une fiche
  function fieldInput(f, value) {
    const req = f.required ? ' <span class="req">*</span>' : '';
    const key = esc(f.key);
    if (f.type === 'subtitle') return `<div class="sub-heading">${esc(f.label)}</div>`;
    if (f.type === 'double') {
      const parts = f.parts || [];
      const vals = Array.isArray(value) ? value : [];
      return `<label class="field full">${esc(f.label)}${req}<div class="double-input">${parts
        .map(
          (p, i) =>
            `<div><span>${esc(p.label || '')}</span><input type="${p.type === 'date' ? 'date' : 'text'}" data-field="${key}" data-part="${i}" value="${esc(vals[i] || '')}"></div>`
        )
        .join('')}</div></label>`;
    }
    const suffix = f.suffix ? ` <span class="hint">(en ${esc(f.suffix)})</span>` : '';
    if (f.type === 'textarea')
      return `<label class="field full">${esc(f.label)}${req}<textarea data-field="${key}">${esc(value || '')}</textarea></label>`;
    if (f.type === 'date')
      return `<label class="field">${esc(f.label)}${req}<input type="date" data-field="${key}" value="${esc(value || '')}"></label>`;
    const full = f.indent || String(f.label).length > 28 ? ' full' : '';
    return `<label class="field${full}">${esc(f.label)}${req}${suffix}<input type="text" ${f.type === 'number' ? 'inputmode="decimal"' : ''} data-field="${key}" value="${esc(value || '')}"></label>`;
  }

  async function viewEditFiche({ id = null, templateId = null } = {}) {
    let fiche = null;
    let template;
    let templates = [];
    let values;
    let currentTemplateId = null;

    if (id) {
      fiche = await call(window.api.fiches.get(id));
      template = fiche.template;
      values = Object.assign(D.defaultValues(template), fiche.values);
    } else {
      templates = await call(window.api.templates.list());
      const t = templates.find((x) => x.id === templateId) || templates.find((x) => x.isDefault) || templates[0];
      currentTemplateId = t.id;
      template = t.data;
      values = D.defaultValues(template);
    }

    $view.innerHTML = `
      <div class="page-head sticky-actions">
        <div><h1>${fiche ? 'Modifier la fiche ' + esc(fiche.reference) : 'Nouvelle fiche'}</h1>
          <div class="sub">${fiche ? 'La référence et le modèle de la fiche restent inchangés.' : 'La référence et le QR code seront attribués à l’enregistrement.'}</div></div>
        <div class="actions">
          <button class="btn" id="b-cancel">Annuler</button>
          <button class="btn primary" id="b-save">💾 Enregistrer la fiche</button>
        </div>
      </div>
      <div class="split">
        <div class="left">
          ${
            fiche
              ? ''
              : `<div class="card"><label class="field">Modèle de fiche<select id="tpl-select">${templates
                  .map((t) => `<option value="${t.id}" ${t.id === currentTemplateId ? 'selected' : ''}>${esc(t.name)}${t.isDefault ? ' (par défaut)' : ''}</option>`)
                  .join('')}</select></label></div>`
          }
          <div id="form"></div>
          <p class="muted small-text"><span class="req">*</span> champ obligatoire. Les champs laissés vides apparaissent en pointillés sur la fiche (à compléter à la main).</p>
        </div>
        <div class="preview-panel"><div class="label">Aperçu A4</div><div class="preview zoom-s" id="pv"></div></div>
      </div>`;

    const formEl = document.getElementById('form');
    const pv = document.getElementById('pv');

    const renderForm = () => {
      formEl.innerHTML = (template.sections || [])
        .filter((s) => s.type === 'fields')
        .map(
          (s) => `<fieldset><legend>${esc(s.title || 'Rubrique')}</legend><div class="form-grid">${(s.fields || [])
            .map((f) => fieldInput(f, values[f.key]))
            .join('')}</div></fieldset>`
        )
        .join('');
    };

    const refresh = async () => {
      await renderInto(pv, template, values, fiche ? fiche.reference : null);
    };
    const refreshSoon = debounce(() => guard(refresh), 150);

    formEl.addEventListener('input', (e) => {
      const el = e.target.closest('[data-field]');
      if (!el) return;
      const key = el.dataset.field;
      if (el.dataset.part != null) {
        const arr = Array.isArray(values[key]) ? values[key].slice() : [];
        arr[Number(el.dataset.part)] = el.value;
        values[key] = arr;
      } else {
        values[key] = el.value;
      }
      el.classList.remove('invalid');
      state.dirty = true;
      refreshSoon();
    });

    const sel = document.getElementById('tpl-select');
    if (sel)
      sel.addEventListener('change', async () => {
        if (state.dirty) {
          const ok = await confirmBox('Changer de modèle', 'Les informations déjà saisies seront effacées. Continuer ?', 'Changer de modèle', true);
          if (!ok) {
            sel.value = String(currentTemplateId);
            return;
          }
        }
        const t = templates.find((x) => x.id === Number(sel.value));
        currentTemplateId = t.id;
        template = t.data;
        values = D.defaultValues(template);
        state.dirty = false;
        renderForm();
        guard(refresh);
      });

    document.getElementById('b-cancel').onclick = () => navigate(fiche ? 'viewFiche' : 'fiches', fiche ? { id: fiche.id } : {});
    document.getElementById('b-save').onclick = () =>
      guard(async () => {
        const missing = D.missingRequired(template, values);
        if (missing.length) {
          D.allFields(template)
            .filter((f) => missing.includes(f.label))
            .forEach((f) => formEl.querySelectorAll(`[data-field="${CSS.escape(f.key)}"]`).forEach((i) => i.classList.add('invalid')));
          toast('Veuillez remplir : ' + missing.join(', '), 'error');
          return;
        }
        let saved;
        if (fiche) saved = await call(window.api.fiches.update(fiche.id, values));
        else saved = await call(window.api.fiches.create({ templateId: currentTemplateId, template, values }));
        state.dirty = false;
        toast(`Fiche ${saved.reference} enregistrée`, 'ok');
        navigate('viewFiche', { id: saved.id });
      });

    renderForm();
    await refresh();
    const first = formEl.querySelector('input[type=text]');
    if (first) first.focus();
  }

  // ------------------------------------------------------------------ modèles
  async function viewTemplates() {
    const templates = await call(window.api.templates.list());
    $view.innerHTML = `
      <div class="page-head">
        <div><h1>Modèles de fiche</h1><div class="sub">Un modèle définit l’en-tête, le titre, les textes fixes, les champs à remplir et la zone des signatures.</div></div>
        <div class="actions"><button class="btn primary" id="b-create">＋ Créer un modèle vierge</button></div>
      </div>
      <div class="tpl-grid">${templates
        .map((t) => {
          const nbFields = D.allFields(t.data).length;
          return `<div class="card tpl-card">
            <div class="tpl-name">${esc(t.name)}${t.isDefault ? '<span class="badge">PAR DÉFAUT</span>' : ''}</div>
            <div class="meta">Préfixe des références : <b>${esc(t.data.refPrefix || '')}</b> · ${nbFields} champ${nbFields > 1 ? 's' : ''} · modifié le ${esc(formatDateTime(t.updatedAt))}</div>
            <div class="actions">
              <button class="btn small primary" data-act="use" data-id="${t.id}">Nouvelle fiche</button>
              <button class="btn small" data-act="preview" data-id="${t.id}">Aperçu</button>
              <button class="btn small" data-act="edit" data-id="${t.id}">Modifier</button>
              <button class="btn small" data-act="dup" data-id="${t.id}">Dupliquer</button>
              ${t.isDefault ? '' : `<button class="btn small" data-act="default" data-id="${t.id}">Par défaut</button>`}
              ${templates.length > 1 ? `<button class="btn small danger" data-act="del" data-id="${t.id}">Supprimer</button>` : ''}
            </div></div>`;
        })
        .join('')}</div>
      <p class="muted small-text">Modifier un modèle ne change pas les fiches déjà enregistrées : chaque fiche conserve la version du modèle avec laquelle elle a été créée.</p>`;

    document.getElementById('b-create').onclick = () => navigate('editTemplate', { blank: true });
    $view.querySelector('.tpl-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = Number(b.dataset.id);
      const t = templates.find((x) => x.id === id);
      guard(async () => {
        switch (b.dataset.act) {
          case 'use':
            return navigate('new', { templateId: id });
          case 'edit':
            return navigate('editTemplate', { id });
          case 'preview': {
            const html = await documentHtml(t.data, D.defaultValues(t.data), null);
            return modal(`<h2>${esc(t.name)}</h2><div class="preview zoom-m preview-center" id="mpv">${html}</div><div class="actions"><button class="btn" data-close="x">Fermer</button></div>`, {
              wide: true,
              onMount: (el) => {
                fitPages(el);
              },
            });
          }
          case 'dup':
            await call(window.api.templates.duplicate(id));
            toast('Modèle dupliqué', 'ok');
            return viewTemplates();
          case 'default':
            await call(window.api.templates.setDefault(id));
            toast('Modèle par défaut mis à jour', 'ok');
            return viewTemplates();
          case 'del': {
            const ok = await confirmBox('Supprimer le modèle', `Supprimer le modèle <b>${esc(t.name)}</b> ? Les fiches déjà créées avec ce modèle sont conservées.`, 'Supprimer', true);
            if (!ok) return;
            await call(window.api.templates.remove(id));
            toast('Modèle supprimé', 'ok');
            return viewTemplates();
          }
        }
      });
    });
  }

  function blankTemplate() {
    return {
      name: 'Nouveau modèle',
      refPrefix: 'FA',
      nameField: 'nom_beneficiaire',
      dateField: 'date_etablissement',
      qrPosition: 'top-right',
      header: ['REPUBLIQUE DU BENIN'],
      title: 'FICHE D’ATTRIBUTION DE PARCELLE DE TERRAIN',
      sections: [
        { type: 'fields', title: 'Établissement de la fiche', hidden: true, numbered: false, fields: [{ key: 'date_etablissement', label: 'Date d’établissement', type: 'date', required: true, defaultToday: true }] },
        { type: 'text', content: 'Texte d’introduction…' },
        { type: 'fields', title: 'IDENTIFICATION DU BENEFICIAIRE', numbered: true, fields: [{ key: 'nom_beneficiaire', label: 'Nom et Prénom (s)', type: 'text', required: true, uppercase: true }] },
        {
          type: 'signatures', title: 'SIGNATURES DES PARTIES', numbered: true, placeLine: 'Fait à …………… le, {{date_etablissement}}',
          left: { title: 'Les attribuants', numbered: true, signers: [{ name: '', note: '' }] },
          right: { title: 'Le bénéficiaire', numbered: false, signers: [{ name: '{{nom_beneficiaire}}', note: '' }] },
        },
      ],
    };
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }
  function parentOf(obj, path) {
    const keys = path.split('.');
    const idx = Number(keys.pop());
    return { arr: getPath(obj, keys.join('.')), idx };
  }

  function uniqueKey(tpl, base, except) {
    const used = new Set(D.allFields(tpl).filter((f) => f !== except).map((f) => f.key));
    (tpl.sections || []).forEach((s) => s.type === 'fields' && s.fields.forEach((f) => f !== except && used.add(f.key)));
    let k = base;
    let i = 2;
    while (used.has(k) || k === 'reference') k = `${base}_${i++}`;
    return k;
  }

  async function viewEditTemplate({ id = null, blank = false } = {}) {
    let record = null;
    let draft;
    if (id) {
      record = await call(window.api.templates.get(id));
      draft = clone(record.data);
    } else {
      draft = blankTemplate();
    }

    $view.innerHTML = `
      <div class="page-head sticky-actions">
        <div><h1>${record ? 'Modifier le modèle' : 'Nouveau modèle'}</h1>
          <div class="sub">Les fiches déjà enregistrées ne seront pas modifiées.</div></div>
        <div class="actions">
          <button class="btn" id="b-cancel">Annuler</button>
          <button class="btn primary" id="b-save">💾 Enregistrer le modèle</button>
        </div>
      </div>
      <div class="split">
        <div class="left" id="editor"></div>
        <div class="preview-panel"><div class="label">Aperçu du modèle</div><div class="preview zoom-s" id="pv"></div></div>
      </div>`;
    const editor = document.getElementById('editor');
    const pv = document.getElementById('pv');

    const refresh = () => renderInto(pv, draft, D.defaultValues(draft), null);
    const refreshSoon = debounce(() => guard(refresh), 200);

    const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const chk = (path, val, label) => `<label class="check"><input type="checkbox" data-bind="${path}" data-kind="bool" ${val ? 'checked' : ''}> ${label}</label>`;
    const txt = (path, val, ph = '') => `<input type="text" data-bind="${path}" value="${esc(val || '')}" placeholder="${esc(ph)}">`;
    const moveBtns = (path) => `<button class="btn icon small" data-action="up" data-path="${path}" title="Monter">↑</button>
      <button class="btn icon small" data-action="down" data-path="${path}" title="Descendre">↓</button>
      <button class="btn icon small danger" data-action="remove" data-path="${path}" title="Supprimer">✕</button>`;

    const codesHelp = () => {
      const codes = D.allFields(draft).map((f) => f.key).concat(['reference']);
      return `<div class="codes">Codes disponibles (cliquez pour insérer) : ${codes.map((c) => `<button class="code-chip" data-insert="{{${esc(c)}}}">{{${esc(c)}}}</button>`).join(' ')}</div>`;
    };

    const fieldRow = (f, path) => `
      <div class="field-row">
        <div class="row-main">
          <label class="field">Libellé${txt(path + '.label', f.label)}</label>
          <label class="field">Code <span class="hint">pour {{…}}</span><input type="text" data-bind="${path}.key" data-kind="key" value="${esc(f.key)}" ${f.type === 'subtitle' ? 'disabled' : ''}></label>
          <label class="field">Type<select data-bind="${path}.type" data-structural="1">${opt(FIELD_TYPES, f.type)}</select></label>
          <label class="field">Unité${txt(path + '.suffix', f.suffix, 'ex. m²')}</label>
          <div class="actions">${moveBtns(path)}</div>
        </div>
        ${
          f.type === 'subtitle'
            ? ''
            : `<div class="row-opts">${chk(path + '.required', f.required, 'Obligatoire')}${chk(path + '.uppercase', f.uppercase, 'En MAJUSCULES')}${chk(path + '.indent', f.indent, 'En retrait')}${
                f.type === 'date' ? chk(path + '.defaultToday', f.defaultToday, 'Date du jour par défaut') : ''
              }${f.type !== 'date' && f.type !== 'double' ? `<label class="check">Valeur par défaut ${txt(path + '.defaultValue', f.defaultValue)}</label>` : ''}</div>`
        }
        ${
          f.type === 'double'
            ? `<div class="double-opts">
                <label class="field">Valeur 1${txt(path + '.parts.0.label', (f.parts[0] || {}).label)}</label>
                <label class="field">Type 1<select data-bind="${path}.parts.0.type">${opt(PART_TYPES, (f.parts[0] || {}).type)}</select></label>
                <label class="field">Valeur 2${txt(path + '.parts.1.label', (f.parts[1] || {}).label)}</label>
                <label class="field">Type 2<select data-bind="${path}.parts.1.type">${opt(PART_TYPES, (f.parts[1] || {}).type)}</select></label>
                <label class="field">Séparateur${txt(path + '.separator', f.separator)}</label>
              </div>`
            : ''
        }
      </div>`;

    const signerCol = (c, path, heading) => `
      <div class="card" style="margin-bottom:8px">
        <h3>${heading}</h3>
        <div class="form-grid" style="margin-bottom:8px">
          <label class="field">Titre${txt(path + '.title', c.title)}</label>
          <div style="align-self:end">${chk(path + '.numbered', c.numbered, 'Numéroter les signataires')}</div>
        </div>
        ${(c.signers || [])
          .map(
            (s, i) => `<div class="signer-row">${txt(`${path}.signers.${i}.name`, s.name, 'Nom du signataire')}${txt(`${path}.signers.${i}.note`, s.note, 'Mention (facultatif)')}
              <div class="actions">${moveBtns(`${path}.signers.${i}`)}</div></div>`
          )
          .join('')}
        <button class="btn small" data-action="add-signer" data-path="${path}.signers">＋ Ajouter un signataire</button>
      </div>`;

    const sectionCard = (s, i) => {
      const p = `sections.${i}`;
      const head = (label) => `<div class="section-head"><span class="section-type">${label}</span><div class="actions">${moveBtns(p)}</div></div>`;
      if (s.type === 'text')
        return `<div class="card section-card text">${head('Texte fixe')}<textarea data-bind="${p}.content" rows="5">${esc(s.content || '')}</textarea>${codesHelp()}</div>`;
      if (s.type === 'signatures')
        return `<div class="card section-card signatures">${head('Zone des signatures')}
          <div class="form-grid" style="margin-bottom:10px">
            <label class="field">Titre de la rubrique${txt(p + '.title', s.title)}</label>
            <div style="align-self:end">${chk(p + '.numbered', s.numbered, 'Numéroter la rubrique')}</div>
            <label class="field full">Ligne « Fait à … le … »${txt(p + '.placeLine', s.placeLine)}</label>
          </div>
          ${signerCol(s.left, p + '.left', 'Colonne de gauche')}
          ${signerCol(s.right, p + '.right', 'Colonne de droite')}
          ${codesHelp()}</div>`;
      return `<div class="card section-card">${head('Rubrique de champs')}
        <div class="form-grid" style="margin-bottom:10px">
          <label class="field full">Titre de la rubrique${txt(p + '.title', s.title)}</label>
          <div>${chk(p + '.numbered', s.numbered, 'Numéroter la rubrique (1., 2., …)')}</div>
          <div>${chk(p + '.hidden', s.hidden, 'Ne pas afficher dans le document')}</div>
        </div>
        ${(s.fields || []).map((f, j) => fieldRow(f, `${p}.fields.${j}`)).join('')}
        <button class="btn small" data-action="add-field" data-path="${p}.fields">＋ Ajouter un champ</button></div>`;
    };

    const renderEditor = () => {
      const fields = D.allFields(draft);
      const nameOpts = fields.filter((f) => f.type !== 'date').map((f) => [f.key, f.label]);
      const dateOpts = [['', '— aucune —']].concat(fields.filter((f) => f.type === 'date').map((f) => [f.key, f.label]));
      editor.innerHTML = `
        <div class="card"><h2>Informations générales</h2>
          <div class="form-grid">
            <label class="field full">Nom du modèle <span class="req">*</span>${txt('name', draft.name)}</label>
            <label class="field">Préfixe des références <span class="hint">ex. GBF → GBF-2026-0001</span><input type="text" data-bind="refPrefix" data-kind="prefix" value="${esc(draft.refPrefix || '')}" maxlength="12"></label>
            <label class="field">Emplacement du QR code<select data-bind="qrPosition">${opt(QR_POSITIONS, draft.qrPosition)}</select></label>
            <label class="field">Champ « nom du bénéficiaire » <span class="hint">utilisé pour la recherche</span><select data-bind="nameField">${nameOpts
              .map(([k, l]) => `<option value="${esc(k)}" ${k === draft.nameField ? 'selected' : ''}>${esc(l)}</option>`)
              .join('')}</select></label>
            <label class="field">Champ « date d’établissement »<select data-bind="dateField">${dateOpts
              .map(([k, l]) => `<option value="${esc(k)}" ${k === (draft.dateField || '') ? 'selected' : ''}>${esc(l)}</option>`)
              .join('')}</select></label>
            <label class="field full">En-tête <span class="hint">une ligne par ligne d’en-tête</span><textarea data-bind="header" data-kind="lines" rows="3">${esc((draft.header || []).join('\n'))}</textarea></label>
            <label class="field full">Titre du document${txt('title', draft.title)}</label>
          </div>
        </div>
        ${(draft.sections || []).map(sectionCard).join('')}
        <div class="add-bar">
          <button class="btn" data-action="add-section" data-kind="text">＋ Texte fixe</button>
          <button class="btn" data-action="add-section" data-kind="fields">＋ Rubrique de champs</button>
          <button class="btn" data-action="add-section" data-kind="signatures">＋ Zone des signatures</button>
        </div>`;
    };

    let lastFocused = null;
    editor.addEventListener('focusin', (e) => {
      if (e.target.matches('textarea[data-bind], input[type=text][data-bind]')) lastFocused = e.target;
    });

    editor.addEventListener('input', (e) => {
      const el = e.target.closest('[data-bind]');
      if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
      applyBinding(el);
    });
    editor.addEventListener('change', (e) => {
      const el = e.target.closest('[data-bind]');
      if (!el || !(el.tagName === 'SELECT' || el.type === 'checkbox')) return;
      applyBinding(el);
      if (el.dataset.structural) {
        const f = getPath(draft, el.dataset.bind.replace(/\.type$/, ''));
        if (f.type === 'double' && !(f.parts && f.parts.length === 2)) {
          f.parts = [{ label: 'Valeur 1', type: 'text' }, { label: 'Valeur 2', type: 'text' }];
          if (f.separator == null) f.separator = ', ';
        }
        renderEditor();
      }
    });

    function applyBinding(el) {
      const path = el.dataset.bind;
      const kind = el.dataset.kind;
      let v = el.value;
      if (kind === 'bool') v = el.checked;
      else if (kind === 'lines') v = el.value.split('\n');
      else if (kind === 'prefix') {
        v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v !== el.value) el.value = v;
      } else if (kind === 'key') {
        v = slug(el.value).replace(/^(\d)/, 'c_$1');
        const fieldPath = path.replace(/\.key$/, '');
        const f = getPath(draft, fieldPath);
        renameKey(f.key, v);
        delete f._auto;
      }
      setPath(draft, path, v);
      // Un nouveau champ prend automatiquement un code dérivé de son libellé.
      if (/\.fields\.\d+\.label$/.test(path)) {
        const f = getPath(draft, path.replace(/\.label$/, ''));
        if (f._auto) {
          const nk = uniqueKey(draft, slug(v), f);
          renameKey(f.key, nk);
          f.key = nk;
          const keyInput = editor.querySelector(`[data-bind="${path.replace(/\.label$/, '.key')}"]`);
          if (keyInput) keyInput.value = nk;
        }
      }
      state.dirty = true;
      refreshSoon();
    }

    // Garde le champ « nom » / « date » cohérent quand un code change.
    function renameKey(oldKey, newKey) {
      if (draft.nameField === oldKey) draft.nameField = newKey;
      if (draft.dateField === oldKey) draft.dateField = newKey;
    }

    editor.addEventListener('click', (e) => {
      const ins = e.target.closest('[data-insert]');
      if (ins) {
        e.preventDefault();
        const target = lastFocused && editor.contains(lastFocused) ? lastFocused : null;
        if (!target) return toast('Cliquez d’abord dans un texte où insérer le code.');
        const s = target.selectionStart ?? target.value.length;
        target.value = target.value.slice(0, s) + ins.dataset.insert + target.value.slice(target.selectionEnd ?? s);
        target.focus();
        target.selectionStart = target.selectionEnd = s + ins.dataset.insert.length;
        applyBinding(target);
        return;
      }
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const action = b.dataset.action;
      const path = b.dataset.path;
      if (action === 'add-section') {
        const kind = b.dataset.kind;
        const sec =
          kind === 'text'
            ? { type: 'text', content: '' }
            : kind === 'fields'
            ? { type: 'fields', title: 'NOUVELLE RUBRIQUE', numbered: true, fields: [] }
            : {
                type: 'signatures', title: 'SIGNATURES', numbered: true, placeLine: 'Fait à …………… le, {{date_etablissement}}',
                left: { title: 'Les attribuants', numbered: true, signers: [{ name: '', note: '' }] },
                right: { title: 'Le bénéficiaire', numbered: false, signers: [{ name: '{{nom_beneficiaire}}', note: '' }] },
              };
        draft.sections.push(sec);
      } else if (action === 'add-field') {
        const arr = getPath(draft, path);
        arr.push({ key: uniqueKey(draft, 'nouveau_champ'), label: 'Nouveau champ', type: 'text', _auto: true });
      } else if (action === 'add-signer') {
        getPath(draft, path).push({ name: '', note: '' });
      } else {
        const { arr, idx } = parentOf(draft, path);
        if (action === 'remove') arr.splice(idx, 1);
        else if (action === 'up' && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        else if (action === 'down' && idx < arr.length - 1) [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      }
      state.dirty = true;
      renderEditor();
      refreshSoon();
    });

    function validate() {
      if (!String(draft.name || '').trim()) return 'Le nom du modèle est obligatoire.';
      if (!draft.refPrefix) return 'Le préfixe des références est obligatoire.';
      const keys = new Set();
      for (const s of draft.sections) {
        if (s.type !== 'fields') continue;
        for (const f of s.fields) {
          if (f.type === 'subtitle') {
            if (!f.key) f.key = uniqueKey(draft, 'sous_titre', f);
            continue;
          }
          if (!String(f.label || '').trim()) return 'Un champ n’a pas de libellé.';
          if (!f.key) return `Le champ « ${f.label} » n’a pas de code.`;
          if (keys.has(f.key)) return `Le code « ${f.key} » est utilisé par plusieurs champs.`;
          keys.add(f.key);
        }
      }
      if (!keys.size) return 'Le modèle doit contenir au moins un champ.';
      if (!keys.has(draft.nameField)) return 'Choisissez le champ « nom du bénéficiaire ».';
      if (draft.dateField && !keys.has(draft.dateField)) draft.dateField = '';
      return null;
    }

    document.getElementById('b-cancel').onclick = () => navigate('templates');
    document.getElementById('b-save').onclick = () =>
      guard(async () => {
        const err = validate();
        if (err) return toast(err, 'error');
        const data = clone(draft);
        data.header = (data.header || []).map((l) => l.trim()).filter(Boolean);
        data.sections.forEach((s) => s.type === 'fields' && s.fields.forEach((f) => delete f._auto));
        if (record) await call(window.api.templates.update(record.id, data));
        else await call(window.api.templates.create(data));
        state.dirty = false;
        toast('Modèle enregistré', 'ok');
        navigate('templates');
      });

    renderEditor();
    await refresh();
  }

  // ------------------------------------------------------------------ sauvegarde
  async function viewBackup() {
    const info = await call(window.api.backup.info());
    $view.innerHTML = `
      <div class="page-head"><div><h1>Sauvegarde des données</h1>
        <div class="sub">Toutes les fiches et tous les modèles sont dans un seul fichier sur cet ordinateur.</div></div></div>
      <div class="card"><h2>Base de données locale</h2>
        <div class="kv"><div class="muted">Fichier</div><div><code>${esc(info.file)}</code></div>
        <div class="muted">Fiches enregistrées</div><div>${info.fiches}</div>
        <div class="muted">Modèles</div><div>${info.templates}</div></div>
        <div class="actions" style="margin-top:12px"><button class="btn" id="b-folder">📂 Ouvrir le dossier des données</button></div>
      </div>
      <div class="card"><h2>Créer une sauvegarde</h2>
        <p>Enregistre une copie complète (fiches + modèles) dans le fichier de votre choix. <b>Copiez ensuite ce fichier sur une clé USB ou un disque externe.</b>
        Sans copie externe, une panne, une suppression ou un vol de l’ordinateur peut entraîner la perte des données.</p>
        <button class="btn primary" id="b-export">💾 Créer une sauvegarde…</button>
      </div>
      <div class="card"><h2>Restaurer une sauvegarde</h2>
        <p>Remplace toutes les données actuelles par celles d’un fichier de sauvegarde. Une copie de sécurité des données actuelles est créée automatiquement dans le dossier des données avant le remplacement.</p>
        <button class="btn danger" id="b-import">Restaurer une sauvegarde…</button>
      </div>`;
    document.getElementById('b-folder').onclick = () => guard(() => call(window.api.backup.openFolder()));
    document.getElementById('b-export').onclick = () =>
      guard(async () => {
        const file = await call(window.api.backup.exportFile());
        if (file) toast('Sauvegarde créée : ' + file, 'ok');
      });
    document.getElementById('b-import').onclick = () =>
      guard(async () => {
        const ok = await confirmBox('Restaurer une sauvegarde', 'Les fiches et modèles actuels seront remplacés par ceux de la sauvegarde choisie. Continuer ?', 'Choisir le fichier…', true);
        if (!ok) return;
        const res = await call(window.api.backup.importFile());
        if (res) {
          toast('Sauvegarde restaurée', 'ok');
          viewBackup();
        }
      });
  }

  // ------------------------------------------------------------------ aide
  async function viewHelp() {
    $view.innerHTML = `<div class="card help" style="max-width:860px">
      <h1>Guide d’utilisation</h1>
      <h2>Créer une fiche</h2>
      <ol>
        <li>Cliquez sur <b>＋ Nouvelle fiche</b>.</li>
        <li>Choisissez le modèle (le modèle GBAFFO est sélectionné par défaut).</li>
        <li>Remplissez les renseignements du bénéficiaire et de la parcelle. L’aperçu A4 à droite se met à jour pendant la saisie.</li>
        <li>Cliquez sur <b>Enregistrer la fiche</b> : une référence unique (ex. <code>GBF-2026-0001</code>) et un QR code sont attribués.</li>
        <li>Cliquez sur <b>Télécharger en PDF</b> ou <b>Imprimer</b>.</li>
      </ol>
      <h2>Retrouver une fiche</h2>
      <ul>
        <li>Dans <b>Fiches enregistrées</b>, tapez une référence, un nom, un numéro de téléphone ou de pièce d’identité.</li>
        <li>Avec <b>Lire un QR code</b>, présentez le QR code d’une fiche à la caméra ou choisissez une photo : la fiche s’ouvre directement.</li>
        <li>Un lecteur de QR code USB (douchette) peut aussi être utilisé : cliquez dans la zone de recherche puis scannez.</li>
      </ul>
      <h2>Modèles</h2>
      <ul>
        <li>Dans <b>Modèles</b>, vous pouvez modifier, dupliquer, prévisualiser ou créer un modèle : en-tête, titre, textes fixes, rubriques de champs et zone des signatures.</li>
        <li>Dans un texte fixe, <code>{{code}}</code> est remplacé par la valeur du champ correspondant (ex. <code>{{date_etablissement}}</code>).</li>
        <li>Modifier un modèle ne change jamais les fiches déjà enregistrées.</li>
      </ul>
      <h2>Sauvegarde</h2>
      <p>Pensez à créer régulièrement une sauvegarde (menu <b>Sauvegarde</b>) et à la copier sur une clé USB ou un disque externe.</p>
      <h2>À savoir</h2>
      <p class="muted">Le QR code contient la référence de la fiche ; il permet de la retrouver dans cette application. Il ne donne pas accès à la base de données de l’ordinateur et ne constitue pas une certification officielle du document.</p>
    </div>`;
  }

  const VIEWS = {
    fiches: viewFiches,
    new: (p) => viewEditFiche({ templateId: p.templateId }),
    editFiche: viewEditFiche,
    viewFiche,
    templates: viewTemplates,
    editTemplate: viewEditTemplate,
    backup: viewBackup,
    help: viewHelp,
  };

  // À la fermeture de la fenêtre, le processus principal demande confirmation s'il reste des modifications.
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.returnValue = false;
  });

  navigate('fiches');
})();
