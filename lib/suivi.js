// Kernel Bot — suivi léger d'UNE session, pour le tableau de bord de Kernel Connect (dernière activité, commandes les plus utilisées, erreurs récentes).
// Tout reste en mémoire et repart de zéro à chaque démarrage du moteur : rien n'est écrit sur disque, aucun contenu de message n'est gardé.
const MAX_ERREURS = 5;

// Un message d'erreur ne doit jamais laisser passer un numéro ou une clé : on masque les longues suites de chiffres et on coupe court
const propre = (t) => String(t || '').replace(/[\r\n\t]+/g, ' ').replace(/\d{6,}/g, '…').replace(/[A-Za-z0-9_-]{32,}/g, '…').trim().slice(0, 160);

function creer(maintenant = Date.now) {
  const depuis = maintenant();
  const commandes = new Map(); // nom -> nombre d'utilisations
  const erreurs = [];
  let derniere = null;
  let total = 0;
  let illisibles = 0;
  return {
    depuis,
    // Une commande vient d'être exécutée
    commande(nom) {
      if (!nom) return;
      commandes.set(nom, (commandes.get(nom) || 0) + 1);
      total += 1;
      derniere = maintenant();
    },
    // Une commande a échoué (le message est nettoyé)
    erreur(nom, message) {
      erreurs.unshift({ commande: String(nom || '?').slice(0, 40), message: propre(message) || 'Erreur', a: maintenant() });
      if (erreurs.length > MAX_ERREURS) erreurs.length = MAX_ERREURS;
    },
    // Un message reçu n'a pas pu être déchiffré
    illisible() {
      illisibles += 1;
    },
    instantane() {
      const top = [...commandes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([nom, n]) => ({ nom, n }));
      return { depuis, derniereActivite: derniere, commandesTraitees: total, topCommandes: top, erreurs: erreurs.map((e) => ({ ...e })), illisibles };
    },
  };
}

module.exports = { creer, propre };
