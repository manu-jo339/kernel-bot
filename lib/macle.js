// Kernel Bot — « ma clé » : chaque personne peut utiliser SA PROPRE clé d'IA (Mistral, Cerebras, Groq).
// Les clés sont chiffrées (AES-256-GCM) dans la base locale. Le secret de chiffrement vient de MACLE_SECRET (.env)
// ou, à défaut, d'un fichier data/.macle_secret créé automatiquement. Une clé n'est jamais affichée ni écrite dans les journaux.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const dossier = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
let secret = null;
function cleSecrete() {
  if (secret) return secret;
  let brut = process.env.MACLE_SECRET;
  if (!brut) {
    const f = path.join(dossier, '.macle_secret');
    try {
      brut = fs.readFileSync(f, 'utf8').trim();
    } catch {
      brut = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(f, brut, { mode: 0o600 });
    }
  }
  secret = crypto.createHash('sha256').update(String(brut)).digest();
  return secret;
}

function chiffrer(texte) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cleSecrete(), iv);
  const data = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function dechiffrer(o) {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', cleSecrete(), Buffer.from(o.iv, 'base64'));
    d.setAuthTag(Buffer.from(o.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const FOURNISSEURS = ['mistral', 'cerebras', 'groq'];
const num = (x) => String(x || '').replace(/\D/g, '');

function definir(utilisateur, fournisseur, cle) {
  const u = num(utilisateur);
  const d = store.get('macle', u, {});
  d[fournisseur] = chiffrer(cle);
  store.set('macle', u, d);
}
function retirer(utilisateur, fournisseur) {
  const u = num(utilisateur);
  if (!fournisseur) return store.del('macle', u) > 0;
  const d = store.get('macle', u, {});
  if (!d[fournisseur]) return false;
  delete d[fournisseur];
  Object.keys(d).length ? store.set('macle', u, d) : store.del('macle', u);
  return true;
}
// { mistral: 'clé', … } pour cet utilisateur (vide si aucune)
function cles(utilisateur) {
  const d = store.get('macle', num(utilisateur), {});
  const sortie = {};
  for (const k of FOURNISSEURS) {
    if (d[k]) {
      const v = dechiffrer(d[k]);
      if (v) sortie[k] = v;
    }
  }
  return sortie;
}
const fournisseurs = (utilisateur) => Object.keys(store.get('macle', num(utilisateur), {})).filter((k) => FOURNISSEURS.includes(k));
const apercuCle = (cle) => (cle.length > 10 ? cle.slice(0, 3) + '…' + cle.slice(-3) : '…');

module.exports = { FOURNISSEURS, definir, retirer, cles, fournisseurs, apercuCle };
