// Kernel Bot — points d'expérience (XP) et niveaux : on gagne de l'XP en discutant (1 fois par minute au maximum)
const store = require('./store');
const { numero } = require('./utils');

const niveauDe = (xp) => Math.floor(Math.sqrt(xp / 50));
const xpPour = (niveau) => niveau * niveau * 50;
const cle = (jid, n) => `${jid}|${numero(n)}`;

function lire(jid, n) {
  const d = store.get('xp', cle(jid, n), { xp: 0, msgs: 0, dernier: 0 });
  return { ...d, niveau: niveauDe(d.xp) };
}

// Renvoie { niveau, monte } ou null si le message ne rapporte rien (trop rapproché)
function gagner(jid, n, nom = '') {
  const d = store.get('xp', cle(jid, n), { xp: 0, msgs: 0, dernier: 0 });
  d.msgs += 1;
  if (nom) d.nom = String(nom).slice(0, 40);
  d.j = n; // identifiant complet (pour les mentions)
  const maintenant = Date.now();
  let monte = false;
  if (maintenant - d.dernier >= 60000) {
    const avant = niveauDe(d.xp);
    d.xp += 5 + Math.floor(Math.random() * 11);
    d.dernier = maintenant;
    monte = niveauDe(d.xp) > avant;
  }
  store.set('xp', cle(jid, n), d);
  return { niveau: niveauDe(d.xp), monte, xp: d.xp };
}

// Classement d'un groupe : [{ numero, xp, niveau, msgs }]
function classement(jid, nombre = 10) {
  const prefixe = jid + '|';
  return store
    .liste('xp')
    .filter((x) => x.id.startsWith(prefixe))
    .map((x) => ({ numero: x.id.slice(prefixe.length), ...x.data, niveau: niveauDe(x.data.xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, nombre);
}

module.exports = { lire, gagner, classement, niveauDe, xpPour };
