// Kernel Bot — clés d'IA enregistrées par l'utilisateur sur Kernel Connect (Paramètres > Mon IA).
// Le site les chiffre (AES-256-GCM, format « v1.iv.tag.données » en base64url) avec ENGINES_KEY.
//  • Moteur relié au site : le site les déchiffre et les envoie lui-même (opération « profile »), rien à faire ici.
//  • Moteur qui lit Supabase directement (instances de la plateforme) : il les déchiffre ici, avec la MÊME variable ENGINES_KEY.
// Une clé n'est jamais écrite dans les journaux.
const crypto = require('crypto');

const FOURNISSEURS = ['mistral', 'gemini', 'groq'];

function dechiffrer(valeur, cleBase64 = process.env.ENGINES_KEY) {
  try {
    const cle = Buffer.from(String(cleBase64 || ''), 'base64');
    if (cle.length !== 32) return null;
    const [v, iv, tag, data] = String(valeur || '').split('.');
    if (v !== 'v1' || !iv || !tag || !data) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Valeur chiffrée (colonne ai_keys_enc) → { mistral: 'clé', … } ; objet vide si illisible
function lire(valeur, cleBase64) {
  const clair = dechiffrer(valeur, cleBase64);
  if (!clair) return {};
  try {
    return nettoyer(JSON.parse(clair));
  } catch {
    return {};
  }
}

// Ne garde que les services connus et des clés d'allure valide (aucun espace, 15 à 300 caractères)
function nettoyer(brut) {
  const r = {};
  if (!brut || typeof brut !== 'object') return r;
  for (const k of FOURNISSEURS) if (typeof brut[k] === 'string' && /^\S{15,300}$/.test(brut[k])) r[k] = brut[k];
  return r;
}

module.exports = { FOURNISSEURS, dechiffrer, lire, nettoyer };
