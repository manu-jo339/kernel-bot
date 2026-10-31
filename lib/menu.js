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

// Lettres Unicode « décoratives » : chaque police remplace A–Z, a–z et 0–9 ; les accents sont conservés
const fonte = (maj, min, chi) => (t) =>
  [...String(t).normalize('NFD')]
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(maj + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(min + c - 97);
      if (c >= 48 && c <= 57) return String.fromCodePoint(chi + c - 48);
      return ch;
    })
    .join('');
const gras = fonte(0x1d5d4, 0x1d5ee, 0x1d7ec); // 𝗞𝗘𝗥𝗡𝗘𝗟
const mono = fonte(0x1d670, 0x1d68a, 0x1d7f6); // 𝙺𝙴𝚁𝙽𝙴𝙻
const script = fonte(0x1d4d0, 0x1d4ea, 0x1d7ec); // 𝓚𝓮𝓻𝓷𝓮𝓵

// Image d'en-tête du menu (assets/menu.jpg), lue une seule fois ; remplace-la par la tienne si tu veux
// Images d'en-tête : tous les .jpg/.png de assets/menu/ (jusqu'à 40) défilent l'un après l'autre, en boucle.
// Le rang est mémorisé : après un redémarrage, le bot continue là où il s'était arrêté.
let images;
function charger() {
  const fs = require('fs'), path = require('path');
  const dos = path.join(__dirname, '..', 'assets', 'menu');
  let noms = [];
  try { noms = fs.readdirSync(dos).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort().slice(0, 40); } catch {}
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
  // ───── Thèmes avec image d'en-tête (l'image défile à chaque menu) ─────
  neon: {
    nom: 'Néon (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `╔═══《 ${mono(titre.toUpperCase())} 》═══╗\n${infos.map((i) => `║ ⚡ ${i}`).join('\n')}\n╚═════════════════╝\n`,
    cat: (e, c, n) => `\n╔═《 ${e} ${mono(c.toUpperCase())}${n ? ` · ${n}` : ''} 》`,
    ligne: (t) => `║ ⚡ ${t}`,
    fin: () => '╚═══════════════',
  },
  cyber: {
    nom: 'Cyber, style terminal (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `┌──[ ${titre.toLowerCase().replace(/\s+/g, '-')} ]──[~]\n${infos.map((i) => `│ ${i}`).join('\n')}\n└──────╼ $ menu\n`,
    cat: (e, c, n) => `\n┌──[ ${e} ${c.toLowerCase()}${n ? ` · ${n}` : ''} ]`,
    ligne: (t) => `├─╼ ${t}`,
    fin: () => '└────────╼',
  },
  royal: {
    nom: 'Royal (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `♛ ━━━━━ ${gras(titre.toUpperCase())} ━━━━━ ♛\n${infos.map((i) => `♦ ${i}`).join('\n')}\n♛ ━━━━━━━━━━━━━━━━━━ ♛\n`,
    cat: (e, c, n) => `\n❖ ━━ ${e} ${script(c)}${n ? ` (${n})` : ''} ━━ ❖`,
    ligne: (t) => `  ♦ ${t}`,
    fin: () => '❖ ━━━━━━━━━━━━━ ❖',
  },
  ancien: {
    nom: 'Ancien bot, style OVL (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `╭━━━〔 ${gras(titre.toUpperCase())} 〕━━━┈⊷\n┃✵╭──────────────\n${infos.map((i) => `┃✵│ ${i}`).join('\n')}\n┃✵╰──────────────\n╰━━━━━━━━━━━━━━━━━┈⊷\n`,
    cat: (e, c, n) => `\n╭━━━〔 ${e} ${gras(c.toUpperCase())}${n ? ` (${n})` : ''} 〕━━┈⊷\n┃✵╭────────────`,
    ligne: (t) => `┃✵│ ➜ ${t}`,
    fin: () => '┃✵╰────────────\n╰━━━━━━━━━━━━━━┈⊷',
  },
  luxe: {
    nom: 'Luxe, écriture cursive (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `✦•······•✦ ${script(titre)} ✦•······•✦\n${infos.map((i) => `✧ ${i}`).join('\n')}\n`,
    cat: (e, c, n) => `\n❀ ${e} ${script(c)}${n ? ` ❨${n}❩` : ''} ❀`,
    ligne: (t) => `   ➤ ${t}`,
    fin: () => '✦•·········•✦',
  },
  blocs: {
    nom: 'Blocs (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `▛▀▀▀▀▀ ${gras(titre.toUpperCase())} ▀▀▀▀▀▜\n${infos.map((i) => `▌ ${i}`).join('\n')}\n▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n`,
    cat: (e, c, n) => `\n▛▀▀ ${e} ${gras(c.toUpperCase())}${n ? ` ‹${n}›` : ''}`,
    ligne: (t) => `▌▪ ${t}`,
    fin: () => '▙▄▄▄▄▄▄▄▄▄▄',
  },
  rond: {
    nom: 'Arrondi (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `╭╌╌╌╌╌ ${gras(titre)} ╌╌╌╌╌╮\n${infos.map((i) => `┊ ◌ ${i}`).join('\n')}\n╰╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╯\n`,
    cat: (e, c, n) => `\n╭╌╌ ${e} ${gras(c)}${n ? ` · ${n}` : ''} ╌╌`,
    ligne: (t) => `┊ ❯ ${t}`,
    fin: () => '╰╌╌╌╌╌╌╌╌╌╌',
  },
  etoiles: {
    nom: 'Étoiles (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `✦ ━━━━ ✧ ${gras(titre.toUpperCase())} ✧ ━━━━ ✦\n${infos.map((i) => `✧ ${i}`).join('\n')}\n✦ ━━━━━━━━━━━━━━━━━ ✦\n`,
    cat: (e, c, n) => `\n✧ ${e} ${gras(c.toUpperCase())}${n ? ` ✦ ${n}` : ''}`,
    ligne: (t) => `⟡ ${t}`,
    fin: () => '✦ ━━━━━━━━',
  },
  nature: {
    nom: 'Nature (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `🌿❀ ${gras(titre.toUpperCase())} ❀🌿\n${infos.map((i) => `🌸 ${i}`).join('\n')}\n🌿❀❀❀❀❀❀❀❀❀❀🌿\n`,
    cat: (e, c, n) => `\n🌺 ${e} ${gras(c.toUpperCase())}${n ? ` (${n})` : ''}`,
    ligne: (t) => `🍃 ${t}`,
    fin: () => '🌿❀❀❀❀❀❀❀',
  },
  feu: {
    nom: 'Feu (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `🔥━━━ ${gras(titre.toUpperCase())} ━━━🔥\n${infos.map((i) => `🔸 ${i}`).join('\n')}\n🔥━━━━━━━━━━━━━━━🔥\n`,
    cat: (e, c, n) => `\n🔥 ${e} ${gras(c.toUpperCase())}${n ? ` (${n})` : ''}`,
    ligne: (t) => `🔸 ${t}`,
    fin: () => '🔥━━━━━━━━━━',
  },
  ocean: {
    nom: 'Océan (avec image)',
    image: true,
    compact: true,
    entete: (titre, infos) => `🌊≋≋≋ ${gras(titre.toUpperCase())} ≋≋≋🌊\n${infos.map((i) => `🐚 ${i}`).join('\n')}\n🌊≋≋≋≋≋≋≋≋≋≋≋≋🌊\n`,
    cat: (e, c, n) => `\n🐬 ${e} ${gras(c.toUpperCase())}${n ? ` (${n})` : ''}`,
    ligne: (t) => `💠 ${t}`,
    fin: () => '🌊≋≋≋≋≋≋≋≋',
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

module.exports = { nomUtilisateur, avecImage, THEMES, gras, mono, script, image, accueil, tout, categorie, categories, icone, sansAccent };
