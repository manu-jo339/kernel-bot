// Kernel Bot — effets et montages sur les photos (sharp + dessins vectoriels originaux, tout en local)
const sharp = require('sharp');
const T = require('./texte');
const media = require('./media');

const MAX = 1024;

// Photo normalisée : orientation corrigée, 1024 px maximum
const base = (buf) => sharp(buf, { animated: false }).rotate().resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true });
const jpg = (img, q = 88) => img.flatten({ background: '#ffffff' }).jpeg({ quality: q }).toBuffer();
const png = (img) => img.png().toBuffer();

// Carré de côté c, recadré au centre
const carre = (buf, c) => sharp(buf, { animated: false }).rotate().resize(c, c, { fit: 'cover' }).png().toBuffer();

// Texte vectoriel dans une zone : renvoie un <path/>
function txt(t, x, y, l, h, { couleur = '#000', poids = 700, contour = null, ...opts } = {}) {
  const r = T.disposer(t, { x, y, l, h }, { poids, ...opts });
  if (!r.d) return '';
  const trait = contour ? ` stroke="${contour}" stroke-width="${Math.max(2, r.taille * 0.05)}" stroke-linejoin="round" paint-order="stroke"` : '';
  return `<path d="${r.d}" fill="${couleur}"${trait}/>`;
}
const svg = (w, h, contenu, defs = '') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${contenu}</svg>`);
const poser = (fond, couches) => sharp(fond).composite(couches);
const nettoyerNom = (n, defaut) => (T.nettoyer(String(n || '').trim().slice(0, 40), T.police(700)).trim() || defaut);

// ───────────── Effets simples ─────────────
const SEPIA = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
const COULEURS = { rouge: '#e53935', orange: '#fb8c00', jaune: '#fdd835', vert: '#43a047', bleu: '#1e88e5', violet: '#8e24aa', rose: '#ec407a', turquoise: '#00acc1', marron: '#8d6e63' };

const simples = {
  sepia: (b) => jpg(base(b).recomb(SEPIA)),
  gris: (b) => jpg(base(b).greyscale()),
  flou: (b) => jpg(base(b).blur(14)),
  couleursinversees: (b) => jpg(base(b).negate({ alpha: false })),
  contraste: (b) => jpg(base(b).normalise().linear(1.3, -30).sharpen()),
  async sombre(b) {
    const { data, info } = await base(b).modulate({ brightness: 0.45, saturation: 0.8 }).toBuffer({ resolveWithObject: true });
    const vig = svg(info.width, info.height, `<rect width="100%" height="100%" fill="url(#v)"/>`, `<radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="45%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.85"/></radialGradient>`);
    return jpg(sharp(data).composite([{ input: vig }]));
  },
  async pixeliser(b) {
    const { data, info } = await base(b).toBuffer({ resolveWithObject: true });
    const pas = Math.max(1, Math.round(Math.max(info.width, info.height) / 36));
    const petit = await sharp(data).resize(Math.max(1, Math.round(info.width / pas)), Math.max(1, Math.round(info.height / pas)), { kernel: 'nearest' }).toBuffer();
    return jpg(sharp(petit).resize(info.width, info.height, { kernel: 'nearest' }));
  },
  async coloriser(b, couleur) {
    const c = COULEURS[(couleur || '').toLowerCase()] || (/^#[0-9a-f]{6}$/i.test(couleur || '') ? couleur : Object.values(COULEURS)[require('crypto').randomInt(Object.keys(COULEURS).length)]);
    return jpg(base(b).greyscale().normalise().tint(c));
  },
  async arcenciel(b) {
    const { data, info } = await base(b).toBuffer({ resolveWithObject: true });
    const arc = svg(info.width, info.height, `<rect width="100%" height="100%" fill="url(#a)" opacity="0.5"/>`, `<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff1744"/><stop offset="0.17" stop-color="#ff9100"/><stop offset="0.34" stop-color="#ffea00"/><stop offset="0.5" stop-color="#00e676"/><stop offset="0.67" stop-color="#00b0ff"/><stop offset="0.84" stop-color="#651fff"/><stop offset="1" stop-color="#d500f9"/></linearGradient>`);
    return jpg(sharp(data).composite([{ input: arc }]));
  },
  async cercle(b) {
    const c = 800;
    const photo = await sharp(await carre(b, c)).ensureAlpha().composite([{ input: svg(c, c, `<circle cx="${c / 2}" cy="${c / 2}" r="${c / 2}"/>`), blend: 'dest-in' }]).png().toBuffer();
    return jpg(sharp(photo));
  },
  async prison(b) {
    const { data, info } = await base(b).modulate({ brightness: 0.75, saturation: 0.7 }).toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    let barres = '';
    const pas = Math.max(50, Math.round(w / 9));
    for (let x = pas / 2; x < w; x += pas) barres += `<rect x="${x - 9}" y="0" width="18" height="${h}" fill="url(#m)"/>`;
    const cadre = `<rect x="0" y="0" width="${w}" height="26" fill="#2b2b2b"/><rect x="0" y="${h - 26}" width="${w}" height="26" fill="#2b2b2b"/>`;
    return jpg(sharp(data).composite([{ input: svg(w, h, barres + cadre, `<linearGradient id="m" x1="0" x2="1"><stop offset="0" stop-color="#555"/><stop offset="0.5" stop-color="#9a9a9a"/><stop offset="1" stop-color="#3a3a3a"/></linearGradient>`) }]));
  },
  async wasted(b) {
    const { data, info } = await base(b).greyscale().modulate({ brightness: 0.7 }).toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const bh = Math.round(h * 0.2);
    const bande = svg(w, h, `<rect x="0" y="${(h - bh) / 2}" width="${w}" height="${bh}" fill="#000" opacity="0.78"/>${txt('ÉLIMINÉ', 0, (h - bh) / 2, w, bh, { couleur: '#e53935', poids: 900, tailleMax: bh * 0.8 })}`);
    return jpg(sharp(data).composite([{ input: bande }]));
  },
};

// ───────────── Montages ─────────────
async function recherche(b, nom) {
  const W = 800, H = 1100;
  const photo = await sharp(await carre(b, 600)).recomb(SEPIA).png().toBuffer();
  const nomOk = nettoyerNom(nom, 'INCONNU(E)').toUpperCase();
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="#e9d8a6"/><rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#5d4037" stroke-width="8"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#5d4037" stroke-width="2"/>${txt('RECHERCHÉ', 60, 60, 680, 150, { couleur: '#3e2723', poids: 900 })}<rect x="94" y="230" width="612" height="612" fill="#3e2723"/>${txt(nomOk, 60, 860, 680, 90, { couleur: '#3e2723', poids: 900 })}${txt('RÉCOMPENSE', 60, 955, 680, 55, { couleur: '#3e2723' })}${txt('1 000 000 FCFA', 60, 1010, 680, 62, { couleur: '#b71c1c', poids: 900 })}`);
  return jpg(poser(fond, [{ input: photo, left: 100, top: 236 }]));
}

async function tombe(b, nom) {
  const W = 800, H = 1000;
  const oval = await sharp(await carre(b, 300)).greyscale().ensureAlpha().composite([{ input: svg(300, 300, `<ellipse cx="150" cy="150" rx="120" ry="145"/>`), blend: 'dest-in' }]).png().toBuffer();
  const nomOk = nettoyerNom(nom, '').toUpperCase();
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="url(#ciel)"/><circle cx="660" cy="150" r="62" fill="#f5f5dc" opacity="0.95"/><rect y="800" width="${W}" height="200" fill="#1b2a1b"/><path d="M200 820 L200 330 Q200 160 400 160 Q600 160 600 330 L600 820 Z" fill="#9e9e9e" stroke="#616161" stroke-width="8"/><rect x="160" y="800" width="480" height="40" rx="8" fill="#757575"/>${txt('R.I.P.', 240, 190, 320, 90, { couleur: '#424242', poids: 900 })}<ellipse cx="400" cy="440" rx="130" ry="155" fill="#424242"/>${txt('REPOSE EN PAIX', 230, 620, 340, 70, { couleur: '#424242', poids: 900 })}${nomOk ? txt(nomOk, 230, 700, 340, 80, { couleur: '#424242' }) : ''}`, `<linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1b2a"/><stop offset="1" stop-color="#415a77"/></linearGradient>`);
  return jpg(poser(fond, [{ input: oval, left: 250, top: 290 }]));
}

async function poubelle(b) {
  const W = 800, H = 900;
  const photo = await sharp(await carre(b, 300)).png().toBuffer();
  const tourne = await sharp(photo).rotate(-14, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const bac = `<path d="M240 520 L560 520 L530 860 L270 860 Z" fill="#78909c" stroke="#37474f" stroke-width="8"/>${[300, 350, 400, 450, 500].map((x) => `<line x1="${x}" y1="550" x2="${x - (x - 400) * 0.1}" y2="830" stroke="#546e7a" stroke-width="10"/>`).join('')}<rect x="215" y="490" width="370" height="36" rx="8" fill="#90a4ae" stroke="#37474f" stroke-width="8"/><rect x="360" y="462" width="80" height="30" rx="10" fill="#90a4ae" stroke="#37474f" stroke-width="8"/>`;
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="#eceff1"/>${txt('À LA POUBELLE !', 40, 30, 720, 120, { couleur: '#37474f', poids: 900 })}<path d="M610 250 q40 70 20 140" fill="none" stroke="#b0bec5" stroke-width="6" stroke-dasharray="14 12"/>`);
  const dessus = svg(W, H, bac);
  return jpg(poser(fond, [{ input: tourne, left: 250, top: 210 }, { input: dessus }]));
}

async function beau(b) {
  const W = 800, H = 900;
  const photo = await carre(b, 560);
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="#4e342e"/><rect x="40" y="40" width="${W - 80}" height="760" rx="14" fill="url(#or)"/><rect x="90" y="90" width="${W - 180}" height="660" fill="#fff8e1"/><rect x="118" y="118" width="564" height="564" fill="#3e2723"/>${txt('C’EST BEAU', 100, 805, 600, 80, { couleur: '#ffe082', poids: 900, tailleMax: 72 })}`, `<linearGradient id="or" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe082"/><stop offset="0.5" stop-color="#c79100"/><stop offset="1" stop-color="#ffd54f"/></linearGradient>`);
  return jpg(poser(fond, [{ input: photo, left: 120, top: 120 }]));
}

async function affect(b) {
  const W = 800, H = 900;
  const photo = await carre(b, 380);
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="#d7ccc8"/><rect y="760" width="${W}" height="140" fill="#8d6e63"/><path d="M400 40 L250 150 M400 40 L550 150" stroke="#5d4037" stroke-width="5" fill="none"/><circle cx="400" cy="40" r="9" fill="#5d4037"/><rect x="200" y="140" width="400" height="400" rx="6" fill="#6d4c41"/><rect x="212" y="152" width="376" height="376" fill="#fff"/>${txt('Ça ne m’affecte pas.', 60, 580, 680, 120, { couleur: '#3e2723', poids: 900 })}`);
  return jpg(poser(fond, [{ input: await carre(b, 360), left: 220, top: 160 }]));
}

async function facepalm(b) {
  const { data, info } = await base(b).toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const s = Math.min(w, h) / 600;
  const peau = '#f1c27d', trait = '#a1732a';
  const doigts = [0, 1, 2, 3].map((i) => `<rect x="${-120 + i * 62}" y="-250" width="54" height="${210 + (i === 1 || i === 2 ? 40 : 0)}" rx="27" fill="${peau}" stroke="${trait}" stroke-width="6"/>`).join('');
  const main = `<g transform="translate(${w / 2} ${h * 0.6}) rotate(-8) scale(${s * 0.62})">${doigts}<rect x="-135" y="-70" width="260" height="210" rx="70" fill="${peau}" stroke="${trait}" stroke-width="6"/><rect x="-190" y="-30" width="60" height="140" rx="30" transform="rotate(25 -160 40)" fill="${peau}" stroke="${trait}" stroke-width="6"/></g>`;
  const legende = `<rect x="0" y="${h - Math.round(h * 0.16)}" width="${w}" height="${Math.round(h * 0.16)}" fill="#000" opacity="0.65"/>${txt('Sérieusement ?', 0, h - Math.round(h * 0.16), w, Math.round(h * 0.16), { couleur: '#fff', poids: 900 })}`;
  return jpg(sharp(data).modulate({ brightness: 0.9, saturation: 0.8 }).composite([{ input: svg(w, h, main + legende) }]));
}

async function blagueperdue(b) {
  const W = 800, H = 900;
  const photo = await carre(b, 500);
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="#e3f2fd"/><path d="M60 250 Q 400 20 740 230" fill="none" stroke="#90a4ae" stroke-width="6" stroke-dasharray="16 14"/><g transform="rotate(-8 400 120)"><rect x="150" y="60" width="500" height="130" rx="40" fill="#fff" stroke="#455a64" stroke-width="6"/><path d="M230 190 L200 245 L290 190 Z" fill="#fff" stroke="#455a64" stroke-width="6"/>${txt('Une blague !', 170, 70, 460, 110, { couleur: '#263238', poids: 900 })}</g><path d="M690 180 l50 -26 M700 215 l60 -6 M680 140 l40 -40" stroke="#90a4ae" stroke-width="7" stroke-linecap="round"/>${txt('…qui passe au-dessus de sa tête', 40, 800, 720, 90, { couleur: '#263238', poids: 700 })}`);
  return jpg(poser(fond, [{ input: photo, left: 150, top: 270 }]));
}

async function fenetreSuppression(b) {
  const W = 900, H = 480;
  const icone = await carre(b, 150);
  const fond = svg(W, H, `<rect width="${W}" height="${H}" fill="#008080"/><rect x="60" y="50" width="780" height="380" fill="#d9d9d9" stroke="#222" stroke-width="3"/><rect x="63" y="53" width="774" height="46" fill="#0b2a7a"/>${txt('Confirmer la suppression', 90, 56, 560, 40, { couleur: '#fff', poids: 700, alignement: 'gauche' })}<rect x="790" y="62" width="34" height="28" fill="#d9d9d9" stroke="#222"/>${txt('X', 794, 62, 26, 28, { couleur: '#000', poids: 900 })}${txt('Voulez-vous vraiment envoyer cet élément à la corbeille ?', 260, 130, 540, 130, { couleur: '#000', poids: 400, alignement: 'gauche' })}<rect x="260" y="330" width="170" height="54" fill="#d9d9d9" stroke="#000" stroke-width="3"/>${txt('Oui', 260, 334, 170, 46, { couleur: '#000', poids: 700 })}<rect x="470" y="330" width="170" height="54" fill="#d9d9d9" stroke="#000" stroke-width="3"/>${txt('Non', 470, 334, 170, 46, { couleur: '#000', poids: 700 })}`);
  return jpg(poser(fond, [{ input: icone, left: 85, top: 140 }]));
}

// Image qui tremble (MP4 muet) : 12 images décalées au hasard, teinte rouge
async function tremble(b) {
  const fs = require('fs');
  const c = 480;
  const photo = await carre(b, c);
  const dossier = media.nomTemp('');
  fs.mkdirSync(dossier);
  const sortie = media.nomTemp('.mp4');
  try {
    const r = () => require('crypto').randomInt(-14, 15);
    const bande = svg(c, c, `<rect width="${c}" height="${c}" fill="#ff1744" opacity="0.22"/><rect x="0" y="${c - 72}" width="${c}" height="72" fill="#c62828" opacity="0.92"/>${txt('ÇA TREMBLE !', 0, c - 72, c, 72, { couleur: '#fff', poids: 900 })}`);
    for (let i = 0; i < 12; i++) {
      const plus = Buffer.from(await sharp({ create: { width: c + 40, height: c + 40, channels: 3, background: '#000' } }).composite([{ input: photo, left: 20 + r(), top: 20 + r() }]).png().toBuffer());
      const img = await sharp(plus).extract({ left: 20, top: 20, width: c, height: c }).composite([{ input: bande }]).png().toBuffer();
      fs.writeFileSync(`${dossier}/f${i + 1}.png`, img);
    }
    await media.lancer(['-stream_loop', '4', '-framerate', '14', '-i', `${dossier}/f%d.png`, '-pix_fmt', 'yuv420p', '-vcodec', 'libx264', '-preset', 'veryfast', '-crf', '26', '-movflags', '+faststart', '-an', sortie], 60000);
    return fs.readFileSync(sortie);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    media.nettoyer(sortie);
  }
}

module.exports = { simples, recherche, tombe, poubelle, beau, affect, facepalm, blagueperdue, fenetreSuppression, tremble, COULEURS };
