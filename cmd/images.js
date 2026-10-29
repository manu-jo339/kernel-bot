// Kernel Bot — effets et montages sur les photos : envoie ou cite une image (ou mentionne quelqu'un pour utiliser sa photo de profil)
const config = require('../config');
const utils = require('../lib/utils');
const fx = require('../lib/imagefx');
const { recuperer, erreurMedia } = require('../lib/recup');

// Photo à transformer : image/sticker envoyé ou cité ; sinon photo de profil de la personne mentionnée, sinon de l'expéditeur
async function source(ctx, nom) {
  const { sock, msg, args, metadata, sender, reply } = ctx;
  const cible = utils.messageMedia(msg);
  if (cible) {
    const m = await recuperer(ctx, ['image', 'sticker'], `🖼️ Cite ou envoie une *image* avec ${config.PREFIXE}${nom}`);
    return m && m.buffer;
  }
  const qui = utils.cibles(msg, args, metadata)[0] || sender;
  try {
    const url = await sock.profilePictureUrl(qui, 'image');
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('photo indisponible');
    return Buffer.from(await r.arrayBuffer());
  } catch {
    await reply(`🖼️ Envoie ou cite une image avec ${config.PREFIXE}${nom}\n_(ou mentionne quelqu'un dont la photo de profil est visible)_`);
    return null;
  }
}

// Texte libre après la commande, sans les mentions
const motsLibres = (args) => args.filter((a) => !a.startsWith('@') && !/^\d{6,}$/.test(a)).join(' ').trim();

// [nom, alias, description, fonction(buffer, texte), 'image' | 'video']
const DEFS = [
  ['wasted', [], 'Photo en noir et blanc avec bandeau « ÉLIMINÉ »', (b) => fx.simples.wasted(b)],
  ['recherche', ['wanted'], 'Avis de recherche avec ta photo : .recherche [nom]', (b, t) => fx.recherche(b, t)],
  ['tremble', ['triggered'], 'Image qui tremble de colère (vidéo)', (b) => fx.tremble(b), 'video'],
  ['poubelle', ['trash'], 'Ta photo jetée à la poubelle', (b) => fx.poubelle(b)],
  ['tombe', ['rip'], 'Pierre tombale avec ta photo : .tombe [nom]', (b, t) => fx.tombe(b, t)],
  ['sepia', [], 'Effet sépia (vieille photo)', (b) => fx.simples.sepia(b)],
  ['arcenciel', ['rainbow'], 'Voile arc-en-ciel sur la photo', (b) => fx.simples.arcenciel(b)],
  ['couleursinversees', ['invert'], 'Inverse les couleurs (négatif)', (b) => fx.simples.couleursinversees(b)],
  ['prison', ['jail'], 'Derrière les barreaux', (b) => fx.simples.prison(b)],
  ['affect', [], '« Ça ne m’affecte pas » : photo encadrée au mur', (b) => fx.affect(b)],
  ['beau', ['beautiful'], 'Photo dans un cadre doré « C’est beau »', (b) => fx.beau(b)],
  ['flou', ['blur'], 'Floute la photo', (b) => fx.simples.flou(b)],
  ['cercle', [], 'Photo découpée en rond', (b) => fx.simples.cercle(b)],
  ['facepalm', [], 'Main sur le visage : « Sérieusement ? »', (b) => fx.facepalm(b)],
  ['gris', ['greyscale', 'grayscale'], 'Noir et blanc', (b) => fx.simples.gris(b)],
  ['blagueperdue', ['jokeoverhead'], 'La blague qui passe au-dessus de la tête', (b) => fx.blagueperdue(b)],
  ['fenetresuppression', ['deletewindow'], 'Fenêtre « Confirmer la suppression » avec ta photo', (b) => fx.fenetreSuppression(b)],
  ['sombre', ['darkness'], 'Assombrit la photo avec un effet de vignette', (b) => fx.simples.sombre(b)],
  ['coloriser', ['colorize', 'teinte'], 'Teinte la photo : .coloriser [rouge|bleu|vert|violet…] (au hasard sans couleur)', (b, t) => fx.simples.coloriser(b, t.split(/\s+/)[0])],
  ['contraste', ['contrast'], 'Augmente le contraste et la netteté', (b) => fx.simples.contraste(b)],
  ['pixeliser', ['pixelate'], 'Pixelise la photo', (b) => fx.simples.pixeliser(b)],
];

const commandes = DEFS.map(([nom, aliases, desc, fn, sortie = 'image']) => ({
  name: nom,
  aliases,
  categorie: 'Images',
  desc,
  usage: `{P}${nom} — cite ou envoie une image (ou mentionne quelqu'un)`,
  run: async (ctx) => {
    const { sock, jid, msg, args, reply } = ctx;
    const buf = await source(ctx, nom);
    if (!buf) return;
    try {
      const r = await fn(buf, motsLibres(args));
      await sock.sendMessage(jid, sortie === 'video' ? { video: r, gifPlayback: true } : { image: r }, { quoted: msg });
    } catch (e) {
      await erreurMedia(reply, e);
    }
  },
}));
commandes.DEFS = DEFS;
module.exports = commandes;
