// MWENOBANGUE Labs — fonctions utilitaires partagées par les commandes
const numero = (jid) => String(jid || '').split('@')[0].split(':')[0];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Retire les enveloppes (message éphémère, vue unique…) pour atteindre le vrai contenu
function contenu(message) {
  if (!message) return {};
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

// contextInfo : mentions, message cité, etc.
function contextInfo(msg) {
  const m = contenu(msg.message);
  for (const type of Object.keys(m)) {
    const ci = m[type]?.contextInfo;
    if (ci) return ci;
  }
  return {};
}

// Message cité (retourne { message, participant } ou null)
function messageCite(msg) {
  const ci = contextInfo(msg);
  if (!ci.quotedMessage) return null;
  return { message: ci.quotedMessage, participant: ci.participant, stanzaId: ci.stanzaId };
}

// Détermine les membres visés : mentions, message cité, ou numéro écrit en argument
function cibles(msg, args = [], metadata = null) {
  const ci = contextInfo(msg);
  if (ci.mentionedJid?.length) return [...new Set(ci.mentionedJid)];
  if (ci.participant) return [ci.participant];

  const trouves = [];
  for (const a of args) {
    const chiffres = a.replace(/\D/g, '');
    if (chiffres.length < 6) continue;
    const p = metadata?.participants?.find((x) =>
      [x.id, x.jid, x.phoneNumber, x.lid].filter(Boolean).some((v) => numero(v) === chiffres)
    );
    trouves.push(p ? p.id : `${chiffres}@s.whatsapp.net`);
  }
  return trouves;
}

// Numéro lisible d'un participant (si WhatsApp le fournit)
function numeroDe(p) {
  const brut = [p.phoneNumber, p.jid, p.id].filter(Boolean).find((v) => String(v).includes('@s.whatsapp.net'));
  return brut ? numero(brut) : null;
}

// Texte d'un message (y compris légende d'une image, d'une vidéo, d'un document)
function extraireTexte(message) {
  const m = contenu(message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

// « 30min », « 2h », « 1j », « 45s », « 1h30 » -> millisecondes (0 si illisible)
function parseDuree(texte) {
  const t = String(texte || '').toLowerCase().replace(/,/g, '.');
  const unites = { s: 1e3, sec: 1e3, min: 6e4, m: 6e4, h: 36e5, j: 864e5, d: 864e5 };
  let total = 0;
  let trouve = false;
  const re = /(\d+(?:\.\d+)?)\s*(jours?|j|d|heures?|h|minutes?|min|m|secondes?|sec|s)(?![a-zéèû])/g;
  let m;
  while ((m = re.exec(t))) {
    const u = m[2].startsWith('j') || m[2] === 'd' ? 'j' : m[2].startsWith('h') ? 'h' : m[2].startsWith('min') || m[2] === 'm' ? 'min' : 's';
    total += parseFloat(m[1]) * unites[u];
    trouve = true;
  }
  // « 1h30 » : minutes sans unité après les heures
  const h30 = t.match(/(\d+)\s*h\s*(\d{1,2})(?!\s*[a-z])/);
  if (h30 && !/min/.test(t)) total += parseInt(h30[2], 10) * 6e4;
  return trouve ? Math.round(total) : 0;
}

function formatDuree(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (j) parts.push(`${j} j`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (!parts.length) parts.push(`${s % 60} s`);
  return parts.join(' ');
}

// Date/heure à Brazzaville (UTC+1), format lisible
const dateLocale = (ts = Date.now(), tz = 'Africa/Brazzaville') =>
  new Date(ts).toLocaleString('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });

// Médias : renvoie le message qui contient un média (le message lui-même ou celui qui est cité)
const TYPES_MEDIA = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'ptvMessage'];
const aCle = (x) => !!(x && x.mediaKey && x.mediaKey.length);
function messageMedia(msg) {
  const m = contenu(msg.message);
  const direct = TYPES_MEDIA.find((t) => m[t]);
  if (direct) return { key: msg.key, message: msg.message, type: direct };
  const ci = contextInfo(msg);
  if (ci.quotedMessage) {
    const q = contenu(ci.quotedMessage);
    const t = TYPES_MEDIA.find((x) => q[x]);
    if (t) {
      // Un message en « vue unique » cité perd sa clé de déchiffrement : on reprend alors le message d'origine gardé en mémoire
      if (!aCle(q[t]) && ci.stanzaId) {
        const orig = require('./cache').lire(ci.stanzaId);
        const mo = orig && contenu(orig.message);
        const to = mo && TYPES_MEDIA.find((x) => aCle(mo[x]));
        if (to) return { key: orig.key, message: orig.message, type: to };
      }
      return {
        key: { remoteJid: msg.key.remoteJid, id: ci.stanzaId, participant: ci.participant, fromMe: false },
        message: ci.quotedMessage,
        type: t,
      };
    }
  }
  return null;
}

// Propriétaires du bot : les numéros de NUMERO_OWNER ; sans liste (moteur personnel), le numéro connecté lui-même
function proprietaires(sock) {
  const liste = require('../config').OWNERS;
  if (liste.length) return liste;
  const moi = numero(sock?.user?.id);
  return moi ? [moi] : [];
}

async function telecharger(sock, msg) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  const cible = messageMedia(msg);
  if (!cible) return null;
  const buffer = await downloadMediaMessage(cible, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
  const c = contenu(cible.message)[cible.type];
  return { buffer, type: cible.type.replace('Message', ''), mime: c?.mimetype || '', nom: c?.fileName || '', message: cible };
}

module.exports = {
  numero, pause, contenu, contextInfo, messageCite, cibles, numeroDe,
  extraireTexte, parseDuree, formatDuree, dateLocale, messageMedia, telecharger, proprietaires,
};
