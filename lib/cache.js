// Kernel Bot — mémoire des derniers messages (pour l'anti-suppression et les citations)
const MAX = 2000;
const messages = new Map(); // id -> message

function ajouter(msg) {
  if (!msg?.key?.id || !msg.message) return;
  messages.set(msg.key.id, msg);
  if (messages.size > MAX) messages.delete(messages.keys().next().value);
}
const lire = (id) => messages.get(id) || null;

module.exports = { ajouter, lire };
