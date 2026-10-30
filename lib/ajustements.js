// Kernel Bot — réglages modifiables par message WhatsApp (liste blanche), enregistrés dans data/reglages.json.
// Ils passent AVANT le fichier .env. Les clés secrètes, les numéros de propriétaires et les chemins ne peuvent JAMAIS être modifiés (ni affichés) par message.
const fs = require('fs');
const path = require('path');

const dossier = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const fichier = path.join(dossier, 'reglages.json');

const net = (v, max) => {
  const t = String(v).replace(/[\r\n\t]+/g, ' ').trim();
  return t && t.length <= max ? t : null;
};

// cible : 'config' (propriété de l'objet config) ou 'env' (variable d'environnement lue en direct)
const REGLABLES = {
  PREFIXE: { cible: 'config', desc: 'Symbole qui commence une commande (1 à 3 caractères : . ! / ou même un emoji)', valider: (v) => (/^[^\s@\w\p{L}\p{N}]{1,3}$/u.test(v) ? v : null) },
  MODE: { cible: 'config', desc: 'public (tout le monde) ou private (propriétaire seulement)', valider: (v) => ({ public: 'public', publique: 'public', private: 'private', prive: 'private', privé: 'private' })[v.toLowerCase()] || null },
  NOM_OWNER: { cible: 'config', desc: 'Nom du propriétaire affiché dans le menu (30 caractères maximum)', valider: (v) => net(v, 30) },
  SIGNATURE: { cible: 'config', desc: 'Signature affichée (40 caractères maximum)', valider: (v) => net(v, 40) },
  STICKER_PACK: { cible: 'env', desc: 'Nom du pack inscrit dans les stickers', valider: (v) => net(v, 40) },
  STICKER_AUTEUR: { cible: 'env', desc: 'Auteur inscrit dans les stickers', valider: (v) => net(v, 40) },
  MAJ_DEPOT: { cible: 'env', desc: 'Dépôt GitHub où chercher les mises à jour (proprietaire/depot)', valider: (v) => (/^[\w.-]+\/[\w.-]+$/.test(v) ? v : null) },
  MAJ_URL: { cible: 'env', desc: 'Adresse https d’un fichier JSON {"version":"1.2.0","url":"…","notes":"…"}', valider: (v) => (/^https:\/\/[^\s]{4,300}$/.test(v) ? v : null) },
};

// Tout ce qui ressemble à un secret est refusé, quel que soit le nom
const SECRET = /(KEY|TOKEN|SECRET|PASS|SESSION|MACLE|OWNER|SUDO|CRED|AUTH|PRIVATE|COOKIE)/i;
const estSecret = (cle) => SECRET.test(String(cle));
// Une valeur qui ressemble à une clé d'API collée par erreur
const ressembleSecret = (v) => /^(sk-|gsk_|AIza|ghp_|github_pat_|xox[bp]-)/.test(v) || /^\d{7,12}:[\w-]{30,}$/.test(v) || /^[A-Za-z0-9_\-]{36,}$/.test(v);
// Clés secrètes connues : on indique seulement si elles sont définies, jamais leur valeur
const SECRETS_CONNUS = ['MISTRAL_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TENOR_API_KEY', 'AUDD_API_TOKEN', 'GITHUB_TOKEN', 'MACLE_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

const originaux = {};
let cible = null;

function lireFichier() {
  try {
    const j = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}
function ecrireFichier(o) {
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify(o, null, 2));
}

function appliquer(config, cle, valeur) {
  const r = REGLABLES[cle];
  if (!(cle in originaux)) originaux[cle] = r.cible === 'config' ? config[cle] : process.env[cle];
  if (r.cible === 'config') config[cle] = valeur;
  else process.env[cle] = valeur;
}

// Au démarrage (appelé par config.js) : applique les réglages enregistrés
function charger(config) {
  cible = config;
  const o = lireFichier();
  for (const [cle, v] of Object.entries(o)) {
    if (!REGLABLES[cle] || estSecret(cle)) continue;
    const ok = REGLABLES[cle].valider(String(v));
    if (ok) appliquer(config, cle, ok);
  }
}

function valeur(config, cle) {
  const r = REGLABLES[cle];
  return r.cible === 'config' ? config[cle] : process.env[cle];
}

// Renvoie { ok, valeur } ou { ok:false, raison }
function definir(config, cle, texte) {
  cle = String(cle || '').toUpperCase();
  if (estSecret(cle)) return { ok: false, raison: 'secret' };
  const r = REGLABLES[cle];
  if (!r) return { ok: false, raison: 'inconnu' };
  if (ressembleSecret(texte)) return { ok: false, raison: 'valeurSecrete' };
  const v = r.valider(String(texte).trim());
  if (v === null || v === undefined) return { ok: false, raison: 'invalide' };
  appliquer(config, cle, v);
  const o = lireFichier();
  o[cle] = v;
  ecrireFichier(o);
  return { ok: true, valeur: v };
}

function supprimer(config, cle) {
  cle = String(cle || '').toUpperCase();
  if (estSecret(cle)) return { ok: false, raison: 'secret' };
  const r = REGLABLES[cle];
  if (!r) return { ok: false, raison: 'inconnu' };
  const o = lireFichier();
  const avait = cle in o;
  delete o[cle];
  ecrireFichier(o);
  if (cle in originaux) {
    if (r.cible === 'config') config[cle] = originaux[cle];
    else if (originaux[cle] === undefined) delete process.env[cle];
    else process.env[cle] = originaux[cle];
    delete originaux[cle];
  }
  return { ok: true, avait, valeur: valeur(config, cle) };
}

// Instantané des réglages enregistrés (pour les hébergeurs au disque éphémère, voir lib/persistance.js)
const exporter = () => lireFichier();
// Restaure ceux qui manquent (un réglage déjà fait ici, depuis le démarrage, garde la priorité), puis les applique
function importer(config, o) {
  if (!o || typeof o !== 'object') return 0;
  const actuel = lireFichier();
  let n = 0;
  for (const [cle, v] of Object.entries(o)) {
    if (!REGLABLES[cle] || estSecret(cle) || cle in actuel) continue;
    if (REGLABLES[cle].valider(String(v)) === null) continue;
    actuel[cle] = v;
    n += 1;
  }
  if (n) ecrireFichier(actuel);
  charger(config);
  return n;
}

const modifies = () => Object.keys(lireFichier()).filter((k) => REGLABLES[k]);

module.exports = { REGLABLES, SECRETS_CONNUS, estSecret, ressembleSecret, charger, definir, supprimer, valeur, modifies, fichier, exporter, importer };
