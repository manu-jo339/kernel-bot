// Kernel Bot — outils du propriétaire : diffusion aux groupes, rapport d'activité, sauvegarde, mode discret, clé personnelle d'IA
const fs = require('fs');
const path = require('path');
const config = require('../config');
const store = require('../lib/store');
const jobs = require('../lib/jobs');
const stats = require('../lib/stats');
const db = require('../lib/db');
const macle = require('../lib/macle');
const ia = require('../lib/ia');
const { prevenirProprio } = require('../lib/notifier');
const { jourJ } = db;
const { formatDuree, dateLocale, pause } = require('../lib/utils');

const proprio = { ownerOnly: true, strict: true };

// ───────────── Diffusion : un message à tous les groupes (avec confirmation et pauses, pour ne pas faire bannir le numéro) ─────────────
const attente = new Map(); // numéro propriétaire -> { texte, ts }
const MAX_DIFFUSION = 50;

// ───────────── Rapport d'activité ─────────────
async function construireRapport(sock, jours = 7) {
  let cmds = 0;
  const users = new Set(), top = {}, groupes = new Set();
  const parJour = [];
  for (let i = 0; i < jours; i++) {
    const j = jourJ(-i);
    const s = stats.jourStats(j);
    cmds += s.cmds;
    parJour.push(`${j.slice(5)} : ${s.cmds}`);
    Object.keys(s.users).forEach((u) => users.add(u));
    Object.keys(s.groupes).forEach((g) => groupes.add(g));
    for (const [c, n] of Object.entries(s.parCmd)) top[c] = (top[c] || 0) + n;
  }
  const classement = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8);
  let nbGroupes = '—';
  try {
    nbGroupes = Object.keys(await sock.groupFetchAllParticipating()).length;
  } catch {}
  const aujourdhui = stats.jourStats(jourJ());
  return `📊 *Rapport d’activité — ${config.NOM_BOT}*\n_${jours} derniers jours_\n\n` +
    `⚙️ Commandes exécutées : *${cmds}* (aujourd’hui : ${aujourdhui.cmds})\n` +
    `👤 Utilisateurs différents : *${users.size}*\n` +
    `👥 Groupes actifs : *${groupes.size}* (le bot est dans ${nbGroupes} groupes)\n` +
    `⏱️ En marche depuis : ${formatDuree(process.uptime() * 1000)}\n\n` +
    (classement.length ? '*Commandes les plus utilisées*\n' + classement.map(([c, n], i) => `${i + 1}. ${config.PREFIXE}${c} — ${n}`).join('\n') + '\n\n' : '') +
    `*Par jour* : ${parJour.reverse().join(' · ')}`;
}

jobs.surTache('rapport', async ({ sock }) => {
  try {
    await prevenirProprio(sock, await construireRapport(sock, 1));
  } catch (e) {
    console.error('[rapport]', e.message);
  }
});

// ───────────── Sauvegarde de la base de données ─────────────
function copierBase() {
  const dest = path.join(require('os').tmpdir(), `kernel-sauvegarde-${Date.now()}.db`);
  db.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  return dest;
}

module.exports = [
  {
    ...proprio,
    name: 'diffusion',
    aliases: ['broadcast', 'bc'],
    categorie: 'Propriétaire',
    desc: 'Envoie un message à tous les groupes du bot (avec confirmation)',
    usage: '{P}diffusion Texte du message → puis {P}diffusion oui pour confirmer',
    run: async ({ sock, args, reply, senderNum }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      if (sous === 'oui') {
        const a = attente.get(senderNum);
        if (!a || Date.now() - a.ts > 10 * 60e3) return reply(`❓ Aucune diffusion en attente (ou délai de 10 minutes dépassé). Écris d’abord ${p}diffusion Ton message`);
        attente.delete(senderNum);
        let groupes;
        try {
          groupes = Object.keys(await sock.groupFetchAllParticipating());
        } catch {
          return reply('⚠️ Impossible de lire la liste des groupes pour le moment.');
        }
        groupes = groupes.slice(0, MAX_DIFFUSION);
        await reply(`📤 Envoi à ${groupes.length} groupe(s), avec une pause entre chaque pour protéger ton numéro… (environ ${Math.ceil(groupes.length * 5 / 60)} min)`);
        let ok = 0, ko = 0;
        for (const g of groupes) {
          try {
            await sock.sendMessage(g, { text: a.texte });
            ok++;
          } catch {
            ko++;
          }
          await pause(process.env.KERNEL_TEST ? 1 : 3000 + Math.floor(Math.random() * 4000));
        }
        return reply(`✅ Diffusion terminée : ${ok} envoyé(s)${ko ? `, ${ko} échec(s)` : ''}.`);
      }
      if (sous === 'annuler') {
        attente.delete(senderNum);
        return reply('🗑️ Diffusion annulée.');
      }
      const texte = args.join(' ').trim();
      if (texte.length < 3) return reply(`📢 *Diffusion*\n${p}diffusion Ton message\nPuis ${p}diffusion oui pour envoyer (ou ${p}diffusion annuler).\n_Limité à ${MAX_DIFFUSION} groupes par envoi, avec pauses._`);
      attente.set(senderNum, { texte: texte.slice(0, 3000), ts: Date.now() });
      await reply(`📢 *Aperçu de la diffusion :*\n\n${texte.slice(0, 3000)}\n\n———\nConfirme avec *${p}diffusion oui* (ou ${p}diffusion annuler).`);
    },
  },
  {
    ...proprio,
    name: 'rapport',
    aliases: ['bilan', 'activite'],
    categorie: 'Propriétaire',
    desc: 'Rapport d’activité du bot (commandes, utilisateurs, groupes)',
    usage: '{P}rapport [jours] · {P}rapport auto on|off (envoi chaque soir à 20h)',
    run: async ({ sock, args, reply }) => {
      if ((args[0] || '').toLowerCase() === 'auto') {
        const on = (args[1] || '').toLowerCase();
        if (on === 'off') {
          jobs.supprimerCle('systeme:rapport');
          return reply('🔕 Rapport automatique désactivé.');
        }
        if (on === 'on') {
          jobs.supprimerCle('systeme:rapport');
          const { prochain } = require('../lib/taches');
          jobs.ajouter({ quand: prochain(20), type: 'rapport', repete: 864e5, cle: 'systeme:rapport' });
          return reply('🔔 Tu recevras le rapport du jour chaque soir à 20h (heure de Brazzaville).');
        }
        return reply(`📊 Rapport automatique : ${jobs.parCle('systeme:rapport').length ? 'activé' : 'désactivé'}\n${config.PREFIXE}rapport auto on|off`);
      }
      const jours = Math.min(30, Math.max(1, parseInt(args[0], 10) || 7));
      await reply(await construireRapport(sock, jours));
    },
  },
  {
    ...proprio,
    name: 'sauvegarde',
    aliases: ['backup'],
    categorie: 'Propriétaire',
    desc: 'T’envoie une copie de la base de données du bot (en privé)',
    run: async ({ sock, jid, isGroup, reply, senderNum }) => {
      if (isGroup) return reply('🔒 Pour ta sécurité, demande la sauvegarde en privé.');
      let fichier;
      try {
        fichier = copierBase();
        const buf = fs.readFileSync(fichier);
        await sock.sendMessage(jid, { document: buf, mimetype: 'application/octet-stream', fileName: `sauvegarde-${jourJ()}.db`, caption: `💾 Sauvegarde du ${dateLocale()}\n_Contient les données du bot (réglages, notes, clients…). Garde-la pour toi._\n_Pour restaurer : arrête le bot, remplace data/bot.db par ce fichier, relance._` });
      } catch (e) {
        console.error('[sauvegarde]', e.message);
        await reply('⚠️ Sauvegarde impossible : ' + e.message);
      } finally {
        if (fichier) fs.rm(fichier, () => {});
      }
    },
  },
  {
    ...proprio,
    name: 'discret',
    aliases: ['invisible', 'ghost'],
    categorie: 'Propriétaire',
    desc: 'Mode discret : plus de coches bleues, hors ligne (si le bot tourne sur TON numéro)',
    usage: '{P}discret on|off',
    run: async ({ sock, args, reply }) => {
      const on = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(on)) return reply(`🕶️ Mode discret : ${store.get('reglage', 'discret', { on: false }).on ? 'activé' : 'désactivé'}\n${config.PREFIXE}discret on|off\n_Modifie ces réglages WhatsApp de ton numéro : confirmations de lecture, dernière connexion, statut « en ligne »._`);
      try {
        if (on === 'on') {
          await sock.updateReadReceiptsPrivacy('none');
          await sock.updateLastSeenPrivacy('none');
          await sock.updateOnlinePrivacy('match_last_seen');
          await sock.sendPresenceUpdate('unavailable');
        } else {
          await sock.updateReadReceiptsPrivacy('all');
          await sock.updateLastSeenPrivacy('contacts');
          await sock.updateOnlinePrivacy('all');
        }
        store.set('reglage', 'discret', { on: on === 'on' });
        await reply(on === 'on' ? '🕶️ Mode discret activé : coches bleues, dernière connexion et statut « en ligne » masqués.\n_Tu ne verras plus ceux des autres non plus (règle WhatsApp)._' : '👀 Mode discret désactivé : coches bleues rétablies, dernière connexion visible par tes contacts.');
      } catch (e) {
        await reply('⚠️ WhatsApp a refusé le changement : ' + (e.message || e));
      }
    },
  },
  {
    name: 'macle',
    aliases: ['macle', 'macl'],
    categorie: 'IA',
    desc: 'Utilise TA propre clé d’IA (gratuite) : plus de limite quotidienne',
    usage: '{P}macle mistral <ta clé> · {P}macle voir · {P}macle retirer [mistral|gemini|groq]',
    run: async ({ sock, msg, jid, isGroup, args, reply, senderNum }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      // La clé ne doit jamais rester visible dans un groupe : on exige une conversation privée
      if (sous && !['voir', 'aide'].includes(sous) && isGroup) {
        if (macle.FOURNISSEURS.includes(sous)) {
          try { await sock.sendMessage(jid, { delete: msg.key }); } catch {}
        }
        return reply('🔒 Ne mets jamais une clé dans un groupe ! Écris-moi en privé : *' + p + 'macle ' + sous + ' …*\n_(Si tu viens d’en publier une ici, supprime-la et recrée-en une chez le fournisseur.)_');
      }
      if (sous === 'voir') {
        const f = macle.fournisseurs(senderNum);
        return reply(f.length ? `🔑 Tes clés enregistrées : ${f.join(', ')}\n_Elles sont chiffrées et ne sont jamais affichées._\n${p}macle retirer [service] pour en supprimer.` : `🔑 Aucune clé enregistrée.\n${p}macle aide pour savoir comment faire.`);
      }
      if (sous === 'retirer') {
        const k = (args[1] || '').toLowerCase();
        const ok = macle.retirer(senderNum, macle.FOURNISSEURS.includes(k) ? k : null);
        return reply(ok ? '🗑️ Clé supprimée. Tu repasses sur les services du bot (avec limite quotidienne).' : 'Aucune clé à supprimer.');
      }
      if (!macle.FOURNISSEURS.includes(sous)) {
        return reply(`🔑 *Ta propre clé d’IA*\nAvec ta clé gratuite, tu n’as plus la limite quotidienne du bot, et c’est ton quota à toi.\n\n*Comment faire :*\n1. Crée un compte gratuit chez Mistral (console.mistral.ai), Google Gemini (aistudio.google.com) ou Groq (console.groq.com) et génère une clé API.\n2. Écris-moi *en privé* : ${p}macle mistral TA_CLÉ\n\n${p}macle voir · ${p}macle retirer\n\n_Ta clé est chiffrée sur l’ordinateur du bot, jamais affichée. Tes messages sont alors traités par le service que tu as choisi, selon ses conditions._`);
      }
      const cle = (args[1] || '').trim();
      try { await sock.sendMessage(jid, { delete: msg.key }); } catch {}
      if (cle.length < 15 || /\s/.test(cle)) return reply(`❓ Format : ${p}macle ${sous} TA_CLÉ`);
      const souci = await ia.verifierCle(sous, cle);
      if (souci) return reply(`❌ Clé non enregistrée : ${souci}.`);
      macle.definir(senderNum, sous, cle);
      await reply(`✅ Clé ${sous} (${macle.apercuCle(cle)}) enregistrée et chiffrée. J’ai essayé de supprimer ton message pour qu’elle ne reste pas dans la discussion — supprime-le toi aussi pour être sûr.\nDésormais, tes questions à l’IA passent par ta clé, sans limite du bot.`);
    },
  },
];
