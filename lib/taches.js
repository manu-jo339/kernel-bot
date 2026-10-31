// Kernel Bot — ce qui se passe quand une tâche programmée arrive à échéance (rappels, messages programmés…)
const jobs = require('./jobs');
const { numero } = require('./utils');

// Une tâche créée depuis une session secondaire repart par cette même session
function choisir(sockPrincipal, data) {
  try {
    const s = require('./session').sessions.get(data.sess);
    if (s?.sock?.user) return s.sock;
  } catch {}
  return sockPrincipal;
}

jobs.surTache('rappel', async ({ data, sock }) => {
  const s = choisir(sock, data);
  const mentions = data.qui ? [data.qui] : [];
  await s.sendMessage(data.jid, { text: `⏰ *Rappel*${data.qui ? ` pour @${numero(data.qui)}` : ''}\n${data.texte}`, mentions });
});

jobs.surTache('programme', async ({ data, sock }) => {
  const s = choisir(sock, data);
  await s.sendMessage(data.jid, { text: data.texte });
});

// Fermeture temporaire d'un groupe (« fermer 2h ») : le groupe se rouvre tout seul
jobs.surTache('rouvrir', async ({ data, sock }) => {
  const s = choisir(sock, data);
  await s.groupSettingUpdate(data.jid, 'not_announcement');
  await s.sendMessage(data.jid, { text: '🔓 Fin de la fermeture temporaire : tout le monde peut de nouveau écrire.' });
});

// ───── Vœux d'anniversaire : tous les jours à 8 h (heure de Brazzaville) ─────
const store = require('./store');
const { local, enMs } = require('./temps');

function prochain(h) {
  const n = local();
  let q = enMs(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), h, 0);
  if (q <= Date.now()) q += 864e5;
  return q;
}
if (!jobs.parCle('systeme:anniv').length) jobs.ajouter({ quand: prochain(8), type: 'anniv', repete: 864e5, cle: 'systeme:anniv' });

jobs.surTache('anniv', async ({ sock }) => {
  const n = local();
  const j = n.getUTCDate(), m = n.getUTCMonth() + 1;
  const parGroupe = {};
  for (const x of store.liste('anniv')) if (x.data.j === j && x.data.m === m) (parGroupe[x.data.jid] = parGroupe[x.data.jid] || []).push(x.data);
  for (const [jid, l] of Object.entries(parGroupe)) {
    const lignes = l.map((a) => `🎉 @${numero(a.sender)}${a.a ? ` (${n.getUTCFullYear() - a.a} ans)` : ''}`);
    try {
      await sock.sendMessage(jid, { text: `🎂 *Joyeux anniversaire !*\n\n${lignes.join('\n')}\n\nToute la communauté te souhaite une magnifique journée ! 🥳`, mentions: l.map((a) => a.sender) });
    } catch (e) {
      console.error('[anniv]', e.message);
    }
  }
});

// ───── Verset / proverbe du jour (groupes qui l'ont activé) ─────
jobs.surTache('citation-jour', async ({ data, sock }) => {
  const choix = require('../cmd/culture').citation(data.genre);
  try {
    await sock.sendMessage(data.jid, { text: choix });
  } catch (e) {
    console.error('[citation]', e.message);
  }
});

module.exports = { prochain };
