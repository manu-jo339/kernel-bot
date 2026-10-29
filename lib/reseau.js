// Kernel Bot — outils réseau sûrs : le bot ne doit jamais pouvoir être utilisé pour atteindre le réseau local de l'ordinateur (SSRF)
const dns = require('dns').promises;
const net = require('net');

function ipPrivee(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const t = ip.toLowerCase();
    if (t.startsWith('::ffff:')) return ipPrivee(t.slice(7));
    return t === '::1' || t === '::' || t.startsWith('fc') || t.startsWith('fd') || t.startsWith('fe8') || t.startsWith('fe9') || t.startsWith('fea') || t.startsWith('feb');
  }
  return true;
}

// Vrai seulement si le nom de domaine ou l'IP désigne une machine publique d'Internet
async function hotePublic(hote) {
  const h = String(hote).replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return !ipPrivee(h);
  if (!/^[a-z0-9.-]+$/i.test(h) || h.length > 253 || !h.includes('.') || /\.(local|internal|lan|home|localhost)$/i.test(h)) return false;
  try {
    const adr = await dns.lookup(h, { all: true });
    return adr.length > 0 && adr.every((a) => !ipPrivee(a.address));
  } catch {
    return false;
  }
}

// Transforme « exemple.com/page » en URL http(s) valide ; renvoie null sinon
function lireUrl(texte) {
  let t = String(texte || '').trim().replace(/^<|>$/g, '');
  if (!t) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t;
  try {
    const u = new URL(t);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return null;
    return u;
  } catch {
    return null;
  }
}

const nomDomaine = (t) => {
  const u = lireUrl(t);
  return (u ? u.hostname : String(t)).toLowerCase().replace(/\.$/, '');
};

module.exports = { ipPrivee, hotePublic, lireUrl, nomDomaine };
