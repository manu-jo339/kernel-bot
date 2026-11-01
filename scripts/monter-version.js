// Kernel Bot — monte le numéro de version à chaque mise à jour publiée (package.json).
// Règle : on ajoute 1 au dernier chiffre ; arrivé à 10, la retenue passe au chiffre précédent (comme un compteur).
//   1.0.7 → 1.0.8 → 1.0.9 → 1.1.0 → … → 1.9.9 → 2.0.0
// Usage : npm run monter        (monte et écrit package.json)
//         npm run monter -- voir  (affiche la prochaine version sans rien écrire)
// package-lock.json n'est PAS touché : le démarrage rapide des moteurs compare ce fichier octet par octet avec leur copie de secours.
const fs = require('fs');
const path = require('path');

function suivante(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!m) throw new Error(`Version illisible : « ${version} » (attendu : 1.0.7)`);
  const [a, b, c] = m.slice(1).map(Number);
  let x = a, y = b, z = c + 1;
  if (z > 9) { z = 0; y += 1; }
  if (y > 9) { y = 0; x += 1; }
  return `${x}.${y}.${z}`;
}

if (require.main === module) {
  const fichier = path.join(__dirname, '..', 'package.json');
  const texte = fs.readFileSync(fichier, 'utf8');
  const actuelle = JSON.parse(texte).version;
  const prochaine = suivante(actuelle);
  if (process.argv[2] === 'voir') {
    console.log(`${actuelle} → ${prochaine} (rien n'est écrit)`);
  } else {
    // remplacement ciblé de la ligne « version » : le reste du fichier reste identique
    const neuf = texte.replace(/("version"\s*:\s*")[^"]+(")/, `$1${prochaine}$2`);
    fs.writeFileSync(fichier, neuf);
    console.log(`✅ Version : ${actuelle} → ${prochaine}`);
  }
}

module.exports = { suivante };
