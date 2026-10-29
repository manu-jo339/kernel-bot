// Kernel Bot — statuts WhatsApp des contacts : lecture, « j'aime » et copie privée automatiques (réglages du propriétaire).
// Le bot ne voit que les statuts que WhatsApp transmet au compte sur lequel il tourne. Rien n'est publié, rien ne sort de ton ordinateur
// sauf l'envoi vers ta propre discussion quand « telechargerstatuts » est activé.
const config = require('../config');
const reglages = require('./reglages');
const utils = require('./utils');
const { numero } = utils;

const vus = new Set();
const compteurs = { aimes: [], copies: [] };
const MAX_PAR_HEURE = 60;
const TAILLE_MAX = 30 * 1024 * 1024;

const recent = (liste) => {
  const limite = Date.now() - 3600000;
  while (liste.length && liste[0] < limite) liste.shift();
  return liste;
};

// Adresse de la discussion du propriétaire (le premier numéro de NUMERO_OWNER, sinon le numéro du bot lui-même)
const jidProprietaire = (sock) => `${config.OWNERS[0] || numero(sock.user?.id)}@s.whatsapp.net`;

// Envoie un statut (média ou texte) vers une discussion, avec une légende qui indique son auteur
async function envoyerStatut(sock, msg, vers, legende) {
  const cible = utils.messageMedia({ key: msg.key, message: msg.message });
  if (cible) {
    const info = utils.contenu(cible.message)[cible.type];
    if (Number(info?.fileLength?.low ?? info?.fileLength) > TAILLE_MAX) return false;
    const m = await utils.telecharger(sock, { key: msg.key, message: msg.message });
    if (!m?.buffer || m.buffer.length > TAILLE_MAX) return false;
    const champ = { image: 'image', video: 'video', audio: 'audio' }[m.type];
    if (!champ) return false;
    const contenu = { [champ]: m.buffer };
    if (champ === 'audio') contenu.mimetype = m.mime || 'audio/ogg; codecs=opus';
    else contenu.caption = legende + (utils.extraireTexte(msg.message) ? '\n' + utils.extraireTexte(msg.message) : '');
    if (champ === 'audio') await sock.sendMessage(vers, { text: legende });
    await sock.sendMessage(vers, contenu);
    return true;
  }
  const t = utils.extraireTexte(msg.message);
  if (!t) return false;
  await sock.sendMessage(vers, { text: `${legende}\n\n${t}` });
  return true;
}

async function surStatut(sock, msg) {
  if (msg.key.fromMe) return;
  const r = reglages.lire();
  if (!r.statutLire && !r.statutAimer && !r.statutTelecharger) return;
  const id = msg.key.id;
  if (!id || vus.has(id)) return;
  vus.add(id);
  if (vus.size > 500) vus.delete(vus.values().next().value);
  const auteur = msg.key.participant || msg.participant;
  if (!auteur) return;
  const num = numero(auteur);

  if (r.statutLire) await sock.readMessages([msg.key]).catch(() => {});

  if (r.statutAimer && recent(compteurs.aimes).length < MAX_PAR_HEURE) {
    compteurs.aimes.push(Date.now());
    await utils.pause(1000 + Math.floor(Math.random() * 2500));
    await sock
      .sendMessage('status@broadcast', { react: { text: r.statutEmoji || '💚', key: msg.key } }, { statusJidList: [auteur, sock.user.id].filter(Boolean) })
      .catch((e) => console.error('[statut] « j’aime » impossible :', e.message));
  }

  if (r.statutTelecharger && recent(compteurs.copies).length < MAX_PAR_HEURE) {
    compteurs.copies.push(Date.now());
    await envoyerStatut(sock, msg, jidProprietaire(sock), `📥 Statut de +${num}`).catch((e) => console.error('[statut] copie impossible :', e.message));
  }
}

module.exports = { surStatut, envoyerStatut, jidProprietaire };
