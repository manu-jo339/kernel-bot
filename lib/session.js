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
const authSupabase = require('./stockage'); // Supabase (moteur de l'administrateur) ou site (moteur personnel) : voir lib/stockage.js

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
// Sans cette mémoire, le bot ne peut pas répondre à cette demande et le message reste bloqué. Limité en nombre pour ménager la mémoire (500 messages ≈ quelques Mo).
function creerMemoire(max = 500) {
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

// Compteur de redemandes par message (Baileys s'en sert pour ne pas redemander indéfiniment un message illisible)
function creerCacheTentatives() {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      m.delete(k);
      m.set(k, v);
      if (m.size > 2000) m.delete(m.keys().next().value);
    },
    del: (k) => m.delete(k),
    flushAll: () => m.clear(),
  };
}

// Plusieurs messages envoyés coup sur coup vers la même conversation (réponses découpées, rapports) arrivent parfois « en attente » sur le téléphone.
// On les espace d'une fraction de seconde : les envois d'une même conversation partent dans l'ordre, avec ENVOI_ECART_MS (500 par défaut) entre deux.
const ECART_ENVOI = Math.max(0, parseInt(process.env.ENVOI_ECART_MS || '500', 10) || 0);
function espacerEnvois(sock, ecart = ECART_ENVOI) {
  if (!ecart) return sock;
  const original = sock.sendMessage.bind(sock);
  const fin = new Map(); // jid -> { suite, dernier }
  sock.sendMessage = (jid, ...reste) => {
    const e = fin.get(jid) || { suite: Promise.resolve(), dernier: 0 };
    const courant = e.suite.then(async () => {
      const attente = e.dernier + ecart - Date.now();
      if (attente > 0) await new Promise((ok) => setTimeout(ok, attente));
      try {
        return await original(jid, ...reste);
      } finally {
        e.dernier = Date.now();
      }
    });
    e.suite = courant.catch(() => {});
    fin.set(jid, e);
    if (fin.size > 200) for (const [k, v] of fin) if (Date.now() - v.dernier > 60000) fin.delete(k);
    return courant;
  };
  return sock;
}

// Notifications du téléphone : WhatsApp ne sonne plus sur le téléphone tant qu'un appareil lié se déclare « en ligne ».
// Le bot ne doit donc JAMAIS rester en ligne : après chaque présence « en train d'écrire » on repasse « hors ligne », et on le répète régulièrement.
// Seul le réglage explicite « presence enligne » laisse passer « en ligne ».
function gardienPresence(sock, etat) {
  const original = sock.sendPresenceUpdate.bind(sock);
  let retour = null;
  const horsLigne = () => original('unavailable').catch(() => {});
  sock.sendPresenceUpdate = async (type, jid) => {
    const enLigneVoulu = (() => { try { return require('./reglages').lire().presenceMode === 'enligne'; } catch { return false; } })();
    if (type === 'available' && !enLigneVoulu) return undefined;
    const r = await original(type, jid);
    if (type !== 'unavailable' && !enLigneVoulu) {
      clearTimeout(retour);
      retour = setTimeout(horsLigne, 6000);
      retour.unref?.();
    }
    return r;
  };
  const periodique = setInterval(() => {
    if (etat.sock !== sock) return clearInterval(periodique);
    if (etat.ouverte && !(require('./reglages').lire().presenceMode === 'enligne')) horsLigne();
  }, 4 * 60 * 1000);
  periodique.unref?.();
}

const dossierDe = (id) => (id === 'principal' ? path.join(RACINE, 'auth') : path.join(RACINE, 'sessions', id));
const principale = () => sessions.get('principal')?.sock || null;
// Nom de l'utilisateur du site propriétaire de l'instance (profiles.display_name) : affiché dans le menu. Jamais bloquant.
const assainirNom = (v) => String(v || '').replace(/[\u0000-\u001f\u007f*_~`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
async function chargerUtilisateur(id, sock) {
  if (!authSupabase.actif() || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    const p = await authSupabase.profilUtilisateur(id);
    const nom = assainirNom(p?.nom);
    if (nom) sock.utilisateur = nom;
    // Réglages choisis par l'utilisateur sur le site (préfixe, mode public/privé, stickers) : valeurs vérifiées, jamais appliquées si le mode est illisible
    const r = require('./contexte').nettoyer(p);
    if (r) sock.reglagesSite = r;
    return r;
  } catch {}
}
// Instance de la plateforme : tant que les réglages de l'utilisateur ne sont pas connus, le bot reste PRIVÉ (jamais ouvert à tous par défaut),
// puis ils sont relus chaque minute : un changement dans Kernel Connect s'applique tout de suite.
function suivreReglages(id, sock, etat) {
  if (!authSupabase.actif() || !/^[0-9a-f-]{36}$/i.test(id)) return;
  if (!sock.reglagesSite) sock.reglagesSite = etat.reglagesConnus || { MODE: 'private' };
  const periodique = setInterval(async () => {
    if (etat.sock !== sock || etat.arret) return clearInterval(periodique);
    const r = await chargerUtilisateur(id, sock);
    if (r) etat.reglagesConnus = r;
  }, 60000);
  periodique.unref?.();
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
  // Les commandes plus anciennes que ce démarrage ne sont jamais traitées. Une simple reconnexion réseau ne déplace pas cette date
  // (sinon une commande tapée pendant une micro-coupure serait perdue) : c'est anciens.verifier qui écarte aussi ce qui a plus de 90 s.
  if (!etat.debut) etat.debut = Math.floor(Date.now() / 1000);

  // Session : dossier local, ou base Supabase si SUPABASE_URL et SUPABASE_SERVICE_KEY sont définis (hébergement au disque éphémère)
  const distant = authSupabase.actif();
  const { state, saveCreds, vider, geler } = distant ? await authSupabase.useSupabaseAuthState(id) : await useMultiFileAuthState(dossierDe(id));
  if (!etat.memoire) etat.memoire = creerMemoire();
  if (!etat.tentatives) etat.tentatives = creerCacheTentatives();
  if (!etat.suivi) etat.suivi = require('./suivi').creer(); // tableau de bord de Kernel Connect : activité, commandes, erreurs (en mémoire)
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
    msgRetryCounterCache: etat.tentatives,
    retryRequestDelayMs: 350,
    maxMsgRetryCount: 5,
  });
  espacerEnvois(sock);
  sock.suivi = etat.suivi;
  etat.viderAuth = vider || (async () => {});
  etat.geler = geler || (() => {}); // plus aucune écriture de clés (session reprise ailleurs ou supprimée)
  // Vues uniques et statuts déjà reçus (même avant ce démarrage) : retrouvés pour les commandes vv / save
  etat.conserve = require('./conserve').creer(state.keys);
  // Réglages (MODE privé…), bannis, premium, notes, rappels : gardés dans la session pour survivre aux redéploiements (seulement avec un stockage distant)
  etat.persistance = distant ? require('./persistance').creer(state.keys) : null;
  etat.sauverMedias = async () => { await etat.conserve.sauver(); await etat.persistance?.sauver(); };
  etat.chargement = Promise.all([
    etat.conserve.charger().then((n) => { if (n) console.log(`🗂️ ${n} vue(s) unique(s) / statut(s) retrouvé(s) de avant ce démarrage.`); }),
    etat.persistance?.charger().then((r) => { if (r) console.log(`♻️ Données restaurées après le redémarrage : ${r.docs} enregistrement(s), ${r.reglages} réglage(s) — mode : ${config.MODE}.`); }),
  ]);
  etat.persistance?.demarrer(() => etat.sock === sock && !etat.arret);
  // Activation : un numéro qui vient d'être lié reste en attente de « .start » (état gardé dans la session, donc durable)
  etat.activation = require('./activation').creer(state.keys);
  sock.activation = etat.activation;
  sock.enAttente = false;
  etat.chargement = Promise.all([etat.chargement, etat.activation.charger().then(() => { sock.enAttente = etat.activation.enAttente(); })]);
  // Numéro qui se lie pour la première fois pendant cette exécution (la liaison se termine par un redémarrage interne : l'indicateur reste sur « etat »)
  if (!sock.authState.creds.registered) etat.nouvelleLiaison = true;
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

  gardienPresence(sock, etat);
  suivreReglages(id, sock, etat);
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
      const utilisateurPret = chargerUtilisateur(id, sock).then((r) => { if (r) etat.reglagesConnus = r; });
      // Nouveau numéro : en attente de « .start ». Un bot déjà en service avant cette fonction (aucun état enregistré, pas de nouvelle liaison) reste actif.
      etat.activationPrete = etat.chargement.then(async () => {
        if (require('./activation').doitAttendre(etat.nouvelleLiaison, etat.activation.connu())) {
          await etat.activation.attendre();
          console.log('⏸️ Numéro lié : le bot reste en attente, muet. Son propriétaire tape .start pour le mettre en service.');
        }
        sock.enAttente = etat.activation.enAttente();
      }).catch(() => {});
      // Le bot se déclare « hors ligne » : ton téléphone continue de sonner normalement (jamais de notifications bloquées)
      sock.sendPresenceUpdate('unavailable').catch(() => {});
      // Message « connecté ✅ » (ou grande bienvenue la première fois), une fois par lancement — pas à chaque reconnexion réseau
      // Sur Render, le moteur redémarre souvent : un message à chaque démarrage arrive « en attente » sur le téléphone (le bot écrit juste après
      // sa reconnexion) et s'accumule. Donc seulement quand le numéro vient d'être lié (ou si MESSAGE_DEMARRAGE=oui).
      const hebergeur = authSupabase.mode === 'site' || !!process.env.RENDER;
      if (!etat.annonce && (!hebergeur || etat.nouvelleLiaison || String(process.env.MESSAGE_DEMARRAGE || '').toLowerCase() === 'oui')) {
        etat.annonce = true;
        setTimeout(async () => {
          await utilisateurPret;
          await etat.activationPrete;
          if (sock.enAttente) return; // en attente de « .start » : aucun message n'est envoyé
          for (let essai = 1; essai <= 3; essai++) {
            try {
              const r = await require('./contexte').executer(sock.reglagesSite, () => require('./bienvenue').envoyer(sock, require('./handler').liste.length));
              if (r) console.log(`📨 Message ${r === 'bienvenue' ? 'de bienvenue' : 'de démarrage'} envoyé à ${etat.numero}.`);
              return;
            } catch (e) {
              console.error(`[bienvenue] essai ${essai}/3 : ${e.message}`);
              await new Promise((ok) => setTimeout(ok, 4000));
            }
          }
        }, 10000); // laisse à WhatsApp le temps de synchroniser les appareils avant d'écrire
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
        etat.geler(); // l'autre processus a la session : on n'écrit plus rien (ni clés, ni vues uniques) pour ne pas écraser les siennes
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
    await etat.chargement; // la mémoire des commandes déjà traitées doit être relue avant le premier message
    await etat.activationPrete; // (et l'état d'activation connu)
    for (const m of messages) {
      if (m.key?.fromMe) etat.memoire.ajouter(m);
      try { etat.conserve?.noter(m); } catch {} // vues uniques / statuts : gardés AVANT tout filtre (même reçus pendant que le bot était arrêté)
    }
    if (type !== 'notify') {
      console.log(`[ignoré] ${messages.length} message(s) de type « ${type} » (historique, pas de nouveau message)`);
      return;
    }
    for (const msg of messages) {
      // Message que ce bot n'a pas pu déchiffrer (clés de chiffrement désynchronisées) : le journal le dit, au lieu d'un silence mystérieux
      if (!msg.message && msg.key && !msg.key.fromMe && !String(msg.key.remoteJid).endsWith('@newsletter')) {
        etat.illisibles = (etat.illisibles || 0) + 1;
        etat.suivi?.illisible();
        if (etat.illisibles <= 3 || etat.illisibles % 25 === 0)
          console.warn(`[illisible] message non déchiffré${secondaire ? ` (session ${id})` : ''} : ${etat.illisibles} depuis le démarrage (dernier : ${String(msg.key.remoteJid).split('@')[0]}, type ${msg.messageStubType ?? '?'}). ` +
            'Si le bot reste muet après un redéploiement : instance > Déconnecter, puis Connecter à nouveau avec un code.');
      }
      // Rejeu après un redémarrage : WhatsApp renvoie parfois des messages déjà traités (ou reçus pendant l'arrêt) → ignorés
      // Commande déjà traitée avant un redéploiement (le disque de Render est effacé, la session enregistrée, elle, est partagée)
      const cleVu = `${msg.key?.remoteJid}|${msg.key?.id}`;
      if (msg.key?.id && etat.conserve?.dejaVu(cleVu)) {
        console.log(`[ignoré] ancien message (déjà traité avant un redémarrage) : ${msg.key.id}`);
        continue;
      }
      const raison = anciens.verifier(id, msg, etat.debut);
      if (!raison && msg.key?.id && etat.conserve) {
        try {
          if (require('./utils').extraireTexte(msg.message).trim().startsWith(config.PREFIXE)) etat.conserve.noterVu(cleVu);
        } catch {}
      }
      if (raison) {
        console.log(`[ignoré] ancien message (${raison}) : ${msg.key?.id}`);
        continue;
      }
      try {
        await require('./contexte').executer(sock.reglagesSite, () => traiter(sock, msg));
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
    s.geler?.(); // la session est supprimée : plus aucune écriture ne doit la faire renaître (ni à l'arrêt, ni en tâche de fond)
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

// Arrêt propre (Render envoie SIGTERM à chaque redéploiement) : on ferme les connexions SANS déconnecter l'appareil, puis on attend que
// les dernières clés de chiffrement soient bien enregistrées. Sans cela elles sont perdues et des messages restent « en attente ».
let arretEnCours = null;
function arreter(delai = 8000) {
  if (arretEnCours) return arretEnCours;
  const toutes = [...sessions.values()];
  for (const s of toutes) {
    s.arret = true;
    try {
      s.sock?.end?.(undefined);
    } catch {}
  }
  const vidage = Promise.all(toutes.map((s) => Promise.resolve(s.sauverMedias?.()).catch(() => {}).then(() => s.viderAuth?.()).catch(() => {})));
  arretEnCours = Promise.race([vidage, new Promise((ok) => setTimeout(ok, delai))]).then(() => toutes.length);
  return arretEnCours;
}

// Au démarrage : session principale puis sessions secondaires enregistrées
async function demarrerTout() {
  // Sur Render, yt-dlp (téléchargement de musique et de vidéos) est réinstallé à chaque démarrage, sans attendre
  if (process.env.RENDER || String(process.env.YTDLP_AUTO || '').toLowerCase() === 'oui') require('./ytdlp').assurer();
  // Redéploiement Render : l'ancien programme tourne encore quelques secondes (il reçoit SIGTERM après le démarrage du nouveau).
  // Se connecter pendant ce temps ferait « reprendre » la session à l'un par l'autre et abîmerait les clés de chiffrement → on patiente un peu.
  const delai = process.env.DELAI_DEMARRAGE_S !== undefined ? Number(process.env.DELAI_DEMARRAGE_S) : process.env.RENDER ? 15 : 0;
  if (delai > 0) {
    console.log(`⏳ Attente de ${delai} s avant la connexion à WhatsApp (laisse l'ancienne version s'arrêter proprement).`);
    await new Promise((ok) => setTimeout(ok, delai * 1000));
  }
  // PRINCIPAL=non : le service ne sert que de moteur pour Kernel Connect (aucun bot principal, donc aucun code d'appairage dans les logs)
  // Mode site (moteur personnel) : jamais de bot principal non plus, le moteur ne sert que les instances de la plateforme
  if (authSupabase.mode === 'site') {
    const p = require('./auth_site').problemes();
    if (p.length) console.error('⚠️ Mode site mal configuré : ' + p.join(' ; '));
    else console.log('🔗 Mode site : ce moteur est relié à Kernel Connect (aucune clé de base de données ici).');
  }
  if (String(process.env.PRINCIPAL || '').toLowerCase() === 'non' || authSupabase.mode === 'site') console.log('ℹ️ Pas de bot principal : seules les instances de la plateforme sont lancées.');
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

module.exports = { gardienPresence, arreter, espacerEnvois, creerCacheTentatives, chargerUtilisateur, assainirNom, demarrerTout, connecter, deconnecter, liste, principale, sessions, lancer, retirerSession, connectee, surEvenement, typeFermeture, creerMemoire, MAX_SECONDAIRES };
