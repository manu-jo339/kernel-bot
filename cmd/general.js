// Kernel Bot — commandes générales : menu, aide, état du bot, contacts
const os = require('os');
const reglages = require('../lib/reglages');
const menu = require('../lib/menu');
const { telecharger, messageMedia, formatDuree, dateLocale } = require('../lib/utils');

const base = { categorie: 'Général' };
const theme = () => reglages.lire().theme;
const avecImage = menu.avecImage;

function vcard(nom, n) {
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${nom}\nTEL;type=CELL;waid=${n}:+${n}\nEND:VCARD`;
}

module.exports = [
  {
    ...base,
    name: 'menu',
    aliases: ['help', 'commandes'],
    desc: 'Affiche les catégories de commandes',
    run: async ({ sock, jid, msg, reply, config, liste, args }) => {
      if (args[0]) {
        const t = menu.categorie(theme(), liste, args[0], sock.utilisateur);
        return reply(t || `❓ Catégorie « ${args[0]} » introuvable. Tape ${config.PREFIXE}menu pour voir la liste.`);
      }
      const texte = menu.accueil(theme(), liste, sock.utilisateur);
      const img = menu.THEMES[theme()]?.image ? menu.image() : null;
      if (!img) return reply(texte);
      // Image en tête avec l'encadré d'informations ; la liste des catégories suit dans un second message si la légende serait trop longue
      if (texte.length <= 1024) return void (await sock.sendMessage(jid, { image: img, caption: texte }, { quoted: msg }));
      const coupe = texte.indexOf('\n\n');
      await sock.sendMessage(jid, { image: img, caption: texte.slice(0, coupe) }, { quoted: msg });
      await reply(texte.slice(coupe + 2));
    },
  },
  {
    ...base,
    name: 'allmenu',
    desc: 'Affiche toutes les commandes',
    run: async ({ sock, reply, liste }) => reply(menu.tout(theme(), liste, sock.utilisateur)),
  },
  {
    ...base,
    name: 'description',
    desc: 'Explique une commande : aide <commande>',
    run: async ({ sock, reply, config, liste, args }) => {
      const n = (args[0] || '').toLowerCase().replace(config.PREFIXE, '');
      if (!n) return reply(menu.accueil(theme(), liste, sock.utilisateur));
      const c = liste.find((x) => x.name === n || x.aliases.includes(n));
      if (!c) return reply(`❓ Commande « ${n} » introuvable.`);
      const restr = [c.ownerOnly && 'propriétaire', c.groupOnly && 'groupe seulement', c.adminOnly && 'admins du groupe'].filter(Boolean);
      await reply(
        `📖 *${config.PREFIXE}${c.name}*\n${c.desc || 'Pas de description.'}\n` +
          (c.aliases.length ? `\n🔁 Autres noms : ${c.aliases.map((a) => config.PREFIXE + a).join(', ')}` : '') +
          `\n📂 Catégorie : ${c.categorie}` +
          (restr.length ? `\n🔒 Réservé : ${restr.join(', ')}` : '') +
          (c.usage ? `\n\n💡 ${c.usage.replace(/\{P\}/g, config.PREFIXE)}` : '')
      );
    },
  },
  {
    ...base,
    name: 'theme',
    desc: 'Change l’apparence du menu',
    ownerOnly: true,
    run: async ({ args, reply, config }) => {
      const choix = (args[0] || '').toLowerCase();
      if (menu.THEMES[choix]) {
        reglages.ecrire({ theme: choix });
        return reply(`🎨 Thème « ${menu.THEMES[choix].nom} » activé. Tape ${config.PREFIXE}menu pour le voir.`);
      }
      await reply(
        `🎨 *Thèmes du menu* (actuel : ${menu.THEMES[theme()]?.nom || 'Classique'})\n` +
          Object.entries(menu.THEMES).map(([k, v]) => `• ${config.PREFIXE}theme ${k} — ${v.nom}`).join('\n')
      );
    },
  },
  {
    ...base,
    name: 'test',
    desc: 'Vérifie que le bot répond',
    run: async ({ reply, config }) => reply(`✅ ${config.NOM_BOT} fonctionne. Tape ${config.PREFIXE}menu pour voir les commandes.`),
  },
  {
    ...base,
    name: 'ping',
    desc: 'Mesure la vitesse de réponse',
    run: async ({ sock, jid, msg }) => {
      const debut = Date.now();
      const m = await sock.sendMessage(jid, { text: '🏓 Pong…' }, { quoted: msg });
      await sock.sendMessage(jid, { text: `🏓 Pong ! ${Date.now() - debut} ms`, edit: m.key });
    },
  },
  {
    ...base,
    name: 'uptime',
    desc: 'Depuis combien de temps le bot est en marche',
    run: async (ctx) => avecImage(ctx, `⏱️ En marche depuis : ${formatDuree(process.uptime() * 1000)}`),
  },
  {
    ...base,
    name: 'system_status',
    desc: 'État de la machine qui fait tourner le bot',
    run: async (ctx) => {
      const { config } = ctx;
      const mo = (n) => (n / 1048576).toFixed(0);
      const total = os.totalmem(), libre = os.freemem();
      const proc = process.memoryUsage();
      await avecImage(ctx,
        `🖥️ *État de ${config.NOM_BOT}*\n` +
          `⏱️ En marche : ${formatDuree(process.uptime() * 1000)}\n` +
          `🧠 Mémoire du bot : ${mo(proc.rss)} Mo\n` +
          `💾 Mémoire machine : ${mo(total - libre)} / ${mo(total)} Mo\n` +
          `⚙️ Processeur : ${os.cpus().length} cœur(s), charge ${os.loadavg()[0].toFixed(2)}\n` +
          `🟢 Node.js ${process.version} sur ${os.platform()}\n` +
          `🕐 ${dateLocale()}`
      );
    },
  },
  {
    ...base,
    name: 'info',
    desc: 'Informations sur le bot',
    run: async (ctx) =>
      avecImage(ctx, `🤖 *${ctx.config.NOM_BOT}*\n📚 ${ctx.liste.length} commandes\n⏱️ En marche : ${formatDuree(process.uptime() * 1000)}\n⚙️ Mode : ${ctx.config.MODE}\n🛠️ ${ctx.config.SIGNATURE}`),
  },
  {
    ...base,
    name: 'bienvenuebot',
    desc: 'Réaffiche le message de bienvenue du bot',
    run: async (ctx) => avecImage(ctx, require('../lib/bienvenue').texte(ctx.liste.length, theme(), ctx.sock.utilisateur)),
  },
  {
    ...base,
    name: 'chaine',
    desc: 'Chaîne WhatsApp d’assistance (« chaine suivre » pour la suivre)',
    usage: 'chaine [suivre]',
    run: async (ctx) => {
      const { sock, args, reply, config } = ctx;
      const bienvenue = require('../lib/bienvenue');
      if (!config.CHAINE_URL) return reply('ℹ️ Aucune chaîne n’est configurée pour le moment.');
      if ((args[0] || '').toLowerCase() !== 'suivre')
        return avecImage(ctx, `📢 *Chaîne d’assistance ${config.NOM_BOT}*\n${config.CHAINE_URL}\n\nTape ${config.PREFIXE}chaine suivre pour la suivre depuis ce numéro.`);
      const code = bienvenue.codeChaine(config.CHAINE_URL);
      if (!code) return reply('⚠️ Le lien de la chaîne n’est pas valide.');
      try {
        const meta = await sock.newsletterMetadata('invite', code);
        await sock.newsletterFollow(meta.id);
        await reply('✅ Tu suis maintenant la chaîne. Merci !');
      } catch (e) {
        await reply('⚠️ Impossible de suivre la chaîne pour le moment. Ouvre le lien ci-dessus et appuie sur « Suivre ».');
      }
    },
  },
  {
    ...base,
    name: 'owner',
    desc: 'Contact du propriétaire du bot',
    run: async ({ sock, jid, msg, config, reply }) => {
      if (!config.OWNERS.length) return reply('ℹ️ Aucun propriétaire n’est défini.');
      const contacts = config.OWNERS.map((n) => ({ vcard: vcard(config.CREATEUR.nom || 'Propriétaire', n) }));
      await sock.sendMessage(jid, { contacts: { displayName: 'Propriétaire', contacts } }, { quoted: msg });
    },
  },
  {
    ...base,
    name: 'developpeur',
    desc: 'Contact du créateur du bot',
    run: async (ctx) => {
      const { sock, jid, msg, config, reply } = ctx;
      const n = config.CREATEUR.numero || config.OWNERS[0];
      if (!n) return reply('ℹ️ Le contact du créateur n’est pas renseigné.');
      const c = config.CREATEUR;
      await avecImage(ctx,
        `👨‍💻 *Développeur de ${config.NOM_BOT}*\n\n` +
          `👤 Nom : ${c.nom}\n📞 Numéro : +${n}\n` +
          (c.pays ? `🌍 Pays : ${c.pays}\n` : '') +
          (c.organisation ? `🏢 Organisation : ${c.organisation}\n` : '') +
          `\n💬 wa.me/${n}`);
      await sock.sendMessage(jid, { contacts: { displayName: config.CREATEUR.nom, contacts: [{ vcard: vcard(config.CREATEUR.nom, n) }] } }, { quoted: msg });
    },
  },
  {
    ...base,
    name: 'vv',
    desc: 'Récupère une photo/vidéo « vue unique » (réponds au message)',
    ownerOnly: true,
    run: async ({ sock, jid, msg, reply }) => {
      const cible = messageMedia(msg);
      if (!cible) return reply('✏️ Réponds à une image, une vidéo ou un vocal en vue unique.');
      const f = await telecharger(sock, msg);
      const legende = '👁️ Vue unique récupérée';
      if (f.type === 'image') await sock.sendMessage(jid, { image: f.buffer, caption: legende }, { quoted: msg });
      else if (f.type === 'video') await sock.sendMessage(jid, { video: f.buffer, caption: legende }, { quoted: msg });
      else if (f.type === 'audio') await sock.sendMessage(jid, { audio: f.buffer, mimetype: f.mime || 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
      else await reply('⚠️ Ce n’est pas un média en vue unique.');
    },
  },
  {
    ...base,
    name: 'vv2',
    desc: 'Envoie la vue unique en privé au propriétaire',
    ownerOnly: true,
    run: async ({ sock, msg, reply, config }) => {
      if (!messageMedia(msg)) return reply('✏️ Réponds à une image, une vidéo ou un vocal en vue unique.');
      const f = await telecharger(sock, msg);
      const moi = (config.OWNERS[0] || sock.user.id.split(':')[0].split('@')[0]) + '@s.whatsapp.net';
      const legende = '👁️ Vue unique récupérée';
      if (f.type === 'image') await sock.sendMessage(moi, { image: f.buffer, caption: legende });
      else if (f.type === 'video') await sock.sendMessage(moi, { video: f.buffer, caption: legende });
      else if (f.type === 'audio') await sock.sendMessage(moi, { audio: f.buffer, mimetype: f.mime || 'audio/ogg; codecs=opus', ptt: true });
      await reply('✅ Envoyé au propriétaire en privé.');
    },
  },
];
