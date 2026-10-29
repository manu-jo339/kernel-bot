// Kernel Bot — page d'état minimale pour les hébergeurs « web service » (Render, etc.) : ils exigent qu'un port HTTP réponde.
// Démarre seulement si la variable PORT existe. Ne montre RIEN d'autre que « en ligne » : ni numéro, ni session, ni réglage.
const http = require('http');

function demarrer() {
  const port = Number(process.env.PORT);
  if (!port) return null;
  const debut = Date.now();
  const serveur = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ statut: 'en ligne', depuis_secondes: Math.floor((Date.now() - debut) / 1000) }));
  });
  serveur.listen(port, '0.0.0.0', () => console.log(`🩺 Page d'état sur le port ${port} (réponse « en ligne » uniquement)`));
  // Render gratuit met le service en veille après ~15 min sans visite : le bot s'appelle lui-même (adresse publique fournie par Render)
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url && /^https:\/\//.test(url)) {
    setInterval(() => fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => {}), 10 * 60 * 1000).unref();
  }
  return serveur;
}

module.exports = { demarrer };
