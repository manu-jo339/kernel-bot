// Kernel Bot — vie locale et culture : urgences, pharmacies de garde, verset, proverbe, recettes
const config = require('../config');
const store = require('../lib/store');
const jobs = require('../lib/jobs');
const { prochain } = require('../lib/taches');
const { dateLocale } = require('../lib/utils');

const base = { categorie: 'Vie locale' };
const gere = (c) => c.isOwner || c.isPremium;
const parties = (t) => t.split('|').map((x) => x.trim());
const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alea = (l) => l[require('crypto').randomInt(l.length)];

// Versets (Bible Louis Segond, domaine public). Le propriétaire peut en ajouter avec « .verset ajouter ».
const VERSETS = [
  ['Jean 3:16', "Car Dieu a tant aimé le monde qu'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu'il ait la vie éternelle."],
  ['Psaume 23:1', "L'Éternel est mon berger : je ne manquerai de rien."],
  ['Philippiens 4:13', 'Je puis tout par celui qui me fortifie.'],
  ['Proverbes 3:5', "Confie-toi en l'Éternel de tout ton cœur, et ne t'appuie pas sur ta sagesse."],
  ['Josué 1:9', "Ne t'ai-je pas donné cet ordre : Fortifie-toi et prends courage ? Ne t'effraie point et ne t'épouvante point, car l'Éternel, ton Dieu, est avec toi dans tous les lieux où tu iras."],
  ['Jérémie 29:11', "Car je connais les projets que j'ai formés sur vous, dit l'Éternel, projets de paix et non de malheur, afin de vous donner un avenir et de l'espérance."],
  ['Matthieu 11:28', 'Venez à moi, vous tous qui êtes fatigués et chargés, et je vous donnerai du repos.'],
  ['Matthieu 6:33', "Cherchez premièrement le royaume et la justice de Dieu ; et toutes ces choses vous seront données par-dessus."],
  ['Romains 8:28', 'Nous savons, du reste, que toutes choses concourent au bien de ceux qui aiment Dieu, de ceux qui sont appelés selon son dessein.'],
  ['Ésaïe 41:10', "Ne crains rien, car je suis avec toi ; ne promène pas des regards inquiets, car je suis ton Dieu ; je te fortifie, je viens à ton secours, je te soutiens de ma droite triomphante."],
];

// Sagesse populaire (adages courants ; ajoute les tiens avec « .proverbe ajouter »)
const PROVERBES = [
  'Seul on va plus vite, ensemble on va plus loin.',
  "La patience est la clé de tous les succès.",
  "Celui qui ne sait pas où il va risque de ne jamais arriver.",
  "On ne juge pas un arbre à la qualité de son écorce, mais à ses fruits.",
  "Le savoir est comme un baobab : personne ne peut l'embrasser à lui seul.",
  "La main qui donne est toujours au-dessus de la main qui reçoit.",
  "Petit à petit, l'oiseau fait son nid.",
  "Une seule main ne peut pas attacher un fagot.",
  "Celui qui apprend à marcher doit accepter de tomber.",
  "La parole est comme l'eau : une fois versée, on ne la ramasse plus.",
  "Quand on ne sait pas où l'on va, il faut se souvenir d'où l'on vient.",
  "Le travail d'aujourd'hui est la récolte de demain.",
];

const RECETTES = {
  moambe: { titre: 'Poulet à la moambé', pour: '4-5 personnes', ing: ['1 poulet découpé', '1 à 2 boîtes de purée de noix de palme (ou 1 kg de noix pilées)', '2 oignons', '4 gousses d’ail', '1 piment (selon le goût)', 'Sel, poivre', 'Accompagnement : riz, manioc ou banane plantain'], etapes: ['Assaisonner le poulet (ail, oignon, sel, poivre) et le faire revenir dans un peu d’huile pour le dorer.', 'Ajouter un peu d’eau et laisser mijoter 20 minutes.', 'Verser la purée de noix de palme délayée dans de l’eau chaude, ajouter le piment entier.', 'Cuire à feu doux 45 minutes à 1 heure, jusqu’à ce que l’huile remonte à la surface et que la sauce épaississe.', 'Rectifier le sel et servir bien chaud avec du riz ou du manioc.'] },
  sakasaka: { titre: 'Saka-saka (feuilles de manioc)', pour: '4-5 personnes', ing: ['1 kg de feuilles de manioc pilées (fraîches ou surgelées)', '500 g de poisson fumé ou de viande', '2 oignons', '3 gousses d’ail', 'Huile de palme ou d’arachide', '1 piment, sel', 'Facultatif : pâte d’arachide'], etapes: ['Faire bouillir les feuilles pilées 30 à 45 minutes dans de l’eau, puis égoutter.', 'Faire revenir l’oignon et l’ail dans l’huile, ajouter le poisson fumé (ou la viande) et un peu d’eau.', 'Ajouter les feuilles égouttées, le piment et le sel.', 'Laisser mijoter 1 heure à feu doux en remuant ; ajouter un peu de pâte d’arachide pour l’onctuosité si on le souhaite.', 'Servir avec du riz, de la chikwangue ou du manioc.'] },
  liboke: { titre: 'Liboké de poisson', pour: '3-4 personnes', ing: ['2 beaux poissons (capitaine, silure ou tilapia) nettoyés', 'Feuilles de bananier (ou papier aluminium)', '2 oignons, 3 gousses d’ail', 'Persil ou ciboule, piment', 'Citron, sel, poivre, un peu d’huile'], etapes: ['Passer les feuilles de bananier au-dessus d’une flamme pour les assouplir.', 'Mariner le poisson avec l’ail, l’oignon, le citron, le piment, le sel et le poivre pendant 30 minutes.', 'Envelopper chaque poisson dans les feuilles, bien ficeler.', 'Cuire sur braise (ou au four) 30 à 40 minutes en retournant à mi-cuisson.', 'Ouvrir et servir avec du manioc, de la banane plantain ou du riz.'] },
  mikate: { titre: 'Mikaté (beignets congolais)', pour: '20 beignets', ing: ['500 g de farine', '100 g de sucre', '1 sachet de levure de boulanger', '1 pincée de sel', '25 cl d’eau tiède (environ)', 'Huile pour la friture'], etapes: ['Mélanger farine, sucre, sel et levure.', 'Ajouter l’eau tiède peu à peu et pétrir jusqu’à obtenir une pâte souple.', 'Couvrir et laisser lever 1 heure.', 'Former des boules et frire dans l’huile chaude, en les retournant, jusqu’à ce qu’elles soient dorées.', 'Égoutter sur du papier absorbant. À déguster tièdes.'] },
  arachide: { titre: 'Sauce à la pâte d’arachide', pour: '4 personnes', ing: ['4 cuillères à soupe de pâte d’arachide (non sucrée)', '500 g de viande ou de poisson', '2 tomates, 2 oignons, 3 gousses d’ail', 'Piment, sel, bouillon', 'Eau'], etapes: ['Faire revenir oignon, ail et tomates, ajouter la viande ou le poisson et un peu d’eau.', 'Délayer la pâte d’arachide dans de l’eau chaude, puis la verser dans la casserole.', 'Ajouter piment, sel et bouillon.', 'Laisser mijoter 40 minutes en remuant souvent, jusqu’à ce que l’huile apparaisse.', 'Servir avec du riz, du manioc ou de la patate douce.'] },
};

function citation(genre) {
  if (genre === 'proverbe') {
    const extra = store.get('culture', 'proverbes', []);
    return `🌍 *Sagesse du jour*\n\n« ${alea([...PROVERBES, ...extra])} »`;
  }
  const extra = store.get('culture', 'versets', []);
  const [ref, t] = alea([...VERSETS, ...extra]);
  return `📖 *Verset du jour*\n\n« ${t} »\n— ${ref}`;
}

function citationCmd(name, genre, desc, emoji) {
  return {
    ...base,
    name,
    desc,
    usage: `{P}${name} · {P}${name} auto on 7h (admin, dans un groupe : envoi chaque jour) · {P}${name} auto off · ${genre === 'verset' ? '{P}verset ajouter Jean 3:16 | texte' : '{P}proverbe ajouter ton proverbe'} (propriétaire)`,
    metaSiGroupe: true,
    run: async (c) => {
      const { args, reply, jid, isGroup } = c;
      const sous = (args[0] || '').toLowerCase();
      if (sous === 'ajouter') {
        if (!gere(c)) return reply('⛔ Réservé au propriétaire.');
        if (genre === 'verset') {
          const [ref, ...t] = parties(args.slice(1).join(' '));
          if (!ref || !t.length) return reply(`✏️ ${config.PREFIXE}verset ajouter Psaume 91:1 | Celui qui demeure sous l’abri du Très-Haut…`);
          store.set('culture', 'versets', [...store.get('culture', 'versets', []), [ref, t.join(' | ')]]);
        } else {
          const t = args.slice(1).join(' ').trim();
          if (t.length < 8) return reply(`✏️ ${config.PREFIXE}proverbe ajouter Ton proverbe ici`);
          store.set('culture', 'proverbes', [...store.get('culture', 'proverbes', []), t]);
        }
        return reply('✅ Ajouté.');
      }
      if (sous === 'auto') {
        if (!isGroup) return reply('👥 L’envoi automatique se règle dans un groupe.');
        if (!(c.isAdmin || c.isOwner)) return reply(config.PERSO.messages.reserveAdmin);
        const cle = `citation:${genre}:${jid}`;
        jobs.supprimerCle(cle);
        if ((args[1] || '').toLowerCase() === 'off') return reply(`❌ ${emoji} automatique désactivé.`);
        const h = parseInt((args[2] || '7').replace(/\D/g, ''), 10);
        if (!(h >= 0 && h <= 23)) return reply('✏️ Heure invalide (0 à 23).');
        jobs.ajouter({ quand: prochain(h), type: 'citation-jour', data: { jid, genre, sess: c.sock.sessionId || 'principal' }, repete: 864e5, cle });
        return reply(`✅ ${emoji} envoyé chaque jour à ${h} h dans ce groupe.`);
      }
      await reply(citation(genre));
    },
  };
}

module.exports = [
  {
    ...base,
    name: 'urgences',
    aliases: ['urgence', 'secours'],
    desc: 'Numéros d’urgence locaux',
    usage: '{P}urgences · propriétaire : {P}urgences ajouter Police | 117 · {P}urgences retirer 1',
    run: async (c) => {
      const { args, reply } = c;
      const l = store.get('culture', 'urgences', []);
      const sous = (args[0] || '').toLowerCase();
      if (['ajouter', 'retirer'].includes(sous)) {
        if (!gere(c)) return reply('⛔ Réservé au propriétaire.');
        if (sous === 'ajouter') {
          const [nom, num, info] = parties(args.slice(1).join(' '));
          if (!nom || !num) return reply(`✏️ ${config.PREFIXE}urgences ajouter Pompiers | 118`);
          l.push({ nom, num, info: info || '' });
        } else {
          const n = parseInt(args[1], 10);
          if (!n || !l[n - 1]) return reply('❓ Numéro invalide.');
          l.splice(n - 1, 1);
        }
        store.set('culture', 'urgences', l);
        return reply('✅ Liste mise à jour.');
      }
      await reply(l.length ? '🚨 *Numéros d’urgence*\n\n' + l.map((x, i) => `${i + 1}. *${x.nom}* : ${x.num}${x.info ? ' — ' + x.info : ''}`).join('\n') + '\n\n_En cas de danger, appelle d’abord les secours._' : `🚨 Aucun numéro enregistré. Le propriétaire doit saisir les numéros officiels de sa ville :\n${config.PREFIXE}urgences ajouter Police | <numéro>`);
    },
  },
  {
    ...base,
    name: 'pharmacies',
    aliases: ['pharmacie', 'garde'],
    desc: 'Pharmacies de garde (liste tenue à jour par le propriétaire)',
    usage: '{P}pharmacies · {P}pharmacies ajouter Pharmacie du Centre | Poto-Poto | 242061234567 | 02/11 (garde jusqu’au) · {P}pharmacies retirer 1',
    run: async (c) => {
      const { args, reply } = c;
      let l = store.get('culture', 'pharmacies', []);
      const sous = (args[0] || '').toLowerCase();
      if (['ajouter', 'retirer', 'vider'].includes(sous)) {
        if (!gere(c)) return reply('⛔ Réservé au propriétaire.');
        if (sous === 'vider') l = [];
        else if (sous === 'ajouter') {
          const [nom, quartier, tel, jusque] = parties(args.slice(1).join(' '));
          if (!nom) return reply(`✏️ ${config.PREFIXE}pharmacies ajouter Pharmacie du Centre | Poto-Poto | 242061234567 | 02/11`);
          const m = (jusque || '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
          const an = m && m[3] ? +m[3] : new Date().getFullYear();
          l.push({ nom, quartier: quartier || '', tel: tel || '', jusque: m ? Date.UTC(an, +m[2] - 1, +m[1], 23, 0) - 36e5 : 0 });
        } else {
          const n = parseInt(args[1], 10);
          if (!n || !l[n - 1]) return reply('❓ Numéro invalide.');
          l.splice(n - 1, 1);
        }
        store.set('culture', 'pharmacies', l);
        return reply('✅ Liste mise à jour.');
      }
      const actives = l.filter((x) => !x.jusque || x.jusque > Date.now());
      await reply(actives.length ? '💊 *Pharmacies de garde*\n\n' + actives.map((x) => `• *${x.nom}*${x.quartier ? ' — ' + x.quartier : ''}${x.tel ? '\n   📞 ' + x.tel : ''}${x.jusque ? '\n   🕒 garde jusqu’au ' + dateLocale(x.jusque).split(' ')[0] : ''}`).join('\n') + '\n\n_Appelle avant de te déplacer : les gardes peuvent changer._' : '💊 Aucune pharmacie de garde enregistrée pour le moment.');
    },
  },
  citationCmd('verset', 'verset', 'Un verset de la Bible (Louis Segond)', '📖 Verset'),
  citationCmd('proverbe', 'proverbe', 'Un proverbe ou une pensée du jour', '🌍 Proverbe'),
  {
    ...base,
    name: 'recette',
    aliases: ['recettes', 'cuisine'],
    desc: 'Recettes de cuisine locale : .recette moambé',
    run: async ({ args, reply, config: cfg }) => {
      const cle = sansAccent(args.join('')).replace(/[^a-z]/g, '');
      const r = Object.entries(RECETTES).find(([k, v]) => cle && (cle.includes(k) || sansAccent(v.titre).replace(/[^a-z]/g, '').includes(cle)));
      if (!r) return reply('🍲 *Recettes disponibles*\n\n' + Object.values(RECETTES).map((v) => '• ' + v.titre).join('\n') + `\n\n${cfg.PREFIXE}recette <nom> (ex : ${cfg.PREFIXE}recette moambé)`);
      const v = r[1];
      await reply(`🍲 *${v.titre}* — ${v.pour}\n\n*Ingrédients*\n${v.ing.map((x) => '• ' + x).join('\n')}\n\n*Préparation*\n${v.etapes.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n_Recette familiale simplifiée : ajuste les quantités et les assaisonnements à ton goût._`);
    },
  },
];
module.exports.citation = citation;
