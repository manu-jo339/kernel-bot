// Kernel Bot — lire ce qui est dans une image, un QR code ou un enregistrement : scanner, lire, transcrire, decrire
const config = require('../config');
const sharp = require('sharp');
const media = require('../lib/media');
const qr = require('../lib/qr');
const ocr = require('../lib/ocr');
const ia = require('../lib/ia');
const macle = require('../lib/macle');
const outilia = require('../lib/outilia');
const { recuperer, erreurMedia } = require('../lib/recup');
const { numero } = require('../lib/utils');

const base = { categorie: 'Outils' };

module.exports = [
  {
    ...base,
    name: 'scanner',
    aliases: ['lireqr', 'scanqr'],
    desc: 'Lit un QR code sur une image et vérifie le lien s’il y en a un',
    run: async (ctx) => {
      const { reply } = ctx;
      const m = await recuperer(ctx, ['image', 'sticker'], `📷 Cite ou envoie une image contenant un QR code avec ${config.PREFIXE}scanner`);
      if (!m) return;
      try {
        const contenu = await qr.lire(m.buffer);
        if (!contenu) return reply('❓ Aucun QR code lisible sur cette image. Essaie avec une photo plus nette et bien cadrée.');
        let verdict = '';
        if (/^https?:\/\//i.test(contenu)) {
          const reseau = require('./reseau');
          const { lireUrl } = require('../lib/reseau');
          const u = lireUrl(contenu);
          if (u) {
            const a = reseau.analyserLien(u);
            const [pastille, titre] = reseau.niveau(a.score);
            verdict = `\n\n${pastille} *${titre}* (${u.hostname})${a.pts.length ? '\n' + a.pts.slice(0, 3).map((x) => '⚠️ ' + x).join('\n') : ''}\n_Analyse locale. ${config.PREFIXE}verifierlien pour le détail._`;
          }
        }
        await reply(`📱 *Contenu du QR code :*\n${contenu.slice(0, 1500)}${verdict}`);
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    ...base,
    name: 'lire',
    aliases: ['ocr', 'lireimage', 'extrairetexte'],
    desc: 'Lit le texte d’une photo (document, affiche, capture) — français et anglais',
    run: async (ctx) => {
      const { reply } = ctx;
      const m = await recuperer(ctx, ['image', 'sticker'], `📖 Cite ou envoie une photo contenant du texte avec ${config.PREFIXE}lire`);
      if (!m) return;
      try {
        await reply('🔎 Lecture en cours…');
        const r = await ocr.lire(m.buffer);
        if (!r.texte) return reply('❓ Je n’ai trouvé aucun texte sur cette image.');
        await reply(`📖 *Texte lu* (fiabilité ${r.confiance} %)\n\n${r.texte.slice(0, 3500)}${r.confiance < 60 ? '\n\n_⚠️ Lecture peu sûre : vérifie le texte, ou envoie une photo plus nette._' : ''}\n\n_Lecture faite sur l’ordinateur du bot : l’image n’est envoyée à personne._`);
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    ...base,
    categorie: 'IA',
    name: 'transcrire',
    aliases: ['transcription', 'audiotexte', 'stt'],
    desc: 'Transforme un vocal ou un audio en texte (10 minutes maximum)',
    run: async (ctx) => {
      const { reply, sender } = ctx;
      const util = numero(sender);
      if (!macle.cles(util).groq && !process.env.GROQ_API_KEY) {
        return reply(`⚙️ La transcription utilise le service Groq (Whisper), mais aucune clé n’est configurée.\n• Propriétaire : GROQ_API_KEY dans le fichier .env\n• Ou chacun avec sa clé gratuite : ${config.PREFIXE}macle groq TA_CLÉ (en privé)`);
      }
      const m = await recuperer(ctx, ['audio', 'video'], `📝 Cite un vocal, un audio ou une vidéo avec ${config.PREFIXE}transcrire`);
      if (!m) return;
      const ext = media.extDe(m.mime, m.nom);
      try {
        const d = await media.duree(m.buffer, ext);
        if (d > 600) return reply('⚠️ Enregistrement trop long (10 minutes maximum).');
        const a = await outilia.acces(ctx);
        if (!a) return;
        const leger = await media.convertir({ buffer: m.buffer, ext }, (ins, out) => ['-i', ins[0], '-vn', '-ac', '1', '-ar', '16000', '-b:a', '40k', out], 'mp3', 120000);
        const texte = await outilia.executer(ctx, a, ({ cles }) => ia.transcrire(leger, 'audio.mp3', { cles, langue: process.env.TRANSCRIPTION_LANGUE || undefined }));
        if (texte === null) return;
        await reply(texte ? `📝 *Transcription*\n\n${texte.slice(0, 3800)}${outilia.PIED.replace('Texte traité', 'Audio traité')}` : '❓ Je n’ai rien entendu dans cet enregistrement.');
      } catch (e) {
        await erreurMedia(reply, /does not contain any stream|Output file/.test(e.message) ? new Error('aucun son dans ce fichier') : e);
      }
    },
  },
  {
    ...base,
    categorie: 'IA',
    name: 'decrire',
    aliases: ['vision', 'analyserimage', 'decrireimage'],
    desc: 'Décris une image avec l’IA : .decrire [ta question]',
    usage: '{P}decrire · {P}decrire Quelle est la marque de cette voiture ?',
    run: async (ctx) => {
      const { args, reply } = ctx;
      const m = await recuperer(ctx, ['image', 'sticker'], `🖼️ Cite ou envoie une image avec ${config.PREFIXE}decrire\n_Tu peux ajouter une question : ${config.PREFIXE}decrire Que dit ce panneau ?_`);
      if (!m) return;
      try {
        const a = await outilia.acces(ctx);
        if (!a) return;
        const jpeg = await sharp(m.buffer, { animated: false }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); // les données EXIF (lieu, appareil…) sont retirées
        const question = args.join(' ').trim().slice(0, 400);
        const consigne = (question || 'Décris cette image de façon claire et concise : ce qu’on y voit, le texte visible, le contexte.') + '\n(Réponds en français, en quelques phrases.)';
        const rep = await outilia.executer(ctx, a, ({ cles }) => ia.vision(jpeg, 'image/jpeg', consigne, { cles }));
        if (!rep) return;
        await reply(`🖼️ ${rep.texte.trim()}${outilia.PIED.replace('Texte traité', 'Image traitée')}`);
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
];
