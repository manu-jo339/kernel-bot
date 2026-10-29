// Kernel Bot — anti-rejeu : après un arrêt (Ctrl+C) puis « npm start », WhatsApp peut renvoyer des messages déjà traités.
// Trois garde-fous, qui survivent aux redémarrages :
//  1. un message déjà vu (identifiant mémorisé sur disque) n'est jamais retraité ;
//  2. un message plus ancien que le dernier message traité (horloge de WhatsApp, donc sans souci de décalage avec l'ordinateur) est ignoré ;
//  3. un message plus ancien que le démarrage du bot est ignoré.
const store = require('./store');

const MAX_IDS = 400;
const tsDe = (msg) => Number(msg.messageTimestamp?.low ?? msg.messageTimestamp) || 0;

function verifier(session, msg, debut) {
  const ts = tsDe(msg);
  const id = `${msg.key?.remoteJid}|${msg.key?.id}`;
  const etat = store.get('anciens', session, { ts: 0, ids: [] });
  let raison = null;
  if (msg.key?.id && etat.ids.includes(id)) raison = 'déjà traité';
  else if (ts && ts < etat.ts - 1) raison = 'plus ancien que le dernier message traité';
  else if (ts && ts < debut - 5) raison = 'reçu avant le démarrage du bot';
  // On mémorise tout ce qui est vu (même ignoré) pour ne jamais le réévaluer au prochain démarrage
  if (msg.key?.id) etat.ids.push(id);
  if (etat.ids.length > MAX_IDS) etat.ids = etat.ids.slice(-MAX_IDS);
  if (ts > etat.ts) etat.ts = ts;
  store.set('anciens', session, etat);
  return raison;
}

module.exports = { verifier, tsDe };
