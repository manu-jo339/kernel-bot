// Kernel Bot — accès web sûr : délais, taille maximale, et refus des adresses privées pour tout lien donné par un utilisateur
const reseau = require('./reseau');
const { lireUrl } = reseau;

const UA = 'Mozilla/5.0 (compatible; KernelBot/1.0; +https://mwenobangue.com)';

async function json(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'user-agent': UA, accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.delai || 15000) });
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status);
    e.statut = r.status;
    throw e;
  }
  return r.json();
}

async function texte(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'user-agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.delai || 15000) });
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status);
    e.statut = r.status;
    throw e;
  }
  return r.text();
}

// Télécharge un fichier en limitant sa taille (octets). Suit les redirections à la main.
// externe = true quand l'adresse vient d'un utilisateur : on refuse alors tout ce qui n'est pas un site public d'Internet.
async function fichier(url, { max = 30 * 1024 * 1024, externe = false, delai = 30000, headers = {} } = {}) {
  let courant = String(url);
  for (let i = 0; i < 5; i++) {
    const u = lireUrl(courant);
    if (!u) throw new Error('adresse invalide');
    if (externe && !(await reseau.hotePublic(u.hostname))) throw new Error('adresse non publique refusée');
    const r = await fetch(u.href, { redirect: 'manual', headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(delai) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      courant = new URL(r.headers.get('location'), u).href;
      continue;
    }
    if (!r.ok) {
      const e = new Error('HTTP ' + r.status);
      e.statut = r.status;
      throw e;
    }
    const annonce = Number(r.headers.get('content-length')) || 0;
    if (annonce > max) throw new Error('fichier trop volumineux');
    const morceaux = [];
    let total = 0;
    for await (const c of r.body) {
      total += c.length;
      if (total > max) throw new Error('fichier trop volumineux');
      morceaux.push(c);
    }
    return { buffer: Buffer.concat(morceaux), mime: r.headers.get('content-type') || '', url: u.href };
  }
  throw new Error('trop de redirections');
}

module.exports = { json, texte, fichier, UA };
