// Kernel Bot — dessin de texte en vectoriel (opentype.js + police Roboto fournie dans assets/fonts).
// Le texte est converti en tracés : le rendu est identique sur Windows, Linux et macOS, sans dépendre des polices installées.
const fs = require('fs');
const path = require('path');

const FICHIERS = { 400: 'roboto-latin-400-normal.woff', 700: 'roboto-latin-700-normal.woff', 900: 'roboto-latin-900-normal.woff', italique: 'roboto-latin-400-italic.woff' };
const polices = {};
function police(poids = 700) {
  if (!polices[poids]) {
    const opentype = require('opentype.js');
    const b = fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', FICHIERS[poids] || FICHIERS[700]));
    polices[poids] = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return polices[poids];
}

// Garde uniquement les caractères que la police sait dessiner (les emojis, par exemple, sont ignorés)
function nettoyer(texte, f) {
  return [...String(texte).normalize('NFC')].filter((c) => c === ' ' || c === '\n' || f.charToGlyphIndex(c) > 0).join('');
}

// Largeur et tracé calculés lettre par lettre (sans le moteur de ligatures d'opentype.js, qui plante sur certaines polices)
const echelle = (f, taille) => taille / f.unitsPerEm;
function largeur(f, t, taille) {
  let w = 0, prev = null;
  for (const c of t) {
    const g = f.charToGlyph(c);
    if (prev) w += f.getKerningValue(prev, g) * echelle(f, taille);
    w += g.advanceWidth * echelle(f, taille);
    prev = g;
  }
  return w;
}
function tracer(f, t, x, y, taille) {
  const morceaux = [];
  let prev = null;
  for (const c of t) {
    const g = f.charToGlyph(c);
    if (prev) x += f.getKerningValue(prev, g) * echelle(f, taille);
    morceaux.push(g.getPath(x, y, taille).toPathData(2));
    x += g.advanceWidth * echelle(f, taille);
    prev = g;
  }
  return morceaux.join(' ');
}

// Coupe le texte en lignes de largeur maximale donnée
function lignes(f, texte, taille, max) {
  const sortie = [];
  for (const para of texte.split('\n')) {
    let cur = '';
    for (const mot of para.split(/\s+/).filter(Boolean)) {
      const essai = cur ? cur + ' ' + mot : mot;
      if (largeur(f, essai, taille) <= max || !cur) cur = essai;
      else {
        sortie.push(cur);
        cur = mot;
      }
    }
    sortie.push(cur);
  }
  return sortie;
}

/**
 * Dispose le texte au centre d'une zone et renvoie { chemins: [d…], taille } : la plus grande taille qui tient.
 * zone = { x, y, l, h } ; options : poids, tailleMax, tailleMin, interligne, alignement ('centre'|'gauche')
 */
function disposer(texte, zone, { poids = 700, tailleMax = 160, tailleMin = 14, interligne = 1.15, alignement = 'centre', valign = 'centre' } = {}) {
  const f = police(poids);
  const t = nettoyer(texte, f).trim();
  if (!t) return { d: '', taille: 0, lignes: 0 };
  let taille = tailleMax, ls = [];
  for (; taille >= tailleMin; taille -= 2) {
    ls = lignes(f, t, taille, zone.l);
    const trop = ls.some((l) => largeur(f, l, taille) > zone.l);
    if (!trop && ls.length * taille * interligne <= zone.h) break;
  }
  if (taille < tailleMin) taille = tailleMin;
  const hauteurTotale = ls.length * taille * interligne;
  let y = zone.y + (valign === 'haut' ? 0 : (zone.h - hauteurTotale) / 2) + taille * 0.85;
  const morceaux = [];
  for (const l of ls) {
    const w = largeur(f, l, taille);
    const x = alignement === 'centre' ? zone.x + (zone.l - w) / 2 : zone.x;
    morceaux.push(tracer(f, l, x, y, taille));
    y += taille * interligne;
  }
  return { d: morceaux.join(' '), taille, lignes: ls.length };
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// SVG complet avec un texte centré : svgTexte('Bonjour', 512, 512, { couleur:'#fff', contour:'#000' })
function svgTexte(texte, w, h, { couleur = '#ffffff', contour = '#000000', epaisseurContour = 0.06, marge = 24, fond = null, ...opts } = {}) {
  const r = disposer(texte, { x: marge, y: marge, l: w - 2 * marge, h: h - 2 * marge }, opts);
  const trait = contour ? ` stroke="${contour}" stroke-width="${Math.max(2, r.taille * epaisseurContour)}" stroke-linejoin="round" paint-order="stroke"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fond ? `<rect width="100%" height="100%" fill="${fond}"/>` : ''}<path d="${r.d}" fill="${couleur}"${trait}/></svg>`;
}

module.exports = { largeur, tracer, police, disposer, svgTexte, echapper, nettoyer };
