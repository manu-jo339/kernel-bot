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

// Décision finale pour une commande : renvoie null si autorisé, sinon un texte à afficher
function verifier(cmd, { isOwner, senderNum, mode, titulaire = false }) {
  if (isOwner) return null;
  const premium = estPremium(senderNum);
  if (cmd.ownerOnly && !(premium && !cmd.strict)) return 'proprietaire';
  if (mode === 'private' && !premium && !titulaire && !liste('publiques').includes(cmd.name)) return 'prive';
  if (mode !== 'private' && liste('premium').includes(cmd.name) && !premium) return 'premium';
  return null;
}

module.exports = {
  num, estBanni, bannir, debannir, groupeBanni, bannirGroupe, debannirGroupe,
  estPremium, infoPremium, ajouterPremium, retirerPremium, listePremium, liste, ajouterCmd, retirerCmd, verifier,
};
