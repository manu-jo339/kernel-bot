// Kernel Bot — planificateur de tâches (rappels, annonces, messages différés, surveillance…)
// Les tâches sont enregistrées en base : elles survivent à un redémarrage du bot.
const { db } = require('./db');

const q = {
  ajouter: db.prepare('INSERT INTO jobs (quand, type, data, repete, cle) VALUES (?, ?, ?, ?, ?)'),
  dues: db.prepare('SELECT id, quand, type, data, repete, cle FROM jobs WHERE quand <= ? ORDER BY quand LIMIT 50'),
  suppr: db.prepare('DELETE FROM jobs WHERE id = ?'),
  supprCle: db.prepare('DELETE FROM jobs WHERE cle = ?'),
  replanifier: db.prepare('UPDATE jobs SET quand = ? WHERE id = ?'),
  parType: db.prepare('SELECT id, quand, type, data, repete, cle FROM jobs WHERE type = ? ORDER BY quand'),
  parCle: db.prepare('SELECT id, quand, type, data, repete, cle FROM jobs WHERE cle = ? ORDER BY quand'),
  parPrefixe: db.prepare("SELECT id, quand, type, data, repete, cle FROM jobs WHERE cle LIKE ? ESCAPE '\\' ORDER BY quand"),
};

const gestionnaires = new Map();
let minuteur = null;
let cibleSock = () => null;

const lire = (r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null });

function ajouter({ quand, type, data = null, repete = 0, cle = null }) {
  const r = q.ajouter.run(Math.floor(quand), type, data == null ? null : JSON.stringify(data), Math.floor(repete), cle);
  return Number(r.lastInsertRowid);
}
const supprimer = (id) => Number(q.suppr.run(id).changes);
const supprimerCle = (cle) => Number(q.supprCle.run(cle).changes);
const parType = (type) => q.parType.all(type).map(lire);
const parCle = (cle) => q.parCle.all(cle).map(lire);
const parPrefixe = (p) => q.parPrefixe.all(String(p).replace(/[\\%_]/g, '\\$&') + '%').map(lire);

// Déclare ce qui doit se passer quand une tâche de ce type arrive à échéance : fn({ data, sock, job })
const surTache = (type, fn) => gestionnaires.set(type, fn);

async function tic() {
  const sock = cibleSock();
  if (!sock) return; // pas de connexion : on réessaiera au prochain tour
  const maintenant = Date.now();
  for (const r of q.dues.all(maintenant)) {
    const job = lire(r);
    const fn = gestionnaires.get(job.type);
    // Replanifie AVANT d'exécuter : un plantage ne fait pas répéter la tâche en boucle
    if (job.repete > 0) {
      let prochaine = job.quand + job.repete;
      while (prochaine <= maintenant) prochaine += job.repete;
      q.replanifier.run(prochaine, job.id);
    } else {
      q.suppr.run(job.id);
    }
    if (!fn) continue;
    try {
      await fn({ data: job.data, sock, job });
    } catch (e) {
      console.error(`[tâche:${job.type}]`, e.message);
    }
  }
}

// cible : fonction qui renvoie la connexion WhatsApp principale (ou null si hors ligne)
function demarrer(cible) {
  cibleSock = cible;
  if (minuteur) clearInterval(minuteur);
  minuteur = setInterval(() => tic().catch((e) => console.error('[tâches]', e.message)), 10000);
  minuteur.unref();
}

module.exports = { ajouter, supprimer, supprimerCle, parType, parCle, parPrefixe, surTache, demarrer, tic };
