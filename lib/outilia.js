// Kernel Bot — appels ponctuels à l'IA pour les commandes (résumer, corriger, rédiger, traduire…)
// Mêmes règles que le chatbot : avis d'information en privé à la première utilisation, limite par jour, relais entre services.
const db = require('./db');
const ia = require('./ia');
const bot = require('./chatbot');
const { numero } = require('./utils');

const PIED = '\n\n_🤖 Texte traité par un service d’IA externe._';

// Contrôles communs (IA active, avis d'information en privé, limite du jour). Renvoie { util, clesPerso } ou null (et répond déjà).
async function acces(ctx) {
  const { sock, jid, msg, sender, isGroup, isOwner } = ctx;
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  const util = numero(sender);
  if (!bot.globalActif()) return void (await reply('🔕 L’IA est désactivée par le propriétaire.'));
  const clesPerso = require('./macle').cles(util);
  const perso = Object.keys(clesPerso).length > 0;
  if (!perso && !bot.iaDisponible()) return void (await reply('⚙️ L’IA n’est pas configurée : ajoute une clé gratuite sur Kernel Connect (Paramètres > Mon IA).'));
  if (!db.aRecuInfo(util)) {
    db.marquerInfo(util);
    try {
      await bot.envoyerAvis(sock, isGroup ? sender : jid, isGroup ? null : msg, false);
      if (isGroup) await reply('📩 Je t’ai envoyé en privé un message d’information sur l’IA. Lis-le, puis relance ta commande.');
    } catch {
      await bot.envoyerAvis(sock, jid, msg, false);
    }
    return null;
  }
  const r = bot.reglages();
  if (!isOwner && !perso && db.usageAujourdhui(util) >= r.limiteJour) return void (await reply(bot.remplir(bot.textes().limiteAtteinte)));
  return { util, clesPerso, reply };
}

// Exécute un traitement d'IA avec indicateur « écrit… » ; fn({clesPerso}) renvoie le résultat ; compte l'usage ; gère l'indisponibilité
async function executer(ctx, a, fn) {
  const { sock, jid } = ctx;
  try {
    await sock.sendPresenceUpdate('composing', jid);
  } catch {}
  try {
    const r = await fn({ cles: a.clesPerso });
    db.compterUsage(a.util);
    return r;
  } catch (e) {
    if (e.message !== 'INDISPONIBLE') console.error('[ia]', e.message);
    await a.reply(bot.remplir(bot.textes().indisponible));
    return null;
  } finally {
    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch {}
  }
}

// Renvoie le texte de l'IA, ou null (et répond déjà à la personne) si impossible
async function tache(ctx, systeme, texte, { pied = true } = {}) {
  const a = await acces(ctx);
  if (!a) return null;
  const rep = await executer(ctx, a, ({ cles }) => ia.repondre([
    { role: 'system', content: systeme },
    { role: 'user', content: String(texte).slice(0, 6000) },
  ], { cles }));
  return rep ? rep.texte.trim() + (pied ? PIED : '') : null;
}

module.exports = { tache, acces, executer, PIED };
