// Kernel Bot — diagnostic : vérifie l'environnement et fait passer les commandes à vide, sans rien envoyer sur WhatsApp
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Commandes qu'on n'essaie jamais d'exécuter (elles agissent sur le bot ou sur des groupes)
const INTERDITES = /^(redemarrer|restart|maj|mettreajour|quitter|leave|eteindre|arreter|stop|deconnecter|deconnexion|logout|diffusion|broadcast|diagnostic|sauvegarde|regler|supprimerreglage|nettoyer|vider|reset)$/;

const CLES = [
  ['GROQ_API_KEY', 'IA (gpt, gemini…), transcrire, decrire'],
  ['MISTRAL_API_KEY', 'IA (gpt, gemini…)'],
  ['TENOR_API_KEY', 'réactions animées'],
  ['AUDD_API_TOKEN', 'identifier (reconnaissance de musique)'],
  ['TELEGRAM_BOT_TOKEN', 'stickertelegram'],
];

const avecDelai = (promesse, ms, nom) => Promise.race([promesse, new Promise((_, rej) => setTimeout(() => rej(new Error(`délai dépassé (${Math.round(ms / 1000)} s)`)), ms))]);
const court = (e) => String(e?.message || e).split('\n')[0].slice(0, 160);

function lancer(fichier, args, ms = 10000) {
  return new Promise((resolve, reject) => execFile(fichier, args, { timeout: ms, windowsHide: true }, (err, out) => (err ? reject(err) : resolve(String(out)))));
}

// ───────────── Environnement ─────────────
async function environnement({ reseau = true } = {}) {
  const lignes = [];
  const ok = (t) => lignes.push('✅ ' + t);
  const ko = (t) => lignes.push('❌ ' + t);
  const info = (t) => lignes.push('ℹ️ ' + t);

  try { const v = (await lancer(require('./media').ffmpegPath(), ['-version'])).split('\n')[0]; ok(v.slice(0, 60)); }
  catch { ko('ffmpeg introuvable → stickers, audio, vidéo et effets ne marcheront pas'); }

  const yt = await require('./ytdlp').version();
  yt ? ok('yt-dlp ' + yt) : ko('yt-dlp absent → téléchargements de musique et de vidéo indisponibles (sur Render : il faut l’ajouter au Dockerfile, ou le bot propose de l’installer)');

  try {
    const dossier = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    fs.mkdirSync(dossier, { recursive: true });
    const f = path.join(dossier, '.diag-' + process.pid);
    fs.writeFileSync(f, 'x'); fs.unlinkSync(f);
    ok('dossier de données accessible en écriture');
  } catch (e) { ko('dossier de données non inscriptible : ' + court(e)); }

  const stock = require('./stockage');
  if (stock.mode === 'site') {
    try { const s = await avecDelai(require('./auth_site').sessionsEnregistrees(), 15000); ok(`Kernel Connect joignable (${s.length} session(s) sur ce moteur)`); }
    catch (e) { ko('Kernel Connect : ' + court(e)); }
  } else info('mode de stockage : ' + stock.mode);

  if (reseau) {
    for (const [nom, url] of [['internet (GitHub)', 'https://api.github.com'], ['internet (Wikipédia)', 'https://fr.wikipedia.org/api/rest_v1/']]) {
      try { const r = await avecDelai(fetch(url, { headers: { 'User-Agent': 'kernel-bot' } }), 8000); r.ok || r.status < 500 ? ok(`${nom} joignable`) : ko(`${nom} : HTTP ${r.status}`); }
      catch (e) { ko(`${nom} : ${court(e)}`); }
    }
  }

  const manque = CLES.filter(([k]) => !process.env[k]).map(([k, u]) => `${k} (${u})`);
  if (manque.length) info('clés non renseignées, fonctions limitées : ' + manque.join(' ; '));
  info(`mémoire : ${Math.round(process.memoryUsage().rss / 1048576)} Mo utilisés · Node ${process.version} · ${os.platform()}`);
  return lignes;
}

// ───────────── Structure des commandes ─────────────
function structure(liste) {
  const problemes = [];
  const vus = new Map();
  for (const c of liste) {
    if (!c.name || typeof c.run !== 'function') { problemes.push(`commande sans nom ou sans fonction : ${c.name || '?'}`); continue; }
    if (!c.desc) problemes.push(`${c.name} : pas de description`);
    for (const n of [c.name, ...(c.aliases || [])]) {
      if (vus.has(n) && vus.get(n) !== c) problemes.push(`« ${n} » est utilisé par ${vus.get(n).name} et ${c.name}`);
      vus.set(n, c);
    }
  }
  return problemes;
}

// ───────────── Essai à vide ─────────────
let compteur = 0;
function fauxContexte(cmd, args, config, liste) {
  // Une fausse personne différente à chaque essai : certaines commandes font patienter la même personne quelques secondes
  const num = String(900000000000 + ++compteur);
  const jid = `${num}@s.whatsapp.net`;
  const envoyes = [];
  const base = { user: { id: '0000000000:1@s.whatsapp.net' }, utilisateur: 'Test', secondaire: true,
    sendMessage: async (j, c) => { envoyes.push(c); return { key: { id: 'T' + envoyes.length, remoteJid: j } }; } };
  const sock = new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || k === 'then' ? undefined : async () => ({})) });
  const texte = `${config.PREFIXE}${cmd.name}${args.length ? ' ' + args.join(' ') : ''}`;
  const msg = { key: { remoteJid: jid, id: 'DIAG' + Date.now(), fromMe: false }, message: { conversation: texte }, pushName: 'Test', messageTimestamp: Math.floor(Date.now() / 1000) };
  const reply = async (t) => { envoyes.push(typeof t === 'string' ? { text: t } : t); return { key: { id: 'R' + envoyes.length } }; };
  const ctx = { sock, msg, jid, args, texte, sender: jid, senderNum: num, isGroup: false, isOwner: false, isAdmin: false, botAdmin: false, isPremium: false, metadata: null, reply, config, liste, candidats: [jid], nomUtilise: cmd.name };
  return { ctx, envoyes };
}

const essayable = (c) => !(c.ownerOnly || c.adminOnly || c.groupOnly || c.botAdmin || INTERDITES.test(c.name) || (c.aliases || []).some((a) => INTERDITES.test(a)));

async function essayer(cmd, { args = [], config, liste, delai = 20000 } = {}) {
  const { ctx, envoyes } = fauxContexte(cmd, args, config, liste);
  try {
    await avecDelai(cmd.run(ctx), delai);
    return { nom: cmd.name, etat: envoyes.length ? 'ok' : 'silence', envoyes };
  } catch (e) { return { nom: cmd.name, etat: 'erreur', detail: court(e), envoyes }; }
}

async function essayerTout(liste, { config, delai, duree = 240000 } = {}) {
  const debut = Date.now();
  const res = { ok: [], silence: [], erreur: [], ignorees: [], tropLong: false };
  for (const c of liste) {
    if (!essayable(c)) { res.ignorees.push(c.name); continue; }
    if (Date.now() - debut > duree) { res.tropLong = true; res.ignorees.push(c.name); continue; }
    const r = await essayer(c, { config, liste, delai });
    res[r.etat].push(r);
  }
  return res;
}

function rapportEssai(res) {
  const n = res.ok.length + res.silence.length + res.erreur.length;
  const l = [`🧪 *Essai à vide* : ${n} commandes essayées · ✅ ${res.ok.length} · ⚠️ ${res.silence.length} sans réponse · ❌ ${res.erreur.length} en erreur · ${res.ignorees.length} non essayées (propriétaire, admin, groupe ou dangereuses)`];
  if (res.tropLong) l.push('⏱️ Temps maximum atteint : une partie des commandes n’a pas été essayée. Relance la commande.');
  if (res.erreur.length) { l.push('', '❌ *En erreur* :'); for (const r of res.erreur) l.push(`• ${r.nom} : ${r.detail}`); }
  if (res.silence.length) { l.push('', '⚠️ *Sans réponse* (souvent normal : elles attendent un média ou un événement) :', res.silence.map((r) => r.nom).join(', ')); }
  return l.join('\n');
}

module.exports = { environnement, structure, essayer, essayerTout, rapportEssai, essayable, INTERDITES };
