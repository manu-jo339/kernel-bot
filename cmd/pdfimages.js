// Kernel Bot — .pdf : assemble des images en un seul fichier PDF (tout se fait sur l'ordinateur du bot)
const config = require('../config');
const pdf = require('../lib/pdf');
const { telecharger, messageMedia } = require('../lib/utils');

const piles = new Map(); // numéro -> { images: [Buffer], ts }
const MAX_IMAGES = 20, MAX_OCTETS = 20 * 1024 * 1024, DUREE = 30 * 60e3;
const estJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;
const estPng = (b) => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const pile = (n) => {
  const p = piles.get(n);
  if (p && Date.now() - p.ts < DUREE) return p;
  const neuve = { images: [], ts: Date.now() };
  piles.set(n, neuve);
  return neuve;
};

module.exports = [
  {
    name: 'pdf',
    aliases: ['topdf', 'imagespdf'],
    categorie: 'Outils',
    desc: 'Transforme des images en PDF : envoie/cite des images avec .pdf puis .pdf creer',
    usage: '{P}pdf (sur une image) · {P}pdf creer [nom] · {P}pdf vider · {P}pdf liste',
    run: async ({ sock, msg, jid, args, reply, senderNum }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const pl = pile(senderNum);
      if (sous === 'vider') { piles.delete(senderNum); return reply('🗑️ Pile d’images vidée.'); }
      if (sous === 'liste') return reply(`📄 ${pl.images.length} image(s) dans ta pile.`);
      if (sous === 'creer' || sous === 'créer' || sous === 'fini') {
        if (!pl.images.length) return reply(`📄 Ta pile est vide. Envoie une image avec la légende ${p}pdf, ou cite une image avec ${p}pdf.`);
        try {
          const buf = await pdf.images(pl.images);
          const nom = (args.slice(1).join(' ').replace(/[^\p{L}\p{N} _.-]/gu, '').trim() || 'document').slice(0, 40);
          await sock.sendMessage(jid, { document: buf, mimetype: 'application/pdf', fileName: nom + '.pdf', caption: `📄 PDF de ${pl.images.length} page(s).` }, { quoted: msg });
          piles.delete(senderNum);
        } catch (e) {
          console.error('[pdf]', e.message);
          await reply('⚠️ Impossible de créer le PDF : ' + e.message);
        }
        return;
      }
      if (!messageMedia(msg)) {
        return reply(`📄 *Images → PDF*\n1. Envoie une image avec la légende ${p}pdf (ou cite une image avec ${p}pdf). Répète pour chaque page.\n2. Tape ${p}pdf creer [nom] pour recevoir le fichier.\n\n_Formats acceptés : JPEG et PNG. ${p}pdf vider pour recommencer._`);
      }
      let media;
      try {
        media = await telecharger(sock, msg);
      } catch {
        return reply('⚠️ Impossible de récupérer cette image.');
      }
      if (!media || media.type !== 'image') return reply('❓ Ce n’est pas une image.');
      if (!estJpeg(media.buffer) && !estPng(media.buffer)) return reply('❌ Format non pris en charge : utilise une image JPEG ou PNG (les stickers/WebP ne sont pas acceptés).');
      const total = pl.images.reduce((a, b) => a + b.length, 0) + media.buffer.length;
      if (pl.images.length >= MAX_IMAGES) return reply(`⚠️ Maximum ${MAX_IMAGES} images. Tape ${p}pdf creer.`);
      if (total > MAX_OCTETS) return reply(`⚠️ Trop volumineux (20 Mo max). Tape ${p}pdf creer pour générer ce que tu as déjà.`);
      pl.images.push(media.buffer);
      pl.ts = Date.now();
      await reply(`✅ Image ${pl.images.length} ajoutée. Envoie-en d’autres avec ${p}pdf, ou tape *${p}pdf creer*.`);
    },
  },
];
