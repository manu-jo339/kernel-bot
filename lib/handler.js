// Kernel Bot — chargement des commandes et traitement des messages
const fs = require('fs');
const path = require('path');
const config = require('../config');
const groupes = require('./groupes');
const permissions = require('./permissions');
const hooks = require('./hooks');
const cache = require('./cache');
const store = require('./store');
const stats = require('./stats');
const reglages = require('./reglages');
const { extraireTexte, numero, contextInfo } = require('./utils');

// Moteur personnel (relié à Kernel Connect) : il n'appartient qu'à une personne, donc le numéro qu'elle connecte en est le propriétaire.
// Sur le moteur partagé de l'administrateur, au contraire, un titulaire de session supplémentaire n'a jamais ces droits.
const moteurPersonnel = () => require('./stockage').mode === 'site';

const commands = new Map(); // nom ou alias -> commande
const liste = []; // commandes uniques (pour le menu)

// Table de renommage (noms d'origine -> nos noms français) ; personnalisation.json peut en plus renommer (section « noms »)
let anciensNoms = {};
try {
  anciensNoms = require('./renommage.json');
} catch {}

function chargerCommandes() {
  commands.clear();
  liste.length = 0;
  const dossier = path.join(__dirname, '..', 'cmd');
  const desactivees = config.PERSO.commandesDesactivees;
  const noms = config.PERSO.noms || {};
  for (const fichier of fs.readdirSync(dossier)) {
    if (!fichier.endsWith('.js') || fichier.startsWith('_')) continue;
    const chemin = path.join(dossier, fichier);
    try {
      delete require.cache[require.resolve(chemin)];
      const defs = require(chemin);
      for (const cmd of [].concat(defs)) {
        if (!cmd || !cmd.name || typeof cmd.run !== 'function') continue;
        const aliases = new Set((cmd.aliases || []).map((a) => a.toLowerCase()));
        let nom = cmd.name.toLowerCase();
        const garderAnciens = require('./nomsanciens')();
        let rang = 0;
        for (const choix of [anciensNoms[nom], noms[anciensNoms[nom] || nom], noms[nom]]) {
          if (choix && choix.toLowerCase() !== nom) {
            if (garderAnciens || rang > 0) aliases.add(nom); // l'ancien nom (OVL) n'est gardé que sur demande ; le nom avant un renommage personnel reste valable
            nom = choix.toLowerCase();
          }
          rang += 1;
        }
        aliases.delete(nom);
        cmd.name = nom;
        cmd.aliases = [...aliases];
        if (desactivees.includes(nom) || cmd.aliases.some((a) => desactivees.includes(a))) continue;
        cmd.categorie = cmd.categorie || 'Divers';
        liste.push(cmd);
        for (const n of [nom, ...cmd.aliases]) {
          if (commands.has(n) && commands.get(n) !== cmd) console.warn(`[cmd] « ${n} » est utilisé par deux commandes (${commands.get(n).name} et ${nom}).`);
          commands.set(n, cmd);
        }
      }
    } catch (e) {
      console.error(`[cmd] Erreur de chargement de ${fichier} :`, e.message);
    }
  }
  // Anciens noms (OVL), seulement si ANCIENS_NOMS=oui : chacun mène alors à sa commande française
  if (require('./nomsanciens')()) for (const [ancien, nouveau] of Object.entries(anciensNoms)) {
    const cmd = commands.get(nouveau.toLowerCase());
    const a = ancien.toLowerCase();
    if (cmd && !commands.has(a) && !desactivees.includes(a)) {
      cmd.aliases.push(a);
      commands.set(a, cmd);
    }
  }
  console.log(`[cmd] ${liste.length} commandes chargées.`);
}

async function traiter(sock, msg) {
  if (!msg?.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@newsletter')) return;

  // Statuts WhatsApp : lecture, « j'aime » et téléchargement automatiques (réglages du propriétaire)
  if (jid === 'status@broadcast') {
    try {
      await require('./statuts').surStatut(sock, msg);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') console.error('[statut]', e.message);
    }
    return;
  }

  // Un message supprimé par son auteur arrive comme un « message de protocole »
  if (msg.message.protocolMessage) {
    try {
      await require('./evenements').surProtocole(sock, msg);
    } catch (e) {
      console.error('[protocole]', e.message);
    }
    return;
  }

  const isGroup = jid.endsWith('@g.us');
  const texte = extraireTexte(msg.message).trim();
  cache.ajouter(msg);

  // Identification de l'expéditeur (plusieurs champs possibles selon la version de WhatsApp)
  const candidats = [
    msg.key.participant,
    msg.key.participantAlt,
    msg.key.participantPn,
    msg.key.remoteJidAlt,
    isGroup ? null : msg.key.remoteJid,
  ].filter(Boolean);
  const sender = msg.key.fromMe ? sock.user.id : candidats[0] || jid;
  const senderNum = numero(sender);
  // Sur une session supplémentaire d'un moteur partagé, le titulaire du numéro n'est PAS propriétaire du bot (seuls les numéros de NUMERO_OWNER le sont) ;
  // sur un moteur personnel (mode site), le numéro connecté est le propriétaire
  // Message écrit depuis le numéro de la session elle-même (ex : « moi-même » sous un identifiant masqué @lid) : le numéro vient de la session, pas du message
  // Session principale ou moteur personnel : un message venant du numéro de la session elle-même (ou de son identifiant masqué @lid) est celui du propriétaire,
  // même si WhatsApp ne l'a pas marqué « envoyé par moi » (ex : conversation avec soi-même)
  const moiMeme = !sock.secondaire || moteurPersonnel() ? [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero) : [];
  const estMoi = moiMeme.length > 0 && (moiMeme.includes(senderNum) || candidats.some((c) => moiMeme.includes(numero(c))));
  const isOwner = estMoi || (!!msg.key.fromMe && (!sock.secondaire || moteurPersonnel())) || candidats.some((c) => config.OWNERS.includes(numero(c))) || (!!msg.key.fromMe && config.OWNERS.includes(senderNum));
  // Titulaire d'une session supplémentaire : il utilise SON bot même en mode privé, mais jamais les commandes réservées au propriétaire
  const titulaire = !!msg.key.fromMe && !!sock.secondaire;

  if (!isOwner) {
    if (candidats.some((c) => permissions.estBanni(c))) return;
    if (isGroup && permissions.groupeBanni(jid)) return;
  }

  // Journal local (visible seulement dans ta fenêtre noire) : aide à comprendre pourquoi une commande n'obtient pas de réponse
  if (texte.startsWith(config.PREFIXE)) {
    console.log(`[reçu] ${isGroup ? 'groupe' : 'privé'} | de=${senderNum} | propriétaire=${isOwner ? 'oui' : 'NON'} | mode=${config.MODE} | « ${texte.slice(0, 40).replace(/\s+/g, ' ')} »`);
  }
  const ctx = { sock, msg, jid, isGroup, texte, sender, senderNum, isOwner, candidats, config };
  if (await hooks.executer(ctx)) return;

  // Un sticker lié à une commande (voir « liersticker ») déclenche cette commande
  let texteEff = texte;
  const st = msg.message.stickerMessage;
  if (!texteEff && st?.fileSha256) {
    const lie = store.get('stickercmd', Buffer.from(st.fileSha256).toString('base64'));
    if (lie?.cmd) texteEff = config.PREFIXE + lie.cmd;
  }

  const premium = permissions.estPremium(senderNum);

  // Message qui n'est pas une commande : chatbot (s'il est activé)
  if (!texteEff.startsWith(config.PREFIXE)) {
    if (config.MODE === 'private' && !isOwner && !titulaire) return; // mode privé : silence total pour les autres
    try {
      await require('./chatbot').surMessage({ sock, msg, jid, isGroup, texte, sender, isOwner, candidats });
    } catch (e) {
      console.error('[chatbot]', e.message);
    }
    return;
  }

  const corps = texteEff.slice(config.PREFIXE.length).trim();
  if (!corps) return;
  const [nomBrut, ...args] = corps.split(/\s+/);
  const cmd = commands.get(nomBrut.toLowerCase());
  if (!cmd) {
    console.log(`[ignoré] commande inconnue : ${nomBrut}`);
    return;
  }

  // reply(texte) : répond en citant ; les « @numéro » qui désignent l'expéditeur, une personne mentionnée ou citée deviennent de vraies mentions
  const ci = contextInfo(msg);
  const connus = [...new Set([sender, ...candidats, ...(ci.mentionedJid || []), ci.participant].filter(Boolean))];
  const reply = (t, mentions) => {
    const m = mentions || connus.filter((j) => String(t).includes('@' + numero(j)));
    return sock.sendMessage(jid, { text: t, ...(m.length ? { mentions: m } : {}) }, { quoted: msg });
  };

  // Administrateur de la plateforme (le développeur) : seul à pouvoir utiliser « diagnostic », sur n'importe quel bot
  const admin = candidats.some((c) => config.ADMINS.includes(numero(c))) || config.ADMINS.includes(senderNum) || (!!msg.key.fromMe && config.ADMINS.includes(numero(sock.user?.id)));
  const refus = permissions.verifier(cmd, { isOwner, senderNum, mode: config.MODE, titulaire, admin });
  if (refus === 'admin') return reply('🔒 Cette commande est réservée à l’administrateur de la plateforme (le développeur de Kernel Bot).');
  if (refus === 'serveur') return reply('🔒 Cette commande agit sur le serveur partagé de ce bot, pas sur ton compte. Pour l’avoir, déploie ton propre moteur sur Kernel Connect : tu auras alors toutes les commandes.');
  if (refus === 'proprietaire') return reply(config.PERSO.messages.reserveProprietaire);
  if (refus === 'prive') {
    console.log(`[ignoré] mode privé : ${senderNum} n'est pas propriétaire. NUMERO_OWNER attendu : ${config.OWNERS.join(', ') || '(vide !)'}`);
    return;
  }
  if (refus === 'premium') return reply('⭐ Cette commande est réservée aux utilisateurs premium.');

  let metadata = null;
  let isAdmin = false;
  let botAdmin = false;
  const reglagesGroupe = isGroup ? groupes.reglages(jid) : {};
  if (isGroup && (cmd.groupOnly || cmd.adminOnly || cmd.botAdmin || cmd.metaSiGroupe || reglagesGroupe.adminsSeulement)) {
    try {
      metadata = await groupes.metadata(sock, jid);
      isAdmin = groupes.estAdmin(metadata, [...candidats, sender]);
      botAdmin = groupes.botEstAdmin(sock, metadata);
    } catch (e) {
      console.error('[groupe] métadonnées indisponibles :', e.message);
    }
  }

  // Mode « admins seulement » du groupe : le bot ignore les autres
  if (reglagesGroupe.adminsSeulement && !(isAdmin || isOwner || titulaire || premium)) return;

  if (cmd.groupOnly && !isGroup) return reply(config.PERSO.messages.reserveGroupe);
  if (cmd.adminOnly && !(isAdmin || isOwner || titulaire)) return reply(config.PERSO.messages.reserveAdmin);
  if (cmd.botAdmin && !botAdmin) return reply('🤖 Je dois être administrateur du groupe pour faire cela.');

  try {
    stats.compter(cmd.name, senderNum, isGroup ? jid : null);
  } catch {}

  // Réaction sur le message de l'utilisateur : il voit tout de suite que la commande est prise en compte (⏳ → ✅ ou ❌)
  const reagir = (emoji) => {
    if (reglages.lire().reactionCommande === false) return;
    sock.sendMessage(jid, { react: { text: emoji, key: msg.key } }).catch(() => {});
  };
  reagir(config.PERSO.emojis.reactionCommande || '⏳');

  try {
    await cmd.run({
      sock, msg, jid, args, texte: texteEff, sender, senderNum, isGroup, isOwner: isOwner || titulaire, isAdmin, botAdmin,
      isPremium: premium, metadata, reply, config, liste, candidats, nomUtilise: nomBrut.toLowerCase(),
    });
    reagir('✅');
  } catch (e) {
    console.error(`[cmd:${cmd.name}]`, e);
    reagir('❌');
    const sansCle = /media key|not a media message/i.test(String(e?.message || ''));
    reply(sansCle
      ? '⚠️ Je n’ai plus accès à ce média : il a déjà été ouvert, ou il est arrivé avant le dernier démarrage du bot. Demande qu’on te le renvoie, puis réponds-y *tout de suite* avec la commande.'
      : config.PERSO.messages.erreur).catch(() => {});
  }
}

module.exports = { chargerCommandes, traiter, liste, commands };
