// Choisit où vivent la session WhatsApp et l'état des instances :
//  - mode « site »     : SITE_URL défini → tout passe par Kernel Connect (moteur personnel, aucune clé de base de données) ;
//  - mode « supabase » : SUPABASE_URL + SUPABASE_SERVICE_KEY → moteur de l'administrateur (écrit directement dans sa base) ;
//  - sinon             : aucun stockage distant (dossier local).
// Le choix est refait à chaque appel (les variables d'environnement peuvent changer dans les essais).
const supabase = require('./auth_supabase');
const site = require('./auth_site');

const choisir = () => (site.actif() ? site : supabase);
module.exports = new Proxy({}, {
  get: (_, cle) => (cle === 'mode' ? (site.actif() ? 'site' : supabase.actif() ? 'supabase' : 'local') : choisir()[cle]),
});
