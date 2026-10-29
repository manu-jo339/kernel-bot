// Kernel Bot — présence automatique : le bot peut apparaître « en train d'écrire », « d'enregistrer un vocal », « en ligne » ou « hors ligne ».
// Réglé avec la commande « presence » (propriétaire).
const hooks = require('./hooks');
const reglages = require('./reglages');

const TYPES = { ecrit: 'composing', enregistre: 'recording', enligne: 'available', hors: 'unavailable' };
const dernier = new Map();

hooks.avant('presence', async ({ sock, msg, jid, isGroup }) => {
  if (msg.key.fromMe) return false;
  const r = reglages.lire();
  const type = TYPES[r.presenceMode];
  if (!type) return false;
  if (r.presenceOu === 'prive' && isGroup) return false;
  if (r.presenceOu === 'groupe' && !isGroup) return false;
  const k = jid;
  if (Date.now() - (dernier.get(k) || 0) < 8000) return false;
  dernier.set(k, Date.now());
  if (dernier.size > 300) dernier.delete(dernier.keys().next().value);
  sock.sendPresenceUpdate(type, jid).catch(() => {});
  return false;
});

module.exports = { TYPES };
