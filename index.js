// Kernel Bot — bot WhatsApp multi-appareil (Baileys), par MWENOBANGUE Labs
// Aucune télémétrie, aucun serveur tiers : les sessions restent dans les dossiers ./auth et ./sessions de cet ordinateur.
// Le chiffrement de WhatsApp (libsignal) écrit de longs messages d'erreur pour d'anciens messages illisibles
// (clés périmées après un redémarrage ou un changement d'appareil) : sans gravité, on les résume en une ligne.
let illisibles = 0;
const _erreur = console.error.bind(console);
const _info = console.info.bind(console);
const BRUIT = /^(Session error|Failed to decrypt|Closing (open )?session|Removing old closed session|Closing stale|Migrating session|Decrypted message with closed session)/;
const filtre = (orig) => (...a) => {
  if (typeof a[0] === 'string' && BRUIT.test(a[0])) {
    if (/^(Session error|Failed to decrypt)/.test(a[0])) illisibles += 1;
    return;
  }
  orig(...a);
};
console.error = filtre(_erreur);
console.info = filtre(_info);
console.warn = filtre(console.warn.bind(console));
setInterval(() => {
  if (illisibles) {
    _info(`ℹ️ ${illisibles} ancien(s) message(s) illisible(s) ignoré(s) (clés de chiffrement périmées, sans gravité).`);
    illisibles = 0;
  }
}, 60000).unref();

const config = require('./config');
const jobs = require('./lib/jobs');
const session = require('./lib/session');
const { chargerCommandes } = require('./lib/handler');

// Modules qui s'accrochent aux messages (protections, automatismes) et aux tâches programmées
require('./lib/protections');
require('./lib/presence');
for (const m of ['./lib/taches']) {
  try {
    require(m);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') console.error(`[${m}]`, e.message);
  }
}

process.on('unhandledRejection', (e) => console.error('Rejection non gérée :', e?.message || e));
process.on('uncaughtException', (e) => console.error('Erreur inattendue :', e?.message || e));

require('./lib/sante').demarrer();
chargerCommandes();
jobs.demarrer(() => {
  const s = session.principale();
  return s && s.user ? s : null;
});
session.demarrerTout().catch((e) => {
  console.error('❌ Démarrage impossible :', e.message);
  process.exit(1);
});
console.log(`🚀 ${config.NOM_BOT} démarre…`);
