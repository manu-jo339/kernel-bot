// Kernel Bot — lecture des dates et heures écrites en français (« dans 30min », « à 18h30 », « demain 8h », « 25/12 9h »)
// Fuseau : Brazzaville (UTC+1, pas d'heure d'été).
const { parseDuree } = require('./utils');

const DECALAGE = 3600000;
const UNITE = /^\d+([.,]\d+)?(j|jours?|h|heures?|min|minutes?|m|sec|secondes?|s)\d*$/i;

const local = (ts = Date.now()) => new Date(ts + DECALAGE); // lire avec getUTC*
const enMs = (an, mois, jour, h, min) => Date.UTC(an, mois, jour, h, min) - DECALAGE;

function heureDe(jeton) {
  const m = String(jeton || '').match(/^(\d{1,2})(?:h|:)(\d{2})?$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0;
  return h > 23 || min > 59 ? null : { h, min };
}

// Renvoie { quand, reste, repete } ou null si aucune date/heure n'est reconnue au début du texte
function parseQuand(texte) {
  let t = String(texte || '').trim();
  if (!t) return null;
  let repete = 0;
  const rep = t.match(/^(tous les jours|chaque jour|quotidien)\s*/i);
  if (rep) {
    repete = 864e5;
    t = t.slice(rep[0].length);
  }
  const sem = t.match(/^(toutes les semaines|chaque semaine|hebdo)\s*/i);
  if (sem) {
    repete = 7 * 864e5;
    t = t.slice(sem[0].length);
  }
  const mots = t.split(/\s+/);
  const maintenant = Date.now();
  const nl = local(maintenant);
  let i = 0;
  let jourFixe = null; // [an, mois, jour]
  let heure = null;

  const prem = (mots[0] || '').toLowerCase();
  if (prem === 'demain' || prem === 'aprèsdemain' || prem === 'apres-demain') {
    const d = local(maintenant + (prem === 'demain' ? 864e5 : 2 * 864e5));
    jourFixe = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
    i = 1;
  } else if (prem === 'après' && (mots[1] || '').toLowerCase() === 'demain') {
    const d = local(maintenant + 2 * 864e5);
    jourFixe = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
    i = 2;
  } else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(prem)) {
    const [j, m, a] = prem.split('/').map((x) => parseInt(x, 10));
    const an = a ? (a < 100 ? 2000 + a : a) : nl.getUTCFullYear();
    jourFixe = [an, m - 1, j];
    i = 1;
  }
  let mot = (mots[i] || '').toLowerCase();
  if (mot === 'à' || mot === 'a' || mot === 'vers') {
    i += 1;
    mot = (mots[i] || '').toLowerCase();
  }
  const clock = heureDe(mot);
  const explicite = jourFixe || i > 0 || /:/.test(mot);

  if (clock && explicite) {
    heure = clock;
    i += 1;
  } else if (jourFixe) {
    heure = { h: 8, min: 0 }; // date sans heure : 8 h
  }

  if (heure) {
    let [an, mois, jour] = jourFixe || [nl.getUTCFullYear(), nl.getUTCMonth(), nl.getUTCDate()];
    let quand = enMs(an, mois, jour, heure.h, heure.min);
    if (quand <= maintenant) {
      if (jourFixe) return { erreur: 'passe' };
      quand += 864e5; // heure du jour déjà passée : demain
    }
    return { quand, reste: mots.slice(i).join(' ').trim(), repete };
  }

  // Durée : « dans 30min », « 2h », « 1h30 », « 1h 30min »
  let j = 0;
  if ((mots[0] || '').toLowerCase() === 'dans') j = 1;
  const debut = j;
  while (j < mots.length && UNITE.test(mots[j])) j += 1;
  if (j === debut) return null;
  const ms = parseDuree(mots.slice(debut, j).join(' '));
  if (!ms) return null;
  return { quand: maintenant + ms, reste: mots.slice(j).join(' ').trim(), repete };
}

module.exports = { parseQuand, local, enMs, heureDe };
