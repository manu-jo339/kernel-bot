// Kernel Bot — données du bot qui survivent aux redéploiements (réglages comme le MODE privé, bannis, premium, notes, stock, rappels…).
// Sur Render (offre gratuite), le disque est effacé à chaque redémarrage : sans ceci, « .regler MODE private » redevenait « public » après chaque redéploiement
// et tout ce que le bot avait enregistré disparaissait. Un instantané est donc gardé dans la session du numéro (même stockage que la connexion, privé),
// seulement quand le bot tourne avec un stockage distant (Supabase ou Kernel Connect). Jamais de clé secrète, jamais l'historique des conversations de l'IA.
const crypto = require('crypto');
const config = require('../config');
const ajustements = require('./ajustements');
const { db } = require('./db');

const CLE = ['kernel-donnees', 'instantane'];
const MAX_CARACTERES = 330000; // la limite d'une valeur chez le site est de 400 000 caractères
const EXCLUS = ['anciens']; // identifiants de messages vus : gérés ailleurs (conserve.js), changent à chaque message

let dernierImporte = 0;

function exporter() {
  const docs = db.prepare(`SELECT ns, id, data, ts FROM docs WHERE ns NOT IN (${EXCLUS.map(() => '?').join(',')}) ORDER BY ts DESC`).all(...EXCLUS);
  const jobs = db.prepare('SELECT quand, type, data, repete, cle FROM jobs ORDER BY quand').all();
  const kv = db.prepare('SELECT cle, valeur FROM kv').all();
  const instantane = { v: 1, reglages: ajustements.exporter(), docs: [], jobs, kv };
  let taille = JSON.stringify(instantane).length;
  for (const d of docs) {
    const t = d.ns.length + d.id.length + d.data.length + 40;
    if (taille + t > MAX_CARACTERES) continue; // les plus récents d'abord : on laisse tomber les plus anciens si c'est trop gros
    instantane.docs.push({ ns: d.ns, id: d.id, data: d.data, ts: d.ts });
    taille += t;
  }
  return instantane;
}

function importer(o) {
  if (!o || o.v !== 1) return { docs: 0, reglages: 0 };
  let docs = 0;
  const ecrire = db.prepare('INSERT INTO docs (ns, id, data, ts) VALUES (?, ?, ?, ?) ON CONFLICT(ns, id) DO UPDATE SET data = excluded.data, ts = excluded.ts WHERE excluded.ts > docs.ts');
  for (const d of Array.isArray(o.docs) ? o.docs : []) {
    if (!d || typeof d.ns !== 'string' || typeof d.id !== 'string' || typeof d.data !== 'string' || EXCLUS.includes(d.ns)) continue;
    docs += Number(ecrire.run(d.ns, d.id, d.data, Number(d.ts) || 0).changes);
  }
  const dejaJob = db.prepare('SELECT 1 FROM jobs WHERE quand = ? AND type = ? AND IFNULL(cle, \'\') = ? AND IFNULL(data, \'\') = ?');
  const ajouterJob = db.prepare('INSERT INTO jobs (quand, type, data, repete, cle) VALUES (?, ?, ?, ?, ?)');
  for (const j of Array.isArray(o.jobs) ? o.jobs : []) {
    if (!j || !Number.isFinite(j.quand) || typeof j.type !== 'string') continue;
    if (!dejaJob.get(j.quand, j.type, j.cle || '', j.data || '')) ajouterJob.run(j.quand, j.type, j.data ?? null, Number(j.repete) || 0, j.cle ?? null);
  }
  const ajouterKv = db.prepare('INSERT OR IGNORE INTO kv (cle, valeur) VALUES (?, ?)');
  for (const k of Array.isArray(o.kv) ? o.kv : []) if (k && typeof k.cle === 'string') ajouterKv.run(k.cle, k.valeur ?? null);
  const reglages = ajustements.importer(config, o.reglages);
  return { docs, reglages };
}

const empreinte = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex');

// keys : le stockage de la session (même interface que celle de Baileys)
function creer(keys, periode = 60000) {
  let derniere = null;
  let minuteur = null;

  const charger = async () => {
    try {
      const o = (await keys.get(CLE[0], [CLE[1]]))?.[CLE[1]];
      if (!o || o.v !== 1) return null;
      if ((o.ts || 0) <= dernierImporte) return null; // déjà restauré par une autre session de ce moteur
      dernierImporte = o.ts || Date.now();
      const r = importer(o);
      derniere = empreinte({ ...exporter(), ts: 0 });
      return r;
    } catch (e) {
      console.error('[persistance] restauration impossible :', e.message);
      return null;
    }
  };

  const sauver = async () => {
    try {
      const instantane = exporter();
      const e = empreinte(instantane);
      if (e === derniere) return false;
      instantane.ts = Date.now();
      dernierImporte = Math.max(dernierImporte, instantane.ts);
      await keys.set({ [CLE[0]]: { [CLE[1]]: instantane } });
      derniere = e;
      return true;
    } catch (e) {
      console.error('[persistance] enregistrement impossible :', e.message);
      return false;
    }
  };

  const demarrer = (actif = () => true) => {
    minuteur = setInterval(() => {
      if (!actif()) return clearInterval(minuteur);
      sauver();
    }, periode);
    minuteur.unref?.();
  };

  return { charger, sauver, demarrer, arreter: () => clearInterval(minuteur) };
}

module.exports = { creer, exporter, importer, reinitialiser: () => { dernierImporte = 0; } };
