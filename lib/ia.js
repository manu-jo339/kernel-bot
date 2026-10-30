// MWENOBANGUE Labs — moteur d'IA avec relais automatique entre plusieurs services gratuits
// Ordre par défaut : Mistral → Gemini → Groq (modifiable avec IA_ORDRE dans .env).
// Quand un service est à court de limite ou en panne, le suivant prend le relais.
require('../config'); // charge le fichier .env

const FOURNISSEURS = {
  mistral: {
    nom: 'Mistral',
    base: () => process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
    cle: () => process.env.MISTRAL_API_KEY,
    modele: () => process.env.MISTRAL_MODEL || 'mistral-small-latest',
    preferes: [/mistral-small/i, /mistral-medium/i, /ministral/i, /mistral/i],
  },
  gemini: {
    nom: 'Gemini',
    base: () => process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    cle: () => process.env.GEMINI_API_KEY,
    modele: () => process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    preferes: [/gemini-2\.5-flash$/i, /gemini-.*flash/i, /gemini/i],
  },
  groq: {
    nom: 'Groq',
    base: () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    cle: () => process.env.GROQ_API_KEY,
    modele: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    preferes: [/llama-3\.3-70b/i, /gpt-oss-120b/i, /llama/i],
  },
};

// Clés d'IA de l'utilisateur de la session en cours, saisies sur Kernel Connect (Paramètres > Mon IA)
const cleDeSession = (k) => require('./contexte').courant()?.CLES_IA?.[k] || null;

const ordre = () =>
  (process.env.IA_ORDRE || 'mistral,gemini,groq')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => FOURNISSEURS[x]);

// État de chaque service : pause en cours, nombre d'échecs de suite, clé refusée, modèle trouvé automatiquement
const etat = {};
for (const k of Object.keys(FOURNISSEURS)) etat[k] = { jusque: 0, echecs: 0, refuse: false, modeleAuto: null, derniereErreur: '' };

const PAUSES = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3]; // 1 min, 5 min, 30 min, 2 h

class ErreurService extends Error {
  constructor(message, statut, retryApres) {
    super(message);
    this.statut = statut;
    this.retryApres = retryApres;
  }
}

async function requete(f, chemin, options = {}) {
  const url = f.base().replace(/\/+$/, '') + chemin;
  const rep = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${f.cle()}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(Number(process.env.IA_DELAI_MS) || 30000),
  });
  if (!rep.ok) {
    let detail = '';
    try {
      detail = (await rep.text()).slice(0, 300);
    } catch {}
    const ra = Number(rep.headers.get('retry-after'));
    throw new ErreurService(`HTTP ${rep.status} ${detail}`, rep.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0);
  }
  return rep.json();
}

// Si le nom du modèle n'existe plus, on demande la liste au service et on choisit le meilleur
async function trouverModele(f, k) {
  const data = await requete(f, '/models');
  const ids = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
  for (const motif of f.preferes) {
    const trouve = ids.find((id) => motif.test(id) && !/embed|moderation|whisper|guard|ocr|vision|tts/i.test(id));
    if (trouve) {
      etat[k].modeleAuto = trouve;
      console.log(`[ia] ${f.nom} : modèle « ${trouve} » choisi automatiquement.`);
      return trouve;
    }
  }
  throw new ErreurService('aucun modèle de discussion trouvé', 404, 0);
}

function extraireTexte(data) {
  const c = data?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) return c.map((p) => p.text || '').join('').trim();
  return '';
}

async function appeler(f, k, messages, forcer = null) {
  const corps = (modele) =>
    JSON.stringify({
      model: modele,
      messages,
      temperature: Number(process.env.IA_TEMPERATURE) || 0.7,
      max_tokens: Number(process.env.IA_MAX_TOKENS) || 700,
    });
  let modele = forcer || etat[k].modeleAuto || f.modele();
  try {
    return extraireTexte(await requete(f, '/chat/completions', { method: 'POST', body: corps(modele) }));
  } catch (e) {
    const modeleInconnu = e.statut === 404 || (e.statut === 400 && /model/i.test(e.message));
    if (!modeleInconnu || forcer) throw e;
    modele = await trouverModele(f, k);
    return extraireTexte(await requete(f, '/chat/completions', { method: 'POST', body: corps(modele) }));
  }
}

function signalerEchec(k, e) {
  const s = etat[k];
  s.derniereErreur = String(e.message || e).slice(0, 200);
  if (e.statut === 401 || e.statut === 403 || (e.statut === 400 && /api key/i.test(e.message))) { // (Gemini répond 400 « API key not valid »)
    s.refuse = true;
    console.error(`[ia] ${FOURNISSEURS[k].nom} : clé refusée (${e.statut}). Vérifie ${k.toUpperCase()}_API_KEY dans .env. Service désactivé jusqu'au redémarrage.`);
    return;
  }
  s.echecs += 1;
  const pause = Math.max(e.retryApres || 0, PAUSES[Math.min(s.echecs - 1, PAUSES.length - 1)]);
  s.jusque = Date.now() + pause;
  console.warn(`[ia] ${FOURNISSEURS[k].nom} indisponible (${s.derniereErreur}). Pause ${Math.round(pause / 1000)} s, relais au service suivant.`);
}

// Envoie la conversation au premier service disponible. Lève 'INDISPONIBLE' si tous sont épuisés.
async function repondre(messages, opts = {}) {
  // Clés personnelles de l'utilisateur (commande « macle ») : essayées en premier, sans toucher à l'état des services du bot
  const liste = opts.ordre ? opts.ordre.filter((x) => FOURNISSEURS[x]) : ordre();
  for (const [k, cle] of Object.entries(opts.cles || {})) {
    if (!FOURNISSEURS[k] || !liste.includes(k)) continue;
    const f = { ...FOURNISSEURS[k], cle: () => cle };
    try {
      const texte = await appeler(f, k, messages, opts.modeles?.[k]);
      if (texte) return { texte, fournisseur: f.nom + ' (ta clé)', perso: true };
    } catch (e) {
      console.warn(`[ia] clé personnelle ${f.nom} en échec (${String(e.message).slice(0, 80)}), retour aux services du bot.`);
    }
  }
  // Clés du propriétaire enregistrées sur Kernel Connect : avant celles de l'hébergeur (variables d'environnement)
  for (const k of liste) {
    const cle = cleDeSession(k);
    if (!cle || (opts.cles && opts.cles[k] === cle)) continue;
    const f = { ...FOURNISSEURS[k], cle: () => cle };
    try {
      const texte = await appeler(f, k, messages, opts.modeles?.[k]);
      if (texte) return { texte, fournisseur: f.nom };
    } catch (e) {
      console.warn(`[ia] clé Kernel Connect ${f.nom} en échec (${String(e.message).slice(0, 80)}), service suivant.`);
    }
  }
  let essais = 0;
  for (const k of liste) {
    const f = FOURNISSEURS[k];
    const s = etat[k];
    if (!f.cle() || s.refuse || s.jusque > Date.now()) continue;
    essais += 1;
    try {
      const texte = await appeler(f, k, messages, opts.modeles?.[k]);
      if (!texte) throw new ErreurService('réponse vide', 502, 0);
      s.echecs = 0;
      return { texte, fournisseur: f.nom };
    } catch (e) {
      signalerEchec(k, e);
    }
  }
  const err = new Error('INDISPONIBLE');
  err.essais = essais;
  throw err;
}

// Aperçu pour la commande propriétaire « .chatbot services »
function apercu() {
  return ordre().map((k) => {
    const f = FOURNISSEURS[k];
    const s = etat[k];
    let statut = 'prêt';
    if (cleDeSession(k)) statut = 'prêt';
    else if (!f.cle()) statut = 'clé manquante';
    else if (s.refuse) statut = 'clé refusée';
    else if (s.jusque > Date.now()) statut = `en pause (${Math.ceil((s.jusque - Date.now()) / 1000)} s)`;
    return { cle: k, nom: f.nom, modele: s.modeleAuto || f.modele(), statut, erreur: s.derniereErreur };
  });
}

// Teste une clé fournie par un utilisateur : renvoie null si elle fonctionne, sinon un texte d'explication
async function verifierCle(k, cle) {
  const f = { ...FOURNISSEURS[k], cle: () => cle };
  try {
    await requete(f, '/models');
    return null;
  } catch (e) {
    if (e.statut === 401 || e.statut === 403 || (k === 'gemini' && e.statut === 400)) return 'clé refusée par le service';
    if (e.statut) return `le service répond une erreur (${e.statut})`;
    return 'service injoignable pour le moment';
  }
}

// Décrit une image avec un modèle « vision » (Mistral, sinon Groq)
async function vision(buffer, mime, question, opts = {}) {
  const url = `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  const messages = [{ role: 'user', content: [{ type: 'text', text: question }, { type: 'image_url', image_url: url }] }];
  return repondre(messages, {
    ...opts,
    ordre: ['mistral', 'gemini', 'groq'],
    modeles: { mistral: process.env.MISTRAL_VISION_MODEL || 'mistral-small-latest', gemini: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash', groq: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct' },
  });
}

// Transcrit un enregistrement avec Whisper (Groq). audio : Buffer (mp3/ogg/wav…), renvoie le texte
async function transcrire(audio, nomFichier, opts = {}) {
  const cle = (opts.cles && opts.cles.groq) || cleDeSession('groq') || FOURNISSEURS.groq.cle();
  if (!cle) {
    const e = new Error('INDISPONIBLE');
    e.essais = 0;
    throw e;
  }
  const f = { ...FOURNISSEURS.groq, cle: () => cle };
  const form = new FormData();
  form.append('file', new Blob([audio]), nomFichier || 'audio.mp3');
  form.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  if (opts.langue) form.append('language', opts.langue);
  const url = f.base().replace(/\/+$/, '') + '/audio/transcriptions';
  const rep = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${cle}` }, body: form, signal: AbortSignal.timeout(90000) });
  if (!rep.ok) {
    const detail = (await rep.text().catch(() => '')).slice(0, 200);
    throw new ErreurService(`HTTP ${rep.status} ${detail}`, rep.status, 0);
  }
  const j = await rep.json();
  return String(j.text || '').trim();
}

module.exports = { vision, transcrire, repondre, apercu, etat, FOURNISSEURS, verifierCle, cleDeSession };
