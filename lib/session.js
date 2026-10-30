// Kernel Bot — connexions WhatsApp : la session principale et d'éventuelles sessions supplémentaires (autres numéros)
// Chaque session garde ses clés dans son propre dossier ; rien n'est envoyé à un serveur tiers.
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');
const config = require('../config');
const store = require('./store');
const evenements = require('./evenements');
const { traiter } = require('./handler');
const anciens = require('./anciens');
const authSupabase = require('./auth_supabase');

// Journal technique de Baileys : éteint par défaut. Pour comprendre un problème de chiffrement, mettre LOG_BAILEYS=warn (ou error) dans l'hébergeur.
const NIVEAUX_LOG = ['fatal', 'error', 'warn', 'info'];
const logger = pino({ level: NIVEAUX_LOG.includes(process.env.LOG_BAILEYS) ? process.env.LOG_BAILEYS : 'silent' });
const RACINE = path.join(__dirname, '..');
const sessions = new Map(); // id -> { id, sock, numero, secondaire, essais, arret }
const MAX_SECONDAIRES = Math.max(0, parseInt(process.env.MAX_SESSIONS || '3', 10) || 0);

// Que faire quand la connexion se ferme : session fermée depuis WhatsApp, reprise par un autre processus (même session ouverte ailleurs),
// redémarrage demandé par WhatsApp (juste après un appairage), ou simple coupure à retenter
const typeFermeture = (code) =>
  code === DisconnectReason.loggedOut ? 'deconnecte'
  : code === DisconnectReason.connectionReplaced ? 'remplacee'
  : code === DisconnectReason.restartRequired ? 'redemarrage'
  : 'reessayer';

// Derniers messages envoyés par le bot : quand un téléphone n'arrive pas à déchiffrer un message, il demande de le renvoyer (« En attente de ce message »).
// Sans cette mémoire, le bot ne peut pas répondre à cette demande et le message reste bloqué. Limité en nombre pour ménager la mémoire.
function creerMemoire(max = 50) {
  const m = new Map();
  return {
    ajouter(msg) {
      const id = msg?.key?.id;
      if (!id || !msg.message) return;
      m.delete(id);
      m.set(id, msg.message);
      if (m.size > max) m.delete(m.keys().next().value);
    },
    lire: (id) => m.get(id),
    taille: () => m.size,
  };
}

const dossierDe = (id) => (id === 'principal' ? path.join(RACINE, 'auth') : path.join(RACINE, 'sessions', id));
const principale = () => sessions.get('principal')?.sock || null;
// Nom de l'utilisateur du site propriétaire de l'instance (profiles.display_name) : affiché dans le menu. Jamais bloquant.
const assainirNom = (v) => String(v || '').replace(/[\u0000-\u001f\u007f*_~`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
async function chargerUtilisateur(id, sock) {
  if (!authSupabase.actif() || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    const r = await authSupabase.api(`instances?id=eq.${id}&select=profiles(display_name)`);
    if (!r.ok) return;
    const nom = assainirNom((await r.json())?.[0]?.profiles?.display_name);
    if (nom) sock.utilisateur = nom;
  } catch {}
}
const connectee = (s) => !!s?.sock?.user && s.ouverte;

// Écouteurs d'événements de session (utilisés par l'API moteur de Kernel Connect) : qr, connecting, open, close
const ecouteurs = new Set();
const surEvenement = (fn) => {
  ecouteurs.add(fn);
  return () => ecouteurs.delete(fn);
};
const emettre = (id, type, detail = {}) => {
  for (const f of ecouteurs) {
    try {
      f(id, type, detail);
    } catch (e) {
      console.error('[session] écouteur :', e.message);
    }
  }
};

// qr : on attend un QR code plutôt qu'un code d'appairage — moteur : session pilotée par la plateforme (le code n'est jamais écrit dans la console)
async function lancer({ id, numero, onCode, qr: modeQr = false, moteur = false }) {
  const secondaire = id !== 'principal';
  const etat = sessions.get(id) || { id, essais: 0, arret: false, numero };
  sessions.set(id, etat);
  etat.arret = false;
  if (moteur) etat.moteur = true;
  etat.debut = Math.floor(Date.now() / 1000); // les messages plus anciens que ce démarrage ne sont jamais traités

  // Session : dossier local, ou base Supabase si SUPABASE_URL et SUPABASE_SERVICE_KEY sont définis (hébergement au disque éphémère)
  const distant = authSupabase.actif();
  const { state, saveCreds } = distant ? await authSupabase.useSupabaseAuthState(id) : await useMultiFileAuthState(dossierDe(id));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Renvoi d'un message à la demande d'un appareil qui ne l'a pas pu le lire
    getMessage: async (key) => etat.memoire?.lire(key?.id),
  });
  if (!etat.memoire) etat.memoire = creerMemoire();
  // Une relance (reconnexion demandée, nouvelle tentative) ferme proprement l'ancienne connexion : ses événements tardifs sont ignorés plus bas
  const ancien = etat.sock;
  if (ancien && ancien !== sock) {
    try {
      ancien.end?.(undefined);
    } catch {}
  }
  sock.secondaire = secondaire; // une session secondaire n'a jamais les droits de propriétaire du bot
  sock.sessionId = id;
  etat.sock = sock;
  etat.ouverte = false;

  sock.ev.on('creds.update', saveCreds);
  evenements.brancher(sock);

  // Première connexion : code d'appairage (ou QR code pour une session pilotée par la plateforme)
  // Une session de plateforme qui se relance toute seule ne redemande pas de code : l'ancien est périmé, la personne en redemande un.
  if (!sock.authState.creds.registered && !modeQr && (!etat.moteur || onCode)) {
    const n = (numero || (id === 'principal' ? config.NUMERO_BOT : id) || '').replace(/\D/g, '');
    if (!n) {
      console.error('❌ NUMERO_BOT est vide dans le fichier .env (ex : 242061234567).');
      if (!secondaire) process.exit(1);
    } else {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(n);
          const lisible = code.match(/.{1,4}/g).join('-');
          if (onCode) return onCode(lisible);
          console.log('\n══════════════════════════════════════');
          console.log(`  CODE D'APPAIRAGE : ${lisible}`);
          console.log('══════════════════════════════════════');
          console.log('WhatsApp > Appareils connectés > Connecter un appareil');
          console.log('> « Se connecter avec un numéro de téléphone » > saisir le code.\n');
        } catch (e) {
          console.error('❌ Impossible d’obtenir le code d’appairage :', e.message);
          if (onCode) onCode(null, e.message);
        }
      }, 3000);
    }
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) emettre(id, 'qr', { qr });
    if (connection === 'connecting') emettre(id, 'connecting');
    if (connection === 'open') {
      etat.essais = 0;
      etat.ouverte = true;
      etat.numero = (sock.user?.id || '').split(':')[0].split('@')[0];
      const utilisateurPret = chargerUtilisateur(id, sock);
      // Le bot se déclare « hors ligne » : ton téléphone continue de sonner normalement (jamais de notifications bloquées)
      sock.sendPresenceUpdate('unavailable').catch(() => {});
      // Message « connecté ✅ » (ou grande bienvenue la première fois), une fois par lancement — pas à chaque reconnexion réseau
      if (!etat.annonce) {
        etat.annonce = true;
        setTimeout(async () => {
          await utilisateurPret;
          for (let essai = 1; essai <= 3; essai++) {
            try {
              const r = await require('./bienvenue').envoyer(sock, require('./handler').liste.length);
              if (r) console.log(`📨 Message ${r === 'bienvenue' ? 'de bienvenue' : 'de démarrage'} envoyé à ${etat.numero}.`);
              return;
            } catch (e) {
              console.error(`[bienvenue] essai ${essai}/3 : ${e.message}`);
              await new Promise((ok) => setTimeout(ok, 4000));
            }
          }
        }, 3000);
      }
      console.log(`✅ ${config.NOM_BOT}${secondaire ? ` [session ${id}]` : ''} connecté (${sock.user?.id}). Préfixe : "${config.PREFIXE}" — mode : ${config.MODE}`);
      emettre(id, 'open', { numero: etat.numero });
    } else if (connection === 'close') {
      if (etat.sock !== sock) return; // ancienne connexion remplacée entre-temps
      etat.ouverte = false;
      if (etat.arret) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        emettre(id, 'close', { code, deconnecte: true });
        if (secondaire) {
          console.log(`⛔ Session ${id} fermée depuis WhatsApp : elle est supprimée.`);
          retirerSession(id);
        } else {
          console.log(authSupabase.actif()
            ? '⛔ Session fermée depuis WhatsApp. La session enregistrée est effacée : au prochain démarrage, un nouveau code d’appairage sera demandé.'
            : '⛔ Session fermée depuis WhatsApp. Supprime le dossier "auth" puis relance pour te reconnecter.');
          if (authSupabase.actif()) authSupabase.supprimerSession(id).catch(() => {}).finally(() => process.exit(0));
          else process.exit(0);
        }
        return;
      }
      // Même session ouverte par un autre processus (ex : pendant un redéploiement, l'ancien et le nouveau programme coexistent un instant) :
      // on s'arrête ici. Réessayer ferait « reprendre » la connexion à l'autre processus en boucle et abîmerait les clés de chiffrement.
      if (typeFermeture(code) === 'remplacee') {
        etat.arret = true;
        console.log(`⛔ Session${secondaire ? ` ${id}` : ''} reprise par un autre processus (même session ouverte ailleurs) : arrêt ici, aucune nouvelle tentative.`);
        emettre(id, 'close', { code, deconnecte: false, remplacee: true });
        return;
      }
      // Redémarrage demandé par WhatsApp juste après un appairage réussi : on repart tout de suite, sans compter d'échec
      const redemarrage = typeFermeture(code) === 'redemarrage';
      if (!redemarrage) etat.essais += 1;
      const attente = redemarrage ? 500 : Math.min(5000 * etat.essais, 30000);
      emettre(id, 'close', { code, deconnecte: false, essais: etat.essais, redemarrage });
      console.log(`⚠️ Connexion perdue${secondaire ? ` (session ${id})` : ''} (code ${code ?? '?'}). Nouvelle tentative dans ${attente / 1000} s…`);
      setTimeout(() => lancer({ id, numero }).catch((e) => console.error('[session]', e.message)), attente);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) if (m.key?.fromMe) etat.memoire.ajouter(m);
    if (type !== 'notify') {
      console.log(`[ignoré] ${messages.length} message(s) de type « ${type} » (historique, pas de nouveau message)`);
      return;
    }
    for (const msg of messages) {
      // Rejeu après un redémarrage : WhatsApp renvoie parfois des messages déjà traités (ou reçus pendant l'arrêt) → ignorés
      const raison = anciens.verifier(id, msg, etat.debut);
      if (raison) {
        console.log(`[ignoré] ancien message (${raison}) : ${msg.key?.id}`);
        continue;
      }
      try {
        await traiter(sock, msg);
      } catch (e) {
        console.error('[message]', e);
      }
    }
  });
  return sock;
}

function retirerSession(id) {
  const s = sessions.get(id);
  if (s) {
    s.arret = true;
    try {
      s.sock?.end?.(undefined);
    } catch {}
    sessions.delete(id);
  }
  store.del('sessions', id);
  let effacement;
  if (authSupabase.actif()) effacement = authSupabase.supprimerSession(id).catch(() => {});
  try {
    fs.rmSync(dossierDe(id), { recursive: true, force: true });
  } catch (e) {
    console.error('[session] suppression du dossier impossible :', e.message);
  }
  emettre(id, 'retire');
  return effacement; // promesse (ou rien) : l'appelant peut l'attendre avant de relancer la même session
}

// Ajoute un numéro (renvoie le code d'appairage via onCode)
async function connecter(numero, onCode) {
  const id = String(numero).replace(/\D/g, '');
  if (id.length < 8) throw new Error('Numéro invalide (ex : 242061234567).');
  if (sessions.has(id)) throw new Error('Ce numéro est déjà connecté.');
  if (config.NUMERO_BOT === id) throw new Error('C’est le numéro principal du bot.');
  if ([...sessions.keys()].filter((k) => k !== 'principal').length >= MAX_SECONDAIRES) {
    throw new Error(`Limite atteinte (${MAX_SECONDAIRES} session(s) supplémentaire(s), voir MAX_SESSIONS dans .env).`);
  }
  store.set('sessions', id, { ts: Date.now() });
  await lancer({ id, numero: id, onCode });
}

async function deconnecter(numero) {
  const id = String(numero).replace(/\D/g, '');
  const s = sessions.get(id);
  if (!s) return false;
  try {
    s.arret = true;
    await s.sock?.logout?.();
  } catch {}
  retirerSession(id);
  return true;
}

const liste = () => [...sessions.values()].map((s) => ({ id: s.id, numero: s.numero || s.id, connectee: connectee(s), secondaire: s.id !== 'principal' }));

// Au démarrage : session principale puis sessions secondaires enregistrées
async function demarrerTout() {
  // PRINCIPAL=non : le service ne sert que de moteur pour Kernel Connect (aucun bot principal, donc aucun code d'appairage dans les logs)
  if (String(process.env.PRINCIPAL || '').toLowerCase() === 'non') console.log('ℹ️ PRINCIPAL=non : pas de bot principal, seules les instances de la plateforme sont lancées.');
  else await lancer({ id: 'principal', numero: config.NUMERO_BOT });
  let ids;
  if (authSupabase.actif()) {
    // Sessions dans Supabase : on relance toutes celles qui sont appairées (numéros ajoutés par .connecter ou instances de la plateforme)
    ids = (await authSupabase.sessionsEnregistrees().catch((e) => (console.error('[session] liste impossible :', e.message), []))).filter((id) => id !== 'principal');
    if (ids.length > MAX_SECONDAIRES) {
      console.error(`⚠️ ${ids.length} sessions enregistrées mais MAX_SESSIONS=${MAX_SECONDAIRES} : seules les ${MAX_SECONDAIRES} premières sont relancées.`);
      ids = ids.slice(0, MAX_SECONDAIRES);
    }
  } else {
    ids = [];
    for (const { id } of store.liste('sessions')) {
      if (!fs.existsSync(dossierDe(id))) store.del('sessions', id);
      else ids.push(id);
    }
  }
  for (const id of ids) {
    const moteur = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
    lancer({ id, numero: id, moteur }).catch((e) => console.error(`[session ${id}]`, e.message));
  }
}

module.exports = { chargerUtilisateur, assainirNom, demarrerTout, connecter, deconnecter, liste, principale, sessions, lancer, retirerSession, connectee, surEvenement, typeFermeture, creerMemoire, MAX_SECONDAIRES };
