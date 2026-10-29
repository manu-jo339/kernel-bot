// Kernel Bot — lecture de texte dans une image (OCR) avec tesseract.js : tout est local, les langues (français + anglais)
// sont fournies par les paquets @tesseract.js-data, rien n'est téléchargé ni envoyé sur Internet.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dossierData = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
let worker = null;
let minuteur = null;
let file = Promise.resolve();

function dossierLangues() {
  const d = path.join(dossierData, 'tessdata');
  fs.mkdirSync(d, { recursive: true });
  for (const l of ['fra', 'eng']) {
    const dest = path.join(d, `${l}.traineddata.gz`);
    if (!fs.existsSync(dest)) {
      const src = path.join(path.dirname(require.resolve(`@tesseract.js-data/${l}/package.json`)), '4.0.0_best_int', `${l}.traineddata.gz`);
      fs.copyFileSync(src, dest);
    }
  }
  return d;
}

async function obtenirWorker() {
  if (!worker) {
    const { createWorker } = require('tesseract.js');
    worker = await createWorker('fra+eng', 1, { langPath: dossierLangues(), gzip: true, cacheMethod: 'none' });
  }
  clearTimeout(minuteur);
  // On libère la mémoire après 5 minutes sans utilisation
  minuteur = setTimeout(async () => {
    const w = worker;
    worker = null;
    try { await w?.terminate(); } catch {}
  }, 5 * 60e3);
  minuteur.unref();
  return worker;
}

// Image (Buffer) → { texte, confiance }
function lire(buffer) {
  const tache = file.then(async () => {
    const meta = await sharp(buffer).metadata();
    let img = sharp(buffer).rotate().greyscale().normalise();
    const grand = Math.max(meta.width || 0, meta.height || 0);
    if (grand && grand < 1000) img = img.resize({ width: Math.round(((meta.width || 1000) * 1400) / grand), withoutEnlargement: false });
    else if (grand > 2600) img = img.resize(2600, 2600, { fit: 'inside' });
    const png = await img.png().toBuffer();
    const w = await obtenirWorker();
    const { data } = await w.recognize(png);
    return { texte: String(data.text || '').replace(/\n{3,}/g, '\n\n').trim(), confiance: Math.round(data.confidence || 0) };
  });
  file = tache.catch(() => {}); // une erreur ne bloque pas les suivantes
  return tache;
}

async function arreter() {
  clearTimeout(minuteur);
  const w = worker;
  worker = null;
  if (w) await w.terminate();
}

module.exports = { lire, arreter };
