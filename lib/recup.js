// Kernel Bot — récupération d'un média envoyé (ou cité) dans un message, avec contrôle du type et de la taille
const utils = require('./utils');

const MAX_OCTETS = 30 * 1024 * 1024;

const octets = (fl) => (fl && typeof fl === 'object' ? (fl.toNumber ? fl.toNumber() : fl.low) : Number(fl)) || 0;

// Récupère le média du message (ou du message cité) ; répond et renvoie null si ce n'est pas le bon type
async function recuperer(ctx, types, aide) {
  const { sock, msg, reply } = ctx;
  const cible = utils.messageMedia(msg);
  let type = cible && cible.type.replace('Message', '');
  const info = cible && utils.contenu(cible.message)[cible.type];
  if (type === 'document' && /^image\//.test(info?.mimetype || '')) type = 'image';
  if (type === 'ptv') type = 'video';
  if (!cible || !types.includes(type)) {
    await reply(aide);
    return null;
  }
  if (octets(info?.fileLength) > MAX_OCTETS) {
    await reply('⚠️ Fichier trop volumineux (30 Mo maximum).');
    return null;
  }
  try {
    const m = await utils.telecharger(sock, msg);
    if (!m) throw new Error('vide');
    return { ...m, type, anime: !!info?.isAnimated, secondes: Number(info?.seconds) || 0 };
  } catch {
    await reply('⚠️ Impossible de récupérer ce fichier (il a peut-être expiré). Renvoie-le puis réessaie.');
    return null;
  }
}

const erreurMedia = (reply, e) => {
  console.error('[média]', e.message);
  return reply('⚠️ Conversion impossible : ' + String(e.message).slice(0, 150));
};

module.exports = { recuperer, erreurMedia, octets, MAX_OCTETS };
