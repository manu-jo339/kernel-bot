// Kernel Bot — téléchargements : musique, YouTube, TikTok, Facebook, Instagram, X/Twitter
// Utilise yt-dlp (voir « .ytdlp »). Les adresses sont vérifiées : seuls les sites publics sont acceptés.
const config = require('../config');
const ytdlp = require('../lib/ytdlp');
const web = require('../lib/web');
const { lireUrl } = require('../lib/reseau');
const { messageCite, extraireTexte, formatDuree } = require('../lib/utils');

const base = { categorie: 'Téléchargements' };
const enCours = new Set();

const minutes = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

// Récupère l'adresse ou la recherche : texte de la commande ou message cité
function entree(msg, args) {
  const cite = messageCite(msg);
  return (args.join(' ').trim() || (cite ? extraireTexte(cite.message) : '') || '').trim();
}

// Vérifie le domaine attendu pour une plateforme donnée
const domaineOk = (u, domaines) => domaines.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));

function commande({ nom, aliases = [], desc, audio = false, recherche = false, domaines = null, exemple }) {
  return {
    ...base,
    name: nom,
    aliases,
    desc,
    usage: `{P}${nom} ${exemple}`,
    run: async ({ sock, jid, msg, args, reply, senderNum }) => {
      const p = config.PREFIXE;
      let cible = entree(msg, args);
      if (!cible) return reply(`📥 ${p}${nom} ${exemple}`);
      if (/^https?:\/\//i.test(cible) || domaines) {
        const u = lireUrl((cible.match(/\S+/) || [''])[0]);
        if (!u) return reply(`❓ Ce n’est pas une adresse valide.\n${p}${nom} ${exemple}`);
        if (domaines && !domaineOk(u, domaines)) return reply(`❓ Ce lien ne vient pas de ${domaines[0].replace(/^www\./, '')}.\n${p}${nom} ${exemple}`);
        const { hotePublic } = require('../lib/reseau');
        if (!(await hotePublic(u.hostname))) return reply('⛔ Je télécharge seulement depuis des sites publics.');
        cible = u.href;
      } else if (!recherche) {
        return reply(`📥 ${p}${nom} ${exemple}`);
      }
      if (enCours.has(senderNum)) return reply('⏳ Un téléchargement est déjà en cours pour toi, patiente un instant.');
      if (!(await ytdlp.version())) return reply(`⚙️ Le programme de téléchargement (yt-dlp) n’est pas installé.\nLe propriétaire doit taper : *${p}ytdlp installer*`);
      enCours.add(senderNum);
      try {
        await reply(`⏬ ${recherche && !/^https?:\/\//i.test(cible) ? 'Recherche et téléchargement' : 'Téléchargement'} en cours…`);
        const r = await ytdlp.telecharger(cible, { audio });
        const legende = `${audio ? '🎵' : '🎬'} *${r.titre.slice(0, 120)}*${r.duree ? `\n⏱️ ${minutes(r.duree)}` : ''}`;
        if (audio) {
          await sock.sendMessage(jid, { audio: r.buffer, mimetype: 'audio/mpeg', fileName: r.nom + '.mp3' }, { quoted: msg });
          await sock.sendMessage(jid, { text: legende });
        } else {
          await sock.sendMessage(jid, { video: r.buffer, mimetype: 'video/mp4', caption: legende, fileName: r.nom + '.mp4' }, { quoted: msg });
        }
      } catch (e) {
        await reply('⚠️ ' + e.message.charAt(0).toUpperCase() + e.message.slice(1));
      } finally {
        enCours.delete(senderNum);
      }
    },
  };
}

module.exports = [
  commande({ nom: 'musique', aliases: ['song', 'play'], desc: 'Télécharge une chanson (titre ou lien YouTube) en MP3', audio: true, recherche: true, exemple: 'Fally Ipupa Eloko Oyo' }),
  commande({ nom: 'youtube', aliases: ['video', 'yt'], desc: 'Télécharge une vidéo YouTube (titre ou lien, 720p max)', recherche: true, exemple: 'recette du poulet moambé' }),
  commande({ nom: 'ytaudio', aliases: ['yta'], desc: 'MP3 d’un lien YouTube', audio: true, recherche: true, exemple: 'https://youtu.be/…' }),
  commande({ nom: 'ytvideo', aliases: ['ytv'], desc: 'Vidéo MP4 d’un lien YouTube', recherche: true, exemple: 'https://youtu.be/…' }),
  commande({ nom: 'facebook', aliases: ['fbdl', 'fb'], desc: 'Télécharge une vidéo Facebook publique', domaines: ['facebook.com', 'fb.watch', 'fb.com'], exemple: 'https://www.facebook.com/…' }),
  commande({ nom: 'tiktok', desc: 'Télécharge une vidéo TikTok', domaines: ['tiktok.com'], exemple: 'https://www.tiktok.com/@…' }),
  commande({ nom: 'tiktokaudio', desc: 'Le son d’une vidéo TikTok en MP3', audio: true, domaines: ['tiktok.com'], exemple: 'https://www.tiktok.com/@…' }),
  commande({ nom: 'instagram', aliases: ['igdl', 'insta'], desc: 'Télécharge une vidéo ou un reel Instagram public', domaines: ['instagram.com'], exemple: 'https://www.instagram.com/reel/…' }),
  commande({ nom: 'twitter', aliases: ['twitterdl', 'x'], desc: 'Télécharge une vidéo X (Twitter)', domaines: ['twitter.com', 'x.com'], exemple: 'https://x.com/…/status/…' }),
  {
    ...base,
    name: 'tiktokimage',
    aliases: ['tiktokphotos'],
    desc: 'Récupère les photos d’un diaporama TikTok',
    usage: '{P}tiktokimage https://www.tiktok.com/@…/photo/…',
    run: async ({ sock, jid, msg, args, reply, senderNum }) => {
      const u = lireUrl((entree(msg, args).match(/\S+/) || [''])[0]);
      if (!u || !domaineOk(u, ['tiktok.com'])) return reply(`📥 ${config.PREFIXE}tiktokimage https://www.tiktok.com/@…/photo/…`);
      if (enCours.has(senderNum)) return reply('⏳ Un téléchargement est déjà en cours pour toi.');
      enCours.add(senderNum);
      try {
        // Service tiers gratuit (tikwm.com) : seule l'adresse publique du post lui est envoyée
        const j = await web.json('https://www.tikwm.com/api/?url=' + encodeURIComponent(u.href));
        const images = j?.data?.images || [];
        if (!images.length) return reply('❓ Aucune photo trouvée (ce lien est peut-être une vidéo : utilise ' + config.PREFIXE + 'tiktok).');
        await reply(`🖼️ ${images.length} photo(s) trouvée(s), envoi…`);
        for (const url of images.slice(0, 10)) {
          const f = await web.fichier(url, { max: 10 * 1024 * 1024 });
          await sock.sendMessage(jid, { image: f.buffer });
        }
      } catch (e) {
        await reply('⚠️ Impossible de récupérer ces photos pour le moment.');
      } finally {
        enCours.delete(senderNum);
      }
    },
  },
  {
    categorie: 'Propriétaire',
    name: 'ytdlp',
    aliases: ['telechargeur'],
    desc: 'Installe ou met à jour le programme de téléchargement (yt-dlp)',
    usage: '{P}ytdlp · {P}ytdlp installer',
    ownerOnly: true,
    strict: true,
    run: async ({ args, reply }) => {
      const sous = (args[0] || '').toLowerCase();
      if (sous === 'installer' || sous === 'maj') {
        await reply('⏬ Téléchargement officiel de yt-dlp depuis GitHub, avec vérification de la somme SHA-256…');
        try {
          const v = await ytdlp.installer();
          return reply(`✅ yt-dlp installé${v ? ' (version ' + v + ')' : ''}. Les commandes de téléchargement sont prêtes.`);
        } catch (e) {
          return reply('⚠️ Installation impossible : ' + e.message + '\nTu peux aussi l’installer à la main : https://github.com/yt-dlp/yt-dlp/releases (mets yt-dlp.exe dans le dossier bin du bot).');
        }
      }
      const v = await ytdlp.version();
      await reply(v ? `✅ yt-dlp version ${v}\n${config.PREFIXE}ytdlp maj pour le mettre à jour (utile quand YouTube change).` : `❌ yt-dlp n’est pas installé.\nTape *${config.PREFIXE}ytdlp installer*`);
    },
  },
];
