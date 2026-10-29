// Kernel Bot — fabrication de stickers WhatsApp (images fixes et animées) avec sharp + ffmpeg, entièrement en local
const sharp = require('sharp');
const config = require('../config');
const media = require('./media');

const TAILLE = 512;
const MAX_OCTETS = 950 * 1024;

const packParDefaut = () => process.env.STICKER_PACK || process.env.STICKER_PACK_NAME || config.NOM_BOT;
const auteurParDefaut = () => process.env.STICKER_AUTEUR || process.env.STICKER_AUTHOR_NAME || config.SIGNATURE;

// Ajoute le nom du pack et de l'auteur (métadonnées EXIF lues par WhatsApp)
async function metadonnees(webp, pack = packParDefaut(), auteur = auteurParDefaut()) {
  const { Image } = require('node-webpmux');
  const json = { 'sticker-pack-id': 'kernel-' + Buffer.from(String(pack)).toString('hex').slice(0, 16), 'sticker-pack-name': String(pack).slice(0, 60), 'sticker-pack-publisher': String(auteur).slice(0, 60), emojis: [] };
  const entete = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const corps = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([entete, corps]);
  exif.writeUIntLE(corps.length, 14, 4);
  const img = new Image();
  await img.load(webp);
  img.exif = exif;
  return img.save(null);
}

const masque = {
  rond: `<svg width="${TAILLE}" height="${TAILLE}"><circle cx="${TAILLE / 2}" cy="${TAILLE / 2}" r="${TAILLE / 2}"/></svg>`,
  coins: `<svg width="${TAILLE}" height="${TAILLE}"><rect width="${TAILLE}" height="${TAILLE}" rx="80" ry="80"/></svg>`,
};

/** Image fixe → sticker. mode : 'complet' (image entière), 'recadre' (carré rempli), 'rond', 'coins' */
async function depuisImage(buffer, mode = 'complet', { pack, auteur } = {}) {
  const fond = { r: 0, g: 0, b: 0, alpha: 0 };
  let img = sharp(buffer, { animated: false }).rotate();
  img = mode === 'complet' ? img.resize(TAILLE, TAILLE, { fit: 'contain', background: fond }) : img.resize(TAILLE, TAILLE, { fit: 'cover' });
  if (mode === 'rond' || mode === 'coins') {
    const base = await img.ensureAlpha().png().toBuffer();
    img = sharp(base).composite([{ input: Buffer.from(masque[mode]), blend: 'dest-in' }]);
  }
  let q = 80, sortie;
  do {
    sortie = await img.clone().webp({ quality: q, effort: 4 }).toBuffer();
    q -= 20;
  } while (sortie.length > MAX_OCTETS && q > 10);
  return metadonnees(sortie, pack, auteur);
}

/** Vidéo / GIF → sticker animé (8 secondes maximum) */
async function depuisVideo(buffer, ext, mode = 'complet', { pack, auteur } = {}) {
  const base = mode === 'complet'
    ? `scale=${TAILLE}:${TAILLE}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${TAILLE}:${TAILLE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
    : `scale=${TAILLE}:${TAILLE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${TAILLE}:${TAILLE},format=rgba`;
  let sortie;
  for (const [fps, q] of [[15, 45], [12, 30], [10, 20], [8, 10]]) {
    sortie = await media.convertir({ buffer, ext }, (ins, out) => ['-i', ins[0], '-t', '8', '-vf', `${base},fps=${fps}`, '-an', '-vcodec', 'libwebp', '-lossless', '0', '-q:v', String(q), '-compression_level', '4', '-loop', '0', '-preset', 'default', out], 'webp', 120000);
    if (sortie.length <= MAX_OCTETS) break;
  }
  if (sortie.length > MAX_OCTETS * 1.4) throw new Error('vidéo trop lourde pour un sticker (essaie une vidéo plus courte)');
  return metadonnees(sortie, pack, auteur);
}

async function estAnime(webp) {
  try {
    return ((await sharp(webp, { animated: true }).metadata()).pages || 1) > 1;
  } catch {
    return false;
  }
}

/** Suite d'images PNG → sticker animé (texte animé, etc.) */
async function depuisImages(pngs, fps = 6, { pack, auteur } = {}) {
  const fs = require('fs');
  const dossier = media.nomTemp('');
  fs.mkdirSync(dossier);
  const sortie = media.nomTemp('.webp');
  try {
    pngs.forEach((b, i) => fs.writeFileSync(`${dossier}/f${i + 1}.png`, b));
    await media.lancer(['-framerate', String(fps), '-i', `${dossier}/f%d.png`, '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '60', '-loop', '0', '-preset', 'default', '-an', sortie], 60000);
    return metadonnees(fs.readFileSync(sortie), pack, auteur);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    media.nettoyer(sortie);
  }
}

/** Sticker fixe → image PNG */
const versImage = (webp) => sharp(webp).png().toBuffer();

/** Sticker animé → vidéo MP4 */
async function versVideo(webp) {
  const gif = await sharp(webp, { animated: true }).gif().toBuffer();
  return media.convertir({ buffer: gif, ext: 'gif' }, (ins, out) => ['-i', ins[0], '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', out], 'mp4', 60000);
}

module.exports = { depuisImages, depuisImage, depuisVideo, metadonnees, estAnime, versImage, versVideo, packParDefaut, auteurParDefaut, TAILLE };
