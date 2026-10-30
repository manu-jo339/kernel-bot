// Kernel Bot — qui a le droit d'utiliser le bot : bannis, premium, commandes publiques/premium
const store = require('./store');
const config = require('./config_ref');

const num = (x) => String(x || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// Bannis (utilisateurs et groupes)
const estBanni = (n) => !!store.get('ban', 'u:' + num(n));
const bannir = (n, raison = '') => store.set('ban', 'u:' + num(n), { ts: Date.now(), raison });
const debannir = (n) => store.del('ban', 'u:' + num(n)) > 0;
const groupeBanni = (jid) => !!store.get('ban', 'g:' + jid);
const bannirGroupe = (jid, raison = '') => store.set('ban', 'g:' + jid, { ts: Date.now(), raison });
const debannirGroupe = (jid) => store.del('ban', 'g:' + jid) > 0;

// Premium (personnes de confiance)
// Un accès premium peut avoir une date de fin (licence) ; sans date, il dure jusqu'à retrait
const infoPremium = (n) => {
  const d = store.get('premium', num(n));
  return d && (!d.jusque || d.jusque > Date.now()) ? d : null;
};
const estPremium = (n) => !!infoPremium(n);
const ajouterPremium = (n, jusque = 0) => store.set('premium', num(n), { ts: Date.now(), jusque });
const retirerPremium = (n) => store.del('premium', num(n)) > 0;
const listePremium = () => store.liste('premium').filter((x) => !x.data?.jusque || x.data.jusque > Date.now()).map((x) => x.id);

// Listes de commandes : publiques (utilisables par tous même en mode privé) et premium (réservées en mode public)
const liste = (nom) => (store.get('perm', nom, { cmds: [] }) || { cmds: [] }).cmds;
const ajouterCmd = (nom, cmd) => {
  const l = new Set(liste(nom));
  l.add(cmd);
  store.set('perm', nom, { cmds: [...l] });
};
const retirerCmd = (nom, cmd) => {
  const l = liste(nom).filter((x) => x !== cmd);
  store.set('perm', nom, { cmds: l });
};

// ───── Qui peut quoi ─────
// 1) Celui qui a SON bot (son numéro connecté : moteur personnel, bot principal, ou session à son nom) utilise TOUTES les commandes.
//    Seule exception : « diagnostic », réservée à l'administrateur de la plateforme (le développeur : config.ADMINS).
// 2) Sur un moteur PARTAGÉ (la session d'un numéro ajouté à un moteur qui n'est pas le sien), le titulaire a tout sauf ce qui agit sur le serveur lui-même.
// 3) Les autres personnes (celles qui écrivent au bot d'un autre) : les commandes ouvertes, jamais celles qui pilotent le compte, le serveur ou les données des autres.
const OUVERTES = new Set([
  'facture', 'stock', 'vueunique', 'creergroupe', 'jid', 'supprimer', 'sauverstatut', 'recevoirstatut',
  'voirstickers', 'voirmention', 'listecommandespubliques', 'listecommandespremium',
]);
// Agissent sur le serveur partagé lui-même : refusées au titulaire d'une session d'un autre
const SERVEUR_PARTAGE = new Set(['redemarrer', 'connecter', 'deconnecter', 'numerosconnectes', 'maj', 'verifiermaj', 'ytdlp', 'regler', 'supprimerreglage', 'voirreglage', 'sauvegarde', 'rapport']);
// Jamais ouvertes aux autres personnes (même avec COMMANDES_OUVERTES)
const PROTEGEES = new Set([
  'diagnostic', 'start', 'pause', ...SERVEUR_PARTAGE,
  'bio', 'maphoto', 'confidentialite', 'vudernier', 'enligne', 'monstatut', 'coches', 'ajoutgroupe', 'bloquer', 'debloquer', 'viderdiscussion',
  'ajouterpremium', 'retirerpremium', 'listepremium', 'commandepublique', 'retirercommandepublique', 'commandepremium', 'retirercommandepremium',
  'diffusion', 'bannir', 'debannir', 'bannirgroupe', 'debannirgroupe',
]);
// Le propriétaire peut ouvrir d'autres commandes aux autres personnes dans COMMANDES_OUVERTES (noms séparés par des virgules) ; jamais les PROTÉGÉES.
const ouvertesParLeProprietaire = () => new Set(String(process.env.COMMANDES_OUVERTES || '').toLowerCase().split(/[\s,;]+/).filter((x) => x && !PROTEGEES.has(x)));
const ouverte = (nom) => OUVERTES.has(nom) || ouvertesParLeProprietaire().has(nom);

// Décision finale pour une commande : renvoie null si autorisé, sinon la raison du refus
//  isOwner : propriétaire de ce bot · titulaire : titulaire d'une session ajoutée à un moteur partagé · admin : administrateur de la plateforme
function verifier(cmd, { isOwner, senderNum, mode, titulaire = false, admin = false }) {
  // MODE PRIVÉ : il n'y a que le propriétaire de ce bot (et le titulaire de sa propre session). Les autres sont ignorés en SILENCE : aucune réponse,
  // aucun refus, quelle que soit la commande — pas d'exception (ni premium, ni commandes publiques). Seul l'administrateur de la plateforme garde « diagnostic ».
  if (mode === 'private' && !isOwner && !titulaire && !(admin && cmd.name === 'diagnostic')) return 'prive';
  if (cmd.name === 'diagnostic') return admin ? null : 'admin';
  if (isOwner) return null;
  if (titulaire) return SERVEUR_PARTAGE.has(cmd.name) ? 'serveur' : null;
  const premium = estPremium(senderNum);
  if (cmd.ownerOnly && !ouverte(cmd.name) && !(premium && !cmd.strict)) return 'proprietaire';
  if (liste('premium').includes(cmd.name) && !premium) return 'premium';
  return null;
}

module.exports = {
  num, estBanni, bannir, debannir, groupeBanni, bannirGroupe, debannirGroupe,
  estPremium, infoPremium, ajouterPremium, retirerPremium, listePremium, liste, ajouterCmd, retirerCmd, verifier, OUVERTES, SERVEUR_PARTAGE, PROTEGEES,
};
