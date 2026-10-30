// Kernel Bot — affichage du menu (plusieurs thèmes, changeables avec la commande « theme »)
const config = require('../config');

const ICONES = {
  'Général': '🧭', 'Groupe': '👥', 'Protection': '🛡️', 'Propriétaire': '👑', 'IA': '🧠', 'Outils': '🧰',
  'Business': '💼', 'Communauté': '🏘️', 'Médias': '🎞️', 'Stickers': '🏷️', 'Audio': '🎧', 'Images': '🖼️',
  'Logos': '🎨', 'Téléchargements': '📥', 'Recherche': '🔎', 'Réactions': '🎭', 'Social': '💬', 'Statuts': '📱',
  'Confidentialité': '🔐', 'Système': '⚙️', 'Jeux': '🎲', 'Fun': '😂', 'Texte': '🔤', 'Réseau': '🌐', 'Vie locale': '📍', 'Divers': '📂',
};
const ORDRE = Object.keys(ICONES);

const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const icone = (cat) => config.PERSO.emojis.categories[cat] || ICONES[cat] || '📂';
const remplacer = (t) => String(t || '').replace(/\{NOM_BOT\}/g, config.NOM_BOT).replace(/\{PREFIXE\}/g, config.PREFIXE);

// Lettres « gras sans empattement » (Unicode) : 𝗞𝗘𝗥𝗡𝗘𝗟 — les accents sont conservés
function gras(t) {
  return [...String(t).normalize('NFD')]
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + c - 97);
      if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ec + c - 48);
      return ch;
    })
    .join('');
}

// Image d'en-tête du menu (assets/menu.jpg), lue une seule fois ; remplace-la par la tienne si tu veux
// Images d'en-tête : tous les .jpg/.png de assets/menu/ (jusqu'à 10) défilent l'un après l'autre, en boucle.
// Le rang est mémorisé : après un redémarrage, le bot continue là où il s'était arrêté.
let images;
function charger() {
  const fs = require('fs'), path = require('path');
  const dos = path.join(__dirname, '..', 'assets', 'menu');
  let noms = [];
  try { noms = fs.readdirSync(dos).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort().slice(0, 10); } catch {}
  images = noms.map((n) => fs.readFileSync(path.join(dos, n)));
  if (!images.length) {
    try { images = [fs.readFileSync(path.join(__dirname, '..', 'assets', 'menu.jpg'))]; } catch { images = []; }
  }
}
function image() {
  if (!images) charger();
  if (!images.length) return null;
  const store = require('./store');
  const rang = Number(store.get('global', 'menuImage', 0)) || 0;
  store.set('global', 'menuImage', (rang + 1) % images.length);
  return images[rang % images.length];
}

// Répond avec l'image du thème si le thème en a une (sinon texte simple). Réservé aux commandes « d'information » (info, uptime, maj…).
async function avecImage({ sock, jid, msg, reply }, texte) {
  const nom = require('./reglages').lire().theme;
  const img = THEMES[nom]?.image ? image() : null;
  if (!img || texte.length > 1024) return reply(texte);
  return sock.sendMessage(jid, { image: img, caption: texte }, { quoted: msg });
}

// Thèmes : chaque thème décrit comment s'écrivent l'en-tête, une catégorie, une ligne et la fin
const THEMES = {
  kernel: {
    nom: 'Kernel (stylé, avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) =>
      `╭──《 ${gras(titre.toUpperCase())} 》\n${infos
        .map((i) => {
          const [l, ...v] = i.split(' : ');
          return `├ ◈ ${gras(l.toUpperCase())} : ${v.join(' : ')}`;
        })
        .join('\n')}\n╰───────────⬣\n`,
    cat: (e, c, n) => `\n╭──《 ${e} ${gras(c.toUpperCase())}${n ? ` (${n})` : ''} 》`,
    ligne: (t) => `├ ◈ ${t}`,
    fin: () => '╰───────────⬣',
  },
  classique: {
    nom: 'Classique',
    entete: (titre, infos) => `╭───〔 ${titre} 〕───⬣\n${infos.map((i) => '│ ' + i).join('\n')}\n╰──────────────⬣\n`,
    cat: (e, c, n) => `\n╭──〔 ${e} ${c.toUpperCase()}${n ? ` (${n})` : ''} 〕`,
    ligne: (t) => `│ ${t}`,
    fin: () => '╰──────────────',
  },
  cadre: {
    nom: 'Cadre',
    entete: (titre, infos) => `┏━━━━ ${titre} ━━━━┓\n${infos.map((i) => '┃ ' + i).join('\n')}\n┗━━━━━━━━━━━━━━━━━┛\n`,
    cat: (e, c, n) => `\n┏━ ${e} *${c}*${n ? ` (${n})` : ''}`,
    ligne: (t) => `┃ ◦ ${t}`,
    fin: () => '┗━━━━━━━━━━━',
  },
  moderne: {
    nom: 'Moderne',
    entete: (titre, infos) => `*${titre}*\n${infos.map((i) => '▫️ ' + i).join('\n')}\n`,
    cat: (e, c, n) => `\n${e} *${c.toUpperCase()}*${n ? ` · ${n}` : ''}`,
    ligne: (t) => `  ▸ ${t}`,
    fin: () => '',
  },
  minimal: {
    nom: 'Minimal',
    entete: (titre, infos) => `${titre}\n${infos.join(' · ')}\n`,
    cat: (e, c, n) => `\n— ${c}${n ? ` (${n})` : ''} —`,
    ligne: (t) => t,
    fin: () => '',
    sansDescriptions: true,
  },
};

function categories(liste) {
  const par = {};
  for (const c of liste) (par[c.categorie] = par[c.categorie] || []).push(c);
  for (const k of Object.keys(par)) par[k].sort((a, b) => a.name.localeCompare(b.name));
  const noms = Object.keys(par).sort((a, b) => {
    const ia = ORDRE.indexOf(a), ib = ORDRE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return { par, noms };
}

// Nom affiché : celui de l'utilisateur du site (propre à chaque instance), sinon NOM_OWNER du .env, sinon rien
const nomUtilisateur = (u) => String(u || config.NOM_OWNER || '').trim();

function enTete(theme, liste, utilisateur) {
  const up = process.uptime();
  const maintenant = new Date();
  const fmt = (o) => maintenant.toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville', ...o });
  const plateformes = { win32: 'Windows', linux: 'Linux', darwin: 'macOS', android: 'Android' };
  const infos = [
    `Préfixe : ${config.PREFIXE}`,
    ...(nomUtilisateur(utilisateur) ? [`Utilisateur : ${nomUtilisateur(utilisateur)}`] : []),
    `Mode : ${config.MODE}`,
    `Commandes : ${liste.length}`,
    `En ligne : ${Math.floor(up / 3600)} h ${Math.floor((up % 3600) / 60)} min`,
    `Date : ${fmt({ dateStyle: 'short' })}`,
    `Heure : ${fmt({ timeStyle: 'short' })}`,
    `Plateforme : ${plateformes[process.platform] || process.platform}`,
    `Développeur : ${config.CREATEUR.nom}`,
    `Version : ${require('../package.json').version}`,
  ];
  return theme.entete(remplacer(config.PERSO.menu.titre), infos);
}

function pied() {
  let t = '';
  if (config.PERSO.menu.pied) t += `\n${remplacer(config.PERSO.menu.pied)}`;
  return t + `\n_${config.SIGNATURE}_`;
}

// Page d'accueil : la liste des catégories
function accueil(themeNom, liste, utilisateur) {
  const th = THEMES[themeNom] || THEMES.classique;
  const { par, noms } = categories(liste);
  let t = enTete(th, liste, utilisateur);
  t += th.cat('📚', 'Catégories', 0) + '\n';
  if (th.compact) {
    t += noms.map((c) => th.ligne(`${icone(c)} ${c} (${par[c].length})`)).join('\n');
    t += '\n' + th.fin();
    return t + `\n➤ ${config.PREFIXE}menu <catégorie> · ${config.PREFIXE}toutmenu · ${config.PREFIXE}aide <cmd>`;
  }
  t += noms.map((c) => th.ligne(`${icone(c)} ${c} (${par[c].length}) → ${config.PREFIXE}menu ${sansAccent(c)}`)).join('\n');
  t += '\n' + th.fin();
  t += `\n\n${config.PREFIXE}toutmenu : toutes les commandes\n${config.PREFIXE}aide <commande> : détails d'une commande`;
  return t + pied();
}

function rubrique(themeNom, cat, cmds) {
  const th = THEMES[themeNom] || THEMES.classique;
  const montrer = config.PERSO.menu.afficherDescriptions && !th.sansDescriptions;
  let t = th.cat(icone(cat), cat, cmds.length) + '\n';
  t += cmds.map((c) => th.ligne(`${config.PREFIXE}${c.name}${montrer && c.desc ? ' — ' + c.desc : ''}`)).join('\n');
  return t + '\n' + th.fin();
}

function tout(themeNom, liste, utilisateur) {
  const th = THEMES[themeNom] || THEMES.classique;
  const { par, noms } = categories(liste);
  return enTete(th, liste, utilisateur) + noms.map((c) => rubrique(themeNom, c, par[c])).join('\n') + '\n' + pied();
}

function categorie(themeNom, liste, demande, utilisateur) {
  const { par, noms } = categories(liste);
  const d = sansAccent(demande);
  const nom = noms.find((c) => sansAccent(c) === d) || noms.find((c) => sansAccent(c).startsWith(d));
  if (!nom) return null;
  return enTete(THEMES[themeNom] || THEMES.classique, liste, utilisateur) + rubrique(themeNom, nom, par[nom]) + '\n' + pied();
}

module.exports = { nomUtilisateur, avecImage, THEMES, gras, image, accueil, tout, categorie, categories, icone, sansAccent };
