// Kernel Bot — statistiques d'utilisation (pour la commande « rapport »)
const store = require('./store');
const { jourJ } = require('./db');

function compter(cmd, utilisateur, groupe) {
  const jour = jourJ();
  store.modifier('stats', jour, { cmds: 0, parCmd: {}, users: {}, groupes: {} }, (s) => {
    s.cmds += 1;
    s.parCmd[cmd] = (s.parCmd[cmd] || 0) + 1;
    s.users[utilisateur] = 1;
    if (groupe) s.groupes[groupe] = 1;
  });
}
const jourStats = (jour) => store.get('stats', jour, { cmds: 0, parCmd: {}, users: {}, groupes: {} });

module.exports = { compter, jourStats };
