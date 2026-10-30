// Kernel Bot — protections de groupe et automatismes, branchés sur chaque message via les « crochets »
const config = require('../config');
const hooks = require('./hooks');
const groupes = require('./groupes');
const reglages = require('./reglages');
const warns = require('./avertissements');
const niveaux = require('./niveaux');
const { numero, contextInfo, contenu } = require('./utils');

const RE_LIEN = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+|\b[a-z0-9-]+\.(com|net|org|info|xyz|me|io|co|cd|cg|fr|tk|ml|top|site|online|link|ly|gl|be)\b(\/\S*)?/i;
const spam = new Map(); // groupe|expéditeur -> horodatages
const derniereMention = new Map(); // chat -> horodatage
const vuRecemment = new Map(); // groupe|membre -> horodatage

const tag = (jid) => `@${numero(jid)}`;

// Applique la sanction choisie : supprimer | avertir | expulser. Renvoie true si le message a été traité.
async function sanction(ctx, meta, action, raison) {
  const { sock, msg, jid, sender } = ctx;
  const botAdmin = groupes.botEstAdmin(sock, meta);
  if (!botAdmin) return false; // sans droits d'admin, le bot ne peut rien faire
  try {
    await sock.sendMessage(jid, { delete: msg.key });
  } catch {}
  if (action === 'avertir') {
    const w = warns.ajouter(jid, sender, raison);
    const lim = warns.limite(jid);
    if (w.n >= lim) {
      await sock.sendMessage(jid, { text: `🚫 ${tag(sender)} a atteint ${lim} avertissements (${raison}) et est exclu.`, mentions: [sender] });
      try {
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      } catch {}
      warns.remettreAZero(jid, sender);
    } else {
      await sock.sendMessage(jid, { text: `⚠️ ${tag(sender)} — ${raison}.\nAvertissement ${w.n}/${lim}.`, mentions: [sender] });
    }
  } else if (action === 'expulser') {
    await sock.sendMessage(jid, { text: `🚫 ${tag(sender)} est exclu : ${raison}.`, mentions: [sender] });
    try {
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
    } catch {}
  }
  return true;
}

// ───── Groupes : liens, spam, bots, mentions en masse ─────
hooks.avant('protections-groupe', async (ctx) => {
  const { sock, msg, jid, isGroup, texte, sender, isOwner, candidats } = ctx;
  if (!isGroup || isOwner || msg.key.fromMe) return false;
  const rg = groupes.reglages(jid);
  const antilien = rg.antilien?.actif, antispam = rg.antispam?.actif, antibot = rg.antibot?.actif;
  const antimention = rg.antimention?.actif, antimentiongroupe = rg.antimentiongroupe?.actif;
  if (!(antilien || antispam || antibot || antimention || antimentiongroupe)) return false;

  let meta;
  try {
    meta = await groupes.metadata(sock, jid);
  } catch {
    return false;
  }
  if (groupes.estAdmin(meta, [...candidats, sender])) return false; // les admins sont libres
  const m = contenu(msg.message);

  if (antibot) {
    const id = msg.key.id || '';
    // Les bots écrits avec Baileys fabriquent des identifiants reconnaissables (détection approximative)
    if (id.startsWith('BAE5') || (id.startsWith('3EB0') && id.length >= 36)) {
      if (await sanction(ctx, meta, rg.antibot.action || 'supprimer', 'les bots ne sont pas autorisés ici')) return true;
    }
  }
  if (antimentiongroupe && (m.groupStatusMentionMessage || m.statusMentionMessage || contextInfo(msg).groupMentions?.length)) {
    if (await sanction(ctx, meta, rg.antimentiongroupe.action || 'supprimer', 'mention du groupe interdite')) return true;
  }
  if (antimention) {
    const seuil = rg.antimention.seuil || 10;
    const mentions = contextInfo(msg).mentionedJid || [];
    if (mentions.length >= seuil || (/@(everyone|tous|all)\b/i.test(texte) && mentions.length >= 5)) {
      if (await sanction(ctx, meta, rg.antimention.action || 'avertir', 'mentions en masse interdites')) return true;
    }
  }
  if (antilien && texte && RE_LIEN.test(texte)) {
    const autorises = rg.antilien.autorises || [];
    const trouves = texte.match(new RegExp(RE_LIEN.source, 'gi')) || [];
    const interdit = trouves.some((l) => !autorises.some((a) => l.toLowerCase().includes(a)));
    if (interdit && (await sanction(ctx, meta, rg.antilien.action || 'supprimer', 'les liens sont interdits'))) return true;
  }
  if (antispam) {
    const { max = 6, secondes = 8 } = rg.antispam;
    const k = jid + '|' + numero(sender);
    const t = Date.now();
    const l = (spam.get(k) || []).filter((x) => t - x < secondes * 1000);
    l.push(t);
    spam.set(k, l);
    if (spam.size > 3000) spam.delete(spam.keys().next().value);
    if (l.length > max) {
      spam.delete(k);
      if (await sanction(ctx, meta, rg.antispam.action || 'avertir', 'pas de spam')) return true;
    }
  }
  return false;
});

// ───── Automatismes du propriétaire ─────
hooks.avant('automatismes', async (ctx) => {
  const { sock, msg, jid, isGroup, texte, sender } = ctx;
  if (msg.key.fromMe) return false;
  const r = reglages.lire();

  if (r.lireauto) sock.readMessages([msg.key]).catch(() => {});

  const estCommande = texte.startsWith(config.PREFIXE);
  // Mode privé : le bot ne dit rien aux autres, même par automatisme (réponses d'absence, de mention, niveaux)
  const silence = config.MODE === 'private' && !ctx.isOwner;
  if (r.reagirauto && estCommande && !silence) sock.sendMessage(jid, { react: { text: r.emojiReaction || '🪄', key: msg.key } }).catch(() => {});

  // Quelqu'un mentionne le propriétaire : réponse automatique (au plus une fois par minute et par discussion)
  if (r.mentionActif && r.mentionMessage && isGroup && !silence) {
    const moi = [sock.user?.id, sock.user?.lid, ...config.OWNERS].filter(Boolean).map(numero);
    const mentions = (contextInfo(msg).mentionedJid || []).map(numero);
    if (mentions.some((x) => moi.includes(x)) && Date.now() - (derniereMention.get(jid) || 0) > 60000) {
      derniereMention.set(jid, Date.now());
      sock.sendMessage(jid, { text: r.mentionMessage }, { quoted: msg }).catch(() => {});
    }
  }

  // Répondeur d'absence : en privé, une seule réponse par personne toutes les 12 h
  if (r.absentActif && r.absentMessage && !isGroup && !ctx.isOwner && texte && !silence) {
    const k = numero(sender);
    const vu = require('./store').get('absentvu', k, 0);
    if (Date.now() - vu > 12 * 3600000) {
      require('./store').set('absentvu', k, Date.now());
      sock.sendMessage(jid, { text: r.absentMessage }, { quoted: msg }).catch(() => {});
    }
  }

  // Dernière activité des membres (commande « inactifs ») : au plus une écriture toutes les 10 minutes par personne
  if (isGroup) {
    const k = jid + '|' + numero(sender);
    if (Date.now() - (vuRecemment.get(k) || 0) > 600000) {
      vuRecemment.set(k, Date.now());
      require('./store').set('actif', k, { ts: Date.now() });
      if (vuRecemment.size > 5000) vuRecemment.delete(vuRecemment.keys().next().value);
    }
  }

  // Points d'expérience : seulement pour les vrais messages (pas les commandes)
  if (r.niveau && isGroup && texte && !estCommande && !silence) {
    const g = niveaux.gagner(jid, sender, msg.pushName);
    if (g.monte) {
      sock.sendMessage(jid, { text: `🎉 ${tag(sender)} passe au *niveau ${g.niveau}* !`, mentions: [sender] }).catch(() => {});
    }
  }
  return false;
});

module.exports = { sanction, RE_LIEN };
