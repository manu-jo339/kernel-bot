// Kernel Bot — message de bienvenue (envoyé UNE seule fois à chaque numéro qui connecte le bot) et chaîne WhatsApp.
// Rien n'est jamais fait « à l'insu » de la personne : suivre la chaîne n'arrive que si elle tape elle-même .chaine suivre.
const config = require('../config');
const store = require('./store');
const menu = require('./menu');
const reglages = require('./reglages');

const idDe = (sock) => (sock.user?.id || '').split(':')[0].split('@')[0];

function texte(nbCommandes, theme, utilisateur) {
  const nom = menu.nomUtilisateur(utilisateur);
  const p = config.PREFIXE;
  const g = theme === 'kernel' ? menu.gras : (x) => x;
  let t =
    `╭──《 🤖 ${g(`BIENVENUE SUR ${config.NOM_BOT}`.toUpperCase())} 》\n` +
    `├ ◈ ${g('Statut')} : connecté ✅\n` +
    (nom ? `├ ◈ ${g('Utilisateur')} : ${nom}\n` : '') +
    `├ ◈ ${g('Préfixe')} : ${p}\n` +
    `├ ◈ ${g('Mode')} : ${config.MODE}\n` +
    `├ ◈ ${g('Commandes')} : ${nbCommandes}\n` +
    `├ ◈ ${g('Développeur')} : ${config.CREATEUR.nom}\n` +
    `╰───────────⬣\n\n` +
    `➤ ${p}menu — toutes les commandes\n` +
    `➤ ${p}theme — changer l'apparence du menu\n` +
    `➤ ${p}aide <commande> — détails d'une commande\n`;
  if (config.CHAINE_URL) t += `\n📢 Chaîne d'assistance et nouveautés :\n${config.CHAINE_URL}\n(${p}chaine suivre pour la suivre en un geste, si tu le souhaites)\n`;
  return t + `\n_${config.SIGNATURE}_`;
}

// Message court envoyé à chaque démarrage : la personne voit tout de suite que le bot est en ligne
function texteDemarrage(nbCommandes) {
  const p = config.PREFIXE;
  const h = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville', dateStyle: 'short', timeStyle: 'short' });
  return `✅ *${config.NOM_BOT} est connecté !*\n🕐 ${h}\n📚 ${nbCommandes} commandes · préfixe « ${p} » · mode ${config.MODE}\n\n➤ ${p}menu pour commencer\n\n_${config.SIGNATURE}_`;
}

// Envoie, dans la conversation « moi-même » du numéro connecté :
//  - la toute première fois : le grand message de bienvenue (une seule fois, mémorisé) ;
//  - ensuite, à chaque démarrage : un court « connecté ✅ ».
// Retourne 'bienvenue', 'demarrage' ou false.
async function envoyer(sock, nbCommandes) {
  if (!config.BIENVENUE) return false;
  const id = idDe(sock);
  if (!id) return false;
  const jid = id + '@s.whatsapp.net';
  const premiere = !store.get('bienvenue', id);
  const theme = reglages.lire().theme;
  const img = menu.THEMES[theme]?.image ? menu.image() : null;
  const t = premiere ? texte(nbCommandes, theme, sock.utilisateur) : texteDemarrage(nbCommandes);
  await sock.sendMessage(jid, img ? { image: img, caption: t } : { text: t });
  if (premiere) store.set('bienvenue', id, { le: Date.now() });
  return premiere ? 'bienvenue' : 'demarrage';
}

// Code d'invitation d'une chaîne à partir de son lien
const codeChaine = (url) => (String(url || '').match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/) || [])[1] || null;

module.exports = { envoyer, texte, codeChaine };
