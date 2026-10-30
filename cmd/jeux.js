// Kernel Bot — jeux de groupe : Action ou Vérité
const config = require('../config');
const store = require('../lib/store');
const { numero } = require('../lib/utils');

const base = { categorie: 'Jeux', groupOnly: true };
const ACTIONS = [
  'Imite un animal pendant 10 secondes et envoie le vocal.',
  'Envoie un vocal où tu chantes le refrain de ta chanson préférée.',
  'Change ta photo de profil pour une photo de légume pendant 1 heure.',
  'Écris un petit poème de 4 lignes sur la personne avant toi.',
  'Envoie ton plus beau compliment à la dernière personne qui a parlé.',
  'Raconte une blague : si personne ne rit, tu en racontes une autre.',
  'Parle avec un accent de ton choix pendant les 5 prochains messages.',
  'Envoie un vocal en disant « Bonjour » de 5 façons différentes (joyeux, triste, fâché…).',
  'Écris ton prénom à l’envers, puis celui de 2 autres membres.',
  'Envoie un selfie avec la grimace la plus drôle possible.',
  'Mets un statut « Je suis fan de ce groupe » pendant 1 heure.',
  'Envoie un message uniquement en emojis pour décrire ta journée ; les autres devinent.',
  'Fais 10 pompes et envoie la preuve en vidéo.',
  'Dis trois qualités de la personne que tu choisis dans le groupe.',
  'Envoie un vocal où tu récites l’alphabet à l’envers le plus vite possible.',
  'Lis à voix haute le dernier message que tu as reçu dans ta messagerie (sans le contenu privé !).',
  'Raconte ton meilleur souvenir d’enfance en 3 phrases.',
  'Danse 15 secondes sur ta musique préférée et envoie la vidéo.',
  'Écris un slogan publicitaire pour le groupe.',
  'Choisis un membre et dis ce que tu admires chez lui.',
];
const VERITES = [
  'Quel est ton plat préféré de tous les temps ?',
  'Quelle est la chose la plus drôle qui te soit arrivée à l’école ?',
  'Quel talent caché as-tu ?',
  'Quelle est ta plus grande peur (sérieuse ou rigolote) ?',
  'Quel est le dernier film ou la dernière série que tu as regardé(e) ?',
  'Quelle est la plus belle chose que quelqu’un ait faite pour toi ?',
  'Si tu gagnais 10 millions de FCFA demain, que ferais-tu en premier ?',
  'Quel métier rêvais-tu de faire quand tu étais petit(e) ?',
  'Quelle est ta plus grosse honte (rigolote) ?',
  'Quel est le dernier mensonge innocent que tu as dit ?',
  'Quelle chanson te met toujours de bonne humeur ?',
  'Dans ce groupe, avec qui voudrais-tu partir en voyage, et pourquoi ?',
  'Quelle est la qualité que tu apprécies le plus chez un ami ?',
  'Quel est ton plus grand rêve ?',
  'As-tu déjà oublié l’anniversaire d’un proche ? Raconte.',
  'Quelle habitude aimerais-tu perdre ?',
  'Quel est le meilleur conseil qu’on t’ait donné ?',
  'Quel endroit rêves-tu de visiter ?',
  'Quelle est la chose la plus bizarre que tu aies mangée ?',
  'Quelle application utilises-tu le plus sur ton téléphone ?',
];
const tirer = (l) => l[require('crypto').randomInt(l.length)];

const etat = (jid) => store.get('av', jid, null);

module.exports = [
  {
    ...base,
    name: 'actionverite',
    aliases: ['av', 'truthordare'],
    desc: 'Jeu Action ou Vérité dans le groupe',
    usage: '{P}actionverite jouer · rejoindre · suivant · action · verite · passer · joueurs · stop',
    run: async ({ jid, args, reply, sender, senderNum, isAdmin, isOwner }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const j = etat(jid);
      const tag = (n) => '@' + numero(n);
      if (sous === 'jouer' || sous === 'start') {
        if (j) return reply(`🎲 Une partie est déjà en cours. ${p}actionverite joueurs · ${p}actionverite stop`);
        store.set('av', jid, { joueurs: [sender], actuel: null, ts: Date.now() });
        return reply(`🎲 *Action ou Vérité* est lancé par ${tag(sender)} !\nTape *${p}actionverite rejoindre* pour participer. Quand vous êtes au moins 2, tape *${p}actionverite suivant* pour tirer au sort la première victime. 😈\n_Jeu entre amis : on reste respectueux, on peut toujours ${p}actionverite passer._`);
      }
      if (!j) return reply(`🎲 *Action ou Vérité*\n${p}actionverite jouer — lancer une partie\nPuis : rejoindre · suivant · action · verite · passer · joueurs · stop`);
      const exp = Date.now() - j.ts > 6 * 3600e3;
      if (exp) { store.del('av', jid); return reply(`🎲 La partie était terminée (inactive depuis longtemps). Relance avec ${p}actionverite jouer.`); }
      switch (sous) {
        case 'rejoindre': case 'join': {
          if (j.joueurs.some((x) => numero(x) === senderNum)) return reply('Tu es déjà dans la partie 😉');
          j.joueurs.push(sender); j.ts = Date.now(); store.set('av', jid, j);
          return reply(`✅ ${tag(sender)} rejoint la partie (${j.joueurs.length} joueurs).`);
        }
        case 'quitter': {
          j.joueurs = j.joueurs.filter((x) => numero(x) !== senderNum);
          if (j.actuel && numero(j.actuel) === senderNum) j.actuel = null;
          store.set('av', jid, j);
          return reply(`👋 ${tag(sender)} quitte la partie (${j.joueurs.length} joueurs restants).`);
        }
        case 'joueurs': case 'liste':
          return reply(`🎲 *Joueurs (${j.joueurs.length})*\n${j.joueurs.map(tag).join('\n') || '—'}${j.actuel ? `\n\nÀ qui le tour : ${tag(j.actuel)}` : ''}`);
        case 'suivant': case 'next': {
          if (j.joueurs.length < 2) return reply(`Il faut au moins 2 joueurs. ${p}actionverite rejoindre`);
          const autres = j.joueurs.filter((x) => numero(x) !== numero(j.actuel || ''));
          j.actuel = tirer(autres); j.ts = Date.now(); store.set('av', jid, j);
          return reply(`🎯 C’est le tour de ${tag(j.actuel)} !\nChoisis : *${p}actionverite action* ou *${p}actionverite verite*`);
        }
        case 'action': case 'verite': case 'vérité': {
          if (!j.actuel) return reply(`Tape d’abord ${p}actionverite suivant.`);
          if (numero(j.actuel) !== senderNum && !isAdmin && !isOwner) return reply(`⏳ Ce n’est pas ton tour, c’est celui de ${tag(j.actuel)}.`);
          const action = sous === 'action';
          j.ts = Date.now(); store.set('av', jid, j);
          return reply(`${action ? '🔥 *ACTION*' : '💭 *VÉRITÉ*'} pour ${tag(j.actuel)} :\n\n${tirer(action ? ACTIONS : VERITES)}\n\n_Quand c’est fait : ${p}actionverite suivant · pas envie : ${p}actionverite passer_`);
        }
        case 'passer': case 'skip': {
          if (j.actuel && numero(j.actuel) !== senderNum && !isAdmin && !isOwner) return reply('⏳ Seuls le joueur concerné ou un admin peuvent passer.');
          j.actuel = null; store.set('av', jid, j);
          return reply(`⏭️ Tour passé. ${p}actionverite suivant pour tirer le prochain joueur.`);
        }
        case 'stop': case 'fin': {
          if (numero(j.joueurs[0] || '') !== senderNum && !isAdmin && !isOwner) return reply('⛔ Seul celui qui a lancé la partie ou un admin peut l’arrêter.');
          store.del('av', jid);
          return reply('🏁 Partie terminée. Merci d’avoir joué ! Relance quand tu veux avec ' + p + 'av jouer.');
        }
        default:
          return reply(`🎲 ${p}actionverite jouer · rejoindre · suivant · action · verite · passer · joueurs · quitter · stop`);
      }
    },
  },
];
