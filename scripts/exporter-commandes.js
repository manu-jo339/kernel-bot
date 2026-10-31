// Génère le catalogue public des commandes : npm run commandes [fichier]   (défaut : commandes-publiques.json)
// Le fichier est ensuite copié dans Kernel Connect, dossier data/ (voir README).
process.env.KERNEL_TEST = '1'; // aucune connexion, aucun démarrage : on ne fait que lire les commandes
const fs = require('fs'), path = require('path');
process.chdir(path.join(__dirname, '..'));
const handler = require('../lib/handler');
handler.chargerCommandes();
const { catalogue } = require('../lib/catalogue');
const sortie = path.resolve(process.argv[2] || 'commandes-publiques.json');
const c = catalogue(handler.liste);
fs.writeFileSync(sortie, JSON.stringify(c, null, 1) + '\n');
console.log(`${c.total} commandes dans ${c.categories.length} catégories -> ${sortie}`);
