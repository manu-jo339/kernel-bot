// Kernel Bot — logos de texte : 49 styles dessinés en local (SVG → PNG avec sharp), sans service extérieur.
// Les styles sont des ambiances de couleurs génériques (néon, or, métal, nuages…). Aucun logo officiel, aucune image de marque n'est reproduit.
const sharp = require('sharp');
const T = require('./texte');

const W = 1024, H = 512;

// Générateur pseudo-aléatoire stable : le même texte donne toujours le même décor
function graine(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n1 = (x) => Math.round(x * 10) / 10;

// ───── Fonds ─────
function stops(cs) {
  return cs.map((c, i) => `<stop offset="${(i / Math.max(1, cs.length - 1)) * 100}%" stop-color="${c}"/>`).join('');
}
const FONDS = {
  plein: (c) => `<rect width="${W}" height="${H}" fill="${c}"/>`,
  lineaire: (cs, angle = 90) => {
    const a = (angle * Math.PI) / 180, x = Math.cos(a) / 2, y = Math.sin(a) / 2;
    return `<defs><linearGradient id="gfond" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${stops(cs)}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#gfond)"/>`;
  },
  radial: (cs, cx = 0.5, cy = 0.5, r = 0.8) => `<defs><radialGradient id="gfond" cx="${cx}" cy="${cy}" r="${r}">${stops(cs)}</radialGradient></defs><rect width="${W}" height="${H}" fill="url(#gfond)"/>`,
};

// ───── Décors ─────
const DECOS = {
  rayons: (r, { couleur = '#fff', alpha = 0.15, n = 18, cx = W / 2, cy = H / 2 } = {}) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a1 = ((i * 2) / (n * 2)) * Math.PI * 2, a2 = ((i * 2 + 1) / (n * 2)) * Math.PI * 2, L = 1400;
      s += `<path d="M${cx} ${cy}L${n1(cx + Math.cos(a1) * L)} ${n1(cy + Math.sin(a1) * L)}L${n1(cx + Math.cos(a2) * L)} ${n1(cy + Math.sin(a2) * L)}Z" fill="${couleur}" fill-opacity="${alpha}"/>`;
    }
    return s;
  },
  etoiles: (r, { n = 80, couleur = '#fff', max = 3, halo = false } = {}) => {
    let s = halo ? '<defs><filter id="fh"><feGaussianBlur stdDeviation="3"/></filter></defs>' : '';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, t = 0.5 + r() * max, a = 0.3 + r() * 0.7;
      s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(t)}" fill="${couleur}" fill-opacity="${n1(a)}"/>`;
      if (halo && r() < 0.15) s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(t * 4)}" fill="${couleur}" fill-opacity=".5" filter="url(#fh)"/>`;
    }
    return s;
  },
  etoilesBrillantes: (r, { n = 14, couleur = '#fff' } = {}) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, t = 8 + r() * 22;
      s += `<path d="M${n1(x)} ${n1(y - t)}Q${n1(x)} ${n1(y)} ${n1(x + t)} ${n1(y)}Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y + t)}Q${n1(x)} ${n1(y)} ${n1(x - t)} ${n1(y)}Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y - t)}Z" fill="${couleur}" fill-opacity="${n1(0.5 + r() * 0.5)}"/>`;
    }
    return s;
  },
  grille: (r, { couleur = '#0ff', alpha = 0.5, horizon = 0.55 } = {}) => {
    const y0 = H * horizon;
    let s = `<g stroke="${couleur}" stroke-opacity="${alpha}" stroke-width="2" fill="none">`;
    for (let i = -14; i <= 14; i++) s += `<path d="M${W / 2 + i * 18} ${y0}L${W / 2 + i * 150} ${H}"/>`;
    for (let k = 1; k <= 9; k++) {
      const y = y0 + (H - y0) * (k / 9) ** 2;
      s += `<path d="M0 ${n1(y)}H${W}"/>`;
    }
    return s + '</g>';
  },
  grillePlate: (r, { couleur = '#0f0', alpha = 0.15, pas = 32 } = {}) => {
    let s = `<g stroke="${couleur}" stroke-opacity="${alpha}" stroke-width="1">`;
    for (let x = 0; x <= W; x += pas) s += `<path d="M${x} 0V${H}"/>`;
    for (let y = 0; y <= H; y += pas) s += `<path d="M0 ${y}H${W}"/>`;
    return s + '</g>';
  },
  pluie: (r, { n = 140, couleur = '#cfe6ff', alpha = 0.5 } = {}) => {
    let s = `<g stroke="${couleur}" stroke-opacity="${alpha}" stroke-width="2" stroke-linecap="round">`;
    for (let i = 0; i < n; i++) {
      const x = r() * (W + 100), y = r() * H, l = 14 + r() * 30;
      s += `<path d="M${n1(x)} ${n1(y)}l${n1(-l * 0.3)} ${n1(l)}" stroke-opacity="${n1(0.2 + r() * alpha)}"/>`;
    }
    return s + '</g>';
  },
  eclairs: (r, { couleur = '#fff', glow = '#6cf', n = 3 } = {}) => {
    let s = `<defs><filter id="fe" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
    for (let k = 0; k < n; k++) {
      let x = 120 + r() * (W - 240), y = 0, d = `M${n1(x)} 0`;
      while (y < H) {
        x += (r() - 0.5) * 90;
        y += 40 + r() * 50;
        d += `L${n1(x)} ${n1(y)}`;
      }
      s += `<path d="${d}" fill="none" stroke="${glow}" stroke-width="12" stroke-opacity=".7" filter="url(#fe)"/><path d="${d}" fill="none" stroke="${couleur}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    return s;
  },
  bokeh: (r, { n = 22, couleurs = ['#fff'], alpha = 0.25, max = 60 } = {}) => {
    let s = '<defs><filter id="fb"><feGaussianBlur stdDeviation="3"/></filter></defs>';
    for (let i = 0; i < n; i++) s += `<circle cx="${n1(r() * W)}" cy="${n1(r() * H)}" r="${n1(12 + r() * max)}" fill="${couleurs[Math.floor(r() * couleurs.length)]}" fill-opacity="${n1(0.05 + r() * alpha)}" filter="url(#fb)"/>`;
    return s;
  },
  nuages: (r, { n = 7, couleur = '#fff', alpha = 0.9, bas = false } = {}) => {
    let s = '<defs><filter id="fn" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter></defs>';
    for (let i = 0; i < n; i++) {
      const cx = r() * W, cy = bas ? H * (0.55 + r() * 0.45) : r() * H, w = 90 + r() * 110;
      s += `<g fill="${couleur}" fill-opacity="${alpha}" filter="url(#fn)"><ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(w)}" ry="${n1(w * 0.32)}"/><ellipse cx="${n1(cx - w * 0.4)}" cy="${n1(cy + 6)}" rx="${n1(w * 0.55)}" ry="${n1(w * 0.28)}"/><ellipse cx="${n1(cx + w * 0.45)}" cy="${n1(cy + 8)}" rx="${n1(w * 0.5)}" ry="${n1(w * 0.26)}"/><ellipse cx="${n1(cx)}" cy="${n1(cy - w * 0.18)}" rx="${n1(w * 0.5)}" ry="${n1(w * 0.3)}"/></g>`;
    }
    return s;
  },
  points: (r, { couleur = '#000', alpha = 0.25, pas = 24, depuis = 'bas-droite' } = {}) => {
    let s = `<g fill="${couleur}" fill-opacity="${alpha}">`;
    for (let y = 0; y < H + pas; y += pas)
      for (let x = (Math.floor(y / pas) % 2) * (pas / 2); x < W + pas; x += pas) {
        const d = depuis === 'bas-droite' ? Math.hypot(W - x, H - y) / 1100 : Math.hypot(x, y) / 1100;
        const rad = Math.max(0, 1 - d) * (pas * 0.42);
        if (rad > 0.8) s += `<circle cx="${x}" cy="${y}" r="${n1(rad)}"/>`;
      }
    return s + '</g>';
  },
  sable: (r, { clair = '#f6e0a8', sombre = '#b8894a', n = 700 } = {}) => {
    let s = `<path d="M0 ${H * 0.72}Q${W * 0.25} ${H * 0.6} ${W * 0.5} ${H * 0.74}T${W} ${H * 0.68}V${H}H0Z" fill="${sombre}" fill-opacity=".25"/>`;
    for (let i = 0; i < n; i++) s += `<circle cx="${n1(r() * W)}" cy="${n1(r() * H)}" r="${n1(0.6 + r() * 1.4)}" fill="${r() < 0.5 ? clair : sombre}" fill-opacity="${n1(0.3 + r() * 0.5)}"/>`;
    return s;
  },
  bois: (r, { couleur = '#3b2210', alpha = 0.22, planches = 4 } = {}) => {
    let s = `<g fill="none" stroke="${couleur}" stroke-linecap="round">`;
    for (let i = 0; i < 70; i++) {
      const y = r() * H, a = 3 + r() * 9, f = 0.004 + r() * 0.01, p = r() * 6;
      let d = '';
      for (let x = 0; x <= W; x += 32) d += `${x ? 'L' : 'M'}${x} ${n1(y + Math.sin(x * f + p) * a)}`;
      s += `<path d="${d}" stroke-width="${n1(0.6 + r() * 2.2)}" stroke-opacity="${n1(alpha * (0.4 + r()))}"/>`;
    }
    for (let k = 1; k < planches; k++) s += `<path d="M0 ${(H / planches) * k}H${W}" stroke-width="4" stroke-opacity=".6"/>`;
    return s + '</g>';
  },
  vagues: (r, { couleurs = ['#fff'], alpha = 0.3, n = 4, haut = 0.65 } = {}) => {
    let s = '';
    for (let k = 0; k < n; k++) {
      const y = H * (haut + (k / n) * (1 - haut)), a = 10 + k * 3, f = 0.01 + k * 0.003, p = r() * 6;
      let d = `M0 ${H}L0 ${n1(y)}`;
      for (let x = 0; x <= W; x += 16) d += `L${x} ${n1(y + Math.sin(x * f + p) * a)}`;
      s += `<path d="${d}L${W} ${H}Z" fill="${couleurs[k % couleurs.length]}" fill-opacity="${alpha}"/>`;
    }
    return s;
  },
  matrice: (r, { couleur = '#00ff66', n = 90 } = {}) => {
    let s = `<g fill="${couleur}">`;
    for (let i = 0; i < n; i++) {
      const x = Math.floor((r() * W) / 14) * 14, y0 = r() * H, L = 3 + Math.floor(r() * 9);
      for (let k = 0; k < L; k++) s += `<rect x="${x}" y="${n1(y0 + k * 16)}" width="8" height="11" fill-opacity="${n1(0.7 * (1 - k / L) ** 1.5 + 0.03)}"/>`;
    }
    return s + '</g>';
  },
  hexagones: (r, { couleur = '#6af', alpha = 0.25, rad = 34 } = {}) => {
    let s = `<g fill="none" stroke="${couleur}" stroke-opacity="${alpha}" stroke-width="1.5">`;
    const w = Math.sqrt(3) * rad;
    for (let row = -1; row < H / (rad * 1.5) + 1; row++)
      for (let col = -1; col < W / w + 1; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * rad * 1.5;
        let d = '';
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          d += `${k ? 'L' : 'M'}${n1(cx + Math.cos(a) * rad)} ${n1(cy + Math.sin(a) * rad)}`;
        }
        s += `<path d="${d}Z"/>`;
      }
    return s + '</g>';
  },
  eclaboussures: (r, { couleurs = ['#f0f', '#0ff', '#ff0'], n = 26 } = {}) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const cx = r() * W, cy = r() * H, R = 8 + r() * 46, c = couleurs[Math.floor(r() * couleurs.length)];
      s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R)}" fill="${c}" fill-opacity="${n1(0.55 + r() * 0.4)}"/>`;
      for (let k = 0; k < 5; k++) s += `<circle cx="${n1(cx + (r() - 0.5) * R * 4)}" cy="${n1(cy + (r() - 0.5) * R * 4)}" r="${n1(1 + r() * R * 0.25)}" fill="${c}" fill-opacity=".8"/>`;
    }
    return s;
  },
  briques: (r, { couleur = '#2a1410', ciment = '#7a6a60', h = 46, l = 112 } = {}) => {
    let s = `<g>`;
    for (let row = 0; row * h < H + h; row++)
      for (let col = -1; col * l < W + l; col++) {
        const x = col * l + (row % 2 ? l / 2 : 0), y = row * h, v = 0.82 + r() * 0.3;
        s += `<rect x="${x + 2}" y="${y + 2}" width="${l - 4}" height="${h - 4}" fill="${couleur}" fill-opacity="${n1(v)}"/>`;
      }
    return `<rect width="${W}" height="${H}" fill="${ciment}"/>` + s + '</g>';
  },
  spirale: (r, { couleur = '#fff', alpha = 0.18, cx = W / 2, cy = H / 2 } = {}) => {
    let d = '';
    for (let a = 0; a < Math.PI * 14; a += 0.15) d += `${a ? 'L' : 'M'}${n1(cx + Math.cos(a) * a * 14)} ${n1(cy + Math.sin(a) * a * 14)}`;
    return `<path d="${d}" fill="none" stroke="${couleur}" stroke-opacity="${alpha}" stroke-width="22" stroke-linecap="round"/>`;
  },
  bulles: (r, { n = 34 } = {}) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, R = 4 + r() * 24;
      s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(R)}" fill="#fff" fill-opacity=".10" stroke="#fff" stroke-opacity=".55" stroke-width="2"/><circle cx="${n1(x - R * 0.3)}" cy="${n1(y - R * 0.3)}" r="${n1(R * 0.22)}" fill="#fff" fill-opacity=".8"/>`;
    }
    return s;
  },
  soleil: (r, { x = W * 0.82, y = H * 0.2, rayon = 70 } = {}) =>
    `<defs><radialGradient id="gsol"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd84a"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient></defs><circle cx="${x}" cy="${y}" r="${rayon * 2.6}" fill="url(#gsol)"/>` + DECOS.rayons(r, { couleur: '#fff7b0', alpha: 0.10, n: 14, cx: x, cy: y }),
  etoilesDrapeau: (r, { couleur = '#fff', alpha = 0.9 } = {}) => {
    let s = '';
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 9; col++) {
        const cx = 60 + col * 112 + (row % 2 ? 56 : 0), cy = 40 + row * 40, R = 13;
        let d = '';
        for (let k = 0; k < 10; k++) {
          const a = (-Math.PI / 2) + (Math.PI / 5) * k, rr = k % 2 ? R * 0.42 : R;
          d += `${k ? 'L' : 'M'}${n1(cx + Math.cos(a) * rr)} ${n1(cy + Math.sin(a) * rr)}`;
        }
        s += `<path d="${d}Z" fill="${couleur}" fill-opacity="${alpha}"/>`;
      }
    return s;
  },
  bandes: (r, { couleurs = ['#c0182b', '#fff'], haut = 0.72, h = 20 } = {}) => {
    let s = '';
    for (let y = H * haut, i = 0; y < H; y += h, i++) s += `<rect x="0" y="${n1(y)}" width="${W}" height="${h}" fill="${couleurs[i % couleurs.length]}" fill-opacity=".85"/>`;
    return s;
  },
  planete: (r, { x = W * 0.84, y = H * 0.74, rayon = 90, couleurs = ['#7fb2ff', '#1a2f6b'] } = {}) =>
    `<defs><radialGradient id="gpl" cx=".35" cy=".3" r=".9">${stops(couleurs)}</radialGradient></defs><ellipse cx="${x}" cy="${y}" rx="${rayon * 1.7}" ry="${rayon * 0.32}" fill="none" stroke="#cfe0ff" stroke-opacity=".5" stroke-width="6" transform="rotate(-18 ${x} ${y})"/><circle cx="${x}" cy="${y}" r="${rayon}" fill="url(#gpl)"/><path d="M${x - rayon * 1.7} ${y + rayon * 0.2}Q${x} ${y + rayon * 0.62} ${x + rayon * 1.7} ${y - rayon * 0.2}" fill="none" stroke="#cfe0ff" stroke-opacity=".7" stroke-width="6" transform="rotate(-18 ${x} ${y})" clip-path="inset(0)"/>`,
  brume: (r, { couleurs = ['#a0f', '#06f'], n = 7, alpha = 0.45 } = {}) => {
    let s = '<defs><filter id="fbr" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="45"/></filter></defs>';
    for (let i = 0; i < n; i++) s += `<ellipse cx="${n1(r() * W)}" cy="${n1(r() * H)}" rx="${n1(120 + r() * 200)}" ry="${n1(70 + r() * 110)}" fill="${couleurs[Math.floor(r() * couleurs.length)]}" fill-opacity="${alpha}" filter="url(#fbr)" transform="rotate(${n1(r() * 180)} ${W / 2} ${H / 2})"/>`;
    return s;
  },
  lignes: (r, { couleur = '#000', alpha = 0.12, pas = 4 } = {}) => {
    let s = `<g stroke="${couleur}" stroke-opacity="${alpha}" stroke-width="1">`;
    for (let y = 0; y < H; y += pas) s += `<path d="M0 ${y}H${W}"/>`;
    return s + '</g>';
  },
  vignette: (r, { alpha = 0.55, couleur = '#000' } = {}) => `<defs><radialGradient id="gvig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="${couleur}" stop-opacity="0"/><stop offset="1" stop-color="${couleur}" stop-opacity="${alpha}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#gvig)"/>`,
  cadre: (r, { couleur = '#c9a24a', double = true, marge = 20 } = {}) => `<rect x="${marge}" y="${marge}" width="${W - 2 * marge}" height="${H - 2 * marge}" fill="none" stroke="${couleur}" stroke-width="5"/>` + (double ? `<rect x="${marge + 12}" y="${marge + 12}" width="${W - 2 * marge - 24}" height="${H - 2 * marge - 24}" fill="none" stroke="${couleur}" stroke-width="2"/>` : ''),
  marbre: (r, { couleur = '#8a8f99', n = 9 } = {}) => {
    let s = `<g fill="none" stroke="${couleur}" stroke-linecap="round">`;
    for (let i = 0; i < n; i++) {
      let x = r() * W, y = 0, d = `M${n1(x)} 0`;
      while (y < H) {
        x += (r() - 0.5) * 90;
        y += 30 + r() * 40;
        d += `L${n1(x)} ${n1(y)}`;
      }
      s += `<path d="${d}" stroke-width="${n1(0.8 + r() * 2)}" stroke-opacity="${n1(0.15 + r() * 0.3)}"/>`;
    }
    return s + '</g>';
  },
  projecteurs: (r, { couleur = '#fff', alpha = 0.16 } = {}) => {
    let s = '';
    for (const x of [W * 0.15, W * 0.5, W * 0.85]) s += `<path d="M${x - 14} 0L${x + 14} 0L${x + 220} ${H}L${x - 220} ${H}Z" fill="${couleur}" fill-opacity="${alpha}"/>`;
    return s;
  },
  pelouse: (r, { c1 = '#1f8a3a', c2 = '#27a346', ligne = '#ffffff' } = {}) => {
    let s = '';
    for (let i = 0; i < 12; i++) s += `<rect x="${(W / 12) * i}" y="0" width="${W / 12 + 1}" height="${H}" fill="${i % 2 ? c1 : c2}"/>`;
    return s + `<g fill="none" stroke="${ligne}" stroke-opacity=".6" stroke-width="5"><rect x="30" y="30" width="${W - 60}" height="${H - 60}"/><path d="M${W / 2} 30V${H - 30}"/><circle cx="${W / 2}" cy="${H / 2}" r="86"/></g>`;
  },
  pentagones: (r, { couleur = '#fff', alpha = 0.14 } = {}) => {
    let s = `<g fill="${couleur}" fill-opacity="${alpha}">`;
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 9; col++) {
        const cx = 60 + col * 120 + (row % 2 ? 60 : 0), cy = 50 + row * 105, R = 34;
        let d = '';
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + ((Math.PI * 2) / 5) * k;
          d += `${k ? 'L' : 'M'}${n1(cx + Math.cos(a) * R)} ${n1(cy + Math.sin(a) * R)}`;
        }
        s += `<path d="${d}Z"/>`;
      }
    return s + '</g>';
  },
  eclat: (r, { couleur = '#fff', alpha = 0.4 } = {}) => `<path d="M0 0L${W * 0.55} 0L${W * 0.25} ${H}L0 ${H}Z" fill="${couleur}" fill-opacity="${alpha * 0.35}"/>`,
};

// ───── Texte ─────
function rendreTexte(texte, spec = {}) {
  const t = { poids: 900, tailleMax: 190, marge: 70, ...spec };
  const zone = { x: t.marge, y: 60, l: W - 2 * t.marge, h: H - 120 + (t.decalageH || 0) };
  const r = T.disposer(texte, zone, { poids: t.poids, tailleMax: t.tailleMax, interligne: 1.08 });
  if (!r.d) return null;
  const hauteur = r.lignes * r.taille * 1.08;
  const cy = zone.y + zone.h / 2;
  const y1 = cy - hauteur / 2, y2 = cy + hauteur / 2;
  const id = (n) => 't' + n;
  let defs = '', corps = '';
  const dg = (nom, cs, v = true) => {
    defs += `<linearGradient id="${id(nom)}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(y1)}" x2="${v ? 0 : W}" y2="${v ? n1(y2) : 0}">${stops(cs)}</linearGradient>`;
    return `url(#${id(nom)})`;
  };
  const flou = (nom, sd) => {
    defs += `<filter id="${id(nom)}" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
    return `filter="url(#${id(nom)})"`;
  };
  const P = (attrs, dx = 0, dy = 0) => `<path d="${r.d}" ${dx || dy ? `transform="translate(${dx} ${dy})"` : ''} ${attrs}/>`;
  const taille = r.taille;

  // lueurs
  for (const [i, g] of (t.lueurs || []).entries()) corps += P(`fill="${g.couleur}" stroke="${g.couleur}" stroke-width="${g.epaisseur ?? taille * 0.05}" stroke-linejoin="round" ${flou('gl' + i, g.rayon)} opacity="${g.alpha ?? 1}"`);
  // extrusion (3D)
  if (t.extrusion) {
    const e = t.extrusion;
    for (let i = e.n; i >= 1; i--) corps += P(`fill="${e.couleurs ? e.couleurs[Math.min(e.couleurs.length - 1, Math.floor((i / e.n) * e.couleurs.length))] : e.couleur}" stroke="${e.couleurs ? e.couleurs[Math.min(e.couleurs.length - 1, Math.floor((i / e.n) * e.couleurs.length))] : e.couleur}" stroke-width="2" stroke-linejoin="round"`, e.dx * i, e.dy * i);
  }
  // ombre portée
  if (t.ombre) corps += P(`fill="${t.ombre.couleur}" fill-opacity="${t.ombre.alpha ?? 0.6}" ${t.ombre.flou ? flou('om', t.ombre.flou) : ''}`, t.ombre.dx, t.ombre.dy);
  // doublon décalé (effet graffiti / typographie)
  for (const d of t.doublons || []) corps += P(`fill="${d.couleur}" ${d.contour ? `stroke="${d.contour}" stroke-width="${taille * 0.05}" stroke-linejoin="round"` : ''}`, d.dx, d.dy);
  // contours
  for (const c of t.contours || []) corps += P(`fill="${c.couleur}" stroke="${c.couleur}" stroke-width="${c.epaisseur * taille}" stroke-linejoin="round"`);
  // creux (gravure)
  if (t.creux) {
    corps += P(`fill="${t.creux.clair}" fill-opacity=".8"`, 1.5, 2.5);
    corps += P(`fill="${t.creux.sombre}" fill-opacity=".9"`, -1.5, -2.5);
  }
  // remplissage
  let fill = t.couleur || '#fff';
  if (t.degrade) fill = dg('fill', t.degrade);
  if (t.neon) {
    corps += P(`fill="none" stroke="${t.neon.couleur}" stroke-width="${taille * 0.045}" stroke-linejoin="round" stroke-linecap="round"`);
    corps += P(`fill="none" stroke="${t.neon.coeur || '#fff'}" stroke-width="${taille * 0.016}" stroke-linejoin="round" stroke-linecap="round"`);
  } else if (t.trait) {
    corps += P(`fill="${t.couleur ? t.couleur : 'none'}" fill-opacity="${t.alphaRemplissage ?? 0.15}" stroke="${t.trait.couleur}" stroke-width="${t.trait.epaisseur ?? 3}" ${t.trait.pointille ? 'stroke-dasharray="10 7"' : ''} stroke-linejoin="round"`);
  } else {
    corps += P(`fill="${fill}" ${t.alphaTexte ? `fill-opacity="${t.alphaTexte}"` : ''} ${t.contourFin ? `stroke="${t.contourFin.couleur}" stroke-width="${t.contourFin.epaisseur}" stroke-linejoin="round"` : ''} ${t.flouTexte ? flou('ft', t.flouTexte) : ''}`);
  }
  // reflet brillant sur la moitié haute
  if (t.reflet) {
    defs += `<linearGradient id="${id('rf')}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(y1)}" x2="0" y2="${n1(y2)}"><stop offset="0" stop-color="#fff" stop-opacity="${t.reflet}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    corps += P(`fill="url(#${id('rf')})"`);
  }
  // bandes métalliques / lignes horizontales sombres
  if (t.bandes) {
    defs += `<clipPath id="${id('cl')}"><path d="${r.d}"/></clipPath>`;
    corps += `<g clip-path="url(#${id('cl')})" stroke="${t.bandes}" stroke-opacity=".25" stroke-width="2">`;
    for (let y = y1; y < y2; y += 6) corps += `<path d="M0 ${n1(y)}H${W}"/>`;
    corps += '</g>';
  }
  return `<defs>${defs}</defs>${corps}`;
}

// ───── Styles ─────
// fond: [type, ...args] · deco: [[nom, options], …] · texte: options de rendreTexte
const or = ['#fff6c8', '#ffd24a', '#c98a10', '#fbe27a', '#a8700a'];
const STYLES = {
  dragonball: { fond: ['radial', ['#fff1a8', '#ffa51f', '#b34000']], deco: [['rayons', { couleur: '#fff', alpha: 0.18 }], ['etoiles', { n: 14, couleur: '#d32b00', max: 9 }]], texte: { degrade: ['#fff5a6', '#ffbe1a', '#ff6a00'], contours: [{ couleur: '#5c1b00', epaisseur: 0.13 }], ombre: { couleur: '#2a0800', dx: 0, dy: 9, alpha: 0.5 }, reflet: 0.6 } },
  dragonball2: { fond: ['radial', ['#13244f', '#07102b', '#02040f'], 0.5, 0.55, 0.9], deco: [['etoiles', { n: 60, max: 2 }], ['rayons', { couleur: '#6bd1ff', alpha: 0.1, n: 22 }]], texte: { couleur: '#ffffff', lueurs: [{ couleur: '#2aa8ff', rayon: 16, epaisseur: 24 }, { couleur: '#bfeaff', rayon: 5, epaisseur: 8 }], contours: [{ couleur: '#0b4fa8', epaisseur: 0.08 }], reflet: 0.0 } },
  deadpool: { fond: ['radial', ['#2b0508', '#0d0102'], 0.5, 0.5, 0.9], deco: [['points', { couleur: '#d4121e', alpha: 0.35, pas: 22 }], ['lignes', { couleur: '#000', alpha: 0.2 }]], texte: { degrade: ['#ff3a3a', '#d4121e', '#8d0711'], contours: [{ couleur: '#000', epaisseur: 0.14 }, { couleur: '#fff', epaisseur: 0.2 }], ombre: { couleur: '#000', dx: 8, dy: 10, alpha: 0.7 }, reflet: 0.35 } },
  blackpink: { fond: ['plein', '#0a0a0a'], deco: [['points', { couleur: '#ff4fa3', alpha: 0.22, pas: 26, depuis: 'haut' }], ['etoilesBrillantes', { n: 10, couleur: '#ff9cd0' }]], texte: { couleur: '#ff4fa3', poids: 900, lueurs: [{ couleur: '#ff2d95', rayon: 14, epaisseur: 18 }], contours: [{ couleur: '#1b1b1b', epaisseur: 0.1 }], doublons: [{ couleur: '#000', dx: 7, dy: 7, contour: '#ff4fa3' }], reflet: 0.3 } },
  blackpink2: { fond: ['lineaire', ['#ffb3d6', '#ff5fae'], 120], deco: [['bokeh', { couleurs: ['#fff', '#ffd1e8'], alpha: 0.35 }], ['etoilesBrillantes', { n: 12, couleur: '#fff' }]], texte: { couleur: '#101010', contours: [{ couleur: '#fff', epaisseur: 0.1 }], ombre: { couleur: '#7a0c46', dx: 6, dy: 8, alpha: 0.55 } } },
  blackpink3: { fond: ['lineaire', ['#0a0a0a', '#1a0a14', '#ff2d95'], 20], deco: [['grillePlate', { couleur: '#ff4fa3', alpha: 0.12, pas: 40 }], ['eclat', { couleur: '#ff4fa3', alpha: 0.5 }]], texte: { couleur: '#fff', poids: 900, lueurs: [{ couleur: '#ff2d95', rayon: 10, epaisseur: 12 }], contours: [{ couleur: '#ff2d95', epaisseur: 0.05 }], doublons: [{ couleur: '#0a0a0a', dx: 6, dy: 6 }] } },
  neon1: { fond: ['plein', '#050814'], deco: [['hexagones', { couleur: '#18e0ff', alpha: 0.07, rad: 40 }]], texte: { poids: 700, neon: { couleur: '#18e0ff', coeur: '#e8ffff' }, lueurs: [{ couleur: '#18e0ff', rayon: 18, epaisseur: 26, alpha: 0.9 }, { couleur: '#18e0ff', rayon: 6, epaisseur: 12 }] } },
  neon2: { fond: ['plein', '#12041a'], deco: [['grille', { couleur: '#ff2fd0', alpha: 0.35 }]], texte: { poids: 700, neon: { couleur: '#ff2fd0', coeur: '#ffe6fb' }, lueurs: [{ couleur: '#ff2fd0', rayon: 18, epaisseur: 26, alpha: 0.9 }, { couleur: '#ff2fd0', rayon: 6, epaisseur: 12 }] } },
  neon3: { fond: ['plein', '#03120a'], deco: [['etoiles', { n: 40, couleur: '#c8ff3d', max: 1.5 }]], texte: { poids: 700, neon: { couleur: '#7dff3a', coeur: '#f4ffe0' }, lueurs: [{ couleur: '#7dff3a', rayon: 18, epaisseur: 26, alpha: 0.9 }, { couleur: '#d8ff3a', rayon: 6, epaisseur: 12 }] } },
  football: { fond: ['plein', '#1f8a3a'], deco: [['pelouse', {}]], texte: { couleur: '#fff', contours: [{ couleur: '#0c3a18', epaisseur: 0.12 }], ombre: { couleur: '#000', dx: 6, dy: 8, alpha: 0.5 } } },
  football2: { fond: ['lineaire', ['#050a18', '#0d2a52'], 90], deco: [['projecteurs', {}], ['etoiles', { n: 40, max: 1.5 }], ['vagues', { couleurs: ['#1f8a3a'], alpha: 1, n: 1, haut: 0.88 }]], texte: { degrade: ['#fff7a0', '#ffd400', '#e8a800'], contours: [{ couleur: '#2a1a00', epaisseur: 0.1 }], ombre: { couleur: '#000', dx: 0, dy: 9, alpha: 0.55 }, reflet: 0.5 } },
  football3: { fond: ['lineaire', ['#c0182b', '#7a0b1a'], 90], deco: [['pentagones', { couleur: '#fff', alpha: 0.12 }], ['rayons', { couleur: '#fff', alpha: 0.06, n: 14 }]], texte: { couleur: '#fff', contours: [{ couleur: '#2a0309', epaisseur: 0.12 }], ombre: { couleur: '#000', dx: 8, dy: 10, alpha: 0.5 }, reflet: 0.3 } },
  acier: { fond: ['lineaire', ['#2b2f36', '#4b515b', '#2b2f36'], 90], deco: [['lignes', { couleur: '#fff', alpha: 0.05, pas: 3 }], ['vignette', { alpha: 0.5 }]], texte: { degrade: ['#f4f6f8', '#aeb5bf', '#5b626d', '#c9ced6', '#7c838e'], contours: [{ couleur: '#14171c', epaisseur: 0.1 }], extrusion: { n: 8, dx: 0, dy: 1.2, couleur: '#20242a' }, bandes: '#000', reflet: 0.5 } },
  peinture: { fond: ['plein', '#f7f3ea'], deco: [['eclaboussures', { couleurs: ['#ff3d71', '#2fb5ff', '#ffd000', '#2ed573', '#a55eea'], n: 30 }]], texte: { degrade: ['#ff3d71', '#a55eea', '#2fb5ff', '#2ed573'], poids: 900, contours: [{ couleur: '#fff', epaisseur: 0.12 }], ombre: { couleur: '#000', dx: 5, dy: 6, alpha: 0.28, flou: 4 } } },
  tonnerre: { fond: ['lineaire', ['#0a0d1f', '#1a1f45', '#0a0d1f'], 90], deco: [['nuages', { n: 6, couleur: '#2b3270', alpha: 0.9 }], ['eclairs', { couleur: '#fffbe0', glow: '#ffe24a', n: 3 }]], texte: { degrade: ['#ffffff', '#fff3a0', '#ffd400'], lueurs: [{ couleur: '#ffd400', rayon: 12, epaisseur: 16, alpha: 0.9 }], contours: [{ couleur: '#2a1f00', epaisseur: 0.08 }] } },
  thor: { fond: ['radial', ['#27406b', '#0e1830', '#050a14'], 0.5, 0.4, 0.95], deco: [['nuages', { n: 5, couleur: '#3d5c94', alpha: 0.5 }], ['eclairs', { couleur: '#e8f6ff', glow: '#4aa8ff', n: 2 }]], texte: { degrade: ['#ffffff', '#c3d2e6', '#7d8fa8', '#d9e3f0'], lueurs: [{ couleur: '#3da0ff', rayon: 14, epaisseur: 18, alpha: 0.9 }], contours: [{ couleur: '#0b1830', epaisseur: 0.1 }], extrusion: { n: 6, dx: 0, dy: 1.2, couleur: '#24344f' }, reflet: 0.5 } },
  graffiti1: { fond: ['plein', '#7a6a60'], deco: [['briques', {}], ['vignette', { alpha: 0.4 }]], texte: { degrade: ['#ffe14a', '#ff7a1a', '#ff2d6f'], contours: [{ couleur: '#111', epaisseur: 0.16 }], doublons: [{ couleur: '#111', dx: 9, dy: 10 }], reflet: 0.35 } },
  graffiti2: { fond: ['lineaire', ['#3a3d45', '#22252b'], 90], deco: [['eclaboussures', { couleurs: ['#00e0ff', '#ff3d9a', '#b6ff1a'], n: 18 }], ['lignes', { couleur: '#000', alpha: 0.1, pas: 6 }]], texte: { couleur: '#fff', poids: 900, contours: [{ couleur: '#111', epaisseur: 0.1 }], doublons: [{ couleur: '#00e0ff', dx: -6, dy: -5 }, { couleur: '#ff3d9a', dx: 6, dy: 6 }] } },
  graffiti3: { fond: ['lineaire', ['#2a0b4d', '#8a1f6b', '#ff7a1a'], 70], deco: [['bokeh', { couleurs: ['#ffb36b', '#ff4fa3'], alpha: 0.3 }], ['points', { couleur: '#000', alpha: 0.18, pas: 20 }]], texte: { degrade: ['#ffffff', '#ffe14a', '#ff9a1a'], contours: [{ couleur: '#2a0b4d', epaisseur: 0.16 }], doublons: [{ couleur: '#15042b', dx: 9, dy: 9 }], reflet: 0.4 } },
  or1: { fond: ['radial', ['#2b2417', '#0b0905'], 0.5, 0.5, 0.9], deco: [['etoilesBrillantes', { n: 8, couleur: '#ffe9a0' }]], texte: { degrade: or, contours: [{ couleur: '#3a2400', epaisseur: 0.08 }], extrusion: { n: 6, dx: 0, dy: 1.3, couleur: '#6b4607' }, reflet: 0.6 } },
  or2: { fond: ['lineaire', ['#3a0710', '#14020a'], 90], deco: [['cadre', { couleur: '#c9a24a' }], ['etoilesBrillantes', { n: 12, couleur: '#ffe9a0' }]], texte: { degrade: or, contours: [{ couleur: '#2a1600', epaisseur: 0.07 }], ombre: { couleur: '#000', dx: 0, dy: 9, alpha: 0.6, flou: 4 }, reflet: 0.55, tailleMax: 170 } },
  or3: { fond: ['lineaire', ['#fbfbfd', '#e3e5ea'], 90], deco: [['marbre', {}], ['cadre', { couleur: '#b98d2f', double: true }]], texte: { degrade: or, contours: [{ couleur: '#5a3a00', epaisseur: 0.06 }], ombre: { couleur: '#000', dx: 4, dy: 6, alpha: 0.28, flou: 3 }, reflet: 0.6, tailleMax: 170 } },
  or4: { fond: ['radial', ['#33242a', '#120a0e'], 0.5, 0.5, 0.9], deco: [['bokeh', { couleurs: ['#e8a58f', '#ffd0bf'], alpha: 0.2 }]], texte: { degrade: ['#ffe9df', '#f2b3a0', '#c97b66', '#f7cbbc', '#a85f4e'], contours: [{ couleur: '#3a1812', epaisseur: 0.08 }], extrusion: { n: 6, dx: 0, dy: 1.3, couleur: '#7a3f30' }, reflet: 0.6 } },
  or5: { fond: ['lineaire', ['#0a1a3f', '#050c20'], 90], deco: [['etoiles', { n: 50, couleur: '#ffe9a0', max: 1.6 }], ['rayons', { couleur: '#ffd24a', alpha: 0.05, n: 16 }]], texte: { degrade: or, contours: [{ couleur: '#2a1600', epaisseur: 0.07 }], extrusion: { n: 14, dx: 1.2, dy: 1.6, couleurs: ['#e1aa2a', '#b27c10', '#7a4f05'] }, reflet: 0.6, tailleMax: 175 } },
  galaxie: { fond: ['plein', '#050314'], deco: [['brume', { couleurs: ['#7a2cff', '#ff3d9a', '#1a6bff'], n: 8 }], ['etoiles', { n: 140, max: 1.8, halo: true }]], texte: { degrade: ['#ffffff', '#c9b0ff', '#7ab7ff'], lueurs: [{ couleur: '#8a5cff', rayon: 14, epaisseur: 14, alpha: 0.9 }], contours: [{ couleur: '#1a0b45', epaisseur: 0.06 }], reflet: 0.3 } },
  espace: { fond: ['plein', '#02030a'], deco: [['etoiles', { n: 160, max: 1.6, halo: true }], ['planete', {}]], texte: { couleur: '#fff', poids: 700, lueurs: [{ couleur: '#4a8cff', rayon: 10, epaisseur: 10 }], contours: [{ couleur: '#0a1230', epaisseur: 0.05 }], decalageH: -20 } },
  vintage: { fond: ['radial', ['#f3e4c1', '#dcc693', '#a98a52'], 0.5, 0.5, 0.85], deco: [['lignes', { couleur: '#6b4a1c', alpha: 0.05, pas: 3 }], ['cadre', { couleur: '#5a3b12' }], ['vignette', { alpha: 0.45, couleur: '#3a2308' }]], texte: { poids: 900, couleur: '#4a2f0e', ombre: { couleur: '#fff7e0', dx: 3, dy: 3, alpha: 0.7 }, contourFin: { couleur: '#2e1c06', epaisseur: 1.5 }, tailleMax: 165 } },
  hacker: { fond: ['plein', '#010a04'], deco: [['matrice', {}], ['lignes', { couleur: '#000', alpha: 0.3, pas: 3 }]], texte: { poids: 700, couleur: '#00ff66', lueurs: [{ couleur: '#00ff66', rayon: 8, epaisseur: 8 }], contours: [{ couleur: '#001a08', epaisseur: 0.09 }], tailleMax: 160 } },
  pluie: { fond: ['lineaire', ['#51606f', '#2a3440'], 90], deco: [['nuages', { n: 5, couleur: '#6a7888', alpha: 0.55 }], ['pluie', {}], ['vignette', { alpha: 0.4 }]], texte: { couleur: '#ffffff', contours: [{ couleur: '#1c2630', epaisseur: 0.09 }], ombre: { couleur: '#000', dx: 0, dy: 8, alpha: 0.4, flou: 4 }, alphaTexte: 0.95, reflet: 0.3 } },
  typographie: { fond: ['plein', '#f4f1ea'], deco: [['points', { couleur: '#111', alpha: 0.07, pas: 18 }]], texte: { couleur: '#111', poids: 900, doublons: [{ couleur: '#ff4d4d', dx: 10, dy: 8 }, { couleur: '#2f6bff', dx: -8, dy: -6 }], contours: [] } },
  bois: { fond: ['plein', '#a8693a'], deco: [['bois', {}], ['vignette', { alpha: 0.45, couleur: '#2a1204' }]], texte: { couleur: '#4a2a12', poids: 900, creux: { clair: '#e6b684', sombre: '#2a1204' } } },
  captainamerica: { fond: ['lineaire', ['#17377a', '#0d2150'], 90], deco: [['etoilesDrapeau', {}], ['bandes', {}], ['vignette', { alpha: 0.35 }]], texte: { couleur: '#fff', poids: 900, contours: [{ couleur: '#0a1a45', epaisseur: 0.12 }], ombre: { couleur: '#000', dx: 0, dy: 8, alpha: 0.5 }, reflet: 0.3, decalageH: -30 } },
  cubique: { fond: ['lineaire', ['#e8f3ff', '#b6d4f5'], 90], deco: [['grillePlate', { couleur: '#6fa3d8', alpha: 0.25, pas: 40 }]], texte: { couleur: '#3da5ff', degrade: ['#6fc4ff', '#2f8eef'], contours: [{ couleur: '#0a3f7a', epaisseur: 0.05 }], extrusion: { n: 26, dx: 1.5, dy: 1.5, couleurs: ['#1a5fb0', '#0f4486', '#0a2f63'] }, tailleMax: 165 } },
  vert: { fond: ['lineaire', ['#d6f5c2', '#4cae4c', '#13512a'], 70], deco: [['bokeh', { couleurs: ['#fff', '#d9ff9c'], alpha: 0.35 }], ['nuages', { n: 3, bas: true, couleur: '#2f8f3a', alpha: 0.6 }]], texte: { couleur: '#fff', contours: [{ couleur: '#0f4a22', epaisseur: 0.1 }], ombre: { couleur: '#04200e', dx: 0, dy: 9, alpha: 0.5, flou: 3 }, reflet: 0.3 } },
  naruto: { fond: ['radial', ['#ffb347', '#ff7a1a', '#c24a00'], 0.5, 0.5, 0.85], deco: [['spirale', { couleur: '#fff', alpha: 0.18 }], ['etoiles', { n: 18, couleur: '#1a2f6b', max: 5 }]], texte: { degrade: ['#ffffff', '#ffe8c2', '#ffb347'], contours: [{ couleur: '#16275a', epaisseur: 0.14 }], ombre: { couleur: '#0a1230', dx: 6, dy: 9, alpha: 0.6 }, reflet: 0.3 } },
  sable: { fond: ['lineaire', ['#f6dfa6', '#d9b26d'], 90], deco: [['sable', {}], ['vignette', { alpha: 0.28, couleur: '#6b4a1c' }]], texte: { couleur: '#b78a4a', poids: 900, creux: { clair: '#fff1c8', sombre: '#7a5524' } } },
  plasma: { fond: ['plein', '#06020f'], deco: [['brume', { couleurs: ['#ff2d95', '#18e0ff', '#7a2cff'], n: 9, alpha: 0.6 }]], texte: { degrade: ['#ffffff', '#ffd1f0', '#9ff0ff'], lueurs: [{ couleur: '#ff2d95', rayon: 14, epaisseur: 16 }, { couleur: '#18e0ff', rayon: 8, epaisseur: 8, alpha: 0.7 }], contours: [{ couleur: '#2a0b45', epaisseur: 0.05 }] } },
  avengers: { fond: ['radial', ['#2d3a52', '#121a2b', '#05080f'], 0.5, 0.45, 0.95], deco: [['rayons', { couleur: '#9fc4ff', alpha: 0.06, n: 12 }], ['hexagones', { couleur: '#8fb4ff', alpha: 0.08 }]], texte: { degrade: ['#ffffff', '#c7d3e6', '#8497b3', '#dde6f2'], contours: [{ couleur: '#b3121f', epaisseur: 0.1 }, { couleur: '#0a1020', epaisseur: 0.16 }], extrusion: { n: 6, dx: 0, dy: 1.3, couleur: '#2a3550' }, reflet: 0.5 } },
  sousleau: { fond: ['lineaire', ['#8ee8ff', '#1f9de0', '#073a6b'], 90], deco: [['rayons', { couleur: '#fff', alpha: 0.08, n: 10, cx: W * 0.3, cy: -80 }], ['bulles', {}], ['vagues', { couleurs: ['#0a5a9c', '#06406f'], alpha: 0.5, n: 3, haut: 0.85 }]], texte: { couleur: '#fff', contours: [{ couleur: '#05487f', epaisseur: 0.09 }], ombre: { couleur: '#02203a', dx: 0, dy: 8, alpha: 0.4, flou: 3 }, reflet: 0.5 } },
  verre: { fond: ['lineaire', ['#7a5cff', '#ff5fae', '#ffb14a'], 30], deco: [['bokeh', { couleurs: ['#fff', '#a0e6ff'], alpha: 0.55, n: 26 }]], texte: { couleur: '#fff', alphaTexte: 0.28, contourFin: { couleur: '#fff', epaisseur: 3 }, ombre: { couleur: '#2a0b5e', dx: 0, dy: 8, alpha: 0.35, flou: 5 }, reflet: 0.5 } },
  ete: { fond: ['lineaire', ['#40b7ff', '#9be4ff', '#fff3c0'], 90], deco: [['soleil', {}], ['nuages', { n: 3, alpha: 0.85 }], ['vagues', { couleurs: ['#1aa5d8', '#0d86b8'], alpha: 0.8, n: 3, haut: 0.82 }]], texte: { degrade: ['#fff6a0', '#ffd000', '#ff8a00'], contours: [{ couleur: '#a03a00', epaisseur: 0.1 }], ombre: { couleur: '#00395a', dx: 0, dy: 8, alpha: 0.35, flou: 3 }, reflet: 0.5, decalageH: -30 } },
  nuage1: { fond: ['lineaire', ['#3a9bf0', '#9bd3ff', '#e8f6ff'], 90], deco: [['nuages', { n: 9 }]], texte: { couleur: '#fff', contours: [{ couleur: '#2f7fd0', epaisseur: 0.08 }], ombre: { couleur: '#1a4f8a', dx: 0, dy: 9, alpha: 0.35, flou: 5 }, reflet: 0.2 } },
  nuage2: { fond: ['lineaire', ['#3a1f66', '#c24a8a', '#ff9a5a', '#ffd9a0'], 90], deco: [['nuages', { n: 8, couleur: '#ffc8a0', alpha: 0.6 }], ['soleil', { x: W * 0.5, y: H * 0.82, rayon: 60 }]], texte: { couleur: '#fff', contours: [{ couleur: '#6b1f5a', epaisseur: 0.08 }], ombre: { couleur: '#3a0f3a', dx: 0, dy: 9, alpha: 0.4, flou: 5 }, reflet: 0.2 } },
  metal: { fond: ['lineaire', ['#15171b', '#2c3037', '#15171b'], 90], deco: [['lignes', { couleur: '#fff', alpha: 0.04, pas: 2 }], ['vignette', { alpha: 0.6 }]], texte: { degrade: ['#ffffff', '#9aa1ab', '#2c3037', '#d7dbe1', '#6a717c', '#f2f4f7'], contours: [{ couleur: '#05060a', epaisseur: 0.1 }], extrusion: { n: 9, dx: 0, dy: 1.2, couleur: '#0a0b0e' }, reflet: 0.55 } },
  aquarelle: { fond: ['plein', '#fbf9f4'], deco: [['brume', { couleurs: ['#ff9ec7', '#9ad8ff', '#ffe08a', '#b8f0c8'], n: 9, alpha: 0.5 }]], texte: { degrade: ['#e8478b', '#8a5cf0', '#2fa8e8'], alphaTexte: 0.85, flouTexte: 0.8, poids: 900, contours: [] } },
  scifi: { fond: ['lineaire', ['#021a24', '#03323f', '#021a24'], 90], deco: [['grille', { couleur: '#2ee6ff', alpha: 0.4 }], ['lignes', { couleur: '#2ee6ff', alpha: 0.06, pas: 4 }], ['vignette', { alpha: 0.5 }]], texte: { couleur: '#aef6ff', poids: 700, trait: { couleur: '#2ee6ff', epaisseur: 3 }, lueurs: [{ couleur: '#2ee6ff', rayon: 8, epaisseur: 6 }], alphaRemplissage: 0.2, tailleMax: 165 } },
  onepiece: { fond: ['radial', ['#f3dfb0', '#d9b878', '#a88245'], 0.5, 0.5, 0.85], deco: [['lignes', { couleur: '#6b4a1c', alpha: 0.05, pas: 3 }], ['vagues', { couleurs: ['#7a5324', '#a67a38'], alpha: 0.25, n: 3, haut: 0.82 }], ['vignette', { alpha: 0.5, couleur: '#3a2308' }]], texte: { couleur: '#8a1a14', poids: 900, contours: [{ couleur: '#f7e9c4', epaisseur: 0.06 }], ombre: { couleur: '#2e1c06', dx: 5, dy: 7, alpha: 0.55 }, contourFin: { couleur: '#2e1c06', epaisseur: 2 } } },
  futuriste: { fond: ['lineaire', ['#050716', '#12063a', '#050716'], 120], deco: [['hexagones', { couleur: '#6a7bff', alpha: 0.18 }], ['lignes', { couleur: '#6a7bff', alpha: 0.05, pas: 5 }]], texte: { degrade: ['#7dd3ff', '#8a6bff', '#ff4fd8'], poids: 700, lueurs: [{ couleur: '#6a7bff', rayon: 12, epaisseur: 10, alpha: 0.9 }], contours: [{ couleur: '#0a0a2a', epaisseur: 0.05 }], contourFin: { couleur: '#fff', epaisseur: 1.5 }, tailleMax: 165 } },
};

function construireSvg(nom, texte) {
  const s = STYLES[nom];
  const r = graine(nom + '|' + texte);
  const [typeFond, ...args] = s.fond;
  let corps = FONDS[typeFond](...args);
  for (const [d, opts] of s.deco || []) corps += DECOS[d](r, opts || {});
  const txt = rendreTexte(texte, s.texte);
  if (!txt) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${corps}${txt}</svg>`;
}

// Renvoie un PNG 1024×512, ou null si le texte ne contient aucun caractère dessinable
async function creer(nom, texte) {
  if (!STYLES[nom]) throw new Error('style inconnu : ' + nom);
  const svg = construireSvg(nom, String(texte).slice(0, 40));
  if (!svg) return null;
  return sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 8 }).toBuffer();
}

module.exports = { creer, construireSvg, STYLES, noms: Object.keys(STYLES) };
