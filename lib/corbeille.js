// Kernel Bot — corbeille des membres retirés d'un groupe (30 jours) : permet de les remettre avec « reajouter ».
// On y note ceux qui ont été RETIRÉS par quelqu'un (jamais ceux qui sont partis d'eux-mêmes). Quelqu'un qui revient dans le groupe en sort aussitôt.
const store = require('./store');
const { numero } = require('./utils');

const DUREE = 30 * 86400000;
const MAX = 1000; // par groupe

const nums = (ids) => [...new Set([].concat(ids).filter(Boolean).map((x) => numero(x)).filter(Boolean))];
const valide = (liste) => (liste || []).filter((x) => x && x.ts > Date.now() - DUREE);
const lire = (groupe) => valide(store.get('corbeille', groupe, []));

// membres : [{ ids: [jid, lid, numéro…], jid: adresse à utiliser pour réajouter, tel: numéro de téléphone s'il est connu }] ; par : numéro de l'auteur
function noter(groupe, membres, par = '') {
  let liste = lire(groupe);
  for (const m of membres || []) {
    const ids = nums([m.jid, m.tel, ...(m.ids || [])]);
    if (!ids.length) continue;
    const i = liste.findIndex((x) => x.ids.some((n) => ids.includes(n)));
    const ancien = i >= 0 ? liste[i] : null;
    const e = {
      ids: [...new Set([...(ancien?.ids || []), ...ids])],
      // l'adresse « téléphone » est la seule qui permette sûrement de réajouter
      jid: m.tel ? `${numero(m.tel)}@s.whatsapp.net` : ancien?.jid && /@s\.whatsapp\.net$/.test(ancien.jid) ? ancien.jid : m.jid || ancien?.jid,
      tel: m.tel ? numero(m.tel) : ancien?.tel || null,
      ts: Date.now(),
      par: par || ancien?.par || '',
    };
    if (i >= 0) liste.splice(i, 1);
    liste.push(e);
  }
  if (liste.length > MAX) liste = liste.slice(-MAX);
  store.set('corbeille', groupe, liste);
  return liste.length;
}

// Retire de la corbeille (ceux qui sont revenus, ou qu'on vient de réajouter)
function oter(groupe, ids) {
  const n = nums(ids);
  const avant = lire(groupe);
  const apres = avant.filter((x) => !x.ids.some((i) => n.includes(i)));
  if (apres.length !== avant.length) store.set('corbeille', groupe, apres);
  return avant.length - apres.length;
}
const vider = (groupe) => store.del('corbeille', groupe) > 0;

module.exports = { noter, lire, oter, vider, DUREE };
