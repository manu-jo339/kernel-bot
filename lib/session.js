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

const logger = pino({ level: 'silent' });
const RACINE = path.join(__dirname, '..');
const sessions = new Map(); // id -> { id, sock, numero, secondaire, essais, arret }
const MAX_SECONDAIRES = Math.max(0, parseInt(process.env.MAX_SESSIONS || '3', 10) || 0);

const dossierDe = (id) => (id === 'principal' ? path.join(RACINE, 'auth') : path.join(RACINE, 'sessions', id));
const principale = () => sessions.get('principal')?.sock || null;
const connectee = (s) => !!s?.sock?.user && s.ouverte;

async function lancer({ id, numero, onCode }) {
  const secondaire = id !== 'principal';
  const etat = sessions.get(id) || { id, essais: 0, arret: false, numero };
  sessions.set(id, etat);
  etat.arret = false;
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
  });
  sock.secondaire = secondaire; // une session secondaire n'a jamais les droits de propriétaire du bot
  sock.sessionId = id;
  etat.sock = sock;
  etat.ouverte = false;

  sock.ev.on('creds.update', saveCreds);
  evenements.brancher(sock);

  // Première connexion : code d'appairage (pas de QR code)
  if (!sock.authState.creds.registered) {
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

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      etat.essais = 0;
      etat.ouverte = true;
      etat.numero = (sock.user?.id || '').split(':')[0].split('@')[0];
      // Le bot se déclare « hors ligne » : ton téléphone continue de sonner normalement (jamais de notifications bloquées)
      sock.sendPresenceUpdate('unavailable').catch(() => {});
      // Message « connecté ✅ » (ou grande bienvenue la première fois), une fois par lancement — pas à chaque reconnexion réseau
      if (!etat.annonce) {
        etat.annonce = true;
        setTimeout(async () => {
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
    } else if (connection === 'close') {
      etat.ouverte = false;
      if (etat.arret) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
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
      etat.essais += 1;
      const attente = Math.min(5000 * etat.essais, 30000);
      console.log(`⚠️ Connexion perdue${secondaire ? ` (session ${id})` : ''} (code ${code ?? '?'}). Nouvelle tentative dans ${attente / 1000} s…`);
      setTimeout(() => lancer({ id, numero }).catch((e) => console.error('[session]', e.message)), attente);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
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
  if (authSupabase.actif()) authSupabase.supprimerSession(id).catch(() => {});
  try {
    fs.rmSync(dossierDe(id), { recursive: true, force: true });
  } catch (e) {
    console.error('[session] suppression du dossier impossible :', e.message);
  }
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
  await lancer({ id: 'principal', numero: config.NUMERO_BOT });
  for (const { id } of store.liste('sessions')) {
    if (!fs.existsSync(dossierDe(id))) {
      store.del('sessions', id);
      continue;
    }
    lancer({ id, numero: id }).catch((e) => console.error(`[session ${id}]`, e.message));
  }
}

module.exports = { demarrerTout, connecter, deconnecter, liste, principale, sessions };
