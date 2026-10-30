// Kernel Bot — mode « site » : le moteur d'un utilisateur (son propre Render) ne parle qu'à Kernel Connect.
// Il n'a AUCUNE clé de base de données : la session WhatsApp, l'état des instances, les événements et les QR passent par le site,
// par appels signés (même signature HMAC que site → moteur), et le site n'accepte que ce qui concerne les instances de CE moteur.
// Variables : SITE_URL (https://… du site), ENGINE_SECRET (le même que celui enregistré sur le site).
// L'identité du moteur est son adresse publique : RENDER_EXTERNAL_URL est fournie par Render (ou ENGINE_PUBLIC_URL ailleurs).
const crypto = require('crypto');
const { construireEtat } = require('./auth_supabase');

const siteUrl = () => String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
const hote = () => {
  const brut = String(process.env.ENGINE_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();
  if (!brut) return '';
  try { return new URL(/^https?:\/\//i.test(brut) ? brut : 'https://' + brut).hostname.toLowerCase(); } catch { return ''; }
};

// Le mode site est demandé dès que SITE_URL est défini (jamais de repli silencieux vers le disque : la session serait perdue au redémarrage)
const actif = () => !!siteUrl();

// Ce qui manque pour que le mode site fonctionne (liste vide = tout est bon)
function problemes() {
  const p = [];
  if (!/^(https:\/\/[^\s/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)/.test(siteUrl())) p.push('SITE_URL doit être l’adresse https:// de Kernel Connect');
  if (String(process.env.ENGINE_SECRET || '').length < 16) p.push('ENGINE_SECRET (16 caractères minimum, identique à celui enregistré sur le site) est manquant');
  if (!hote()) p.push('l’adresse publique du moteur est inconnue (RENDER_EXTERNAL_URL, ou ENGINE_PUBLIC_URL si tu n’es pas sur Render)');
  return p;
}

const signer = (secret, ts, methode, chemin, corps) => crypto.createHmac('sha256', secret).update(`${ts}.${methode.toUpperCase()}.${chemin}.${corps}`).digest('hex');

class ErreurSite extends Error {
  constructor(statut, message) { super(message); this.statut = statut; }
}

async function appeler(op, corps = {}) {
  const p = problemes();
  if (p.length) throw new ErreurSite(0, 'Mode site mal configuré : ' + p.join(' ; '));
  const chemin = `/api/hub/${op}`;
  const texte = JSON.stringify(corps);
  const ts = String(Date.now());
  const r = await fetch(siteUrl() + chemin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KC-Engine': hote(), 'X-KC-Timestamp': ts, 'X-KC-Signature': signer(process.env.ENGINE_SECRET, ts, 'POST', chemin, texte) },
    body: texte,
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  });
  if (!r.ok) {
    if (r.status === 403) throw new ErreurSite(403, 'Le site refuse ce moteur (403) : vérifie qu’il est enregistré sur la page « Mon moteur » avec le même ENGINE_SECRET et la même adresse.');
    throw new ErreurSite(r.status, `site HTTP ${r.status}`);
  }
  return r.json();
}

// Réessaie les erreurs réseau et 5xx ; jamais les refus (4xx)
async function avecReprise(fn, nom) {
  let derniere;
  for (let i = 1; i <= 3; i++) {
    try {
      return await fn();
    } catch (e) {
      derniere = e;
      if (e.statut >= 400 && e.statut < 500) break;
      await new Promise((ok) => setTimeout(ok, 500 * i));
    }
  }
  console.error(`[site] ${nom} impossible : ${derniere.message}`);
  throw derniere;
}
const hub = (op, corps, nom) => avecReprise(() => appeler(op, corps), nom || op);

const LOT = 100;
async function lire(session, cles) {
  const sortie = new Map();
  for (let i = 0; i < cles.length; i += LOT) {
    const r = await hub('auth-read', { session, cles: cles.slice(i, i + LOT) }, 'lecture de la session');
    for (const [c, v] of Object.entries(r.valeurs || {})) sortie.set(c, v);
  }
  return sortie;
}
async function ecrire(session, lignes) {
  for (let i = 0; i < lignes.length; i += LOT) await hub('auth-write', { session, lignes: lignes.slice(i, i + LOT) }, 'écriture de la session');
}
async function effacer(session, cles) {
  for (let i = 0; i < cles.length; i += LOT) await hub('auth-delete', { session, cles: cles.slice(i, i + LOT) }, 'suppression de clés');
}

const useSupabaseAuthState = (session) => construireEtat(session, { lire, ecrire, effacer }); // même nom que l'autre stockage : le reste du bot ne voit pas la différence
const supprimerSession = (session) => hub('auth-drop', { session }, 'suppression de la session');
const sessionsEnregistrees = async () => (await hub('sessions', {}, 'liste des sessions')).ids || [];
const nomUtilisateur = async (id) => (await hub('profile', { id }, 'nom de l’utilisateur')).nom || '';

// État des instances : jamais bloquant pour la session WhatsApp (une panne du site ne coupe pas WhatsApp)
const envoyer = async (op, corps, nom) => {
  try {
    await appeler(op, corps);
    return true;
  } catch (e) {
    console.error(`[moteur] ${nom} impossible : ${e.message}`);
    return false;
  }
};
const base = {
  majInstance: (id, champs) => envoyer('instance-update', { id, champs }, 'mise à jour de l’instance'),
  evenement: (id, type, severite, message) => envoyer('event', { id, type, severite, message: String(message || '').slice(0, 300) }, 'événement'),
  qr: (id, payload, secondes) => envoyer('qr', { id, payload, secondes }, 'QR code'),
  viderAppairages: (id) => envoyer('clear-pairing', { id }, 'nettoyage des codes'),
};

module.exports = { actif, problemes, hote, signer, base, useSupabaseAuthState, supprimerSession, sessionsEnregistrees, nomUtilisateur, ErreurSite };
