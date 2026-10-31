// Kernel Bot — catalogue PUBLIC des commandes, généré à partir du code (jamais écrit à la main, donc jamais en retard).
// Utilisé par `npm run commandes` : le fichier produit est copié dans Kernel Connect (page publique « Commandes »).
const renommage = (() => { try { return require('./renommage.json'); } catch { return {}; } })();

const droitDe = (c) => (c.ownerOnly ? 'Propriétaire' : c.adminOnly ? 'Admin groupe' : c.groupOnly ? 'Groupe' : 'Tous');
const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Les anciens noms (style OVL : « vv », « kickall »…) restent reconnus par le bot mais n'ont rien à faire sur une page publique
function aliasPublics(cmd) {
  return (cmd.aliases || []).filter((a) => !(String(renommage[a] || '').toLowerCase() === cmd.name)).sort();
}

// Anciens noms (style OVL) d'une commande : ils ne s'affichent pas dans la liste, mais la recherche les retrouve
function anciensNoms(cmd) {
  return Object.entries(renommage)
    .filter(([ancien, nouveau]) => String(nouveau).toLowerCase() === cmd.name && ancien.toLowerCase() !== cmd.name)
    .map(([ancien]) => ancien.toLowerCase())
    .sort();
}

function catalogue(commandes, maintenant = new Date()) {
  const liste = commandes
    .map((c) => ({ nom: c.name, alias: aliasPublics(c), anciens: anciensNoms(c), categorie: c.categorie || 'Divers', desc: String(c.desc || '').replace(/\s+/g, ' ').trim(), droit: droitDe(c) }))
    .sort((a, b) => sansAccent(a.categorie).localeCompare(sansAccent(b.categorie)) || a.nom.localeCompare(b.nom));
  const categories = [...new Set(liste.map((c) => c.categorie))]
    .sort((a, b) => (a === 'Général' ? -1 : b === 'Général' ? 1 : sansAccent(a).localeCompare(sansAccent(b))));
  return { genere: maintenant.toISOString().slice(0, 10), total: liste.length, categories, commandes: liste };
}

module.exports = { catalogue, aliasPublics, anciensNoms, droitDe };
