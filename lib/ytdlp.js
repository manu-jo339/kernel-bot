// Kernel Bot — téléchargement de vidéos et de musique avec yt-dlp (programme libre et officiel : github.com/yt-dlp/yt-dlp)
// Le bot ne l'installe jamais sans ordre du propriétaire (.ytdlp installer) ; le fichier téléchargé est vérifié avec la somme SHA-256 publiée.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const media = require('./media');
const web = require('./web');

const dossierBin = path.join(__dirname, '..', 'bin');
const nomBinaire = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const MAX_OCTETS = 60 * 1024 * 1024;

function chemin() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const local = path.join(dossierBin, nomBinaire);
  return fs.existsSync(local) ? local : 'yt-dlp';
}

function lancer(args, delai = 180000) {
  return new Promise((resolve, reject) => {
    execFile(chemin(), args, { timeout: delai, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(traduire(String(stderr || err.message)));
        e.brut = String(stderr || '').slice(-400);
        e.absent = err.code === 'ENOENT';
        return reject(e);
      }
      resolve(String(stdout));
    });
  });
}

// Messages d'erreur compréhensibles
function traduire(s) {
  if (/ENOENT/.test(s)) return 'yt-dlp n’est pas installé';
  if (/Sign in to confirm|not a bot|cookies/i.test(s)) return 'le site demande une connexion (anti-robot) : réessaie plus tard ou avec un autre lien';
  if (/Private video|private/i.test(s)) return 'cette vidéo est privée';
  if (/Video unavailable|not available|removed/i.test(s)) return 'vidéo indisponible';
  if (/does not pass filter|duration/i.test(s)) return 'vidéo trop longue (20 minutes maximum)';
  if (/larger than max-filesize|File is larger/i.test(s)) return 'fichier trop volumineux (60 Mo maximum)';
  if (/Unsupported URL/i.test(s)) return 'lien non pris en charge';
  if (/HTTP Error 429|Too Many Requests/i.test(s)) return 'trop de demandes, réessaie dans quelques minutes';
  if (/timed out|timeout/i.test(s)) return 'le site met trop de temps à répondre';
  return 'téléchargement impossible (' + s.trim().split('\n').pop().slice(0, 120) + ')';
}

async function version() {
  try {
    return (await lancer(['--version'], 20000)).trim();
  } catch {
    return null;
  }
}

// Installation officielle : on télécharge le programme depuis les « releases » de yt-dlp et on vérifie sa somme SHA-256
async function installer() {
  const assets = { win32: 'yt-dlp.exe', darwin: 'yt-dlp_macos', linux: process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux' };
  const asset = assets[process.platform];
  if (!asset) throw new Error('système non pris en charge');
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
  const sommes = (await web.texte(base + 'SHA2-256SUMS', { delai: 30000 })).split('\n');
  const ligne = sommes.map((l) => l.trim().split(/\s+/)).find((p) => p[1] === asset || p[1] === '*' + asset);
  if (!ligne) throw new Error('somme de contrôle introuvable');
  const f = await web.fichier(base + asset, { max: 120 * 1024 * 1024, delai: 180000 });
  const sha = crypto.createHash('sha256').update(f.buffer).digest('hex');
  if (sha !== ligne[0].toLowerCase()) throw new Error('somme de contrôle incorrecte : fichier refusé');
  fs.mkdirSync(dossierBin, { recursive: true });
  const dest = path.join(dossierBin, nomBinaire);
  fs.writeFileSync(dest + '.tmp', f.buffer, { mode: 0o755 });
  fs.renameSync(dest + '.tmp', dest);
  return version();
}

// Pas plus de 2 téléchargements en même temps
let actifs = 0;
const attente = [];
const prendre = () => (actifs < 2 ? (actifs++, Promise.resolve()) : new Promise((r) => attente.push(r)));
const rendre = () => { const s = attente.shift(); if (s) s(); else actifs--; };

/**
 * cible : une adresse (https://…) ou une recherche (texte libre, première vidéo YouTube)
 * options : { audio: true } pour du MP3, sinon vidéo MP4 (720p maximum)
 * renvoie { buffer, titre, duree, mime, nom }
 */
async function telecharger(cible, { audio = false } = {}) {
  await prendre();
  const dossier = path.join(os.tmpdir(), 'kernel-dl-' + crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(dossier);
  try {
    const entree = /^https?:\/\//i.test(cible) ? cible : 'ytsearch1:' + cible;
    const args = ['--no-playlist', '--ignore-config', '--no-warnings', '--no-progress', '--socket-timeout', '20', '--retries', '2',
      '--max-filesize', '60M', '--match-filter', 'duration<=1200', '--ffmpeg-location', media.ffmpegPath(),
      '-o', path.join(dossier, '%(id)s.%(ext)s'), '--no-simulate',
      '--print', 'before_dl:T:%(title)s', '--print', 'before_dl:D:%(duration)s', '--print', 'after_move:F:%(filepath)s',
      ...(audio ? ['-x', '--audio-format', 'mp3', '--audio-quality', '5', '-f', 'bestaudio/best'] : ['-f', 'bv*[height<=720]+ba/b[height<=720]/b', '--merge-output-format', 'mp4']),
      '--', entree];
    const sortie = await lancer(args, 300000);
    let titre = '', duree = 0, fichier = '';
    for (const l of sortie.split(/\r?\n/)) {
      if (l.startsWith('T:')) titre = l.slice(2);
      else if (l.startsWith('D:')) duree = Number(l.slice(2)) || 0;
      else if (l.startsWith('F:')) fichier = l.slice(2);
    }
    if (!fichier || !fs.existsSync(fichier)) {
      const trouve = fs.readdirSync(dossier).find((f) => !f.endsWith('.part'));
      if (!trouve) throw new Error('aucun fichier produit');
      fichier = path.join(dossier, trouve);
    }
    const taille = fs.statSync(fichier).size;
    if (taille > MAX_OCTETS) throw new Error('fichier trop volumineux (60 Mo maximum)');
    return { buffer: fs.readFileSync(fichier), titre: titre || 'Sans titre', duree, mime: audio ? 'audio/mpeg' : 'video/mp4', nom: (titre || 'fichier').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 60) || 'fichier' };
  } finally {
    fs.rm(dossier, { recursive: true, force: true }, () => {});
    rendre();
  }
}

module.exports = { chemin, version, installer, telecharger, traduire, MAX_OCTETS };
