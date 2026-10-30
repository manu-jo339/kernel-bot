// Kernel Bot — API « moteur » appelée par la plateforme Kernel Connect (le site sur Vercel).
// Le site demande un VRAI code d'appairage (ou un QR) pour une instance ; ce module lance la session WhatsApp correspondante,
// puis tient à jour l'état de l'instance dans Supabase (statut, événements, QR qui se renouvelle).
//
// Sécurité :
//  • chaque appel doit porter une signature HMAC-SHA256 (en-têtes X-KC-Timestamp et X-KC-Signature) calculée avec ENGINE_SECRET
//    sur « horodatage.MÉTHODE.chemin.corps » ; appel non signé, trop ancien (> 60 s), modifié ou rejoué → refusé ;
//  • sans ENGINE_SECRET (16 caractères minimum), l'API entière reste fermée ;
//  • un code d'appairage n'est JAMAIS écrit dans la console ni dans les événements : il n'est renvoyé qu'au site, qui le montre à son propriétaire.
const crypto = require('crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FENETRE_MS = 60_000;
const TAILLE_MAX = 4096;
const DUREE_CODE_S = 120;
const DUREE_QR_S = 20;
const ATTENTE_APPAIRAGE_MS = 5 * 60_000; // sans connexion au bout de ce délai, la session d'appairage est abandonnée

class ErreurMoteur extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

function signer(secret, ts, methode, chemin, corps) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${String(methode).toUpperCase()}.${chemin}.${corps}`).digest('hex');
}

function signatureValide(secret, ts, methode, chemin, corps, signature, maintenant = Date.now()) {
  if (!secret || secret.length < 16 || !ts || !signature) return false;
  if (!/^\d{10,16}$/.test(String(ts)) || Math.abs(maintenant - Number(ts)) > FENETRE_MS) return false;
  const attendu = Buffer.from(signer(secret, ts, methode, chemin, corps));
  const recu = Buffer.from(String(signature));
  return attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu);
}

// Messages d'événement : courts, sans code, sans numéro complet
const nettoyer = (t) => String(t || '').replace(/[\r\n]+/g, ' ').replace(/\d{6,}/g, '…').slice(0, 300);

// Accès à la base Supabase (service_role). Silencieux si Supabase n'est pas configuré. Jamais bloquant pour la session WhatsApp.
function creerBase(authSupabase) {
  const ok = () => authSupabase.actif();
  const envoyer = async (chemin, opts, nom) => {
    if (!ok()) return false;
    try {
      const r = await authSupabase.api(chemin, { ...opts, headers: { Prefer: 'return=minimal', ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return true;
    } catch (e) {
      console.error(`[moteur] ${nom} impossible : ${e.message}`);
      return false;
    }
  };
  return {
    majInstance: (id, champs) => envoyer(`instances?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(champs) }, 'mise à jour de l’instance'),
    evenement: (id, type, severite, message) =>
      envoyer('instance_events', { method: 'POST', body: JSON.stringify({ instance_id: id, event_type: type, severity: severite, sanitized_message: nettoyer(message) }) }, 'événement'),
    qr: (id, payload, secondes) =>
      envoyer('pairing_requests', { method: 'POST', body: JSON.stringify({ instance_id: id, method: 'QR', payload, expires_at: new Date(Date.now() + secondes * 1000).toISOString() }) }, 'QR code'),
    viderAppairages: (id) => envoyer(`pairing_requests?instance_id=eq.${id}`, { method: 'DELETE' }, 'nettoyage des codes'),
  };
}

// session : module lib/session.js (ou un faux dans les essais) — authSupabase : lib/auth_supabase.js — base : voir creerBase
function creer({ session, authSupabase, base, secret = process.env.ENGINE_SECRET, maintenant = Date.now, delaiCode = 30_000, attenteAppairage = ATTENTE_APPAIRAGE_MS } = {}) {
  const db = base || creerBase(authSupabase);
  const suivi = new Map(); // id -> { methode, minuteur, attente: { resoudre, rejeter } } pour une session en cours d'appairage
  const vus = new Map(); // signature -> expiration : un même appel signé n'est accepté qu'une fois

  const nbInstances = (sauf) => [...session.sessions.keys()].filter((k) => k !== 'principal' && k !== sauf).length;
  const abandonner = (id) => {
    const s = suivi.get(id);
    if (s?.minuteur) clearTimeout(s.minuteur);
    suivi.delete(id);
  };

  // ───── événements de session → état dans Supabase ─────
  const ecouteur = (id, type, d = {}) => {
    if (!UUID.test(id)) return;
    const s = suivi.get(id);
    if (type === 'qr') {
      if (!s || s.methode !== 'QR') return;
      db.qr(id, d.qr, DUREE_QR_S);
      db.majInstance(id, { connection_status: 'PAIRING' });
      if (s.attente) s.attente.resoudre({ qr: d.qr, expireDans: DUREE_QR_S });
    } else if (type === 'connecting') {
      if (!s) db.majInstance(id, { connection_status: 'CONNECTING' });
    } else if (type === 'open') {
      abandonner(id);
      const t = new Date().toISOString();
      db.majInstance(id, { connection_status: 'CONNECTED', last_connected_at: t, last_activity_at: t, last_error: null });
      db.viderAppairages(id);
      db.evenement(id, 'CONNECTED', 'INFO', 'Connecté à WhatsApp');
    } else if (type === 'close') {
      if (d.remplacee) return; // un autre processus a repris la session : c'est lui qui tient l'état à jour
      if (d.deconnecte) {
        abandonner(id);
        db.majInstance(id, { connection_status: 'DISCONNECTED' });
        db.evenement(id, 'LOGGED_OUT', 'WARN', 'Session fermée depuis WhatsApp : il faut se reconnecter avec un nouveau code');
      } else if (!s && !d.redemarrage) {
        // On ne note que la première perte puis un point toutes les 10 tentatives, pour ne pas inonder le journal
        if (d.essais === 1 || d.essais % 10 === 0) db.evenement(id, 'CONNECTION_LOST', 'WARN', `Connexion perdue (code ${d.code ?? '?'}), nouvelle tentative automatique`);
        if (d.essais === 10) db.majInstance(id, { connection_status: 'ERROR', last_error: 'Connexion WhatsApp instable', last_error_at: new Date().toISOString() });
        else if (d.essais === 1) db.majInstance(id, { connection_status: 'CONNECTING' });
      }
    }
  };
  const retirerEcouteur = session.surEvenement(ecouteur);

  // ───── actions ─────
  async function appairer(id, corps) {
    const methode = corps?.methode === 'QR' ? 'QR' : corps?.methode === 'CODE' ? 'CODE' : null;
    if (!methode) throw new ErreurMoteur(400, 'Méthode inconnue.');
    const telephone = String(corps.telephone || '').replace(/\D/g, '');
    if (methode === 'CODE' && !/^\d{8,15}$/.test(telephone)) throw new ErreurMoteur(400, 'Numéro invalide.');

    const existante = session.sessions.get(id);
    if (existante && session.connectee(existante)) throw new ErreurMoteur(409, 'Déjà connectée.');
    if (nbInstances(id) >= session.MAX_SECONDAIRES) throw new ErreurMoteur(429, 'Le moteur est complet.');

    // On repart d'une session vierge : ancienne tentative, ancien dossier ou ancienne clé enregistrée
    abandonner(id);
    await session.retirerSession(id);

    const etat = { methode, minuteur: null, attente: null };
    suivi.set(id, etat);
    etat.minuteur = setTimeout(async () => {
      const s = session.sessions.get(id);
      if (suivi.get(id) !== etat || session.connectee(s) || s?.sock?.authState?.creds?.registered) return abandonner(id);
      abandonner(id);
      await session.retirerSession(id);
      db.majInstance(id, { connection_status: 'DISCONNECTED' });
      db.viderAppairages(id);
      db.evenement(id, 'PAIRING_EXPIRED', 'INFO', 'Appairage non terminé : le code a expiré');
    }, attenteAppairage);
    if (etat.minuteur.unref) etat.minuteur.unref();

    const obtenu = new Promise((resoudre, rejeter) => {
      etat.attente = { resoudre, rejeter };
      setTimeout(() => rejeter(new ErreurMoteur(504, 'Aucun code reçu de WhatsApp.')), delaiCode).unref?.();
    });
    obtenu.catch(() => {}); // évite un rejet non géré si la session échoue avant qu'on attende

    try {
      if (methode === 'CODE') {
        await session.lancer({
          id,
          numero: telephone,
          moteur: true,
          onCode: (code, erreur) => {
            if (!code) return etat.attente.rejeter(new ErreurMoteur(502, erreur || 'WhatsApp a refusé la demande.'));
            etat.attente.resoudre({ code, expireDans: DUREE_CODE_S });
          },
        });
      } else {
        await session.lancer({ id, numero: telephone || undefined, moteur: true, qr: true });
      }
      const rep = await obtenu;
      db.majInstance(id, { connection_status: 'PAIRING' });
      return rep;
    } catch (e) {
      abandonner(id);
      await session.retirerSession(id);
      db.majInstance(id, { connection_status: 'ERROR', last_error: nettoyer(e.message), last_error_at: new Date().toISOString() });
      throw e instanceof ErreurMoteur ? e : new ErreurMoteur(502, 'Échec du lancement de la session.');
    }
  }

  async function deconnecter(id) {
    abandonner(id);
    const s = session.sessions.get(id);
    if (!s) {
      await session.retirerSession(id); // rien en mémoire : on efface quand même une éventuelle session enregistrée
      return { ok: true, dejaDeconnectee: true };
    }
    s.arret = true;
    try {
      await s.sock?.logout?.();
    } catch {}
    await session.retirerSession(id);
    return { ok: true };
  }

  async function reconnecter(id) {
    const s = session.sessions.get(id);
    if (s && session.connectee(s)) throw new ErreurMoteur(409, 'Déjà connectée.');
    if (!s) {
      // Pas en mémoire (redémarrage du moteur) : on ne relance que si une session appairée est enregistrée
      const connues = authSupabase?.actif?.() ? await authSupabase.sessionsEnregistrees().catch(() => []) : [];
      if (!connues.includes(id)) throw new ErreurMoteur(404, 'Session inconnue.');
      if (nbInstances(id) >= session.MAX_SECONDAIRES) throw new ErreurMoteur(429, 'Le moteur est complet.');
    }
    session.lancer({ id, numero: id, moteur: true }).catch((e) => console.error(`[moteur] relance ${id} :`, e.message));
    return { ok: true };
  }

  async function detruire(id) {
    abandonner(id);
    const s = session.sessions.get(id);
    const connues = !s && authSupabase?.actif?.() ? await authSupabase.sessionsEnregistrees().catch(() => []) : [];
    if (!s && !connues.includes(id)) throw new ErreurMoteur(404, 'Session inconnue.');
    if (s) {
      s.arret = true;
      try {
        await s.sock?.logout?.();
      } catch {}
    }
    await session.retirerSession(id);
    return { ok: true };
  }

  function sante() {
    return {
      statut: 'en ligne',
      sessions: nbInstances(),
      capacite: session.MAX_SECONDAIRES,
      memoireMo: Math.round(process.memoryUsage().rss / 1048576),
      supabase: !!authSupabase?.actif?.(),
    };
  }

  // ───── HTTP ─────
  const repondre = (res, statut, objet) => {
    res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(objet));
  };

  function lireCorps(req) {
    return new Promise((resoudre, rejeter) => {
      const morceaux = [];
      let taille = 0;
      req.on('data', (m) => {
        taille += m.length;
        if (taille > TAILLE_MAX) {
          rejeter(new ErreurMoteur(413, 'Corps trop grand.'));
          req.destroy();
        } else morceaux.push(m);
      });
      req.on('end', () => resoudre(Buffer.concat(morceaux).toString('utf8')));
      req.on('error', rejeter);
    });
  }

  // Renvoie false si l'adresse n'est pas une adresse « moteur » (le serveur d'état prend alors le relais)
  async function gerer(req, res) {
    const chemin = String(req.url || '').split('?')[0];
    if (!chemin.startsWith('/engine/') && chemin !== '/engine') return false;
    try {
      if (!secret || secret.length < 16) throw new ErreurMoteur(503, 'API moteur non configurée.');
      const corps = await lireCorps(req);
      const sig = req.headers['x-kc-signature'];
      const ts = req.headers['x-kc-timestamp'];
      if (!signatureValide(secret, ts, req.method, chemin, corps, sig, maintenant())) throw new ErreurMoteur(401, 'Signature invalide.');
      // Anti-rejeu : la même signature ne passe qu'une fois pendant la fenêtre de validité
      const t = maintenant();
      for (const [k, exp] of vus) if (exp < t) vus.delete(k);
      if (vus.has(sig)) throw new ErreurMoteur(401, 'Appel déjà utilisé.');
      vus.set(sig, t + FENETRE_MS * 2);

      let json = {};
      if (corps) {
        try {
          json = JSON.parse(corps);
        } catch {
          throw new ErreurMoteur(400, 'Corps illisible.');
        }
      }
      const m = req.method;
      if (m === 'GET' && chemin === '/engine/health') return repondre(res, 200, sante()), true;
      const r = chemin.match(/^\/engine\/instances\/([^/]+)(?:\/(pair|disconnect|reconnect))?$/);
      if (!r) throw new ErreurMoteur(404, 'Introuvable.');
      const [, id, action] = r;
      if (!UUID.test(id)) throw new ErreurMoteur(400, 'Identifiant invalide.');
      if (m === 'POST' && action === 'pair') return repondre(res, 200, await appairer(id, json)), true;
      if (m === 'POST' && action === 'disconnect') return repondre(res, 200, await deconnecter(id)), true;
      if (m === 'POST' && action === 'reconnect') return repondre(res, 200, await reconnecter(id)), true;
      if (m === 'DELETE' && !action) return repondre(res, 200, await detruire(id)), true;
      throw new ErreurMoteur(405, 'Méthode non permise.');
    } catch (e) {
      if (e instanceof ErreurMoteur) repondre(res, e.statut, { erreur: e.message });
      else {
        console.error('[moteur]', e.message);
        repondre(res, 500, { erreur: 'Erreur interne.' });
      }
    }
    return true;
  }

  return { gerer, appairer, deconnecter, reconnecter, detruire, sante, arreter: () => (retirerEcouteur(), [...suivi.keys()].forEach(abandonner)), ErreurMoteur };
}

let instance = null;
// Version câblée sur les vrais modules (créée au premier appel, seulement si ENGINE_SECRET est défini)
function parDefaut() {
  if (!instance) instance = creer({ session: require('./session'), authSupabase: require('./auth_supabase') });
  return instance;
}

module.exports = { creer, parDefaut, signer, signatureValide, ErreurMoteur, UUID };
