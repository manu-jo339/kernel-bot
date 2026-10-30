// Kernel Bot — activation : « start » met le bot en service (à taper une fois, après la connexion du numéro), « pause » le met en sommeil.
const base = { categorie: 'Système', ownerOnly: true, strict: true };

module.exports = [
  {
    ...base,
    name: 'start',
    aliases: ['demarrer', 'commencer'],
    desc: 'Met le bot en service (à taper une fois, après la connexion du numéro)',
    run: async ({ sock, reply, config }) => {
      const p = config.PREFIXE;
      if (!sock.enAttente) return reply(`✅ Le bot est déjà en service.\n➤ ${p}menu pour voir les commandes.`);
      await sock.activation?.activer();
      sock.enAttente = false;
      console.log('▶️ Bot activé par son propriétaire (.start).');
      // Première activation : grand message de bienvenue (une seule fois) ; sinon simple confirmation
      let envoye = false;
      try {
        envoye = await require('../lib/bienvenue').envoyer(sock, require('../lib/handler').liste.length);
      } catch {}
      if (!envoye) await reply(`✅ Bot activé !\n➤ ${p}menu pour voir les commandes.\n➤ ${p}pause pour le mettre en sommeil.`);
    },
  },
  {
    ...base,
    name: 'pause',
    aliases: ['sommeil'],
    desc: 'Met le bot en sommeil : il ne répond plus à personne jusqu’au prochain .start',
    run: async ({ sock, reply, config }) => {
      const p = config.PREFIXE;
      if (sock.enAttente) return reply(`😴 Le bot est déjà en sommeil. Tape *.start* pour le remettre en service.`);
      await sock.activation?.attendre();
      sock.enAttente = true;
      console.log('⏸️ Bot mis en sommeil par son propriétaire (.pause).');
      await reply(`😴 Bot en sommeil : il ne répond plus à personne et ne réagit à rien.\nTape *.start* (ou *${p}start*) pour le remettre en service.`);
    },
  },
];
