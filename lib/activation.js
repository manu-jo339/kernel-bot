// Kernel Bot — activation du bot : un numéro qui vient d'être connecté reste EN ATTENTE (le bot ne répond à personne, ne réagit à rien,
// n'envoie aucun message) jusqu'à ce que son propriétaire tape « .start ». L'état est gardé dans la session (comme la session WhatsApp elle-même) :
// il survit aux redéploiements et aux redémarrages de Render.
//  • Aucun enregistrement  = bot déjà en service avant cette fonction (ou jamais en attente) → ACTIF. Rien ne se désactive tout seul.
//  • Seule une NOUVELLE liaison de numéro démarre en attente (sauf DEMARRAGE_AUTO=oui).
const TYPE = 'kernel-activation';
const ID = 'etat';

const auto = () => /^(oui|1|true|vrai)$/i.test(process.env.DEMARRAGE_AUTO || '');

function creer(keys) {
  let etat = null; // null = jamais enregistré

  const ecrire = async () => {
    try {
      await keys.set({ [TYPE]: { [ID]: etat } });
    } catch (e) {
      console.error('[activation] enregistrement impossible :', e.message);
    }
  };

  return {
    async charger() {
      try {
        const brut = await keys.get(TYPE, [ID]);
        const v = brut?.[ID];
        etat = v && typeof v === 'object' ? { attente: !!v.attente, ts: Number(v.ts) || 0 } : null;
      } catch {
        etat = null; // illisible : on ne désactive jamais un bot à cause d'une lecture ratée
      }
      return etat;
    },
    connu: () => etat !== null,
    enAttente: () => !!etat?.attente,
    async attendre() {
      etat = { attente: true, ts: Date.now() };
      await ecrire();
    },
    async activer() {
      etat = { attente: false, ts: Date.now() };
      await ecrire();
    },
  };
}

// Un numéro démarre en attente seulement s'il vient d'être lié ET qu'aucun état n'est enregistré (un bot déjà en service reste actif)
const doitAttendre = (nouvelleLiaison, connu) => !!nouvelleLiaison && !connu && !auto();

// Le message est-il « .start » (avec « . » ou le préfixe choisi) ? Seul ce texte passe pendant l'attente.
function estDemandeStart(texte, prefixe) {
  const t = String(texte || '').trim().toLowerCase();
  for (const p of new Set(['.', prefixe].filter(Boolean))) {
    if (t.startsWith(p.toLowerCase()) && /^(start|demarrer|démarrer|commencer)$/.test(t.slice(p.length).trim())) return true;
  }
  return false;
}

module.exports = { creer, auto, doitAttendre, estDemandeStart };
