// Kernel Bot — réglages globaux du bot (modifiables par les commandes du propriétaire)
const store = require('./store');

const DEFAUTS = {
  theme: 'kernel',
  reactionCommande: true,   // réaction ⏳ → ✅/❌ sur chaque commande reçue
  lireauto: false,      // marque les messages comme lus
  reagirauto: false,    // réagit aux messages
  emojiReaction: '🪄',
  antiappel: false,
  messageAppel: "📵 Je ne réponds pas aux appels. Écris-moi un message.",
  antisuppression: false,        // ancien interrupteur unique : vaut pour « privé » et « groupes » tant qu'ils n'ont pas leur propre réglage
  antisuppressionPrive: null,    // messages supprimés en discussion privée (null = suit « antisuppression »)
  antisuppressionGroupes: null,  // messages supprimés dans les groupes (null = suit « antisuppression »)
  antisuppressionStatuts: false, // statuts supprimés (toujours renvoyés au propriétaire, jamais « ici »)
  antisuppressionVers: 'ici', // ici | proprio (privé et groupes)
  niveau: true,         // message de passage de niveau
  mentionMessage: '',   // réponse automatique quand le propriétaire est mentionné
  mentionActif: false,
  absentActif: false,   // réponse automatique « je suis absent » en privé
  absentMessage: '',
  statutLire: false,        // lit automatiquement les statuts des contacts
  statutAimer: false,       // réagit aux statuts par un emoji
  statutEmoji: '💚',
  statutTelecharger: false, // envoie en privé au propriétaire chaque nouveau statut
  presenceMode: 'aucune',   // aucune | ecrit | enregistre | enligne | hors
  presenceOu: 'tous',       // tous | prive | groupe
};

const brut = () => store.get('global', 'reglages', {}) || {};
const lire = () => ({ ...DEFAUTS, ...brut() });
// On n'enregistre que ce qui a été changé : les valeurs par défaut restent modifiables par une mise à jour du bot
const ecrire = (patch) => store.set('global', 'reglages', { ...brut(), ...patch });

// Anti-suppression : état de chaque type (prive | groupes | statuts) à partir des réglages lus
const antisuppressionEtat = (r = lire()) => ({
  prive: r.antisuppressionPrive == null ? !!r.antisuppression : !!r.antisuppressionPrive,
  groupes: r.antisuppressionGroupes == null ? !!r.antisuppression : !!r.antisuppressionGroupes,
  statuts: !!r.antisuppressionStatuts,
});

module.exports = { lire, ecrire, DEFAUTS, antisuppressionEtat };
