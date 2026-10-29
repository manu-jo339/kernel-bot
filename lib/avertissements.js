// Kernel Bot — avertissements des membres d'un groupe
const store = require('./store');
const groupes = require('./groupes');
const { numero } = require('./utils');

const cle = (jid, n) => `${jid}|${numero(n)}`;
const limite = (jid) => groupes.sous(jid, 'avertir', { limite: 3 }).limite || 3;

const lire = (jid, n) => store.get('warn', cle(jid, n), { n: 0, raisons: [] });
function ajouter(jid, n, raison = '') {
  return store.modifier('warn', cle(jid, n), { n: 0, raisons: [] }, (w) => {
    w.n += 1;
    w.raisons.push({ ts: Date.now(), raison: String(raison).slice(0, 120) });
    if (w.raisons.length > 10) w.raisons.shift();
  });
}
function retirer(jid, n) {
  return store.modifier('warn', cle(jid, n), { n: 0, raisons: [] }, (w) => {
    w.n = Math.max(0, w.n - 1);
    w.raisons.pop();
  });
}
const remettreAZero = (jid, n) => store.del('warn', cle(jid, n));

module.exports = { lire, ajouter, retirer, remettreAZero, limite };
