// Kernel Bot — recherches et informations : images, web, Wikipédia, GitHub, films, météo, anime, paroles, applications…
// Tous les services utilisés sont gratuits et sans clé (sauf indication). Rien n'est envoyé d'autre que la recherche demandée.
const config = require('../config');
const partage = require('../lib/partage');
const web = require('../lib/web');
const sticker = require('../lib/sticker');
const media = require('../lib/media');
const reseau = require('../lib/reseau');
const { lireUrl } = reseau;
const { messageCite, extraireTexte, numero } = require('../lib/utils');
const utils = require('../lib/utils');
const { recuperer, erreurMedia } = require('../lib/recup');
const store = require('../lib/store');

const base = { categorie: 'Recherche' };
const enc = encodeURIComponent;
const P = () => config.PREFIXE;

// Texte de la commande, ou du message cité
function requete(msg, args) {
  const cite = messageCite(msg);
  return (args.join(' ').trim() || (cite ? extraireTexte(cite.message) : '')).trim();
}
const nettoyerHtml = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const coupe = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1).trimEnd() + '…' : String(t));
const indisponible = (reply) => reply('⚠️ Le service est indisponible pour le moment, réessaie dans quelques minutes.');

// ───────────── Météo ─────────────
const WMO = { 0: ['☀️', 'Ciel dégagé'], 1: ['🌤️', 'Plutôt dégagé'], 2: ['⛅', 'Partiellement nuageux'], 3: ['☁️', 'Couvert'], 45: ['🌫️', 'Brouillard'], 48: ['🌫️', 'Brouillard givrant'], 51: ['🌦️', 'Bruine légère'], 53: ['🌦️', 'Bruine'], 55: ['🌦️', 'Bruine dense'], 56: ['🌧️', 'Bruine verglaçante'], 57: ['🌧️', 'Bruine verglaçante'], 61: ['🌧️', 'Pluie faible'], 63: ['🌧️', 'Pluie modérée'], 65: ['🌧️', 'Forte pluie'], 66: ['🌧️', 'Pluie verglaçante'], 67: ['🌧️', 'Pluie verglaçante'], 71: ['🌨️', 'Neige faible'], 73: ['🌨️', 'Neige'], 75: ['❄️', 'Forte neige'], 77: ['❄️', 'Grains de neige'], 80: ['🌦️', 'Averses faibles'], 81: ['🌧️', 'Averses'], 82: ['⛈️', 'Fortes averses'], 85: ['🌨️', 'Averses de neige'], 86: ['❄️', 'Fortes averses de neige'], 95: ['⛈️', 'Orage'], 96: ['⛈️', 'Orage avec grêle'], 99: ['⛈️', 'Orage violent avec grêle'] };
const wmo = (c) => WMO[c] || ['🌡️', 'Conditions variables'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// ───────────── Blagues (propres, pour tous) ─────────────
const BLAGUES = [
  ['Pourquoi les plongeurs plongent-ils toujours en arrière ?', 'Parce que sinon ils tombent dans le bateau !'],
  ['Que fait une fraise sur un cheval ?', 'Tagada, tagada !'],
  ['Pourquoi le livre de maths est-il triste ?', 'Parce qu’il a trop de problèmes.'],
  ['Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ?', 'Un chat-peint de Noël !'],
  ['Quel est le comble pour un électricien ?', 'De ne pas être au courant.'],
  ['Pourquoi les poissons détestent-ils l’ordinateur ?', 'Parce qu’ils ont peur du net !'],
  ['Que dit un escargot quand il croise une limace ?', '« Regarde, un nudiste ! »'],
  ['Quel est le comble pour un jardinier ?', 'De raconter des salades.'],
  ['Pourquoi les lézards aiment-ils les murs ?', 'Parce qu’ils sont lézardés !'],
  ['Qu’est-ce qui est jaune et qui attend ?', 'Jonathan.'],
  ['Quel est le comble pour un boulanger ?', 'De se faire rouler dans la farine.'],
  ['Que dit le 0 au 8 ?', '« Sympa, ta ceinture ! »'],
  ['Quel est le sport préféré des insectes ?', 'Le cricket !'],
  ['Pourquoi le téléphone est-il allé chez le médecin ?', 'Parce qu’il n’avait plus de réseau !'],
  ['Que dit un fromager quand il se fait mal ?', '« Aïe, ça fait un brie de mal ! »'],
  ['Comment appelle-t-on un boomerang qui ne revient pas ?', 'Un bâton.'],
  ['Pourquoi les mathématiciens aiment-ils les forêts ?', 'Parce qu’il y a plein de racines.'],
  ['Que dit un oignon quand il se fait écraser ?', '« Arrête, tu me fais pleurer ! »'],
  ['Quel est le comble pour un cordonnier ?', 'D’être mal chaussé.'],
  ['Pourquoi les informaticiens confondent-ils Halloween et Noël ?', 'Parce que Oct 31 = Dec 25.'],
  ['Pourquoi le vélo ne tient-il pas debout tout seul ?', 'Parce qu’il est deux-pneus.'],
  ['Que dit un mur à un autre mur ?', '« On se retrouve au coin ! »'],
  ['Pourquoi les astronautes ne se disputent-ils jamais ?', 'Parce qu’ils préfèrent garder leur espace.'],
  ['Pourquoi les oiseaux volent-ils vers le sud en hiver ?', 'Parce que c’est trop loin pour y aller à pied.'],
];

const QUOTES = [
  ['La persévérance est la mère de la réussite.', 'Proverbe'],
  ['Le succès, c’est d’aller d’échec en échec sans perdre son enthousiasme.', 'Winston Churchill'],
  ['Ce n’est pas parce que les choses sont difficiles que nous n’osons pas, c’est parce que nous n’osons pas qu’elles sont difficiles.', 'Sénèque'],
  ['On ne voit bien qu’avec le cœur. L’essentiel est invisible pour les yeux.', 'Antoine de Saint-Exupéry'],
  ['Le meilleur moment pour planter un arbre était il y a vingt ans. Le deuxième meilleur moment, c’est maintenant.', 'Proverbe'],
  ['Celui qui déplace la montagne, c’est celui qui commence par déplacer les petites pierres.', 'Confucius'],
  ['Il n’y a qu’une façon d’échouer, c’est d’abandonner avant d’avoir réussi.', 'Georges Clemenceau'],
  ['La vie est un mystère qu’il faut vivre, et non un problème à résoudre.', 'Gandhi'],
  ['Si tu veux aller vite, marche seul ; si tu veux aller loin, marchons ensemble.', 'Proverbe africain'],
  ['Les rêves ne meurent jamais, ce sont les rêveurs qui abandonnent.', 'Proverbe'],
  ['L’éducation est l’arme la plus puissante qu’on puisse utiliser pour changer le monde.', 'Nelson Mandela'],
  ['Le génie, c’est 1 % d’inspiration et 99 % de transpiration.', 'Thomas Edison'],
  ['Tout ce que l’on peut imaginer est réel.', 'Pablo Picasso'],
  ['Fais de ta vie un rêve, et d’un rêve, une réalité.', 'Antoine de Saint-Exupéry'],
  ['Quand on veut, on peut ; quand on peut, on doit.', 'Proverbe'],
  ['Le courage n’est pas l’absence de peur, mais la capacité de la vaincre.', 'Nelson Mandela'],
  ['Un voyage de mille lieues commence toujours par un premier pas.', 'Lao Tseu'],
  ['La seule façon de faire du bon travail est d’aimer ce que vous faites.', 'Steve Jobs'],
  ['Chaque jour est une nouvelle chance de changer ta vie.', 'Proverbe'],
  ['Le savoir est la seule richesse qu’on ne peut pas te voler.', 'Proverbe'],
];
const alea = (l) => l[require('crypto').randomInt(l.length)];

// Petit utilitaire : découpe en grapheme (emojis)
const graphemes = (t) => (Intl.Segmenter ? [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(t)].map((x) => x.segment) : [...t]);

module.exports = [
  {
    ...base,
    name: 'meteo',
    aliases: ['weather', 'temps'],
    desc: 'Météo actuelle et prévisions sur 3 jours : .meteo Pointe-Noire',
    run: async ({ args, reply }) => {
      const ville = args.join(' ').trim() || 'Brazzaville';
      try {
        const g = await web.json(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(ville)}&count=1&language=fr&format=json`);
        const lieu = g.results?.[0];
        if (!lieu) return reply(`❓ Ville « ${ville} » introuvable.`);
        const m = await web.json(`https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`);
        const c = m.current, d = m.daily;
        const [emo, txt] = wmo(c.weather_code);
        const jours = d.time.slice(1, 4).map((t, i) => {
          const [e] = wmo(d.weather_code[i + 1]);
          const dt = new Date(t + 'T12:00:00Z');
          return `${e} ${JOURS[dt.getUTCDay()]} ${Math.round(d.temperature_2m_min[i + 1])}° / ${Math.round(d.temperature_2m_max[i + 1])}° — pluie ${d.precipitation_probability_max[i + 1] ?? 0} %`;
        });
        await reply(`${emo} *Météo à ${lieu.name}${lieu.country ? ', ' + lieu.country : ''}*\n${txt}\n🌡️ *${Math.round(c.temperature_2m)} °C* (ressenti ${Math.round(c.apparent_temperature)} °C)\n💧 Humidité ${c.relative_humidity_2m} % · 💨 Vent ${Math.round(c.wind_speed_10m)} km/h\n\n*Prochains jours*\n${jours.join('\n')}\n\n_Données Open-Meteo_`);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'wiki',
    aliases: ['wikipedia'],
    desc: 'Résumé Wikipédia : .wiki Brazzaville (ajoute « en: » pour l’anglais)',
    run: async ({ sock, jid, msg, args, reply }) => {
      let q = requete(msg, args);
      let lang = 'fr';
      const l = /^([a-z]{2}):\s*(.+)$/i.exec(q);
      if (l) { lang = l[1].toLowerCase(); q = l[2]; }
      if (!q) return reply(`📚 ${P()}wiki Congo\n${P()}wiki en: Congo River`);
      try {
        const o = await web.json(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${enc(q)}&limit=1&namespace=0&format=json`);
        const titre = o?.[1]?.[0];
        if (!titre) return reply(`❓ Aucun article trouvé pour « ${q} ».`);
        const s = await web.json(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc(titre.replace(/ /g, '_'))}`);
        const texte = `📚 *${s.title}*${s.description ? `\n_${s.description}_` : ''}\n\n${coupe(s.extract || 'Pas de résumé disponible.', 1400)}\n\n🔗 ${s.content_urls?.desktop?.page || ''}`;
        if (s.thumbnail?.source) {
          try {
            const f = await web.fichier(s.thumbnail.source, { max: 5 * 1024 * 1024 });
            return void (await sock.sendMessage(jid, { image: f.buffer, caption: texte }, { quoted: msg }));
          } catch {}
        }
        await reply(texte);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'github',
    aliases: ['gh'],
    desc: 'Infos sur un utilisateur ou un dépôt GitHub : .github torvalds · .github owner/repo',
    run: async ({ args, reply }) => {
      const q = args.join(' ').trim();
      if (!q) return reply(`🐙 ${P()}github utilisateur\n${P()}github proprietaire/depot\n${P()}github mot-clé (recherche de dépôts)`);
      const h = { accept: 'application/vnd.github+json', ...partage.enteteGithub() };
      const gh = (p) => web.json('https://api.github.com' + p, { headers: h });
      const date = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
      try {
        if (/^[\w.-]+\/[\w.-]+$/.test(q)) {
          const r = await gh('/repos/' + q);
          return reply(`📦 *${r.full_name}*\n${r.description || '_Pas de description_'}\n\n⭐ ${r.stargazers_count} · 🍴 ${r.forks_count} · 🐞 ${r.open_issues_count} tickets\n💻 ${r.language || '—'} · 📜 ${r.license?.spdx_id || 'sans licence'}\n📅 Créé le ${date(r.created_at)} · mis à jour le ${date(r.pushed_at)}\n🔗 ${r.html_url}`);
        }
        if (/^[\w-]+$/.test(q)) {
          try {
            const u = await gh('/users/' + q);
            return reply(`👤 *${u.name || u.login}* (@${u.login})\n${u.bio ? coupe(u.bio, 200) + '\n' : ''}\n📦 ${u.public_repos} dépôts · 👥 ${u.followers} abonnés · ${u.following} abonnements\n${u.location ? '📍 ' + u.location + '\n' : ''}📅 Inscrit le ${date(u.created_at)}\n🔗 ${u.html_url}`);
          } catch (e) {
            if (e.statut !== 404) throw e;
          }
        }
        const s = await gh(`/search/repositories?q=${enc(q)}&per_page=5`);
        if (!s.items?.length) return reply(`❓ Rien trouvé pour « ${q} ».`);
        await reply(`🐙 *Dépôts pour « ${q} »*\n\n${s.items.map((r, i) => `${i + 1}. *${r.full_name}* ⭐ ${r.stargazers_count}\n   ${coupe(r.description || '—', 90)}\n   ${r.html_url}`).join('\n\n')}`);
      } catch (e) {
        await reply(e.statut === 403 ? '⏳ Limite de GitHub atteinte, réessaie dans quelques minutes.' : '⚠️ GitHub est indisponible pour le moment.');
      }
    },
  },
  {
    ...base,
    name: 'film',
    aliases: ['imdb', 'serie', 'movie'],
    desc: 'Fiche d’un film ou d’une série : .film Black Panther',
    run: async ({ sock, jid, msg, args, reply }) => {
      const q = requete(msg, args);
      if (!q) return reply(`🎬 ${P()}film Titre du film ou de la série`);
      try {
        const [it, tv] = await Promise.all([
          web.json(`https://itunes.apple.com/search?term=${enc(q)}&media=movie&country=fr&limit=1`).catch(() => ({})),
          web.json(`https://api.tvmaze.com/search/shows?q=${enc(q)}`).catch(() => []),
        ]);
        const f = it.results?.[0];
        const s = tv?.[0]?.show;
        if (!f && !s) return reply(`❓ Aucun film ni série trouvé pour « ${q} ».`);
        const blocs = [];
        let image = null;
        if (f) {
          blocs.push(`🎬 *${f.trackName}* (${(f.releaseDate || '').slice(0, 4)})\n🎭 ${f.primaryGenreName || '—'}${f.artistName ? ' · Réal. ' + f.artistName : ''}${f.trackTimeMillis ? ' · ' + Math.round(f.trackTimeMillis / 60000) + ' min' : ''}\n${coupe(f.longDescription || f.shortDescription || '', 500)}`);
          image = (f.artworkUrl100 || '').replace('100x100', '600x600');
        }
        if (s) {
          blocs.push(`📺 *${s.name}* (${(s.premiered || '').slice(0, 4)})\n🎭 ${(s.genres || []).join(', ') || '—'}${s.rating?.average ? ' · ⭐ ' + s.rating.average + '/10' : ''} · ${s.status === 'Ended' ? 'Terminée' : s.status === 'Running' ? 'En cours' : s.status || ''}\n${coupe(nettoyerHtml(s.summary), 400)}`);
          if (!image) image = s.image?.medium;
        }
        const texte = blocs.join('\n\n');
        if (image) {
          try {
            const img = await web.fichier(image, { max: 5 * 1024 * 1024 });
            return void (await sock.sendMessage(jid, { image: img.buffer, caption: texte }, { quoted: msg }));
          } catch {}
        }
        await reply(texte);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'anime',
    aliases: ['manga'],
    desc: 'Fiche d’un anime : .anime One Piece',
    run: async ({ sock, jid, msg, args, reply }) => {
      const q = requete(msg, args);
      if (!q) return reply(`🎌 ${P()}anime Naruto`);
      try {
        const j = await web.json(`https://api.jikan.moe/v4/anime?q=${enc(q)}&limit=1&sfw=true`);
        const a = j.data?.[0];
        if (!a) return reply(`❓ Aucun anime trouvé pour « ${q} ».`);
        const texte = `🎌 *${a.title_english || a.title}*${a.title_japanese ? ` (${a.title_japanese})` : ''}\n📺 ${a.type || '—'} · ${a.episodes ? a.episodes + ' épisodes' : 'épisodes inconnus'} · ${a.status || ''}\n⭐ ${a.score || '—'}/10${a.rank ? ' · Classement n°' + a.rank : ''}\n🎭 ${(a.genres || []).map((g) => g.name).join(', ') || '—'}\n📅 ${a.year || '—'}\n\n${coupe(a.synopsis || 'Pas de synopsis.', 700)}\n_(synopsis en anglais)_\n🔗 ${a.url}`;
        const img = a.images?.jpg?.image_url;
        if (img) {
          try {
            const f = await web.fichier(img, { max: 5 * 1024 * 1024 });
            return void (await sock.sendMessage(jid, { image: f.buffer, caption: texte }, { quoted: msg }));
          } catch {}
        }
        await reply(texte);
      } catch (e) {
        await reply(e.statut === 429 ? '⏳ Trop de demandes, réessaie dans quelques secondes.' : '⚠️ Le service est indisponible pour le moment.');
      }
    },
  },
  {
    ...base,
    name: 'images',
    aliases: ['img', 'photo', 'imagesrecherche'],
    desc: 'Cherche des images libres de droits : .images coucher de soleil',
    run: async ({ sock, jid, msg, args, reply }) => {
      const q = requete(msg, args);
      if (!q) return reply(`🖼️ ${P()}images lion\n_Images libres de droits (Openverse)._`);
      try {
        const j = await web.json(`https://api.openverse.org/v1/images/?q=${enc(q)}&page_size=6&mature=false`);
        const l = (j.results || []).filter((x) => x.thumbnail || x.url).slice(0, 4);
        if (!l.length) return reply(`❓ Aucune image trouvée pour « ${q} ».`);
        let envoyees = 0;
        for (const r of l) {
          try {
            const f = await web.fichier(r.thumbnail || r.url, { max: 5 * 1024 * 1024 });
            await sock.sendMessage(jid, { image: f.buffer, caption: `🖼️ ${coupe(r.title || q, 80)}\n_${r.creator ? 'par ' + coupe(r.creator, 40) + ' · ' : ''}licence ${String(r.license || '').toUpperCase()} · ${r.source || ''}_` });
            envoyees++;
          } catch {}
        }
        if (!envoyees) await indisponible(reply);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'google',
    aliases: ['recherche_web', 'web', 'duck'],
    desc: 'Recherche sur le web : .google comment faire du pain',
    run: async ({ msg, args, reply }) => {
      const q = requete(msg, args);
      if (!q) return reply(`🔎 ${P()}google recette du saka-saka`);
      try {
        const html = await web.texte('https://html.duckduckgo.com/html/?q=' + enc(q), { delai: 15000 });
        const res = [];
        const blocs = html.split(/(?=<a[^>]+class="result__a")/).slice(1);
        for (const bloc of blocs) {
          if (res.length >= 5) break;
          const m = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(bloc);
          if (!m) continue;
          let url = m[1].replace(/&amp;/g, '&');
          const u = /uddg=([^&]+)/.exec(url);
          if (u) url = decodeURIComponent(u[1]);
          if (url.startsWith('//')) url = 'https:' + url;
          if (!/^https?:\/\//.test(url)) continue;
          const sn = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(bloc);
          res.push(`*${coupe(nettoyerHtml(m[2]), 90)}*\n${coupe(nettoyerHtml(sn ? sn[1] : ''), 140)}\n${url}`);
        }
        if (!res.length) return reply(`❓ Aucun résultat pour « ${q} ».\n🔗 https://duckduckgo.com/?q=${enc(q)}`);
        await reply(`🔎 *${q}*\n\n${res.join('\n\n')}\n\n_Résultats DuckDuckGo. Pense à ${P()}verifierlien avant d’ouvrir un lien inconnu._`);
      } catch {
        await reply(`⚠️ La recherche est indisponible.\n🔗 https://duckduckgo.com/?q=${enc(q)}`);
      }
    },
  },
  {
    ...base,
    name: 'paroles',
    aliases: ['lyrics'],
    desc: 'Trouve une chanson et te donne le lien pour lire ses paroles : .paroles Artiste - Titre',
    run: async ({ msg, args, reply }) => {
      const q = requete(msg, args);
      if (!q) return reply(`🎤 ${P()}paroles Fally Ipupa - Eloko Oyo`);
      try {
        const j = await web.json(`https://itunes.apple.com/search?term=${enc(q)}&media=music&entity=song&limit=1&country=fr`);
        const s = j.results?.[0];
        const nom = s ? `${s.artistName} ${s.trackName}` : q;
        await reply(`🎤 ${s ? `*${s.trackName}* — ${s.artistName}\n💿 ${s.collectionName || ''} (${(s.releaseDate || '').slice(0, 4)})\n\n` : ''}📖 Paroles : https://genius.com/search?q=${enc(nom)}\n\n_Les paroles sont protégées par des droits d’auteur : je te donne le lien vers le site qui les publie légalement._`);
      } catch {
        await reply(`📖 Paroles : https://genius.com/search?q=${enc(q)}`);
      }
    },
  },
  {
    ...base,
    name: 'identifier',
    aliases: ['shazam', 'quelmorceau'],
    desc: 'Reconnaît une chanson à partir d’un extrait audio (service AudD)',
    run: async (ctx) => {
      const { reply } = ctx;
      const jeton = partage.audd();
      if (!jeton) return reply('⚙️ La reconnaissance musicale n’est pas encore activée sur ce bot.');
      const m = await recuperer(ctx, ['audio', 'video'], `🎵 Cite un extrait de chanson (audio, vocal ou vidéo) avec ${P()}identifier`);
      if (!m) return;
      try {
        const court = await media.convertir({ buffer: m.buffer, ext: media.extDe(m.mime, m.nom) }, (ins, out) => ['-i', ins[0], '-vn', '-t', '20', '-ac', '1', '-ar', '22050', '-b:a', '48k', out], 'mp3', 60000);
        const form = new FormData();
        form.append('api_token', jeton);
        form.append('return', 'apple_music,spotify');
        form.append('file', new Blob([court]), 'extrait.mp3');
        const r = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
        const j = await r.json();
        if (j.status === 'error') return reply('⚠️ La reconnaissance musicale est indisponible pour le moment (limite du service atteinte). Réessaie plus tard.');
        const s = j.result;
        if (!s) return reply('❓ Je n’ai pas reconnu ce morceau. Essaie avec un extrait plus long ou plus net.');
        await reply(`🎵 *${s.title}*\n🎤 ${s.artist}\n💿 ${s.album || '—'}${s.release_date ? ' (' + s.release_date.slice(0, 4) + ')' : ''}${s.song_link ? '\n🔗 ' + s.song_link : ''}`);
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    ...base,
    name: 'chercherstickers',
    aliases: ['stickersearch', 'stickerschercher'],
    desc: 'Cherche des stickers sur GIPHY : .chercherstickers chat content',
    run: async ({ sock, jid, msg, args, reply }) => {
      const q = requete(msg, args);
      const cle = partage.giphy();
      if (!cle) return reply('⚙️ La recherche de stickers n’est pas encore activée sur ce bot.');
      if (!q) return reply(`🔍 ${P()}chercherstickers chat content`);
      try {
        const j = await web.json(`https://api.giphy.com/v1/stickers/search?api_key=${enc(cle)}&q=${enc(q)}&limit=5&rating=g&lang=fr`);
        const l = (j.data || []).map((r) => r.images?.fixed_height?.webp || r.images?.original?.webp).filter(Boolean);
        if (!l.length) return reply(`❓ Aucun sticker pour « ${q} ».`);
        let envoyes = 0;
        for (const u of l.slice(0, 5)) {
          try {
            const f = await web.fichier(u, { max: 2 * 1024 * 1024 });
            await sock.sendMessage(jid, { sticker: await sticker.metadonnees(f.buffer) });
            envoyes++;
          } catch {}
        }
        if (envoyes) await reply('🔎 Stickers : GIPHY');
      } catch (e) {
        console.log(`[giphy] échec : ${e.statut ? 'HTTP ' + e.statut : String(e.message || e).slice(0, 80)}`);
        if (e.statut === 401 || e.statut === 403) return reply('⚠️ GIPHY refuse la clé de ce bot : le propriétaire doit la vérifier (developers.giphy.com).');
        if (e.statut === 429) return reply('⏳ Limite horaire de GIPHY atteinte (100 recherches par heure pour tout le bot). Réessaie dans quelques minutes.');
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'capture',
    aliases: ['screenshot', 'ss'],
    desc: 'Capture d’écran d’un site : .capture https://exemple.com',
    run: async ({ sock, jid, msg, args, reply }) => {
      const u = lireUrl((requete(msg, args).match(/\S+/) || [''])[0]);
      if (!u) return reply(`📸 ${P()}capture https://exemple.com`);
      if (!(await reseau.hotePublic(u.hostname))) return reply('⛔ Je ne capture que des sites publics.');
      try {
        await reply('📸 Capture en cours…');
        let f;
        for (const service of [`https://image.thum.io/get/width/1280/crop/800/noanimate/${u.href}`, `https://s0.wordpress.com/mshots/v1/${enc(u.href)}?w=1280&h=800`]) {
          try {
            f = await web.fichier(service, { max: 8 * 1024 * 1024, delai: 40000 });
            if (/image\//.test(f.mime) && f.buffer.length > 3000) break;
            f = null;
          } catch {
            f = null;
          }
        }
        if (!f) return reply('⚠️ Impossible de capturer ce site pour le moment.');
        await sock.sendMessage(jid, { image: f.buffer, caption: `📸 ${u.hostname}\n_Capture faite par un service extérieur : seule l’adresse du site lui est transmise._` }, { quoted: msg });
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'pagesource',
    aliases: ['fetch_sc', 'source', 'codesource'],
    desc: 'Récupère le code source d’une page web (fichier)',
    run: async ({ sock, jid, msg, args, reply }) => {
      const u = lireUrl((requete(msg, args).match(/\S+/) || [''])[0]);
      if (!u) return reply(`🧾 ${P()}pagesource https://exemple.com`);
      try {
        const f = await web.fichier(u.href, { externe: true, max: 500 * 1024 });
        await sock.sendMessage(jid, { document: f.buffer, mimetype: 'text/plain', fileName: (u.hostname.replace(/[^a-z0-9.-]/gi, '') || 'page') + '.html', caption: `🧾 Code source de ${u.hostname} (${Math.round(f.buffer.length / 1024)} Ko)` }, { quoted: msg });
      } catch (e) {
        await reply('⚠️ Impossible : ' + (/publique|volumineux/.test(e.message) ? e.message : 'page inaccessible') + '.');
      }
    },
  },
  {
    ...base,
    name: 'telechargergit',
    aliases: ['gitclone', 'clonegit'],
    desc: 'Télécharge un dépôt GitHub public en ZIP : .telechargergit https://github.com/proprietaire/depot',
    run: async ({ sock, jid, msg, args, reply }) => {
      const m = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w./-]+))?(?:[/?#].*)?$/i.exec(requete(msg, args).trim());
      if (!m) return reply(`🐙 ${P()}telechargergit https://github.com/proprietaire/depot`);
      const [, o, r, br] = m;
      try {
        const h = { accept: 'application/vnd.github+json', ...partage.enteteGithub() };
        const info = await web.json(`https://api.github.com/repos/${o}/${r}`, { headers: h });
        if (info.size > 80 * 1024) return reply(`⚠️ Ce dépôt est trop gros (${Math.round(info.size / 1024)} Mo, limite 80 Mo).`);
        await reply(`⏬ Téléchargement de *${info.full_name}*…`);
        const f = await web.fichier(`https://codeload.github.com/${o}/${r}/zip/refs/heads/${br || info.default_branch}`, { max: 80 * 1024 * 1024, delai: 120000 });
        await sock.sendMessage(jid, { document: f.buffer, mimetype: 'application/zip', fileName: `${r}-${br || info.default_branch}.zip`, caption: `🐙 ${info.full_name}\n⭐ ${info.stargazers_count} · ${info.language || '—'} · 📜 ${info.license?.spdx_id || 'sans licence'}\n_Lis la licence avant de réutiliser ce code._` }, { quoted: msg });
      } catch (e) {
        await reply(e.statut === 404 ? '❓ Dépôt introuvable ou privé.' : '⚠️ Téléchargement impossible pour le moment.');
      }
    },
  },
  {
    ...base,
    name: 'application',
    aliases: ['app', 'apk'],
    desc: 'Cherche une application Android (Aptoide) : .application WhatsApp',
    run: async ({ sock, jid, msg, args, reply }) => {
      const q = requete(msg, args);
      if (!q) return reply(`📱 ${P()}application Facebook Lite`);
      try {
        const j = await web.json(`https://ws75.aptoide.com/api/7/apps/search?query=${enc(q)}&limit=1`);
        const a = j.datalist?.list?.[0];
        if (!a) return reply(`❓ Aucune application trouvée pour « ${q} ».`);
        const mo = (a.file?.filesize || a.size || 0) / 1048576;
        const sur = a.file?.malware?.rank === 'TRUSTED';
        const texte = `📱 *${a.name}*\n📦 ${a.package}\n🔖 Version ${a.file?.vername || '—'} · ${mo ? Math.round(mo) + ' Mo' : ''}\n⭐ ${a.stats?.rating?.avg ? a.stats.rating.avg.toFixed(1) : '—'} · ⬇️ ${(a.stats?.downloads || 0).toLocaleString('fr-FR')} téléchargements\n🛡️ Analyse antivirus : ${a.file?.malware?.rank || 'inconnue'}\n🏪 Boutique : ${a.store?.name || '—'}`;
        const url = a.file?.path;
        if (url && sur && mo > 0 && mo <= 90) {
          await reply(texte + '\n\n⏬ Envoi du fichier APK…');
          const f = await web.fichier(url, { max: 95 * 1024 * 1024, delai: 180000 });
          return void (await sock.sendMessage(jid, { document: f.buffer, mimetype: 'application/vnd.android.package-archive', fileName: `${a.name.replace(/[^\p{L}\p{N} _.-]/gu, '')}.apk` }, { quoted: msg }));
        }
        await reply(`${texte}\n\n${url && !sur ? '⚠️ Je n’envoie pas ce fichier : il n’est pas certifié « TRUSTED ». ' : mo > 90 ? '⚠️ Fichier trop gros pour WhatsApp. ' : ''}Préfère le Play Store : https://play.google.com/store/search?q=${enc(a.name)}&c=apps\n_Installe uniquement des applications de sources sûres._`);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'mailtemp',
    aliases: ['tempmail', 'emailtemp'],
    desc: 'Crée une adresse e-mail temporaire (en privé) : .mailtemp · .mailtemp nouveau',
    run: async ({ args, reply, isGroup, senderNum }) => {
      if (isGroup) return reply('🔒 Demande ton adresse temporaire en privé.');
      try {
        const existant = store.get('mailtemp', senderNum);
        if (existant && (args[0] || '').toLowerCase() !== 'nouveau') return reply(`📧 Ton adresse temporaire : *${existant.adresse}*\n📥 ${P()}boitetemp pour lire les messages · ${P()}mailtemp nouveau pour en changer.`);
        const doms = await web.json('https://api.mail.tm/domains');
        const domaine = doms['hydra:member']?.[0]?.domain;
        if (!domaine) throw new Error('aucun domaine');
        const crypto = require('crypto');
        const adresse = `kb${crypto.randomBytes(5).toString('hex')}@${domaine}`;
        const mdp = crypto.randomBytes(12).toString('base64url');
        await web.json('https://api.mail.tm/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: adresse, password: mdp }) });
        store.set('mailtemp', senderNum, { adresse, mdp });
        await reply(`📧 Adresse temporaire créée :\n*${adresse}*\n\n📥 ${P()}boitetemp pour lire les messages reçus.\n_Ne l’utilise jamais pour des comptes importants : n’importe qui qui connaît l’adresse peut en deviner le contenu. Service mail.tm._`);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    name: 'boitetemp',
    aliases: ['tempinbox', 'boitemail'],
    desc: 'Lit ta boîte e-mail temporaire : .boitetemp · .boitetemp 2',
    run: async ({ args, reply, isGroup, senderNum }) => {
      if (isGroup) return reply('🔒 Consulte ta boîte en privé.');
      const c = store.get('mailtemp', senderNum);
      if (!c) return reply(`📭 Tu n’as pas d’adresse temporaire. ${P()}mailtemp`);
      try {
        const t = await web.json('https://api.mail.tm/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: c.adresse, password: c.mdp }) });
        const h = { authorization: 'Bearer ' + t.token };
        const liste = (await web.json('https://api.mail.tm/messages', { headers: h }))['hydra:member'] || [];
        const n = parseInt(args[0], 10);
        if (n) {
          const e = liste[n - 1];
          if (!e) return reply('❓ Numéro invalide.');
          const d = await web.json('https://api.mail.tm/messages/' + enc(e.id), { headers: h });
          return reply(`📨 *${d.subject || '(sans objet)'}*\nDe : ${d.from?.address || '—'}\n\n${coupe(d.text || nettoyerHtml((d.html || []).join(' ')), 1800)}\n\n_⚠️ Méfie-toi des liens dans les e-mails inconnus (${P()}verifierlien)._`);
        }
        await reply(liste.length ? `📥 *${c.adresse}*\n\n${liste.slice(0, 10).map((e, i) => `${i + 1}. *${coupe(e.subject || '(sans objet)', 60)}*\n   de ${e.from?.address || '—'}\n   ${coupe(e.intro || '', 80)}`).join('\n\n')}\n\n${P()}boitetemp 1 pour lire le premier.` : `📭 Boîte vide pour *${c.adresse}*.`);
      } catch {
        await indisponible(reply);
      }
    },
  },
  {
    ...base,
    categorie: 'Fun',
    name: 'blague',
    aliases: ['joke'],
    desc: 'Une blague pour rire',
    run: async ({ reply }) => {
      const [q, r] = alea(BLAGUES);
      await reply(`😂 *Blague*\n\n${q}\n\n👉 ${r}`);
    },
  },
  {
    ...base,
    categorie: 'Fun',
    name: 'citation',
    aliases: ['quote', 'pensee'],
    desc: 'Une citation inspirante',
    run: async ({ reply }) => {
      const [t, a] = alea(QUOTES);
      await reply(`💬 *Citation*\n\n« ${t} »\n— ${a}`);
    },
  },
  {
    categorie: 'Images',
    name: 'ameliorer',
    aliases: ['remini', 'hd', 'nettoyer'],
    desc: 'Agrandit et améliore la netteté d’une photo (traitement local, sans IA)',
    run: async (ctx) => {
      const { sock, jid, msg, reply } = ctx;
      const m = await recuperer(ctx, ['image'], `✨ Cite ou envoie une photo avec ${P()}ameliorer`);
      if (!m) return;
      try {
        const sharp = require('sharp');
        const meta = await sharp(m.buffer).metadata();
        const grand = Math.max(meta.width || 0, meta.height || 0);
        const facteur = grand && grand < 1200 ? 2 : 1;
        const out = await sharp(m.buffer).rotate().resize({ width: Math.min(2400, Math.round((meta.width || 800) * facteur)), kernel: 'lanczos3' }).median(1).normalise({ lower: 2, upper: 98 }).modulate({ saturation: 1.12 }).sharpen({ sigma: 1.2, m1: 1, m2: 2 }).jpeg({ quality: 92 }).toBuffer();
        await sock.sendMessage(jid, { image: out, caption: `✨ Photo améliorée (${facteur === 2 ? 'agrandie x2, ' : ''}netteté et contraste)\n_Amélioration classique : elle n’invente pas de détails comme une IA._` }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    categorie: 'Stickers',
    name: 'emojimix',
    aliases: ['emix', 'melangeremoji'],
    desc: 'Mélange deux emojis en sticker : .emojimix 😀😍',
    run: async ({ sock, jid, msg, args, reply }) => {
      const e = graphemes(args.join('').replace(/[+\s]/g, '')).filter((x) => /\p{Extended_Pictographic}/u.test(x));
      if (e.length < 2) return reply(`😀 ${P()}emojimix 😀😍\n${P()}emojimix 🐱+🔥`);
      try {
        const f = await web.fichier(`https://emojik.vercel.app/s/${enc(e[0])}_${enc(e[1])}?size=512`, { max: 3 * 1024 * 1024 });
        if (!/image\//.test(f.mime)) throw new Error('pas une image');
        await sock.sendMessage(jid, { sticker: await sticker.depuisImage(f.buffer, 'complet') }, { quoted: msg });
      } catch {
        await reply('❓ Cette combinaison n’existe pas (ou le service est indisponible). Essaie avec d’autres emojis.');
      }
    },
  },
  {
    categorie: 'Médias',
    name: 'voix',
    aliases: ['tts', 'parler'],
    desc: 'Transforme un texte en message vocal : .voix [fr|en|es…] Bonjour',
    run: async ({ sock, jid, msg, args, reply }) => {
      let langue = 'fr';
      const a = [...args];
      if (/^(fr|en|es|pt|de|it|ar|sw|nl|ru|tr|ja|zh|hi)$/i.test(a[0] || '') && a.length > 1) langue = a.shift().toLowerCase();
      const t = (a.join(' ').trim() || requete(msg, [])).slice(0, 600);
      if (!t) return reply(`🔊 ${P()}voix Bonjour tout le monde\n${P()}voix en Hello everyone\n_Langues : fr, en, es, pt, de, it, ar, sw, nl, ru, tr, ja, zh, hi_`);
      try {
        const morceaux = (t.match(/[^.!?;\n]+[.!?;]?/g) || [t]).flatMap((s) => (s.length <= 180 ? [s] : s.match(/.{1,170}(\s|$)/g) || [s])).map((s) => s.trim()).filter(Boolean);
        const bufs = [];
        for (const m of morceaux) {
          const f = await web.fichier(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langue}&q=${enc(m)}`, { max: 3 * 1024 * 1024 });
          bufs.push(f.buffer);
        }
        const mp3 = Buffer.concat(bufs);
        const ogg = await media.convertir({ buffer: mp3, ext: 'mp3' }, (ins, out) => ['-i', ins[0], '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', out], 'ogg', 60000);
        await sock.sendMessage(jid, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
      } catch (e) {
        await reply('⚠️ Voix indisponible pour le moment (le service de synthèse ne répond pas).');
      }
    },
  },
];
