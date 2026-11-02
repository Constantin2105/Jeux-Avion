// Base de données locale SQLite (via sql.js, sans module natif à compiler).
// Toute la base tient dans un seul fichier, réécrit après chaque modification.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { GBAFFO_TEMPLATE } = require('./default-template');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fiches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  template_id INTEGER,
  template_name TEXT NOT NULL,
  template_data TEXT NOT NULL,
  values_json TEXT NOT NULL,
  beneficiary TEXT NOT NULL DEFAULT '',
  date_etab TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, last INTEGER NOT NULL);
`;

const now = () => new Date().toISOString();

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function sanitizePrefix(p) {
  const clean = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean || 'FA';
}

class Store {
  constructor(file, SQL) {
    this.file = file;
    this.SQL = SQL;
    this.db = null;
  }

  static async open(file) {
    const SQL = await initSqlJs({
      locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f),
    });
    const store = new Store(file, SQL);
    store.load();
    return store;
  }

  load() {
    if (fs.existsSync(this.file)) {
      this.db = new this.SQL.Database(fs.readFileSync(this.file));
    } else {
      this.db = new this.SQL.Database();
    }
    this.db.run(SCHEMA);
    if (!this.get('SELECT id FROM templates LIMIT 1')) {
      this.createTemplate(GBAFFO_TEMPLATE, true);
    }
    this.persist();
  }

  // Écriture atomique : fichier temporaire puis renommage.
  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }

  all(sql, params = []) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally {
      st.free();
    }
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] || null;
  }

  run(sql, params = []) {
    this.db.run(sql, params);
  }

  lastId() {
    return this.get('SELECT last_insert_rowid() AS id').id;
  }

  // ---------- Modèles ----------
  listTemplates() {
    return this.all('SELECT * FROM templates ORDER BY is_default DESC, name COLLATE NOCASE').map(rowToTemplate);
  }

  getTemplate(id) {
    const r = this.get('SELECT * FROM templates WHERE id = ?', [id]);
    return r ? rowToTemplate(r) : null;
  }

  createTemplate(data, isDefault = false) {
    const t = now();
    this.run('INSERT INTO templates (name, data, is_default, created_at, updated_at) VALUES (?,?,?,?,?)', [
      data.name || 'Modèle sans nom', JSON.stringify(data), isDefault ? 1 : 0, t, t,
    ]);
    const id = this.lastId();
    this.persist();
    return this.getTemplate(id);
  }

  updateTemplate(id, data) {
    this.run('UPDATE templates SET name = ?, data = ?, updated_at = ? WHERE id = ?', [
      data.name || 'Modèle sans nom', JSON.stringify(data), now(), id,
    ]);
    this.persist();
    return this.getTemplate(id);
  }

  duplicateTemplate(id) {
    const src = this.getTemplate(id);
    if (!src) throw new Error('Modèle introuvable');
    const data = { ...src.data, name: src.data.name + ' (copie)' };
    return this.createTemplate(data, false);
  }

  setDefaultTemplate(id) {
    this.run('UPDATE templates SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END', [id]);
    this.persist();
  }

  deleteTemplate(id) {
    const count = this.get('SELECT COUNT(*) AS n FROM templates').n;
    if (count <= 1) throw new Error('Impossible de supprimer le dernier modèle.');
    const wasDefault = this.get('SELECT is_default FROM templates WHERE id = ?', [id]);
    this.run('DELETE FROM templates WHERE id = ?', [id]);
    if (wasDefault && wasDefault.is_default) {
      const first = this.get('SELECT id FROM templates ORDER BY id LIMIT 1');
      this.run('UPDATE templates SET is_default = 1 WHERE id = ?', [first.id]);
    }
    this.persist();
  }

  // ---------- Fiches ----------
  nextReference(prefix, year) {
    const name = `${sanitizePrefix(prefix)}-${year}`;
    const row = this.get('SELECT last FROM counters WHERE name = ?', [name]);
    let n = row ? row.last : 0;
    let ref;
    do {
      n += 1;
      ref = `${name}-${String(n).padStart(4, '0')}`;
    } while (this.get('SELECT id FROM fiches WHERE reference = ?', [ref]));
    this.run('INSERT INTO counters (name, last) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET last = excluded.last', [name, n]);
    return ref;
  }

  // La fiche garde une copie du modèle utilisé : modifier le modèle plus tard
  // ne change jamais les fiches déjà établies.
  createFiche({ templateId, template, values }) {
    const t = now();
    const ref = this.nextReference(template.refPrefix, new Date().getFullYear());
    const idx = indexValues(template, values);
    this.run(
      `INSERT INTO fiches (reference, template_id, template_name, template_data, values_json, beneficiary, date_etab, search_text, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [ref, templateId || null, template.name || '', JSON.stringify(template), JSON.stringify(values), idx.beneficiary, idx.dateEtab, normalize(ref + ' ' + idx.text), t, t]
    );
    const id = this.lastId();
    this.persist();
    return this.getFiche(id);
  }

  updateFiche(id, values) {
    const f = this.getFiche(id);
    if (!f) throw new Error('Fiche introuvable');
    const idx = indexValues(f.template, values);
    this.run('UPDATE fiches SET values_json = ?, beneficiary = ?, date_etab = ?, search_text = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(values), idx.beneficiary, idx.dateEtab, normalize(f.reference + ' ' + idx.text), now(), id,
    ]);
    this.persist();
    return this.getFiche(id);
  }

  deleteFiche(id) {
    this.run('DELETE FROM fiches WHERE id = ?', [id]);
    this.persist();
  }

  getFiche(id) {
    const r = this.get('SELECT * FROM fiches WHERE id = ?', [id]);
    return r ? rowToFiche(r) : null;
  }

  findByReference(ref) {
    const r = this.get('SELECT * FROM fiches WHERE UPPER(reference) = UPPER(?)', [String(ref || '').trim()]);
    return r ? rowToFiche(r) : null;
  }

  searchFiches(query) {
    const q = normalize(query).trim();
    let rows;
    if (!q) {
      rows = this.all('SELECT * FROM fiches ORDER BY created_at DESC, id DESC');
    } else {
      const words = q.split(/\s+/).filter(Boolean);
      const where = words.map(() => 'search_text LIKE ?').join(' AND ');
      rows = this.all(`SELECT * FROM fiches WHERE ${where} ORDER BY created_at DESC, id DESC`, words.map((w) => `%${w}%`));
    }
    return rows.map((r) => {
      const f = rowToFiche(r);
      delete f.template; // liste allégée
      return f;
    });
  }

  stats() {
    return {
      fiches: this.get('SELECT COUNT(*) AS n FROM fiches').n,
      templates: this.get('SELECT COUNT(*) AS n FROM templates').n,
    };
  }

  // ---------- Sauvegarde ----------
  exportBytes() {
    return Buffer.from(this.db.export());
  }

  // Vérifie qu'un fichier est bien une sauvegarde de cette application avant de remplacer la base.
  restoreFrom(bytes) {
    const test = new this.SQL.Database(bytes);
    try {
      const tables = new Set();
      const res = test.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (res[0]) res[0].values.forEach((v) => tables.add(v[0]));
      if (!tables.has('fiches') || !tables.has('templates')) {
        throw new Error("Ce fichier n'est pas une sauvegarde de l'application.");
      }
    } finally {
      test.close();
    }
    this.db.close();
    this.db = new this.SQL.Database(bytes);
    this.db.run(SCHEMA);
    this.persist();
  }
}

function rowToTemplate(r) {
  return { id: r.id, name: r.name, data: JSON.parse(r.data), isDefault: !!r.is_default, createdAt: r.created_at, updatedAt: r.updated_at };
}

function rowToFiche(r) {
  return {
    id: r.id,
    reference: r.reference,
    templateId: r.template_id,
    templateName: r.template_name,
    template: JSON.parse(r.template_data),
    values: JSON.parse(r.values_json),
    beneficiary: r.beneficiary,
    dateEtab: r.date_etab,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function indexValues(template, values) {
  const v = values || {};
  const flat = (x) => (Array.isArray(x) ? x.join(' ') : x == null ? '' : String(x));
  const text = Object.values(v).map(flat).join(' ');
  let beneficiary = template.nameField ? flat(v[template.nameField]) : '';
  const field = findField(template, template.nameField);
  if (field && field.uppercase) beneficiary = beneficiary.toUpperCase();
  const dateEtab = template.dateField ? flat(v[template.dateField]) : '';
  return { beneficiary: beneficiary.trim(), dateEtab, text };
}

function findField(template, key) {
  for (const s of template.sections || []) {
    if (s.type !== 'fields') continue;
    for (const f of s.fields || []) if (f.key === key) return f;
  }
  return null;
}

module.exports = { Store, normalize, sanitizePrefix };
