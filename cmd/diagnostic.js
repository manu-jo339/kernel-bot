// Kernel Bot — commande « diagnostic » : vérifie que le bot et ses commandes sont en bon état
const diag = require('../lib/diagnostic');

// WhatsApp coupe les messages trop longs : on découpe par paquets de lignes
function paquets(texte, max = 3000) {
  const sortie = [];
  let cur = '';
  for (const ligne of texte.split('\n')) {
    if ((cur + '\n' + ligne).length > max && cur) { sortie.push(cur); cur = ligne; } else cur = cur ? cur + '\n' + ligne : ligne;
  }
  if (cur) sortie.push(cur);
  return sortie;
}

module.exports = [
  {
    categorie: 'Propriétaire',
    name: 'diagnostic',
    aliases: ['testcommandes', 'autotest'],
    desc: 'Vérifie le bot : outils, connexion, et fait passer toutes les commandes à vide',
    usage: '{P}diagnostic : outils et connexion\n{P}diagnostic tout : en plus, essaie chaque commande (sans rien envoyer à personne)\n{P}diagnostic <commande> [mots] : essaie une seule commande et montre sa réponse',
    ownerOnly: true,
    strict: true,
    run: async ({ reply, args, config, liste }) => {
      const choix = (args[0] || '').toLowerCase();
      const commandes = require('../lib/handler').liste;

      // Une seule commande : on montre ce qu'elle répondrait
      if (choix && choix !== 'tout') {
        const c = commandes.find((x) => x.name === choix || x.aliases.includes(choix));
        if (!c) return reply(`❓ Commande « ${choix} » introuvable.`);
        if (!diag.essayable(c)) return reply(`🔒 « ${c.name} » agit sur le bot, sur un groupe ou sur le propriétaire : elle n’est pas essayée à vide. Teste-la en vrai.`);
        const r = await diag.essayer(c, { args: args.slice(1), config, liste: commandes });
        const vu = r.envoyes.map((e) => e.text || e.caption || `[${Object.keys(e)[0]}]`).join('\n— — —\n').slice(0, 2500);
        return reply(`${r.etat === 'ok' ? '✅' : r.etat === 'silence' ? '⚠️ aucune réponse' : '❌ erreur : ' + r.detail}\n\n${vu}`.trim());
      }

      await reply('🩺 Diagnostic en cours…' + (choix === 'tout' ? ' (l’essai de toutes les commandes peut prendre quelques minutes)' : ''));
      const env = await diag.environnement();
      const struct = diag.structure(commandes);
      let texte = `🩺 *Diagnostic de ${config.NOM_BOT}*\n\n*Environnement*\n${env.join('\n')}\n\n*Commandes* : ${commandes.length} chargées` +
        (struct.length ? `, ${struct.length} remarque(s) :\n${struct.slice(0, 15).map((s) => '• ' + s).join('\n')}` : ', structure correcte ✅');
      if (choix === 'tout') texte += '\n\n' + diag.rapportEssai(await diag.essayerTout(commandes, { config }));
      else texte += `\n\n💡 ${config.PREFIXE}diagnostic tout : essaie chaque commande.`;
      for (const p of paquets(texte)) await reply(p);
    },
  },
];
