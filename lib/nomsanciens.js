// Kernel Bot — les commandes portent NOS noms (français). Les anciens noms (style OVL) ne sont plus reconnus,
// sauf si la personne le demande : ANCIENS_NOMS=oui dans l'environnement (utile seulement pour des habitués de l'ancien bot).
module.exports = () => /^(oui|1|true|vrai)$/i.test(String(process.env.ANCIENS_NOMS || '').trim());
