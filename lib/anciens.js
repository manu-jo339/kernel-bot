// Kernel Bot — anti-rejeu : après un arrêt (Ctrl+C) puis « npm start », WhatsApp peut renvoyer des messages déjà traités.
// Trois garde-fous, qui survivent aux redémarrages :
//  1. un message déjà vu (identifiant mémorisé sur disque) n'est jamais retraité ;
//  2. un message plus ancien que le dernier message traité (horloge de WhatsApp, donc sans souci de décalage avec l'ordinateur) est ignoré ;
//  3. un message plus ancien que le démarrage du bot, ou tapé il y a plus de 90 s, est ignoré.
const store = require('./store');

const MAX_IDS = 400;
// Une commande tapée il y a plus de 90 s n'est plus d'actualité (bot arrêté, redéploiement) : la traiter ferait répondre à des commandes d'hier
const AGE_MAX_S = Math.max(10, parseInt(process.env.AGE_MAX_COMMANDE_S || '90', 10) || 90);
const tsDe = (msg) => Number(msg.messageTimestamp?.low ?? msg.messageTimestamp) || 0;

function verifier(session, msg, debut, maintenant = Date.now() / 1000) {
  const ts = tsDe(msg);
  const id = `${msg.key?.remoteJid}|${msg.key?.id}`;
  const etat = store.get('anciens', session, { ts: 0, ids: [] });
  let raison = null;
  if (msg.key?.id && etat.ids.includes(id)) raison = 'déjà traité';
  else if (ts && ts < etat.ts - 1) raison = 'plus ancien que le dernier message traité';
  else if (ts && ts < debut - 5) raison = 'reçu avant le démarrage du bot';
  else if (ts && ts < maintenant - AGE_MAX_S) raison = `tapé il y a plus de ${AGE_MAX_S} s`;
  // On mémorise tout ce qui est vu (même ignoré) pour ne jamais le réévaluer au prochain démarrage
  if (msg.key?.id) etat.ids.push(id);
  if (etat.ids.length > MAX_IDS) etat.ids = etat.ids.slice(-MAX_IDS);
  if (ts > etat.ts) etat.ts = ts;
  store.set('anciens', session, etat);
  return raison;
}

module.exports = { verifier, tsDe };
