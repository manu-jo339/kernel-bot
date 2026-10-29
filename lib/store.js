// Kernel Bot — stockage générique de documents JSON (SQLite local)
// Exemple : store.set('groupe', jid, { antilien: true }) puis store.get('groupe', jid, {})
const { db } = require('./db');

const q = {
  get: db.prepare('SELECT data FROM docs WHERE ns = ? AND id = ?'),
  set: db.prepare('INSERT OR REPLACE INTO docs (ns, id, data, ts) VALUES (?, ?, ?, ?)'),
  del: db.prepare('DELETE FROM docs WHERE ns = ? AND id = ?'),
  list: db.prepare('SELECT id, data FROM docs WHERE ns = ? ORDER BY ts, id'),
  vider: db.prepare('DELETE FROM docs WHERE ns = ?'),
  compter: db.prepare('SELECT COUNT(*) AS n FROM docs WHERE ns = ?'),
  nsPrefixe: db.prepare("SELECT DISTINCT ns FROM docs WHERE ns LIKE ? ESCAPE '\\'"),
};

const get = (ns, id, defaut = null) => {
  const r = q.get.get(ns, String(id));
  if (!r) return defaut;
  try {
    return JSON.parse(r.data);
  } catch {
    return defaut;
  }
};
const set = (ns, id, valeur) => {
  q.set.run(ns, String(id), JSON.stringify(valeur), Date.now());
  return valeur;
};
const del = (ns, id) => Number(q.del.run(ns, String(id)).changes);
const liste = (ns) =>
  q.list.all(ns).map((r) => {
    try {
      return { id: r.id, data: JSON.parse(r.data) };
    } catch {
      return { id: r.id, data: null };
    }
  });
// Lit, modifie via fn(valeur) (qui peut renvoyer la nouvelle valeur ou modifier en place), puis enregistre
const modifier = (ns, id, defaut, fn) => {
  const v = get(ns, id, defaut);
  const r = fn(v);
  const finale = r === undefined ? v : r;
  set(ns, id, finale);
  return finale;
};
const vider = (ns) => Number(q.vider.run(ns).changes);
const compter = (ns) => q.compter.get(ns).n;
const espaces = (prefixe) => q.nsPrefixe.all(String(prefixe).replace(/[\\%_]/g, '\\$&') + '%').map((r) => r.ns);

module.exports = { get, set, del, liste, modifier, vider, compter, espaces };
