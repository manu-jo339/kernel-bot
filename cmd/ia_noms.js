// Kernel Bot — commandes d'IA « à l'ancienne » (gpt, gemini…), image par IA, mélange d'emojis, outils pour développeurs, stickers Telegram
// Honnêteté : .gpt, .gemini, .claude, .blackbox sont de simples raccourcis vers l'IA du bot. Le modèle réellement utilisé est celui configuré dans le .env.
const crypto = require('crypto');
const config = require('../config');
const web = require('../lib/web');
const store = require('../lib/store');
const sticker = require('../lib/sticker');
const media = require('../lib/media');
const bot = require('../lib/chatbot');
const { messageCite, extraireTexte, numero } = require('../lib/utils');
const { erreurMedia } = require('../lib/recup');

const P = () => config.PREFIXE;
const texteDe = (msg, args) => {
  const cite = messageCite(msg);
  return (args.join(' ').trim() || (cite ? extraireTexte(cite.message) : '')).trim();
};

// ─── Raccourcis vers l'IA du bot ───
function raccourci(name, aliases, nom) {
  return {
    name,
    aliases,
    categorie: 'IA',
    desc: `Pose une question à l’IA (raccourci de ${P()}ia — ce n’est pas ${nom} lui-même)`,
    async run(ctx) {
      const q = texteDe(ctx.msg, ctx.args);
      if (!q) return ctx.reply(`✍️ ${P()}${name} ta question`);
      if (!bot.globalActif()) return ctx.reply('🔕 Le chatbot est désactivé par le propriétaire.');
      // Une seule fois par personne : précision honnête sur le vrai modèle
      const cle = numero(ctx.sender);
      if (!store.get('ia_noms', cle)) {
        store.set('ia_noms', cle, { vu: Date.now() });
        await ctx.reply(`ℹ️ ${P()}${name} est un raccourci vers l’IA de ${config.NOM_BOT || 'Kernel Bot'}. La réponse ne vient pas de ${nom} : c’est le modèle configuré par le propriétaire du bot.`);
      }
      await bot.poserQuestion(ctx, q, true);
    },
  };
}

// ─── Obfuscation JavaScript ───
function obfusquer(code) {
  const JO = require('javascript-obfuscator');
  return JO.obfuscate(code, {
    compact: true,
    controlFlowFlattening: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    renameGlobals: false,
    identifierNamesGenerator: 'hexadecimal',
    selfDefending: false,
    debugProtection: false,
  }).getObfuscatedCode();
}

const coolImg = new Map();

module.exports = [
  raccourci('gpt', ['chatgpt', 'gpt4'], 'ChatGPT'),
  raccourci('gemini', ['bard'], 'Gemini'),
  raccourci('claude', ['claudeia'], 'Claude'),
  raccourci('blackbox', ['bb'], 'Blackbox'),

  {
    name: 'imageia',
    aliases: ['dalle', 'genererimage', 'imagine'],
    categorie: 'IA',
    desc: 'Crée une image à partir d’une description (service Pollinations) : .imageia un lion en costume',
    async run({ sock, jid, msg, args, sender, isOwner, reply }) {
      const q = texteDe(msg, args).slice(0, 400);
      if (!q) return reply(`🎨 ${P()}imageia un coucher de soleil sur le fleuve Congo, style peinture\n_Ta description est envoyée au service Pollinations pour créer l’image._`);
      if (!isOwner) {
        const k = numero(sender);
        const d = coolImg.get(k) || 0;
        if (Date.now() - d < 20000) return reply('⏳ Patiente quelques secondes entre deux images.');
        coolImg.set(k, Date.now());
      }
      try {
        await reply('🎨 Création de l’image en cours…');
        const seed = crypto.randomInt(1, 1e9);
        const f = await web.fichier(`https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&nologo=true&safe=true&seed=${seed}`, { max: 8 * 1024 * 1024, delai: 90000 });
        if (!/image\//.test(f.mime)) throw new Error('réponse invalide');
        await sock.sendMessage(jid, { image: f.buffer, caption: `🎨 ${q.slice(0, 200)}\n_Image générée par IA (Pollinations)._` }, { quoted: msg });
      } catch {
        await reply('⚠️ Impossible de créer l’image pour le moment. Réessaie dans un instant ou change la description.');
      }
    },
  },

  {
    name: 'brouiller',
    aliases: ['obfusquer', 'obfuscate', 'cachercode'],
    categorie: 'Outils',
    desc: 'Rend un code JavaScript difficile à lire (ce n’est pas du chiffrement)',
    async run({ msg, args, sock, jid, reply }) {
      const code = texteDe(msg, args).replace(/^```(?:js|javascript)?\n?|```$/g, '');
      if (!code) return reply(`🧩 ${P()}brouiller console.log("bonjour")\n_Ou cite un message contenant du code JavaScript._`);
      if (code.length > 20000) return reply('⚠️ Code trop long (20 000 caractères maximum).');
      try {
        const sortie = obfusquer(code);
        if (sortie.length < 3000) return void (await reply('```\n' + sortie + '\n```\n_Ce n’est pas du chiffrement : un expert peut le relire. Ne cache jamais de mot de passe dedans._'));
        await sock.sendMessage(jid, { document: Buffer.from(sortie), mimetype: 'text/javascript', fileName: 'code-brouille.js', caption: '🧩 Code brouillé.\n_Ce n’est pas du chiffrement : ne cache jamais de mot de passe dedans._' }, { quoted: msg });
      } catch (e) {
        await reply('⚠️ Ce code n’a pas pu être lu : ' + String(e.message).slice(0, 150));
      }
    },
  },

  {
    name: 'fauxmessage',
    aliases: ['fakemessage', 'fakereply', 'fausse_citation'],
    categorie: 'Fun',
    adminOnly: true,
    desc: 'Montre un message « simulé » attribué à quelqu’un (marqué [simulé], réservé aux admins) : .fauxmessage @personne texte',
    async run({ sock, jid, msg, args, isGroup, reply }) {
      if (!isGroup) return reply('👥 Cette commande ne s’utilise que dans un groupe.');
      const cites = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const cible = cites[0];
      const texte = args.filter((a) => !/^@\d+$/.test(a)).join(' ').trim();
      if (!cible || !texte) return reply(`🎭 ${P()}fauxmessage @personne Ton texte\n_Le message sera toujours marqué « [simulé] »._`);
      if (texte.length > 300) return reply('⚠️ Texte trop long (300 caractères maximum).');
      const faux = { key: { remoteJid: jid, fromMe: false, id: 'SIM' + crypto.randomBytes(8).toString('hex').toUpperCase(), participant: cible }, message: { conversation: '[simulé] ' + texte } };
      await sock.sendMessage(jid, { text: `🎭 Message simulé par @${numero(msg.key.participant || msg.key.remoteJid)} — ce n’est PAS un vrai message de @${numero(cible)}.`, mentions: [msg.key.participant, cible].filter(Boolean) }, { quoted: faux });
    },
  },

  {
    name: 'stickertelegram',
    aliases: ['telegramsticker', 'tgsticker', 'stickerpack'],
    categorie: 'Stickers',
    desc: 'Envoie les stickers d’un pack Telegram : .stickertelegram https://t.me/addstickers/NomDuPack',
    async run({ sock, jid, msg, args, reply }) {
      const jeton = process.env.TELEGRAM_BOT_TOKEN;
      if (!jeton) return reply('⚙️ Cette commande demande un bot Telegram gratuit (créé avec @BotFather). Le propriétaire met son jeton dans le fichier .env : TELEGRAM_BOT_TOKEN=…');
      const m = /(?:addstickers\/|^)([A-Za-z0-9_]{3,64})\s*$/.exec(texteDe(msg, args));
      if (!m) return reply(`🧷 ${P()}stickertelegram https://t.me/addstickers/NomDuPack`);
      try {
        const api = `https://api.telegram.org/bot${jeton}`;
        const set = await web.json(`${api}/getStickerSet?name=${encodeURIComponent(m[1])}`);
        const l = (set.result?.stickers || []).filter((s) => !s.is_animated).slice(0, 12);
        if (!l.length) return reply('❓ Pack introuvable, vide, ou fait uniquement de stickers animés (.tgs) que je ne sais pas convertir.');
        await reply(`🧷 Pack *${set.result.title}* — envoi de ${l.length} sticker(s)…`);
        for (const s of l) {
          try {
            const fi = await web.json(`${api}/getFile?file_id=${encodeURIComponent(s.file_id)}`);
            const f = await web.fichier(`https://api.telegram.org/file/bot${jeton}/${fi.result.file_path}`, { max: 2 * 1024 * 1024 });
            const webp = s.is_video ? await sticker.depuisVideo(f.buffer, 'webm', 'complet') : await sticker.metadonnees(f.buffer);
            await sock.sendMessage(jid, { sticker: webp });
          } catch {}
        }
      } catch (e) {
        await reply(e.statut === 400 || e.statut === 404 ? '❓ Pack Telegram introuvable.' : '⚠️ Telegram est indisponible pour le moment.');
      }
    },
  },
];

module.exports.obfusquer = obfusquer;
