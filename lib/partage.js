// Kernel Bot — clés PARTAGÉES de la plateforme (GitHub, Giphy) : une seule pour tous les bots.
// Elles sont gardées sur Kernel Connect (variables Vercel PARTAGE_GITHUB_TOKEN et PARTAGE_GIPHY_KEY) et fournies au moteur par le site ;
// jamais écrites dans le code. Une clé mise dans le .env du moteur (GITHUB_TOKEN, GIPHY_API_KEY) passe en premier.
const SERVICES = ['github', 'giphy'];

const nettoyer = (brut) => {
  const r = {};
  if (brut && typeof brut === 'object') {
    for (const k of SERVICES) if (typeof brut[k] === 'string' && /^\S{10,300}$/.test(brut[k])) r[k] = brut[k];
  }
  return r;
};

const deSession = (k) => require('./contexte').courant()?.CLES_PARTAGEES?.[k] || null;
const github = () => process.env.GITHUB_TOKEN || deSession('github') || null;
const giphy = () => process.env.GIPHY_API_KEY || deSession('giphy') || null;
const enteteGithub = () => { const t = github(); return t ? { authorization: 'Bearer ' + t } : {}; };

module.exports = { nettoyer, github, giphy, enteteGithub, SERVICES };
