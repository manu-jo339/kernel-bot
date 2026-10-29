// Kernel Bot — vie de groupe : annonces, cotisations, tontines, anniversaires, événements, inscriptions
const config = require('../config');
const store = require('../lib/store');
const jobs = require('../lib/jobs');
const { parseQuand } = require('../lib/temps');
const { numero, cibles, dateLocale } = require('../lib/utils');
const pdf = require('../lib/pdf');

const base = { categorie: 'Communauté', groupOnly: true, metaSiGroupe: true };
const adm = (c) => c.isAdmin || c.isOwner;
const refus = (c) => c.reply(config.PERSO.messages.reserveAdmin);
const tag = (j) => '@' + numero(j);
const fr = (n) => pdf.montant(n).replace(/ /g, ' ');
const parties = (t) => t.split('|').map((x) => x.trim());
const sess = (sock) => sock.sessionId || 'principal';
const membres = (c) => (c.metadata?.participants || []).map((p) => p.id);

module.exports = [
  // ───────────── Annonce officielle ─────────────
  {
    ...base,
    name: 'annonce',
    aliases: ['annoncer'],
    desc: 'Publie une annonce officielle en notifiant tout le monde',
    usage: '{P}annonce Titre | Texte de l’annonce · {P}annonce liste (dernières annonces)',
    run: async (c) => {
      const { sock, jid, args, reply, sender } = c;
      const l = store.get('annonce', jid, []);
      if ((args[0] || '').toLowerCase() === 'liste') {
        return reply(l.length ? '📢 *Dernières annonces*\n\n' + l.slice(-5).reverse().map((a) => `*${a.titre}* — ${dateLocale(a.ts)}\n${a.texte}`).join('\n\n') : '📢 Aucune annonce enregistrée.');
      }
      if (!adm(c)) return refus(c);
      const [titre, ...r] = parties(args.join(' '));
      const texte = r.join(' | ');
      if (!titre) return reply(`✏️ ${config.PREFIXE}annonce Réunion samedi | Rendez-vous à 15h au local, présence de tous souhaitée.`);
      l.push({ titre: texte ? titre : 'Annonce', texte: texte || titre, ts: Date.now(), par: numero(sender) });
      store.set('annonce', jid, l.slice(-20));
      await sock.sendMessage(jid, { text: `📢 *ANNONCE — ${texte ? titre.toUpperCase() : 'IMPORTANT'}*\n\n${texte || titre}\n\n_— ${tag(sender)}, ${dateLocale(Date.now())}_`, mentions: [...new Set([...membres(c), sender])] });
    },
  },

  // ───────────── Cotisations ─────────────
  {
    ...base,
    name: 'cotisation',
    aliases: ['cotisations', 'collecte'],
    desc: 'Suivi des cotisations du groupe (qui a payé, qui doit)',
    usage: '{P}cotisation creer Nom | montant · {P}cotisation payer @membre [montant] · {P}cotisation liste · {P}cotisation rappel · {P}cotisation cloturer',
    run: async (c) => {
      const { sock, jid, msg, args, reply, metadata } = c;
      const p = config.PREFIXE;
      const l = store.get('cotis', jid, []);
      const sous = (args[0] || '').toLowerCase();
      const n = l.length; // on travaille sur la dernière cotisation ouverte
      const cur = l[n - 1] && !l[n - 1].close ? l[n - 1] : null;
      const sauver = () => store.set('cotis', jid, l);
      if (sous === 'creer') {
        if (!adm(c)) return refus(c);
        const [nom, montant] = parties(args.slice(1).join(' '));
        const m = parseFloat(String(montant || '').replace(/\s/g, '').replace(',', '.'));
        if (!nom || !(m > 0)) return reply(`✏️ ${p}cotisation creer Anniversaire de Paul | 2000`);
        if (cur) return reply(`⚠️ La cotisation « ${cur.nom} » est encore ouverte. Clôture-la d’abord (${p}cotisation cloturer).`);
        l.push({ nom, montant: m, paiements: {}, ts: Date.now() });
        sauver();
        return reply(`✅ Cotisation *${nom}* ouverte : ${fr(m)} par personne.\nEnregistre les paiements avec ${p}cotisation payer @membre`);
      }
      if (!cur) return reply(`💰 Aucune cotisation ouverte. Un admin peut en créer une :\n${p}cotisation creer Nom | montant`);
      if (sous === 'payer') {
        if (!adm(c)) return refus(c);
        const cibs = cibles(msg, args.slice(1), metadata);
        if (!cibs.length) return reply(`✏️ ${p}cotisation payer @membre [montant]`);
        const mt = parseFloat((args.slice(1).find((x) => /^\d[\d.,]*$/.test(x) && x.replace(/\D/g, '').length < 8) || '').replace(',', '.')) || cur.montant;
        cibs.forEach((j) => { cur.paiements[numero(j)] = (cur.paiements[numero(j)] || 0) + mt; });
        sauver();
        return sock.sendMessage(jid, { text: `✅ Paiement de ${fr(mt)} enregistré pour ${cibs.map(tag).join(', ')}.`, mentions: cibs });
      }
      const tous = membres(c).filter((j) => !/^(bot)$/.test(j));
      const nums = new Set(tous.map(numero));
      const payes = Object.entries(cur.paiements).filter(([k, v]) => v >= cur.montant && nums.has(k));
      const reste = tous.filter((j) => (cur.paiements[numero(j)] || 0) < cur.montant && !isBot(c, j));
      const total = Object.values(cur.paiements).reduce((s, v) => s + v, 0);
      if (sous === 'rappel') {
        if (!adm(c)) return refus(c);
        if (!reste.length) return reply('🎉 Tout le monde a payé !');
        return sock.sendMessage(jid, { text: `💰 *Rappel — ${cur.nom}* (${fr(cur.montant)})\n\nEn attente de paiement :\n${reste.map((j) => '• ' + tag(j)).join('\n')}`, mentions: reste });
      }
      if (sous === 'cloturer') {
        if (!adm(c)) return refus(c);
        cur.close = Date.now();
        sauver();
        return reply(`🔒 Cotisation *${cur.nom}* clôturée.\n💰 Total collecté : *${fr(total)}*\n✅ Payé : ${payes.length} — ❌ Non payé : ${reste.length}`);
      }
      await sock.sendMessage(jid, {
        text: `💰 *Cotisation — ${cur.nom}*\nMontant : ${fr(cur.montant)} par personne\n\n✅ *Ont payé (${payes.length})*\n${payes.map(([k]) => '• ' + '@' + k).join('\n') || '—'}\n\n❌ *Restent (${reste.length})*\n${reste.map((j) => '• ' + tag(j)).join('\n') || '—'}\n\n💵 Total collecté : *${fr(total)}*`,
        mentions: [...tous],
      });
    },
  },

  // ───────────── Tontine ─────────────
  {
    ...base,
    name: 'tontine',
    aliases: ['tontines'],
    desc: 'Organise une tontine : ordre de passage, paiements, tour en cours',
    usage: '{P}tontine creer Nom | montant | jours · {P}tontine ajouter @a @b · {P}tontine tirer (ordre au sort) · {P}tontine payer @membre · {P}tontine etat · {P}tontine suivant · {P}tontine supprimer',
    run: async (c) => {
      const { sock, jid, msg, args, reply, metadata } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      let t = store.get('tontine', jid, null);
      const sauver = () => store.set('tontine', jid, t);
      if (sous === 'creer') {
        if (!adm(c)) return refus(c);
        const [nom, montant, jours] = parties(args.slice(1).join(' '));
        const m = parseFloat(String(montant || '').replace(/\s/g, ''));
        if (!nom || !(m > 0)) return reply(`✏️ ${p}tontine creer Tontine des amis | 10000 | 30\n(montant par personne et par tour, durée d’un tour en jours)`);
        t = { nom, montant: m, jours: parseInt(jours, 10) || 30, membres: [], ordre: [], tour: 0, payes: {}, ts: Date.now() };
        sauver();
        return reply(`✅ Tontine *${nom}* créée : ${fr(m)} par personne, tour de ${t.jours} jours.\nAjoute les participants : ${p}tontine ajouter @a @b @c`);
      }
      if (!t) return reply(`🔄 Aucune tontine dans ce groupe. Un admin peut en créer une :\n${p}tontine creer Nom | montant | jours`);
      const nom = (num) => '@' + num;
      const jidDe = (num) => t.jids?.[num] || num + '@s.whatsapp.net';
      t.jids = t.jids || {};
      if (sous === 'ajouter') {
        if (!adm(c)) return refus(c);
        const cibs = cibles(msg, args.slice(1), metadata);
        if (!cibs.length) return reply(`✏️ ${p}tontine ajouter @a @b @c`);
        for (const j of cibs) {
          if (!t.membres.includes(numero(j))) t.membres.push(numero(j));
          t.jids[numero(j)] = j;
        }
        t.ordre = t.ordre.filter((x) => t.membres.includes(x));
        sauver();
        return reply(`✅ ${t.membres.length} participant(s). Tire l’ordre au sort avec ${p}tontine tirer`);
      }
      if (sous === 'tirer') {
        if (!adm(c)) return refus(c);
        if (t.membres.length < 2) return reply('⚠️ Il faut au moins 2 participants.');
        const o = [...t.membres];
        for (let i = o.length - 1; i > 0; i--) {
          const j = require('crypto').randomInt(i + 1);
          [o[i], o[j]] = [o[j], o[i]];
        }
        t.ordre = o;
        t.tour = 0;
        t.payes = {};
        sauver();
        return sock.sendMessage(jid, { text: `🎲 *Ordre de passage — ${t.nom}*\n\n${o.map((x, i) => `${i + 1}. ${nom(x)}`).join('\n')}\n\nPremier bénéficiaire : ${nom(o[0])}`, mentions: o.map(jidDe) });
      }
      if (sous === 'payer') {
        if (!adm(c)) return refus(c);
        const cibs = cibles(msg, args.slice(1), metadata);
        if (!cibs.length) return reply(`✏️ ${p}tontine payer @membre`);
        cibs.forEach((j) => { t.payes[numero(j)] = true; });
        sauver();
        return sock.sendMessage(jid, { text: `✅ Cotisation du tour enregistrée pour ${cibs.map(tag).join(', ')}.`, mentions: cibs });
      }
      if (sous === 'supprimer') {
        if (!adm(c)) return refus(c);
        store.del('tontine', jid);
        return reply('🗑️ Tontine supprimée.');
      }
      if (!t.ordre.length) return reply(`🔄 *${t.nom}* — ${t.membres.length} participant(s). Tire l’ordre avec ${p}tontine tirer`);
      const benef = t.ordre[t.tour % t.ordre.length];
      if (sous === 'suivant') {
        if (!adm(c)) return refus(c);
        const pas = t.ordre.filter((x) => !t.payes[x] && x !== benef);
        t.tour += 1;
        t.payes = {};
        sauver();
        const nb = t.ordre[t.tour % t.ordre.length];
        return sock.sendMessage(jid, { text: `➡️ *Tour ${t.tour + 1}/${t.ordre.length}* — bénéficiaire : ${nom(nb)}\n💰 Chacun verse ${fr(t.montant)}.${pas.length ? `\n\n⚠️ Tour précédent non payé par : ${pas.map(nom).join(', ')}` : ''}`, mentions: [jidDe(nb), ...pas.map(jidDe)] });
      }
      const payes = t.ordre.filter((x) => t.payes[x]);
      const restent = t.ordre.filter((x) => !t.payes[x] && x !== benef);
      await sock.sendMessage(jid, {
        text: `🔄 *Tontine — ${t.nom}*\nTour ${(t.tour % t.ordre.length) + 1}/${t.ordre.length} · ${fr(t.montant)} par personne · cagnotte : *${fr(t.montant * (t.ordre.length - 1))}*\n🎁 Bénéficiaire : ${nom(benef)}\n\n✅ Payé (${payes.length}) : ${payes.map(nom).join(', ') || '—'}\n❌ Reste (${restent.length}) : ${restent.map(nom).join(', ') || '—'}`,
        mentions: t.ordre.map(jidDe),
      });
    },
  },

  // ───────────── Anniversaires ─────────────
  {
    ...base,
    name: 'anniversaire',
    aliases: ['anniv', 'birthday'],
    desc: 'Enregistre les anniversaires du groupe (vœux automatiques à 8 h)',
    usage: '{P}anniversaire 15/10 (le tien) · {P}anniversaire ajouter @membre 15/10 (admin) · {P}anniversaire liste · {P}anniversaire retirer',
    run: async (c) => {
      const { jid, msg, args, reply, sender, senderNum, metadata } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const lireDate = (t) => {
        const m = String(t || '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
        if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) return null;
        return { j: +m[1], m: +m[2], a: m[3] ? +m[3] : null };
      };
      const tous = store.liste('anniv').filter((x) => x.id.startsWith(jid + '|')).map((x) => x.data);
      if (!args.length || sous === 'liste') {
        const auj = new Date(Date.now() + 36e5);
        const base0 = Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth(), auj.getUTCDate());
        const dans = (a) => {
          let d = Date.UTC(auj.getUTCFullYear(), a.m - 1, a.j);
          if (d < base0) d = Date.UTC(auj.getUTCFullYear() + 1, a.m - 1, a.j);
          return Math.round((d - base0) / 864e5);
        };
        const l = tous.map((a) => ({ ...a, d: dans(a) })).sort((x, y) => x.d - y.d).slice(0, 8);
        if (!l.length) return reply(`🎂 Aucun anniversaire enregistré.\n${p}anniversaire 15/10 pour ajouter le tien.`);
        return c.sock.sendMessage(jid, { text: '🎂 *Prochains anniversaires*\n\n' + l.map((a) => `• ${tag(a.sender)} — ${String(a.j).padStart(2, '0')}/${String(a.m).padStart(2, '0')}${a.d === 0 ? ' 🎉 aujourd’hui !' : ` (dans ${a.d} j)`}`).join('\n'), mentions: l.map((a) => a.sender) }, { quoted: msg });
      }
      if (sous === 'retirer') {
        return reply(store.del('anniv', `${jid}|${senderNum}`) ? '🗑️ Ton anniversaire est retiré.' : 'ℹ️ Tu n’avais pas enregistré ton anniversaire.');
      }
      let cible = sender, d;
      if (sous === 'ajouter') {
        if (!adm(c)) return refus(c);
        [cible] = cibles(msg, args.slice(1), metadata);
        d = lireDate(args.find((x) => lireDate(x)));
      } else d = lireDate(args[0]);
      if (!d || !cible) return reply(`✏️ ${p}anniversaire 15/10  ou  15/10/1998\n(admin : ${p}anniversaire ajouter @membre 15/10)`);
      store.set('anniv', `${jid}|${numero(cible)}`, { ...d, sender: cible, jid });
      await reply(`🎂 Enregistré : ${tag(cible)} — ${String(d.j).padStart(2, '0')}/${String(d.m).padStart(2, '0')}. Les vœux partiront automatiquement à 8 h.`);
    },
  },

  // ───────────── Événements ─────────────
  {
    ...base,
    name: 'evenement',
    aliases: ['event', 'evenements'],
    desc: 'Crée un événement et suit qui vient (oui / non / peut-être)',
    usage: '{P}evenement creer Titre | 30/10 18h | Lieu (admin) · {P}evenement oui 1 · {P}evenement non 1 · {P}evenement peutetre 1 · {P}evenement voir 1 · {P}evenement liste · {P}evenement annuler 1',
    run: async (c) => {
      const { sock, jid, args, reply, sender, senderNum } = c;
      const p = config.PREFIXE;
      const l = store.get('event', jid, []);
      const sous = (args[0] || '').toLowerCase();
      const sauver = () => store.set('event', jid, l);
      const aff = (e, i) => {
        const o = Object.entries(e.rep).filter(([, v]) => v.r === 'oui'), nn = Object.entries(e.rep).filter(([, v]) => v.r === 'non'), pe = Object.entries(e.rep).filter(([, v]) => v.r === 'peutetre');
        return `📅 *#${i + 1} ${e.titre}*\n🕒 ${dateLocale(e.quand)}${e.lieu ? '\n📍 ' + e.lieu : ''}\n✅ ${o.length} · ❌ ${nn.length} · 🤔 ${pe.length}`;
      };
      if (sous === 'creer') {
        if (!adm(c)) return refus(c);
        const [titre, quand, lieu] = parties(args.slice(1).join(' '));
        const q = parseQuand(quand || '');
        if (!titre || !q || q.erreur) return reply(`✏️ ${p}evenement creer Réunion de famille | 30/10 18h | Chez Paul`);
        const e = { titre, quand: q.quand, lieu: lieu || '', rep: {} };
        l.push(e);
        sauver();
        const n = l.length;
        if (q.quand - Date.now() > 2 * 3600000) jobs.ajouter({ quand: q.quand - 3600000, type: 'rappel', data: { jid, texte: `Dans 1 heure : *${titre}*${lieu ? ' — ' + lieu : ''}`, sess: sess(sock) }, cle: `event:${jid}:${e.quand}` });
        return sock.sendMessage(jid, { text: `${aff(e, n - 1)}\n\nRéponds avec :\n${p}evenement oui ${n}\n${p}evenement non ${n}\n${p}evenement peutetre ${n}`, mentions: membres(c) });
      }
      if (!l.length) return reply(`📅 Aucun événement. Un admin peut en créer un :\n${p}evenement creer Titre | 30/10 18h | Lieu`);
      if (['oui', 'non', 'peutetre', 'peut-etre'].includes(sous)) {
        const e = l[(parseInt(args[1], 10) || l.length) - 1];
        if (!e) return reply('❓ Événement introuvable.');
        e.rep[senderNum] = { r: sous.startsWith('peut') ? 'peutetre' : sous, j: sender };
        sauver();
        return reply(`✅ Noté : ${sous === 'oui' ? 'tu viens 🎉' : sous === 'non' ? 'tu ne viens pas' : 'peut-être'}.\n${aff(e, l.indexOf(e))}`);
      }
      if (sous === 'annuler') {
        if (!adm(c)) return refus(c);
        const n = parseInt(args[1], 10);
        if (!n || !l[n - 1]) return reply('❓ Numéro invalide.');
        jobs.supprimerCle(`event:${jid}:${l[n - 1].quand}`);
        l.splice(n - 1, 1);
        sauver();
        return reply('🗑️ Événement annulé.');
      }
      if (sous === 'voir') {
        const e = l[(parseInt(args[1], 10) || l.length) - 1];
        if (!e) return reply('❓ Événement introuvable.');
        const noms = (r) => Object.values(e.rep).filter((v) => v.r === r).map((v) => v.j);
        return sock.sendMessage(jid, { text: `${aff(e, l.indexOf(e))}\n\n✅ ${noms('oui').map(tag).join(', ') || '—'}\n❌ ${noms('non').map(tag).join(', ') || '—'}\n🤔 ${noms('peutetre').map(tag).join(', ') || '—'}`, mentions: Object.values(e.rep).map((v) => v.j) });
      }
      const futurs = l.map((e, i) => ({ e, i })).filter((x) => x.e.quand > Date.now() - 864e5);
      await reply(futurs.length ? '📅 *Événements*\n\n' + futurs.map((x) => aff(x.e, x.i)).join('\n\n') : '📅 Aucun événement à venir.');
    },
  },

  // ───────────── Inscriptions (places limitées) ─────────────
  {
    ...base,
    name: 'inscription',
    aliases: ['inscriptions', 'inscrire'],
    desc: 'Liste d’inscription avec places limitées (formation, sortie…)',
    usage: '{P}inscription creer Titre | places (admin) · {P}inscription moi · {P}inscription annuler · {P}inscription liste · {P}inscription fermer',
    run: async (c) => {
      const { sock, jid, args, reply, sender, senderNum } = c;
      const p = config.PREFIXE;
      let ins = store.get('inscr', jid, null);
      const sous = (args[0] || '').toLowerCase();
      const sauver = () => store.set('inscr', jid, ins);
      if (sous === 'creer') {
        if (!adm(c)) return refus(c);
        const [titre, places] = parties(args.slice(1).join(' '));
        if (!titre) return reply(`✏️ ${p}inscription creer Formation Excel | 20`);
        ins = { titre, places: parseInt(places, 10) || 0, liste: [], attente: [], ouvert: true };
        sauver();
        return sock.sendMessage(jid, { text: `📝 *Inscriptions ouvertes — ${titre}*\n${ins.places ? `Places : ${ins.places}` : 'Places illimitées'}\n\nPour t’inscrire : ${p}inscription moi`, mentions: membres(c) });
      }
      if (!ins) return reply(`📝 Aucune inscription en cours. Un admin peut l’ouvrir :\n${p}inscription creer Titre | places`);
      const dedans = () => ins.liste.some((x) => x.n === senderNum);
      if (sous === 'moi' || sous === 'inscrire') {
        if (!ins.ouvert) return reply('🔒 Les inscriptions sont fermées.');
        if (dedans()) return reply('✅ Tu es déjà inscrit.');
        if (ins.attente.some((x) => x.n === senderNum)) return reply('⏳ Tu es déjà sur la liste d’attente.');
        if (ins.places && ins.liste.length >= ins.places) {
          ins.attente.push({ n: senderNum, j: sender });
          sauver();
          return reply(`⏳ Complet : tu es en liste d’attente (position ${ins.attente.length}).`);
        }
        ins.liste.push({ n: senderNum, j: sender });
        sauver();
        return reply(`✅ Inscrit ! ${ins.places ? `(${ins.liste.length}/${ins.places})` : `(${ins.liste.length} inscrits)`}`);
      }
      if (sous === 'annuler') {
        const avant = ins.liste.length;
        ins.liste = ins.liste.filter((x) => x.n !== senderNum);
        ins.attente = ins.attente.filter((x) => x.n !== senderNum);
        let promu = null;
        if (ins.liste.length < avant && ins.attente.length) {
          promu = ins.attente.shift();
          ins.liste.push(promu);
        }
        sauver();
        if (promu) await sock.sendMessage(jid, { text: `🎉 ${tag(promu.j)}, une place s’est libérée : tu es maintenant inscrit !`, mentions: [promu.j] });
        return reply('🗑️ Inscription annulée.');
      }
      if (sous === 'fermer' || sous === 'ouvrir') {
        if (!adm(c)) return refus(c);
        ins.ouvert = sous === 'ouvrir';
        sauver();
        return reply(ins.ouvert ? '🔓 Inscriptions rouvertes.' : '🔒 Inscriptions fermées.');
      }
      if (sous === 'supprimer') {
        if (!adm(c)) return refus(c);
        store.del('inscr', jid);
        return reply('🗑️ Liste supprimée.');
      }
      await sock.sendMessage(jid, { text: `📝 *${ins.titre}* ${ins.ouvert ? '' : '🔒'}\n${ins.places ? `${ins.liste.length}/${ins.places} places` : `${ins.liste.length} inscrits`}\n\n${ins.liste.map((x, i) => `${i + 1}. ${tag(x.j)}`).join('\n') || '—'}${ins.attente.length ? `\n\n⏳ Attente : ${ins.attente.map((x) => tag(x.j)).join(', ')}` : ''}`, mentions: [...ins.liste, ...ins.attente].map((x) => x.j) });
    },
  },
];

function isBot(c, j) {
  const moi = [c.sock.user?.id, c.sock.user?.lid].filter(Boolean).map(numero);
  return moi.includes(numero(j));
}
