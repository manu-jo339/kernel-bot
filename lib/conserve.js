// Kernel Bot — garde les vues uniques et les statuts reçus, même après un redémarrage ou un redéploiement.
// WhatsApp ne renvoie plus la clé de déchiffrement d'un média quand on répond à une vue unique ou à un statut : seul l'original reçu par le bot permet de l'ouvrir.
// Sans ceci, tout ce qui a été reçu avant un redémarrage (Render efface la mémoire à chaque fois) devenait inaccessible aux commandes vv / save.
// On garde la référence du média (clé, adresse chez WhatsApp), pas le média lui-même, dans la session du numéro (même stockage que la connexion) :
// 80 éléments au plus, 7 jours au plus. Rien n'est jamais envoyé ailleurs.
const { BufferJSON } = require('@whiskeysockets/baileys');
const cache = require('./cache');
const statuts = require('./statuts');
const utils = require('./utils');

const CLE = ['kernel-medias', 'liste'];
const CLE_VUS = ['kernel-medias', 'vus']; // identifiants des commandes déjà traitées (survit aux redéploiements, partagé entre l'ancien et le nouveau programme)
const MAX_VUS = 300;
const MAX = 80;
const DUREE = 7 * 24 * 3600 * 1000;
const TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];

// Retourne 'statut', 'vue unique' ou null (rien à garder)
function genre(msg) {
  if (!msg?.message || !msg.key?.id) return null;
  const m = utils.contenu(msg.message);
  const t = TYPES.find((x) => m[x]?.mediaKey);
  if (!t) return null;
  if (msg.key.remoteJid === 'status@broadcast') return 'statut';
  const enveloppe = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
  return enveloppe || m[t].viewOnce ? 'vue unique' : null;
}

// Copie légère (sans les miniatures) qui survit à la sérialisation JSON
function allegee(msg) {
  const copie = JSON.parse(JSON.stringify({ key: msg.key, message: msg.message, messageTimestamp: msg.messageTimestamp, pushName: msg.pushName, participant: msg.participant }, BufferJSON.replacer), BufferJSON.reviver);
  const nettoyer = (o) => {
    if (!o || typeof o !== 'object' || Buffer.isBuffer(o)) return;
    delete o.jpegThumbnail;
    for (const v of Object.values(o)) nettoyer(v);
  };
  nettoyer(copie.message);
  return copie;
}

function creer(keys, delai = 4000) {
  let liste = []; // { ts, msg }
  let vus = []; // identifiants « conversation|message » déjà traités
  let sale = false;
  let saleVus = false;
  let minuteur = null;

  const sauver = async () => {
    if (minuteur) { clearTimeout(minuteur); minuteur = null; }
    if (!sale && !saleVus) return false;
    const donnees = {};
    if (sale) donnees[CLE[1]] = liste;
    if (saleVus) donnees[CLE_VUS[1]] = vus;
    const [avant, avantVus] = [sale, saleVus];
    sale = saleVus = false;
    try {
      await keys.set({ [CLE[0]]: donnees });
      return true;
    } catch (e) {
      sale = avant; saleVus = avantVus;
      console.error('[conserve] enregistrement impossible :', e.message);
      return false;
    }
  };
  const planifier = () => {
    if (minuteur) return;
    minuteur = setTimeout(() => { minuteur = null; sauver(); }, delai);
    minuteur.unref?.();
  };

  const charger = async () => {
    try {
      const brut = await keys.get(CLE[0], [CLE[1], CLE_VUS[1]]);
      const lu = brut?.[CLE[1]];
      vus = Array.isArray(brut?.[CLE_VUS[1]]) ? brut[CLE_VUS[1]].filter((x) => typeof x === 'string').slice(-MAX_VUS) : [];
      const limite = Date.now() - DUREE;
      liste = (Array.isArray(lu) ? lu : []).filter((x) => x?.msg?.key?.id && x.ts > limite);
      for (const x of liste) {
        cache.ajouter(x.msg);
        if (x.msg.key.remoteJid === 'status@broadcast') statuts.garder(x.msg);
      }
      return liste.length;
    } catch (e) {
      console.error('[conserve] lecture impossible :', e.message);
      return 0;
    }
  };

  // À appeler pour CHAQUE message reçu, avant tout filtre (même un message arrivé pendant l'arrêt du bot)
  const noter = (msg) => {
    const g = genre(msg);
    if (!g) return false;
    cache.ajouter(msg);
    if (g === 'statut') statuts.garder(msg);
    liste = liste.filter((x) => x.msg.key.id !== msg.key.id);
    liste.push({ ts: Date.now(), msg: allegee(msg) });
    if (liste.length > MAX) liste = liste.slice(-MAX);
    sale = true;
    planifier();
    return true;
  };

  // Commande déjà traitée (même par l'ancien programme, avant un redéploiement) : ne jamais y répondre une deuxième fois
  const dejaVu = (id) => vus.includes(id);
  const noterVu = (id) => {
    if (!id || vus.includes(id)) return;
    vus.push(id);
    if (vus.length > MAX_VUS) vus = vus.slice(-MAX_VUS);
    saleVus = true;
    planifier();
  };

  return { charger, noter, sauver, dejaVu, noterVu, taille: () => liste.length };
}

module.exports = { creer, genre, allegee };
