// Kernel Bot — réactions animées (GIF d'anime) : .enlacer @membre, .danser, .rougir…
// Les GIF viennent de services gratuits sans clé (nekos.best puis waifu.pics) ; seule la catégorie demandée est envoyée.
const config = require('../config');
const utils = require('../lib/utils');
const web = require('../lib/web');
const media = require('../lib/media');

const { numero } = utils;

// [nom, alias OVL, catégorie nekos.best, catégorie waifu.pics, verbe]
const REACTIONS = [
  ['embeter', ['poke'], 'poke', 'poke', 'embête'],
  ['caliner', ['cuddle'], 'cuddle', 'cuddle', 'fait un câlin à'],
  ['pleurer', ['cry'], 'cry', 'cry', 'pleure devant'],
  ['enlacer', ['hug'], 'hug', 'hug', 'serre dans ses bras'],
  ['embrasser', ['kiss'], 'kiss', 'kiss', 'embrasse'],
  ['tapoter', ['pat'], 'pat', 'pat', 'tapote la tête de'],
  ['sourire_fier', ['smug'], 'smug', 'smug', 'a un sourire fier devant'],
  ['assommer', ['bonk'], 'punch', 'bonk', 'assomme'],
  ['lancer', ['yeet'], 'yeet', 'yeet', 'lance'],
  ['rougir', ['blush'], 'blush', 'blush', 'rougit devant'],
  ['sourire', ['smile'], 'smile', 'smile', 'sourit à'],
  ['saluer', ['wave'], 'wave', 'wave', 'salue'],
  ['highfive', [], 'highfive', 'highfive', 'tape dans la main de'],
  ['tenir_main', ['handhold'], 'handhold', 'handhold', 'tient la main de'],
  ['croquer', ['nom'], 'nom', 'nom', 'croque'],
  ['mordre', ['bite'], 'bite', 'bite', 'mord'],
  ['sauter', ['glomp'], 'hug', 'glomp', 'saute dans les bras de'],
  ['gifler', ['slap'], 'slap', 'slap', 'gifle'],
  ['tuer', ['kill'], 'shoot', 'kill', 'élimine (pour rire) 💀'],
  ['coup_de_pied', [], 'kick', 'kick', 'met un coup de pied à'],
  ['heureux', ['happy'], 'happy', 'happy', 'est heureux avec'],
  ['clin_doeil', ['wink'], 'wink', 'wink', 'fait un clin d’œil à'],
  ['pousser', ['shove'], 'punch', 'bully', 'pousse'],
  ['danser', ['dance'], 'dance', 'dance', 'danse avec'],
  ['gene', ['cringe'], 'facepalm', 'cringe', 'est gêné à cause de'],
];
const SOLO = { embête: 'embête tout le monde', 'fait un câlin à': 'veut un câlin', 'pleure devant': 'pleure', 'serre dans ses bras': 'a besoin d’un câlin', embrasse: 'envoie un baiser', 'tapote la tête de': 'se tapote la tête', 'a un sourire fier devant': 'a un sourire fier', assomme: 'se donne un coup sur la tête', lance: 'lance tout', 'rougit devant': 'rougit', 'sourit à': 'sourit', salue: 'salue tout le monde', 'tape dans la main de': 'cherche une main à taper', 'tient la main de': 'cherche une main', croque: 'croque une bouchée', mord: 'mord dans le vide', 'saute dans les bras de': 'saute de joie', gifle: 'gifle l’air', 'met un coup de pied à': 'met un coup de pied dans le vide', 'est heureux avec': 'est tout heureux', 'fait un clin d’œil à': 'fait un clin d’œil', pousse: 'pousse tout le monde', 'danse avec': 'danse', 'est gêné à cause de': 'est gêné' };

const derniers = new Map();

async function urlGif(nekos, waifu) {
  try {
    const j = await web.json(`https://nekos.best/api/v2/${nekos}`);
    const u = j.results?.[0]?.url;
    if (u) return u;
  } catch {}
  const j = await web.json(`https://api.waifu.pics/sfw/${waifu}`);
  if (!j.url) throw new Error('aucun GIF');
  return j.url;
}

module.exports = REACTIONS.map(([nom, aliases, nekos, waifu, verbe]) => ({
  name: nom,
  aliases,
  categorie: 'Réactions',
  desc: `Réaction animée : ${verbe.replace(/ \(pour rire\) 💀/, '')} quelqu’un (mentionne-le)`,
  usage: `{P}${nom} @membre — ou seul`,
  metaSiGroupe: true,
  run: async ({ sock, jid, msg, args, reply, sender, senderNum, metadata }) => {
    const dernier = derniers.get(senderNum) || 0;
    if (Date.now() - dernier < 4000) return;
    derniers.set(senderNum, Date.now());
    const cible = utils.cibles(msg, args, metadata)[0];
    const a = '@' + numero(sender);
    const legende = cible && numero(cible) !== senderNum ? `${a} ${verbe} @${numero(cible)}` : `${a} ${SOLO[verbe] || verbe}`;
    const mentions = [sender, ...(cible && numero(cible) !== senderNum ? [cible] : [])];
    try {
      const gif = await web.fichier(await urlGif(nekos, waifu), { max: 15 * 1024 * 1024 });
      const mp4 = await media.convertir({ buffer: gif.buffer, ext: /gif/i.test(gif.mime) || /\.gif/i.test(gif.url) ? 'gif' : 'mp4' }, (ins, out) => ['-i', ins[0], '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', out], 'mp4', 60000);
      await sock.sendMessage(jid, { video: mp4, gifPlayback: true, caption: legende, mentions }, { quoted: msg });
    } catch (e) {
      console.error(`[reaction ${nom}]`, e.message);
      await reply(`${legende}\n_(l’animation n’est pas disponible pour le moment)_`, mentions);
    }
  },
}));
module.exports.REACTIONS = REACTIONS;
