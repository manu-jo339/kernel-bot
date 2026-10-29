// Kernel Bot — événements WhatsApp : arrivées/départs, promotions, appels, messages supprimés
const config = require('../config');
const groupes = require('./groupes');
const reglages = require('./reglages');
const cache = require('./cache');
const { numero } = require('./utils');

const idDe = (p) => (typeof p === 'string' ? p : p?.id || p?.jid || '');
const tag = (jid) => `@${numero(jid)}`;
const remplacer = (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

const TEXTES = {
  bienvenue: '👋 Bienvenue {nom} dans *{groupe}* ! Vous êtes maintenant {membres} membres.',
  aurevoir: '👋 {nom} a quitté *{groupe}*. À bientôt !',
};

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

// Message supprimé par son auteur : on le réaffiche si l'antisuppression est activée
async function surProtocole(sock, msg) {
  const p = msg.message.protocolMessage;
  if (!p || p.type !== 0 || !p.key?.id) return; // type 0 = REVOKE
  const r = reglages.lire();
  if (!r.antisuppression) return;
  if (msg.key.fromMe) return;
  const original = cache.lire(p.key.id);
  if (!original || original.key.fromMe) return;
  const jid = msg.key.remoteJid;
  const auteur = original.key.participant || original.key.remoteJid;
  const vers = r.antisuppressionVers === 'proprio' && config.OWNERS[0] ? `${config.OWNERS[0]}@s.whatsapp.net` : jid;
  const lieu = jid.endsWith('@g.us') ? ' dans un groupe' : '';
  await sock.sendMessage(vers, { text: `🗑️ Message supprimé par ${tag(auteur)}${lieu} :`, mentions: [auteur] });
  await sock.sendMessage(vers, { forward: original });
}

function brancher(sock) {
  sock.ev.on('group-participants.update', (ev) => surParticipants(sock, ev).catch((e) => console.error('[groupe]', e.message)));
  sock.ev.on('groups.update', (maj) => (maj || []).forEach((g) => g.id && groupes.invalider(g.id)));
  sock.ev.on('call', (a) => surAppel(sock, a).catch((e) => console.error('[appel]', e.message)));
}

module.exports = { brancher, surParticipants, surAppel, surProtocole, TEXTES };
