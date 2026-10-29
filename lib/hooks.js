// Kernel Bot — « crochets » : fonctions exécutées sur chaque message avant le traitement des commandes.
// Un crochet qui renvoie true arrête le traitement du message (ex. : message supprimé par l'antilien).
const liste = [];

const avant = (nom, fn) => liste.push({ nom, fn });

async function executer(ctx) {
  for (const h of liste) {
    try {
      if ((await h.fn(ctx)) === true) return true;
    } catch (e) {
      console.error(`[crochet:${h.nom}]`, e.message);
    }
  }
  return false;
}

module.exports = { avant, executer };
