// Commandes de groupe — MWENOBANGUE Labs
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { numero, pause, messageCite, cibles, numeroDe } = require('../lib/utils');

const estAdmin = (p) => p.admin === 'admin' || p.admin === 'superadmin';
const mention = (jid) => `@${numero(jid)}`;
const base = { categorie: 'Groupe', groupOnly: true };

// Membres que le bot ne doit jamais exclure : admins, le bot lui-même, les propriétaires
function exclusPossibles(metadata, sock, config) {
  const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero);
  return metadata.participants.filter(
    (p) =>
      !estAdmin(p) &&
      ![p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).some((x) => moi.includes(numero(x))) &&
      !(numeroDe(p) && config.OWNERS.includes(numeroDe(p)))
  );
}

async function retirerParLots(sock, jid, ids) {
  let ok = 0;
  for (let i = 0; i < ids.length; i += 5) {
    const lot = ids.slice(i, i + 5);
    try {
      await sock.groupParticipantsUpdate(jid, lot, 'remove');
      ok += lot.length;
    } catch (e) {
      console.error('[kick] lot refusé :', e.message);
    }
    await pause(1500);
  }
  return ok;
}

module.exports = [
  // ───────────── Mentions ─────────────
  {
    ...base,
    name: 'tagall',
    aliases: ['tous'],
    desc: 'Mentionne tous les membres',
    adminOnly: true,
    run: async ({ sock, jid, args, metadata, reply }) => {
      if (!metadata) return reply('⚠️ Impossible de lire les membres du groupe.');
      const membres = metadata.participants.map((p) => p.id);
      const message = args.join(' ') || 'Annonce';
      const liste = membres.map((m) => `• ${mention(m)}`).join('\n');
      await sock.sendMessage(jid, { text: `📣 *${message}*\n\n${liste}`, mentions: membres });
    },
  },
  {
    ...base,
    name: 'tagadmin',
    aliases: ['admins'],
    desc: 'Mentionne tous les administrateurs',
    run: async ({ sock, jid, args, metadata, reply }) => {
      if (!metadata) return reply('⚠️ Impossible de lire les membres du groupe.');
      const admins = metadata.participants.filter(estAdmin).map((p) => p.id);
      const message = args.join(' ') || 'Appel aux administrateurs';
      const liste = admins.map((m) => `• ${mention(m)}`).join('\n');
      await sock.sendMessage(jid, { text: `🛡️ *${message}*\n\n${liste}`, mentions: admins });
    },
  },
  {
    ...base,
    name: 'tag',
    aliases: ['htag', 'hidetag'],
    desc: 'Envoie un message en notifiant tout le monde (sans liste)',
    adminOnly: true,
    run: async ({ sock, jid, args, metadata, msg, reply }) => {
      if (!metadata) return reply('⚠️ Impossible de lire les membres du groupe.');
      const membres = metadata.participants.map((p) => p.id);
      const cite = messageCite(msg);
      const texte = args.join(' ') || cite?.message?.conversation || cite?.message?.extendedTextMessage?.text;
      if (!texte) return reply('✏️ Écris un message : `.tag ton message` (ou réponds à un message).');
      await sock.sendMessage(jid, { text: texte, mentions: membres });
    },
  },

  // ───────────── Sondages ─────────────
  {
    ...base,
    name: 'poll',
    desc: 'Sondage à choix multiples — .poll Question | choix 1 | choix 2',
    adminOnly: true,
    run: async ({ sock, jid, texte, config, reply }) => {
      const parts = texte.slice(config.PREFIXE.length).replace(/^\S+\s*/, '').split('|').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 3) return reply('📊 Format : `.poll Question | choix 1 | choix 2 | …`');
      const [question, ...choix] = parts;
      await sock.sendMessage(jid, { poll: { name: question, values: choix.slice(0, 12), selectableCount: choix.length } });
    },
  },
  {
    ...base,
    name: 'poll2',
    desc: 'Sondage à vote unique — .poll2 Question | choix 1 | choix 2',
    adminOnly: true,
    run: async ({ sock, jid, texte, config, reply }) => {
      const parts = texte.slice(config.PREFIXE.length).replace(/^\S+\s*/, '').split('|').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 3) return reply('📊 Format : `.poll2 Question | choix 1 | choix 2 | …`');
      const [question, ...choix] = parts;
      await sock.sendMessage(jid, { poll: { name: question, values: choix.slice(0, 12), selectableCount: 1 } });
    },
  },

  // ───────────── Gestion des membres ─────────────
  {
    ...base,
    name: 'kick',
    aliases: ['exclure'],
    desc: 'Exclut un membre (mention, réponse ou numéro)',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, args, metadata, reply, config }) => {
      const cs = cibles(msg, args, metadata);
      if (!cs.length) return reply('👤 Mentionne un membre, réponds à son message ou écris son numéro.');
      const protege = metadata.participants.filter((p) => estAdmin(p)).map((p) => p.id);
      const aRetirer = cs.filter((c) => !protege.includes(c));
      if (!aRetirer.length) return reply('🛡️ Impossible d’exclure un administrateur.');
      await sock.groupParticipantsUpdate(jid, aRetirer, 'remove');
      await reply(`✅ ${aRetirer.length} membre(s) exclu(s).`);
    },
  },
  {
    ...base,
    name: 'kickall',
    desc: 'Exclut tous les non-admins — à confirmer avec : .kickall oui',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, metadata, reply, config }) => {
      const cibles_ = exclusPossibles(metadata, sock, config);
      if (args[0]?.toLowerCase() !== 'oui')
        return reply(`⚠️ Cette commande exclura *${cibles_.length}* membres (tous sauf les admins).\nPour confirmer : \`${config.PREFIXE}kickall oui\``);
      await reply(`⏳ Exclusion de ${cibles_.length} membres en cours…`);
      const ok = await retirerParLots(sock, jid, cibles_.map((p) => p.id));
      await reply(`✅ ${ok} membre(s) exclu(s).`);
    },
  },
  {
    ...base,
    name: 'ckick',
    desc: 'Exclut les membres d’un indicatif — .ckick 242 oui',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, metadata, reply, config }) => {
      const indicatif = (args[0] || '').replace(/\D/g, '');
      if (!indicatif) return reply(`🌍 Format : \`${config.PREFIXE}ckick 242\` (indicatif du pays), puis ajoute \`oui\` pour confirmer.`);
      const visees = exclusPossibles(metadata, sock, config).filter((p) => (numeroDe(p) || '').startsWith(indicatif));
      if (args[1]?.toLowerCase() !== 'oui')
        return reply(`⚠️ ${visees.length} membre(s) avec l’indicatif +${indicatif} seraient exclus.\nPour confirmer : \`${config.PREFIXE}ckick ${indicatif} oui\``);
      const ok = await retirerParLots(sock, jid, visees.map((p) => p.id));
      await reply(`✅ ${ok} membre(s) exclu(s).`);
    },
  },
  {
    ...base,
    name: 'promote',
    aliases: ['promouvoir'],
    desc: 'Nomme un membre administrateur',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, args, metadata, reply }) => {
      const cs = cibles(msg, args, metadata);
      if (!cs.length) return reply('👤 Mentionne un membre, réponds à son message ou écris son numéro.');
      await sock.groupParticipantsUpdate(jid, cs, 'promote');
      await reply('✅ Promotion effectuée.');
    },
  },
  {
    ...base,
    name: 'demote',
    aliases: ['retrograder'],
    desc: 'Retire le rôle d’administrateur',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, args, metadata, reply }) => {
      const cs = cibles(msg, args, metadata);
      if (!cs.length) return reply('👤 Mentionne un membre, réponds à son message ou écris son numéro.');
      await sock.groupParticipantsUpdate(jid, cs, 'demote');
      await reply('✅ Rôle d’administrateur retiré.');
    },
  },

  // ───────────── Réglages du groupe ─────────────
  {
    ...base,
    name: 'gname',
    desc: 'Change le nom du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, reply }) => {
      const nom = args.join(' ').trim();
      if (!nom) return reply('✏️ Format : `.gname Nouveau nom`');
      await sock.groupUpdateSubject(jid, nom);
      await reply('✅ Nom du groupe modifié.');
    },
  },
  {
    ...base,
    name: 'gdesc',
    desc: 'Change la description du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, reply }) => {
      const d = args.join(' ').trim();
      if (!d) return reply('✏️ Format : `.gdesc Nouvelle description`');
      await sock.groupUpdateDescription(jid, d);
      await reply('✅ Description modifiée.');
    },
  },
  {
    ...base,
    name: 'close',
    aliases: ['fermer'],
    desc: 'Seuls les admins peuvent écrire',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'announcement');
      await reply('🔒 Groupe fermé : seuls les admins peuvent écrire.');
    },
  },
  {
    ...base,
    name: 'open',
    aliases: ['ouvrir'],
    desc: 'Tout le monde peut écrire',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await reply('🔓 Groupe ouvert : tout le monde peut écrire.');
    },
  },
  {
    ...base,
    name: 'lock',
    desc: 'Seuls les admins modifient les infos du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'locked');
      await reply('🔒 Les paramètres du groupe sont réservés aux admins.');
    },
  },
  {
    ...base,
    name: 'unlock',
    desc: 'Tout le monde modifie les infos du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'unlocked');
      await reply('🔓 Tous les membres peuvent modifier les paramètres du groupe.');
    },
  },

  // ───────────── Liens et informations ─────────────
  {
    ...base,
    name: 'link',
    aliases: ['lien'],
    desc: 'Donne le lien d’invitation du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      const code = await sock.groupInviteCode(jid);
      await reply(`🔗 https://chat.whatsapp.com/${code}`);
    },
  },
  {
    ...base,
    name: 'revoke',
    desc: 'Réinitialise le lien d’invitation',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupRevokeInvite(jid);
      await reply('♻️ Lien d’invitation réinitialisé.');
    },
  },
  {
    ...base,
    name: 'ginfo',
    aliases: ['infogroupe', 'gcinfo'],
    desc: 'Informations sur le groupe',
    run: async ({ reply, metadata }) => {
      if (!metadata) return reply('⚠️ Informations indisponibles.');
      const admins = metadata.participants.filter(estAdmin).length;
      const creation = metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString('fr-FR') : '—';
      await reply(
        `👥 *${metadata.subject}*\n` +
          `🆔 ${metadata.id}\n` +
          `Membres : ${metadata.participants.length}\n` +
          `Admins : ${admins}\n` +
          `Créé le : ${creation}\n` +
          `Description : ${metadata.desc || '—'}`
      );
    },
  },
  {
    ...base,
    name: 'vcf',
    desc: 'Exporte les contacts du groupe en fichier VCF',
    adminOnly: true,
    run: async ({ sock, jid, metadata, reply }) => {
      const lignes = [];
      for (const p of metadata.participants) {
        const n = numeroDe(p);
        if (!n) continue;
        lignes.push(`BEGIN:VCARD\nVERSION:3.0\nFN:${metadata.subject} +${n}\nTEL;type=CELL;waid=${n}:+${n}\nEND:VCARD`);
      }
      if (!lignes.length) return reply('⚠️ Aucun numéro lisible dans ce groupe (WhatsApp masque certains numéros).');
      await sock.sendMessage(jid, {
        document: Buffer.from(lignes.join('\n'), 'utf8'),
        mimetype: 'text/vcard',
        fileName: `${metadata.subject.replace(/[^\w-]+/g, '_')}.vcf`,
        caption: `📇 ${lignes.length} contact(s) exporté(s).`,
      });
    },
  },

  // ───────────── Photo du groupe ─────────────
  {
    ...base,
    name: 'getpp',
    aliases: ['gpp'],
    desc: 'Affiche la photo du groupe',
    run: async ({ sock, jid, msg, reply }) => {
      try {
        const url = await sock.profilePictureUrl(jid, 'image');
        await sock.sendMessage(jid, { image: { url }, caption: '🖼️ Photo du groupe' }, { quoted: msg });
      } catch {
        await reply('⚠️ Ce groupe n’a pas de photo (ou elle est privée).');
      }
    },
  },
  {
    ...base,
    name: 'updatepp',
    aliases: ['upp'],
    desc: 'Change la photo du groupe (réponds à une image)',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, reply }) => {
      const cite = messageCite(msg);
      if (!cite?.message?.imageMessage) return reply('🖼️ Réponds à une image avec `.updatepp`.');
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: cite.stanzaId, participant: cite.participant }, message: cite.message },
        'buffer',
        {}
      );
      await sock.updateProfilePicture(jid, buffer);
      await reply('✅ Photo du groupe mise à jour.');
    },
  },
  {
    ...base,
    name: 'removepp',
    aliases: ['rpp'],
    desc: 'Supprime la photo du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.removeProfilePicture(jid);
      await reply('✅ Photo du groupe supprimée.');
    },
  },

  // ───────────── Demandes d'adhésion ─────────────
  {
    ...base,
    name: 'acceptall',
    desc: 'Accepte toutes les demandes d’adhésion',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      const demandes = await sock.groupRequestParticipantsList(jid);
      if (!demandes.length) return reply('📭 Aucune demande en attente.');
      await sock.groupRequestParticipantsUpdate(jid, demandes.map((d) => d.jid), 'approve');
      await reply(`✅ ${demandes.length} demande(s) acceptée(s).`);
    },
  },
  {
    ...base,
    name: 'rejectall',
    desc: 'Refuse toutes les demandes d’adhésion',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      const demandes = await sock.groupRequestParticipantsList(jid);
      if (!demandes.length) return reply('📭 Aucune demande en attente.');
      await sock.groupRequestParticipantsUpdate(jid, demandes.map((d) => d.jid), 'reject');
      await reply(`✅ ${demandes.length} demande(s) refusée(s).`);
    },
  },

  // ───────────── Commandes du propriétaire ─────────────
  {
    categorie: 'Groupe',
    name: 'gcreate',
    desc: 'Crée un groupe — .gcreate Nom du groupe',
    ownerOnly: true,
    run: async ({ sock, args, reply }) => {
      const nom = args.join(' ').trim();
      if (!nom) return reply('✏️ Format : `.gcreate Nom du groupe`');
      const g = await sock.groupCreate(nom, []);
      await reply(`✅ Groupe « ${g.subject} » créé.`);
    },
  },
  {
    categorie: 'Groupe',
    name: 'join',
    desc: 'Rejoint un groupe via un lien d’invitation',
    ownerOnly: true,
    run: async ({ sock, args, reply }) => {
      const m = (args[0] || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
      if (!m) return reply('🔗 Format : `.join https://chat.whatsapp.com/xxxxx`');
      await sock.groupAcceptInvite(m[1]);
      await reply('✅ Groupe rejoint.');
    },
  },
  {
    ...base,
    name: 'leave',
    aliases: ['quitter'],
    desc: 'Le bot quitte le groupe',
    ownerOnly: true,
    run: async ({ sock, jid, reply }) => {
      await reply('👋 Au revoir !');
      await sock.groupLeave(jid);
    },
  },
];
