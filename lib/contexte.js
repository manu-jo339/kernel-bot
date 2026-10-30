// Kernel Bot — réglages PAR SESSION (préfixe, mode, stickers) choisis par chaque utilisateur dans Kernel Connect > Paramètres.
// Pendant le traitement d'un message, « config.PREFIXE », « config.MODE »… donnent les valeurs de l'utilisateur à qui appartient la session,
// sans que les commandes aient à le savoir. En dehors (démarrage, tâches programmées), ce sont les valeurs du moteur.
const { AsyncLocalStorage } = require('async_hooks');

const stockage = new AsyncLocalStorage();
// Seuls ces réglages peuvent venir du site
const CLES = ['PREFIXE', 'MODE', 'STICKER_PACK', 'STICKER_AUTEUR']; // (CLES_IA et CLES_PARTAGEES sont lues par lib/ia.js et lib/partage.js, jamais exposées comme réglages)

const executer = (reglages, fn) => (reglages ? stockage.run(reglages, fn) : fn());
const courant = () => stockage.getStore() || null;

function envelopper(config) {
  return new Proxy(config, {
    get(cible, cle, destinataire) {
      const s = stockage.getStore();
      if (s && typeof cle === 'string' && Object.prototype.hasOwnProperty.call(s, cle)) return s[cle];
      return Reflect.get(cible, cle, cible);
    },
  });
}

// Valide ce qui vient du site (jamais de confiance aveugle) : renvoie un objet propre, ou null
function nettoyer(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const r = {};
  if (typeof brut.prefixe === 'string' && /^[^\s@\w\p{L}\p{N}]{1,3}$/u.test(brut.prefixe)) r.PREFIXE = brut.prefixe;
  if (brut.mode === 'public' || brut.mode === 'private') r.MODE = brut.mode;
  const texte = (v) => String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);
  if (typeof brut.sticker_pack === 'string' && texte(brut.sticker_pack)) r.STICKER_PACK = texte(brut.sticker_pack);
  if (typeof brut.sticker_auteur === 'string' && texte(brut.sticker_auteur)) r.STICKER_AUTEUR = texte(brut.sticker_auteur);
  // Clés d'IA de l'utilisateur (Kernel Connect > Mon IA) : utilisées pour les messages de CETTE session seulement
  const cles = require('./clesite').nettoyer(brut.ia);
  if (Object.keys(cles).length) r.CLES_IA = cles;
  // Clés partagées de la plateforme (GitHub, Giphy) : les mêmes pour tous, fournies par le site
  const partage = require('./partage').nettoyer(brut.partage);
  if (Object.keys(partage).length) r.CLES_PARTAGEES = partage;
  return r.MODE ? r : null; // sans mode valide, on n'applique rien (le mode est la protection essentielle)
}

module.exports = { executer, courant, envelopper, nettoyer, CLES };
