// Kernel Bot — niveaux et classement des membres d'un groupe
const niveaux = require('../lib/niveaux');
const { numero } = require('../lib/utils');

const base = { categorie: 'Social', groupOnly: true };

module.exports = [
  {
    ...base,
    name: 'rank',
    desc: 'Ton niveau et ton expérience dans ce groupe',
    run: async ({ jid, sender, reply }) => {
      const m = niveaux.lire(jid, sender);
      const suivant = niveaux.xpPour(m.niveau + 1);
      await reply(`🏅 @${numero(sender)}\nNiveau : *${m.niveau}*\nExpérience : ${m.xp} / ${suivant}\nMessages : ${m.msgs}`);
    },
  },
  {
    ...base,
    name: 'toprank',
    desc: 'Classement des membres les plus actifs',
    run: async ({ sock, jid, reply }) => {
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
    run: async ({ sock, jid, sender, msg, reply, metadata }) => {
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
