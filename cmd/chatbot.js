// MWENOBANGUE Labs — commandes du chatbot : .ia, .chatbot, .oublier
const db = require('../lib/db');
const ia = require('../lib/ia');
const bot = require('../lib/chatbot');

const cleDiscussion = (ctx) => (ctx.isGroup ? 'g:' : 'p:') + bot.numero(ctx.jid);

module.exports = [
  {
    name: 'ia',
    aliases: ['ai', 'question'],
    categorie: 'IA',
    desc: "Pose une question à l'IA (ex. .ia Explique-moi la blockchain)",
    async run(ctx) {
      const q = ctx.args.join(' ').trim();
      if (!q) return ctx.reply(`✍️ Écris ta question après la commande. Exemple : ${ctx.config.PREFIXE}ia Qui a inventé le téléphone ?`);
      if (!bot.globalActif()) return ctx.reply('🔕 Le chatbot est désactivé par le propriétaire.');
      await bot.poserQuestion(ctx, q, true);
    },
  },

  {
    name: 'oublier',
    aliases: ['reset', 'effacer'],
    categorie: 'IA',
    desc: "Efface la mémoire de la conversation avec l'IA",
    metaSiGroupe: true,
    async run(ctx) {
      const cle = cleDiscussion(ctx);
      const tout = (ctx.args[0] || '').toLowerCase() === 'tout';
      if (ctx.isGroup && !tout) {
        const n = db.oublierUtilisateur(cle, bot.numero(ctx.sender));
        return ctx.reply(n ? '🧹 Tes messages ont été effacés de ma mémoire. (Pour effacer tout le groupe : ' + ctx.config.PREFIXE + 'oublier tout, réservé aux admins.)' : '🧹 Je n’avais rien de toi en mémoire.');
      }
      if (ctx.isGroup && tout && !(ctx.isAdmin || ctx.isOwner)) return ctx.reply(ctx.config.PERSO.messages.reserveAdmin);
      db.oublierTout(cle);
      return ctx.reply('🧹 Mémoire effacée. On repart de zéro !');
    },
  },

  {
    name: 'chatbot',
    aliases: ['bot'],
    categorie: 'IA',
    desc: 'Active ou coupe le chatbot ici (on / off / statut)',
    metaSiGroupe: true,
    async run(ctx) {
      const { args, isGroup, isAdmin, isOwner, reply, config } = ctx;
      const P = config.PREFIXE;
      const sous = (args[0] || 'statut').toLowerCase();
      const chat = cleDiscussion(ctx);

      // ----- Réservé au propriétaire -----
      if (sous === 'global') {
        if (!isOwner) return reply(config.PERSO.messages.reserveProprietaire);
        const v = (args[1] || '').toLowerCase();
        if (!['on', 'off'].includes(v)) return reply(`Utilise : ${P}chatbot global on  ou  ${P}chatbot global off`);
        db.ecrire('ia_global', v);
        return reply(v === 'on' ? '✅ Chatbot allumé pour tout le monde.' : '🔕 Chatbot éteint partout (même pour les commandes .ia).');
      }
      if (sous === 'services') {
        if (!isOwner) return reply(config.PERSO.messages.reserveProprietaire);
        const lignes = ia.apercu().map((s) => `• *${s.nom}* (${s.modele}) : ${s.statut}${s.erreur ? `\n   dernière erreur : ${s.erreur.slice(0, 80)}` : ''}`);
        return reply('🔌 *Services d’IA* (dans l’ordre de relais)\n' + lignes.join('\n'));
      }

      // ----- Activer / couper ici -----
      if (sous === 'on' || sous === 'off') {
        if (isGroup && !(isAdmin || isOwner)) return reply(config.PERSO.messages.reserveAdmin);
        const actif = sous === 'on';
        db.definirActif(chat, actif);
        if (!actif) return reply('🔕 Chatbot désactivé ici.');
        if (!bot.iaDisponible()) return reply("✅ Activé, mais aucune clé d'IA n'est configurée pour le moment (ajoute-en une sur Kernel Connect (Paramètres > Mon IA)).");
        if (isGroup) {
          await bot.envoyerAvis(ctx.sock, ctx.jid, ctx.msg, true);
          return;
        }
        return reply('✅ Chatbot activé. Écris-moi simplement ton message !');
      }

      // ----- Statut -----
      const etat = db.etatActif(chat);
      const r = bot.reglages();
      const ici = isGroup ? (etat === true ? 'activé' : 'désactivé') : etat === false ? 'désactivé' : etat === true || r.priveParDefaut ? 'activé' : 'désactivé';
      const util = bot.numero(ctx.sender);
      return reply(
        `🤖 *Chatbot*\n• Ici : ${ici}\n• Global : ${bot.globalActif() ? 'allumé' : 'éteint'}\n` +
          `• Tes messages aujourd'hui : ${db.usageAujourdhui(util)}/${isOwner ? '∞' : r.limiteJour}\n` +
          `• Mémoire gardée : ${r.jours} jours\n\n` +
          `${P}chatbot on / off — activer ou couper ici${isGroup ? ' (admins)' : ''}\n` +
          `${P}oublier — effacer ma mémoire de toi` +
          (isOwner ? `\n${P}chatbot global on|off\n${P}chatbot services` : '')
      );
    },
  },
];
