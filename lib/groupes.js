// Kernel Bot — informations sur les groupes (avec mémoire de 30 s) et réglages par groupe
const store = require('./store');
const { numero } = require('./utils');

const cache = new Map(); // jid -> { ts, meta }
const DUREE = 30000;

async function metadata(sock, jid, force = false) {
  const c = cache.get(jid);
  if (!force && c && Date.now() - c.ts < DUREE) return c.meta;
  const meta = await sock.groupMetadata(jid);
  cache.set(jid, { ts: Date.now(), meta });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return meta;
}
const invalider = (jid) => cache.delete(jid);

const estAdminP = (p) => p.admin === 'admin' || p.admin === 'superadmin';
const idsDe = (p) => [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).map((x) => numero(x));

// Est-ce que l'un des identifiants (jid ou lid) correspond à un administrateur ?
function estAdmin(meta, candidats) {
  const nums = candidats.filter(Boolean).map((c) => numero(c));
  return meta.participants.some((p) => estAdminP(p) && idsDe(p).some((x) => nums.includes(x)));
}
function botEstAdmin(sock, meta) {
  const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map((c) => numero(c));
  return meta.participants.some((p) => estAdminP(p) && idsDe(p).some((x) => moi.includes(x)));
}
function estMembre(meta, candidat) {
  const n = numero(candidat);
  return meta.participants.some((p) => idsDe(p).includes(n));
}

const reglages = (jid) => store.get('groupe', jid, {}) || {};
const majReglages = (jid, patch) => store.set('groupe', jid, { ...reglages(jid), ...patch });
// Ex. sousReglage(jid, 'antilien') -> { actif, action }
const sous = (jid, cle, defaut = {}) => ({ ...defaut, ...(reglages(jid)[cle] || {}) });
const majSous = (jid, cle, patch, defaut = {}) => majReglages(jid, { [cle]: { ...sous(jid, cle, defaut), ...patch } });

module.exports = { metadata, invalider, estAdmin, botEstAdmin, estMembre, estAdminP, idsDe, reglages, majReglages, sous, majSous };
