// Kernel Bot — outils du quotidien : calcul, change, rappels, notes, QR code, dates, unités…
const crypto = require('crypto');
const jobs = require('../lib/jobs');
const store = require('../lib/store');
const { parseQuand } = require('../lib/temps');
const { numero, dateLocale, formatDuree } = require('../lib/utils');

const base = { categorie: 'Outils' };
const fr = (n, d = 6) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d });

// ───────────── Calcul (analyseur maison, sans eval) ─────────────
function calculer(brut) {
  let s = String(brut).toLowerCase().replace(/,/g, '.').replace(/×|x(?=\s*[\d(])/g, '*').replace(/÷|:/g, '/').replace(/\s+/g, '');
  // « 20% de 5000 »
  s = s.replace(/(\d+(?:\.\d+)?)%de(\d+(?:\.\d+)?)/g, '($1/100*$2)');
  let i = 0;
  const FONC = { sqrt: Math.sqrt, racine: Math.sqrt, abs: Math.abs, arrondi: Math.round, round: Math.round, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, plafond: Math.ceil, sol: Math.floor };
  const CONST = { pi: Math.PI, e: Math.E };
  const lire = () => {
    let v = terme();
    while (s[i] === '+' || s[i] === '-') v = s[i++] === '+' ? v + terme() : v - terme();
    return v;
  };
  const terme = () => {
    let v = puiss();
    while (s[i] === '*' || s[i] === '/' || s[i] === '%') {
      const o = s[i++];
      const d = puiss();
      v = o === '*' ? v * d : o === '/' ? v / d : v % d;
    }
    return v;
  };
  const puiss = () => {
    const b = unaire();
    if (s[i] === '^') {
      i++;
      return Math.pow(b, puiss());
    }
    return b;
  };
  const unaire = () => {
    if (s[i] === '-') { i++; return -unaire(); }
    if (s[i] === '+') { i++; return unaire(); }
    return atome();
  };
  const atome = () => {
    if (s[i] === '(') {
      i++;
      const v = lire();
      if (s[i++] !== ')') throw new Error('parenthèse manquante');
      return v;
    }
    const nb = s.slice(i).match(/^\d+(?:\.\d+)?/);
    if (nb) { i += nb[0].length; return parseFloat(nb[0]); }
    const mot = s.slice(i).match(/^[a-zé]+/);
    if (mot) {
      i += mot[0].length;
      if (mot[0] in CONST) return CONST[mot[0]];
      if (mot[0] in FONC) {
        if (s[i++] !== '(') throw new Error('parenthèse attendue après ' + mot[0]);
        const v = lire();
        if (s[i++] !== ')') throw new Error('parenthèse manquante');
        return FONC[mot[0]](v);
      }
    }
    throw new Error('expression illisible');
  };
  const r = lire();
  if (i < s.length) throw new Error('expression illisible');
  return r;
}

// ───────────── Change (taux du jour, sans clé API) ─────────────
const MONNAIES = { fcfa: 'XAF', cfa: 'XAF', xaf: 'XAF', xof: 'XOF', euro: 'EUR', euros: 'EUR', dollar: 'USD', dollars: 'USD', '$': 'USD', '€': 'EUR', livre: 'GBP', yuan: 'CNY', cdf: 'CDF', franc: 'CDF' };
const tauxCache = new Map();
const codeMonnaie = (m) => MONNAIES[String(m).toLowerCase()] || String(m).toUpperCase();
async function taux(de) {
  const c = tauxCache.get(de);
  if (c && Date.now() - c.ts < 3600000) return c.t;
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${de}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j.result !== 'success') throw new Error('devise inconnue');
    tauxCache.set(de, { ts: Date.now(), t: j.rates });
    return j.rates;
  } catch (e) {
    // Hors ligne : l'euro et le franc CFA ont une parité fixe (1 € = 655,957 F CFA), on peut quand même convertir
    const PARITE = 655.957;
    if (de === 'EUR') return { EUR: 1, XAF: PARITE, XOF: PARITE };
    if (de === 'XAF' || de === 'XOF') return { EUR: 1 / PARITE, XAF: 1, XOF: 1 };
    throw e.message === 'devise inconnue' ? e : new Error('service de taux injoignable');
  }
}

// ───────────── Unités ─────────────
const U = {
  longueur: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, pouce: 0.0254, ft: 0.3048, pied: 0.3048, yd: 0.9144, mi: 1609.344, mile: 1609.344 },
  masse: { mg: 0.001, g: 1, kg: 1000, t: 1e6, lb: 453.59237, oz: 28.349523 },
  volume: { ml: 0.001, cl: 0.01, l: 1, m3: 1000, gal: 3.785411784, tasse: 0.2365882 },
  vitesse: { 'm/s': 1, 'km/h': 1 / 3.6, kmh: 1 / 3.6, mph: 0.44704, kn: 0.514444 },
  donnees: { o: 1, ko: 1e3, mo: 1e6, go: 1e9, to: 1e12, kio: 1024, mio: 1048576, gio: 1073741824 },
  surface: { m2: 1, km2: 1e6, ha: 1e4, ft2: 0.09290304, acre: 4046.8564224 },
};
const TEMP = { c: [(x) => x, (x) => x], f: [(x) => (x - 32) * 5 / 9, (x) => x * 9 / 5 + 32], k: [(x) => x - 273.15, (x) => x + 273.15] };

// ───────────── Heure dans le monde ─────────────
const VILLES = {
  brazzaville: 'Africa/Brazzaville', kinshasa: 'Africa/Kinshasa', pointenoire: 'Africa/Brazzaville', paris: 'Europe/Paris', londres: 'Europe/London',
  bruxelles: 'Europe/Brussels', dakar: 'Africa/Dakar', abidjan: 'Africa/Abidjan', douala: 'Africa/Douala', yaounde: 'Africa/Douala',
  libreville: 'Africa/Libreville', luanda: 'Africa/Luanda', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg',
  casablanca: 'Africa/Casablanca', alger: 'Africa/Algiers', tunis: 'Africa/Tunis', caire: 'Africa/Cairo', newyork: 'America/New_York',
  montreal: 'America/Toronto', toronto: 'America/Toronto', chicago: 'America/Chicago', losangeles: 'America/Los_Angeles', saopaulo: 'America/Sao_Paulo',
  dubai: 'Asia/Dubai', pekin: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', delhi: 'Asia/Kolkata', moscou: 'Europe/Moscow',
};
const sansAccent = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z/_]/g, '');

const aff = (jid, texte) => ({ jid, texte });

module.exports = [
  {
    ...base,
    name: 'calcul',
    aliases: ['calc', 'calculer'],
    desc: 'Calculatrice : .calcul 12*(3+4)  ou  .calcul 20% de 5000',
    run: async ({ args, reply, config }) => {
      if (!args.length) return reply(`🧮 Exemples :\n${config.PREFIXE}calcul 12*(3+4)\n${config.PREFIXE}calcul 20% de 5000\n${config.PREFIXE}calcul racine(144) + 2^10\nFonctions : racine, abs, arrondi, sin, cos, tan, ln, log, exp — constantes : pi, e`);
      const expr = args.join(' ');
      try {
        const r = calculer(expr);
        if (!Number.isFinite(r)) return reply('⚠️ Résultat impossible (division par zéro ?).');
        await reply(`🧮 ${expr} = *${fr(r, 10)}*`);
      } catch (e) {
        await reply(`⚠️ Je n’ai pas compris le calcul (${e.message}).`);
      }
    },
  },
  {
    ...base,
    name: 'change',
    aliases: ['devise', 'convertir'],
    desc: 'Convertit des devises (FCFA, EUR, USD…) au taux du jour',
    run: async ({ args, reply, config }) => {
      const m = args.join(' ').match(/^([\d\s.,]+)\s*([^\s\d]+)\s*(?:en|to|->|vers|→)?\s*([^\s\d]+)?$/i);
      if (!m) return reply(`💱 Exemples :\n${config.PREFIXE}change 100 eur fcfa\n${config.PREFIXE}change 50000 fcfa usd\n${config.PREFIXE}change 20 usd   (vers FCFA par défaut)`);
      const montant = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(montant)) return reply('❓ Montant invalide.');
      const de = codeMonnaie(m[2]);
      const vers = m[3] ? codeMonnaie(m[3]) : de === 'XAF' ? 'EUR' : 'XAF';
      try {
        const t = await taux(de);
        if (!t[vers]) return reply(`❓ Devise « ${vers} » inconnue.`);
        const r = montant * t[vers];
        await reply(`💱 ${fr(montant, 2)} ${de} = *${fr(r, 2)} ${vers}*\n📈 1 ${de} = ${fr(t[vers], 4)} ${vers}\n_Taux indicatifs du jour, hors frais de change._`);
      } catch (e) {
        await reply(`⚠️ Conversion impossible (${e.message}).`);
      }
    },
  },
  {
    ...base,
    name: 'qrcode',
    aliases: ['qr'],
    desc: 'Crée un QR code à partir d’un texte ou d’un lien',
    run: async ({ sock, jid, msg, args, reply, config }) => {
      const t = args.join(' ').trim();
      if (!t) return reply(`✏️ ${config.PREFIXE}qrcode https://exemple.com`);
      if (t.length > 1000) return reply('⚠️ Texte trop long (1000 caractères maximum).');
      const QR = require('qrcode');
      const buffer = await QR.toBuffer(t, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
      await sock.sendMessage(jid, { image: buffer, caption: '📱 Scanne ce QR code' }, { quoted: msg });
    },
  },
  {
    ...base,
    name: 'tirage',
    aliases: ['hasard', 'tirer'],
    desc: 'Tirage au sort : .tirage a, b, c  ·  .tirage 1-100  ·  .tirage membre',
    run: async ({ sock, jid, args, reply, config, isGroup, metadata, msg }) => {
      const t = args.join(' ').trim();
      const alea = (n) => crypto.randomInt(n);
      if (!t) return reply(`🎲 Exemples :\n${config.PREFIXE}tirage pizza, riz, poulet\n${config.PREFIXE}tirage 1-100\n${config.PREFIXE}tirage membre (dans un groupe)`);
      if (/^membre/i.test(t)) {
        if (!isGroup) return reply('👥 « membre » fonctionne dans un groupe.');
        const meta = metadata || (await sock.groupMetadata(jid));
        const p = meta.participants[alea(meta.participants.length)];
        return sock.sendMessage(jid, { text: `🎉 Le sort a désigné : @${numero(p.id)}`, mentions: [p.id] }, { quoted: msg });
      }
      const nb = t.match(/^(-?\d+)\s*(?:-|à|a)\s*(-?\d+)$/);
      if (nb) {
        const [a, b] = [parseInt(nb[1], 10), parseInt(nb[2], 10)].sort((x, y) => x - y);
        return reply(`🎲 Entre ${a} et ${b} : *${a + alea(b - a + 1)}*`);
      }
      const choix = t.split(/\s*[,;|]\s*/).filter(Boolean);
      if (choix.length < 2) return reply('✏️ Donne au moins deux choix séparés par des virgules.');
      await reply(`🎲 Le sort a choisi : *${choix[alea(choix.length)]}*`);
    },
  },
  {
    ...base,
    name: 'note',
    aliases: ['notes', 'memo'],
    desc: 'Tes notes personnelles : ajouter, voir, supprimer',
    run: async ({ args, senderNum, reply, config }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      const liste = store.get('note', senderNum, []);
      const sauver = (l) => store.set('note', senderNum, l);
      if (!sous || sous === 'liste') {
        if (!liste.length) return reply(`📝 Aucune note.\n${p}note ajouter acheter du riz`);
        return reply(`📝 *Tes notes*\n` + liste.map((n, i) => `${i + 1}. ${n.texte}  _(${dateLocale(n.ts)})_`).join('\n') + `\n\n${p}note voir 2 · ${p}note supprimer 2 · ${p}note vider`);
      }
      if (['ajouter', 'add', '+'].includes(sous) || !['voir', 'supprimer', 'vider', 'sup', 'del'].includes(sous)) {
        const texte = (['ajouter', 'add', '+'].includes(sous) ? args.slice(1) : args).join(' ').trim();
        if (!texte) return reply(`✏️ ${p}note ajouter ton texte`);
        if (liste.length >= 100) return reply('⚠️ 100 notes maximum : supprime-en d’abord.');
        liste.push({ texte: texte.slice(0, 1500), ts: Date.now() });
        sauver(liste);
        return reply(`✅ Note ${liste.length} enregistrée.`);
      }
      const n = parseInt(args[1], 10);
      if (sous === 'vider') {
        sauver([]);
        return reply('🗑️ Toutes tes notes sont supprimées.');
      }
      if (!n || n < 1 || n > liste.length) return reply(`❓ Numéro invalide. Tape ${p}note pour voir la liste.`);
      if (sous === 'voir') return reply(`📝 *Note ${n}*\n${liste[n - 1].texte}\n_${dateLocale(liste[n - 1].ts)}_`);
      liste.splice(n - 1, 1);
      sauver(liste);
      await reply(`🗑️ Note ${n} supprimée.`);
    },
  },
  {
    ...base,
    name: 'jours',
    aliases: ['datediff', 'joursavant'],
    desc: 'Nombre de jours jusqu’à une date : .jours 25/12/2026',
    run: async ({ args, reply, config }) => {
      const lireDate = (s) => {
        const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (!m) return null;
        const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
        return Date.UTC(a, +m[2] - 1, +m[1]);
      };
      const d1 = lireDate(args[0]);
      if (d1 == null) return reply(`📅 Exemples :\n${config.PREFIXE}jours 25/12/2026 (depuis aujourd’hui)\n${config.PREFIXE}jours 01/01/2026 25/12/2026 (entre deux dates)`);
      const d2 = args[1] ? lireDate(args[1]) : null;
      const auj = new Date(Date.now() + 36e5);
      const aujourdhui = Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth(), auj.getUTCDate());
      const [debut, fin] = d2 != null ? [d1, d2] : [aujourdhui, d1];
      const n = Math.round((fin - debut) / 864e5);
      const sem = Math.floor(Math.abs(n) / 7), reste = Math.abs(n) % 7;
      const phrase = n === 0 ? 'C’est aujourd’hui !' : n > 0 ? `Dans *${n} jour${n > 1 ? 's' : ''}*` : `Il y a *${-n} jour${-n > 1 ? 's' : ''}*`;
      await reply(`📅 ${phrase}${Math.abs(n) >= 7 ? ` (${sem} semaine${sem > 1 ? 's' : ''}${reste ? ` et ${reste} jour${reste > 1 ? 's' : ''}` : ''})` : ''}`);
    },
  },
  {
    ...base,
    name: 'heure',
    aliases: ['time', 'fuseau'],
    desc: 'Heure dans une ville : .heure paris',
    run: async ({ args, reply, config }) => {
      const fmt = (tz) => new Date().toLocaleString('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      if (!args.length) {
        const l = ['brazzaville', 'paris', 'londres', 'newyork', 'dubai', 'tokyo'];
        return reply('🕐 *Heure dans le monde*\n' + l.map((v) => `• ${v[0].toUpperCase() + v.slice(1)} : ${new Date().toLocaleTimeString('fr-FR', { timeZone: VILLES[v], hour: '2-digit', minute: '2-digit' })}`).join('\n') + `\n\n${config.PREFIXE}heure <ville> — villes : ${Object.keys(VILLES).join(', ')}`);
      }
      const cle = sansAccent(args.join(''));
      const tz = VILLES[cle] || (args[0].includes('/') ? args[0] : null);
      if (!tz) return reply(`❓ Ville inconnue. Essaie : ${Object.keys(VILLES).slice(0, 12).join(', ')}…`);
      try {
        const nom = args.join(' ');
        await reply(`🕐 ${nom[0].toUpperCase() + nom.slice(1)} : *${fmt(tz)}*`);
      } catch {
        await reply('❓ Fuseau horaire invalide.');
      }
    },
  },
  {
    ...base,
    name: 'unites',
    aliases: ['convertirunite', 'conv'],
    desc: 'Convertit des unités : .unites 10 km mi',
    run: async ({ args, reply, config }) => {
      const m = args.join(' ').toLowerCase().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*°?([a-z0-9/²³]+)\s*(?:en|vers|to)?\s*°?([a-z0-9/²³]+)$/);
      if (!m) return reply(`📏 Exemples :\n${config.PREFIXE}unites 10 km mi\n${config.PREFIXE}unites 5 kg lb\n${config.PREFIXE}unites 30 c f\n${config.PREFIXE}unites 2 go mo\nFamilles : longueur, masse, volume, vitesse, données, surface, température.`);
      const v = parseFloat(m[1]);
      const [a, b] = [m[2].replace('²', '2').replace('³', '3'), m[3].replace('²', '2').replace('³', '3')];
      if (TEMP[a] && TEMP[b]) return reply(`🌡️ ${fr(v)} °${a.toUpperCase()} = *${fr(TEMP[b][1](TEMP[a][0](v)), 2)} °${b.toUpperCase()}*`);
      for (const [fam, t] of Object.entries(U)) {
        if (t[a] && t[b]) return reply(`📏 ${fr(v)} ${a} = *${fr((v * t[a]) / t[b], 6)} ${b}* _(${fam})_`);
      }
      await reply('❓ Unités inconnues ou de familles différentes.');
    },
  },
  {
    ...base,
    name: 'raccourcir',
    aliases: ['shorturl', 'court'],
    desc: 'Raccourcit un lien (via is.gd)',
    run: async ({ args, reply, config }) => {
      let url = (args[0] || '').trim();
      if (!url) return reply(`✏️ ${config.PREFIXE}raccourcir https://un-tres-long-lien.com/page`);
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try {
        const r = await fetch('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(10000) });
        const t = (await r.text()).trim();
        if (!/^https?:\/\//.test(t)) return reply('⚠️ ' + t.replace(/^Error:\s*/i, ''));
        await reply(`🔗 ${t}\n_Le lien est envoyé au service is.gd pour être raccourci._`);
      } catch (e) {
        await reply('⚠️ Service indisponible, réessaie plus tard.');
      }
    },
  },
  {
    ...base,
    name: 'motdepasse',
    aliases: ['mdp', 'password'],
    desc: 'Génère un mot de passe solide (en privé uniquement)',
    run: async ({ args, reply, isGroup }) => {
      if (isGroup) return reply('🔒 Pour ta sécurité, demande-moi ce mot de passe en discussion privée, jamais dans un groupe.');
      const n = Math.min(64, Math.max(8, parseInt(args[0], 10) || 16));
      const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?-_'];
      const tout = sets.join('');
      const out = sets.map((s) => s[crypto.randomInt(s.length)]);
      while (out.length < n) out.push(tout[crypto.randomInt(tout.length)]);
      for (let i = out.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      await reply(`🔐 *Mot de passe (${n} caractères)*\n\n\`${out.join('')}\`\n\nGénéré ici, sur ton ordinateur : il n’est enregistré nulle part. Copie-le dans un gestionnaire de mots de passe, puis supprime ce message.`);
    },
  },
  {
    ...base,
    name: 'lienwa',
    aliases: ['wame', 'lienwhatsapp'],
    desc: 'Crée un lien WhatsApp direct avec message : .lienwa 242061234567 Bonjour',
    run: async ({ args, reply, config }) => {
      const n = (args[0] || '').replace(/\D/g, '');
      if (n.length < 8) return reply(`✏️ ${config.PREFIXE}lienwa 242061234567 Bonjour, je suis intéressé`);
      const t = args.slice(1).join(' ');
      await reply(`💬 https://wa.me/${n}${t ? '?text=' + encodeURIComponent(t) : ''}`);
    },
  },

  // ───────────── Rappels et messages programmés ─────────────
  {
    ...base,
    name: 'rappel',
    aliases: ['rappeler', 'remind', 'alarme'],
    desc: 'Te rappelle quelque chose : .rappel 30min appeler Paul',
    usage: 'Exemples : {P}rappel 30min acheter du pain · {P}rappel dans 2h réunion · {P}rappel à 18h30 sortir · {P}rappel demain 8h café · {P}rappel 25/12 9h Noël · {P}rappel tous les jours à 7h sport\n{P}rappel liste · {P}rappel annuler 2',
    run: async ({ sock, jid, sender, senderNum, args, reply, config, isGroup }) => {
      const p = config.PREFIXE;
      const cle = 'rappel:' + senderNum;
      const sous = (args[0] || '').toLowerCase();
      if (!args.length) return reply(`⏰ *Rappels*\n${p}rappel 30min acheter du pain\n${p}rappel à 18h30 réunion\n${p}rappel demain 8h café\n${p}rappel 25/12 9h Noël\n${p}rappel tous les jours à 7h sport\n\n${p}rappel liste · ${p}rappel annuler 2\n_Pour une heure précise, écris « à 18h30 » ; sans « à », « 18h » veut dire « dans 18 heures »._`);
      if (sous === 'liste' || sous === 'voir') {
        const l = jobs.parCle(cle);
        if (!l.length) return reply('⏰ Aucun rappel en attente.');
        return reply('⏰ *Tes rappels*\n' + l.map((j, i) => `${i + 1}. ${dateLocale(j.quand)}${j.repete ? ' 🔁' : ''} — ${j.data.texte}`).join('\n'));
      }
      if (sous === 'annuler' || sous === 'supprimer') {
        const l = jobs.parCle(cle);
        const n = parseInt(args[1], 10);
        if (args[1] === 'tout' || args[1] === 'tous') {
          l.forEach((j) => jobs.supprimer(j.id));
          return reply(`🗑️ ${l.length} rappel(s) annulé(s).`);
        }
        if (!n || n > l.length) return reply(`❓ Numéro invalide (${p}rappel liste).`);
        jobs.supprimer(l[n - 1].id);
        return reply('🗑️ Rappel annulé.');
      }
      const q = parseQuand(args.join(' '));
      if (!q) return reply(`❓ Je n’ai pas compris quand. Exemples : « 30min », « à 18h30 », « demain 8h ». Tape ${p}rappel pour l’aide.`);
      if (q.erreur) return reply('⚠️ Cette date est déjà passée.');
      if (!q.reste) return reply('✏️ Dis-moi aussi de quoi te rappeler.');
      if (jobs.parCle(cle).length >= 30) return reply('⚠️ 30 rappels maximum : annule-en quelques-uns.');
      jobs.ajouter({ quand: q.quand, type: 'rappel', data: { jid, qui: sender, texte: q.reste.slice(0, 500), sess: sock.sessionId || 'principal' }, repete: q.repete, cle });
      await reply(`✅ Rappel enregistré pour *${dateLocale(q.quand)}*${q.repete ? ' (répété)' : ''}${isGroup ? '' : ''}\n📝 ${q.reste}`);
    },
  },
  {
    ...base,
    name: 'programmer',
    aliases: ['planifier', 'differer'],
    desc: 'Envoie un message plus tard dans cette discussion',
    usage: '{P}programmer à 18h30 | Réunion ce soir !\n{P}programmer liste · {P}programmer annuler 1',
    metaSiGroupe: true,
    run: async ({ sock, jid, args, reply, config, isGroup, isAdmin, isOwner }) => {
      if (isGroup && !(isAdmin || isOwner)) return reply(config.PERSO.messages.reserveAdmin);
      const p = config.PREFIXE;
      const cle = `prog:${jid}`;
      const sous = (args[0] || '').toLowerCase();
      if (!args.length) return reply(`🗓️ ${p}programmer à 18h30 | Ton message\n${p}programmer demain 8h | Bonjour à tous\n${p}programmer liste · ${p}programmer annuler 1`);
      if (sous === 'liste') {
        const l = jobs.parCle(cle);
        return reply(l.length ? '🗓️ *Messages programmés ici*\n' + l.map((j, i) => `${i + 1}. ${dateLocale(j.quand)}${j.repete ? ' 🔁' : ''} — ${j.data.texte.slice(0, 60)}`).join('\n') : '🗓️ Aucun message programmé ici.');
      }
      if (sous === 'annuler') {
        const l = jobs.parCle(cle);
        const n = parseInt(args[1], 10);
        if (!n || n > l.length) return reply(`❓ Numéro invalide (${p}programmer liste).`);
        jobs.supprimer(l[n - 1].id);
        return reply('🗑️ Message programmé annulé.');
      }
      const brut = args.join(' ');
      const barre = brut.indexOf('|');
      const q = parseQuand(barre >= 0 ? brut.slice(0, barre) : brut);
      if (!q) return reply(`❓ Quand ? Exemple : ${p}programmer à 18h30 | Ton message`);
      if (q.erreur) return reply('⚠️ Cette date est déjà passée.');
      const texte = (barre >= 0 ? brut.slice(barre + 1) : q.reste).trim();
      if (!texte) return reply('✏️ Écris le message après « | ».');
      jobs.ajouter({ quand: q.quand, type: 'programme', data: { jid, texte: texte.slice(0, 3000), sess: sock.sessionId || 'principal' }, repete: q.repete, cle });
      await reply(`✅ Message programmé pour *${dateLocale(q.quand)}*${q.repete ? ' (répété)' : ''}.`);
    },
  },
];
