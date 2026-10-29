// Kernel Bot — assistants à base d'IA : résumer, corriger, rédiger, traduire
const outil = require('../lib/outilia');
const { messageCite, extraireTexte } = require('../lib/utils');

const base = { categorie: 'IA' };
// Texte visé : celui écrit après la commande, sinon le message cité
function texteVise(msg, args) {
  const direct = args.join(' ').trim();
  if (direct) return direct;
  const c = messageCite(msg);
  return c ? extraireTexte(c.message).trim() : '';
}

module.exports = [
  {
    ...base,
    name: 'resume',
    aliases: ['resumer', 'summary'],
    desc: 'Résume un texte (écris-le ou réponds à un message)',
    run: async (ctx) => {
      const t = texteVise(ctx.msg, ctx.args);
      if (t.length < 80) return ctx.reply(`✏️ Réponds à un long message avec ${ctx.config.PREFIXE}resume, ou écris le texte après la commande (au moins quelques phrases).`);
      const r = await outil.tache(ctx, 'Tu résumes des textes en français, de façon fidèle, claire et courte : 3 à 6 puces maximum, sans rien inventer. Si le texte est dans une autre langue, résume-le quand même en français.', t);
      if (r) await ctx.reply(`📌 *Résumé*\n\n${r}`);
    },
  },
  {
    ...base,
    name: 'corriger',
    aliases: ['correction', 'orthographe'],
    desc: 'Corrige l’orthographe et la grammaire d’un texte',
    run: async (ctx) => {
      const t = texteVise(ctx.msg, ctx.args);
      if (!t) return ctx.reply(`✏️ ${ctx.config.PREFIXE}corriger ton texte avec des fautes  (ou réponds à un message)`);
      const r = await outil.tache(ctx, "Tu corriges l'orthographe, la grammaire et la ponctuation du texte donné, dans sa langue d'origine, sans changer le sens ni le style. Réponds UNIQUEMENT avec le texte corrigé, sans commentaire.", t);
      if (r) await ctx.reply(`✅ *Texte corrigé*\n\n${r}`);
    },
  },
  {
    ...base,
    name: 'rediger',
    aliases: ['ecrire_texte', 'redaction'],
    desc: 'Rédige un message, un mail, une annonce… : .rediger mail de relance client',
    run: async (ctx) => {
      const t = ctx.args.join(' ').trim() || (messageCite(ctx.msg) ? extraireTexte(messageCite(ctx.msg).message) : '');
      if (!t) return ctx.reply(`✏️ Dis-moi quoi rédiger. Exemples :\n${ctx.config.PREFIXE}rediger mail poli pour demander un devis\n${ctx.config.PREFIXE}rediger annonce de vente d'un téléphone`);
      const r = await outil.tache(ctx, "Tu rédiges des textes en français clair, poli et professionnel, prêts à être copiés-collés (message WhatsApp, e-mail, annonce, lettre…). Reste concis. N'invente aucune information personnelle : utilise des [crochets] pour les éléments à compléter.", t);
      if (r) await ctx.reply(`📝 *Proposition*\n\n${r}`);
    },
  },
  {
    ...base,
    name: 'translate',
    aliases: ['traduire', 'tr'],
    desc: 'Traduit un texte : .traduire en anglais Bonjour',
    run: async (ctx) => {
      let args = [...ctx.args];
      let langue = 'français';
      const m = args.join(' ').match(/^(?:en|vers|->|→)\s+(\p{L}+)\s*(.*)$/isu);
      if (m) {
        langue = m[1];
        args = [m[2]];
      }
      const t = texteVise(ctx.msg, args);
      if (!t) return ctx.reply(`🌍 Exemples :\n${ctx.config.PREFIXE}traduire en anglais Bonjour, comment vas-tu ?\n${ctx.config.PREFIXE}traduire (en répondant à un message : traduit en français)`);
      const r = await outil.tache(ctx, `Tu es un traducteur. Traduis le texte donné en ${langue}. Réponds UNIQUEMENT avec la traduction.`, t);
      if (r) await ctx.reply(`🌍 *Traduction (${langue})*\n\n${r}`);
    },
  },
];
