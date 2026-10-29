// ═══════════════════════════════════════════════════════════════
//  MODÈLE DE COMMANDE — MWENOBANGUE Labs
//  Les fichiers dont le nom commence par "_" ne sont PAS chargés.
//  Pour créer une commande : copie ce fichier dans le dossier cmd/
//  sous un autre nom (ex : cmd/mescommandes.js), sans le "_",
//  modifie-le, puis redémarre le bot.
// ═══════════════════════════════════════════════════════════════

module.exports = [
  {
    name: 'bonjour',               // la commande s'écrit : .bonjour
    aliases: ['salut', 'hello'],   // autres noms possibles (facultatif)
    categorie: 'Général',          // sert à ranger la commande dans le menu
    desc: 'Dit bonjour',           // description affichée dans le menu

    // Restrictions (facultatif) — mets true pour activer :
    // ownerOnly: true,            // réservé au propriétaire du bot
    // groupOnly: true,            // fonctionne uniquement dans un groupe
    // adminOnly: true,            // réservé aux admins du groupe

    run: async ({ sock, msg, jid, args, reply, sender, isGroup, isOwner, config }) => {
      // args    : mots écrits après la commande  (.bonjour Paul  =>  ['Paul'])
      // reply() : répond en citant le message
      // sock    : connexion WhatsApp (pour envoyer images, audios, etc.)
      const prenom = args.join(' ') || 'ami';
      await reply(`👋 Bonjour ${prenom} !\n_${config.SIGNATURE}_`);
    },
  },
];
