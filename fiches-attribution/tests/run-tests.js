// Tests automatiques : base de données + génération du document (sans Electron).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/db');
const D = require('../src/document');
const { GBAFFO_TEMPLATE } = require('../src/default-template');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiches-'));
  const file = path.join(dir, 'fiches.sqlite');
  let store = await Store.open(file);

  // Modèle initial présent
  const tpls = store.listTemplates();
  assert.strictEqual(tpls.length, 1);
  assert.ok(tpls[0].isDefault);
  const tpl = tpls[0];

  // Deux fiches différentes, références distinctes, modèle inchangé
  const v1 = Object.assign(D.defaultValues(tpl.data), { nom_beneficiaire: 'Tonoukoin Codjo Francis', naissance: ['1974-05-30', 'Dassa'], superficie: '500', profession_tel: ['Ingénieur Géomètre', '01 959515675'] });
  const v2 = Object.assign(D.defaultValues(tpl.data), { nom_beneficiaire: 'AGBO Marie' });
  const f1 = store.createFiche({ templateId: tpl.id, template: tpl.data, values: v1 });
  const f2 = store.createFiche({ templateId: tpl.id, template: tpl.data, values: v2 });
  const year = new Date().getFullYear();
  assert.strictEqual(f1.reference, `GBF-${year}-0001`);
  assert.strictEqual(f2.reference, `GBF-${year}-0002`);
  assert.strictEqual(f1.beneficiary, 'TONOUKOIN CODJO FRANCIS');
  assert.deepStrictEqual(store.getTemplate(tpl.id).data, GBAFFO_TEMPLATE);

  // Modifier le modèle ne change pas les fiches existantes
  store.updateTemplate(tpl.id, { ...tpl.data, title: 'TITRE MODIFIE' });
  assert.strictEqual(store.getFiche(f1.id).template.title, GBAFFO_TEMPLATE.title);

  // Recherche (référence, nom sans accents/majuscules, téléphone)
  assert.strictEqual(store.searchFiches('tonoukoin').length, 1);
  assert.strictEqual(store.searchFiches('ingenieur geometre').length, 1);
  assert.strictEqual(store.searchFiches(f2.reference).length, 1);
  assert.strictEqual(store.searchFiches('').length, 2);
  assert.strictEqual(store.findByReference(f1.reference.toLowerCase()).id, f1.id);

  // Persistance après fermeture / réouverture
  store = await Store.open(file);
  assert.strictEqual(store.searchFiches('').length, 2);
  const f3 = store.createFiche({ templateId: tpl.id, template: tpl.data, values: v2 });
  assert.strictEqual(f3.reference, `GBF-${year}-0003`);

  // Suppression : le numéro n'est jamais réutilisé
  store.deleteFiche(f3.id);
  const f4 = store.createFiche({ templateId: tpl.id, template: tpl.data, values: v2 });
  assert.strictEqual(f4.reference, `GBF-${year}-0004`);

  // Sauvegarde / restauration
  const backup = store.exportBytes();
  store.deleteFiche(f4.id);
  store.restoreFrom(backup);
  assert.strictEqual(store.searchFiches('').length, 3);
  assert.throws(() => store.restoreFrom(Buffer.from('pas une base')));

  // Document
  assert.strictEqual(D.formatDate('2026-09-30'), '30 septembre 2026');
  assert.strictEqual(D.formatDate('2026-09-01'), '1er septembre 2026');
  const html = D.renderDocument(f1.template, f1.values, { reference: f1.reference, qrDataUrl: 'data:image/png;base64,AA==' });
  assert.ok(html.includes('TONOUKOIN CODJO FRANCIS'));
  assert.ok(html.includes('30 mai 1974 à Dassa'));
  assert.ok(html.includes('Ingénieur Géomètre, Tél. 01 959515675'));
  assert.ok(html.includes('500 m²'));
  assert.ok(html.includes('Réf. : ' + f1.reference));
  assert.ok(!html.includes('{{'));
  assert.ok(html.includes('1.&nbsp;&nbsp;&nbsp;IDENTIFICATION DU BENEFICIAIRE'));
  assert.ok(html.includes('3.&nbsp;&nbsp;&nbsp;SIGNATURES DES PARTIES'));
  assert.ok(D.renderDocument(tpl.data, { nom_beneficiaire: '<script>' }, {}).includes('&lt;SCRIPT&gt;'));
  assert.deepStrictEqual(D.missingRequired(f1.template, {}), ['Date d’établissement', 'Nom et Prénom (s)']);

  // QR : la référence se retrouve dans le texte encodé
  assert.strictEqual(D.extractReference(D.qrText(f1.reference, f1.beneficiary)), f1.reference);
  assert.strictEqual(D.extractReference('rien'), null);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('Tous les tests sont passés ✔');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
