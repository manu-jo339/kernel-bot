// Kernel Bot — clés PARTAGÉES de la plateforme (GitHub, Giphy, AudD) : une seule pour tous les bots.
// Elles sont gardées sur Kernel Connect (variables Vercel PARTAGE_GITHUB_TOKEN et PARTAGE_GIPHY_KEY et PARTAGE_AUDD_TOKEN) et fournies au moteur par le site ;
// jamais écrites dans le code. Une clé mise dans le .env du moteur (GITHUB_TOKEN, GIPHY_API_KEY) passe en premier.
const SERVICES = ['github', 'giphy', 'audd'];

const nettoyer = (brut) => {
  const r = {};
  if (brut && typeof brut === 'object') {
    for (const k of SERVICES) if (typeof brut[k] === 'string' && /^\S{10,300}$/.test(brut[k])) r[k] = brut[k];
  }
  return r;
};

const deSession = (k) => require('./contexte').courant()?.CLES_PARTAGEES?.[k] || null;
// (une clé collée avec un espace ou un retour à la ligne en trop est nettoyée)
const env = (nom) => String(process.env[nom] || '').trim();
const github = () => env('GITHUB_TOKEN') || deSession('github') || null;
const giphy = () => env('GIPHY_API_KEY') || deSession('giphy') || null;
const audd = () => env('AUDD_API_TOKEN') || deSession('audd') || null;
const enteteGithub = () => { const t = github(); return t ? { authorization: 'Bearer ' + t } : {}; };

module.exports = { nettoyer, github, giphy, audd, enteteGithub, SERVICES };
