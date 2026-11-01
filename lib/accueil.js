// Kernel Bot — carte de bienvenue des groupes : la photo de profil du nouveau membre dans un cadre aux couleurs du thème du bot.
// Sans photo de profil (ou si elle est cachée), un portrait illustré du thème la remplace. Le texte reprend le cadre du thème
// et ajoute la description du groupe quand elle existe. Tout est dessiné en local (sharp + dessins vectoriels), rien n'est envoyé ailleurs.
const sharp = require('sharp');
const T = require('./texte');
const { numero } = require('./utils');

const TAILLE = 1080;
const MAX_CARTES = 3; // au-delà (ajout en masse), un seul message texte : pas de rafale d'images
const MAX_LEGENDE = 1000; // WhatsApp coupe les légendes trop longues

// Chaque thème a ses couleurs (fond dégradé, accent, accent 2) et son motif de décoration
const STYLES = {
  kernel: { fond: ['#081a46', '#1d5fe0'], accent: '#38e1ff', accent2: '#7cf5a4', motif: 'circuit' },
  neon: { fond: ['#14002e', '#6a00ff'], accent: '#00fff0', accent2: '#ff2bd6', motif: 'neon' },
  cyber: { fond: ['#03120a', '#0b4a24'], accent: '#39ff88', accent2: '#c6ff5c', motif: 'circuit' },
  royal: { fond: ['#1a0b2e', '#52217f'], accent: '#ffd166', accent2: '#ffe9a8', motif: 'couronne' },
  ancien: { fond: ['#0d1f28', '#2f6073'], accent: '#7ee787', accent2: '#a8f0ff', motif: 'etoiles' },
  luxe: { fond: ['#1b1208', '#6b4a14'], accent: '#f6d98f', accent2: '#fff1c9', motif: 'couronne' },
  blocs: { fond: ['#1a1a2a', '#3c3c66'], accent: '#ffb703', accent2: '#8ecae6', motif: 'blocs' },
  rond: { fond: ['#2a1245', '#d6336c'], accent: '#ffe3ec', accent2: '#ffd1e3', motif: 'bulles' },
  etoiles: { fond: ['#050b24', '#222a8a'], accent: '#ffe066', accent2: '#b8c4ff', motif: 'etoiles' },
  nature: { fond: ['#093a1b', '#2f9e44'], accent: '#c0f5c8', accent2: '#ffe58a', motif: 'feuilles' },
  feu: { fond: ['#2b0505', '#e8590c'], accent: '#ffd43b', accent2: '#ff8a4c', motif: 'flammes' },
  ocean: { fond: ['#022b45', '#0a86b0'], accent: '#8ce8ff', accent2: '#e0fbff', motif: 'vagues' },
  classique: { fond: ['#14213d', '#3b5998'], accent: '#fca311', accent2: '#ffe0a3', motif: 'losanges' },
  cadre: { fond: ['#1f2937', '#4b5563'], accent: '#fbbf24', accent2: '#e5e7eb', motif: 'blocs' },
  moderne: { fond: ['#0f2027', '#1d976c'], accent: '#a7f3d0', accent2: '#fde68a', motif: 'bulles' },
  minimal: { fond: ['#111827', '#374151'], accent: '#f3f4f6', accent2: '#9ca3af', motif: 'bulles' },
};
const style = (theme) => STYLES[theme] || STYLES.kernel;

const alea = (graine) => {
  let s = (graine >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const f = (n) => Math.round(n * 10) / 10;

// ───────────── Dessins ─────────────
const etoile = (x, y, r) => `M${f(x)} ${f(y - r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + r)}Q${f(x)} ${f(y)} ${f(x - r)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - r)}Z`;
const feuille = (r) => `M0 0Q${r} ${-r * 0.9} 0 ${-r * 2}Q${-r} ${-r * 0.9} 0 0Z`;
const flamme = 'M0 0C-46 -60 -14 -104 0 -176C22 -112 66 -82 44 -30C34 -8 12 0 0 0Z';
const couronne = 'M-64 34L-64 -22L-32 10L0 -42L32 10L64 -22L64 34Z';

function motif(nom, W, H, couleur, couleur2, graine) {
  const r = alea(graine);
  let o = '';
  const aut = () => {
    // position au hasard hors du centre (là où se trouve la photo)
    for (let i = 0; i < 30; i++) {
      const x = r() * W, y = r() * H;
      if (Math.hypot(x - W / 2, y - 480) > 330) return [x, y];
    }
    return [r() * W, 30];
  };
  if (nom === 'etoiles') {
    for (let i = 0; i < 70; i++) {
      const [x, y] = aut();
      const g = 4 + r() * 16;
      o += r() < 0.35 ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(g / 4)}" fill="${couleur}" opacity="${f(0.25 + r() * 0.5)}"/>` : `<path d="${etoile(x, y, g)}" fill="${r() < 0.7 ? couleur : couleur2}" opacity="${f(0.2 + r() * 0.6)}"/>`;
    }
  } else if (nom === 'circuit') {
    for (let i = 0; i < 16; i++) {
      let [x, y] = aut();
      let d = `M${f(x)} ${f(y)}`;
      for (let k = 0; k < 3; k++) {
        const dx = (r() < 0.5 ? -1 : 1) * (60 + r() * 140), dy = (r() < 0.5 ? -1 : 1) * (50 + r() * 120);
        d += `h${f(dx)}v${f(dy)}`;
        x += dx; y += dy;
      }
      o += `<path d="${d}" fill="none" stroke="${couleur}" stroke-width="3" opacity="0.22" stroke-linejoin="round"/><circle cx="${f(x)}" cy="${f(y)}" r="8" fill="none" stroke="${couleur2}" stroke-width="3" opacity="0.5"/>`;
    }
  } else if (nom === 'feuilles') {
    for (let i = 0; i < 26; i++) {
      const [x, y] = aut();
      o += `<path d="${feuille(24 + r() * 46)}" transform="translate(${f(x)} ${f(y)}) rotate(${f(r() * 360)})" fill="${r() < 0.8 ? couleur : couleur2}" opacity="${f(0.12 + r() * 0.22)}"/>`;
    }
  } else if (nom === 'vagues') {
    for (let i = 0; i < 6; i++) {
      const y0 = 640 + i * 70, amp = 18 + i * 3, ph = r() * 6;
      let d = `M0 ${y0}`;
      for (let x = 0; x <= W; x += 20) d += `L${x} ${f(y0 + Math.sin(x / 90 + ph) * amp)}`;
      o += `<path d="${d}L${W} ${H}L0 ${H}Z" fill="${couleur}" opacity="${f(0.05 + i * 0.03)}"/>`;
    }
    for (let i = 0; i < 26; i++) {
      const [x, y] = aut();
      o += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + r() * 14)}" fill="none" stroke="${couleur2}" stroke-width="2.5" opacity="${f(0.2 + r() * 0.35)}"/>`;
    }
  } else if (nom === 'flammes') {
    for (let i = 0; i < 16; i++) {
      const x = (i + r() * 0.6) * (W / 15), s = 0.8 + r() * 1.5;
      o += `<path d="${flamme}" transform="translate(${f(x)} ${H + 14}) scale(${f(s)})" fill="${r() < 0.5 ? couleur : couleur2}" opacity="${f(0.16 + r() * 0.22)}"/>`;
    }
    for (let i = 0; i < 34; i++) {
      const [x, y] = aut();
      o += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + r() * 5)}" fill="${couleur}" opacity="${f(0.25 + r() * 0.5)}"/>`;
    }
  } else if (nom === 'couronne') {
    for (let i = 0; i < 22; i++) {
      const [x, y] = aut();
      const g = 10 + r() * 26;
      o += `<path d="M${f(x)} ${f(y - g)}L${f(x + g * 0.62)} ${f(y)}L${f(x)} ${f(y + g)}L${f(x - g * 0.62)} ${f(y)}Z" fill="none" stroke="${couleur}" stroke-width="3" opacity="${f(0.15 + r() * 0.35)}"/>`;
    }
  } else if (nom === 'neon') {
    for (let i = 0; i < 5; i++) o += `<circle cx="${W / 2}" cy="480" r="${330 + i * 78}" fill="none" stroke="${i % 2 ? couleur2 : couleur}" stroke-width="${4 - i * 0.5}" opacity="${f(0.45 - i * 0.07)}"/>`;
    for (let i = 0; i < 9; i++) {
      const x = r() * W;
      o += `<path d="M${f(x)} ${H}L${f(x + 280)} 0" stroke="${couleur}" stroke-width="2" opacity="0.1"/>`;
    }
  } else if (nom === 'blocs') {
    for (let i = 0; i < 34; i++) {
      const [x, y] = aut();
      const g = 20 + r() * 60;
      o += `<rect x="${f(x)}" y="${f(y)}" width="${f(g)}" height="${f(g)}" rx="6" fill="${r() < 0.6 ? couleur : couleur2}" opacity="${f(0.08 + r() * 0.14)}"/>`;
    }
  } else if (nom === 'losanges') {
    for (let i = 0; i < 30; i++) {
      const [x, y] = aut();
      const g = 12 + r() * 36;
      o += `<path d="M${f(x)} ${f(y - g)}L${f(x + g * 0.7)} ${f(y)}L${f(x)} ${f(y + g)}L${f(x - g * 0.7)} ${f(y)}Z" fill="${couleur}" opacity="${f(0.08 + r() * 0.2)}"/>`;
    }
  } else {
    for (let i = 0; i < 24; i++) {
      const [x, y] = aut();
      const g = 10 + r() * 50;
      o += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(g)}" fill="${r() < 0.5 ? couleur : 'none'}" ${r() < 0.5 ? '' : `stroke="${couleur2}" stroke-width="3"`} opacity="${f(0.07 + r() * 0.16)}"/>`;
    }
  }
  return o;
}

// Petit symbole du thème (badge du portrait illustré)
function symbole(nom, cx, cy, s, c) {
  const t = `translate(${f(cx)} ${f(cy)}) scale(${f(s / 100)})`;
  const formes = {
    etoiles: `<path d="${etoile(0, 0, 46)}" fill="${c}"/>`,
    circuit: `<path d="M12 -48L-26 6H-2L-12 48L28 -8H4Z" fill="${c}"/>`,
    neon: `<path d="M12 -48L-26 6H-2L-12 48L28 -8H4Z" fill="${c}"/>`,
    feuilles: `<path d="${feuille(34)}" transform="translate(0 34) rotate(35)" fill="${c}"/>`,
    vagues: `<path d="M0 -48C34 -8 40 8 40 22A40 40 0 0 1 -40 22C-40 8 -34 -8 0 -48Z" fill="${c}"/>`,
    flammes: `<path d="${flamme}" transform="translate(0 44) scale(0.5)" fill="${c}"/>`,
    couronne: `<path d="${couronne}" transform="scale(0.72)" fill="${c}"/>`,
    blocs: `<rect x="-34" y="-34" width="68" height="68" rx="10" fill="${c}"/>`,
    losanges: `<path d="M0 -46L32 0L0 46L-32 0Z" fill="${c}"/>`,
    bulles: `<circle r="30" fill="none" stroke="${c}" stroke-width="12"/>`,
  };
  return `<g transform="${t}">${formes[nom] || formes.bulles}</g>`;
}

// Portrait illustré aux couleurs du thème (quand la personne n'a pas de photo de profil)
function portrait(st, c, graine) {
  const couches = `<g opacity="0.45">${motif(st.motif, c, c, '#ffffff', st.accent2, graine + 7)}</g>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${c}" height="${c}" viewBox="0 0 ${c} ${c}"><defs>` +
      `<linearGradient id="pf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${st.fond[1]}"/><stop offset="1" stop-color="${st.fond[0]}"/></linearGradient>` +
      `<radialGradient id="lu" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="${st.accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${st.accent}" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="si" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="1" stop-color="${st.accent2}" stop-opacity="0.85"/></linearGradient>` +
      `</defs><rect width="${c}" height="${c}" fill="url(#pf)"/><rect width="${c}" height="${c}" fill="url(#lu)"/>${couches}` +
      `<circle cx="${c / 2}" cy="${c * 0.36}" r="${c * 0.17}" fill="url(#si)"/>` +
      `<path d="M${c * 0.16} ${c} C${c * 0.16} ${c * 0.66} ${c * 0.34} ${c * 0.56} ${c / 2} ${c * 0.56} C${c * 0.66} ${c * 0.56} ${c * 0.84} ${c * 0.66} ${c * 0.84} ${c}Z" fill="url(#si)"/>` +
      `<circle cx="${c * 0.78}" cy="${c * 0.78}" r="${c * 0.11}" fill="${st.fond[0]}" stroke="${st.accent}" stroke-width="5"/>${symbole(st.motif, c * 0.78, c * 0.78, c * 0.12, st.accent)}` +
      `</svg>`
  );
}

const rond = (c) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${c}" height="${c}"><circle cx="${c / 2}" cy="${c / 2}" r="${c / 2}"/></svg>`);

// Carte 1080×1080 : photo (ou portrait du thème) dans un cadre lumineux, « BIENVENUE » (ou « AU REVOIR »), nom du groupe, rang du membre
async function carte({ theme, photo, groupe, rang, graine = 1, mode = 'bienvenue' }) {
  const st = style(theme);
  const W = TAILLE, H = TAILLE, D = 500, cy = 495;
  let avatar = null;
  if (photo) {
    try {
      avatar = await sharp(photo, { animated: false }).rotate().resize(D, D, { fit: 'cover' }).ensureAlpha().composite([{ input: rond(D), blend: 'dest-in' }]).png().toBuffer();
    } catch {
      avatar = null; // image illisible : on prend le portrait du thème
    }
  }
  if (!avatar) avatar = await sharp(portrait(st, D, graine)).ensureAlpha().composite([{ input: rond(D), blend: 'dest-in' }]).png().toBuffer();

  const txt = (t, x, y, l, h, o) => {
    const r = T.disposer(t, { x, y, l, h }, o);
    return r.d ? `<path d="${r.d}" fill="${o.couleur}"/>` : '';
  };
  const depart = mode === 'aurevoir';
  const titre = txt(depart ? 'AU REVOIR' : 'BIENVENUE', 90, 44, W - 180, 140, { poids: 900, tailleMax: 130, couleur: '#ffffff' });
  const phrase = depart ? (rang ? `À bientôt · nous sommes ${rang}` : 'À bientôt !') : rang ? `Tu es le membre n° ${rang}` : 'Fais comme chez toi';
  const sous = txt(phrase, 140, 926, W - 280, 56, { poids: 700, tailleMax: 56, couleur: st.accent });
  const nomGroupe = txt(groupe || 'le groupe', 100, 798, W - 200, 122, { poids: 900, tailleMax: 100, tailleMin: 30, couleur: '#ffffff' });
  const pied = txt('MWENOBANGUE Labs', 340, 1018, W - 680, 34, { poids: 700, tailleMax: 30, couleur: st.accent2 });

  const fond =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>` +
    `<linearGradient id="fd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${st.fond[0]}"/><stop offset="1" stop-color="${st.fond[1]}"/></linearGradient>` +
    `<radialGradient id="ha" cx="50%" cy="${(cy / H) * 100}%" r="48%"><stop offset="0" stop-color="${st.accent}" stop-opacity="0.38"/><stop offset="1" stop-color="${st.accent}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="an" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${st.accent}"/><stop offset="1" stop-color="${st.accent2}"/></linearGradient>` +
    `<radialGradient id="vi" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient>` +
    `<linearGradient id="bas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.4"/></linearGradient><filter id="fl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>` +
    `</defs><rect width="${W}" height="${H}" fill="url(#fd)"/>${motif(st.motif, W, H, st.accent, st.accent2, graine)}` +
    `<rect width="${W}" height="${H}" fill="url(#ha)"/><rect width="${W}" height="${H}" fill="url(#vi)"/><rect y="${H - 330}" width="${W}" height="330" fill="url(#bas)"/>` +
    `<circle cx="${W / 2}" cy="${cy}" r="${D / 2 + 22}" fill="none" stroke="url(#an)" stroke-width="22" opacity="0.65" filter="url(#fl)"/>` +
    `<circle cx="${W / 2}" cy="${cy}" r="${D / 2 + 38}" fill="none" stroke="${st.accent}" stroke-width="3" stroke-dasharray="3 14" stroke-linecap="round" opacity="0.8"/>` +
    `<circle cx="${W / 2}" cy="${cy}" r="${D / 2 + 12}" fill="none" stroke="url(#an)" stroke-width="12"/>` +
    `<rect x="${W / 2 - 150}" y="1000" width="300" height="3" rx="1.5" fill="url(#an)" opacity="0.5"/>` +
    `</svg>`;
  const dessus =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<g opacity="0.0"></g><g>${titre}</g><g>${nomGroupe}</g><g>${sous}</g><g opacity="0.8">${pied}</g></svg>`;
  const ombreTitre = dessus.replace(/fill="#ffffff"/g, 'fill="#000" opacity="0.35" transform="translate(0 4)"');

  return sharp(Buffer.from(fond))
    .composite([
      { input: avatar, left: W / 2 - D / 2, top: cy - D / 2 },
      { input: Buffer.from(ombreTitre) },
      { input: Buffer.from(dessus) },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// ───────────── Texte (cadre du thème) ─────────────
const compacter = (d) => String(d || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);

function texte({ theme, noms, groupe, membres, description, perso, mode = 'bienvenue' }) {
  const remplacer = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));
  const vars = { nom: noms, groupe, membres, description: description || '' };
  if (perso) return remplacer(perso, vars);
  const th = require('./menu').THEMES[theme] || require('./menu').THEMES.kernel;
  const depart = mode === 'aurevoir';
  const infos = [`Membre : ${noms}`, `Groupe : ${groupe}`];
  if (membres) infos.push(depart ? `Restants : ${membres}` : `Membres : ${membres}`);
  const haut = th.entete(depart ? '👋 Au revoir' : '👋 Bienvenue', infos).replace(/\n+$/, '');
  const bas = depart ? '\n\n🕊️ Merci d’avoir fait un bout de chemin avec nous. À bientôt !' : '\n\n✨ Lis les règles, respecte tout le monde et fais comme chez toi !';
  let lignes = depart ? [] : compacter(description);
  let bloc = '';
  const fabriquer = () => (lignes.length ? `\n${th.cat('📝', 'Description')}\n${lignes.map((l) => th.ligne(l)).join('\n')}${th.fin() ? '\n' + th.fin() : ''}\n` : '');
  // la description est raccourcie jusqu'à ce que la légende tienne
  for (let essai = 0; essai < 40; essai++) {
    bloc = fabriquer();
    if ((haut + bloc + bas).length <= MAX_LEGENDE) break;
    if (lignes.length > 1 && essai % 2) lignes = lignes.slice(0, -1);
    else lignes = lignes.map((l, i) => (i === lignes.length - 1 || lignes.length === 1 ? l.slice(0, Math.max(20, Math.floor(l.length * 0.8))).replace(/\s+\S*$/, '') + '…' : l));
    if (essai === 39) bloc = '';
  }
  return haut + bloc + bas;
}

// ───────────── Envoi ─────────────
const avecDelai = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('délai dépassé')), ms))]);

async function photoDe(sock, candidats) {
  for (const j of [...new Set(candidats.filter(Boolean))]) {
    try {
      const url = await avecDelai(sock.profilePictureUrl(j, 'image'), 6000);
      if (!url) continue;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length) return b;
    } catch {
      /* photo cachée ou indisponible : on essaie le suivant, puis le portrait du thème */
    }
  }
  return null;
}

const idDe = (p) => (typeof p === 'string' ? p : p?.id || p?.jid || '');
const telDe = (p) => (typeof p === 'object' && p?.phoneNumber) || '';

/**
 * Accueille les nouveaux membres d'un groupe (mode 'bienvenue') ou salue ceux qui partent (mode 'aurevoir').
 * opts : { jid, participants, nomGroupe, nb, description, perso, photo (false = texte seul), theme, mode }
 * Renvoie le nombre de messages envoyés.
 */
async function souhaiter(sock, { jid, participants, nomGroupe, nb, description, perso = '', photo = true, theme, mode = 'bienvenue' }) {
  theme = theme || require('./reglages').lire().theme;
  const liste = (participants || []).map((p) => ({ id: idDe(p), tel: telDe(p) })).filter((p) => p.id);
  if (!liste.length) return 0;
  const tag = (id) => '@' + numero(id);
  const mentions = liste.map((p) => p.id);

  if (!photo || liste.length > MAX_CARTES) {
    await sock.sendMessage(jid, { text: texte({ theme, noms: liste.map((p) => tag(p.id)).join(' '), groupe: nomGroupe, membres: nb, description, perso, mode }), mentions });
    return 1;
  }
  let envoyes = 0;
  for (let i = 0; i < liste.length; i++) {
    const p = liste[i];
    const legende = texte({ theme, noms: tag(p.id), groupe: nomGroupe, membres: nb, description: i === 0 ? description : '', perso, mode });
    let image = null;
    try {
      const pho = await photoDe(sock, [p.id, p.tel, p.tel && p.tel.includes('@') ? '' : p.tel && numero(p.tel) + '@s.whatsapp.net']);
      image = await carte({ theme, photo: pho, groupe: nomGroupe, rang: liste.length === 1 && Number(nb) ? Number(nb) : 0, graine: Number(numero(p.id).slice(-6)) || 1, mode });
    } catch (e) {
      console.error('[bienvenue] carte impossible :', e.message);
    }
    if (image) await sock.sendMessage(jid, { image, caption: legende, mentions: [p.id] });
    else await sock.sendMessage(jid, { text: legende, mentions: [p.id] });
    envoyes++;
  }
  return envoyes;
}

module.exports = { carte, texte, souhaiter, photoDe, STYLES, style, MAX_CARTES, MAX_LEGENDE };
