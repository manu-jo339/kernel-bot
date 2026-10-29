// Kernel Bot — réseau et sécurité : vérifier un lien, détecter une arnaque, DNS, IP, WHOIS, certificat SSL, surveillance de site
const dns = require('dns').promises;
const tls = require('tls');
const config = require('../config');
const store = require('../lib/store');
const jobs = require('../lib/jobs');
const { hotePublic, lireUrl, nomDomaine, ipPrivee } = require('../lib/reseau');
const { dateLocale, formatDuree, numero } = require('../lib/utils');

const base = { categorie: 'Réseau' };
const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const net = require('net');

// ───────────── Analyse locale d'un lien (aucune donnée envoyée à un tiers) ─────────────
const RACCOURCISSEURS = ['bit.ly', 'tinyurl.com', 'is.gd', 'cutt.ly', 'goo.gl', 't.co', 'ow.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'wa.link', 'buff.ly', 'lnkd.in'];
const TLD_RISQUE = ['tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'click', 'link', 'work', 'zip', 'mov', 'icu', 'cyou', 'buzz', 'rest', 'monster', 'sbs'];
const MARQUES = { whatsapp: ['whatsapp.com', 'whatsapp.net', 'wa.me'], facebook: ['facebook.com', 'fb.com', 'fb.me'], instagram: ['instagram.com'], google: ['google.com', 'google.fr', 'goo.gl'], paypal: ['paypal.com'], mtn: ['mtn.com', 'mtn.cg'], airtel: ['airtel.com', 'airtel.cg', 'airtel.africa'], orange: ['orange.com', 'orange.fr'], microsoft: ['microsoft.com', 'live.com', 'office.com'], apple: ['apple.com', 'icloud.com'], netflix: ['netflix.com'], tiktok: ['tiktok.com'], binance: ['binance.com'], amazon: ['amazon.com', 'amazon.fr'] };
const MOTS = ['login', 'signin', 'verify', 'verification', 'secure', 'account', 'compte', 'update', 'mise-a-jour', 'gagnant', 'prize', 'bonus', 'cadeau', 'gratuit', 'free', 'claim', 'wallet', 'recharge', 'suspendu', 'suspended', 'confirm', 'password', 'motdepasse'];

function analyserLien(u) {
  const pts = [], ok = [];
  let score = 0;
  const h = u.hostname.toLowerCase();
  const morceaux = h.split('.');
  const domaine = morceaux.slice(-2).join('.');
  const tld = morceaux[morceaux.length - 1];
  if (u.protocol !== 'https:') { score += 2; pts.push('Connexion non chiffrée (http)'); } else ok.push('Connexion chiffrée (https)');
  if (net.isIP(h)) { score += 4; pts.push('Adresse numérique (IP) à la place d’un nom de site'); }
  if (h.includes('xn--')) { score += 4; pts.push('Nom de domaine avec caractères déguisés (punycode)'); }
  if (RACCOURCISSEURS.includes(domaine)) { score += 2; pts.push('Lien raccourci : on ne voit pas la vraie destination'); }
  if (TLD_RISQUE.includes(tld)) { score += 2; pts.push(`Extension « .${tld} » très utilisée pour les arnaques`); }
  if (morceaux.length > 4) { score += 2; pts.push('Beaucoup de sous-domaines (technique pour imiter un vrai site)'); }
  if (/@/.test(u.href.replace(/^https?:\/\//, '').split('/')[0] + (u.username || ''))) { score += 3; pts.push('Contient un « @ » dans l’adresse'); }
  if ((h.match(/-/g) || []).length >= 3) { score += 1; pts.push('Nom de domaine truffé de tirets'); }
  for (const [marque, officiels] of Object.entries(MARQUES)) {
    if (h.includes(marque) && !officiels.some((o) => h === o || h.endsWith('.' + o))) {
      score += 5;
      pts.push(`Imite la marque « ${marque} » mais n’est pas son site officiel (${officiels[0]})`);
      break;
    }
  }
  const chemin = sansAccent(u.pathname + u.search + h);
  const mots = MOTS.filter((m) => chemin.includes(m));
  if (mots.length) { score += Math.min(3, mots.length); pts.push(`Mots typiques d’hameçonnage : ${mots.slice(0, 4).join(', ')}`); }
  if (u.href.length > 150) { score += 1; pts.push('Adresse anormalement longue'); }
  return { score, pts, ok };
}

// Suit les redirections d'un lien raccourci (jusqu'à 4 étapes) sans télécharger la page
async function developper(u) {
  const chaine = [];
  let cur = u;
  for (let i = 0; i < 4; i++) {
    if (!(await hotePublic(cur.hostname))) break;
    let r;
    try {
      r = await fetch(cur.href, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (verification de lien)' } });
    } catch {
      break;
    }
    const loc = r.headers.get('location');
    if (!(r.status >= 300 && r.status < 400 && loc)) break;
    try {
      cur = new URL(loc, cur);
    } catch {
      break;
    }
    chaine.push(cur);
  }
  return chaine;
}

// ───────────── Détection de messages d'arnaque ─────────────
const REGLES = [
  [/code.{0,25}(re[cç]u|envoy[eé]).{0,25}(erreur|par erreur)|renvoy\w* le code|donne\w* moi le code|code (de )?(v[eé]rification|whatsapp|otp|sms)/i, 5, 'Demande d’un code reçu par SMS : c’est la technique pour voler un compte WhatsApp ou Mobile Money'],
  [/\b(pin|code secret|mot de passe|mdp)\b/i, 4, 'Demande d’un code secret ou d’un mot de passe : personne de sérieux ne le demande'],
  [/(gagn[eé]|gagnant|tirage au sort|loterie|lot de|cadeau).{0,40}(f?cfa|euros?|\$|iphone|voiture|prix|bonus)/i, 5, 'Annonce d’un gain ou d’un cadeau que tu n’as pas demandé'],
  [/(frais|taxe|droits?) (de )?(dossier|douane|livraison|transfert|d[eé]blocage|activation)/i, 4, 'Demande de frais à avancer pour recevoir de l’argent ou un colis'],
  [/(urgent|imm[eé]diatement|derni[eè]re chance|dans les 24 ?h|avant (ce soir|demain)|sans d[eé]lai|expire)/i, 2, 'Pression et urgence : l’arnaqueur veut t’empêcher de réfléchir'],
  [/(compte|carte|num[eé]ro).{0,30}(suspendu|bloqu[eé]|d[eé]sactiv[eé]|ferm[eé]|expir[eé])/i, 4, 'Prétend que ton compte est bloqué ou suspendu'],
  [/(nouveau num[eé]ro|c.est (maman|papa|ton fils|ta fille|moi)|j.ai chang[eé] de num[eé]ro).{0,60}(argent|envoyer|d[eé]pannage|urgence|transf[eé]rer)/i, 5, 'Prétend être un proche avec un nouveau numéro et demande de l’argent : rappelle la vraie personne'],
  [/(investi\w*|placement|trading|crypto|bitcoin|forex).{0,60}(garanti|sans risque|doubl\w*|rendement|profit|\d+ ?%)/i, 5, 'Promesse de gains garantis ou rapides sur un investissement'],
  [/(envoie|envoyez|transf[eè]re|d[eé]pose).{0,40}(mobile money|momo|airtel money|orange money|western union|moneygram|bitcoin)/i, 3, 'Demande d’un paiement par Mobile Money / transfert, difficile à récupérer'],
  [/(travail|emploi|job|recrutement).{0,50}(\d{3,} ?(f?cfa|\$|€)).{0,30}(jour|semaine)|gagne\w* de l.argent (facilement|depuis chez toi)/i, 3, 'Offre d’emploi trop belle pour être vraie'],
  [/(h[eé]ritage|h[eé]ritier|prince|notaire|fonds? bloqu[eé]s?|million)/i, 3, 'Histoire d’héritage ou de fonds à débloquer (arnaque classique)'],
  [/(clique|cliquez|ouvre|consulte).{0,30}(lien|ici|ci-dessous)|https?:\/\/\S+/i, 1, 'Contient un lien à ouvrir'],
  [/(ne (le )?dis? à personne|reste discret|confidentiel|secret)/i, 2, 'Demande de garder le secret'],
];

function analyserMessage(t) {
  let score = 0;
  const pts = [];
  for (const [re, p, txt] of REGLES) {
    if (re.test(t)) {
      score += p;
      pts.push(txt);
    }
  }
  return { score, pts };
}

const niveau = (s) => (s >= 7 ? ['🔴', 'TRÈS PROBABLE ARNAQUE'] : s >= 4 ? ['🟠', 'SUSPECT'] : s >= 2 ? ['🟡', 'À SURVEILLER'] : ['🟢', 'RAS']);

// ───────────── Surveillance de site ─────────────
async function verifierSite(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'KernelBot-Surveillance/1.0' } });
    await r.body?.cancel?.();
    return { ok: r.status < 500, code: r.status, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, code: 0, ms: Date.now() - t, erreur: e.cause?.code || e.name };
  }
}

jobs.surTache('surveille', async ({ data, sock }) => {
  const s = store.get('surveille', data.id);
  if (!s) return jobs.supprimerCle('surv:' + data.id);
  if (!(await hotePublic(new URL(s.url).hostname))) return;
  const r = await verifierSite(s.url);
  const avant = s.etat;
  s.etat = r.ok ? 'en ligne' : 'hors ligne';
  s.ms = r.ms;
  s.derniere = Date.now();
  if (avant !== s.etat) {
    s.depuis = Date.now();
    if (avant) {
      let cible = sock;
      try { cible = require('../lib/session').sessions.get(s.sess)?.sock || sock; } catch {}
      try {
        await cible.sendMessage(s.jid, { text: r.ok ? `✅ *${s.url}* est de nouveau en ligne (${r.ms} ms).` : `🔴 *${s.url}* ne répond plus (${r.code ? 'erreur ' + r.code : r.erreur || 'injoignable'}).` });
      } catch {}
    }
  }
  store.set('surveille', data.id, s);
});

module.exports = [
  {
    ...base,
    name: 'verifierlien',
    aliases: ['lien_sur', 'checklink', 'verifurl'],
    desc: 'Analyse un lien et dit s’il ressemble à un piège',
    run: async ({ args, reply, msg }) => {
      const { messageCite, extraireTexte } = require('../lib/utils');
      const cite = messageCite(msg);
      const brut = args.join(' ') || (cite ? extraireTexte(cite.message) : '');
      const u = lireUrl((brut.match(/\S+/) || [''])[0]);
      if (!u) return reply(`🔗 ${config.PREFIXE}verifierlien https://lien-suspect.com\n(ou réponds à un message qui contient un lien)\n_L’analyse se fait sur ton ordinateur : le lien n’est envoyé à aucun service de réputation._`);
      let { score, pts, ok } = analyserLien(u);
      let suite = '';
      if (RACCOURCISSEURS.includes(u.hostname.split('.').slice(-2).join('.'))) {
        const ch = await developper(u);
        if (ch.length) {
          const fin = ch[ch.length - 1];
          const a2 = analyserLien(fin);
          score += a2.score;
          pts = [...pts, ...a2.pts.filter((x) => !pts.includes(x)).map((x) => 'Destination finale : ' + x)];
          suite = `\n➡️ *Destination réelle :* ${fin.origin}${fin.pathname.length > 1 ? fin.pathname.slice(0, 60) : ''}`;
        }
      }
      const [pastille, titre] = niveau(score);
      await reply(`${pastille} *${titre}*\n🔗 ${u.hostname}${suite}\n\n${pts.length ? pts.map((x) => '⚠️ ' + x).join('\n') : '✅ Aucun signe d’alerte évident.'}${ok.length && !pts.length ? '\n' + ok.map((x) => '✅ ' + x).join('\n') : ''}\n\n_Une analyse automatique ne remplace pas la prudence : ne saisis jamais de mot de passe ou de code après avoir cliqué sur un lien reçu._`);
    },
  },
  {
    ...base,
    name: 'arnaque',
    aliases: ['scam', 'verifiermessage'],
    desc: 'Analyse un message suspect (réponds au message ou colle-le)',
    run: async ({ args, reply, msg, config: cfg }) => {
      const { messageCite, extraireTexte } = require('../lib/utils');
      const cite = messageCite(msg);
      const t = args.join(' ') || (cite ? extraireTexte(cite.message) : '');
      if (t.length < 15) {
        return reply(`🕵️ *Détecteur d’arnaques*\nRéponds à un message suspect avec ${cfg.PREFIXE}arnaque (ou colle son texte après la commande).\n\n*Les règles d’or :*\n• Ne donne JAMAIS un code reçu par SMS (WhatsApp, Mobile Money) ni ton code secret.\n• Un vrai gain ne demande jamais de payer des frais d’abord.\n• Un « proche » avec un nouveau numéro qui demande de l’argent : appelle l’ancien numéro.\n• Les gains « garantis » n’existent pas.\n• Prends 10 minutes avant d’agir : l’urgence est l’arme de l’arnaqueur.`);
      }
      const { score, pts } = analyserMessage(t);
      const [pastille, titre] = niveau(score);
      let liens = '';
      for (const m of (t.match(/https?:\/\/\S+|\b[a-z0-9-]+\.(?:com|net|org|xyz|top|tk|ml|click|link|cg|cd)\S*/gi) || []).slice(0, 2)) {
        const u = lireUrl(m);
        if (u) {
          const a = analyserLien(u);
          if (a.score >= 4) liens += `\n⚠️ Le lien ${u.hostname} est suspect (${a.pts[0] || 'voir .verifierlien'}).`;
        }
      }
      await reply(`${pastille} *${titre}*\n\n${pts.length ? pts.map((x) => '⚠️ ' + x).join('\n') : '✅ Rien de typique d’une arnaque détecté.'}${liens}\n\n${score >= 4 ? '👉 Ne réponds pas, ne clique pas, ne donne aucun code. Bloque et signale le numéro.' : '👉 Reste prudent : en cas de doute, vérifie auprès de la personne ou de l’organisme par un autre moyen (appel).'}\n_Analyse automatique : elle peut se tromper._`);
    },
  },
  {
    ...base,
    name: 'dns',
    aliases: ['dig', 'nslookup'],
    desc: 'Enregistrements DNS d’un domaine : .dns exemple.com [MX|TXT|NS|AAAA]',
    run: async ({ args, reply }) => {
      const d = nomDomaine(args[0] || '');
      if (!d || !d.includes('.')) return reply(`🌐 ${config.PREFIXE}dns exemple.com\n${config.PREFIXE}dns exemple.com MX`);
      const types = args[1] ? [args[1].toUpperCase()] : ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];
      const sortie = [];
      for (const t of types) {
        try {
          const r = await dns.resolve(d, t);
          const l = r.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.join('') : x.exchange ? `${x.priority} ${x.exchange}` : JSON.stringify(x)));
          if (l.length) sortie.push(`*${t}*\n${l.slice(0, 6).map((x) => '  ' + x.slice(0, 150)).join('\n')}`);
        } catch (e) {
          if (args[1]) sortie.push(`*${t}* : ${e.code === 'ENODATA' || e.code === 'ENOTFOUND' ? 'aucun enregistrement' : e.code || e.message}`);
        }
      }
      await reply(sortie.length ? `🌐 *DNS de ${d}*\n\n${sortie.join('\n\n')}` : `🌐 Aucun enregistrement trouvé pour ${d} (domaine inexistant ?).`);
    },
  },
  {
    ...base,
    name: 'ip',
    aliases: ['geoip', 'adresseip'],
    desc: 'Localise une adresse IP ou un site : .ip 8.8.8.8',
    run: async ({ args, reply }) => {
      let cible = (args[0] || '').trim();
      if (!cible) return reply(`🌍 ${config.PREFIXE}ip 8.8.8.8  ou  ${config.PREFIXE}ip exemple.com`);
      if (!net.isIP(cible)) {
        try {
          cible = (await dns.lookup(nomDomaine(cible))).address;
        } catch {
          return reply('❓ Domaine introuvable.');
        }
      }
      if (ipPrivee(cible)) return reply('🏠 C’est une adresse privée ou réservée : elle n’a pas de localisation publique.');
      try {
        const r = await fetch('https://ipwho.is/' + encodeURIComponent(cible), { signal: AbortSignal.timeout(10000) });
        const j = await r.json();
        if (!j.success) return reply('❓ ' + (j.message || 'Adresse inconnue.'));
        await reply(`🌍 *${j.ip}*\n📍 ${[j.city, j.region, j.country].filter(Boolean).join(', ')} ${j.flag?.emoji || ''}\n🏢 ${j.connection?.isp || j.connection?.org || '—'}${j.connection?.asn ? ` (AS${j.connection.asn})` : ''}\n🕒 Fuseau : ${j.timezone?.id || '—'}\n_Localisation approximative (souvent celle du fournisseur d’accès)._`);
      } catch {
        await reply('⚠️ Service de localisation indisponible.');
      }
    },
  },
  {
    ...base,
    name: 'whois',
    aliases: ['domaine', 'rdap'],
    desc: 'Informations d’enregistrement d’un nom de domaine',
    run: async ({ args, reply }) => {
      const d = nomDomaine(args[0] || '');
      if (!d || !d.includes('.')) return reply(`🔎 ${config.PREFIXE}whois exemple.com`);
      try {
        const r = await fetch('https://rdap.org/domain/' + encodeURIComponent(d), { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { accept: 'application/rdap+json' } });
        if (r.status === 404) return reply(`🔎 *${d}* : domaine non enregistré (ou extension non couverte par RDAP).`);
        if (!r.ok) return reply(`⚠️ Le registre ne répond pas pour cette extension (code ${r.status}).`);
        const j = await r.json();
        const ev = (n) => (j.events || []).find((e) => e.eventAction === n)?.eventDate;
        const reg = (j.entities || []).find((e) => (e.roles || []).includes('registrar'));
        const nomReg = reg?.vcardArray?.[1]?.find((x) => x[0] === 'fn')?.[3] || reg?.handle || '—';
        const f = (x) => (x ? dateLocale(Date.parse(x)).split(' ')[0] : '—');
        const exp = ev('expiration');
        await reply(`🔎 *${d}*\n🏷️ Registraire : ${nomReg}\n📅 Créé le : ${f(ev('registration'))}\n⏳ Expire le : ${f(exp)}${exp ? ` (dans ${formatDuree(Date.parse(exp) - Date.now())})` : ''}\n🔄 Modifié le : ${f(ev('last changed'))}\n📡 Serveurs : ${(j.nameservers || []).map((n) => n.ldhName).slice(0, 4).join(', ') || '—'}\n🧾 Statut : ${(j.status || []).slice(0, 3).join(', ') || '—'}`);
      } catch {
        await reply('⚠️ Service d’information indisponible, réessaie plus tard.');
      }
    },
  },
  {
    ...base,
    name: 'ssl',
    aliases: ['certificat', 'tls'],
    desc: 'Vérifie le certificat SSL d’un site : .ssl exemple.com',
    run: async ({ args, reply }) => {
      const d = nomDomaine(args[0] || '');
      if (!d || !d.includes('.')) return reply(`🔒 ${config.PREFIXE}ssl exemple.com`);
      if (!(await hotePublic(d))) return reply('❓ Domaine introuvable ou non public.');
      try {
        const c = await new Promise((res, rej) => {
          const s = tls.connect({ host: d, port: 443, servername: d, timeout: 8000, rejectUnauthorized: false }, () => {
            const cert = s.getPeerCertificate();
            const auth = s.authorized;
            const err = s.authorizationError;
            s.end();
            res({ cert, auth, err });
          });
          s.on('timeout', () => { s.destroy(); rej(new Error('délai dépassé')); });
          s.on('error', rej);
        });
        const { cert } = c;
        if (!cert?.valid_to) return reply('⚠️ Aucun certificat lu.');
        const fin = Date.parse(cert.valid_to), debut = Date.parse(cert.valid_from);
        const jours = Math.floor((fin - Date.now()) / 864e5);
        const alertes = [];
        if (jours < 0) alertes.push('Certificat EXPIRÉ');
        else if (jours < 15) alertes.push('Expire bientôt');
        if (!c.auth) alertes.push(`Non reconnu comme fiable (${c.err})`);
        const san = (cert.subjectaltname || '').split(', ').map((x) => x.replace('DNS:', '')).slice(0, 5);
        await reply(`${alertes.length ? '🔴' : '🟢'} *Certificat de ${d}*\n🏢 Émis pour : ${cert.subject?.CN || '—'}\n🖋️ Émetteur : ${cert.issuer?.O || cert.issuer?.CN || '—'}\n📅 Valide du ${dateLocale(debut).split(' ')[0]} au ${dateLocale(fin).split(' ')[0]}\n⏳ ${jours >= 0 ? `Expire dans ${jours} jour(s)` : `Expiré depuis ${-jours} jour(s)`}\n🌐 Noms : ${san.join(', ') || '—'}${alertes.length ? '\n\n⚠️ ' + alertes.join('\n⚠️ ') : '\n\n✅ Certificat valide et reconnu.'}`);
      } catch (e) {
        await reply(`🔴 Impossible de lire le certificat : ${e.code || e.message}. Le site n’a peut-être pas de HTTPS.`);
      }
    },
  },
  {
    ...base,
    name: 'surveiller',
    aliases: ['monitor', 'surveillance'],
    desc: 'Surveille un site web et t’alerte quand il tombe ou revient',
    usage: '{P}surveiller ajouter https://monsite.com · {P}surveiller liste · {P}surveiller retirer 1 (vérification toutes les 5 minutes)',
    run: async ({ sock, jid, args, reply, senderNum, isOwner }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || 'liste').toLowerCase();
      const miens = store.liste('surveille').filter((x) => x.data.jid === jid);
      if (sous === 'liste') {
        return reply(miens.length ? '👁️ *Sites surveillés ici*\n' + miens.map((x, i) => `${i + 1}. ${x.data.url} — ${x.data.etat === 'en ligne' ? '🟢' : x.data.etat ? '🔴' : '⏳'} ${x.data.etat || 'en attente'}${x.data.ms ? ` (${x.data.ms} ms)` : ''}`).join('\n') : `👁️ Aucun site surveillé ici.\n${p}surveiller ajouter https://monsite.com`);
      }
      if (sous === 'retirer') {
        const x = miens[(parseInt(args[1], 10) || 0) - 1];
        if (!x) return reply('❓ Numéro invalide.');
        if (x.data.par !== senderNum && !isOwner) return reply('⛔ Ce n’est pas toi qui l’as ajouté.');
        store.del('surveille', x.id);
        jobs.supprimerCle('surv:' + x.id);
        return reply('🗑️ Surveillance arrêtée.');
      }
      if (sous !== 'ajouter') return reply(`✏️ ${p}surveiller ajouter https://monsite.com`);
      const u = lireUrl(args[1]);
      if (!u) return reply('❓ Adresse invalide.');
      if (!(await hotePublic(u.hostname))) return reply('⛔ Je ne surveille que des sites publics sur Internet.');
      const total = store.liste('surveille').filter((x) => x.data.par === senderNum).length;
      if (total >= (isOwner ? 20 : 3)) return reply(`⚠️ Limite atteinte (${isOwner ? 20 : 3} sites par personne).`);
      const id = Date.now().toString(36);
      store.set('surveille', id, { url: u.href, jid, par: senderNum, sess: sock.sessionId || 'principal', etat: null, ts: Date.now() });
      jobs.ajouter({ quand: Date.now() + 5000, type: 'surveille', data: { id }, repete: 300000, cle: 'surv:' + id });
      await reply(`✅ Surveillance de *${u.hostname}* démarrée (toutes les 5 minutes). Je t’écris ici quand il tombe ou revient.`);
    },
  },
];

module.exports.analyserLien = analyserLien;
module.exports.niveau = niveau;
