// Kernel Bot — commandes du propriétaire : accès, bannissements, automatismes, sessions, stickers-commandes
const store = require('../lib/store');
const reglages = require('../lib/reglages');
const permissions = require('../lib/permissions');
const groupes = require('../lib/groupes');
const session = require('../lib/session');
const { numero, cibles, contextInfo, messageCite } = require('../lib/utils');

const base = { categorie: 'Propriétaire', ownerOnly: true };
const strict = { ...base, strict: true };
const OUI = ['on', 'oui', 'activer', 'active', '1', 'true'];
const NON = ['off', 'non', 'desactiver', 'désactiver', 'desactive', '0', 'false'];
const etat = (b) => (b ? '✅ activé' : '❌ désactivé');

// Personne visée : mention, message cité, numéro écrit ; en privé, la discussion elle-même
function viser({ msg, args, metadata, isGroup, jid }) {
  const [c] = cibles(msg, args, metadata);
  if (c) return c;
  return isGroup ? null : jid;
}
const trouverCmd = (liste, n) => liste.find((c) => c.name === n.toLowerCase() || c.aliases.includes(n.toLowerCase()));

// Interrupteur sur un réglage global : .nom on | off
function global({ name, cle, desc, aide = '', extra }) {
  return {
    ...base,
    name,
    desc,
    run: async (ctx) => {
      const { args, reply, config } = ctx;
      const a = (args[0] || '').toLowerCase();
      if (OUI.includes(a)) {
        reglages.ecrire({ [cle]: true });
        return reply(`✅ *${name}* activé.`);
      }
      if (NON.includes(a)) {
        reglages.ecrire({ [cle]: false });
        return reply(`❌ *${name}* désactivé.`);
      }
      if (extra) {
        const r = await extra(ctx, a);
        if (r) return r;
      }
      const p = config.PREFIXE;
      return reply(`⚙️ *${name}* : ${etat(reglages.lire()[cle])}\n\n${p}${name} on / off${aide ? '\n' + aide.replace(/\{P\}/g, p) : ''}`);
    },
  };
}

module.exports = [
  // ───────────── Accès : bannissements, premium ─────────────
  {
    ...base,
    name: 'bannir',
    aliases: ['ban'],
    desc: 'Interdit à une personne d’utiliser le bot',
    metaSiGroupe: true,
    run: async (ctx) => {
      const { args, reply, config, sock } = ctx;
      const c = viser(ctx);
      if (!c) return reply(`✏️ ${config.PREFIXE}bannir @personne (ou en répondant à son message, ou son numéro)`);
      if (config.OWNERS.includes(numero(c)) || numero(c) === numero(sock.user?.id)) return reply('🛡️ Impossible de bannir un propriétaire.');
      permissions.bannir(c, args.filter((x) => !/^@?\d{6,}$/.test(x)).join(' '));
      await reply(`🚫 @${numero(c)} ne peut plus utiliser le bot.`);
    },
  },
  {
    ...base,
    name: 'debannir',
    aliases: ['deban'],
    desc: 'Autorise de nouveau une personne bannie',
    metaSiGroupe: true,
    run: async (ctx) => {
      const c = viser(ctx);
      if (!c) return ctx.reply(`✏️ ${ctx.config.PREFIXE}debannir @personne`);
      await ctx.reply(permissions.debannir(c) ? `✅ @${numero(c)} peut de nouveau utiliser le bot.` : 'ℹ️ Cette personne n’était pas bannie.');
    },
  },
  {
    ...base,
    name: 'bannirgroupe',
    aliases: ['bangroup'],
    desc: 'Le bot ignore ce groupe',
    groupOnly: true,
    run: async ({ jid, args, reply }) => {
      permissions.bannirGroupe(jid, args.join(' '));
      await reply('🚫 Ce groupe est banni : je n’y répondrai plus (sauf au propriétaire).');
    },
  },
  {
    ...base,
    name: 'debannirgroupe',
    aliases: ['debangroup'],
    desc: 'Le bot répond de nouveau dans ce groupe',
    groupOnly: true,
    run: async ({ jid, reply }) => {
      await reply(permissions.debannirGroupe(jid) ? '✅ Groupe débanni.' : 'ℹ️ Ce groupe n’était pas banni.');
    },
  },
  {
    ...strict,
    name: 'ajouterpremium',
    aliases: ['setsudo', 'addpremium'],
    desc: 'Donne l’accès premium à une personne de confiance',
    metaSiGroupe: true,
    run: async (ctx) => {
      const c = viser(ctx);
      if (!c) return ctx.reply(`✏️ ${ctx.config.PREFIXE}ajouterpremium @personne`);
      permissions.ajouterPremium(c);
      await ctx.reply(`⭐ @${numero(c)} est maintenant premium.`);
    },
  },
  {
    ...strict,
    name: 'retirerpremium',
    aliases: ['delsudo'],
    desc: 'Retire l’accès premium',
    metaSiGroupe: true,
    run: async (ctx) => {
      const c = viser(ctx);
      if (!c) return ctx.reply(`✏️ ${ctx.config.PREFIXE}retirerpremium @personne`);
      await ctx.reply(permissions.retirerPremium(c) ? `✅ @${numero(c)} n’est plus premium.` : 'ℹ️ Cette personne n’était pas premium.');
    },
  },
  {
    ...base,
    name: 'listepremium',
    aliases: ['sudolist'],
    desc: 'Liste des utilisateurs premium',
    run: async ({ reply }) => {
      const l = permissions.listePremium();
      await reply(l.length ? `⭐ *Utilisateurs premium* (${l.length})\n${l.map((n) => '• +' + n).join('\n')}` : 'ℹ️ Aucun utilisateur premium.');
    },
  },

  // ───────────── Commandes publiques / premium ─────────────
  ...[
    ['commandepublique', 'publiques', 'ajouter', 'Rend une commande utilisable par tous (même en mode privé)'],
    ['retirercommandepublique', 'publiques', 'retirer', 'Retire une commande de la liste publique'],
    ['commandepremium', 'premium', 'ajouter', 'Réserve une commande aux utilisateurs premium'],
    ['retirercommandepremium', 'premium', 'retirer', 'Retire une commande de la liste premium'],
  ].map(([name, nom, op, desc]) => ({
    ...strict,
    name,
    desc,
    run: async ({ args, reply, liste, config }) => {
      if (!args[0]) return reply(`✏️ ${config.PREFIXE}${name} nomdecommande`);
      const c = trouverCmd(liste, args[0]);
      if (!c) return reply(`❓ Commande « ${args[0]} » introuvable.`);
      if (c.ownerOnly) return reply('🛡️ Une commande du propriétaire ne peut pas être ouverte aux autres.');
      op === 'ajouter' ? permissions.ajouterCmd(nom, c.name) : permissions.retirerCmd(nom, c.name);
      await reply(`✅ ${config.PREFIXE}${c.name} : liste « ${nom} » mise à jour.`);
    },
  })),
  ...[
    ['listecommandespubliques', 'publiques', 'Commandes ouvertes à tous'],
    ['listecommandespremium', 'premium', 'Commandes réservées aux premium'],
  ].map(([name, nom, desc]) => ({
    ...base,
    name,
    desc,
    run: async ({ reply, config }) => {
      const l = permissions.liste(nom);
      await reply(l.length ? `📋 *${desc}*\n${l.map((c) => '• ' + config.PREFIXE + c).join('\n')}` : `ℹ️ Aucune commande dans la liste « ${nom} ».`);
    },
  })),

  // ───────────── Automatismes (réglages globaux) ─────────────
  global({ name: 'niveau', cle: 'niveau', desc: 'Messages de passage de niveau', aide: 'Les membres gagnent de l’expérience en discutant dans les groupes.' }),
  global({
    name: 'antiappel', cle: 'antiappel', desc: 'Rejette automatiquement les appels', aide: '{P}antiappel message <texte> — change la réponse envoyée',
    extra: async ({ args, reply }, a) => {
      if (a !== 'message') return null;
      const t = args.slice(1).join(' ').trim();
      if (!t) return reply('✏️ Écris le message à envoyer.');
      reglages.ecrire({ messageAppel: t });
      return reply('✅ Message enregistré.');
    },
  }),
  global({ name: 'lireauto', cle: 'lireauto', desc: 'Marque automatiquement les messages comme lus (coches bleues)' }),
  global({
    name: 'reagirauto', cle: 'reagirauto', desc: 'Réagit par un emoji à chaque commande reçue', aide: '{P}reagirauto emoji 👍 — choisit l’emoji',
    extra: async ({ args, reply }, a) => {
      if (a !== 'emoji' || !args[1]) return null;
      reglages.ecrire({ emojiReaction: args[1] });
      return reply(`✅ Emoji de réaction : ${args[1]}`);
    },
  }),
  global({
    name: 'antisuppression', cle: 'antisuppression', desc: 'Réaffiche les messages supprimés', aide: '{P}antisuppression ici | proprio — où renvoyer le message supprimé',
    extra: async ({ reply }, a) => {
      if (!['ici', 'proprio'].includes(a)) return null;
      reglages.ecrire({ antisuppression: true, antisuppressionVers: a });
      return reply(`✅ Anti-suppression activé : messages renvoyés ${a === 'ici' ? 'dans la discussion' : 'au propriétaire'}.`);
    },
  }),
  {
    ...base,
    name: 'adminsseulement',
    aliases: ['onlyadmins'],
    desc: 'Le bot ne répond qu’aux admins dans ce groupe',
    groupOnly: true,
    run: async ({ jid, args, reply, config }) => {
      const a = (args[0] || '').toLowerCase();
      if (OUI.includes(a)) {
        groupes.majReglages(jid, { adminsSeulement: true });
        return reply('✅ Je ne répondrai plus qu’aux administrateurs de ce groupe.');
      }
      if (NON.includes(a)) {
        groupes.majReglages(jid, { adminsSeulement: false });
        return reply('✅ Je réponds de nouveau à tous les membres.');
      }
      await reply(`⚙️ *adminsseulement* : ${etat(groupes.reglages(jid).adminsSeulement)}\n\n${config.PREFIXE}adminsseulement on / off`);
    },
  },

  // ───────────── Réponse automatique quand on te mentionne ─────────────
  {
    ...base,
    name: 'messagemention',
    aliases: ['setmention'],
    desc: 'Définit la réponse automatique quand on te mentionne',
    run: async ({ args, reply, config }) => {
      const t = args.join(' ').trim();
      if (!t) return reply(`✏️ ${config.PREFIXE}messagemention Je suis occupé, je reviens vite.`);
      reglages.ecrire({ mentionMessage: t, mentionActif: true });
      await reply('✅ Réponse automatique enregistrée et activée.');
    },
  },
  {
    ...base,
    name: 'retirermention',
    aliases: ['delmention'],
    desc: 'Désactive la réponse automatique aux mentions',
    run: async ({ reply }) => {
      reglages.ecrire({ mentionActif: false });
      await reply('✅ Réponse automatique aux mentions désactivée.');
    },
  },
  {
    ...base,
    name: 'voirmention',
    aliases: ['getmention'],
    desc: 'Affiche la réponse automatique aux mentions',
    run: async ({ reply }) => {
      const r = reglages.lire();
      await reply(`🔔 Réponse aux mentions : ${etat(r.mentionActif)}\n${r.mentionMessage || '(aucun message défini)'}`);
    },
  },

  // ───────────── Stickers qui déclenchent une commande ─────────────
  {
    ...base,
    name: 'liersticker',
    aliases: ['addstickcmd'],
    desc: 'Lie un sticker à une commande (réponds à un sticker)',
    run: async ({ msg, args, reply, liste, config }) => {
      const cite = messageCite(msg);
      const st = cite?.message?.stickerMessage;
      if (!st?.fileSha256) return reply(`✏️ Réponds à un sticker avec : ${config.PREFIXE}liersticker nomdecommande`);
      const c = args[0] && trouverCmd(liste, args[0]);
      if (!c) return reply('❓ Commande introuvable.');
      store.set('stickercmd', Buffer.from(st.fileSha256).toString('base64'), { cmd: c.name });
      await reply(`✅ Ce sticker lance maintenant ${config.PREFIXE}${c.name}.`);
    },
  },
  {
    ...base,
    name: 'deliersticker',
    aliases: ['delstickcmd'],
    desc: 'Détache un sticker (réponds au sticker)',
    run: async ({ msg, reply }) => {
      const st = messageCite(msg)?.message?.stickerMessage;
      if (!st?.fileSha256) return reply('✏️ Réponds au sticker à détacher.');
      await reply(store.del('stickercmd', Buffer.from(st.fileSha256).toString('base64')) ? '✅ Sticker détaché.' : 'ℹ️ Ce sticker n’était lié à aucune commande.');
    },
  },
  {
    ...base,
    name: 'voirstickers',
    aliases: ['getstickcmd'],
    desc: 'Liste les stickers liés à des commandes',
    run: async ({ reply, config }) => {
      const l = store.liste('stickercmd');
      await reply(l.length ? `🏷️ *Stickers liés* (${l.length})\n${l.map((x, i) => `${i + 1}. ${config.PREFIXE}${x.data.cmd}`).join('\n')}` : 'ℹ️ Aucun sticker lié.');
    },
  },

  // ───────────── Messages et discussions ─────────────
  {
    ...base,
    name: 'supprimer',
    aliases: ['delete', 'del'],
    desc: 'Supprime pour tous le message auquel tu réponds',
    run: async ({ sock, msg, jid, reply }) => {
      const ci = contextInfo(msg);
      if (!ci.stanzaId) return reply('✏️ Réponds au message à supprimer.');
      const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero);
      const fromMe = !ci.participant || moi.includes(numero(ci.participant));
      try {
        await sock.sendMessage(jid, { delete: { remoteJid: jid, id: ci.stanzaId, fromMe, participant: fromMe ? undefined : ci.participant } });
      } catch (e) {
        await reply('⚠️ Suppression impossible : ' + e.message);
      }
    },
  },
  {
    ...base,
    name: 'viderdiscussion',
    aliases: ['clear'],
    desc: 'Vide cette discussion (sur le téléphone du bot)',
    run: async ({ sock, jid, msg, reply }) => {
      try {
        await sock.chatModify({ clear: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] }, jid);
      } catch (e) {
        await reply('⚠️ Impossible : ' + e.message);
      }
    },
  },
  {
    ...base,
    name: 'bloquer',
    aliases: ['block'],
    desc: 'Bloque une personne sur WhatsApp',
    metaSiGroupe: true,
    run: async (ctx) => {
      const c = viser(ctx);
      if (!c) return ctx.reply(`✏️ ${ctx.config.PREFIXE}bloquer @personne (ou en privé avec la personne)`);
      if (ctx.config.OWNERS.includes(numero(c))) return ctx.reply('🛡️ Impossible de bloquer un propriétaire.');
      await ctx.sock.updateBlockStatus(c, 'block');
      await ctx.reply(`🔒 @${numero(c)} est bloqué.`);
    },
  },
  {
    ...base,
    name: 'debloquer',
    aliases: ['deblock', 'unblock'],
    desc: 'Débloque une personne',
    metaSiGroupe: true,
    run: async (ctx) => {
      const c = viser(ctx);
      if (!c) return ctx.reply(`✏️ ${ctx.config.PREFIXE}debloquer @personne`);
      await ctx.sock.updateBlockStatus(c, 'unblock');
      await ctx.reply(`🔓 @${numero(c)} est débloqué.`);
    },
  },
  {
    ...base,
    name: 'jid',
    desc: 'Affiche les identifiants WhatsApp (discussion, auteur, message cité)',
    run: async ({ msg, jid, sender, reply }) => {
      const ci = contextInfo(msg);
      let t = `🆔 Discussion : ${jid}\n👤 Toi : ${sender}`;
      if (ci.participant) t += `\n↩️ Message cité : ${ci.participant}`;
      if (ci.mentionedJid?.length) t += `\n📌 Mentions : ${ci.mentionedJid.join(', ')}`;
      await reply(t);
    },
  },

  // ───────────── Redémarrage et sessions ─────────────
  {
    ...strict,
    name: 'redemarrer',
    aliases: ['restart', 'reboot'],
    desc: 'Redémarre le bot',
    run: async ({ reply }) => {
      if (!process.env.KERNEL_SUPERVISE) {
        return reply('⚠️ Le redémarrage automatique demande de lancer le bot avec *npm start* (et non « node index.js »).');
      }
      await reply('🔄 Redémarrage en cours… je reviens dans quelques secondes.');
      setTimeout(() => process.exit(42), 1500);
    },
  },
  {
    ...strict,
    name: 'connecter',
    aliases: ['connect'],
    desc: 'Connecte un autre numéro WhatsApp au bot (code d’appairage)',
    run: async ({ args, reply, config }) => {
      const n = (args[0] || '').replace(/\D/g, '');
      if (!n) return reply(`✏️ ${config.PREFIXE}connecter 242061234567\nLe numéro doit être celui d’un WhatsApp dont tu as le téléphone en main.`);
      try {
        await session.connecter(n, async (code, erreur) => {
          if (!code) return reply('⚠️ Code impossible à obtenir : ' + erreur);
          await reply(`🔗 *Code d’appairage pour +${n}*\n\n*${code}*\n\nSur ce téléphone : WhatsApp › Appareils connectés › Connecter un appareil › « Se connecter avec un numéro de téléphone ».\n⏳ Le code expire vite.`);
        });
        await reply('⏳ Préparation du code…');
      } catch (e) {
        await reply('⚠️ ' + e.message);
      }
    },
  },
  {
    ...strict,
    name: 'numerosconnectes',
    aliases: ['connect_session', 'sessions'],
    desc: 'Liste les numéros connectés au bot',
    run: async ({ reply }) => {
      const l = session.liste();
      await reply(`🔗 *Numéros connectés* (${l.length})\n${l.map((s) => `• +${s.numero} ${s.connectee ? '🟢' : '🔴'}${s.secondaire ? '' : ' (principal)'}`).join('\n')}`);
    },
  },
  {
    ...strict,
    name: 'deconnecter',
    aliases: ['disconnect'],
    desc: 'Déconnecte un numéro supplémentaire',
    run: async ({ args, reply, config }) => {
      const n = (args[0] || '').replace(/\D/g, '');
      if (!n) return reply(`✏️ ${config.PREFIXE}deconnecter 242061234567`);
      if (n === 'principal' || n === config.NUMERO_BOT) return reply('🛡️ Le numéro principal ne se déconnecte pas ainsi (supprime le dossier auth).');
      await reply((await session.deconnecter(n)) ? `✅ +${n} est déconnecté et ses données de session sont effacées.` : 'ℹ️ Ce numéro n’est pas connecté.');
    },
  },
];
