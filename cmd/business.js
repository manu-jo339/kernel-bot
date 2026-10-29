// Kernel Bot — outils pour petits commerces : catalogue, commandes, stock, rendez-vous, dettes, factures, CV, licences…
const fs = require('fs');
const path = require('path');
const config = require('../config');
const store = require('../lib/store');
const jobs = require('../lib/jobs');
const permissions = require('../lib/permissions');
const reglages = require('../lib/reglages');
const pdf = require('../lib/pdf');
const { parseQuand } = require('../lib/temps');
const { numero, dateLocale, telecharger, messageMedia, parseDuree, formatDuree } = require('../lib/utils');

const base = { categorie: 'Business' };
const fr = (n) => pdf.montant(n).replace(/ /g, ' ');
const DOSSIER_MEDIAS = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'catalogue');
const gere = (c) => c.isOwner || c.isPremium; // propriétaire ou personne de confiance
const jidDe = (n) => numero(n) + '@s.whatsapp.net';
const prochainNumero = (ns) => store.modifier('compteur', ns, { n: 0 }, (c) => { c.n += 1; }).n;
const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const devise = () => store.get('entreprise', 'principal', {}).devise || 'FCFA';
const nomEntreprise = () => store.get('entreprise', 'principal', {}).nom || config.NOM_BOT;

// « Nom | prix | description » -> parties
const parties = (t) => t.split('|').map((x) => x.trim());
const reservé = (reply) => reply('⛔ Réservé au propriétaire du bot.');

// Envoie un message au propriétaire (notifications de commande, de rendez-vous…)
async function prevenirProprio(sock, texte) {
  for (const n of config.OWNERS.slice(0, 2)) {
    try {
      await sock.sendMessage(jidDe(n), { text: texte });
    } catch (e) {
      console.error('[business] notification impossible :', e.message);
    }
  }
}

module.exports = [
  // ───────────── Catalogue ─────────────
  {
    ...base,
    name: 'catalogue',
    aliases: ['produits', 'boutique'],
    desc: 'Catalogue des produits et services (prix, photos)',
    usage: 'Tous : {P}catalogue · {P}catalogue 2 (détail + photo)\nGestionnaire : {P}catalogue ajouter Nom | prix | description (en répondant à une photo pour l’ajouter) · {P}catalogue modifier 2 prix 7000 · {P}catalogue retirer 2 · {P}catalogue vider',
    run: async (c) => {
      const { sock, jid, msg, args, reply } = c;
      const p = config.PREFIXE;
      const liste = store.get('catalogue', 'principal', []);
      const sous = (args[0] || '').toLowerCase();
      const ecrire = (l) => store.set('catalogue', 'principal', l);
      if (['ajouter', 'retirer', 'supprimer', 'modifier', 'vider'].includes(sous)) {
        if (!gere(c)) return reservé(reply);
        if (sous === 'ajouter') {
          const [nom, prix, ...desc] = parties(args.slice(1).join(' '));
          const px = parseFloat(String(prix || '').replace(/\s/g, '').replace(',', '.'));
          if (!nom || !(px >= 0)) return reply(`✏️ ${p}catalogue ajouter Nom | prix | description\nExemple : ${p}catalogue ajouter Riz 25 kg | 15000 | Riz parfumé`);
          const id = Date.now().toString(36);
          const art = { id, nom, prix: px, desc: desc.join(' | ') };
          if (messageMedia(msg)?.type === 'imageMessage') {
            try {
              const f = await telecharger(sock, msg);
              fs.mkdirSync(DOSSIER_MEDIAS, { recursive: true });
              art.image = `${id}.jpg`;
              fs.writeFileSync(path.join(DOSSIER_MEDIAS, art.image), f.buffer);
            } catch (e) {
              console.error('[catalogue] photo :', e.message);
            }
          }
          liste.push(art);
          ecrire(liste);
          return reply(`✅ Article ${liste.length} ajouté : ${nom} — ${fr(px)} ${devise()}${art.image ? ' 📷' : ''}`);
        }
        if (sous === 'vider') {
          ecrire([]);
          return reply('🗑️ Catalogue vidé.');
        }
        const n = parseInt(args[1], 10);
        if (!n || n > liste.length) return reply('❓ Numéro d’article invalide.');
        if (sous === 'modifier') {
          const champ = (args[2] || '').toLowerCase();
          const val = args.slice(3).join(' ').trim();
          if (champ === 'prix') liste[n - 1].prix = parseFloat(val.replace(/\s/g, '').replace(',', '.')) || liste[n - 1].prix;
          else if (champ === 'nom' && val) liste[n - 1].nom = val;
          else if (champ === 'description' && val) liste[n - 1].desc = val;
          else return reply(`✏️ ${p}catalogue modifier ${n} prix|nom|description nouvelle valeur`);
          ecrire(liste);
          return reply('✅ Article modifié.');
        }
        liste.splice(n - 1, 1);
        ecrire(liste);
        return reply('🗑️ Article retiré.');
      }
      if (!liste.length) return reply(gere(c) ? `🛍️ Catalogue vide. Ajoute un article :\n${p}catalogue ajouter Nom | prix | description` : '🛍️ Le catalogue est vide pour le moment.');
      const n = parseInt(sous, 10);
      if (n) {
        const a = liste[n - 1];
        if (!a) return reply('❓ Cet article n’existe pas.');
        const texte = `*${a.nom}*\n💰 ${fr(a.prix)} ${devise()}${a.desc ? '\n' + a.desc : ''}\n\n🛒 Commander : ${p}commander ${n}`;
        const f = a.image && path.join(DOSSIER_MEDIAS, a.image);
        if (f && fs.existsSync(f)) return sock.sendMessage(jid, { image: fs.readFileSync(f), caption: texte }, { quoted: msg });
        return reply(texte);
      }
      await reply(`🛍️ *Catalogue — ${nomEntreprise()}*\n\n` + liste.map((a, i) => `${i + 1}. *${a.nom}* — ${fr(a.prix)} ${devise()}${a.image ? ' 📷' : ''}`).join('\n') + `\n\n${p}catalogue <n°> : détail et photo\n${p}commander 1, 3x2 : passer commande`);
    },
  },
  {
    ...base,
    name: 'commander',
    aliases: ['commande', 'acheter'],
    desc: 'Passe une commande depuis le catalogue : .commander 1, 3x2',
    usage: 'Client : {P}commander 1, 3x2 (article 1 une fois, article 3 deux fois) · {P}commander mes\nGestionnaire : {P}commander liste · {P}commander etat 5 livre',
    run: async (c) => {
      const { sock, jid, args, reply, senderNum, sender } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const cmds = store.liste('commande').map((x) => ({ id: +x.id, ...x.data }));
      if (sous === 'liste' && gere(c)) {
        const l = cmds.filter((x) => !['livré', 'annulé'].includes(x.etat)).slice(-20);
        return reply(l.length ? '📦 *Commandes en cours*\n' + l.map((x) => `#${x.id} — +${x.client} — ${fr(x.total)} ${devise()} — ${x.etat}`).join('\n') : '📦 Aucune commande en cours.');
      }
      if (sous === 'etat' && gere(c)) {
        const x = store.get('commande', args[1]);
        const etat = (args[2] || '').toLowerCase().replace('livre', 'livré').replace('annule', 'annulé').replace('confirme', 'confirmé').replace('prete', 'prête');
        if (!x || !etat) return reply(`✏️ ${p}commander etat <n°> confirmé | prête | livré | annulé`);
        x.etat = etat;
        store.set('commande', args[1], x);
        try {
          await sock.sendMessage(x.chat, { text: `📦 Ta commande *#${args[1]}* est maintenant : *${etat}*.` });
        } catch {}
        return reply(`✅ Commande #${args[1]} : ${etat} (le client est prévenu).`);
      }
      if (sous === 'mes' || sous === 'mescommandes') {
        const l = cmds.filter((x) => x.client === senderNum).slice(-10);
        return reply(l.length ? '📦 *Tes commandes*\n' + l.map((x) => `#${x.id} — ${fr(x.total)} ${devise()} — ${x.etat}`).join('\n') : '📦 Tu n’as pas encore commandé.');
      }
      const cat = store.get('catalogue', 'principal', []);
      if (!cat.length) return reply('🛍️ Le catalogue est vide.');
      if (!args.length) return reply(`🛒 ${p}commander 1, 3x2\n(article n°1 une fois, article n°3 deux fois — voir ${p}catalogue)`);
      const lignes = [];
      for (const tok of args.join(' ').split(/[,;]+|\s+et\s+/).map((x) => x.trim()).filter(Boolean)) {
        const m = tok.match(/^(\d+)\s*(?:[x*×]\s*(\d+))?$/i);
        if (!m || !cat[+m[1] - 1]) return reply(`❓ « ${tok} » : article inconnu. Regarde ${p}catalogue.`);
        const qte = Math.min(999, parseInt(m[2] || '1', 10));
        const a = cat[+m[1] - 1];
        lignes.push({ nom: a.nom, prix: a.prix, qte });
      }
      const total = lignes.reduce((s, l) => s + l.prix * l.qte, 0);
      const id = prochainNumero('commande');
      store.set('commande', id, { client: senderNum, chat: jid, sender, lignes, total, etat: 'reçue', ts: Date.now() });
      const recap = lignes.map((l) => `• ${l.qte} × ${l.nom} — ${fr(l.prix * l.qte)} ${devise()}`).join('\n');
      await reply(`✅ *Commande #${id} enregistrée*\n\n${recap}\n\n💰 *Total : ${fr(total)} ${devise()}*\n\nNous te contactons très vite pour la confirmation et la livraison.`);
      await prevenirProprio(sock, `🛒 *Nouvelle commande #${id}*\nClient : +${senderNum}\n${recap}\n💰 Total : ${fr(total)} ${devise()}\n\nGérer : ${p}commander etat ${id} confirmé | prête | livré | annulé`);
    },
  },
  {
    ...base,
    name: 'horaires',
    aliases: ['ouverture'],
    desc: 'Horaires d’ouverture',
    usage: '{P}horaires · gestionnaire : {P}horaires definir Lun-Ven 8h-17h | Sam 8h-12h | Dim fermé',
    run: async (c) => {
      const { args, reply } = c;
      if ((args[0] || '').toLowerCase() === 'definir') {
        if (!gere(c)) return reservé(reply);
        const l = args.slice(1).join(' ').split('|').map((x) => x.trim()).filter(Boolean);
        if (!l.length) return reply(`✏️ ${config.PREFIXE}horaires definir Lun-Ven 8h-17h | Sam 8h-12h | Dim fermé`);
        store.set('horaires', 'principal', l);
        return reply('✅ Horaires enregistrés.');
      }
      const l = store.get('horaires', 'principal', []);
      await reply(l.length ? `🕒 *Horaires — ${nomEntreprise()}*\n\n` + l.map((x) => '• ' + x).join('\n') : '🕒 Les horaires ne sont pas encore renseignés.');
    },
  },
  {
    ...base,
    name: 'faq',
    aliases: ['questions', 'info_faq'],
    desc: 'Questions fréquentes : .faq livraison',
    usage: '{P}faq · {P}faq <mot> · gestionnaire : {P}faq ajouter Question | Réponse · {P}faq retirer 2',
    run: async (c) => {
      const { args, reply } = c;
      const p = config.PREFIXE;
      const l = store.get('faq', 'principal', []);
      const sous = (args[0] || '').toLowerCase();
      if (['ajouter', 'retirer', 'vider'].includes(sous)) {
        if (!gere(c)) return reservé(reply);
        if (sous === 'ajouter') {
          const [q, ...r] = parties(args.slice(1).join(' '));
          if (!q || !r.length) return reply(`✏️ ${p}faq ajouter Question | Réponse`);
          l.push({ q, r: r.join(' | ') });
          store.set('faq', 'principal', l);
          return reply(`✅ Question ${l.length} ajoutée.`);
        }
        if (sous === 'vider') return store.set('faq', 'principal', []) && reply('🗑️ FAQ vidée.');
        const n = parseInt(args[1], 10);
        if (!n || n > l.length) return reply('❓ Numéro invalide.');
        l.splice(n - 1, 1);
        store.set('faq', 'principal', l);
        return reply('🗑️ Question retirée.');
      }
      if (!l.length) return reply('❓ La FAQ est vide pour le moment.');
      if (!args.length) return reply('❓ *Questions fréquentes*\n\n' + l.map((x, i) => `${i + 1}. ${x.q}`).join('\n') + `\n\n${p}faq <n°> ou ${p}faq <mot> pour la réponse`);
      const n = parseInt(sous, 10);
      const mot = sansAccent(args.join(' '));
      const trouves = n ? [l[n - 1]].filter(Boolean) : l.filter((x) => sansAccent(x.q + ' ' + x.r).includes(mot));
      if (!trouves.length) return reply('🔍 Rien trouvé. Tape ' + p + 'faq pour voir toutes les questions.');
      await reply(trouves.slice(0, 3).map((x) => `❓ *${x.q}*\n${x.r}`).join('\n\n'));
    },
  },

  // ───────────── Factures et devis (PDF) ─────────────
  {
    ...base,
    name: 'facture',
    aliases: ['devis', 'invoice'],
    desc: 'Crée une facture ou un devis en PDF',
    ownerOnly: true,
    usage: '{P}facture Nom du client | Riz x2 @15000 ; Huile x1 @3500\n{P}devis … (même format)\nPremière fois : {P}facture entreprise Ma Société | Adresse | Téléphone | Email | NIF',
    run: async ({ sock, jid, msg, args, reply, nomUtilise }) => {
      const p = config.PREFIXE;
      if ((args[0] || '').toLowerCase() === 'entreprise') {
        const [nom, adresse, tel, email, nif] = parties(args.slice(1).join(' '));
        if (!nom) return reply(`✏️ ${p}facture entreprise Ma Société | Adresse | Téléphone | Email | NIF`);
        store.set('entreprise', 'principal', { ...store.get('entreprise', 'principal', {}), nom, adresse, tel, email, nif });
        return reply('✅ Informations de l’entreprise enregistrées (elles apparaîtront sur les documents).');
      }
      const [client, lignesBrut] = parties(args.join(' '));
      if (!client || !lignesBrut) return reply(`✏️ ${p}facture Nom du client | Riz x2 @15000 ; Huile x1 @3500\n(x = quantité, @ = prix unitaire, ; sépare les lignes)`);
      const lignes = [];
      for (const part of lignesBrut.split(';').map((x) => x.trim()).filter(Boolean)) {
        const m = part.match(/^(.+?)\s*(?:[x×*]\s*(\d+(?:[.,]\d+)?))?\s*@\s*([\d\s.,]+)$/i);
        if (!m) return reply(`❓ Ligne illisible : « ${part} ». Format : Désignation x2 @15000`);
        lignes.push({ nom: m[1].trim(), qte: parseFloat((m[2] || '1').replace(',', '.')), prix: parseFloat(m[3].replace(/\s/g, '').replace(',', '.')) });
      }
      const type = nomUtilise === 'devis' ? 'DEVIS' : 'FACTURE';
      const an = new Date().getFullYear();
      const n = prochainNumero(type === 'DEVIS' ? 'devis' : 'facture');
      const numeroDoc = `${an}-${String(n).padStart(3, '0')}`;
      const buffer = await pdf.facture({ type, numero: numeroDoc, date: dateLocale(Date.now()).split(' ')[0], entreprise: store.get('entreprise', 'principal', {}), client, lignes, devise: devise(), note: type === 'DEVIS' ? 'Devis valable 30 jours.' : 'Merci pour votre confiance.' });
      await sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: `${type.toLowerCase()}-${numeroDoc}.pdf`, caption: `📄 ${type} N° ${numeroDoc}` }, { quoted: msg });
    },
  },

  // ───────────── Stock ─────────────
  {
    ...base,
    name: 'stock',
    aliases: ['inventaire'],
    desc: 'Gère ton stock : entrées, sorties, alertes de rupture',
    ownerOnly: true,
    usage: '{P}stock · {P}stock ajouter riz 50 [seuil 10] · {P}stock entree riz 20 · {P}stock sortie riz 5 · {P}stock alerte · {P}stock retirer riz',
    run: async ({ args, reply }) => {
      const p = config.PREFIXE;
      const l = store.get('stock', 'principal', {});
      const sous = (args[0] || '').toLowerCase();
      const cle = (t) => sansAccent(t).trim();
      const ecrire = () => store.set('stock', 'principal', l);
      const ligne = (a) => `${a.nom} : *${a.qte}*${a.seuil && a.qte <= a.seuil ? ' ⚠️ bas' : ''}`;
      if (!args.length || sous === 'liste') {
        const v = Object.values(l);
        return reply(v.length ? '📦 *Stock*\n' + v.map((a) => '• ' + ligne(a)).join('\n') : `📦 Stock vide. ${p}stock ajouter riz 50 seuil 10`);
      }
      if (sous === 'alerte') {
        const v = Object.values(l).filter((a) => a.seuil && a.qte <= a.seuil);
        return reply(v.length ? '⚠️ *À réapprovisionner*\n' + v.map((a) => '• ' + ligne(a)).join('\n') : '✅ Aucun produit sous le seuil.');
      }
      // Dernier nombre = quantité ; « seuil N » facultatif
      const texte = args.slice(1).join(' ');
      const seuilM = texte.match(/\bseuil\s+(\d+)/i);
      const sansSeuil = texte.replace(/\bseuil\s+\d+/i, '').trim();
      const m = sansSeuil.match(/^(.+?)\s+(-?\d+(?:[.,]\d+)?)$/);
      if (sous === 'retirer' || sous === 'supprimer') {
        const k = cle(texte);
        if (!l[k]) return reply('❓ Produit inconnu.');
        delete l[k];
        ecrire();
        return reply('🗑️ Produit retiré du stock.');
      }
      if (!['ajouter', 'entree', 'entrée', 'sortie', 'vente'].includes(sous) || !m) return reply(`✏️ ${p}stock ajouter riz 50 seuil 10\n${p}stock entree riz 20\n${p}stock sortie riz 5`);
      const nom = m[1].trim(), q = parseFloat(m[2].replace(',', '.')), k = cle(nom);
      if (sous === 'ajouter') {
        l[k] = { nom, qte: q, seuil: seuilM ? parseInt(seuilM[1], 10) : l[k]?.seuil || 0 };
      } else {
        if (!l[k]) return reply(`❓ « ${nom} » n’est pas en stock. Ajoute-le d’abord (${p}stock ajouter).`);
        l[k].qte += sous.startsWith('entr') ? q : -q;
        if (l[k].qte < 0) {
          l[k].qte += sous.startsWith('entr') ? -q : q;
          return reply(`⚠️ Stock insuffisant : il reste ${l[k].qte} ${nom}.`);
        }
      }
      ecrire();
      await reply(`✅ ${ligne(l[k])}${l[k].seuil && l[k].qte <= l[k].seuil ? '\n⚠️ Sous le seuil d’alerte : pense à réapprovisionner.' : ''}`);
    },
  },

  // ───────────── Rendez-vous ─────────────
  {
    ...base,
    name: 'rdv',
    aliases: ['rendezvous'],
    desc: 'Prise de rendez-vous : .rdv 30/10 15h consultation',
    usage: 'Client : {P}rdv 30/10 15h motif · {P}rdv mes · {P}rdv annuler 3\nGestionnaire : {P}rdv liste · {P}rdv confirmer 3 · {P}rdv refuser 3 raison',
    run: async (c) => {
      const { sock, jid, args, reply, senderNum, sender } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const tous = store.liste('rdv').map((x) => ({ id: x.id, ...x.data }));
      const futur = (x) => x.quand > Date.now() && !['annulé', 'refusé'].includes(x.etat);
      if (sous === 'liste' && gere(c)) {
        const l = tous.filter(futur).sort((a, b) => a.quand - b.quand).slice(0, 25);
        return reply(l.length ? '📅 *Rendez-vous à venir*\n' + l.map((x) => `#${x.id} — ${dateLocale(x.quand)} — +${x.client} — ${x.motif} [${x.etat}]`).join('\n') : '📅 Aucun rendez-vous à venir.');
      }
      if (sous === 'mes') {
        const l = tous.filter((x) => x.client === senderNum && futur(x));
        return reply(l.length ? '📅 *Tes rendez-vous*\n' + l.map((x) => `#${x.id} — ${dateLocale(x.quand)} — ${x.motif} [${x.etat}]`).join('\n') : '📅 Tu n’as aucun rendez-vous à venir.');
      }
      if (['confirmer', 'refuser', 'annuler'].includes(sous)) {
        const x = store.get('rdv', args[1]);
        if (!x) return reply('❓ Numéro de rendez-vous inconnu.');
        const proprio = x.client === senderNum;
        if (!(gere(c) || (sous === 'annuler' && proprio))) return reply('⛔ Tu ne peux pas modifier ce rendez-vous.');
        x.etat = sous === 'confirmer' ? 'confirmé' : sous === 'refuser' ? 'refusé' : 'annulé';
        store.set('rdv', args[1], x);
        jobs.supprimerCle('rdv:' + args[1]);
        if (sous === 'confirmer') {
          if (x.quand - Date.now() > 3600000 * 1.2) jobs.ajouter({ quand: x.quand - 3600000, type: 'rappel', data: { jid: x.chat, qui: x.sender, texte: `Rendez-vous dans 1 heure (${x.motif}) à ${dateLocale(x.quand)}`, sess: sock.sessionId || 'principal' }, cle: 'rdv:' + args[1] });
        }
        const raison = sous === 'refuser' ? args.slice(2).join(' ') : '';
        try {
          if (!proprio) await sock.sendMessage(x.chat, { text: `📅 Ton rendez-vous *#${args[1]}* (${dateLocale(x.quand)}) est *${x.etat}*.${raison ? '\nMotif : ' + raison : ''}${sous === 'confirmer' ? '\nJe te rappellerai 1 heure avant.' : ''}` });
          else await prevenirProprio(sock, `📅 Le client +${x.client} a annulé le rendez-vous #${args[1]} (${dateLocale(x.quand)}).`);
        } catch {}
        return reply(`✅ Rendez-vous #${args[1]} : ${x.etat}.`);
      }
      if (!args.length) return reply(`📅 ${p}rdv 30/10 15h consultation\n${p}rdv demain 9h devis\n${p}rdv mes · ${p}rdv annuler <n°>`);
      const q = parseQuand(args.join(' '));
      if (!q || q.erreur || !q.reste) return reply(`❓ Donne une date, une heure et un motif. Exemple : ${p}rdv 30/10 15h consultation`);
      const id = prochainNumero('rdv');
      store.set('rdv', id, { client: senderNum, chat: jid, sender, quand: q.quand, motif: q.reste.slice(0, 200), etat: 'en attente', ts: Date.now() });
      await reply(`✅ *Demande de rendez-vous #${id}* enregistrée\n📅 ${dateLocale(q.quand)}\n📝 ${q.reste}\n\nTu seras prévenu dès qu’il est confirmé.`);
      await prevenirProprio(sock, `📅 *Nouvelle demande de rendez-vous #${id}*\nClient : +${senderNum}\nQuand : ${dateLocale(q.quand)}\nMotif : ${q.reste}\n\n${p}rdv confirmer ${id}  ·  ${p}rdv refuser ${id} raison`);
    },
  },

  // ───────────── Dettes (suivi personnel) ─────────────
  {
    ...base,
    name: 'dette',
    aliases: ['dettes', 'credit'],
    desc: 'Suivi de tes dettes et créances (privé)',
    usage: '{P}dette ajouter Paul 5000 [note] (Paul me doit) · {P}dette doit Paul 3000 (je dois à Paul) · {P}dette paye Paul 2000 · {P}dette liste · {P}dette solde · {P}dette effacer Paul · {P}dette rappel Paul',
    run: async ({ args, reply, senderNum }) => {
      const p = config.PREFIXE;
      const d = store.get('dette', senderNum, {});
      const sous = (args[0] || '').toLowerCase();
      const ecrire = () => store.set('dette', senderNum, d);
      const k = (n) => sansAccent(n);
      const parse = (reste) => {
        const m = reste.join(' ').match(/^(.+?)\s+(\d[\d\s.,]*)(?:\s+(.*))?$/);
        return m ? { nom: m[1].trim(), montant: parseFloat(m[2].replace(/\s/g, '').replace(',', '.')), note: m[3] } : null;
      };
      const solde = (v) => (v.montant > 0 ? `${v.nom} te doit *${fr(v.montant)}*` : `tu dois *${fr(-v.montant)}* à ${v.nom}`);
      if (!args.length || sous === 'liste') {
        const v = Object.values(d).filter((x) => x.montant);
        return reply(v.length ? '💳 *Dettes et créances*\n' + v.map((x) => `• ${solde(x)} ${devise()}${x.note ? ' _(' + x.note + ')_' : ''}`).join('\n') : `💳 Rien en cours.\n${p}dette ajouter Paul 5000`);
      }
      if (sous === 'solde') {
        const v = Object.values(d);
        const du = v.filter((x) => x.montant > 0).reduce((s, x) => s + x.montant, 0);
        const dois = v.filter((x) => x.montant < 0).reduce((s, x) => s - x.montant, 0);
        return reply(`💳 On te doit : *${fr(du)} ${devise()}*\n💳 Tu dois : *${fr(dois)} ${devise()}*\n📊 Solde : *${fr(du - dois)} ${devise()}*`);
      }
      if (sous === 'effacer') {
        const nom = args.slice(1).join(' ');
        if (!d[k(nom)]) return reply('❓ Personne inconnue.');
        delete d[k(nom)];
        ecrire();
        return reply('🗑️ Effacé.');
      }
      if (sous === 'rappel') {
        const v = d[k(args.slice(1).join(' '))];
        if (!v || v.montant <= 0) return reply('❓ Cette personne ne te doit rien.');
        return reply(`📨 *Message à lui envoyer :*\n\nBonjour ${v.nom}, j’espère que tu vas bien. Petit rappel amical : il reste ${fr(v.montant)} ${devise()} à régler. Merci de me dire quand tu peux le faire. 🙏`);
      }
      const x = parse(args.slice(1));
      if (!['ajouter', 'doit', 'paye', 'payé'].includes(sous) || !x || !(x.montant > 0)) return reply(`✏️ ${p}dette ajouter Paul 5000 (il me doit)\n${p}dette doit Paul 3000 (je lui dois)\n${p}dette paye Paul 2000 (règlement)`);
      const cle = k(x.nom);
      const v = d[cle] || { nom: x.nom, montant: 0 };
      if (sous === 'ajouter') v.montant += x.montant;
      else if (sous === 'doit') v.montant -= x.montant;
      else v.montant = v.montant > 0 ? Math.max(0, v.montant - x.montant) : Math.min(0, v.montant + x.montant);
      if (x.note) v.note = x.note;
      d[cle] = v;
      ecrire();
      await reply(v.montant === 0 ? `✅ Compte soldé avec ${v.nom}.` : `✅ ${solde(v)} ${devise()}.`);
    },
  },

  // ───────────── Carte de visite, CV, lettre ─────────────
  {
    ...base,
    name: 'carte',
    aliases: ['cartevisite', 'contactcarte'],
    desc: 'Crée une carte de visite (contact WhatsApp) : .carte Nom | Titre | Tél | Email',
    run: async ({ sock, jid, msg, args, reply }) => {
      const [nom, titre, tel, email] = parties(args.join(' '));
      if (!nom || !tel) return reply(`✏️ ${config.PREFIXE}carte Jean Mavoungou | Électricien | 242061234567 | jean@mail.com`);
      const n = tel.replace(/\D/g, '');
      if (n.length < 8) return reply('❓ Numéro de téléphone invalide (format international : 242061234567).');
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${nom}\n${titre ? `ORG:${titre}\nTITLE:${titre}\n` : ''}TEL;type=CELL;waid=${n}:+${n}\n${email ? `EMAIL:${email}\n` : ''}END:VCARD`;
      await sock.sendMessage(jid, { contacts: { displayName: nom, contacts: [{ vcard }] } }, { quoted: msg });
      await reply(`🪪 *${nom}*${titre ? '\n' + titre : ''}\n📞 +${n}${email ? '\n✉️ ' + email : ''}\n💬 https://wa.me/${n}`);
    },
  },
  {
    ...base,
    name: 'cv',
    desc: 'Crée un CV en PDF à partir de tes informations',
    usage: 'Tape {P}cv modele pour recevoir le modèle à remplir, puis renvoie-le complété après {P}cv',
    run: async ({ sock, jid, msg, args, reply, texte }) => {
      const p = config.PREFIXE;
      const brut = texte.slice(config.PREFIXE.length).replace(/^\S+\s*/, '');
      if (!brut.trim() || /^modele/i.test(brut)) {
        return reply(`📄 *Modèle de CV* — copie, complète, puis envoie avec ${p}cv devant :\n\n${p}cv\nNom : Jean Mavoungou\nTitre : Technicien réseaux\nTéléphone : +242 06 123 45 67\nEmail : jean@mail.com\nAdresse : Brazzaville\nProfil : Technicien motivé, 3 ans d’expérience…\nExpériences :\n- 2023-2025 : Technicien, Société X\n- 2021-2023 : Stagiaire, Société Y\nFormations :\n- 2024 : BTS Analyse et Programmation\nCompétences :\n- Réseaux\n- Linux\nLangues :\n- Français (courant)\n- Anglais (intermédiaire)`);
      }
      const champs = lireChamps(brut, ['nom', 'titre', 'telephone', 'tel', 'email', 'adresse', 'profil', 'experiences', 'experience', 'formations', 'formation', 'competences', 'langues', 'loisirs', 'certifications']);
      if (!champs.nom) return reply(`❓ Il manque « Nom : … ». Tape ${p}cv modele pour voir le modèle.`);
      const liste = (...cles) => cles.flatMap((c) => champs[c] || []);
      const buffer = await pdf.cv({
        nom: champs.nom?.[0], titre: champs.titre?.[0], tel: (champs.telephone || champs.tel)?.[0], email: champs.email?.[0], adresse: champs.adresse?.[0],
        profil: champs.profil?.join(' '),
        sections: [
          { titre: 'Expériences', lignes: liste('experiences', 'experience') }, { titre: 'Formations', lignes: liste('formations', 'formation') },
          { titre: 'Compétences', lignes: liste('competences') }, { titre: 'Certifications', lignes: liste('certifications') },
          { titre: 'Langues', lignes: liste('langues') }, { titre: 'Loisirs', lignes: liste('loisirs') },
        ],
      });
      await sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: `CV-${champs.nom[0].replace(/\W+/g, '_')}.pdf`, caption: '📄 Ton CV est prêt.' }, { quoted: msg });
    },
  },
  {
    ...base,
    name: 'lettre',
    aliases: ['lettremotivation'],
    desc: 'Crée une lettre (motivation, demande…) en PDF',
    usage: 'Tape {P}lettre modele pour le modèle. Si tu laisses « Corps » vide, l’IA rédige le texte à partir de « Poste » et « Profil ».',
    run: async (ctx) => {
      const { sock, jid, msg, reply, texte } = ctx;
      const p = config.PREFIXE;
      const brut = texte.slice(config.PREFIXE.length).replace(/^\S+\s*/, '');
      if (!brut.trim() || /^modele/i.test(brut)) {
        return reply(`✉️ *Modèle de lettre* — copie, complète, envoie avec ${p}lettre devant :\n\n${p}lettre\nNom : Jean Mavoungou\nAdresse : Brazzaville\nTéléphone : +242 06 123 45 67\nDestinataire : Monsieur le Directeur, Société X, Brazzaville\nLieu : Brazzaville\nObjet : Candidature au poste de technicien réseaux\nPoste : Technicien réseaux\nProfil : BTS en analyse et programmation, 2 ans d’expérience\nCorps : (laisse vide pour que l’IA rédige, ou écris ta lettre ici)`);
      }
      const ch = lireChamps(brut, ['nom', 'adresse', 'telephone', 'tel', 'destinataire', 'lieu', 'objet', 'poste', 'profil', 'corps']);
      if (!ch.nom || !ch.destinataire) return reply(`❓ Il manque « Nom » ou « Destinataire ». Tape ${p}lettre modele.`);
      let corps = ch.corps?.join('\n').trim();
      if (corps && /^\(laisse vide/i.test(corps)) corps = '';
      if (!corps) {
        const outil = require('../lib/outilia');
        corps = await outil.tache(ctx, "Tu rédiges des lettres formelles en français (lettre de motivation ou de demande), de 150 à 220 mots, structurées en paragraphes courts, polies, sans inventer de faits : utilise uniquement les informations données. Commence par « Madame, Monsieur, » (ou le titre fourni) et termine par une formule de politesse. Réponds uniquement avec le texte de la lettre.", `Expéditeur : ${ch.nom[0]}\nDestinataire : ${ch.destinataire.join(', ')}\nObjet : ${ch.objet?.[0] || ''}\nPoste visé : ${ch.poste?.[0] || ''}\nProfil : ${ch.profil?.join(' ') || ''}`, { pied: false });
        if (!corps) return;
      }
      const date = new Date(Date.now() + 36e5).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
      const buffer = await pdf.lettre({
        expediteur: [ch.nom[0], ...(ch.adresse || []), ...((ch.telephone || ch.tel || []).slice(0, 1))],
        destinataire: ch.destinataire.join(',').split(',').map((x) => x.trim()),
        lieuDate: `${ch.lieu?.[0] || ''}${ch.lieu ? ', le ' : 'Le '}${date}`,
        objet: ch.objet?.[0], corps,
      });
      await sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: `Lettre-${ch.nom[0].replace(/\W+/g, '_')}.pdf`, caption: '✉️ Ta lettre est prête. Relis-la avant de l’envoyer.' }, { quoted: msg });
    },
  },

  // ───────────── Licences (accès premium avec durée) ─────────────
  {
    ...base,
    name: 'licence',
    aliases: ['abonnement', 'licences'],
    desc: 'Ton abonnement premium (et gestion des licences pour le propriétaire)',
    usage: 'Tous : {P}licence · Propriétaire : {P}licence creer 242061234567 30j · {P}licence prolonger 242061234567 15j · {P}licence retirer 242061234567 · {P}licence liste',
    run: async (c) => {
      const { args, reply, senderNum, isOwner } = c;
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const etat = (n) => {
        const i = permissions.infoPremium(n);
        return i ? (i.jusque ? `✅ premium jusqu’au ${dateLocale(i.jusque)} (${formatDuree(i.jusque - Date.now())} restants)` : '✅ premium (sans date de fin)') : '❌ pas d’abonnement actif';
      };
      if (!['creer', 'prolonger', 'retirer', 'liste'].includes(sous)) return reply(`🔑 *Ton abonnement* : ${etat(senderNum)}`);
      if (!isOwner) return reservé(reply);
      if (sous === 'liste') {
        const l = store.liste('premium').filter((x) => !x.data.jusque || x.data.jusque > Date.now());
        return reply(l.length ? '🔑 *Licences actives*\n' + l.map((x) => `• +${x.id} — ${x.data.jusque ? 'jusqu’au ' + dateLocale(x.data.jusque) : 'sans fin'}`).join('\n') : '🔑 Aucune licence active.');
      }
      const n = (args[1] || '').replace(/\D/g, '');
      if (n.length < 8) return reply(`✏️ ${p}licence ${sous} 242061234567 30j`);
      if (sous === 'retirer') return reply(permissions.retirerPremium(n) ? `✅ Licence de +${n} retirée.` : 'ℹ️ Aucune licence pour ce numéro.');
      const ms = parseDuree(args.slice(2).join(' '));
      if (!ms) return reply(`✏️ Durée manquante : ${p}licence ${sous} ${n} 30j  (j = jours, h = heures)`);
      const actuel = permissions.infoPremium(n);
      const debut = sous === 'prolonger' && actuel?.jusque ? actuel.jusque : Date.now();
      permissions.ajouterPremium(n, debut + ms);
      await reply(`✅ +${n} : ${etat(n)}`);
    },
  },
  {
    ...base,
    name: 'absent',
    aliases: ['absence', 'repondeur'],
    desc: 'Répondeur automatique « je suis absent » en privé',
    ownerOnly: true,
    run: async ({ args, reply }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const r = reglages.lire();
      if (['on', 'oui', 'activer'].includes(sous)) {
        const msg = args.slice(1).join(' ').trim() || r.absentMessage || 'Bonjour, je suis actuellement absent. Je te réponds dès que possible. 🙏';
        reglages.ecrire({ absentActif: true, absentMessage: msg });
        return reply(`✅ Répondeur activé (une réponse par personne toutes les 12 h) :\n\n${msg}`);
      }
      if (['off', 'non', 'desactiver'].includes(sous)) {
        reglages.ecrire({ absentActif: false });
        return reply('❌ Répondeur désactivé.');
      }
      await reply(`🏖️ Répondeur : ${r.absentActif ? '✅ activé' : '❌ désactivé'}\n${r.absentMessage ? 'Message : ' + r.absentMessage : ''}\n\n${p}absent on Je suis en congé jusqu’à lundi\n${p}absent off`);
    },
  },
];

// Lit « Clé : valeur » et les lignes « - élément » qui suivent. Renvoie { clé: [lignes] }
function lireChamps(brut, clesValides) {
  const out = {};
  let courant = null;
  for (const ligne of brut.split(/\r?\n/)) {
    const m = ligne.match(/^\s*([\p{L}éèêàâîôûç ]{2,20}?)\s*:\s*(.*)$/u);
    const k = m && sansAccent(m[1]).trim();
    if (m && clesValides.includes(k)) {
      courant = k;
      out[k] = m[2].trim() ? [m[2].trim()] : [];
    } else if (courant && ligne.trim()) {
      out[courant].push(ligne.replace(/^\s*[-•*]\s*/, '').trim());
    }
  }
  return out;
}
