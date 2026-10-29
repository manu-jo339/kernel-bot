// Kernel Bot — superviseur : relance automatiquement le bot s'il plante ou si on tape « redemarrer ».
// Lancé par « npm start ». Aucune connexion réseau, aucun fichier envoyé nulle part.
const { spawn } = require('child_process');
const path = require('path');

let enfant = null;
let arret = false;
let plantages = [];

function lancer() {
  enfant = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env, KERNEL_SUPERVISE: '1' },
  });
  enfant.on('exit', (code, signal) => {
    if (arret) return process.exit(0);
    if (code === 42) {
      console.log('🔄 Redémarrage demandé…');
      return setTimeout(lancer, 500);
    }
    if (code === 0) return process.exit(0); // arrêt volontaire (ex. session fermée depuis WhatsApp)
    const t = Date.now();
    plantages = plantages.filter((x) => t - x < 60000);
    plantages.push(t);
    if (plantages.length >= 5) {
      console.error('❌ Le bot plante en boucle (5 fois en 1 minute). Arrêt : regarde l’erreur ci-dessus.');
      return process.exit(1);
    }
    console.error(`⚠️ Le bot s'est arrêté (code ${code ?? signal}). Relance dans 3 s…`);
    setTimeout(lancer, 3000);
  });
}

for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, () => {
    arret = true;
    if (enfant) enfant.kill(s);
    else process.exit(0);
  });
}
lancer();
