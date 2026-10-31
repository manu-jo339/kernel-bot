// Kernel Bot — images d'en-tête du menu : 8 mises en scène × 5 robots × 10 palettes (dessin original, SVG → JPEG).
// Usage : node tools/images-menu.js [dossier_de_sortie]   (défaut : assets/menu)  — 40 images, menu-01.jpg … menu-40.jpg
// Deux images qui se suivent n'ont jamais la même mise en scène : le menu les fait défiler dans l'ordre.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const T = require('../lib/texte');
const { PALETTES } = require('./marque');

const W = 1280, H = 720;
const CONTOUR = '#071a3d';
const f9 = T.police(900), f7 = T.police(700);
const larg = (f, t, s) => T.largeur(f, t, s);
const d = (f, t, x, y, s) => T.tracer(f, t, x, y, s);
const centre = (f, t, s, cx) => cx - larg(f, t, s) / 2;

// ───────────── couleurs ─────────────
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');
const clair = (c, t = 0.85) => mix(c, '#ffffff', t);
const sombre = (c, t = 0.7) => mix(c, '#000000', t);

// ───────────── les 5 robots (boîte de 512 × 512) ─────────────
function defs(v) {
  return `<defs>
<linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#dfe6f1"/><stop offset="1" stop-color="#aab7cc"/></linearGradient>
<linearGradient id="ac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${v.g}"/><stop offset="1" stop-color="${mix(v.f1, v.g, 0.15)}"/></linearGradient>
<linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14264d"/><stop offset="1" stop-color="#050d22"/></linearGradient>
<radialGradient id="bl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${v.b1}"/></radialGradient>
<filter id="lu" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="om" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="g1" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="g2" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>`;
}
const O = (w = 9) => `stroke="${CONTOUR}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const ombreSol = '<ellipse cx="256" cy="458" rx="150" ry="20" fill="#000" opacity=".25" filter="url(#om)"/>';
const yeuxOvales = (v) => `<rect x="176" y="222" width="52" height="64" rx="26" fill="${v.g}" filter="url(#lu)" opacity=".9"/><rect x="284" y="222" width="52" height="64" rx="26" fill="${v.g}" filter="url(#lu)" opacity=".9"/>
<rect x="178" y="224" width="48" height="60" rx="24" fill="${v.g}"/><rect x="286" y="224" width="48" height="60" rx="24" fill="${v.g}"/>
<ellipse cx="193" cy="244" rx="9" ry="12" fill="#fff" opacity=".85"/><ellipse cx="301" cy="244" rx="9" ry="12" fill="#fff" opacity=".85"/>`;
const invite = (v) => `<path d="M216 352L238 369L216 386" fill="none" stroke="${v.b1}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><rect x="250" y="379" width="46" height="12" rx="6" fill="${v.b1}"/>`;

const ROBOTS = {
  rond: (v) => `${ombreSol}
<path d="M256 112V74" ${O(14)}/><path d="M256 112V74" stroke="#6f8fc0" stroke-width="6" stroke-linecap="round"/>
<circle cx="256" cy="60" r="21" fill="url(#bl)" ${O(8)}/>
<rect x="46" y="226" width="58" height="104" rx="26" fill="url(#ac)" ${O(9)}/><rect x="408" y="226" width="58" height="104" rx="26" fill="url(#ac)" ${O(9)}/>
<rect x="62" y="252" width="14" height="52" rx="7" fill="#fff" opacity=".7"/><rect x="436" y="252" width="14" height="52" rx="7" fill="#fff" opacity=".7"/>
<rect x="196" y="388" width="120" height="44" rx="14" fill="url(#ac)" ${O(9)}/>
<rect x="84" y="104" width="344" height="296" rx="112" fill="url(#hg)" ${O(11)}/>
<path d="M130 132Q256 96 382 132" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".9"/>
<rect x="122" y="178" width="268" height="152" rx="64" fill="url(#vs)" ${O(8)}/>
<path d="M150 200Q256 178 362 200" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".18"/>
${yeuxOvales(v)}${invite(v)}`,

  carre: (v) => `${ombreSol}
<path d="M176 120V78M336 120V78" ${O(12)}/><circle cx="176" cy="66" r="16" fill="url(#bl)" ${O(7)}/><circle cx="336" cy="66" r="16" fill="url(#bl)" ${O(7)}/>
<rect x="48" y="226" width="48" height="108" rx="18" fill="url(#ac)" ${O(9)}/><rect x="416" y="226" width="48" height="108" rx="18" fill="url(#ac)" ${O(9)}/>
<rect x="206" y="396" width="100" height="40" rx="12" fill="url(#ac)" ${O(9)}/>
<rect x="88" y="118" width="336" height="290" rx="56" fill="url(#hg)" ${O(11)}/>
<path d="M128 146Q256 118 384 146" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".9"/>
<rect x="122" y="170" width="268" height="150" rx="34" fill="url(#vs)" ${O(8)}/>
<rect x="160" y="216" width="82" height="36" rx="18" fill="${v.g}" filter="url(#lu)" opacity=".9"/><rect x="270" y="216" width="82" height="36" rx="18" fill="${v.g}" filter="url(#lu)" opacity=".9"/>
<rect x="162" y="218" width="78" height="32" rx="16" fill="${v.g}"/><rect x="272" y="218" width="78" height="32" rx="16" fill="${v.g}"/>
<rect x="176" y="224" width="26" height="8" rx="4" fill="#fff" opacity=".8"/><rect x="286" y="224" width="26" height="8" rx="4" fill="#fff" opacity=".8"/>
${[0, 1, 2, 3, 4].map((i) => `<rect x="${176 + i * 38}" y="${346 + (i % 2) * 0}" width="26" height="${i === 2 ? 30 : 18}" rx="7" fill="${i % 2 ? v.b1 : v.g}" ${i === 2 ? '' : `transform="translate(0 ${i === 2 ? 0 : 6})"`}/>`).join('')}`,

  casque: (v) => `${ombreSol}
<path d="M256 112V80" ${O(12)}/><circle cx="256" cy="68" r="17" fill="url(#bl)" ${O(7)}/>
<rect x="196" y="388" width="120" height="44" rx="14" fill="url(#ac)" ${O(9)}/>
<rect x="92" y="108" width="328" height="292" rx="112" fill="url(#hg)" ${O(11)}/>
<path d="M104 262C96 70 416 70 408 262" fill="none" ${O(30)}/><path d="M104 262C96 70 416 70 408 262" fill="none" stroke="url(#ac)" stroke-width="16" stroke-linecap="round"/>
<rect x="30" y="206" width="78" height="140" rx="36" fill="url(#ac)" ${O(10)}/><rect x="404" y="206" width="78" height="140" rx="36" fill="url(#ac)" ${O(10)}/>
<rect x="50" y="240" width="16" height="72" rx="8" fill="#fff" opacity=".7"/><rect x="446" y="240" width="16" height="72" rx="8" fill="#fff" opacity=".7"/>
<path d="M64 344C70 430 150 436 206 420" fill="none" ${O(11)}/><path d="M64 344C70 430 150 436 206 420" fill="none" stroke="#6f8fc0" stroke-width="5" stroke-linecap="round"/>
<circle cx="214" cy="420" r="17" fill="url(#ac)" ${O(8)}/>
<rect x="128" y="168" width="256" height="158" rx="62" fill="url(#vs)" ${O(8)}/>
<circle cx="204" cy="244" r="38" fill="${v.g}" filter="url(#lu)" opacity=".9"/><circle cx="308" cy="244" r="38" fill="${v.g}" filter="url(#lu)" opacity=".9"/>
<circle cx="204" cy="244" r="34" fill="${v.g}"/><circle cx="308" cy="244" r="34" fill="${v.g}"/>
<circle cx="214" cy="232" r="10" fill="#fff" opacity=".85"/><circle cx="318" cy="232" r="10" fill="#fff" opacity=".85"/>
<path d="M222 296Q256 322 290 296" fill="none" stroke="${v.b1}" stroke-width="10" stroke-linecap="round"/>`,

  cyclope: (v) => `${ombreSol}
<path d="M256 112l-16-26 32-14-16-28" fill="none" ${O(13)}/><path d="M256 112l-16-26 32-14-16-28" fill="none" stroke="${v.b1}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="256" cy="34" r="14" fill="url(#bl)" ${O(7)}/>
<rect x="40" y="236" width="62" height="96" rx="28" fill="url(#ac)" ${O(9)}/><rect x="410" y="236" width="62" height="96" rx="28" fill="url(#ac)" ${O(9)}/>
<rect x="196" y="390" width="120" height="42" rx="14" fill="url(#ac)" ${O(9)}/>
<rect x="88" y="112" width="336" height="290" rx="136" fill="url(#hg)" ${O(11)}/>
<path d="M134 140Q256 104 378 140" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".9"/>
<circle cx="256" cy="246" r="92" fill="url(#vs)" ${O(9)}/>
<circle cx="256" cy="246" r="66" fill="${v.g}" filter="url(#lu)" opacity=".9"/><circle cx="256" cy="246" r="62" fill="${v.g}"/>
<circle cx="256" cy="246" r="34" fill="#031026"/><circle cx="238" cy="226" r="14" fill="#fff" opacity=".9"/>
<path d="M186 188Q256 150 326 188" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".18"/>
<path d="M214 366Q256 392 298 366" fill="none" stroke="${v.b1}" stroke-width="11" stroke-linecap="round"/>`,

  chat: (v) => `${ombreSol}
<path d="M112 196L118 74L206 138Z" fill="url(#hg)" ${O(10)}/><path d="M400 196L394 74L306 138Z" fill="url(#hg)" ${O(10)}/>
<path d="M134 164L138 108L178 138Z" fill="${v.g}" opacity=".9"/><path d="M378 164L374 108L334 138Z" fill="${v.g}" opacity=".9"/>
<rect x="196" y="392" width="120" height="42" rx="14" fill="url(#ac)" ${O(9)}/>
<rect x="84" y="136" width="344" height="270" rx="124" fill="url(#hg)" ${O(11)}/>
<path d="M136 160Q256 128 376 160" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".9"/>
<rect x="124" y="190" width="264" height="130" rx="58" fill="url(#vs)" ${O(8)}/>
<ellipse cx="204" cy="254" rx="30" ry="42" fill="${v.g}" filter="url(#lu)" opacity=".9"/><ellipse cx="308" cy="254" rx="30" ry="42" fill="${v.g}" filter="url(#lu)" opacity=".9"/>
<ellipse cx="204" cy="254" rx="26" ry="38" fill="${v.g}"/><ellipse cx="308" cy="254" rx="26" ry="38" fill="${v.g}"/>
<ellipse cx="204" cy="254" rx="8" ry="30" fill="#031026"/><ellipse cx="308" cy="254" rx="8" ry="30" fill="#031026"/>
<path d="M244 340L268 340L256 354Z" fill="${v.b1}"/>
<path d="M256 354Q238 376 214 362M256 354Q274 376 298 362" fill="none" stroke="${v.b1}" stroke-width="8" stroke-linecap="round"/>
<path d="M92 330L48 322M92 352L48 360M420 330L464 322M420 352L464 360" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>`,
};
const TYPES = Object.keys(ROBOTS);
const tete = (v, type, x, y, taille) => `<svg x="${x}" y="${y}" width="${taille}" height="${taille}" viewBox="0 0 512 512">${defs(v)}${ROBOTS[type](v)}</svg>`;

// Robot en pied (boîte de 512 × 620) : la tête du même type, un corps, un bras qui salue
function corps(v, type, x, y, taille) {
  const k = taille / 512;
  return `<svg x="${x}" y="${y}" width="${taille}" height="${taille * 620 / 512}" viewBox="0 0 512 620">${defs(v)}
<ellipse cx="256" cy="596" rx="150" ry="16" fill="#000" opacity=".3" filter="url(#om)"/>
<rect x="196" y="470" width="44" height="110" rx="20" fill="url(#hg)" ${O(9)}/><rect x="272" y="470" width="44" height="110" rx="20" fill="url(#hg)" ${O(9)}/>
<rect x="178" y="566" width="76" height="30" rx="15" fill="url(#ac)" ${O(8)}/><rect x="258" y="566" width="76" height="30" rx="15" fill="url(#ac)" ${O(8)}/>
<path d="M176 336Q110 350 112 440" fill="none" ${O(34)}/><path d="M176 336Q110 350 112 440" fill="none" stroke="url(#hg)" stroke-width="20" stroke-linecap="round"/>
<circle cx="112" cy="448" r="22" fill="url(#ac)" ${O(8)}/>
<path d="M336 336Q420 330 430 230" fill="none" ${O(34)}/><path d="M336 336Q420 330 430 230" fill="none" stroke="url(#hg)" stroke-width="20" stroke-linecap="round"/>
<circle cx="430" cy="214" r="24" fill="url(#ac)" ${O(8)}/>
<rect x="172" y="300" width="168" height="196" rx="52" fill="url(#hg)" ${O(10)}/>
<rect x="204" y="338" width="104" height="92" rx="20" fill="url(#vs)" ${O(7)}/>
<path d="M226 366L246 382L226 398" fill="none" stroke="${v.b1}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><rect x="256" y="390" width="34" height="10" rx="5" fill="${v.b1}"/>
<circle cx="224" cy="458" r="9" fill="${v.g}"/><circle cx="256" cy="458" r="9" fill="${v.b1}"/><circle cx="288" cy="458" r="9" fill="${v.g}"/>
<svg x="96" y="-4" width="320" height="320" viewBox="0 0 512 512">${ROBOTS[type](v).replace(ombreSol, '')}</svg>
</svg>`;
}

// ───────────── briques communes ─────────────
const grille = (v, pas = 64, op = 0.08) => `<g fill="none" stroke="${v.g}" stroke-opacity="${op}" stroke-width="2">${Array.from({ length: W / pas + 1 }, (_, i) => `<path d="M${i * pas} 0V${H}"/>`).join('')}${Array.from({ length: H / pas + 1 }, (_, i) => `<path d="M0 ${i * pas}H${W}"/>`).join('')}</g>`;
const neon = (chemin, couleur, remplissage) => `<path d="${chemin}" fill="${couleur}" opacity=".9" filter="url(#g1)"/><path d="${chemin}" fill="${couleur}" filter="url(#g2)"/><path d="${chemin}" fill="${remplissage}"/>`;
const degrade = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const fondRadial = (v, cx = 0.3, cy = 0.45) => `<radialGradient id="fm" cx="${cx}" cy="${cy}" r=".95"><stop offset="0" stop-color="${v.f0}"/><stop offset=".55" stop-color="${v.f1}"/><stop offset="1" stop-color="${v.f2}"/></radialGradient><rect width="${W}" height="${H}" fill="url(#fm)"/>`;
const TAG = 'ASSISTANT WHATSAPP MULTIFONCTIONS';
const SIG = 'MWENOBANGUE LABS';
const svg = (contenu) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${contenu}</svg>`;

// Graine fixe : les images sont identiques à chaque génération
function hasard(graine) { let s = graine >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ───────────── les 8 mises en scène ─────────────
const SCENES = [
  // 1. Classique : le robot à gauche, le nom en lettres lumineuses à droite
  (v, type) => {
    let tk = 170; while (larg(f9, 'KERNEL', tk) > 600) tk -= 2;
    const xk = 640, yk = 330, tb = Math.round(tk * 0.95), yb = yk + tb * 0.98;
    return svg(`${defs(v)}${degrade('fk', '#ffffff', v.k1)}${degrade('fv', v.b0, v.b1)}${fondRadial(v)}${grille(v)}
<ellipse cx="330" cy="400" rx="300" ry="260" fill="${v.g}" opacity=".18" filter="url(#g1)"/>
${tete(v, type, 60, 100, 540)}
${neon(d(f9, 'KERNEL', xk, yk, tk), v.g, 'url(#fk)')}${neon(d(f9, 'BOT', xk, yb, tb), v.b1, 'url(#fv)')}
<rect x="${xk + 4}" y="${yb + 28}" width="580" height="5" rx="2.5" fill="${v.g}" opacity=".8"/>
<path d="${d(f7, TAG, xk + 4, yb + 70, 30)}" fill="${v.k1}"/><path d="${d(f7, SIG, xk + 4, H - 60, 28)}" fill="${v.s}"/>`);
  },

  // 2. Affiche : rayons, robot au centre, nom en dessous
  (v, type) => {
    const rayons = Array.from({ length: 28 }, (_, i) => {
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 0.5) / 28) * Math.PI * 2;
      return `<path d="M640 330L${Math.round(640 + 1600 * Math.cos(a0))} ${Math.round(330 + 1600 * Math.sin(a0))}L${Math.round(640 + 1600 * Math.cos(a1))} ${Math.round(330 + 1600 * Math.sin(a1))}Z" fill="${v.g}" opacity=".07"/>`;
    }).join('');
    const ts = 118, xs = centre(f9, 'KERNEL BOT', ts, 640);
    return svg(`${defs(v)}${degrade('fk', '#ffffff', v.k1)}${fondRadial(v, 0.5, 0.4)}${rayons}
<ellipse cx="640" cy="300" rx="330" ry="260" fill="${v.g}" opacity=".22" filter="url(#g1)"/>
${tete(v, type, 440, 28, 400)}
${neon(d(f9, 'KERNEL BOT', xs, 565, ts), v.g, 'url(#fk)')}
<rect x="290" y="594" width="700" height="5" rx="2.5" fill="${v.b1}" opacity=".9"/>
<path d="${d(f7, TAG, centre(f7, TAG, 30, 640), 644, 30)}" fill="${v.k1}"/><path d="${d(f7, SIG, centre(f7, SIG, 24, 640), 690, 24)}" fill="${v.s}"/>`);
  },

  // 3. En pied : le robot salue, bulle de dialogue
  (v, type) => {
    const xb = 640, tk = 150, yk = 380;
    return svg(`${defs(v)}${degrade('fk', '#ffffff', v.k1)}${degrade('fv', v.b0, v.b1)}${fondRadial(v, 0.25, 0.6)}${grille(v, 80, 0.06)}
<ellipse cx="310" cy="420" rx="250" ry="280" fill="${v.g}" opacity=".18" filter="url(#g1)"/>
${corps(v, type, 40, 52, 560)}
<g transform="translate(446 28)"><rect width="200" height="84" rx="30" fill="#fff" ${O(6)}/><path d="M28 80L12 118L66 82Z" fill="#fff" ${O(6)}/><rect x="24" y="76" width="50" height="10" fill="#fff"/>
<path d="${d(f9, 'Salut !', 26, 58, 46)}" fill="${CONTOUR}"/></g>
${neon(d(f9, 'KERNEL', xb + 20, yk, tk), v.g, 'url(#fk)')}${neon(d(f9, 'BOT', xb + 20, yk + tk * 0.98, tk * 0.95), v.b1, 'url(#fv)')}
<path d="${d(f7, 'Ton assistant WhatsApp', xb + 24, yk + tk * 0.98 + 66, 38)}" fill="${v.k1}"/>
<path d="${d(f7, 'Commandes, jeux, IA, groupes…', xb + 24, yk + tk * 0.98 + 112, 28)}" fill="${v.s}"/>
<path d="${d(f7, SIG, xb + 24, H - 48, 24)}" fill="${v.s}"/>`);
  },

  // 4. Mascotte : fond clair, lettres épaisses avec ombre, étincelles
  (v, type) => {
    const fond = clair(v.g, 0.78), fond2 = clair(v.g, 0.9);
    const etoile = (x, y, r, c) => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;
    let tk = 190; while (larg(f9, 'KERNEL', tk) > 560) tk -= 2;
    const dK = d(f9, 'KERNEL', 80, 330, tk), dB = d(f9, 'BOT', 80, 330 + tk * 0.92, tk);
    const txt = (dd, c) => `<path d="${dd}" fill="${CONTOUR}" transform="translate(9 12)"/><path d="${dd}" fill="${c}" stroke="${CONTOUR}" stroke-width="12" stroke-linejoin="round" paint-order="stroke"/>`;
    return svg(`${defs(v)}<radialGradient id="fc" cx=".7" cy=".4" r=".9"><stop offset="0" stop-color="${fond2}"/><stop offset="1" stop-color="${fond}"/></radialGradient><rect width="${W}" height="${H}" fill="url(#fc)"/>
<circle cx="930" cy="360" r="300" fill="${v.g}" opacity=".35"/><circle cx="930" cy="360" r="230" fill="#fff" opacity=".5"/>
${etoile(120, 110, 34, v.b1)}${etoile(1180, 90, 28, v.g)}${etoile(1120, 640, 36, v.b1)}${etoile(620, 70, 22, v.g)}${etoile(70, 620, 26, v.g)}
${tete(v, type, 690, 100, 480)}
${txt(dK, '#ffffff')}${txt(dB, v.b1)}
<g transform="translate(86 ${330 + tk * 0.92 + 48})"><rect width="${larg(f7, TAG, 28) + 44}" height="58" rx="29" fill="${CONTOUR}"/><path d="${d(f7, TAG, 22, 39, 28)}" fill="#fff"/></g>
<path d="${d(f7, SIG, 90, H - 44, 26)}" fill="${CONTOUR}" opacity=".7"/>`);
  },

  // 5. Circuit : traces de circuit imprimé, robot dans un hexagone
  (v, type, graine) => {
    const r = hasard(graine * 7919 + 11);
    let traces = '';
    for (let i = 0; i < 34; i++) {
      let x = Math.round(r() * 20) * 64, y = Math.round(r() * 11) * 64, p = `M${x} ${y}`;
      for (let s = 0; s < 3 + Math.floor(r() * 3); s++) {
        const l = 64 * (1 + Math.floor(r() * 3));
        if (s % 2 === 0) x += (r() < 0.5 ? -1 : 1) * l; else y += (r() < 0.5 ? -1 : 1) * l;
        p += `L${x} ${y}`;
      }
      traces += `<path d="${p}" fill="none" stroke="${v.g}" stroke-opacity=".3" stroke-width="4" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="9" fill="${v.f2}" stroke="${v.g}" stroke-opacity=".6" stroke-width="4"/>`;
    }
    let tk = 150; while (larg(f9, 'KERNEL BOT', tk) > 620) tk -= 2;
    const hex6 = (cx, cy, R) => Array.from({ length: 6 }, (_, i) => `${Math.round(cx + R * Math.cos(Math.PI / 3 * i + Math.PI / 6))},${Math.round(cy + R * Math.sin(Math.PI / 3 * i + Math.PI / 6))}`).join(' ');
    return svg(`${defs(v)}${degrade('fk', '#ffffff', v.k1)}${fondRadial(v, 0.3, 0.5)}${traces}
<polygon points="${hex6(330, 360, 310)}" fill="${v.f2}" opacity=".8" stroke="${v.g}" stroke-width="8"/>
<polygon points="${hex6(330, 360, 284)}" fill="none" stroke="${v.b1}" stroke-opacity=".7" stroke-width="3" stroke-dasharray="14 10"/>
${tete(v, type, 90, 120, 480)}
${neon(d(f9, 'KERNEL', 690, 330, 150), v.g, 'url(#fk)')}${neon(d(f9, 'BOT', 690, 330 + 150 * 0.92, 150), v.b1, `url(#fk)`)}
<rect x="694" y="${330 + 150 * 0.92 + 28}" width="520" height="5" rx="2.5" fill="${v.g}" opacity=".8"/>
<rect x="682" y="${H - 96}" width="${larg(f7, SIG, 26) + 24}" height="54" rx="14" fill="${v.f2}" opacity=".85"/><rect x="682" y="${330 + 150 * 0.92 + 40}" width="${larg(f7, TAG, 28) + 24}" height="54" rx="14" fill="${v.f2}" opacity=".85"/>
<path d="${d(f7, TAG, 694, 330 + 150 * 0.92 + 78, 28)}" fill="${v.k1}"/><path d="${d(f7, SIG, 694, H - 58, 26)}" fill="${v.s}"/>`);
  },

  // 6. Terminal : fenêtre de terminal et démarrage du bot
  (v, type) => {
    const lignes = ['> démarrage de Kernel Bot…', '> plus de 350 commandes chargées', '> connexion WhatsApp : OK', '> prêt. Tape .menu pour commencer'];
    let tk = 100; while (larg(f9, 'KERNEL BOT', tk) > 640) tk -= 2;
    return svg(`${defs(v)}${degrade('fk', '#ffffff', v.k1)}${fondRadial(v, 0.5, 0.5)}${grille(v, 64, 0.05)}
<rect x="60" y="58" width="1160" height="604" rx="26" fill="#08101f" stroke="${v.g}" stroke-opacity=".8" stroke-width="3"/>
<path d="M60 84a26 26 0 0 1 26-26H1194a26 26 0 0 1 26 26V120H60Z" fill="#101c33"/>
<circle cx="102" cy="90" r="9" fill="#ff5f57"/><circle cx="134" cy="90" r="9" fill="#febc2e"/><circle cx="166" cy="90" r="9" fill="#28c840"/>
<path d="${d(f7, 'kernel-bot — terminal', centre(f7, 'kernel-bot — terminal', 26, 640), 98, 26)}" fill="${v.s}" opacity=".9"/>
${neon(d(f9, 'KERNEL BOT', 104, 250, tk), v.g, 'url(#fk)')}
${lignes.map((l, i) => `<path d="${d(f7, l, 108, 336 + i * 64, 34)}" fill="${i === 3 ? v.b0 : i === 2 ? v.b1 : v.k1}"/>`).join('')}
<rect x="108" y="${336 + 4 * 64 - 34}" width="22" height="40" fill="${v.g}" opacity=".9"/>
<path d="${d(f7, SIG, 108, 632, 22)}" fill="${v.s}" opacity=".8"/>
${tete(v, type, 800, 220, 400)}`);
  },

  // 7. Minimal : fond clair, lettres sobres
  (v, type) => {
    const fond = '#f5f8fc';
    let tk = 170; while (larg(f9, 'KERNEL', tk) > 600) tk -= 2;
    const tb = Math.round(tk * 0.95);
    return svg(`${defs(v)}<rect width="${W}" height="${H}" fill="${fond}"/>
<circle cx="330" cy="370" r="330" fill="${v.g}" opacity=".16"/><circle cx="330" cy="370" r="240" fill="${v.g}" opacity=".16"/>
<path d="M0 ${H}L${W} ${H}L${W} ${H - 26}L0 ${H - 26}Z" fill="${v.f0}"/>
${tete(v, type, 70, 110, 520)}
<path d="${d(f9, 'KERNEL', 660, 340, tk)}" fill="${sombre(v.f1, 0.55)}"/><path d="${d(f9, 'BOT', 660, 340 + tb * 0.98, tb)}" fill="${v.f0}"/>
<rect x="664" y="${340 + tb * 0.98 + 28}" width="560" height="6" rx="3" fill="${v.g}"/>
<path d="${d(f7, TAG, 664, 340 + tb * 0.98 + 76, 30)}" fill="#46556f"/><path d="${d(f7, SIG, 664, H - 60, 26)}" fill="${v.f0}"/>`);
  },

  // 8. Synthwave : soleil rayé, sol en perspective
  (v, type) => {
    const horizon = 470;
    const bandes = [0, 1, 2, 3, 4, 5].map((i) => `<rect x="440" y="${396 + i * 20}" width="400" height="${3 + i * 2.4}" fill="${v.f2}"/>`).join('');
    const horiz = Array.from({ length: 9 }, (_, i) => `<path d="M0 ${Math.round(horizon + Math.pow(i / 8, 2) * (H - horizon))}H${W}"/>`).join('');
    const vert = Array.from({ length: 25 }, (_, i) => `<path d="M${640 + (i - 12) * 18} ${horizon}L${640 + (i - 12) * 190} ${H}"/>`).join('');
    const ts = 104;
    return svg(`${defs(v)}${degrade('ciel', v.f2, mix(v.f1, v.f0, 0.5))}${degrade('sol', mix(v.f1, v.g, 0.3), v.f2)}${degrade('so', v.b0, v.b1)}${degrade('fk', '#ffffff', v.k1)}
<rect width="${W}" height="${H}" fill="url(#ciel)"/>
<circle cx="640" cy="360" r="190" fill="${v.b1}" opacity=".45" filter="url(#g1)"/>
<clipPath id="sol1"><circle cx="640" cy="360" r="170"/></clipPath><g clip-path="url(#sol1)"><rect x="440" y="180" width="400" height="360" fill="url(#so)"/>${bandes}</g>
<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#sol)"/>
<g stroke="${v.g}" stroke-width="2.5" stroke-opacity=".7" fill="none"><path d="M0 ${horizon}H${W}" stroke-width="4" stroke-opacity="1"/>${horiz}<g clip-path="url(#bas)">${vert}</g></g>
<clipPath id="bas"><rect y="${horizon}" width="${W}" height="${H - horizon}"/></clipPath>
${tete(v, type, 470, 120, 340)}
${neon(d(f9, 'KERNEL BOT', centre(f9, 'KERNEL BOT', ts, 640), 130, ts), v.g, 'url(#fk)')}
<rect x="250" y="506" width="780" height="128" rx="22" fill="${v.f2}" opacity=".82"/>
<path d="${d(f7, TAG, centre(f7, TAG, 30, 640), 558, 30)}" fill="${v.k1}"/><path d="${d(f7, SIG, centre(f7, SIG, 26, 640), 606, 26)}" fill="${v.s}"/>`);
  },
];

// 5 tours × 8 mises en scène = 40 images ; robot et palette changent à chaque image
function programme() {
  const liste = [];
  for (let tour = 0; tour < 5; tour++)
    for (let s = 0; s < SCENES.length; s++) {
      const n = tour * SCENES.length + s;
      liste.push({ n: n + 1, scene: s, type: TYPES[(s + tour * 2) % TYPES.length], palette: PALETTES[(n * 3 + s) % PALETTES.length] });
    }
  return liste;
}
const dessiner = ({ scene, type, palette, n }) => SCENES[scene](palette, type, n);

async function ecrire(dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const liste = programme();
  for (const e of liste)
    await sharp(Buffer.from(dessiner(e)), { density: 96 }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(dossier, `menu-${String(e.n).padStart(2, '0')}.jpg`));
  return liste.length;
}
if (require.main === module) ecrire(path.resolve(process.argv[2] || path.join(__dirname, '..', 'assets', 'menu'))).then((n) => console.log(`${n} images`));
module.exports = { ecrire, programme, dessiner, SCENES, ROBOTS };
