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
// Par lots : au plus 50 groupes à la fois (DIFFUSION_LOT pour changer), au moins 2 h entre deux lots, avancement gardé en mémoire
const MAX_LOT_DEFAUT = 50;
const maxLot = () => Math.max(1, parseInt(process.env.DIFFUSION_LOT || '', 10) || MAX_LOT_DEFAUT);
const PAUSE_LOTS = 2 * 3600e3;
const VALIDITE_SUIVI = 7 * 86400e3;
const CLE_SUIVI = 'diffusion:suivi';
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mots = (v) => String(v || '').split(',').map((x) => sansAccent(x).trim()).filter(Boolean);
const nomGroupe = (m, g) => String(m?.subject || '').trim() || g.split('@')[0];
// « 🙂diffusion groupes:famille,eglise sauf:test Texte » : filtre facultatif devant le texte (mots cherchés dans le nom du groupe, sans accents ni majuscules)
function analyserDiffusion(args) {
  const inclure = [], exclure = [];
  let i = 0;
  while (i < args.length) {
    const m = /^(groupes?|filtre|pour|sauf):(.*)$/i.exec(args[i]);
    if (!m) break;
    let v = m[2];
    i++;
    if (!v && i < args.length) v = args[i++];
    (m[1].toLowerCase() === 'sauf' ? exclure : inclure).push(...mots(v));
  }
  return { texte: args.slice(i).join(' ').trim().slice(0, 3000), inclure, exclure };
}
const correspond = (nom, d) => {
  const n = sansAccent(nom);
  return (!d.inclure.length || d.inclure.some((w) => n.includes(w))) && !d.exclure.some((w) => n.includes(w));
};
const cleDiffusion = (d) => JSON.stringify([d.texte, d.inclure, d.exclure]);
const libelleFiltre = (d) => [
  d.inclure.length ? `contient « ${d.inclure.join(' » ou « ')} »` : '',
  d.exclure.length ? `ne contient pas « ${d.exclure.join(' » ni « ')} »` : '',
].filter(Boolean).join(' et ');
// { cle, texte, inclure, exclure, faits: [groupes déjà servis], dernier: heure du dernier lot } — gardé dans la base, donc après un redémarrage aussi
function suiviActuel() {
  try {
    const s = JSON.parse(db.lire(CLE_SUIVI) || 'null');
    if (s && typeof s.cle === 'string' && typeof s.texte === 'string' && Array.isArray(s.faits) && s.faits.length && Date.now() - s.dernier < VALIDITE_SUIVI) return s;
  } catch {}
  return null;
}
const suiviPour = (d) => {
  const s = suiviActuel();
  return s && s.cle === cleDiffusion(d) ? s : { cle: cleDiffusion(d), texte: d.texte, inclure: d.inclure, exclure: d.exclure, faits: [], dernier: 0 };
};
const ecrireSuivi = (s) => db.ecrire(CLE_SUIVI, s ? JSON.stringify(s) : '');
const apercuDiffusion = (p, d, suivi, noms) => {
  const liste = noms ? noms.slice(0, 10).join(', ') + (noms.length > 10 ? ` … (+${noms.length - 10})` : '') : '';
  return `📢 *Aperçu de la diffusion :*\n\n${d.texte}\n\n———\n` +
    (libelleFiltre(d) ? `🎯 Groupes dont le nom ${libelleFiltre(d)}${noms ? ` : *${noms.length}* à servir\n${liste}` : ''}\n` : '') +
    (suivi.faits.length ? `↩️ *Reprise* : ${suivi.faits.length} groupe(s) ont déjà reçu ce message, ils seront sautés.\n` : '') +
    `Confirme avec *${p}diffusion oui* (ou ${p}diffusion annuler).`;
};

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
        if (!a || Date.now() - a.ts > 10 * 60e3) return reply(`❓ Aucune diffusion en attente (ou délai de 10 minutes dépassé). Écris d’abord ${p}diffusion Ton message (ou ${p}diffusion suite pour continuer une diffusion commencée)`);
        const suivi = suiviPour(a);
        const ecoule = Date.now() - suivi.dernier;
        // Entre deux lots : au moins 2 h, pour protéger le numéro
        if (suivi.faits.length && ecoule < PAUSE_LOTS && (args[1] || '').toLowerCase() !== 'maintenant')
          return reply(`⏳ Le dernier lot est parti il y a ${formatDuree(ecoule)}. Pour protéger ton numéro, attends encore ${formatDuree(PAUSE_LOTS - ecoule)} (au moins 2 h entre deux lots).\nQuand tu seras prêt : ${p}diffusion suite, puis ${p}diffusion oui.\n_Pour passer outre, à tes risques : ${p}diffusion oui maintenant_`);
        attente.delete(senderNum);
        let tous;
        try {
          tous = await sock.groupFetchAllParticipating();
        } catch {
          return reply('⚠️ Impossible de lire la liste des groupes pour le moment.');
        }
        // Les groupes où seuls les administrateurs peuvent écrire (et où je n'en suis pas un) refuseraient le message : on les écarte et on les signale
        const nomDe = (g) => nomGroupe(tous[g], g);
        const fermes = [];
        const dejaFaits = new Set(suivi.faits);
        const candidats = Object.keys(tous)
          .filter((g) => !dejaFaits.has(g) && correspond(nomDe(g), a))
          .filter((g) => {
            const m = tous[g];
            if (m && m.announce && Array.isArray(m.participants) && m.participants.length && !require('../lib/groupes').botEstAdmin(sock, m)) {
              fermes.push(nomDe(g));
              return false;
            }
            return true;
          });
        const lot = candidats.slice(0, maxLot());
        const reste = candidats.length - lot.length;
        const liste = (l) => l.slice(0, 8).join(', ') + (l.length > 8 ? ` … (+${l.length - 8})` : '');
        if (!lot.length) {
          if (suivi.faits.length && !fermes.length) {
            ecrireSuivi(null);
            return reply('🏁 Tous les groupes ont déjà reçu ce message : rien d’autre à envoyer.');
          }
          return reply(`❓ Aucun groupe à servir${libelleFiltre(a) ? ` (nom qui ${libelleFiltre(a)})` : ''}.` + (fermes.length ? `\n🔒 Ignoré(s), réservé(s) aux admins : ${liste(fermes)}` : ''));
        }
        await reply(`📤 Envoi à ${lot.length} groupe(s)${reste ? ` sur ${candidats.length}` : ''}, avec une pause entre chaque pour protéger ton numéro… (environ ${Math.ceil(lot.length * 5 / 60)} min)${fermes.length ? `\n🔒 ${fermes.length} groupe(s) réservé(s) aux admins ignoré(s).` : ''}`);
        // WhatsApp refuse parfois un message sans que l'envoi lève d'erreur : le refus arrive plus tard dans un accusé. On l'écoute pendant la diffusion.
        const refus = new Map(); // identifiant du message -> code du refus
        const ecouteur = (maj) => {
          for (const u of maj || []) if (u?.update?.status === 0 && u.key?.id) refus.set(u.key.id, (u.update.messageStubParameters || [])[0] || 'refusé');
        };
        sock.ev?.on?.('messages.update', ecouteur);
        const envoyes = []; // { g, id }
        let ok = 0, ko = 0;
        const echecs = [];
        try {
          for (const g of lot) {
            try {
              const r = await sock.sendMessage(g, { text: a.texte });
              envoyes.push({ g, id: r?.key?.id });
            } catch {
              ko++;
              echecs.push(nomDe(g));
            }
            await pause(process.env.KERNEL_TEST ? 1 : 3000 + Math.floor(Math.random() * 4000));
          }
          if (!process.env.KERNEL_TEST) await pause(4000); // laisse arriver l'accusé du dernier envoi
        } finally {
          sock.ev?.off?.('messages.update', ecouteur);
        }
        for (const { g, id } of envoyes) {
          if (id && refus.has(id)) {
            ko++;
            echecs.push(nomDe(g));
          } else ok++;
        }
        // Avancement : les groupes servis (même refusés par WhatsApp) ne sont plus retentés ; ceux où l'envoi a planté le seront au lot suivant
        const etaitReprise = suivi.faits.length > 0;
        const restant = reste + (lot.length - envoyes.length);
        ecrireSuivi(restant > 0 ? { cle: cleDiffusion(a), texte: a.texte, inclure: a.inclure, exclure: a.exclure, faits: [...suivi.faits, ...envoyes.map((e) => e.g)], dernier: Date.now() } : null);
        return reply(
          `${ok === lot.length ? '✅' : '⚠️'} Diffusion terminée : ${ok} envoyé(s) sur ${lot.length}${ko ? `, ${ko} refusé(s) ou en échec` : ''}.` +
            (echecs.length ? `\n❌ Refusé(s) : ${liste(echecs)}` : '') +
            (fermes.length ? `\n🔒 Ignoré(s), réservé(s) aux admins : ${liste(fermes)}` : '') +
            (restant > 0
              ? `\n📦 Il reste ${restant} groupe(s) à servir. Attends 2 à 4 h, puis : ${p}diffusion suite, et ${p}diffusion oui.`
              : etaitReprise ? '\n🏁 Terminé : tous les groupes ont reçu le message.' : '')
        );
      }
      if (sous === 'annuler') {
        attente.delete(senderNum);
        return reply('🗑️ Diffusion annulée.');
      }
      if (args.length === 1 && sous === 'oublier') {
        attente.delete(senderNum);
        ecrireSuivi(null);
        return reply('🗑️ Avancement effacé : la prochaine diffusion repart de zéro.');
      }
      if (args.length === 1 && sous === 'suite') {
        const s = suiviActuel();
        if (!s) return reply(`❓ Aucune diffusion en cours. Écris ${p}diffusion Ton message pour en commencer une.`);
        const d = { texte: s.texte, inclure: s.inclure || [], exclure: s.exclure || [] };
        attente.set(senderNum, { ...d, ts: Date.now() });
        return reply(apercuDiffusion(p, d, s, null));
      }
      const d = analyserDiffusion(args);
      if (d.texte.length < 3)
        return reply(
          `📢 *Diffusion*\n${p}diffusion Ton message\n${p}diffusion groupes:famille Ton message _(seulement les groupes dont le nom contient « famille »)_\n${p}diffusion groupes:famille,eglise sauf:test Ton message\n` +
            `Puis ${p}diffusion oui pour envoyer (ou ${p}diffusion annuler).\n_Par lots de ${maxLot()} groupes au plus, avec pauses, et 2 h minimum entre deux lots : ${p}diffusion suite pour la suite, ${p}diffusion oublier pour tout remettre à zéro._`
        );
      let noms = null;
      if (d.inclure.length || d.exclure.length) {
        let tous;
        try {
          tous = await sock.groupFetchAllParticipating();
        } catch {
          return reply('⚠️ Impossible de lire la liste des groupes pour le moment.');
        }
        const deja = new Set(suiviPour(d).faits);
        noms = Object.keys(tous).filter((g) => !deja.has(g) && correspond(nomGroupe(tous[g], g), d)).map((g) => nomGroupe(tous[g], g));
        if (!noms.length) return reply(`❓ Aucun groupe à servir dont le nom ${libelleFiltre(d)}.`);
      }
      attente.set(senderNum, { ...d, ts: Date.now() });
      await reply(apercuDiffusion(p, d, suiviPour(d), noms));
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
