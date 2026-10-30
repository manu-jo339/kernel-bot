// MWENOBANGUE Labs — configuration du bot
// Réglages techniques : fichier .env  |  Textes et apparence : personnalisation.json
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const chiffres = (v) => String(v || '').replace(/\D/g, '');

let perso = {};
try {
  perso = JSON.parse(fs.readFileSync(path.join(__dirname, 'personnalisation.json'), 'utf8'));
} catch (e) {
  console.error('[config] personnalisation.json illisible, valeurs par défaut utilisées :', e.message);
}

module.exports = {
  PREFIXE: process.env.PREFIXE || '.',
  MODE: (process.env.MODE || 'public').toLowerCase(),
  NOM_BOT: 'Kernel Bot', // nom officiel : fixe, ni le .env ni une commande ne peuvent le changer
  // Nom du propriétaire (affiché dans le menu, comme « Owner » dans l'ancien bot) : à renseigner dans .env
  NOM_OWNER: (process.env.NOM_OWNER || '').trim().slice(0, 30),
  NUMERO_BOT: chiffres(process.env.NUMERO_BOT),
  OWNERS: (process.env.NUMERO_OWNER || '')
    .split(',')
    .map(chiffres)
    .filter(Boolean),
  // Chaîne WhatsApp du projet (assistance) : lien d'invitation, facultatif
  CHAINE_URL: (process.env.CHAINE_URL || '').trim(),
  BIENVENUE: (process.env.BIENVENUE || 'oui').toLowerCase() !== 'non',
  SIGNATURE: perso.signature || 'MWENOBANGUE Labs',
  // Contact affiché par la commande « createur »
  CREATEUR: {
    nom: (perso.createur && perso.createur.nom) || 'MWENOBANGUE',
    numero: chiffres(perso.createur && perso.createur.numero),
    pays: (perso.createur && perso.createur.pays) || '',
    organisation: (perso.createur && perso.createur.organisation) || '',
  },
  PERSO: {
    menu: { titre: '🤖 {NOM_BOT}', pied: '', afficherDescriptions: true, ...(perso.menu || {}) },
    emojis: { categories: {}, reaction: '🪄', ...(perso.emojis || {}) },
    messages: {
      reserveProprietaire: '⛔ Commande réservée au propriétaire du bot.',
      reserveGroupe: '👥 Cette commande fonctionne uniquement dans un groupe.',
      reserveAdmin: '⛔ Commande réservée aux administrateurs du groupe.',
      erreur: '⚠️ Une erreur est survenue pendant l’exécution de la commande.',
      ...(perso.messages || {}),
    },
    commandesDesactivees: (perso.commandesDesactivees || []).map((c) => String(c).toLowerCase()),
    noms: perso.noms && typeof perso.noms === 'object' ? Object.fromEntries(Object.entries(perso.noms).filter(([k]) => !k.startsWith('_'))) : {},
    chatbot: {
      personnalite:
        'Tu es {NOM_BOT}, un assistant WhatsApp créé par MWENOBANGUE Labs à Brazzaville. ' +
        'Tu réponds en français simple, de façon claire, chaleureuse et courte (WhatsApp). ' +
        'Si on te parle dans une autre langue, tu réponds dans cette langue. ' +
        "Tu ne prétends jamais être humain. Si tu ne sais pas, dis-le honnêtement. Tu n'inventes pas de faits.",
      avis:
        "👋 *Bienvenue ! Je suis {NOM_BOT}, un assistant intelligent.*\n\n" +
        "Avant de commencer, trois choses à savoir :\n" +
        "• Tes messages sont traités par des services d'intelligence artificielle extérieurs (Mistral, Cerebras, Groq). " +
        "Chez Mistral (offre gratuite), les messages peuvent servir à améliorer ses modèles.\n" +
        "• *N'écris jamais* de mot de passe, code bancaire, pièce d'identité ou information très personnelle.\n" +
        "• Je garde un historique de la conversation pendant {JOURS} jours pour mieux te répondre. " +
        "Tape *{PREFIXE}oublier* pour l'effacer à tout moment, ou *{PREFIXE}chatbot off* pour que je ne réponde plus.\n\n" +
        "Limite : {LIMITE} messages par jour. ✅ Tu peux maintenant m'écrire !",
      limiteAtteinte: "⏳ Tu as atteint la limite de {LIMITE} messages pour aujourd'hui. Reviens demain, ou demande au propriétaire du bot.",
      indisponible: '😴 Je suis très sollicité en ce moment. Réessaie dans quelques minutes.',
      desactive: '🔕 Chatbot désactivé ici. Pour le réactiver : {PREFIXE}chatbot on',
      ...(perso.chatbot || {}),
    },
  },
};

// Réglages modifiés par message WhatsApp (commande « regler ») : ils passent avant le fichier .env
require('./lib/ajustements').charger(module.exports);
