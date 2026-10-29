// Kernel Bot — identité visuelle (dessin original, SVG → PNG). Usage : node tools/marque.js dossier_de_sortie
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const T = require('../lib/texte');

const BLEU = '#1456c8', BLEU_F = '#0a2a63', VERT = '#25c85a', CYAN = '#35e6ff';

// Tête du robot, dessinée dans un carré de 512 × 512
const tete = `
<defs>
  <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#dbe4f0"/><stop offset="1" stop-color="#aebcd1"/></linearGradient>
  <linearGradient id="oreille" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f86ff"/><stop offset="1" stop-color="#0f45a8"/></linearGradient>
  <linearGradient id="visiere" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14346e"/><stop offset="1" stop-color="#06142f"/></linearGradient>
  <radialGradient id="bille" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9dffb8"/><stop offset="1" stop-color="${VERT}"/></radialGradient>
  <filter id="lueur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="ombre" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
</defs>
<ellipse cx="256" cy="452" rx="150" ry="20" fill="#000" opacity=".25" filter="url(#ombre)"/>
<!-- antenne -->
<path d="M256 112V74" stroke="${BLEU_F}" stroke-width="14" stroke-linecap="round"/>
<path d="M256 112V74" stroke="#5a86c8" stroke-width="6" stroke-linecap="round"/>
<circle cx="256" cy="60" r="21" fill="url(#bille)" stroke="${BLEU_F}" stroke-width="8"/>
<!-- oreilles -->
<rect x="46" y="226" width="58" height="104" rx="26" fill="url(#oreille)" stroke="${BLEU_F}" stroke-width="9"/>
<rect x="408" y="226" width="58" height="104" rx="26" fill="url(#oreille)" stroke="${BLEU_F}" stroke-width="9"/>
<rect x="62" y="252" width="14" height="52" rx="7" fill="${CYAN}" opacity=".85"/>
<rect x="436" y="252" width="14" height="52" rx="7" fill="${CYAN}" opacity=".85"/>
<!-- menton / cou -->
<rect x="196" y="388" width="120" height="44" rx="14" fill="url(#oreille)" stroke="${BLEU_F}" stroke-width="9"/>
<!-- tête -->
<rect x="84" y="104" width="344" height="296" rx="112" fill="url(#hg)" stroke="${BLEU_F}" stroke-width="11"/>
<path d="M130 132Q256 96 382 132" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".9"/>
<path d="M118 330Q256 392 394 330" fill="none" stroke="#8ea3c0" stroke-width="5" stroke-linecap="round" opacity=".7"/>
<!-- visière -->
<rect x="122" y="178" width="268" height="152" rx="64" fill="url(#visiere)" stroke="${BLEU_F}" stroke-width="8"/>
<path d="M150 200Q256 178 362 200" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".18"/>
<!-- yeux -->
<rect x="176" y="222" width="52" height="64" rx="26" fill="${CYAN}" filter="url(#lueur)" opacity=".9"/>
<rect x="284" y="222" width="52" height="64" rx="26" fill="${CYAN}" filter="url(#lueur)" opacity=".9"/>
<rect x="178" y="224" width="48" height="60" rx="24" fill="${CYAN}"/>
<rect x="286" y="224" width="48" height="60" rx="24" fill="${CYAN}"/>
<ellipse cx="193" cy="244" rx="9" ry="12" fill="#fff" opacity=".85"/>
<ellipse cx="301" cy="244" rx="9" ry="12" fill="#fff" opacity=".85"/>
<!-- invite de commande « >_ » -->
<path d="M216 352L238 369L216 386" fill="none" stroke="${VERT}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="250" y="379" width="46" height="12" rx="6" fill="${VERT}"/>
`;

const svgTete = (taille, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 512 512">${extra}${tete}</svg>`;

// Photo de profil : fond dégradé, tête centrée dans la zone visible d'un cadre rond
function profil() {
  const t = 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}" viewBox="0 0 ${t} ${t}">
<defs><radialGradient id="fp" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#1e5fd6"/><stop offset=".6" stop-color="#0d3a8f"/><stop offset="1" stop-color="#061c4a"/></radialGradient></defs>
<rect width="${t}" height="${t}" fill="url(#fp)"/>
<g fill="none" stroke="#35e6ff" stroke-opacity=".10" stroke-width="3">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 128} 0V${t}M0 ${i * 128}H${t}"/>`).join('')}</g>
<g transform="translate(172 150) scale(1.4)">${tete}</g>
</svg>`;
}

// Bannière horizontale : tête + nom + signature
function banniere() {
  const W = 1600, H = 600;
  const f = T.police(900), f4 = T.police(700);
  const tk = 190, xk = 640, yk = 330;
  const wK = T.largeur(f, 'Kernel', tk), wB = T.largeur(f, ' Bot', tk);
  const d1 = T.tracer(f, 'Kernel', xk, yk, tk);
  const d2 = T.tracer(f, 'Bot', xk + wK + T.largeur(f, ' ', tk), yk, tk);
  const tag = 'Assistant WhatsApp multifonctions';
  const d3 = T.tracer(f4, tag, xk + 6, 400, 50);
  const sig = 'MWENOBANGUE Labs';
  const d4 = T.tracer(f4, sig, xk + 6, 470, 36);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="fb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6eefb"/></linearGradient>
<linearGradient id="tk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b6cf0"/><stop offset="1" stop-color="#0a2f78"/></linearGradient>
<linearGradient id="tv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43e07a"/><stop offset="1" stop-color="#14a342"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#fb)"/>
<g fill="none" stroke="#1456c8" stroke-opacity=".06" stroke-width="2">${Array.from({ length: 26 }, (_, i) => `<path d="M${i * 64} 0V${H}"/>`).join('')}${Array.from({ length: 10 }, (_, i) => `<path d="M0 ${i * 64}H${W}"/>`).join('')}</g>
<g transform="translate(70 40) scale(1.0)"><svg width="512" height="512" viewBox="0 0 512 512">${tete}</svg></g>
<path d="${d1}" fill="url(#tk)" stroke="#06204f" stroke-width="3" stroke-linejoin="round"/>
<path d="${d2}" fill="url(#tv)" stroke="#0b6a2a" stroke-width="3" stroke-linejoin="round"/>
<rect x="${xk + 6}" y="${yk + 28}" width="${n(wK + wB - 10)}" height="8" rx="4" fill="#25c85a" opacity=".9"/>
<path d="${d3}" fill="#3a4d6e"/>
<path d="${d4}" fill="#1456c8"/>
</svg>`;
  function n(x) { return Math.round(x); }
}


// Dix ambiances : le menu les fait défiler l'une après l'autre (f = fond, g = lueur, k1/b0/b1 = lettres, s = signature)
const PALETTES = [
  { f0: '#1a5fe0', f1: '#0a2a70', f2: '#030c24', g: '#35e6ff', k1: '#bfe6ff', b0: '#7dffa6', b1: '#25c85a', s: '#7aa6ff' },   // bleu néon
  { f0: '#7a2de0', f1: '#2c1070', f2: '#0b0424', g: '#c36bff', k1: '#e8d0ff', b0: '#ffa0f0', b1: '#e03ad0', s: '#b79bff' },   // violet
  { f0: '#0f8f4a', f1: '#064a26', f2: '#01140a', g: '#39ff88', k1: '#c8ffd9', b0: '#e9ff8a', b1: '#9be82b', s: '#7fe3a6' },   // matrice
  { f0: '#e0701a', f1: '#702a0a', f2: '#240c03', g: '#ffb347', k1: '#ffe2bf', b0: '#fff08a', b1: '#ffc21a', s: '#ffb27a' },   // ambre
  { f0: '#d62639', f1: '#6e0f1c', f2: '#240308', g: '#ff6b7d', k1: '#ffd0d6', b0: '#ffd08a', b1: '#ff8a1a', s: '#ff9aa6' },   // rouge
  { f0: '#1aa6c9', f1: '#0a4a66', f2: '#031824', g: '#7ff4ff', k1: '#d4faff', b0: '#b8ffe9', b1: '#2fd9b0', s: '#8fd8f0' },   // glacier
  { f0: '#d6267f', f1: '#6e0f46', f2: '#240318', g: '#ff6bb5', k1: '#ffd0ea', b0: '#ffe08a', b1: '#ff9a3a', s: '#ff9ad0' },   // rose
  { f0: '#b8860b', f1: '#5a420a', f2: '#1a1203', g: '#ffd24a', k1: '#fff2c4', b0: '#fff7a8', b1: '#e8b923', s: '#e6c36b' },   // or
  { f0: '#0b6e78', f1: '#053a42', f2: '#01141a', g: '#2de3d0', k1: '#c4fff7', b0: '#a8ffd0', b1: '#1fc98b', s: '#6fd6cb' },   // turquoise
  { f0: '#3a3fd6', f1: '#161a70', f2: '#05061f', g: '#8f9bff', k1: '#d6dbff', b0: '#9be0ff', b1: '#3aa0ff', s: '#9aa6ff' },   // indigo
];

// Image d'en-tête du menu WhatsApp (16:9, style néon sombre)
function imageMenu(v = PALETTES[0]) {
  const W = 1280, H = 720;
  const f = T.police(900), f4 = T.police(700);
  const dispo = 600;
  let tk = 170;
  const wK = (t) => T.largeur(f, 'KERNEL', t);
  while (wK(tk) > dispo) tk -= 2;
  const xk = 640, yk = 330;
  const dK = T.tracer(f, 'KERNEL', xk, yk, tk);
  const tb = Math.round(tk * 0.95);
  const dB = T.tracer(f, 'BOT', xk, yk + tb * 0.98, tb);
  const dT = T.tracer(f4, v.tag || 'ASSISTANT WHATSAPP MULTIFONCTIONS', xk + 4, yk + tb * 0.98 + 70, 30);
  const dS = T.tracer(f4, 'MWENOBANGUE LABS', xk + 4, H - 60, 28);
  const grille = Array.from({ length: 21 }, (_, i) => `<path d="M${i * 64} 0V${H}"/>`).join('') + Array.from({ length: 12 }, (_, i) => `<path d="M0 ${i * 64}H${W}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<radialGradient id="fm" cx=".3" cy=".45" r=".95"><stop offset="0" stop-color="${v.f0}"/><stop offset=".55" stop-color="${v.f1}"/><stop offset="1" stop-color="${v.f2}"/></radialGradient>
<filter id="g1" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="g2" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
<linearGradient id="fk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${v.k1}"/></linearGradient>
<linearGradient id="fv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${v.b0}"/><stop offset="1" stop-color="${v.b1}"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#fm)"/>
<g fill="none" stroke="${v.g}" stroke-opacity=".08" stroke-width="2">${grille}</g>
<ellipse cx="330" cy="400" rx="300" ry="260" fill="${v.g}" opacity=".18" filter="url(#g1)"/>
<g transform="translate(60 100) scale(1.05)"><svg width="512" height="512" viewBox="0 0 512 512">${tete}</svg></g>
<path d="${dK}" fill="${v.g}" opacity=".9" filter="url(#g1)"/>
<path d="${dK}" fill="${v.g}" filter="url(#g2)"/>
<path d="${dK}" fill="url(#fk)"/>
<path d="${dB}" fill="${v.b1}" opacity=".9" filter="url(#g1)"/>
<path d="${dB}" fill="${v.b1}" filter="url(#g2)"/>
<path d="${dB}" fill="url(#fv)"/>
<rect x="${xk + 4}" y="${yk + tb * 0.98 + 28}" width="${dispo - 20}" height="5" rx="2.5" fill="${v.g}" opacity=".8"/>
<path d="${dT}" fill="${v.k1}"/>
<path d="${dS}" fill="${v.s}"/>
</svg>`;
}

async function ecrire(dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const sorties = {};
  const png = (svg, nom, taille) => sharp(Buffer.from(svg), { density: 144 }).resize(taille).png().toFile(path.join(dossier, nom));
  fs.writeFileSync(path.join(dossier, 'kernel-bot-tete.svg'), svgTete(512));
  fs.writeFileSync(path.join(dossier, 'kernel-bot-banniere.svg'), banniere());
  await png(profil(), 'kernel-bot-profil.png', 1024);
  await sharp(Buffer.from(svgTete(512)), { density: 288 }).resize(1024).png().toFile(path.join(dossier, 'kernel-bot-tete-transparente.png'));
  await sharp(Buffer.from(banniere()), { density: 144 }).png().toFile(path.join(dossier, 'kernel-bot-banniere.png'));
  fs.writeFileSync(path.join(dossier, 'kernel-bot-menu.svg'), imageMenu());
  await sharp(Buffer.from(imageMenu()), { density: 96 }).jpeg({ quality: 90 }).toFile(path.join(dossier, 'kernel-bot-menu.jpg'));
  // Images du menu (assets/menu/menu-01.jpg … menu-10.jpg) : une par ambiance
  if (process.env.MENU_DOSSIER) {
    fs.mkdirSync(process.env.MENU_DOSSIER, { recursive: true });
    for (let i = 0; i < PALETTES.length; i++)
      await sharp(Buffer.from(imageMenu(PALETTES[i])), { density: 96 }).jpeg({ quality: 88 }).toFile(path.join(process.env.MENU_DOSSIER, `menu-${String(i + 1).padStart(2, '0')}.jpg`));
  }
  return sorties;
}
if (require.main === module) ecrire(process.argv[2] || 'marque').then(() => console.log('ok'));
module.exports = { ecrire, imageMenu, PALETTES };
