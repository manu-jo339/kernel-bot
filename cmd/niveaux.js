// Kernel Bot — niveaux et classement des membres d'un groupe
const niveaux = require('../lib/niveaux');
const groupes = require('../lib/groupes');
const { numero } = require('../lib/utils');

const base = { categorie: 'Social', groupOnly: true };
const OUI = ['on', 'oui', 'activer', 'active', '1', 'true'];
const NON = ['off', 'non', 'desactiver', 'désactiver', 'desactive', '0', 'false'];

// Les niveaux sont DÉSACTIVÉS par défaut dans chaque groupe : un admin les active avec « niveau on » (réglage propre à ce groupe)
const actifIci = (jid) => !!groupes.sous(jid, 'niveaux').actif;
const desactives = (config) => `ℹ️ Les niveaux sont désactivés dans ce groupe. Un admin peut les activer avec *${config.PREFIXE}niveau on*.`;

module.exports = [
  {
    ...base,
    adminOnly: true,
    name: 'niveau',
    desc: 'Active ou coupe les niveaux et l’expérience dans ce groupe (désactivés par défaut)',
    run: async ({ jid, args, reply, config }) => {
      const p = config.PREFIXE;
      const a = (args[0] || '').toLowerCase();
      if (OUI.includes(a)) {
        groupes.majSous(jid, 'niveaux', { actif: true });
        return reply(`✅ *niveau* activé dans ce groupe. Les membres gagnent de l’expérience en discutant : ${p}rang, ${p}classement, ${p}profil.`);
      }
      if (NON.includes(a)) {
        groupes.majSous(jid, 'niveaux', { actif: false });
        return reply('❌ *niveau* désactivé dans ce groupe. Plus d’expérience comptée ni de message de passage de niveau (l’expérience déjà gagnée est gardée).');
      }
      await reply(`⚙️ *niveau* dans ce groupe : ${actifIci(jid) ? '✅ activé' : '❌ désactivé'}\n\n${p}niveau on / off\n_Réservé aux admins du groupe. Désactivé par défaut._`);
    },
  },
  {
    ...base,
    name: 'rank',
    desc: 'Ton niveau et ton expérience dans ce groupe',
    run: async ({ jid, sender, reply, config }) => {
      if (!actifIci(jid)) return reply(desactives(config));
      const m = niveaux.lire(jid, sender);
      const suivant = niveaux.xpPour(m.niveau + 1);
      await reply(`🏅 @${numero(sender)}\nNiveau : *${m.niveau}*\nExpérience : ${m.xp} / ${suivant}\nMessages : ${m.msgs}`);
    },
  },
  {
    ...base,
    name: 'toprank',
    desc: 'Classement des membres les plus actifs',
    run: async ({ sock, jid, reply, config }) => {
      if (!actifIci(jid)) return reply(desactives(config));
      const top = niveaux.classement(jid, 10);
      if (!top.length) return reply('ℹ️ Personne n’a encore gagné d’expérience ici. Discutez !');
      const medailles = ['🥇', '🥈', '🥉'];
      const jids = top.map((x) => x.j || x.numero + '@s.whatsapp.net');
      await sock.sendMessage(jid, {
        text: `🏆 *Classement du groupe*\n\n` + top.map((x, i) => `${medailles[i] || i + 1 + '.'} @${numero(x.j || x.numero)} — niv. ${x.niveau} (${x.xp} XP)`).join('\n'),
        mentions: jids,
      });
    },
  },
  {
    ...base,
    name: 'profile',
    desc: 'Ta carte de profil dans ce groupe',
    run: async ({ sock, jid, sender, msg, reply, metadata, config }) => {
      if (!actifIci(jid)) return reply(desactives(config));
      const m = niveaux.lire(jid, sender);
      const rang = niveaux.classement(jid, 1000).findIndex((x) => x.numero === numero(sender)) + 1;
      let photo = null;
      try {
        photo = await sock.profilePictureUrl(sender, 'image');
      } catch {}
      const texte = `👤 *Profil de @${numero(sender)}*\n🏅 Niveau ${m.niveau} · ${m.xp} XP\n💬 ${m.msgs} messages\n🏆 Rang : ${rang || '—'}`;
      if (photo) await sock.sendMessage(jid, { image: { url: photo }, caption: texte, mentions: [sender] }, { quoted: msg });
      else await reply(texte);
    },
  },
];
