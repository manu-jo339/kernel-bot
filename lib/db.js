// MWENOBANGUE Labs — base de données locale (SQLite intégré à Node.js)
// Le fichier est créé automatiquement dans le dossier data/ (jamais envoyé sur Internet).
const fs = require('fs');
const path = require('path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  throw new Error('La base de données demande Node.js 22.5 ou plus récent. Mets Node.js à jour.');
}

const dossier = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dossier, { recursive: true });
const db = new DatabaseSync(path.join(dossier, 'bot.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS ia_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cle TEXT NOT NULL,            -- p:<numéro> (privé) ou g:<groupe> (groupe)
    utilisateur TEXT,             -- numéro de l'auteur (pour .oublier dans un groupe)
    role TEXT NOT NULL,           -- user | assistant
    nom TEXT,                     -- nom affiché de l'auteur
    contenu TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ia_messages_cle ON ia_messages (cle, id);
  CREATE TABLE IF NOT EXISTS ia_usage (
    utilisateur TEXT NOT NULL,
    jour TEXT NOT NULL,
    nb INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (utilisateur, jour)
  );
  CREATE TABLE IF NOT EXISTS ia_info (
    utilisateur TEXT PRIMARY KEY,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ia_actif (
    chat TEXT PRIMARY KEY,
    actif INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kv (
    cle TEXT PRIMARY KEY,
    valeur TEXT
  );
  -- Stockage générique (réglages de groupes, avertissements, notes, dettes, stock…) : un espace (ns) et un identifiant
  CREATE TABLE IF NOT EXISTS docs (
    ns TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (ns, id)
  );
  -- Tâches programmées (rappels, annonces, messages différés, surveillance…)
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quand INTEGER NOT NULL,
    type TEXT NOT NULL,
    data TEXT,
    repete INTEGER NOT NULL DEFAULT 0,
    cle TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_quand ON jobs (quand);
`);

const q = {
  ajouterMsg: db.prepare('INSERT INTO ia_messages (cle, utilisateur, role, nom, contenu, ts) VALUES (?, ?, ?, ?, ?, ?)'),
  derniers: db.prepare('SELECT role, nom, contenu FROM ia_messages WHERE cle = ? ORDER BY id DESC LIMIT ?'),
  oublierCle: db.prepare('DELETE FROM ia_messages WHERE cle = ?'),
  oublierUtilisateur: db.prepare("DELETE FROM ia_messages WHERE cle = ? AND utilisateur = ? AND role = 'user'"),
  purgerMsg: db.prepare('DELETE FROM ia_messages WHERE ts < ?'),
  purgerUsage: db.prepare('DELETE FROM ia_usage WHERE jour < ?'),
  usageLire: db.prepare('SELECT nb FROM ia_usage WHERE utilisateur = ? AND jour = ?'),
  usageAjouter: db.prepare(
    'INSERT INTO ia_usage (utilisateur, jour, nb) VALUES (?, ?, 1) ON CONFLICT(utilisateur, jour) DO UPDATE SET nb = nb + 1'
  ),
  infoLire: db.prepare('SELECT ts FROM ia_info WHERE utilisateur = ?'),
  infoEcrire: db.prepare('INSERT OR REPLACE INTO ia_info (utilisateur, ts) VALUES (?, ?)'),
  actifLire: db.prepare('SELECT actif FROM ia_actif WHERE chat = ?'),
  actifEcrire: db.prepare('INSERT OR REPLACE INTO ia_actif (chat, actif, ts) VALUES (?, ?, ?)'),
  kvLire: db.prepare('SELECT valeur FROM kv WHERE cle = ?'),
  kvEcrire: db.prepare('INSERT OR REPLACE INTO kv (cle, valeur) VALUES (?, ?)'),
  compterMsg: db.prepare('SELECT COUNT(*) AS n FROM ia_messages WHERE cle = ?'),
};

const jourJ = (decalage = 0) =>
  new Date(Date.now() + decalage * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Brazzaville' });

module.exports = {
  db,
  jourJ,
  ajouterMessage: (cle, utilisateur, role, nom, contenu) =>
    q.ajouterMsg.run(cle, utilisateur || null, role, nom || null, contenu, Date.now()),
  historique: (cle, n) => q.derniers.all(cle, n).reverse(),
  nbMessages: (cle) => q.compterMsg.get(cle).n,
  oublierTout: (cle) => Number(q.oublierCle.run(cle).changes),
  oublierUtilisateur: (cle, utilisateur) => Number(q.oublierUtilisateur.run(cle, utilisateur).changes),
  purger: (joursConservation) => {
    q.purgerMsg.run(Date.now() - joursConservation * 86400000);
    q.purgerUsage.run(jourJ(-3));
  },
  usageAujourdhui: (utilisateur) => q.usageLire.get(utilisateur, jourJ())?.nb || 0,
  compterUsage: (utilisateur) => q.usageAjouter.run(utilisateur, jourJ()),
  aRecuInfo: (utilisateur) => !!q.infoLire.get(utilisateur),
  marquerInfo: (utilisateur) => q.infoEcrire.run(utilisateur, Date.now()),
  // null = jamais réglé, true = activé, false = désactivé
  etatActif: (chat) => {
    const r = q.actifLire.get(chat);
    return r ? r.actif === 1 : null;
  },
  definirActif: (chat, actif) => q.actifEcrire.run(chat, actif ? 1 : 0, Date.now()),
  lire: (cle) => q.kvLire.get(cle)?.valeur ?? null,
  ecrire: (cle, valeur) => q.kvEcrire.run(cle, String(valeur)),
};
