// Kernel Bot — garde les vues uniques REÇUES, dès leur arrivée, pour que vv / vv2 marchent même après leur ouverture.
// Pourquoi : quand quelqu'un ouvre une vue unique, WhatsApp l'efface de ses serveurs. La référence gardée par conserve.js (clé, adresse)
// ne mène alors plus à rien. On télécharge donc le média tout de suite, avant l'ouverture, et on le garde ici.
// Limites voulues : EN MÉMOIRE SEULEMENT (jamais écrit sur un disque ni dans la base, perdu à chaque redémarrage), 15 éléments au plus,
// 40 Mo au plus, 12 h au plus, 16 Mo par élément, séparé par numéro connecté. Rien n'est envoyé nulle part.
// Télécharger ne déclenche aucun accusé d'ouverture : l'expéditeur ne voit pas que la vue unique a été récupérée.
// VUES_UNIQUES_GARDER=non désactive tout (les commandes marchent alors seulement avant l'ouverture).
const MAX_ELEMENTS = 15;
const MAX_OCTETS = 40 * 1024 * 1024;
const MAX_PAR_ELEMENT = 16 * 1024 * 1024;
const DUREE = 12 * 3600 * 1000;

const elements = new Map(); // « numéro|identifiant du message » -> { ts, buffer, type, mime, nom }
const enCours = new Map(); // téléchargements en cours (un seul par message)
let total = 0;

const actif = () => !/^(non|0|false|faux|no)$/i.test(String(process.env.VUES_UNIQUES_GARDER || '').trim());
const session = (sock) => require('./utils').numero(sock?.user?.id) || 'x';
const cle = (sock, id) => `${session(sock)}|${id}`;

function retirer(k) {
  const e = elements.get(k);
  if (!e) return;
  total -= e.buffer.length;
  elements.delete(k);
}

function purger(maintenant = Date.now()) {
  for (const [k, e] of elements) if (maintenant - e.ts > DUREE) retirer(k);
  while (elements.size > MAX_ELEMENTS || total > MAX_OCTETS) retirer(elements.keys().next().value);
}

// Garde un média déjà téléchargé. Refuse ce qui dépasse la taille permise.
function garder(sock, id, f, ts = Date.now()) {
  if (!id || !f?.buffer || !Buffer.isBuffer(f.buffer) || !f.buffer.length || f.buffer.length > MAX_PAR_ELEMENT) return false;
  const k = cle(sock, id);
  retirer(k);
  elements.set(k, { ts, buffer: f.buffer, type: f.type, mime: f.mime || '', nom: f.nom || '' });
  total += f.buffer.length;
  purger(ts);
  return elements.has(k);
}

function lire(sock, id, maintenant = Date.now()) {
  const k = cle(sock, id);
  const e = elements.get(k);
  if (!e) return null;
  if (maintenant - e.ts > DUREE) { retirer(k); return null; }
  return { buffer: e.buffer, type: e.type, mime: e.mime, nom: e.nom };
}

const tailleDeclaree = (c) => {
  const l = c?.fileLength;
  if (l == null) return 0;
  if (typeof l === 'object') return typeof l.toNumber === 'function' ? l.toNumber() : Number(l.low) || 0;
  return Number(l) || 0;
};

// À appeler pour chaque message reçu : télécharge tout de suite une vue unique (image, vidéo, vocal), reçue d'une autre personne
// ou envoyée par toi-même depuis ton téléphone (le bot est branché sur ton compte : il la reçoit aussi).
// Ne lève jamais d'erreur : si le média n'est déjà plus disponible, on ne garde simplement rien.
async function capturer(sock, msg) {
  try {
    if (!actif() || !msg?.key?.id) return false;
    const utils = require('./utils');
    if (require('./conserve').genre(msg) !== 'vue unique') return false;
    const k = cle(sock, msg.key.id);
    if (elements.has(k)) return true;
    if (enCours.has(k)) return enCours.get(k);
    const cible = utils.messageMedia(msg);
    if (!cible || !['imageMessage', 'videoMessage', 'audioMessage'].includes(cible.type)) return false;
    if (tailleDeclaree(utils.contenu(cible.message)[cible.type]) > MAX_PAR_ELEMENT) return false;
    const tache = (async () => {
      try {
        const f = await utils.telecharger(sock, msg);
        if (!f || !garder(sock, msg.key.id, f)) return false;
        console.log(`👁️ Vue unique gardée en mémoire (${f.type}, ${Math.max(1, Math.round(f.buffer.length / 1024))} Ko).`);
        return true;
      } catch {
        return false; // déjà ouverte ou expirée : rien à garder
      } finally {
        enCours.delete(k);
      }
    })();
    enCours.set(k, tache);
    return await tache;
  } catch {
    return false;
  }
}

function vider() { elements.clear(); enCours.clear(); total = 0; }

module.exports = { capturer, garder, lire, vider, purger, taille: () => elements.size, octets: () => total, MAX_ELEMENTS, MAX_OCTETS, MAX_PAR_ELEMENT, DUREE };
