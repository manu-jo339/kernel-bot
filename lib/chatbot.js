// MWENOBANGUE Labs — chatbot : décide quand répondre, garde la mémoire, applique les limites
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./db');
const ia = require('./ia');

const numero = (jid) => String(jid || '').split('@')[0].split(':')[0];

const REGLAGES = () => ({
  limiteJour: Number(process.env.IA_LIMITE_JOUR) || 30,
  memoire: Number(process.env.IA_MEMOIRE_MSG) || 12,
  jours: Number(process.env.IA_CONSERVATION_JOURS) || 30,
  priveParDefaut: !/^(non|no|false|0)$/i.test(process.env.IA_PRIVE_DEFAUT || 'oui'),
  delaiMini: Number(process.env.IA_DELAI_MINI_MS) || 2000,
  maxEntree: 1500,
});

const textes = () => config.PERSO.chatbot;
const remplir = (t) => {
  const r = REGLAGES();
  return String(t)
    .replace(/\{NOM_BOT\}/g, config.NOM_BOT)
    .replace(/\{PREFIXE\}/g, config.PREFIXE)
    .replace(/\{JOURS\}/g, r.jours)
    .replace(/\{LIMITE\}/g, r.limiteJour);
};

const iaDisponible = () => ia.apercu().some((s) => s.statut !== 'clé manquante');
const globalActif = () => db.lire('ia_global') !== 'off';

// Base de connaissances facultative : data/connaissances.txt (infos sur ton activité, tes services…)
function connaissances() {
  try {
    const f = path.join(__dirname, '..', 'data', 'connaissances.txt');
    const t = fs.readFileSync(f, 'utf8').trim();
    return t ? t.slice(0, 6000) : '';
  } catch {
    return '';
  }
}

function promptSysteme(isGroup) {
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Brazzaville', dateStyle: 'full' });
  let p = remplir(textes().personnalite) + `\nDate du jour : ${date}.`;
  p += '\nFormat WhatsApp : pas de titres Markdown (#), pas de tableaux ; utilise *gras* avec un seul astérisque.';
  if (isGroup) p += '\nTu es dans un groupe : les messages des membres commencent par leur prénom. Réponds à la personne qui te parle.';
  const k = connaissances();
  if (k) p += `\n\nInformations de référence (utilise-les quand c'est pertinent) :\n${k}`;
  return p;
}

// Met en forme la réponse pour WhatsApp
function nettoyer(t) {
  return t
    .replace(/\*\*(.+?)\*\*/gs, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

// Une file d'attente par discussion : évite les réponses qui se mélangent
const files = new Map();
function enFile(cle, tache) {
  const precedent = files.get(cle) || Promise.resolve();
  const suite = precedent.catch(() => {}).then(tache);
  files.set(cle, suite);
  suite.finally(() => files.get(cle) === suite && files.delete(cle));
  return suite;
}

const derniere = new Map(); // anti-spam : dernier message accepté par utilisateur
function tropRapide(u) {
  const t = Date.now();
  const d = derniere.get(u) || 0;
  if (t - d < REGLAGES().delaiMini) return true;
  derniere.set(u, t);
  if (derniere.size > 5000) derniere.clear();
  return false;
}

// Est-ce qu'on s'adresse au bot dans ce groupe ? (mention ou réponse à un de ses messages)
function viseLeBot(sock, msg) {
  const { contextInfo } = require('./utils');
  const ci = contextInfo(msg);
  const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero);
  const mentions = (ci.mentionedJid || []).map(numero);
  if (mentions.some((m) => moi.includes(m))) return true;
  if (ci.participant && moi.includes(numero(ci.participant))) return true;
  return false;
}

async function envoyerAvis(sock, jid, msg, groupe) {
  let t = remplir(textes().avis);
  if (groupe) t = '📢 *Chatbot activé dans ce groupe.* Pour me parler, mentionnez-moi ou répondez à un de mes messages.\n\n' + t;
  await sock.sendMessage(jid, { text: t }, msg ? { quoted: msg } : undefined);
}

/**
 * Traite une question adressée à l'IA.
 * explicite = true quand la personne a tapé la commande .ia (le chatbot n'a pas besoin d'être activé).
 */
async function poserQuestion({ sock, msg, jid, isGroup, sender, isOwner }, texteBrut, explicite = false) {
  const r = REGLAGES();
  const texte = String(texteBrut || '').replace(/@\d{6,}/g, '').trim().slice(0, r.maxEntree);
  if (!texte) return;
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  const util = numero(sender);
  const cle = (isGroup ? 'g:' : 'p:') + numero(jid);

  const clesPerso = require('./macle').cles(util);
  const perso = Object.keys(clesPerso).length > 0;
  if (!perso && !iaDisponible()) {
    if (explicite) await reply("⚙️ L'IA n'est pas configurée (aucune clé API dans le fichier .env).");
    return;
  }

  // Première utilisation : on prévient d'abord, et le message n'est pas envoyé à l'IA
  if (!db.aRecuInfo(util)) {
    db.marquerInfo(util);
    if (isGroup) {
      // L'avis est toujours envoyé en privé à la personne, jamais dans le groupe
      try {
        await envoyerAvis(sock, sender, null, false);
        if (!explicite) await reply('📩 Je viens de t’envoyer un message d’information en privé. Lis-le, puis repose ta question ici.');
      } catch {
        await envoyerAvis(sock, jid, msg, false);
      }
    } else {
      await envoyerAvis(sock, jid, msg, false);
    }
    if (!explicite) return;
  }

  if (tropRapide(util)) return;
  if (!isOwner && !perso && db.usageAujourdhui(util) >= r.limiteJour) return reply(remplir(textes().limiteAtteinte));

  return enFile(cle, async () => {
    try {
      await sock.sendPresenceUpdate('composing', jid);
    } catch {}
    const nom = (msg.pushName || '').split(/\s+/)[0] || 'Utilisateur';
    const histo = db.historique(cle, r.memoire);
    const messages = [{ role: 'system', content: promptSysteme(isGroup) }];
    for (const h of histo) {
      messages.push({ role: h.role, content: h.role === 'user' && isGroup && h.nom ? `${h.nom} : ${h.contenu}` : h.contenu });
    }
    messages.push({ role: 'user', content: isGroup ? `${nom} : ${texte}` : texte });

    let rep;
    try {
      rep = await ia.repondre(messages, { cles: clesPerso });
    } catch (e) {
      if (e.message !== 'INDISPONIBLE') console.error('[chatbot]', e);
      await reply(remplir(textes().indisponible));
      return;
    } finally {
      try {
        await sock.sendPresenceUpdate('paused', jid);
      } catch {}
    }

    const finale = nettoyer(rep.texte);
    db.ajouterMessage(cle, util, 'user', nom, texte);
    db.ajouterMessage(cle, null, 'assistant', null, finale);
    db.compterUsage(util);
    await reply(finale);
  });
}

// Appelé par le handler pour chaque message qui n'est pas une commande
async function surMessage(ctx) {
  const { sock, msg, jid, isGroup, texte } = ctx;
  if (msg.key.fromMe || !texte) return;
  if (!globalActif()) return;
  const r = REGLAGES();

  if (isGroup) {
    if (db.etatActif('g:' + numero(jid)) !== true) return;
    if (!viseLeBot(sock, msg)) return;
  } else {
    const etat = db.etatActif('p:' + numero(jid));
    if (etat === false || (etat === null && !r.priveParDefaut)) return;
  }
  await poserQuestion(ctx, texte, false);
}

// Purge régulière des vieux messages (confidentialité)
function purger() {
  try {
    db.purger(REGLAGES().jours);
  } catch (e) {
    console.error('[chatbot] purge impossible :', e.message);
  }
}
purger();
setInterval(purger, 6 * 3600e3).unref();

module.exports = {
  surMessage,
  poserQuestion,
  envoyerAvis,
  globalActif,
  iaDisponible,
  reglages: REGLAGES,
  remplir,
  textes,
  numero,
};
