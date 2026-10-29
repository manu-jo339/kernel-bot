// Kernel Bot — communauté (suite) : petites annonces, suggestions, signalements, appel, devoirs, élections, inactifs, annuaire
const config = require('../config');
const store = require('../lib/store');
const jobs = require('../lib/jobs');
const groupes = require('../lib/groupes');
const { parseQuand } = require('../lib/temps');
const { prevenirProprio } = require('../lib/notifier');
const { numero, cibles, dateLocale, messageCite, extraireTexte } = require('../lib/utils');

const cat = 'Communauté';
const G = { categorie: cat, groupOnly: true, metaSiGroupe: true };
const adm = (c) => c.isAdmin || c.isOwner;
const refus = (c) => c.reply(config.PERSO.messages.reserveAdmin);
const tag = (j) => '@' + numero(j);
const parties = (t) => t.split('|').map((x) => x.trim());
const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const suivant = (ns) => store.modifier('compteur', ns, { n: 0 }, (c) => { c.n += 1; }).n;
const sess = (sock) => sock.sessionId || 'principal';
const membres = (c) => (c.metadata?.participants || []).map((p) => p.id);
// Numéro de téléphone réel (et non l'identifiant « lid ») pour les liens wa.me, si WhatsApp le fournit
const pn = (c) => {
  const j = [...(c.candidats || []), c.sender].find((x) => String(x).endsWith('@s.whatsapp.net'));
  return j ? numero(j) : null;
};
const limiteur = new Map();
const tropVite = (k, ms) => {
  const t = Date.now();
  if (t - (limiteur.get(k) || 0) < ms) return true;
  limiteur.set(k, t);
  return false;
};

module.exports = [
  // ───────────── Petites annonces ─────────────
  {
    categorie: cat,
    name: 'annonces',
    aliases: ['petitesannonces', 'marche'],
    desc: 'Petites annonces : vendre, acheter, chercher',
    usage: '{P}annonces vendre Titre | prix | description · {P}annonces acheter Titre | budget | description · {P}annonces chercher mot · {P}annonces mes · {P}annonces retirer 5',
    run: async (c) => {
      const { args, reply, senderNum } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const maintenant = Date.now();
      const toutes = store.liste('petite').map((x) => ({ id: x.id, ...x.data })).filter((a) => a.exp > maintenant);
      const ligne = (a) => `${a.type === 'vendre' ? '🏷️' : '🔎'} *#${a.id}* ${a.titre}${a.prix ? ` — ${a.prix}` : ''}`;
      if (['vendre', 'acheter'].includes(sous)) {
        const [titre, prix, ...d] = parties(args.slice(1).join(' '));
        if (!titre) return reply(`✏️ ${p}annonces ${sous} ${sous === 'vendre' ? 'Téléphone Tecno | 45000 | Bon état' : 'Ordinateur portable | 150000'}`);
        if (toutes.filter((a) => a.auteur === senderNum).length >= 5) return reply('⚠️ 5 annonces actives maximum : retire-en une (.annonces retirer n°).');
        const id = suivant('petite');
        const num = pn(c);
        store.set('petite', id, { type: sous, titre: titre.slice(0, 80), prix: (prix || '').slice(0, 40), desc: d.join(' | ').slice(0, 400), auteur: senderNum, contact: num, ts: maintenant, exp: maintenant + 30 * 864e5 });
        return reply(`✅ Annonce *#${id}* publiée pour 30 jours.${num ? '' : '\n⚠️ Je n’ai pas ton numéro : précise-le dans la description pour être contacté.'}`);
      }
      if (sous === 'mes') {
        const l = toutes.filter((a) => a.auteur === senderNum);
        return reply(l.length ? '📋 *Tes annonces*\n' + l.map(ligne).join('\n') : '📋 Tu n’as aucune annonce active.');
      }
      if (['retirer', 'supprimer'].includes(sous)) {
        const a = store.get('petite', args[1]);
        if (!a) return reply('❓ Annonce introuvable.');
        if (a.auteur !== senderNum && !c.isOwner) return reply('⛔ Ce n’est pas ton annonce.');
        store.del('petite', args[1]);
        return reply('🗑️ Annonce retirée.');
      }
      if (sous === 'voir' || /^\d+$/.test(sous)) {
        const a = toutes.find((x) => String(x.id) === String(/^\d+$/.test(sous) ? sous : args[1]));
        if (!a) return reply('❓ Annonce introuvable ou expirée.');
        return reply(`${ligne(a)}\n${a.desc ? a.desc + '\n' : ''}📅 Publiée le ${dateLocale(a.ts)}${a.contact ? `\n💬 Contacter : https://wa.me/${a.contact}` : ''}`);
      }
      if (sous === 'chercher') {
        const mot = sansAccent(args.slice(1).join(' '));
        if (!mot) return reply(`✏️ ${p}annonces chercher téléphone`);
        const l = toutes.filter((a) => sansAccent(a.titre + ' ' + a.desc).includes(mot)).slice(-15);
        return reply(l.length ? '🔍 *Résultats*\n' + l.map(ligne).join('\n') + `\n\n${p}annonces <n°> pour le détail` : '🔍 Aucune annonce trouvée.');
      }
      const l = toutes.slice(-15).reverse();
      await reply(l.length ? '🛍️ *Petites annonces*\n\n' + l.map(ligne).join('\n') + `\n\n${p}annonces <n°> : détail et contact\n${p}annonces vendre … · ${p}annonces acheter …` : `🛍️ Aucune annonce pour le moment.\n${p}annonces vendre Titre | prix | description`);
    },
  },

  // ───────────── Suggestions ─────────────
  {
    categorie: cat,
    name: 'suggestion',
    aliases: ['idee', 'boiteaidees'],
    desc: 'Envoie une idée ou une remarque à l’équipe',
    run: async (c) => {
      const { sock, args, reply, senderNum, isOwner, jid, isGroup } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      if (['liste', 'supprimer'].includes(sous)) {
        if (!isOwner) return reply('⛔ Réservé au propriétaire.');
        if (sous === 'supprimer') return reply(store.del('sugg', args[1]) ? '🗑️ Supprimée.' : '❓ Introuvable.');
        const l = store.liste('sugg').slice(-15);
        return reply(l.length ? '💡 *Suggestions*\n' + l.map((x) => `#${x.id} (+${x.data.de}) ${x.data.texte}`).join('\n') : '💡 Aucune suggestion.');
      }
      const t = args.join(' ').trim();
      if (t.length < 5) return reply(`💡 ${p}suggestion ajoute une fonction pour ...`);
      if (tropVite('sugg' + senderNum, 60000)) return reply('⏳ Une suggestion par minute, merci.');
      const id = suivant('sugg');
      store.set('sugg', id, { de: senderNum, chat: isGroup ? jid : null, texte: t.slice(0, 600), ts: Date.now() });
      await reply(`🙏 Merci ! Ta suggestion *#${id}* est transmise.`);
      await prevenirProprio(sock, `💡 *Suggestion #${id}* de +${senderNum}\n${t.slice(0, 600)}`);
    },
  },

  // ───────────── Signalement ─────────────
  {
    ...G,
    name: 'signaler',
    aliases: ['report', 'alerter'],
    desc: 'Signale un message ou un membre aux admins (réponds au message)',
    run: async (c) => {
      const { sock, jid, msg, args, reply, sender, senderNum, metadata } = c;
      if (tropVite('sig' + jid + senderNum, 120000)) return reply('⏳ Merci, attends 2 minutes avant un nouveau signalement.');
      const cite = messageCite(msg);
      const motif = args.join(' ').trim() || 'non précisé';
      const admins = (metadata?.participants || []).filter(groupes.estAdminP).map((p) => p.id);
      if (!admins.length) return reply('⚠️ Je ne trouve pas les admins du groupe.');
      const visé = cite?.participant;
      const extrait = cite ? extraireTexte(cite.message).slice(0, 200) : '';
      if (c.botAdmin) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch {}
      }
      store.set('signalement', String(suivant('signalement')), { par: senderNum, jid, visé: visé ? numero(visé) : null, motif, extrait, ts: Date.now() });
      await sock.sendMessage(jid, { text: `🚨 *Signalement* (anonyme)\n${admins.map(tag).join(' ')}\n\nMotif : ${motif}${visé ? `\nConcerne : ${tag(visé)}` : ''}${extrait ? `\n« ${extrait} »` : ''}`, mentions: [...admins, ...(visé ? [visé] : [])] });
    },
  },

  // ───────────── Appel (présence) ─────────────
  {
    ...G,
    name: 'appel',
    aliases: ['presences', 'faireappel'],
    desc: 'Fait l’appel : les membres se déclarent présents',
    usage: '{P}appel ouvrir [titre] (admin) · {P}appel present (membres) · {P}appel liste · {P}appel fermer (admin) · {P}appel historique',
    run: async (c) => {
      const { sock, jid, args, reply, sender, senderNum } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      let a = store.get('appel', jid, null);
      const sauver = () => store.set('appel', jid, a);
      if (sous === 'ouvrir') {
        if (!adm(c)) return refus(c);
        a = { titre: args.slice(1).join(' ') || 'Appel', debut: Date.now(), presents: {}, ouvert: true };
        sauver();
        return sock.sendMessage(jid, { text: `✋ *${a.titre}* — l’appel est ouvert !\nTape *${p}appel present* pour te déclarer présent.`, mentions: membres(c) });
      }
      if (sous === 'historique') {
        const h = store.get('appelhist', jid, []);
        return reply(h.length ? '🗂️ *Derniers appels*\n' + h.slice(-8).reverse().map((x) => `• ${x.titre} — ${dateLocale(x.debut)} : ${x.presents}/${x.total} présents`).join('\n') : '🗂️ Aucun appel enregistré.');
      }
      if (!a) return reply(`✋ Aucun appel en cours. Un admin le lance avec ${p}appel ouvrir`);
      if (['present', 'présent', 'moi', 'p'].includes(sous)) {
        if (!a.ouvert) return reply('🔒 L’appel est clos.');
        if (a.presents[senderNum]) return reply('✅ Tu es déjà noté présent.');
        a.presents[senderNum] = { j: sender, ts: Date.now() };
        sauver();
        return reply(`✅ Présent ! (${Object.keys(a.presents).length}/${membres(c).length - 1})`);
      }
      const tous = membres(c).filter((j) => ![c.sock.user?.id, c.sock.user?.lid].filter(Boolean).map(numero).includes(numero(j)));
      const absents = tous.filter((j) => !a.presents[numero(j)]);
      if (sous === 'fermer') {
        if (!adm(c)) return refus(c);
        a.ouvert = false;
        sauver();
        const h = store.get('appelhist', jid, []);
        h.push({ titre: a.titre, debut: a.debut, presents: Object.keys(a.presents).length, total: tous.length });
        store.set('appelhist', jid, h.slice(-30));
        return sock.sendMessage(jid, { text: `🔒 *${a.titre}* — appel clos\n✅ Présents : ${Object.keys(a.presents).length}/${tous.length}\n\n❌ *Absents :*\n${absents.map(tag).join('\n') || '—'}`, mentions: absents });
      }
      await sock.sendMessage(jid, { text: `✋ *${a.titre}* ${a.ouvert ? '(ouvert)' : '(clos)'}\n\n✅ *Présents (${Object.keys(a.presents).length})*\n${Object.values(a.presents).map((x) => tag(x.j)).join('\n') || '—'}\n\n❌ *Pas encore (${absents.length})*\n${absents.map(tag).join(' ') || '—'}`, mentions: [...Object.values(a.presents).map((x) => x.j), ...absents] });
    },
  },

  // ───────────── Devoirs ─────────────
  {
    ...G,
    name: 'devoir',
    aliases: ['devoirs', 'travaux'],
    desc: 'Agenda des devoirs de la classe (avec rappel la veille à 18 h)',
    usage: '{P}devoir ajouter Maths | 05/11 | Exercices 3 à 7 (admin) · {P}devoir · {P}devoir fait 2 (admin)',
    run: async (c) => {
      const { sock, jid, args, reply } = c;
      const p = config.PREFIXE;
      const l = store.get('devoir', jid, []);
      const sous = (args[0] || '').toLowerCase();
      const sauver = () => store.set('devoir', jid, l);
      if (sous === 'ajouter') {
        if (!adm(c)) return refus(c);
        const [matiere, date, ...d] = parties(args.slice(1).join(' '));
        const q = parseQuand(date || '');
        if (!matiere || !q || q.erreur) return reply(`✏️ ${p}devoir ajouter Maths | 05/11 | Exercices 3 à 7`);
        const x = { id: suivant('devoir'), matiere, quand: q.quand, desc: d.join(' | ') };
        l.push(x);
        sauver();
        const rappel = q.quand - 14 * 3600000; // la veille à 18 h
        if (rappel > Date.now()) jobs.ajouter({ quand: rappel, type: 'rappel', data: { jid, texte: `📚 *Devoir pour demain* : ${matiere}${x.desc ? ' — ' + x.desc : ''}`, sess: sess(sock) }, cle: `devoir:${jid}:${x.id}` });
        return reply(`✅ Devoir ajouté : *${matiere}* pour le ${dateLocale(q.quand).split(' ')[0]}`);
      }
      if (['fait', 'retirer', 'supprimer'].includes(sous)) {
        if (!adm(c)) return refus(c);
        const t = l.filter((x) => x.quand > Date.now() - 864e5).sort((a, b) => a.quand - b.quand);
        const x = t[(parseInt(args[1], 10) || 0) - 1];
        if (!x) return reply('❓ Numéro invalide (voir la liste).');
        l.splice(l.indexOf(x), 1);
        jobs.supprimerCle(`devoir:${jid}:${x.id}`);
        sauver();
        return reply('🗑️ Devoir retiré.');
      }
      const t = l.filter((x) => x.quand > Date.now() - 864e5).sort((a, b) => a.quand - b.quand);
      await reply(t.length ? '📚 *Devoirs à rendre*\n\n' + t.map((x, i) => `${i + 1}. *${x.matiere}* — pour le ${dateLocale(x.quand).split(' ')[0]}${x.desc ? '\n   ' + x.desc : ''}`).join('\n') : '📚 Aucun devoir en attente. 🎉');
    },
  },

  // ───────────── Élections (vote) ─────────────
  {
    categorie: cat,
    metaSiGroupe: true,
    name: 'election',
    aliases: ['vote', 'elections'],
    desc: 'Organise un vote dans le groupe (vote en privé avec le bot)',
    usage: '{P}election creer Titre | choix 1 | choix 2 | … (admin, dans le groupe) · {P}election voter 3 2 (en PRIVÉ au bot : élection n°3, choix n°2) · {P}election resultat 3 · {P}election cloturer 3 (admin) · {P}election liste',
    run: async (c) => {
      const { sock, jid, args, reply, senderNum, isGroup, metadata, sender, candidats } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const sauver = (id, e) => store.set('election', id, e);
      const barre = (n, total) => '▓'.repeat(Math.round((n / Math.max(total, 1)) * 10)).padEnd(10, '░');
      const resultat = (id, e) => {
        const total = Object.keys(e.votes).length;
        const cpt = e.choix.map((_, i) => Object.values(e.votes).filter((v) => v === i).length);
        return `🗳️ *${e.titre}* (#${id}) — ${e.ouvert ? 'en cours' : 'clos'}\n\n` + e.choix.map((ch, i) => `${i + 1}. ${ch}\n   ${barre(cpt[i], total)} ${cpt[i]} vote${cpt[i] > 1 ? 's' : ''}${total ? ` (${Math.round((cpt[i] / total) * 100)} %)` : ''}`).join('\n') + `\n\n👥 ${total} votant${total > 1 ? 's' : ''}`;
      };
      if (sous === 'creer') {
        if (!isGroup) return reply('👥 Crée l’élection dans le groupe concerné.');
        if (!adm(c)) return refus(c);
        const [titre, ...choix] = parties(args.slice(1).join(' '));
        if (!titre || choix.length < 2 || choix.length > 12) return reply(`✏️ ${p}election creer Président du club | Paul | Marie | Jean`);
        const id = suivant('election');
        sauver(id, { jid, titre, choix, votes: {}, ouvert: true, ts: Date.now() });
        let me = '';
        try { me = (sock.user.id || '').split(':')[0].split('@')[0]; } catch {}
        return sock.sendMessage(jid, { text: `🗳️ *ÉLECTION #${id} — ${titre}*\n\n${choix.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n🔒 Vote secret : écris EN PRIVÉ à ce bot (wa.me/${me}) :\n*${p}election voter ${id} <numéro du choix>*\n\nRésultats à la clôture.`, mentions: membres(c) });
      }
      if (sous === 'liste') {
        const l = store.liste('election').filter((x) => x.data.ouvert && (!isGroup || x.data.jid === jid));
        return reply(l.length ? '🗳️ *Élections en cours*\n' + l.map((x) => `#${x.id} — ${x.data.titre}`).join('\n') : '🗳️ Aucune élection en cours.');
      }
      const id = args[1];
      const e = id && store.get('election', id);
      if (!e) return reply(`❓ Élection introuvable. ${p}election liste`);
      if (sous === 'voter') {
        if (!e.ouvert) return reply('🔒 Cette élection est close.');
        const n = parseInt(args[2], 10);
        if (!n || n > e.choix.length) return reply(`✏️ ${p}election voter ${id} <1 à ${e.choix.length}>`);
        let meta = isGroup && jid === e.jid ? metadata : null;
        try {
          meta = meta || (await groupes.metadata(sock, e.jid));
        } catch {
          return reply('⚠️ Je ne peux pas vérifier ton appartenance au groupe pour le moment.');
        }
        if (!groupes.estMembre(meta, senderNum) && !candidats.some((x) => groupes.estMembre(meta, x))) return reply('⛔ Seuls les membres du groupe peuvent voter.');
        if (e.votes[senderNum] !== undefined) return reply('✅ Tu as déjà voté. Merci !');
        e.votes[senderNum] = n - 1;
        sauver(id, e);
        if (isGroup) {
          try { await sock.sendMessage(jid, { delete: c.msg.key }); } catch {}
          return sock.sendMessage(jid, { text: `✅ ${tag(sender)} a voté (conseil : vote en privé la prochaine fois).`, mentions: [sender] });
        }
        return reply(`✅ Vote enregistré pour *${e.choix[n - 1]}*. Merci !`);
      }
      if (sous === 'resultat') {
        if (e.ouvert && !(c.isOwner || (isGroup && jid === e.jid && c.isAdmin))) return reply('🔒 Les résultats sont donnés à la clôture.');
        return reply(resultat(id, e));
      }
      if (sous === 'cloturer') {
        if (!(isGroup && jid === e.jid && adm(c))) return reply('⛔ Réservé aux admins, dans le groupe concerné.');
        e.ouvert = false;
        sauver(id, e);
        return reply(resultat(id, e));
      }
      await reply(`✏️ ${p}election voter ${id} <numéro> (en privé) · ${p}election resultat ${id} · ${p}election cloturer ${id}`);
    },
  },

  // ───────────── Membres inactifs ─────────────
  {
    ...G,
    name: 'inactifs',
    aliases: ['silencieux', 'inactif'],
    desc: 'Liste les membres qui n’ont pas écrit depuis N jours',
    adminOnly: true,
    run: async ({ jid, args, reply, metadata, sock }) => {
      const jours = Math.min(365, parseInt(args[0], 10) || 30);
      const mention = args.includes('mentionner');
      const entrees = store.liste('actif').filter((x) => x.id.startsWith(jid + '|'));
      if (!entrees.length) return reply('ℹ️ Je viens de commencer à suivre l’activité de ce groupe : reviens dans quelques jours.');
      const depuis = Math.min(...entrees.map((x) => x.data.ts));
      const dernier = Object.fromEntries(entrees.map((x) => [x.id.slice(jid.length + 1), x.data.ts]));
      const moi = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numero);
      const limite = Date.now() - jours * 864e5;
      const l = (metadata?.participants || []).filter((p) => !groupes.estAdminP(p) && !moi.includes(numero(p.id)) && !((dernier[numero(p.id)] || 0) > limite));
      const note = `_Suivi de l’activité depuis le ${dateLocale(depuis).split(' ')[0]} : avant cette date, je ne sais pas._`;
      if (!l.length) return reply(`🎉 Tous les membres ont été actifs ces ${jours} derniers jours.\n${note}`);
      const texte = `😴 *Inactifs depuis ${jours} jours ou plus (${l.length})*\n\n` + l.slice(0, 60).map((p) => `• ${mention ? tag(p.id) : '+' + numero(p.id)}${dernier[numero(p.id)] ? ' — vu le ' + dateLocale(dernier[numero(p.id)]).split(' ')[0] : ' — jamais vu'}`).join('\n') + (l.length > 60 ? `\n… et ${l.length - 60} autres` : '') + `\n\n${note}`;
      await sock.sendMessage(jid, { text: texte, mentions: mention ? l.slice(0, 60).map((p) => p.id) : [] });
    },
  },

  // ───────────── Annuaire du groupe ─────────────
  {
    ...G,
    name: 'annuaire',
    aliases: ['repertoire', 'metiers'],
    desc: 'Annuaire des membres : métier, ville, contact',
    usage: '{P}annuaire ajouter Nom | Métier | Téléphone | Ville · {P}annuaire chercher plombier · {P}annuaire · {P}annuaire retirer 3',
    run: async (c) => {
      const { jid, args, reply, senderNum } = c;
      const p = config.PREFIXE;
      const l = store.get('annuaire', jid, []);
      const sous = (args[0] || '').toLowerCase();
      const sauver = () => store.set('annuaire', jid, l);
      const ligne = (e, i) => `${i + 1}. *${e.nom}* — ${e.metier}${e.ville ? ' (' + e.ville + ')' : ''}${e.tel ? '\n    📞 https://wa.me/' + e.tel.replace(/\D/g, '') : ''}`;
      if (sous === 'ajouter') {
        const [nom, metier, tel, ville] = parties(args.slice(1).join(' '));
        if (!nom || !metier) return reply(`✏️ ${p}annuaire ajouter Jean Mavoungou | Électricien | 242061234567 | Brazzaville`);
        if (l.filter((e) => e.par === senderNum).length >= (c.isAdmin ? 50 : 2)) return reply('⚠️ Limite atteinte : retire une ancienne fiche (.annuaire retirer n°).');
        l.push({ nom: nom.slice(0, 60), metier: metier.slice(0, 60), tel: (tel || '').slice(0, 20), ville: (ville || '').slice(0, 40), par: senderNum });
        sauver();
        return reply(`✅ Fiche ajoutée (n°${l.length}).`);
      }
      if (['retirer', 'supprimer'].includes(sous)) {
        const n = parseInt(args[1], 10);
        if (!n || !l[n - 1]) return reply('❓ Numéro invalide.');
        if (l[n - 1].par !== senderNum && !adm(c)) return reply('⛔ Tu ne peux retirer que tes propres fiches.');
        l.splice(n - 1, 1);
        sauver();
        return reply('🗑️ Fiche retirée.');
      }
      if (!l.length) return reply(`📒 Annuaire vide. ${p}annuaire ajouter Nom | Métier | Téléphone | Ville`);
      if (sous === 'chercher') {
        const mot = sansAccent(args.slice(1).join(' '));
        const r = l.map((e, i) => ({ e, i })).filter((x) => sansAccent(`${x.e.nom} ${x.e.metier} ${x.e.ville}`).includes(mot));
        return reply(r.length ? `🔍 *Résultats*\n\n` + r.slice(0, 10).map((x) => ligne(x.e, x.i)).join('\n') : '🔍 Aucune fiche trouvée.');
      }
      await reply(`📒 *Annuaire du groupe* (${l.length})\n\n` + l.slice(0, 30).map(ligne).join('\n') + `\n\n${p}annuaire chercher <mot>`);
    },
  },
];
