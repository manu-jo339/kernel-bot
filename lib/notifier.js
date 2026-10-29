// Kernel Bot — prévenir le propriétaire en privé (nouvelle commande, suggestion, signalement…)
const config = require('../config');

async function prevenirProprio(sock, texte) {
  for (const n of config.OWNERS.slice(0, 2)) {
    try {
      await sock.sendMessage(n + '@s.whatsapp.net', { text: texte });
    } catch (e) {
      console.error('[notification] impossible :', e.message);
    }
  }
}
module.exports = { prevenirProprio };
