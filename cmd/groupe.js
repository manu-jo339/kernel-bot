// Commandes de groupe — MWENOBANGUE Labs
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { numero, pause, messageCite, extraireTexte, cibles, numeroDe, parseDuree, formatDuree, dateLocale } = require('../lib/utils');
const groupes = require('../lib/groupes');
const corbeille = require('../lib/corbeille');
const jobs = require('../lib/jobs');

const estAdmin = (p) => p.admin === 'admin' || p.admin === 'superadmin';
const mention = (jid) => `@${numero(jid)}`;
const base = { categorie: 'Groupe', groupOnly: true };
const idsP = (p) => groupes.idsDe(p);
const MOT_ADMINS = /^admins?$/i;
const MOT_OUI = /^(oui|yes)$/i;
const pauseLot = () => (process.env.PAUSE_LOTS_MS !== undefined ? Number(process.env.PAUSE_LOTS_MS) : 1500);

// Personnes qu'aucune commande d'exclusion ne touche : le bot lui-même, les propriétaires du bot, le créateur du groupe (« superadmin ») et celui qui lance la commande
function estProtege(p, sock, config, sender) {
  const moi = [sock.user?.id, sock.user?.lid, sender].filter(Boolean).map(numero);
  return (
    p.admin === 'superadmin' ||
    idsP(p).some((x) => moi.includes(x)) ||
    !!(numeroDe(p) && config.OWNERS.includes(numeroDe(p)))
  );
}

// Membres que le bot peut exclure. Par défaut : jamais les admins. Avec { admins: true } (propriétaire du bot seulement) : les admins aussi, sauf les personnes protégées.
function exclusPossibles(metadata, sock, config, { admins = false, sender } = {}) {
  return metadata.participants.filter((p) => !estProtege(p, sock, config, sender) && (admins || !estAdmin(p)));
}

// Retire les membres par lots de 5 avec une pause ; avec { demoter: true }, les admins sont d'abord rétrogradés. Renvoie les membres réellement retirés (mis en corbeille).
async function retirerParLots(sock, jid, membres, { demoter = false, par = '' } = {}) {
  const reussis = (res, lot) => (Array.isArray(res) ? lot.filter((p) => res.some((r) => String(r.status) === '200' && (idsP(p).includes(numero(r.jid)) || r.jid === p.id))) : lot);
  if (demoter) {
    const admins = membres.filter(estAdmin);
    for (let i = 0; i < admins.length; i += 5) {
      try {
        await sock.groupParticipantsUpdate(jid, admins.slice(i, i + 5).map((p) => p.id), 'demote');
      } catch (e) {
        console.error('[kick] rétrogradation refusée :', e.message);
      }
      await pause(pauseLot());
    }
  }
  const retires = [];
  for (let i = 0; i < membres.length; i += 5) {
    const lot = membres.slice(i, i + 5);
    try {
      const res = await sock.groupParticipantsUpdate(jid, lot.map((p) => p.id), 'remove');
      retires.push(...reussis(res, lot));
    } catch (e) {
      console.error('[kick] lot refusé :', e.message);
    }
    await pause(pauseLot());
  }
  try {
    corbeille.noter(jid, retires.map((p) => ({ ids: [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean), jid: p.id, tel: numeroDe(p) })), par);
  } catch (e) {
    console.error('[corbeille]', e.message);
  }
  return retires;
}
const MSG_ADMINS_PROPRIO = '🔒 L’option *admins* est réservée au propriétaire du bot (elle retire aussi des administrateurs).';
const RAPPEL_REAJOUTER = (P) => `\n↩️ Un regret ? \`${P}reajouter\` permet de les remettre (corbeille de 30 jours).`;

// ───── Réajout : un membre à la fois, avec de longues pauses, pour ne pas risquer le numéro du bot ─────
const MAX_REAJOUT = 25;
const enReajout = new Set();
const pauseReajout = () => (process.env.REAJOUTER_PAUSE_MS !== undefined ? Number(process.env.REAJOUTER_PAUSE_MS) : 6000 + Math.floor(Math.random() * 6000));
const quand = (ts) => `retiré il y a ${formatDuree(Date.now() - ts)}`;

async function remettre(sock, jid, entrees, reply, nomGroupe) {
  if (enReajout.has(jid)) return reply('⏳ Un réajout est déjà en cours dans ce groupe. Patiente jusqu’à son résumé.');
  enReajout.add(jid);
  try {
    const part = entrees.slice(0, MAX_REAJOUT);
    await reply(`⏳ Réajout de ${part.length} membre(s)${entrees.length > part.length ? ` sur ${entrees.length}` : ''}, un par un avec des pauses. Je te fais un résumé à la fin.`);
    const res = { ok: [], lien: [], deja: [], echec: [] };
    let code = null;
    for (let i = 0; i < part.length; i++) {
      const e = part[i];
      const nom = '+' + (e.tel || numero(e.jid));
      let st;
      try {
        const r = await sock.groupParticipantsUpdate(jid, [e.jid], 'add');
        st = String(Array.isArray(r) ? r[0]?.status ?? '200' : '200');
      } catch (err) {
        st = /forbidden|not-authorized|403/i.test(String(err?.message)) ? '403' : 'erreur';
      }
      if (st === '200') res.ok.push(nom);
      else if (st === '409') res.deja.push(nom);
      else if (['403', '408', '401'].includes(st)) {
        // Ses paramètres de confidentialité (ou son départ récent) empêchent l'ajout : on lui envoie le lien d'invitation en privé
        try {
          code = code || (await sock.groupInviteCode(jid));
          await sock.sendMessage(e.jid, { text: `👋 Tu as été retiré(e) du groupe *${nomGroupe}*. Si tu veux y revenir, voici le lien d’invitation :\nhttps://chat.whatsapp.com/${code}` });
          res.lien.push(nom);
        } catch (err) {
          res.echec.push(nom);
        }
      } else res.echec.push(nom);
      if (!res.echec.includes(nom)) corbeille.oter(jid, e.ids);
      if (i < part.length - 1) await pause(pauseReajout());
    }
    const restants = entrees.length - part.length;
    await reply(
      `✅ *Réajout terminé*\n` +
        `• Remis dans le groupe : ${res.ok.length}\n` +
        (res.lien.length ? `• Lien d’invitation envoyé en privé (ajout refusé par leurs paramètres) : ${res.lien.length}\n` : '') +
        (res.deja.length ? `• Déjà dans le groupe : ${res.deja.length}\n` : '') +
        (res.echec.length ? `• Échec : ${res.echec.length} (${res.echec.slice(0, 8).join(', ')}${res.echec.length > 8 ? '…' : ''})\n` : '') +
        (restants > 0 ? `\n⏸️ Il en reste *${restants}* dans la corbeille. Relance \`reajouter oui\` dans quelques heures, pas avant : trop d’ajouts rapprochés peuvent faire bloquer ton numéro.` : '')
    );
  } finally {
    enReajout.delete(jid);
  }
}

// Mention de masse : un en-tête clair (qui appelle, dans quel groupe, combien de personnes), le message, puis la liste
const BARRE = '━━━━━━━━━━━━━━━━';
async function appelGroupe({ sock, jid, msg, args, metadata, reply, sender, candidats }, participants, { titre, icone, libelle }) {
  if (!metadata || !participants) return reply('⚠️ Impossible de lire les membres du groupe.');
  const ids = participants.map((p) => p.id);
  const cite = messageCite(msg);
  const message = (args.join(' ') || (cite ? extraireTexte(cite.message) : '')).trim();
  const moi = metadata.participants.map((p) => p.id).find((id) => [sender, ...(candidats || [])].filter(Boolean).includes(id)) || sender;
  const entete = [`${icone} *${titre}*`, BARRE];
  if (message) entete.push(`💬 *${message}*`, '');
  entete.push(`🏷️ Groupe : ${metadata.subject || '—'}`);
  if (moi) entete.push(`👤 Par : ${mention(moi)}`);
  entete.push(`👥 ${libelle} : ${ids.length}`, BARRE);
  const liste = ids.map((m) => `▸ ${mention(m)}`).join('\n');
  const mentions = moi && !ids.includes(moi) ? [...ids, moi] : ids;
  await sock.sendMessage(jid, { text: `${entete.join('\n')}\n${liste}\n${BARRE}`, mentions });
}

module.exports = [
  // ───────────── Mentions ─────────────
  {
    ...base,
    name: 'tagall',
    aliases: ['tous'],
    desc: 'Mentionne tous les membres',
    adminOnly: true,
    run: async (ctx) => appelGroupe(ctx, ctx.metadata && ctx.metadata.participants, { titre: 'APPEL GÉNÉRAL', icone: '📣', libelle: 'Membres' }),
  },
  {
    ...base,
    name: 'tagadmin',
    aliases: ['admins'],
    desc: 'Mentionne tous les administrateurs',
    run: async (ctx) => appelGroupe(ctx, ctx.metadata && ctx.metadata.participants.filter(estAdmin), { titre: 'APPEL AUX ADMINISTRATEURS', icone: '🛡️', libelle: 'Administrateurs' }),
  },
  {
    ...base,
    name: 'tag',
    aliases: ['htag', 'hidetag'],
    desc: 'Envoie un message en notifiant tout le monde (sans liste)',
    adminOnly: true,
    run: async ({ sock, jid, args, metadata, msg, reply }) => {
      if (!metadata) return reply('⚠️ Impossible de lire les membres du groupe.');
      const membres = metadata.participants.map((p) => p.id);
      const cite = messageCite(msg);
      const texte = args.join(' ') || cite?.message?.conversation || cite?.message?.extendedTextMessage?.text;
      if (!texte) return reply('✏️ Écris un message : `.prevenir ton message` (ou réponds à un message).');
      await sock.sendMessage(jid, { text: texte, mentions: membres });
    },
  },

  // ───────────── Sondages ─────────────
  {
    ...base,
    name: 'poll',
    desc: 'Sondage à choix multiples — .sondage Question | choix 1 | choix 2',
    adminOnly: true,
    run: async ({ sock, jid, texte, config, reply }) => {
      const parts = texte.slice(config.PREFIXE.length).replace(/^\S+\s*/, '').split('|').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 3) return reply('📊 Format : `.sondage Question | choix 1 | choix 2 | …`');
      const [question, ...choix] = parts;
      await sock.sendMessage(jid, { poll: { name: question, values: choix.slice(0, 12), selectableCount: choix.length } });
    },
  },
  {
    ...base,
    name: 'poll2',
    desc: 'Sondage à vote unique — .sondageunique Question | choix 1 | choix 2',
    adminOnly: true,
    run: async ({ sock, jid, texte, config, reply }) => {
      const parts = texte.slice(config.PREFIXE.length).replace(/^\S+\s*/, '').split('|').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 3) return reply('📊 Format : `.sondageunique Question | choix 1 | choix 2 | …`');
      const [question, ...choix] = parts;
      await sock.sendMessage(jid, { poll: { name: question, values: choix.slice(0, 12), selectableCount: 1 } });
    },
  },

  // ───────────── Gestion des membres ─────────────
  {
    ...base,
    name: 'kick',
    aliases: ['exclure'],
    desc: 'Exclut un membre (mention, réponse ou numéro) — option : admins',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, args, metadata, reply, config, isOwner, sender, senderNum }) => {
      const veutAdmins = args.some((a) => MOT_ADMINS.test(a));
      const confirme = args.some((a) => MOT_OUI.test(a));
      if (veutAdmins && !isOwner) return reply(MSG_ADMINS_PROPRIO);
      const cs = cibles(msg, args, metadata);
      if (!cs.length) return reply('👤 Mentionne un membre, réponds à son message ou écris son numéro.');
      const trouve = (c) => metadata.participants.find((p) => idsP(p).includes(numero(c))) || { id: c };
      const visees = [];
      let epargnes = 0;
      for (const c of cs) {
        const p = trouve(c);
        // Sans l'option « admins », un administrateur n'est jamais exclu ; avec elle, seuls le créateur du groupe, le bot, les propriétaires et toi-même sont épargnés
        const protege = veutAdmins ? estProtege(p, sock, config, sender) : estAdmin(p);
        if (protege) epargnes++;
        else visees.push(p);
      }
      if (!visees.length)
        return reply(veutAdmins ? '🛡️ Impossible : le créateur du groupe, le bot, les propriétaires du bot et toi-même ne peuvent pas être exclus.' : `🛡️ Impossible d’exclure un administrateur.${isOwner ? ` (Propriétaire du bot : ajoute \`admins\` pour retirer aussi un admin.)` : ''}`);
      const admins = visees.filter(estAdmin);
      if (admins.length && !confirme)
        return reply(`⚠️ ${admins.length} administrateur(s) seront *rétrogradés puis exclus*.\nPour confirmer, renvoie la même commande avec \`oui\` à la fin.`);
      const retires = await retirerParLots(sock, jid, visees, { demoter: veutAdmins, par: senderNum });
      await reply(`✅ ${retires.length} membre(s) exclu(s).${epargnes ? ` ${epargnes} épargné(s) (protégés).` : ''}${retires.length ? RAPPEL_REAJOUTER(config.PREFIXE) : ''}`);
    },
  },
  {
    ...base,
    name: 'kickall',
    desc: 'Exclut tous les non-admins — à confirmer avec : .expulsertous oui (option : admins)',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, metadata, reply, config, isOwner, sender, senderNum }) => {
      const P = config.PREFIXE;
      const veutAdmins = args.some((a) => MOT_ADMINS.test(a));
      const confirme = args.some((a) => MOT_OUI.test(a));
      if (veutAdmins && !isOwner) return reply(MSG_ADMINS_PROPRIO);
      const visees = exclusPossibles(metadata, sock, config, { admins: veutAdmins, sender });
      const nbAdmins = visees.filter(estAdmin).length;
      if (!confirme)
        return reply(
          veutAdmins
            ? `⚠️ Cette commande exclura *${visees.length}* membres, dont *${nbAdmins} administrateur(s)* (rétrogradés d’abord). Sont épargnés : le créateur du groupe, le bot, les propriétaires du bot et toi.\nPour confirmer : \`${P}expulsertous oui admins${nbAdmins ? ' ' + nbAdmins : ''}\``
            : `⚠️ Cette commande exclura *${visees.length}* membres (tous sauf les admins).\nPour confirmer : \`${P}expulsertous oui\`${isOwner ? `\n(Propriétaire du bot : \`${P}expulsertous admins\` pour inclure aussi les administrateurs.)` : ''}`
        );
      // Confirmation renforcée quand des administrateurs sont visés : il faut redire leur nombre
      if (veutAdmins && nbAdmins > 0 && !args.includes(String(nbAdmins)))
        return reply(`🛑 Il y a *${nbAdmins} administrateur(s)* parmi les ${visees.length} membres visés. Pour confirmer en connaissance de cause, écris le nombre d’admins à la fin :\n\`${P}expulsertous oui admins ${nbAdmins}\``);
      await reply(`⏳ Exclusion de ${visees.length} membres en cours…`);
      const retires = await retirerParLots(sock, jid, visees, { demoter: veutAdmins, par: senderNum });
      await reply(`✅ ${retires.length} membre(s) exclu(s).${retires.length ? RAPPEL_REAJOUTER(P) : ''}`);
    },
  },
  {
    ...base,
    name: 'ckick',
    desc: 'Exclut les membres d’un indicatif — .expulserpays 242 oui (option : admins)',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, metadata, reply, config, isOwner, sender, senderNum }) => {
      const P = config.PREFIXE;
      const indicatif = (args[0] || '').replace(/\D/g, '');
      if (!indicatif) return reply(`🌍 Format : \`${P}expulserpays 242\` (indicatif du pays), puis ajoute \`oui\` pour confirmer.`);
      const reste = args.slice(1);
      const veutAdmins = reste.some((a) => MOT_ADMINS.test(a));
      const confirme = reste.some((a) => MOT_OUI.test(a));
      if (veutAdmins && !isOwner) return reply(MSG_ADMINS_PROPRIO);
      const visees = exclusPossibles(metadata, sock, config, { admins: veutAdmins, sender }).filter((p) => (numeroDe(p) || '').startsWith(indicatif));
      const nbAdmins = visees.filter(estAdmin).length;
      const optAdmins = veutAdmins ? ' admins' : '';
      if (!confirme)
        return reply(`⚠️ ${visees.length} membre(s) avec l’indicatif +${indicatif} seraient exclus${veutAdmins ? `, dont ${nbAdmins} administrateur(s)` : ''}.\nPour confirmer : \`${P}expulserpays ${indicatif} oui${optAdmins}${veutAdmins && nbAdmins ? ' ' + nbAdmins : ''}\``);
      if (veutAdmins && nbAdmins > 0 && !reste.includes(String(nbAdmins)))
        return reply(`🛑 ${nbAdmins} administrateur(s) sont visés. Pour confirmer, écris leur nombre à la fin :\n\`${P}expulserpays ${indicatif} oui admins ${nbAdmins}\``);
      const retires = await retirerParLots(sock, jid, visees, { demoter: veutAdmins, par: String(senderNum || '') });
      await reply(`✅ ${retires.length} membre(s) exclu(s).${retires.length ? RAPPEL_REAJOUTER(P) : ''}`);
    },
  },
  {
    ...base,
    name: 'reajouter',
    aliases: ['restaurer', 'readd', 'corbeille'],
    desc: 'Remet les membres retirés ces 30 derniers jours — .reajouter, puis .reajouter oui',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, reply, config }) => {
      const P = config.PREFIXE;
      const a = (args[0] || '').toLowerCase();
      const meta = await groupes.metadata(sock, jid, true);
      const dedans = new Set(meta.participants.flatMap(idsP));
      const bac = corbeille.lire(jid).filter((e) => !e.ids.some((n) => dedans.has(n))).sort((x, y) => y.ts - x.ts);
      if (a === 'vider') {
        corbeille.vider(jid);
        return reply('🗑️ Corbeille de ce groupe vidée.');
      }
      const chiffres = a.replace(/\D/g, '');
      if (chiffres.length >= 6) {
        const e = bac.find((x) => x.ids.includes(chiffres)) || { ids: [chiffres], jid: `${chiffres}@s.whatsapp.net`, tel: chiffres, ts: Date.now() };
        if (dedans.has(chiffres)) return reply('ℹ️ Cette personne est déjà dans le groupe.');
        return remettre(sock, jid, [e], reply, meta.subject);
      }
      if (!bac.length)
        return reply('🗑️ La corbeille est vide : personne n’a été retiré de ce groupe ces 30 derniers jours (seuls comptent ceux que j’ai exclus ou que d’autres admins ont retirés, pas ceux qui sont partis d’eux-mêmes).\nPour remettre un numéro précis : `' + P + 'reajouter 242XXXXXXXXX`');
      if (a !== 'oui' && a !== 'tous') {
        const minutes = Math.ceil((Math.min(bac.length, MAX_REAJOUT) * 9) / 60);
        return reply(
          `🗑️ *Corbeille de ${meta.subject}* : ${bac.length} membre(s) retiré(s) ces 30 derniers jours\n\n` +
            bac.slice(0, 15).map((e) => `• +${e.tel || numero(e.jid)} — ${quand(e.ts)}`).join('\n') +
            (bac.length > 15 ? `\n… et ${bac.length - 15} autre(s)` : '') +
            `\n\n⚠️ Remettre beaucoup de monde d’un coup peut faire *bannir le numéro du bot*. Je les remets donc *un par un*, avec des pauses, ${MAX_REAJOUT} au maximum par commande (≈ ${minutes} min pour ${Math.min(bac.length, MAX_REAJOUT)}). ` +
            `Ceux dont les paramètres de confidentialité refusent l’ajout reçoivent le lien d’invitation en privé.\n\n` +
            `Pour lancer : \`${P}reajouter oui\`\nUn seul numéro : \`${P}reajouter 242XXXXXXXXX\`\nVider la corbeille : \`${P}reajouter vider\``
        );
      }
      return remettre(sock, jid, bac, reply, meta.subject);
    },
  },
  {
    ...base,
    name: 'promote',
    aliases: ['promouvoir'],
    desc: 'Nomme un membre administrateur',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, args, metadata, reply }) => {
      const cs = cibles(msg, args, metadata);
      if (!cs.length) return reply('👤 Mentionne un membre, réponds à son message ou écris son numéro.');
      await sock.groupParticipantsUpdate(jid, cs, 'promote');
      await reply('✅ Promotion effectuée.');
    },
  },
  {
    ...base,
    name: 'moiadmin',
    aliases: ['autoadmin'],
    desc: 'Te nomme administrateur du groupe (propriétaire du bot, le bot doit être admin)',
    ownerOnly: true,
    strict: true,
    botAdmin: true,
    run: async ({ sock, jid, metadata, reply, sender, candidats }) => {
      const nums = [sender, ...(candidats || [])].filter(Boolean).map(numero);
      const p = metadata.participants.find((x) => idsP(x).some((n) => nums.includes(n)));
      if (!p) return reply('🤔 Je ne te trouve pas dans la liste des membres de ce groupe.');
      if (estAdmin(p)) return reply('✅ Tu es déjà administrateur de ce groupe.');
      await sock.groupParticipantsUpdate(jid, [p.id], 'promote');
      groupes.invalider(jid);
      await reply('✅ Tu es maintenant administrateur de ce groupe.');
    },
  },
  {
    ...base,
    name: 'moimembre',
    aliases: ['automembre'],
    desc: 'Retire ton rôle d’administrateur dans ce groupe (propriétaire du bot)',
    ownerOnly: true,
    strict: true,
    botAdmin: true,
    run: async ({ sock, jid, metadata, reply, sender, candidats }) => {
      const nums = [sender, ...(candidats || [])].filter(Boolean).map(numero);
      const p = metadata.participants.find((x) => idsP(x).some((n) => nums.includes(n)));
      if (!p) return reply('🤔 Je ne te trouve pas dans la liste des membres de ce groupe.');
      const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero);
      if (idsP(p).some((n) => moi.includes(n))) return reply('🤖 C’est le compte du bot lui-même : je dois rester administrateur pour pouvoir gérer le groupe.');
      if (p.admin === 'superadmin') return reply('👑 Tu es le créateur du groupe : WhatsApp ne permet pas de retirer ce rôle.');
      if (!estAdmin(p)) return reply('ℹ️ Tu n’es pas administrateur de ce groupe.');
      await sock.groupParticipantsUpdate(jid, [p.id], 'demote');
      groupes.invalider(jid);
      await reply('✅ Tu n’es plus administrateur de ce groupe.');
    },
  },
  {
    ...base,
    name: 'demote',
    aliases: ['retrograder'],
    desc: 'Retire le rôle d’administrateur',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, args, metadata, reply }) => {
      const cs = cibles(msg, args, metadata);
      if (!cs.length) return reply('👤 Mentionne un membre, réponds à son message ou écris son numéro.');
      await sock.groupParticipantsUpdate(jid, cs, 'demote');
      await reply('✅ Rôle d’administrateur retiré.');
    },
  },

  // ───────────── Réglages du groupe ─────────────
  {
    ...base,
    name: 'gname',
    desc: 'Change le nom du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, reply }) => {
      const nom = args.join(' ').trim();
      if (!nom) return reply('✏️ Format : `.nomgroupe Nouveau nom`');
      await sock.groupUpdateSubject(jid, nom);
      await reply('✅ Nom du groupe modifié.');
    },
  },
  {
    ...base,
    name: 'gdesc',
    desc: 'Change la description du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, reply }) => {
      const d = args.join(' ').trim();
      if (!d) return reply('✏️ Format : `.descgroupe Nouvelle description`');
      await sock.groupUpdateDescription(jid, d);
      await reply('✅ Description modifiée.');
    },
  },
  {
    ...base,
    name: 'close',
    aliases: ['fermer'],
    desc: 'Seuls les admins peuvent écrire — durée possible : .fermer 2h',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, args, reply, config }) => {
      const texte = args.join(' ').trim();
      const ms = texte ? parseDuree(texte) : 0;
      if (texte && !ms) return reply(`⏱️ Je n’ai pas compris la durée. Exemples : \`${config.PREFIXE}fermer 2h\`, \`${config.PREFIXE}fermer 30min\`, \`${config.PREFIXE}fermer 1h30\`.`);
      if (ms && (ms < 60000 || ms > 7 * 864e5)) return reply('⏱️ La durée doit être comprise entre 1 minute et 7 jours.');
      await sock.groupSettingUpdate(jid, 'announcement');
      jobs.supprimerCle(`rouvrir:${jid}`);
      if (!ms) return reply('🔒 Groupe fermé : seuls les admins peuvent écrire.');
      const fin = Date.now() + ms;
      jobs.ajouter({ quand: fin, type: 'rouvrir', data: { jid, sess: sock.sessionId || 'principal' }, cle: `rouvrir:${jid}` });
      await reply(`🔒 Groupe fermé pour ${formatDuree(ms)} : il se rouvrira tout seul (${dateLocale(fin)}).`);
    },
  },
  {
    ...base,
    name: 'open',
    aliases: ['ouvrir'],
    desc: 'Tout le monde peut écrire (annule aussi une fermeture programmée)',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      jobs.supprimerCle(`rouvrir:${jid}`);
      await reply('🔓 Groupe ouvert : tout le monde peut écrire.');
    },
  },
  {
    ...base,
    name: 'lock',
    desc: 'Seuls les admins modifient les infos du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'locked');
      await reply('🔒 Les paramètres du groupe sont réservés aux admins.');
    },
  },
  {
    ...base,
    name: 'unlock',
    desc: 'Tout le monde modifie les infos du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupSettingUpdate(jid, 'unlocked');
      await reply('🔓 Tous les membres peuvent modifier les paramètres du groupe.');
    },
  },

  // ───────────── Liens et informations ─────────────
  {
    ...base,
    name: 'link',
    aliases: ['lien'],
    desc: 'Donne le lien d’invitation du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      const code = await sock.groupInviteCode(jid);
      await reply(`🔗 https://chat.whatsapp.com/${code}`);
    },
  },
  {
    ...base,
    name: 'revoke',
    desc: 'Réinitialise le lien d’invitation',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.groupRevokeInvite(jid);
      await reply('♻️ Lien d’invitation réinitialisé.');
    },
  },
  {
    ...base,
    name: 'ginfo',
    aliases: ['infogroupe', 'gcinfo'],
    desc: 'Informations sur le groupe',
    run: async ({ reply, metadata }) => {
      if (!metadata) return reply('⚠️ Informations indisponibles.');
      const admins = metadata.participants.filter(estAdmin).length;
      const creation = metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString('fr-FR') : '—';
      await reply(
        `👥 *${metadata.subject}*\n` +
          `🆔 ${metadata.id}\n` +
          `Membres : ${metadata.participants.length}\n` +
          `Admins : ${admins}\n` +
          `Créé le : ${creation}\n` +
          `Description : ${metadata.desc || '—'}`
      );
    },
  },
  {
    ...base,
    name: 'vcf',
    desc: 'Exporte les contacts du groupe en fichier VCF',
    adminOnly: true,
    run: async ({ sock, jid, metadata, reply }) => {
      const lignes = [];
      for (const p of metadata.participants) {
        const n = numeroDe(p);
        if (!n) continue;
        lignes.push(`BEGIN:VCARD\nVERSION:3.0\nFN:${metadata.subject} +${n}\nTEL;type=CELL;waid=${n}:+${n}\nEND:VCARD`);
      }
      if (!lignes.length) return reply('⚠️ Aucun numéro lisible dans ce groupe (WhatsApp masque certains numéros).');
      await sock.sendMessage(jid, {
        document: Buffer.from(lignes.join('\n'), 'utf8'),
        mimetype: 'text/vcard',
        fileName: `${metadata.subject.replace(/[^\w-]+/g, '_')}.vcf`,
        caption: `📇 ${lignes.length} contact(s) exporté(s).`,
      });
    },
  },

  // ───────────── Photo du groupe ─────────────
  {
    ...base,
    name: 'getpp',
    aliases: ['gpp'],
    desc: 'Affiche la photo du groupe',
    run: async ({ sock, jid, msg, reply }) => {
      try {
        const url = await sock.profilePictureUrl(jid, 'image');
        await sock.sendMessage(jid, { image: { url }, caption: '🖼️ Photo du groupe' }, { quoted: msg });
      } catch {
        await reply('⚠️ Ce groupe n’a pas de photo (ou elle est privée).');
      }
    },
  },
  {
    ...base,
    name: 'updatepp',
    aliases: ['upp'],
    desc: 'Change la photo du groupe (réponds à une image)',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, msg, reply }) => {
      const cite = messageCite(msg);
      if (!cite?.message?.imageMessage) return reply('🖼️ Réponds à une image avec `.changerphoto`.');
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: cite.stanzaId, participant: cite.participant }, message: cite.message },
        'buffer',
        {}
      );
      await sock.updateProfilePicture(jid, buffer);
      await reply('✅ Photo du groupe mise à jour.');
    },
  },
  {
    ...base,
    name: 'removepp',
    aliases: ['rpp'],
    desc: 'Supprime la photo du groupe',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      await sock.removeProfilePicture(jid);
      await reply('✅ Photo du groupe supprimée.');
    },
  },

  // ───────────── Demandes d'adhésion ─────────────
  {
    ...base,
    name: 'acceptall',
    desc: 'Accepte toutes les demandes d’adhésion',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      const demandes = await sock.groupRequestParticipantsList(jid);
      if (!demandes.length) return reply('📭 Aucune demande en attente.');
      await sock.groupRequestParticipantsUpdate(jid, demandes.map((d) => d.jid), 'approve');
      await reply(`✅ ${demandes.length} demande(s) acceptée(s).`);
    },
  },
  {
    ...base,
    name: 'rejectall',
    desc: 'Refuse toutes les demandes d’adhésion',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, jid, reply }) => {
      const demandes = await sock.groupRequestParticipantsList(jid);
      if (!demandes.length) return reply('📭 Aucune demande en attente.');
      await sock.groupRequestParticipantsUpdate(jid, demandes.map((d) => d.jid), 'reject');
      await reply(`✅ ${demandes.length} demande(s) refusée(s).`);
    },
  },

  // ───────────── Commandes du propriétaire ─────────────
  {
    categorie: 'Groupe',
    name: 'gcreate',
    desc: 'Crée un groupe — .creergroupe Nom du groupe',
    ownerOnly: true,
    run: async ({ sock, args, reply }) => {
      const nom = args.join(' ').trim();
      if (!nom) return reply('✏️ Format : `.creergroupe Nom du groupe`');
      const g = await sock.groupCreate(nom, []);
      await reply(`✅ Groupe « ${g.subject} » créé.`);
    },
  },
  {
    categorie: 'Groupe',
    name: 'join',
    desc: 'Rejoint un groupe via un lien d’invitation',
    ownerOnly: true,
    run: async ({ sock, args, reply }) => {
      const m = (args[0] || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
      if (!m) return reply('🔗 Format : `.rejoindre https://chat.whatsapp.com/xxxxx`');
      await sock.groupAcceptInvite(m[1]);
      await reply('✅ Groupe rejoint.');
    },
  },
  {
    ...base,
    name: 'leave',
    aliases: ['quitter'],
    desc: 'Le bot quitte le groupe',
    ownerOnly: true,
    run: async ({ sock, jid, reply }) => {
      await reply('👋 Au revoir !');
      await sock.groupLeave(jid);
    },
  },
];
