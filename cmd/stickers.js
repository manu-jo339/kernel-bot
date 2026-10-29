// Kernel Bot — stickers, conversions médias et jeux de texte (tout est fabriqué sur l'ordinateur du bot : sharp + ffmpeg)
const sharp = require('sharp');
const config = require('../config');
const utils = require('../lib/utils');
const media = require('../lib/media');
const sticker = require('../lib/sticker');
const texte = require('../lib/texte');

const { numero } = utils;
const { recuperer, erreurMedia } = require('../lib/recup');

// « Pack | Auteur » après la commande
function lirePack(args, pushName) {
  const t = args.join(' ').trim();
  if (!t) return {};
  const [pack, auteur] = t.split('|').map((x) => x.trim());
  const remplace = (x) => (x || '').replace(/\{nom\}/gi, pushName || '');
  return { pack: remplace(pack) || undefined, auteur: remplace(auteur) || undefined };
}

// ───────────── Stickers ─────────────
function commandeSticker(nom, mode, aliases, desc) {
  return {
    name: nom,
    aliases,
    categorie: 'Stickers',
    desc,
    usage: `{P}${nom} [Pack | Auteur] — réponds à une image, une vidéo (8 s max) ou un GIF`,
    run: async (ctx) => {
      const { msg, args, reply } = ctx;
      const m = await recuperer(ctx, ['image', 'video', 'sticker'], `🖼️ Envoie ou cite une image / une vidéo / un GIF avec ${config.PREFIXE}${nom}\n_Facultatif : ${config.PREFIXE}${nom} Mon pack | Mon nom_`);
      if (!m) return;
      const opts = lirePack(args, msg.pushName);
      try {
        let webp;
        if (m.type === 'sticker') webp = await sticker.metadonnees(m.buffer, opts.pack, opts.auteur);
        else if (m.type === 'video') webp = await sticker.depuisVideo(m.buffer, media.extDe(m.mime, m.nom), mode === 'rond' || mode === 'coins' ? 'recadre' : mode, opts);
        else webp = await sticker.depuisImage(m.buffer, mode, opts);
        await ctx.sock.sendMessage(ctx.jid, { sticker: webp }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  };
}

// ───────────── Pile de fichiers à fusionner ─────────────
const piles = new Map();
const pileDe = (n) => {
  const p = piles.get(n);
  if (p && Date.now() - p.ts < 30 * 60e3) return p;
  const neuve = { items: [], ts: Date.now() };
  piles.set(n, neuve);
  return neuve;
};

// ───────────── Styles de lettres ─────────────
const ROND = (c) => c;
function styleUnicode(maj, min, chiffres, exceptions = {}) {
  return (t) => [...t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')].map((c) => {
    if (exceptions[c]) return exceptions[c];
    const code = c.codePointAt(0);
    if (code >= 65 && code <= 90 && maj) return String.fromCodePoint(maj + code - 65);
    if (code >= 97 && code <= 122 && (min || maj)) return String.fromCodePoint(min ? min + code - 97 : maj + code - 97);
    if (code >= 48 && code <= 57 && chiffres) return typeof chiffres === 'function' ? chiffres(code - 48) : String.fromCodePoint(chiffres + code - 48);
    return c;
  }).join('');
}
const STYLES = [
  ['Gras', styleUnicode(0x1d5d4, 0x1d5ee, 0x1d7ec)],
  ['Italique', styleUnicode(0x1d608, 0x1d622, 0)],
  ['Gras italique', styleUnicode(0x1d63c, 0x1d656, 0x1d7ec)],
  ['Machine à écrire', styleUnicode(0x1d670, 0x1d68a, 0x1d7f6)],
  ['Double trait', styleUnicode(0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
  ['Script', styleUnicode(0x1d4d0, 0x1d4ea, 0x1d7ec)],
  ['Gothique', styleUnicode(0x1d56c, 0x1d586, 0x1d7ec)],
  ['Cerclé', styleUnicode(0x24b6, 0x24d0, (n) => (n === 0 ? '⓪' : String.fromCodePoint(0x2460 + n - 1)))],
  ['Carré', (t) => styleUnicode(0x1f130, 0x1f130, 0)(t.toUpperCase())],
  ['Petites capitales', (t) => [...t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()].map((c) => ({ a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' }[c] || c)).join('')],
];
const HAUT_BAS = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((c, i) => [c, [...'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz'][i]])
  .concat([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [c, [...'∀ԐƆᗡƎℲ⅁HIſ⋊⅂WNOԀỌᴚS⊥∩ΛMX⅄Z'][i]]))
  .concat([...'0123456789'].map((c, i) => [c, [...'0ƖᄅƐㄣϛ9ㄥ86'][i]]))
  .concat([['.', '˙'], [',', '\''], ['?', '¿'], ['!', '¡'], ['\'', ','], ['(', ')'], [')', '('], ['&', '⅋'], ['_', '‾'], ['[', ']'], [']', '[']]));
const retourner = (t) => [...t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')].map((c) => HAUT_BAS[c] || c).reverse().join('');

// ───────────── Couleurs de texte ─────────────
const COULEURS = { rouge: '#ff3b30', orange: '#ff9500', jaune: '#ffd60a', vert: '#34c759', bleu: '#0a84ff', violet: '#bf5af2', rose: '#ff2d92', blanc: '#ffffff', noir: '#111111', or: '#ffc400' };
const PALETTE = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ff2d92', '#ffffff'];
function lireCouleur(args) {
  const c = (args[0] || '').toLowerCase();
  if (COULEURS[c]) return [COULEURS[c], args.slice(1)];
  if (/^#[0-9a-f]{6}$/i.test(c)) return [c, args.slice(1)];
  return [null, args];
}
const rendre = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

const chiffreAlea = (n) => require('crypto').randomInt(n);

module.exports = [
  commandeSticker('sticker', 'complet', ['s', 'stick', 'autocollant'], 'Transforme une image, une vidéo ou un GIF en sticker'),
  commandeSticker('stickerrecadre', 'recadre', ['crop', 'stickercarre'], 'Sticker recadré en carré (l’image remplit tout le sticker)'),
  commandeSticker('stickerrond', 'rond', ['circle', 'stickercercle'], 'Sticker en forme de cercle'),
  commandeSticker('stickercoins', 'coins', ['round', 'stickerarrondi'], 'Sticker aux coins arrondis'),
  {
    name: 'renommersticker',
    aliases: ['take', 'volersticker'],
    categorie: 'Stickers',
    desc: 'Change le nom du pack et de l’auteur d’un sticker',
    usage: '{P}renommersticker Pack | Auteur — en réponse à un sticker',
    run: async (ctx) => {
      const { msg, args, reply, sock, jid } = ctx;
      const m = await recuperer(ctx, ['sticker'], `✏️ Cite un sticker avec ${config.PREFIXE}renommersticker Mon pack | Mon nom\n_Sans texte : ton nom WhatsApp est utilisé._`);
      if (!m) return;
      const o = lirePack(args, msg.pushName);
      try {
        const webp = await sticker.metadonnees(m.buffer, o.pack || msg.pushName || sticker.packParDefaut(), o.auteur || o.pack ? o.auteur || '' : sticker.auteurParDefaut());
        await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'image',
    aliases: ['toimage', 'stickerimage', 'versimage'],
    categorie: 'Stickers',
    desc: 'Transforme un sticker en image',
    run: async (ctx) => {
      const { msg, sock, jid, reply } = ctx;
      const m = await recuperer(ctx, ['sticker'], `🖼️ Cite un sticker avec ${config.PREFIXE}image`);
      if (!m) return;
      try {
        if (await sticker.estAnime(m.buffer)) return reply(`🎞️ Ce sticker est animé : utilise ${config.PREFIXE}stickervideo pour en faire une vidéo.`);
        await sock.sendMessage(jid, { image: await sticker.versImage(m.buffer), caption: '🖼️ Voilà ton image' }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'stickervideo',
    aliases: ['stickertovideo', 'togif'],
    categorie: 'Stickers',
    desc: 'Transforme un sticker animé en vidéo',
    run: async (ctx) => {
      const { msg, sock, jid, reply } = ctx;
      const m = await recuperer(ctx, ['sticker'], `🎞️ Cite un sticker animé avec ${config.PREFIXE}stickervideo`);
      if (!m) return;
      try {
        if (!(await sticker.estAnime(m.buffer))) return reply(`🖼️ Ce sticker n’est pas animé : utilise ${config.PREFIXE}image.`);
        await sock.sendMessage(jid, { video: await sticker.versVideo(m.buffer), gifPlayback: true, caption: '🎞️ Voilà ta vidéo' }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'textesticker',
    aliases: ['ttp'],
    categorie: 'Stickers',
    desc: 'Crée un sticker à partir d’un texte : .textesticker [couleur] Salut !',
    run: async ({ sock, jid, msg, args, reply }) => {
      const [couleur, mots] = lireCouleur(args);
      const t = mots.join(' ').trim();
      if (!t) return reply(`🔤 ${config.PREFIXE}textesticker Bonjour la famille\n${config.PREFIXE}textesticker rouge Bonjour\n_Couleurs : ${Object.keys(COULEURS).join(', ')} ou #ff8800_`);
      if (t.length > 150) return reply('⚠️ Texte trop long (150 caractères maximum).');
      try {
        const png = await rendre(texte.svgTexte(t, 512, 512, { couleur: couleur || '#ffffff', contour: couleur === '#111111' ? '#ffffff' : '#000000' }));
        await sock.sendMessage(jid, { sticker: await sticker.depuisImage(png, 'complet') }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'texteanime',
    aliases: ['attp'],
    categorie: 'Stickers',
    desc: 'Sticker animé aux couleurs qui changent : .texteanime Salut !',
    run: async ({ sock, jid, msg, args, reply }) => {
      const t = args.join(' ').trim();
      if (!t) return reply(`🌈 ${config.PREFIXE}texteanime Bonne année !`);
      if (t.length > 100) return reply('⚠️ Texte trop long (100 caractères maximum).');
      try {
        const frames = [];
        for (const c of PALETTE) frames.push(await rendre(texte.svgTexte(t, 512, 512, { couleur: c, contour: c === '#ffffff' ? '#000000' : null })));
        await sock.sendMessage(jid, { sticker: await sticker.depuisImages(frames, 5) }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  // ───────────── Conversions ─────────────
  {
    name: 'envoyervueunique',
    aliases: ['tovv', 'viewonce'],
    categorie: 'Médias',
    desc: 'Renvoie une image, vidéo ou audio en « vue unique »',
    run: async (ctx) => {
      const { sock, jid, msg, reply } = ctx;
      const m = await recuperer(ctx, ['image', 'video', 'audio'], `👁️ Cite une image, une vidéo ou un audio avec ${config.PREFIXE}envoyervueunique`);
      if (!m) return;
      try {
        const contenu = m.type === 'image' ? { image: m.buffer } : m.type === 'video' ? { video: m.buffer } : { audio: m.buffer, mimetype: m.mime || 'audio/mpeg', ptt: false };
        await sock.sendMessage(jid, { ...contenu, viewOnce: true }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'extraireaudio',
    aliases: ['toaudio', 'mp3'],
    categorie: 'Médias',
    desc: 'Extrait le son d’une vidéo (ou convertit un vocal) en MP3',
    run: async (ctx) => {
      const { sock, jid, msg, reply } = ctx;
      const m = await recuperer(ctx, ['video', 'audio'], `🎵 Cite une vidéo ou un vocal avec ${config.PREFIXE}extraireaudio`);
      if (!m) return;
      try {
        const mp3 = await media.convertir({ buffer: m.buffer, ext: media.extDe(m.mime, m.nom) }, (ins, out) => ['-i', ins[0], '-vn', '-acodec', 'libmp3lame', '-q:a', '3', out], 'mp3', 120000);
        await sock.sendMessage(jid, { audio: mp3, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e.message.includes('Output file') || /does not contain any stream/.test(e.message) ? new Error('aucun son dans ce fichier') : e);
      }
    },
  },
  {
    name: 'audiovideo',
    aliases: ['tovideo', 'audioenvideo'],
    categorie: 'Médias',
    desc: 'Transforme un audio en vidéo (avec onde sonore) — utile pour les statuts',
    run: async (ctx) => {
      const { sock, jid, msg, reply } = ctx;
      const m = await recuperer(ctx, ['audio'], `🎬 Cite un audio ou un vocal avec ${config.PREFIXE}audiovideo`);
      if (!m) return;
      try {
        const d = await media.duree(m.buffer, media.extDe(m.mime, m.nom));
        if (d > 300) return reply('⚠️ Audio trop long (5 minutes maximum).');
        const mp4 = await media.convertir({ buffer: m.buffer, ext: media.extDe(m.mime, m.nom) }, (ins, out) => ['-i', ins[0], '-filter_complex', '[0:a]showwaves=s=720x720:mode=cline:colors=0x25D366:rate=25,format=yuv420p[v]', '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', out], 'mp4', 180000);
        await sock.sendMessage(jid, { video: mp4, caption: '🎬 Voilà ta vidéo' }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'fusionner',
    aliases: ['fusion', 'merge'],
    categorie: 'Médias',
    desc: 'Colle plusieurs audios (ou plusieurs vidéos) bout à bout',
    usage: '{P}fusionner (sur chaque fichier) puis {P}fusionner creer · {P}fusionner vider',
    run: async (ctx) => {
      const { sock, jid, msg, args, reply, senderNum } = ctx;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const pile = pileDe(senderNum);
      if (sous === 'vider') { piles.delete(senderNum); return reply('🗑️ Pile vidée.'); }
      if (sous === 'creer' || sous === 'créer') {
        if (pile.items.length < 2) return reply(`🧩 Il faut au moins 2 fichiers. Cite-les un par un avec ${p}fusionner (${pile.items.length} pour l’instant).`);
        try {
          const genre = pile.items[0].type;
          let sortie;
          if (genre === 'audio') {
            sortie = await media.convertir(pile.items.map((x) => ({ buffer: x.buffer, ext: x.ext })), (ins, out) => [...ins.flatMap((f) => ['-i', f]), '-filter_complex', `${ins.map((_, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=stereo[a${i}]`).join(';')};${ins.map((_, i) => `[a${i}]`).join('')}concat=n=${ins.length}:v=0:a=1[o]`, '-map', '[o]', '-acodec', 'libmp3lame', '-q:a', '3', out], 'mp3', 240000);
            await sock.sendMessage(jid, { audio: sortie, mimetype: 'audio/mpeg' }, { quoted: msg });
          } else {
            const normalises = [];
            for (const x of pile.items) {
              const tentative = (avecSon) => media.convertir({ buffer: x.buffer, ext: x.ext }, (ins, out) => avecSon
                ? ['-i', ins[0], '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', '[0:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p[v];[0:a]aresample=44100,aformat=channel_layouts=stereo[a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-t', '180', out]
                : ['-i', ins[0], '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', '[0:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p[v]', '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-shortest', '-t', '180', out], 'mp4', 240000);
              try {
                normalises.push(await tentative(true));
              } catch {
                normalises.push(await tentative(false));
              }
            }
            const fs = require('fs');
            const liste = normalises.map((b) => { const f = media.nomTemp('.mp4'); fs.writeFileSync(f, b); return f; });
            const texteListe = media.nomTemp('.txt');
            const sortieF = media.nomTemp('.mp4');
            try {
              fs.writeFileSync(texteListe, liste.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
              await media.lancer(['-f', 'concat', '-safe', '0', '-i', texteListe, '-c', 'copy', '-movflags', '+faststart', sortieF], 240000);
              sortie = fs.readFileSync(sortieF);
            } finally {
              media.nettoyer(liste, texteListe, sortieF);
            }
            await sock.sendMessage(jid, { video: sortie, caption: '🧩 Vidéos fusionnées' }, { quoted: msg });
          }
          piles.delete(senderNum);
        } catch (e) {
          await erreurMedia(reply, e);
        }
        return;
      }
      const m = await recuperer(ctx, ['audio', 'video'], `🧩 *Fusionner*\n1. Cite ou envoie un fichier avec ${p}fusionner (audio ou vidéo), répète pour chaque fichier (6 maximum, tous du même type).\n2. Tape ${p}fusionner creer.\n${p}fusionner vider pour recommencer.`);
      if (!m) return;
      if (pile.items.length && pile.items[0].type !== m.type) return reply(`⚠️ Ta pile contient des ${pile.items[0].type === 'audio' ? 'audios' : 'vidéos'} : on ne mélange pas. ${p}fusionner vider pour recommencer.`);
      if (pile.items.length >= 6) return reply(`⚠️ 6 fichiers maximum. Tape ${p}fusionner creer.`);
      if (pile.items.reduce((a, x) => a + x.buffer.length, m.buffer.length) > 60 * 1024 * 1024) return reply('⚠️ Trop volumineux (60 Mo au total).');
      pile.items.push({ type: m.type, buffer: m.buffer, ext: media.extDe(m.mime, m.nom) });
      pile.ts = Date.now();
      await reply(`✅ Fichier ${pile.items.length} ajouté. Continue avec ${p}fusionner ou tape *${p}fusionner creer*.`);
    },
  },
  // ───────────── Jeux de texte et de photos ─────────────
  {
    name: 'ecrire',
    aliases: ['write', 'cahier'],
    categorie: 'Texte',
    desc: 'Écrit ton texte sur une page de cahier (image)',
    run: async ({ sock, jid, msg, args, reply }) => {
      const t = args.join(' ').trim();
      if (!t) return reply(`📓 ${config.PREFIXE}ecrire Mon texte ici`);
      if (t.length > 700) return reply('⚠️ Texte trop long (700 caractères maximum).');
      try {
        const W = 800, H = 1100, pas = 50;
        let lignes = '';
        for (let y = 140; y < H - 20; y += pas) lignes += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#9fc5e8" stroke-width="2"/>`;
        const r = texte.disposer(t, { x: 100, y: 100, l: W - 150, h: H - 160 }, { poids: 'italique', tailleMax: 38, tailleMin: 18, interligne: pas / 38, alignement: 'gauche', valign: 'haut' });
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fffdf5"/>${lignes}<line x1="80" y1="0" x2="80" y2="${H}" stroke="#e57373" stroke-width="3"/><path d="${r.d}" fill="#1a237e"/></svg>`;
        const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
        await sock.sendMessage(jid, { image: jpg, caption: '📓 Voilà ta page' }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    name: 'envers',
    aliases: ['fliptext', 'retourner'],
    categorie: 'Texte',
    desc: 'Écrit ton texte à l’envers (ɐ ʅ,ǝuʌǝɹs)',
    run: async ({ args, reply }) => {
      const t = args.join(' ').trim();
      if (!t) return reply(`🙃 ${config.PREFIXE}envers Bonjour tout le monde`);
      await reply(retourner(t.slice(0, 500)));
    },
  },
  {
    name: 'lirelasuite',
    aliases: ['readmore', 'suite'],
    categorie: 'Texte',
    desc: 'Cache la fin d’un message derrière « Lire la suite » : .lirelasuite début | fin',
    run: async ({ args, reply }) => {
      const t = args.join(' ');
      const [debut, ...reste] = t.split('|');
      if (!reste.length || !reste.join('|').trim()) return reply(`📖 ${config.PREFIXE}lirelasuite Le début visible | La suite cachée`);
      await reply(debut.trim() + '\n' + '\u200b'.repeat(4001) + '\n' + reste.join('|').trim());
    },
  },
  {
    name: 'stylelettres',
    aliases: ['fancy', 'police'],
    categorie: 'Texte',
    desc: 'Écrit ton texte dans de jolies polices : .stylelettres [numéro] Texte',
    run: async ({ args, reply }) => {
      let n = null;
      if (/^\d{1,2}$/.test(args[0] || '') && args.length > 1) n = parseInt(args.shift(), 10);
      const t = args.join(' ').trim();
      if (!t) return reply(`🔠 ${config.PREFIXE}stylelettres Mon texte\n${config.PREFIXE}stylelettres 5 Mon texte  (choisir le style n° 5)`);
      if (t.length > 200) return reply('⚠️ Texte trop long (200 caractères maximum).');
      if (n) {
        const s = STYLES[n - 1];
        return reply(s ? s[1](t) : `❓ Choisis un style de 1 à ${STYLES.length}.`);
      }
      await reply(STYLES.map(([nom, f], i) => `*${i + 1}. ${nom}*\n${f(t)}`).join('\n\n') + `\n\n_Pour un seul style : ${config.PREFIXE}stylelettres 3 Mon texte_`);
    },
  },
  {
    name: 'couple',
    aliases: ['ship', 'compatibilite'],
    categorie: 'Texte',
    groupOnly: true,
    metaSiGroupe: true,
    desc: 'Pourcentage de compatibilité entre deux membres (juste pour rire)',
    run: async ({ msg, args, reply, metadata, sender, sock }) => {
      const membres = (metadata?.participants || []).map((x) => x.id).filter((id) => numero(id) !== numero(sock.user?.id));
      let deux = utils.cibles(msg, args, metadata).slice(0, 2);
      if (deux.length === 1) deux = [sender, deux[0]];
      if (deux.length < 2) {
        if (membres.length < 2) return reply('👥 Pas assez de membres.');
        const a = membres[chiffreAlea(membres.length)];
        let b;
        do b = membres[chiffreAlea(membres.length)]; while (b === a);
        deux = [a, b];
      }
      const pct = chiffreAlea(101);
      const barre = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
      const verdict = pct >= 90 ? '💍 Faits l’un pour l’autre !' : pct >= 70 ? '😍 Ça va très bien ensemble !' : pct >= 50 ? '🙂 Il y a quelque chose…' : pct >= 30 ? '😅 Faut travailler un peu…' : '💔 Mieux vaut rester amis.';
      await reply(`💘 *Compatibilité*\n@${numero(deux[0])} ❤️ @${numero(deux[1])}\n\n${barre}\n*${pct} %*\n${verdict}\n_(c’est pour rire, hein 😉)_`, deux);
    },
  },
  {
    name: 'photocouple',
    aliases: ['couplepp', 'couplephoto'],
    categorie: 'Texte',
    groupOnly: true,
    metaSiGroupe: true,
    desc: 'Une image avec les photos de profil de deux membres et un cœur',
    run: async ({ msg, args, reply, metadata, sender, sock, jid }) => {
      let deux = utils.cibles(msg, args, metadata).slice(0, 2);
      if (deux.length === 1) deux = [sender, deux[0]];
      if (deux.length < 2) return reply(`💑 Mentionne deux personnes (ou une seule : toi + elle) : ${config.PREFIXE}photocouple @Marie @Jean`);
      try {
        const D = 400;
        const rond = Buffer.from(`<svg width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}"/></svg>`);
        const photos = [];
        for (const j of deux) {
          let buf = null;
          try {
            const url = await sock.profilePictureUrl(j, 'image');
            const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (r.ok) buf = Buffer.from(await r.arrayBuffer());
          } catch {}
          const base = buf ? sharp(buf).resize(D, D, { fit: 'cover' }) : sharp(Buffer.from(`<svg width="${D}" height="${D}"><rect width="100%" height="100%" fill="#cfd8dc"/><circle cx="200" cy="155" r="70" fill="#90a4ae"/><ellipse cx="200" cy="390" rx="130" ry="150" fill="#90a4ae"/></svg>`));
          photos.push(await base.ensureAlpha().composite([{ input: rond, blend: 'dest-in' }]).png().toBuffer());
        }
        const W = 1100, H = 560;
        const fond = Buffer.from(`<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a9e"/><stop offset="1" stop-color="#fad0c4"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><path d="M550 400 C 440 320 470 230 520 230 C 540 230 550 245 550 250 C 550 245 560 230 580 230 C 630 230 660 320 550 400 Z" fill="#e91e63" stroke="#fff" stroke-width="6"/></svg>`);
        const img = await sharp(fond).composite([{ input: photos[0], left: 60, top: 80 }, { input: photos[1], left: W - D - 60, top: 80 }]).jpeg({ quality: 88 }).toBuffer();
        await sock.sendMessage(jid, { image: img, caption: `💑 @${numero(deux[0])} ❤️ @${numero(deux[1])}`, mentions: deux }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
];
