// Kernel Bot — session WhatsApp stockée dans Supabase (base PostgreSQL gratuite), pour les hébergements dont le disque est effacé
// à chaque redémarrage (Render gratuit, etc.). Mêmes données que le dossier « auth », mais dans la table kernel_auth.
// Variables : SUPABASE_URL et SUPABASE_SERVICE_KEY (clé « service_role », secrète : uniquement dans l'hébergeur ou le .env, jamais dans le code).
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

const actif = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const TABLE = 'kernel_auth';

function api(chemin, opts = {}) {
  const base = String(process.env.SUPABASE_URL).replace(/\/+$/, '');
  const cle = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${base}/rest/v1/${chemin}`, {
    ...opts,
    // Les nouvelles clés « sb_secret_… » ne sont pas des JWT : elles vont seulement dans « apikey » ; l'ancienne clé service_role (JWT) va aussi dans Authorization
    headers: { apikey: cle, ...(cle.startsWith('sb_') ? {} : { Authorization: `Bearer ${cle}` }), 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
}

async function avecReprise(fn, nom) {
  let derniere;
  for (let i = 1; i <= 3; i++) {
    try {
      return await fn();
    } catch (e) {
      derniere = e;
      await new Promise((ok) => setTimeout(ok, 500 * i));
    }
  }
  console.error(`[supabase] ${nom} impossible : ${derniere.message}`);
  throw derniere;
}

const verifier = async (r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r;
};

const q = (s) => encodeURIComponent(String(s));

async function lire(session, cles) {
  const sortie = new Map();
  for (let i = 0; i < cles.length; i += 80) {
    const lot = cles.slice(i, i + 80);
    const liste = lot.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(',');
    const r = await avecReprise(async () => verifier(await api(`${TABLE}?session=eq.${q(session)}&cle=in.(${q(liste)})&select=cle,valeur`)), 'lecture');
    for (const ligne of await r.json()) sortie.set(ligne.cle, ligne.valeur);
  }
  return sortie;
}

async function ecrire(session, lignes) {
  if (!lignes.length) return;
  for (let i = 0; i < lignes.length; i += 200) {
    const corps = JSON.stringify(lignes.slice(i, i + 200).map((l) => ({ session, cle: l.cle, valeur: l.valeur, maj: new Date().toISOString() })));
    await avecReprise(async () => verifier(await api(`${TABLE}?on_conflict=session,cle`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: corps })), 'écriture');
  }
}

async function effacer(session, cles) {
  for (let i = 0; i < cles.length; i += 80) {
    const lot = cles.slice(i, i + 80);
    const liste = lot.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(',');
    await avecReprise(async () => verifier(await api(`${TABLE}?session=eq.${q(session)}&cle=in.(${q(liste)})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })), 'suppression');
  }
}

// Supprime toute la session (déconnexion définitive)
async function supprimerSession(session) {
  await avecReprise(async () => verifier(await api(`${TABLE}?session=eq.${q(session)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })), 'suppression de la session');
}

// Construit l'état d'authentification de Baileys au-dessus de trois opérations de stockage (lire / écrire / effacer)
async function construireEtat(session, { lire, ecrire, effacer }) {
  const brut = await lire(session, ['creds']);
  const creds = brut.has('creds') ? JSON.parse(brut.get('creds'), BufferJSON.reviver) : initAuthCreds();
  let file = Promise.resolve(); // les écritures partent dans l'ordre, une à la fois
  const enfiler = (fn) => (file = file.then(fn, fn));

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          const lus = await lire(session, ids.map((id) => `${type}-${id}`));
          for (const id of ids) {
            let v = lus.has(`${type}-${id}`) ? JSON.parse(lus.get(`${type}-${id}`), BufferJSON.reviver) : null;
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            data[id] = v;
          }
          return data;
        },
        set: (data) =>
          enfiler(async () => {
            const aEcrire = [], aEffacer = [];
            for (const cat in data)
              for (const id in data[cat]) {
                const v = data[cat][id];
                if (v) aEcrire.push({ cle: `${cat}-${id}`, valeur: JSON.stringify(v, BufferJSON.replacer) });
                else aEffacer.push(`${cat}-${id}`);
              }
            await ecrire(session, aEcrire);
            await effacer(session, aEffacer);
          }),
      },
    },
    saveCreds: () => enfiler(() => ecrire(session, [{ cle: 'creds', valeur: JSON.stringify(creds, BufferJSON.replacer) }])),
    // Attend que toutes les écritures en cours soient terminées : indispensable avant un arrêt, sinon les dernières clés de chiffrement
    // sont perdues et le téléphone affiche « En attente de ce message » au redémarrage suivant.
    vider: () => file.catch(() => {}),
  };
}

const useSupabaseAuthState = (session) => construireEtat(session, { lire, ecrire, effacer });

// Nom de l'utilisateur de la plateforme propriétaire d'une instance (affiché dans le menu)
async function nomUtilisateur(id) {
  const r = await api(`instances?id=eq.${q(id)}&select=profiles(display_name)`);
  if (!r.ok) return '';
  return String((await r.json())?.[0]?.profiles?.display_name || '');
}

// Clés d'IA enregistrées sur le site (table user_secrets, chiffrées). Lisibles seulement si ENGINES_KEY (la même que sur le site) est définie ici.
async function clesIA(utilisateur) {
  try {
    if (!utilisateur || !process.env.ENGINES_KEY || !/^[0-9a-f-]{36}$/i.test(String(utilisateur))) return {};
    const r = await api(`user_secrets?user_id=eq.${q(utilisateur)}&select=ai_keys_enc`);
    if (!r.ok) return {};
    return require('./clesite').lire((await r.json())?.[0]?.ai_keys_enc);
  } catch {
    return {};
  }
}

// Nom + réglages (préfixe, mode, stickers) de l'utilisateur d'une instance. Sans la migration 006 du site, seuls le nom et les valeurs par défaut sont rendus.
async function profilUtilisateur(id) {
  let proprietaire = null;
  const lire = async (colonnes) => {
    const r = await api(`instances?id=eq.${q(id)}&select=user_id,profiles(${colonnes})`);
    if (!r.ok) return undefined;
    const ligne = (await r.json())?.[0];
    proprietaire = ligne?.user_id || null;
    return ligne?.profiles || null;
  };
  const complet = await lire('display_name,bot_prefix,bot_mode,sticker_pack,sticker_author');
  if (complet) {
    return { nom: String(complet.display_name || ''), prefixe: complet.bot_prefix, mode: complet.bot_mode, sticker_pack: complet.sticker_pack, sticker_auteur: complet.sticker_author, ia: await clesIA(proprietaire) };
  }
  const simple = await lire('display_name');
  // Migration 006 pas encore appliquée : aucun réglage connu → le bot reste privé (jamais ouvert à tous par défaut)
  return { nom: String(simple?.display_name || '') };
}

// Identifiants des sessions déjà appairées (clés « creds » avec un compte rattaché) : permet de les relancer après un redémarrage
async function sessionsEnregistrees() {
  const r = await avecReprise(async () => verifier(await api(`${TABLE}?cle=eq.creds&select=session,valeur`)), 'liste des sessions');
  const ids = [];
  for (const l of await r.json()) {
    try {
      const c = JSON.parse(l.valeur, BufferJSON.reviver);
      if (c && (c.registered || c.me)) ids.push(l.session);
    } catch {}
  }
  return ids;
}

module.exports = { actif, api, construireEtat, nomUtilisateur, profilUtilisateur, useSupabaseAuthState, supprimerSession, sessionsEnregistrees };
