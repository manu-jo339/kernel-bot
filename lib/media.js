// Kernel Bot — outils médias : ffmpeg (conversion audio/vidéo) et fichiers temporaires.
// ffmpeg est fourni par le paquet @ffmpeg-installer (rien à installer à la main) ; FFMPEG_PATH dans .env permet d'en choisir un autre.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let chemin = null;
function ffmpegPath() {
  if (chemin) return chemin;
  if (process.env.FFMPEG_PATH) return (chemin = process.env.FFMPEG_PATH);
  try {
    chemin = require('@ffmpeg-installer/ffmpeg').path;
  } catch {
    chemin = 'ffmpeg';
  }
  return chemin;
}

// Deux conversions en même temps au maximum, pour ne pas écraser l'ordinateur
let actifs = 0;
const file = [];
async function emplacement() {
  if (actifs < 2) return void actifs++;
  await new Promise((r) => file.push(r));
}
function liberer() {
  const s = file.shift();
  if (s) s();
  else actifs--;
}

function lancer(args, delai = 120000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: delai, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, _out, stderr) => {
      if (err) {
        const e = new Error(err.killed ? 'conversion trop longue' : (String(stderr).trim().split('\n').slice(-2).join(' ') || err.message).slice(0, 200));
        e.ffmpeg = true;
        return reject(e);
      }
      resolve();
    });
  });
}

const nomTemp = (ext = '') => path.join(os.tmpdir(), 'kernel-' + crypto.randomBytes(6).toString('hex') + ext);
const nettoyer = (...fichiers) => fichiers.flat().forEach((f) => f && fs.rm(f, { force: true }, () => {}));

// Écrit les données en entrée dans un fichier temporaire, exécute ffmpeg, renvoie le résultat. 
// entrees : [{ buffer, ext }] ; args(fichiersEntree, sortie) -> liste d'arguments ffmpeg
async function convertir(entrees, args, extSortie, delai) {
  await emplacement();
  const ins = [];
  const sortie = nomTemp('.' + extSortie);
  try {
    for (const e of [].concat(entrees)) {
      const f = nomTemp('.' + (e.ext || 'bin'));
      fs.writeFileSync(f, e.buffer);
      ins.push(f);
    }
    await lancer(args(ins, sortie), delai);
    return fs.readFileSync(sortie);
  } finally {
    nettoyer(ins, sortie);
    liberer();
  }
}

// Durée d'un média (secondes), ou 0 si illisible
async function duree(buffer, ext = 'bin') {
  await emplacement();
  const f = nomTemp('.' + ext);
  try {
    fs.writeFileSync(f, buffer);
    return await new Promise((resolve) => {
      execFile(ffmpegPath(), ['-hide_banner', '-i', f], { timeout: 20000, windowsHide: true }, (_e, _o, stderr) => {
        const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr));
        resolve(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0);
      });
    });
  } finally {
    nettoyer(f);
    liberer();
  }
}

const extDe = (mime = '', nom = '') => {
  const n = /\.([a-z0-9]{2,4})$/i.exec(nom);
  if (n) return n[1].toLowerCase();
  const m = String(mime).split(';')[0].split('/')[1] || 'bin';
  return { mpeg: 'mp3', quicktime: 'mov', 'x-matroska': 'mkv', ogg: 'ogg', webp: 'webp' }[m] || m.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'bin';
};

module.exports = { ffmpegPath, lancer, convertir, duree, nomTemp, nettoyer, extDe };
