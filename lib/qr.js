// Kernel Bot — lecture de QR codes (jsQR, tout en local)
const sharp = require('sharp');

async function lire(buffer) {
  const jsQR = require('jsqr');
  for (const taille of [0, 1200, 600]) {
    let img = sharp(buffer, { animated: false }).rotate().ensureAlpha();
    if (taille) img = img.resize(taille, taille, { fit: 'inside', withoutEnlargement: false });
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const r = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, { inversionAttempts: 'attemptBoth' });
    if (r && r.data) return r.data;
  }
  return null;
}
module.exports = { lire };
