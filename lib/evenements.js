// Kernel Bot — événements WhatsApp : arrivées/départs, promotions, appels, messages supprimés
const config = require('../config');
const groupes = require('./groupes');
const reglages = require('./reglages');
const cache = require('./cache');
const corbeille = require('./corbeille');
const { numero } = require('./utils');

const idDe = (p) => (typeof p === 'string' ? p : p?.id || p?.jid || '');
const tag = (jid) => `@${numero(jid)}`;
const remplacer = (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

const TEXTES = {
  bienvenue: '👋 Bienvenue {nom} dans *{groupe}* ! Vous êtes maintenant {membres} membres.',
  aurevoir: '👋 {nom} a quitté *{groupe}*. À bientôt !',
};

// Anti-raid : trop de retraits ou de promotions en une minute par la même personne → le groupe est fermé et les administrateurs sont prévenus.
// Les actions du bot lui-même et des propriétaires du bot (par exemple « expulsertous ») ne comptent jamais.
const FENETRE_RAID = 60000;
const raids = new Map(); // groupe:auteur:type -> [horodatages, un par personne touchée]
const SEUIL_PAR_DEFAUT = { remove: 5, promote: 3 };
async function surveillerRaid(sock, jid, auteur, type, nb, meta, envoyer) {
  const c = groupes.sous(jid, 'antiraid');
  if (!c.actif) return false;
  const sup = (meta?.participants || []).find((p) => p.admin === 'superadmin');
  if (sup && groupes.idsDe(sup).includes(numero(auteur))) return false; // le créateur du groupe n'est pas un danger pour son groupe
  const seuil = type === 'promote' ? Math.min(c.seuil || SEUIL_PAR_DEFAUT.promote, SEUIL_PAR_DEFAUT.promote) : c.seuil || SEUIL_PAR_DEFAUT.remove;
  const cle = `${jid}:${numero(auteur)}:${type}`;
  const maintenant = Date.now();
  const l = (raids.get(cle) || []).filter((t) => t > maintenant - FENETRE_RAID);
  for (let i = 0; i < nb; i++) l.push(maintenant);
  raids.set(cle, l);
  if (raids.size > 200) raids.delete(raids.keys().next().value);
  if (l.length < seuil) return false;
  raids.delete(cle);
  try {
    await sock.groupSettingUpdate(jid, 'announcement');
  } catch (e) {
    console.error('[antiraid] fermeture impossible :', e.message);
  }
  await envoyer(
    `🚨 *Anti-raid* : ${tag(auteur)} a ${type === 'promote' ? 'nommé' : 'retiré'} ${l.length} membre(s) en moins d'une minute.\n` +
      `🔒 Le groupe est fermé par précaution (seuls les admins peuvent écrire). Un propriétaire du bot peut le rouvrir avec \`${config.PREFIXE}ouvrir\`.`,
    [auteur]
  ).catch(() => {});
  return true;
}

async function surParticipants(sock, ev) {
  const jid = ev.id;
  if (!jid) return;
  groupes.invalider(jid);
  const ids = (ev.participants || []).map(idDe).filter(Boolean);
  if (!ids.length) return;
  const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero);
  const auteur = ev.author || '';
  const auteurPrive = !auteur || moi.includes(numero(auteur)) || config.OWNERS.includes(numero(auteur));

  let meta = null;
  try {
    meta = await groupes.metadata(sock, jid, true);
  } catch {}
  const nomGroupe = meta?.subject || 'le groupe';
  const nb = meta?.participants?.length || '';

  const envoyer = (texte, mentions) => sock.sendMessage(jid, { text: texte, mentions });

  // Retirés par quelqu'un (pas partis d'eux-mêmes) : mis en corbeille 30 jours pour « reajouter »
  const deux = (ev.participants || []).filter((p) => idDe(p));
  if (ev.action === 'remove' && auteur && !ids.map(numero).includes(numero(auteur))) {
    try {
      corbeille.noter(
        jid,
        deux.map((p) => {
          const id = idDe(p);
          const tel = (typeof p === 'object' && p.phoneNumber) || (/@s\.whatsapp\.net$/.test(id) ? id : null);
          return { ids: [id, typeof p === 'object' ? p.lid : null, tel].filter(Boolean), jid: id, tel };
        }),
        numero(auteur)
      );
    } catch (e) {
      console.error('[corbeille]', e.message);
    }
  }
  if (ev.action === 'add') {
    try {
      corbeille.oter(jid, ids);
    } catch {}
  }
  if (!auteurPrive && (ev.action === 'remove' || ev.action === 'promote')) {
    await surveillerRaid(sock, jid, auteur, ev.action, ids.length, meta, envoyer).catch((e) => console.error('[antiraid]', e.message));
  }

  if (ev.action === 'add') {
    const c = groupes.sous(jid, 'bienvenue');
    if (c.actif) {
      const nom = ids.map(tag).join(' ');
      await envoyer(remplacer(c.message || TEXTES.bienvenue, { nom, groupe: nomGroupe, membres: nb, description: meta?.desc || '' }), ids);
    }
  } else if (ev.action === 'remove') {
    const c = groupes.sous(jid, 'aurevoir');
    if (c.actif) {
      const nom = ids.map(tag).join(' ');
      await envoyer(remplacer(c.message || TEXTES.aurevoir, { nom, groupe: nomGroupe, membres: nb }), ids);
    }
  } else if (ev.action === 'promote') {
    if (groupes.sous(jid, 'alertepromotion').actif) {
      await envoyer(`⬆️ ${ids.map(tag).join(' ')} est maintenant administrateur${auteur ? ` (par ${tag(auteur)})` : ''}.`, [...ids, auteur].filter(Boolean));
    }
    if (groupes.sous(jid, 'antipromotion').actif && !auteurPrive && !ids.every((i) => moi.includes(numero(i)))) {
      try {
        await sock.groupParticipantsUpdate(jid, ids, 'demote');
        await envoyer(`🛡️ Promotion annulée : seuls les propriétaires du bot peuvent nommer des administrateurs ici.`);
      } catch (e) {
        console.error('[antipromotion]', e.message);
      }
    }
  } else if (ev.action === 'demote') {
    if (groupes.sous(jid, 'alertedegradation').actif) {
      await envoyer(`⬇️ ${ids.map(tag).join(' ')} n'est plus administrateur${auteur ? ` (par ${tag(auteur)})` : ''}.`, [...ids, auteur].filter(Boolean));
    }
    if (groupes.sous(jid, 'antidegradation').actif && !auteurPrive) {
      try {
        await sock.groupParticipantsUpdate(jid, ids, 'promote');
        await envoyer(`🛡️ Rétrogradation annulée : seuls les propriétaires du bot peuvent retirer un administrateur ici.`);
      } catch (e) {
        console.error('[antidégradation]', e.message);
      }
    }
  }
}

async function surAppel(sock, appels) {
  const r = reglages.lire();
  if (!r.antiappel) return;
  for (const a of appels || []) {
    if (a.status !== 'offer') continue;
    if (config.OWNERS.includes(numero(a.from))) continue;
    try {
      await sock.rejectCall(a.id, a.from);
      await sock.sendMessage(a.chatId || a.from, { text: r.messageAppel });
    } catch (e) {
      console.error('[antiappel]', e.message);
    }
  }
}

// Message supprimé par son auteur : on le réaffiche selon le type de discussion (privé, groupe, statut) si l'antisuppression est activée pour ce type
async function surProtocole(sock, msg) {
  const p = msg.message.protocolMessage;
  if (!p || p.type !== 0 || !p.key?.id) return; // type 0 = REVOKE
  if (msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  const type = jid === 'status@broadcast' ? 'statuts' : jid.endsWith('@g.us') ? 'groupes' : 'prive';
  const r = reglages.lire();
  if (!reglages.antisuppressionEtat(r)[type]) return;
  const utils = require('./utils');
  const proprio = utils.proprietaires(sock)[0];
  const versProprio = proprio ? `${proprio}@s.whatsapp.net` : `${numero(sock.user?.id)}@s.whatsapp.net`;

  if (type === 'statuts') {
    // Un statut supprimé n'est jamais renvoyé « ici » : toujours au propriétaire
    const statuts = require('./statuts');
    const original = statuts.retrouver(p.key.id) || cache.lire(p.key.id);
    const auteur = original?.key?.participant || p.key.participant || msg.key.participant || msg.participant;
    if (original?.key?.fromMe) return;
    const legende = `🗑️ Statut supprimé par ${auteur ? '+' + numero(auteur) : 'un contact'}`;
    if (!original) return sock.sendMessage(versProprio, { text: `${legende} (je ne l'avais pas gardé en mémoire).` });
    const ok = await statuts.envoyerStatut(sock, original, versProprio, legende).catch(() => false);
    if (!ok) await sock.sendMessage(versProprio, { text: `${legende} (contenu impossible à récupérer).` });
    return;
  }

  const original = cache.lire(p.key.id);
  if (!original || original.key.fromMe) return;
  const auteur = original.key.participant || original.key.remoteJid;
  const vers = r.antisuppressionVers === 'proprio' ? versProprio : jid;
  const lieu = type === 'groupes' ? ' dans un groupe' : '';
  await sock.sendMessage(vers, { text: `🗑️ Message supprimé par ${tag(auteur)}${lieu} :`, mentions: [auteur] });
  await sock.sendMessage(vers, { forward: original });
}

function brancher(sock) {
  // Bot en attente de « .start » : aucune réaction automatique (bienvenue des groupes, anti-appel…)
  const actif = (f) => (...a) => (sock.enAttente ? undefined : f(...a));
  sock.ev.on('group-participants.update', actif((ev) => surParticipants(sock, ev).catch((e) => console.error('[groupe]', e.message))));
  sock.ev.on('groups.update', (maj) => (maj || []).forEach((g) => g.id && groupes.invalider(g.id)));
  sock.ev.on('call', actif((a) => surAppel(sock, a).catch((e) => console.error('[appel]', e.message))));
}

module.exports = { brancher, surParticipants, surAppel, surProtocole, surveillerRaid, TEXTES };
