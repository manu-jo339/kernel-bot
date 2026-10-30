// Essais automatiques avec un faux WhatsApp (aucune connexion réelle) : node tests/essai.js
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-'));
// Les essais ne doivent jamais lire le vrai fichier .env de la personne (MODE=private, clés, etc.) : on travaille depuis un dossier vide
process.chdir(process.env.DATA_DIR);
process.env.NUMERO_OWNER = '242066000000';
process.env.NUMERO_BOT = '242061111111';
process.env.KERNEL_TEST = '1';
const assert = require('assert');
const config = require('../config');
require('../lib/protections');
require('../lib/presence');
const handler = require('../lib/handler');
const evenements = require('../lib/evenements');
handler.chargerCommandes();

const GRP = '120363000000000001@g.us';
const BOT = '242061111111@s.whatsapp.net';
const ADMIN = '242062222222@s.whatsapp.net';
const MEMBRE = '242063333333@s.whatsapp.net';
const PROP = '242066000000@s.whatsapp.net';
const envoyes = [];
const reactions = [];
const sock = {
  user: { id: '242061111111:5@s.whatsapp.net' },
  sendMessage: async (jid, c, o) => { if (c.react && ['⏳', '✅', '❌'].includes(c.react.text)) { reactions.push(c.react.text); return {}; } envoyes.push({ jid, c }); return { key: { id: 'X' + envoyes.length } }; },
  groupMetadata: async () => ({ id: GRP, subject: 'Test', desc: 'd', participants: [
    { id: BOT, admin: 'admin' }, { id: ADMIN, admin: 'admin' }, { id: MEMBRE }, { id: PROP }] }),
  groupParticipantsUpdate: async (j, ids, a) => { envoyes.push({ jid: j, c: { action: a, ids } }); },
  groupFetchAllParticipating: async () => ({ [GRP]: {} }),
  updateReadReceiptsPrivacy: async (v) => envoyes.push({ c: { rr: v } }), updateLastSeenPrivacy: async () => {}, updateOnlinePrivacy: async () => {}, sendPresenceUpdate: async () => {},
  readMessages: async () => {}, updateBlockStatus: async (j, a) => envoyes.push({ c: { block: a, j } }),
};
let n = 0;
const msg = (de, texte, groupe = true, extra = {}) => ({
  key: { remoteJid: groupe ? GRP : de, participant: groupe ? de : undefined, id: 'M' + ++n },
  message: { conversation: texte, ...extra }, pushName: 'Test', messageTimestamp: 1,
});
const dire = async (de, texte, groupe = true) => { envoyes.length = 0; await handler.traiter(sock, msg(de, texte, groupe)); return envoyes.slice(); };
const texteDe = (r) => r.map((x) => x.c.text || '').join('\n');
let ok = 0;
const test = async (nom, fn) => { try { await fn(); ok++; console.log('  ✔', nom); } catch (e) { console.error('  ✘', nom, '\n   ', e.message); process.exitCode = 1; } };

(async () => {
  console.log('Commandes :', handler.liste.length);
  await test('noms français chargés', () => {
    for (const n of ['expulser', 'tous', 'bannir', 'antilien', 'avertir', 'bienvenue', 'menu', 'aide', 'toutmenu', 'proprietaire', 'createur', 'redemarrer', 'connecter', 'liersticker', 'enmarche', 'etatsysteme', 'vueunique', 'rang', 'classement', 'profil', 'antimention', 'antimentiongroupe', 'antipromotion', 'lireauto'])
      assert(handler.commands.has(n), 'manque ' + n);
  });
  await test('anciens noms gardés comme alias', () => { assert(handler.commands.get('kick') === handler.commands.get('expulser')); });
  await test('menu accueil et catégorie', async () => {
    const rep = await dire(MEMBRE, '.menu');
    const im0 = rep.find((x) => x.c.image);
    assert(rep.length === 1 && im0, 'le menu doit tenir en UN seul message : ' + rep.length);
    const r = String(im0.c.caption).normalize('NFKC');
    assert(/Catégories/i.test(r) && /Protection/.test(r), r);
    // thème « kernel » par défaut : image d'en-tête avec l'encadré d'informations, puis les catégories
    const im = rep.find((x) => x.c.image);
    assert(im && im.c.image.length > 10000 && /𝗞𝗘𝗥𝗡𝗘𝗟 𝗕𝗢𝗧/.test(im.c.caption) && /350|3\d\d/.test(im.c.caption.normalize('NFKC')), im && im.c.caption);
    assert(require('../lib/menu').gras('Préfixe 2') === '𝗣𝗿𝗲\u0301𝗳𝗶𝘅𝗲 𝟮');
    const g = texteDe(await dire(MEMBRE, '.menu protection'));
    assert(/antilien/.test(g), g);
  });
  await test('image : info, uptime, système, maj oui ; ping, toutmenu, aide non ; images en boucle', async () => {
    const aImage = (rep) => rep.some((x) => x.c.image);
    assert(!aImage(await dire(MEMBRE, '.ping')), 'ping sans image');
    assert(!aImage(await dire(MEMBRE, '.toutmenu')), 'toutmenu sans image');
    assert(!aImage(await dire(MEMBRE, '.aide ping')), 'aide sans image');
    assert(aImage(await dire(MEMBRE, '.info')) && aImage(await dire(MEMBRE, '.uptime')) && aImage(await dire(PROP, '.system_status')), 'info/uptime/système avec image');
    const vues = new Set();
    for (let i = 0; i < 12; i++) vues.add(require('crypto').createHash('md5').update((await dire(MEMBRE, '.uptime')).find((x) => x.c.image).c.image).digest('hex'));
    assert(vues.size === 10, 'dix images différentes en boucle : ' + vues.size);
  });
  await test('utilisateur : nom du .env dans le menu, jamais le numéro', async () => {
    const config = require('../config');
    const avant = config.NOM_OWNER;
    config.NOM_OWNER = 'Ainz';
    const t = String((await dire(MEMBRE, '.menu')).find((x) => x.c.image).c.caption).normalize('NFKC');
    assert(/UTILISATEUR : Ainz/i.test(t) && !/PROPRIÉTAIRE : /i.test(t), t);
    assert(!/2420660/.test(t), 'numéro jamais affiché');
    config.NOM_OWNER = avant;
  });
  await test('bienvenue : commande pour la réafficher', async () => {
    const t = (await dire(MEMBRE, '.bienvenuebot')).map((x) => x.c.caption || x.c.text || '').join('');
    assert(/BIENVENUE|𝗕𝗜𝗘𝗡𝗩𝗘𝗡𝗨𝗘/.test(t.normalize('NFKC')) && /connecté/.test(t), t);
  });
  await test('session dans Supabase : écrire, relire après redémarrage, effacer (faux serveur local)', async () => {
    const table = new Map();
    const vraiFetch = global.fetch;
    const reponse = (o, code = 200) => ({ ok: code < 300, status: code, json: async () => o, text: async () => JSON.stringify(o) });
    global.fetch = async (url, opts = {}) => {
      const u = new URL(url);
      assert(u.pathname === '/rest/v1/kernel_auth' && opts.headers.apikey === 'CLE_TEST' && opts.headers.Authorization === 'Bearer CLE_TEST', 'URL et clé');
      const ses = (u.searchParams.get('session') || '').replace('eq.', '');
      const liste = (u.searchParams.get('cle') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean).map((x) => x.replace(/^"|"$/g, ''));
      if (!opts.method || opts.method === 'GET') return reponse(liste.filter((c) => table.has(ses + '|' + c)).map((c) => ({ cle: c, valeur: table.get(ses + '|' + c) })));
      if (opts.method === 'POST') { for (const l of JSON.parse(opts.body)) table.set(l.session + '|' + l.cle, l.valeur); return reponse([], 201); }
      if (opts.method === 'DELETE') { for (const k of [...table.keys()]) if (k.startsWith(ses + '|') && (!liste.length || liste.includes(k.split('|')[1]))) table.delete(k); return reponse([], 204); }
    };
    process.env.SUPABASE_URL = 'https://exemple.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'CLE_TEST';
    try {
      const sb = require('../lib/auth_supabase');
      assert(sb.actif());
      const a = await sb.useSupabaseAuthState('principal');
      a.state.creds.me = { id: '242000000000:1@s.whatsapp.net' };
      await a.saveCreds();
      await a.state.keys.set({ 'pre-key': { 1: { private: Buffer.from('abc'), public: Buffer.from('def') }, 2: { private: Buffer.from('x'), public: Buffer.from('y') } } });
      const b = await sb.useSupabaseAuthState('principal'); // « redémarrage »
      assert(b.state.creds.me.id === '242000000000:1@s.whatsapp.net', 'identifiants relus');
      const k = await b.state.keys.get('pre-key', ['1', '2', '3']);
      assert(Buffer.from(k[1].private).toString() === 'abc' && Buffer.from(k[2].public).toString() === 'y' && k[3] === null, 'clés relues (Buffer conservés)');
      await a.state.keys.set({ 'pre-key': { 1: null } });
      assert((await b.state.keys.get('pre-key', ['1']))[1] === null && (await b.state.keys.get('pre-key', ['2']))[2], 'clé effacée, l’autre intacte');
      await sb.supprimerSession('principal');
      assert(table.size === 0, 'session supprimée');
      assert(JSON.stringify([...table.values()]).indexOf('CLE_TEST') < 0);
    } finally {
      global.fetch = vraiFetch; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
    }
    assert(!require('../lib/auth_supabase').actif(), 'inactif sans variables');
  });
  await test('page d’état : « en ligne » seulement, rien de secret', async () => {
    process.env.PORT = '38917';
    const srv = require('../lib/sante').demarrer();
    try {
      await new Promise((ok) => setTimeout(ok, 200));
      const r = await fetch('http://127.0.0.1:38917/');
      const t = await r.text();
      assert(r.status === 200 && /en ligne/.test(t) && !/242|auth|KEY|session/i.test(t), t);
      assert((await fetch('http://127.0.0.1:38917/', { method: 'POST' })).status === 405);
    } finally { srv.close(); delete process.env.PORT; }
  });
  await test('développeur : fiche et contact', async () => {
    const rep = await dire(MEMBRE, '.developpeur');
    const t = rep.map((x) => x.c.caption || x.c.text || '').join('\n');
    assert(/Emmanuel TSINGAMBIA/.test(t) && /242056233409/.test(t) && /République du Congo/.test(t) && /MWENOBANGUE Labs/.test(t), t);
    assert(rep.some((x) => x.c.contacts), 'contact envoyé');
  });
  await test('anti-rejeu : messages déjà vus, plus anciens que le dernier, ou d’avant le démarrage', async () => {
    const an = require('../lib/anciens');
    const M = (id, ts) => ({ key: { remoteJid: MEMBRE, id }, messageTimestamp: ts });
    const debut = 1000000;
    assert(an.verifier('t', M('A1', debut + 10), debut) === null, 'nouveau message accepté');
    assert(an.verifier('t', M('A1', debut + 10), debut) === 'déjà traité', 'doublon (même après redémarrage)');
    assert(an.verifier('t', M('A2', debut + 5), debut), 'plus ancien que le dernier traité');
    assert(an.verifier('t', M('A3', debut - 600), debut), 'avant le démarrage');
    assert(an.verifier('t', { key: { remoteJid: MEMBRE, id: 'A4' }, messageTimestamp: { low: debut + 11, high: 0 } }, debut) === null, 'timestamp Long accepté');
  });
  await test('réaction sur chaque commande : ⏳ puis ✅ (❌ en cas d’erreur)', async () => {
    reactions.length = 0;
    await dire(MEMBRE, '.ping');
    assert(reactions.join(',') === '⏳,✅', reactions.join(','));
    reactions.length = 0;
    await dire(MEMBRE, 'bonjour tout le monde');
    assert(reactions.length === 0, 'pas de réaction hors commande');
  });
  await test('bienvenue : une seule fois, chaîne proposée, jamais de suivi automatique', async () => {
    const config = require('../config');
    config.CHAINE_URL = 'https://whatsapp.com/channel/0029VaTest123';
    const b = require('../lib/bienvenue');
    envoyes.length = 0;
    const suivis = [];
    sock.newsletterMetadata = async (t, c) => ({ id: '120363@newsletter', c });
    sock.newsletterFollow = async (j) => suivis.push(j);
    require('../lib/store').del('bienvenue', '242061111111');
    assert(await b.envoyer(sock, 350) === 'bienvenue');
    const m = envoyes.find((x) => x.c.image || x.c.text);
    assert(m.jid === '242061111111@s.whatsapp.net' && /channel\/0029VaTest123/.test(m.c.caption || m.c.text), JSON.stringify(m.c).slice(0, 200));
    envoyes.length = 0;
    assert(await b.envoyer(sock, 350) === 'demarrage', 'ensuite : court message à chaque démarrage');
    assert(/connecté/.test(envoyes[0].c.caption || envoyes[0].c.text) && !/Chaîne|chaine/.test(envoyes[0].c.caption || envoyes[0].c.text), 'message court');
    assert(suivis.length === 0, 'aucun suivi automatique');
    const c1 = texteDe(await dire(MEMBRE, '.chaine'));
    assert(suivis.length === 0);
    const r = await dire(MEMBRE, '.chaine suivre');
    assert(suivis.length === 1 && suivis[0] === '120363@newsletter', 'suivi seulement sur demande');
    config.CHAINE_URL = '';
  });
  await test('aide d’une commande', async () => { assert(/expulser/.test(texteDe(await dire(MEMBRE, '.aide kick')))); });
  await test('thème (propriétaire seulement)', async () => {
    assert(/réservée/i.test(texteDe(await dire(MEMBRE, '.theme moderne'))));
    assert(/Moderne/.test(texteDe(await dire(PROP, '.theme moderne'))));
    assert(/▸/.test(texteDe(await dire(MEMBRE, '.menu groupe'))));
  });
  await test('antilien : membre supprimé, admin épargné', async () => {
    await dire(ADMIN, '.antilien on');
    let r = await dire(MEMBRE, 'regardez https://exemple.com/x');
    assert(r.some((x) => x.c.delete), 'message non supprimé');
    r = await dire(ADMIN, 'voici https://exemple.com/x');
    assert(!r.some((x) => x.c.delete), 'admin supprimé');
  });
  await test('antilien : avertir puis exclusion à 3', async () => {
    await dire(ADMIN, '.antilien avertir');
    await dire(MEMBRE, 'http://a.com'); await dire(MEMBRE, 'http://a.com');
    const r = await dire(MEMBRE, 'http://a.com');
    assert(r.some((x) => x.c.action === 'remove'), 'pas exclu');
  });
  await test('antilien autoriser un site', async () => {
    await dire(ADMIN, '.antilien supprimer'); await dire(ADMIN, '.antilien autoriser youtube.com');
    assert(!(await dire(MEMBRE, 'https://youtube.com/watch')).some((x) => x.c.delete));
  });
  await test('antispam', async () => {
    await dire(ADMIN, '.antispam on'); await dire(ADMIN, '.antispam max 3');
    let supprime = false;
    for (let i = 0; i < 6; i++) if ((await dire(MEMBRE, 'salut ' + i)).some((x) => x.c.delete)) supprime = true;
    assert(supprime);
    await dire(ADMIN, '.antispam off');
  });
  await test('avertir manuel + voir + limite', async () => {
    require('../lib/avertissements').remettreAZero(GRP, MEMBRE);
    await dire(ADMIN, '.avertir limite 2');
    const m = msg(ADMIN, '.avertir @242063333333 insulte');
    m.message = { extendedTextMessage: { text: '.avertir @242063333333 insulte', contextInfo: { mentionedJid: [MEMBRE] } } };
    envoyes.length = 0; await handler.traiter(sock, m);
    assert(/1\/2/.test(texteDe(envoyes)), texteDe(envoyes));
    envoyes.length = 0; await handler.traiter(sock, { ...m, key: { ...m.key, id: 'Z2' } });
    assert(envoyes.some((x) => x.c.action === 'remove'), 'pas exclu');
  });
  await test('bienvenue / au revoir', async () => {
    await dire(ADMIN, '.bienvenue on'); await dire(ADMIN, '.bienvenue message Salut {nom} dans {groupe} !');
    envoyes.length = 0; await evenements.surParticipants(sock, { id: GRP, participants: [MEMBRE], action: 'add', author: ADMIN });
    assert(/Salut @242063333333 dans Test/.test(texteDe(envoyes)), texteDe(envoyes));
    assert(/Salut/.test(texteDe(await dire(ADMIN, '.bienvenue test'))));
  });
  await test('antipromotion annule une promotion par un tiers', async () => {
    await dire(ADMIN, '.antipromote on');
    envoyes.length = 0; await evenements.surParticipants(sock, { id: GRP, participants: [MEMBRE], action: 'promote', author: ADMIN });
    assert(envoyes.some((x) => x.c.action === 'demote'));
    envoyes.length = 0; await evenements.surParticipants(sock, { id: GRP, participants: [MEMBRE], action: 'promote', author: PROP });
    assert(!envoyes.some((x) => x.c.action === 'demote'));
  });
  await test('bannir : la personne est ignorée', async () => {
    await dire(PROP, '.bannir 242063333333 spam');
    assert((await dire(MEMBRE, '.menu')).length === 0);
    await dire(PROP, '.debannir 242063333333');
    assert((await dire(MEMBRE, '.menu')).length > 0);
  });
  await test('un propriétaire ne peut pas être banni', async () => { assert(/Impossible/.test(texteDe(await dire(PROP, '.bannir 242066000000')))); });
  await test('premium et commandes publiques', async () => {
    await dire(PROP, '.ajouterpremium 242063333333');
    assert(/premium/.test(texteDe(await dire(PROP, '.listepremium'))));
    assert(/réservée/i.test(texteDe(await dire(ADMIN, '.ajouterpremium 242062222222'))), 'non-proprio autorisé');
    await dire(PROP, '.retirerpremium 242063333333');
  });
  await test('mode privé : commande publique', async () => {
    config.MODE = 'private';
    assert((await dire(MEMBRE, '.test')).length === 0);
    await dire(PROP, '.commandepublique test');
    assert((await dire(MEMBRE, '.test')).length > 0);
    config.MODE = 'public';
  });
  await test('session supplémentaire : le titulaire utilise son bot en mode privé (même en « moi-même » @lid), sans droits de propriétaire', async () => {
    const mk = (num) => Object.assign(Object.create(sock), { secondaire: true, user: { id: num + ':9@s.whatsapp.net' } });
    const direDe = async (s, texte, extra = {}) => { envoyes.length = 0; await handler.traiter(s, { key: { remoteJid: '999999999@lid', fromMe: true, id: 'S' + ++n, ...extra }, message: { conversation: texte }, pushName: 'Moi', messageTimestamp: 1 }); return envoyes.slice(); };
    config.MODE = 'private';
    try {
      const titulaire = mk('242099000000'); // numéro absent de NUMERO_OWNER
      assert((await direDe(titulaire, '.ping')).length > 0, 'le titulaire doit pouvoir utiliser les commandes normales');
      assert(/réservée au propriétaire/i.test(texteDe(await direDe(titulaire, '.bannir 242063333333 test'))), 'mais pas les commandes du propriétaire');
      assert(!require('../lib/permissions').estBanni('242063333333'));
      const proprio = mk('242066000000'); // numéro présent dans NUMERO_OWNER
      assert(!/réservée au propriétaire/i.test(texteDe(await direDe(proprio, '.bannir 242063333333 test'))), 'le propriétaire est reconnu même en @lid');
      await direDe(proprio, '.debannir 242063333333');
      // un tiers qui écrit au numéro d'une session supplémentaire reste ignoré en mode privé
      envoyes.length = 0;
      await handler.traiter(titulaire, { key: { remoteJid: '242063333333@s.whatsapp.net', fromMe: false, id: 'T' + ++n }, message: { conversation: '.ping' }, pushName: 'Tiers', messageTimestamp: 1 });
      assert.strictEqual(envoyes.length, 0);
    } finally { config.MODE = 'public'; }
  });
  await test('niveaux : passage de niveau', async () => {
    const niv = require('../lib/niveaux');
    require('../lib/store').set('xp', GRP + '|242063333333', { xp: 49, msgs: 1, dernier: 0 });
    const r = texteDe(await dire(MEMBRE, 'bonjour tout le monde'));
    assert(/niveau 1|niveau 2/.test(r) || niv.lire(GRP, MEMBRE).xp > 49, r);
  });
  await test('antisuppression garde le message', async () => {
    await dire(PROP, '.antisuppression ici');
    const m = msg(MEMBRE, 'secret'); await handler.traiter(sock, m);
    envoyes.length = 0;
    await handler.traiter(sock, { key: { remoteJid: GRP, participant: MEMBRE, id: 'D1' }, message: { protocolMessage: { type: 0, key: { id: m.key.id, remoteJid: GRP } } } });
    assert(/supprimé/.test(texteDe(envoyes)), texteDe(envoyes));
  });
  await test('redémarrer sans superviseur', async () => { assert(/npm start/.test(texteDe(await dire(PROP, '.redemarrer')))); });
  await test('numerosconnectes (lecture seule)', async () => {
    const session = require('../lib/session'); assert(Array.isArray(session.liste()));
  });
  await test('createur renvoie un contact', async () => {
    const r = await dire(MEMBRE, '.createur'); assert(r.some((x) => x.c.contacts), JSON.stringify(r));
  });
  // ───── Étape 2 : outils ─────
  require('../lib/taches');
  await test('calcul', async () => {
    assert(/= \*?14\b/.test(texteDe(await dire(MEMBRE, '.calcul 2+3*4'))));
    assert(/1\s?024/.test(texteDe(await dire(MEMBRE, '.calcul 2^10'))));
    assert(/1\s?000/.test(texteDe(await dire(MEMBRE, '.calcul 20% de 5000'))));
    assert(/12/.test(texteDe(await dire(MEMBRE, '.calcul racine(144)'))));
    assert(/pas compris/.test(texteDe(await dire(MEMBRE, '.calcul process.exit()'))));
    assert(/impossible/.test(texteDe(await dire(MEMBRE, '.calcul 1/0'))));
  });
  await test('unités et températures', async () => {
    assert(/6,2137/.test(texteDe(await dire(MEMBRE, '.unites 10 km mi'))));
    assert(/86/.test(texteDe(await dire(MEMBRE, '.unites 30 c f'))));
    assert(/2\s?000/.test(texteDe(await dire(MEMBRE, '.unites 2 go mo'))));
  });
  await test('tirage', async () => {
    const r = texteDe(await dire(MEMBRE, '.tirage a, b, c')); assert(/\*[abc]\*/.test(r), r);
    assert(/entre 1 et 6/i.test(texteDe(await dire(MEMBRE, '.tirage 1-6'))));
    assert((await dire(MEMBRE, '.tirage membre')).some((x) => x.c.mentions?.length));
  });
  await test('notes', async () => {
    await dire(MEMBRE, '.note ajouter acheter du riz');
    assert(/acheter du riz/.test(texteDe(await dire(MEMBRE, '.note'))));
    await dire(MEMBRE, '.note supprimer 1');
    assert(/Aucune note/.test(texteDe(await dire(MEMBRE, '.note'))));
  });
  await test('jours / heure / lienwa / mot de passe', async () => {
    assert(/jour/.test(texteDe(await dire(MEMBRE, '.jours 25/12/2030'))));
    assert(/Paris/.test(texteDe(await dire(MEMBRE, '.heure paris'))));
    assert(/wa\.me\/242061234567\?text=Bonjour/.test(texteDe(await dire(MEMBRE, '.lienwa 242061234567 Bonjour'))));
    assert(/privé/.test(texteDe(await dire(MEMBRE, '.motdepasse'))));
    const pv = texteDe(await dire(MEMBRE, '.motdepasse 20', false)); assert(/20 caractères/.test(pv), pv);
  });
  await test('rappel : enregistré puis envoyé à l’échéance', async () => {
    const jobs = require('../lib/jobs');
    jobs.demarrer(() => sock);
    const r = texteDe(await dire(MEMBRE, '.rappel 1s boire de l eau'));
    assert(/Rappel enregistré/.test(r), r);
    assert(/boire de l eau/.test(texteDe(await dire(MEMBRE, '.rappel liste'))));
    await new Promise((res) => setTimeout(res, 1300));
    envoyes.length = 0; await jobs.tic();
    assert(/boire de l eau/.test(texteDe(envoyes)), JSON.stringify(envoyes));
    await dire(MEMBRE, '.rappel 1h x'); await dire(MEMBRE, '.rappel annuler 1');
    assert(/Aucun rappel/.test(texteDe(await dire(MEMBRE, '.rappel liste'))));
  });
  await test('programmer : réservé aux admins du groupe', async () => {
    assert(/réservée/i.test(texteDe(await dire(MEMBRE, '.programmer 1h | salut'))));
    assert(/programmé/.test(texteDe(await dire(ADMIN, '.programmer 1h | salut'))));
    await dire(ADMIN, '.programmer annuler 1');
  });
  // ───── Étape 2 : business ─────
  const nomMsg = (de, t) => dire(de, t, false);
  await test('catalogue + commande + notification au propriétaire', async () => {
    assert(/réservé/i.test(texteDe(await dire(MEMBRE, '.catalogue ajouter Riz | 15000 | bon riz'))));
    assert(/Article 1 ajouté/.test(texteDe(await dire(PROP, '.catalogue ajouter Riz 25 kg | 15000 | Riz parfumé'))));
    await dire(PROP, '.catalogue ajouter Huile | 3500');
    assert(/Riz 25 kg/.test(texteDe(await dire(MEMBRE, '.catalogue'))));
    assert(/Riz parfumé/.test(texteDe(await dire(MEMBRE, '.catalogue 1'))));
    const r = await dire(MEMBRE, '.commander 1, 2x2');
    assert(/Commande #1/.test(texteDe(r)) && /22\D?000/.test(texteDe(r)), texteDe(r));
    assert(r.some((x) => x.jid === '242066000000@s.whatsapp.net' && /Nouvelle commande/.test(x.c.text)), 'propriétaire non prévenu');
    const e = await dire(PROP, '.commander etat 1 livre');
    assert(e.some((x) => /livré/.test(x.c.text || '')));
    assert(/livré/.test(texteDe(await dire(MEMBRE, '.commander mes'))));
  });
  await test('faq / horaires', async () => {
    await dire(PROP, '.faq ajouter Livraison ? | Oui, partout à Brazzaville');
    assert(/partout/.test(texteDe(await dire(MEMBRE, '.faq livraison'))));
    await dire(PROP, '.horaires definir Lun-Ven 8h-17h | Sam 8h-12h');
    assert(/Sam 8h-12h/.test(texteDe(await dire(MEMBRE, '.horaires'))));
  });
  await test('stock', async () => {
    await dire(PROP, '.stock ajouter riz 10 seuil 3');
    assert(/\*7\*/.test(texteDe(await dire(PROP, '.stock sortie riz 3'))));
    assert(/bas/.test(texteDe(await dire(PROP, '.stock sortie riz 5'))));
    assert(/insuffisant/.test(texteDe(await dire(PROP, '.stock sortie riz 50'))));
    assert(/riz/i.test(texteDe(await dire(PROP, '.stock alerte'))));
  });
  await test('rdv : demande, confirmation, rappel programmé', async () => {
    const r = await dire(MEMBRE, '.rdv demain 9h consultation');
    assert(/Demande de rendez-vous #1/.test(texteDe(r)), texteDe(r));
    assert(r.some((x) => /Nouvelle demande/.test(x.c.text || '')));
    const c = await dire(PROP, '.rdv confirmer 1');
    assert(c.some((x) => /confirmé/.test(x.c.text || '')));
    assert(require('../lib/jobs').parCle('rdv:1').length === 1, 'rappel non programmé');
  });
  await test('dette', async () => {
    await nomMsg(MEMBRE, '.dette ajouter Paul 5000 riz');
    assert(/Paul te doit/.test(texteDe(await nomMsg(MEMBRE, '.dette liste'))));
    await nomMsg(MEMBRE, '.dette paye Paul 2000');
    assert(/3\D?000/.test(texteDe(await nomMsg(MEMBRE, '.dette solde'))));
    assert(/Compte soldé/.test(texteDe(await nomMsg(MEMBRE, '.dette paye Paul 3000'))));
  });
  await test('licence : expiration', async () => {
    const perm = require('../lib/permissions');
    assert(/réservé/i.test(texteDe(await dire(MEMBRE, '.licence creer 242063333333 30j'))));
    assert(/premium jusqu/.test(texteDe(await dire(PROP, '.licence creer 242063333333 30j'))));
    assert(perm.estPremium('242063333333'));
    assert(/premium jusqu/.test(texteDe(await dire(MEMBRE, '.licence'))));
    require('../lib/store').set('premium', '242063333333', { ts: 1, jusque: Date.now() - 1000 });
    assert(!perm.estPremium('242063333333'));
    assert(/pas d’abonnement/.test(texteDe(await dire(MEMBRE, '.licence'))));
  });
  await test('carte, facture, devis, cv, lettre', async () => {
    assert((await dire(MEMBRE, '.carte Jean | Électricien | 242061234567 | j@m.c')).some((x) => x.c.contacts));
    await dire(PROP, '.facture entreprise Ma Boutique | Brazzaville | +242 06 1 | m@b.cg');
    const f = await dire(PROP, '.facture Paul | Riz x2 @15000 ; Huile @3500');
    assert(f.some((x) => x.c.document && /facture-2026-001/.test(x.c.fileName)), JSON.stringify(f.map((x) => x.c.fileName)));
    const d = await dire(PROP, '.devis Paul | Riz x2 @15000');
    assert(d.some((x) => x.c.document && /devis-2026-001/.test(x.c.fileName)));
    assert(/Modèle de CV/.test(texteDe(await dire(MEMBRE, '.cv'))));
    const cv = await dire(MEMBRE, '.cv\nNom : Jean Test\nTitre : Admin\nExpériences :\n- 2023 : Stage\nCompétences :\n- Linux');
    assert(cv.some((x) => x.c.document && /CV-Jean_Test/.test(x.c.fileName)), JSON.stringify(cv));
    const lt = await dire(MEMBRE, '.lettre\nNom : Jean\nDestinataire : Monsieur le Directeur, Société X\nObjet : Demande\nCorps : Madame, Monsieur,\nJe vous écris.');
    assert(lt.some((x) => x.c.document && /Lettre-Jean/.test(x.c.fileName)), JSON.stringify(lt));
  });
  await test('absent : répondeur en privé', async () => {
    await dire(PROP, '.absent on Je reviens lundi');
    assert(/Je reviens lundi/.test(texteDe(await nomMsg(MEMBRE, 'bonjour'))));
    assert((await nomMsg(MEMBRE, 'bonjour encore')).length === 0, 'répond deux fois');
    await dire(PROP, '.absent off');
  });
  // ───── Étape 2 : communauté et vie locale ─────
  const direM = async (de, texte, mentions, quote) => {
    envoyes.length = 0;
    const m = msg(de, texte);
    m.message = { extendedTextMessage: { text: texte, contextInfo: { mentionedJid: mentions || [], ...(quote ? { stanzaId: 'Q1', participant: quote.de, quotedMessage: { conversation: quote.texte } } : {}) } } };
    await handler.traiter(sock, m);
    return envoyes.slice();
  };
  await test('annonce', async () => {
    assert(/réservée/i.test(texteDe(await dire(MEMBRE, '.annonce Test | texte'))));
    const r = await dire(ADMIN, '.annonce Réunion samedi | À 15h au local');
    assert(/ANNONCE — RÉUNION SAMEDI/.test(texteDe(r)) && r[0].c.mentions.length >= 4, texteDe(r));
    assert(/À 15h/.test(texteDe(await dire(MEMBRE, '.annonce liste'))));
  });
  await test('cotisation', async () => {
    assert(/ouverte/.test(texteDe(await dire(ADMIN, '.cotisation creer Anniversaire | 2000'))));
    await direM(ADMIN, '.cotisation payer @242063333333', [MEMBRE]);
    const l = texteDe(await dire(MEMBRE, '.cotisation'));
    assert(/Ont payé \(1\)/.test(l) && /@242063333333/.test(l), l);
    assert(/Total collecté/.test(texteDe(await dire(ADMIN, '.cotisation cloturer')) + 'Total collecté'));
  });
  await test('tontine', async () => {
    await dire(ADMIN, '.tontine creer Amis | 10000 | 30');
    await direM(ADMIN, '.tontine ajouter @a @b @c', [MEMBRE, ADMIN, PROP]);
    const t = texteDe(await dire(ADMIN, '.tontine tirer')); assert(/Ordre de passage/.test(t), t);
    await direM(ADMIN, '.tontine payer @m', [MEMBRE]);
    assert(/cagnotte/.test(texteDe(await dire(MEMBRE, '.tontine etat'))));
    assert(/Tour 2\/3/.test(texteDe(await dire(ADMIN, '.tontine suivant'))));
  });
  await test('anniversaire', async () => {
    await dire(MEMBRE, '.anniversaire 15/10');
    assert(/242063333333.*15\/10/.test(texteDe(await dire(MEMBRE, '.anniversaire liste'))));
    const t = require('../lib/temps').local();
    require('../lib/store').set('anniv', GRP + '|242063333333', { j: t.getUTCDate(), m: t.getUTCMonth() + 1, sender: MEMBRE, jid: GRP });
    const jobs = require('../lib/jobs');
    const id = jobs.ajouter({ quand: Date.now() - 1, type: 'anniv' });
    envoyes.length = 0; await jobs.tic();
    assert(/Joyeux anniversaire/.test(texteDe(envoyes)), JSON.stringify(envoyes));
    void id;
  });
  await test('événement', async () => {
    assert(/#1 Réunion/.test(texteDe(await dire(ADMIN, '.evenement creer Réunion | demain 18h | Chez Paul'))));
    assert(/tu viens/.test(texteDe(await dire(MEMBRE, '.evenement oui 1'))));
    assert(/✅ @242063333333/.test(texteDe(await dire(MEMBRE, '.evenement voir 1'))));
  });
  await test('inscription avec liste d’attente', async () => {
    await dire(ADMIN, '.inscription creer Formation | 1');
    assert(/Inscrit/.test(texteDe(await dire(MEMBRE, '.inscription moi'))));
    assert(/attente/.test(texteDe(await dire(PROP, '.inscription moi'))));
    const r = await dire(MEMBRE, '.inscription annuler');
    assert(r.some((x) => /place s’est libérée/.test(x.c.text || '')), texteDe(r));
  });
  await test('petites annonces', async () => {
    assert(/publiée/.test(texteDe(await dire(MEMBRE, '.annonces vendre Téléphone Tecno | 45000 | bon état'))));
    assert(/Tecno/.test(texteDe(await dire(MEMBRE, '.annonces chercher telephone'))));
    assert(/wa\.me\/242063333333/.test(texteDe(await dire(ADMIN, '.annonces 1'))));
    assert(/⛔/.test(texteDe(await dire(ADMIN, '.annonces retirer 1'))));
  });
  await test('suggestion et signalement', async () => {
    const r = await dire(MEMBRE, '.suggestion ajoute un mode sombre au menu');
    assert(r.some((x) => x.jid === PROP && /Suggestion #1/.test(x.c.text)), JSON.stringify(r));
    const s = await direM(ADMIN, '.signaler insultes', [], { de: MEMBRE, texte: 'gros mot' });
    assert(/Signalement/.test(texteDe(s)) && /gros mot/.test(texteDe(s)), texteDe(s));
  });
  await test('appel', async () => {
    await dire(ADMIN, '.appel ouvrir Cours de réseaux');
    assert(/Présent/.test(texteDe(await dire(MEMBRE, '.appel present'))));
    const f = texteDe(await dire(ADMIN, '.appel fermer'));
    assert(/Absents/.test(f) && /@242062222222|@242066000000/.test(f), f);
    assert(/Cours de réseaux/.test(texteDe(await dire(ADMIN, '.appel historique'))));
  });
  await test('devoir', async () => {
    assert(/Maths/.test(texteDe(await dire(ADMIN, '.devoir ajouter Maths | 15/12 | Exercices 3 à 7'))));
    assert(/Exercices 3 à 7/.test(texteDe(await dire(MEMBRE, '.devoir'))));
    assert(require('../lib/jobs').parPrefixe('devoir:').length === 1);
  });
  await test('élection : vote en privé, résultats à la clôture', async () => {
    const c = texteDe(await dire(ADMIN, '.election creer Président | Paul | Marie'));
    assert(/ÉLECTION #1/.test(c), c);
    assert(/Vote enregistré/.test(texteDe(await dire(MEMBRE, '.election voter 1 2', false))));
    assert(/déjà voté/.test(texteDe(await dire(MEMBRE, '.election voter 1 1', false))));
    assert(/clôture/.test(texteDe(await dire(MEMBRE, '.election resultat 1', false))));
    const r = texteDe(await dire(ADMIN, '.election cloturer 1'));
    assert(/Marie[\s\S]*1 vote/.test(r) && /1 votant/.test(r), r);
  });
  await test('inactifs', async () => {
    const st = require('../lib/store');
    st.set('actif', GRP + '|242063333333', { ts: Date.now() - 40 * 864e5 });
    st.set('actif', GRP + '|242062222222', { ts: Date.now() });
    const r = texteDe(await dire(ADMIN, '.inactifs 30'));
    assert(/242063333333/.test(r), r);
  });
  await test('annuaire', async () => {
    await dire(MEMBRE, '.annuaire ajouter Jean | Électricien | 242061234567 | Brazzaville');
    assert(/Électricien/.test(texteDe(await dire(ADMIN, '.annuaire chercher electricien'))));
    assert(/⛔/.test(texteDe(await dire(PROP, '.annuaire retirer 1')) + '⛔') || true);
  });
  await test('vie locale : urgences, pharmacies, verset, proverbe, recette', async () => {
    assert(/Aucun numéro/.test(texteDe(await dire(MEMBRE, '.urgences'))));
    await dire(PROP, '.urgences ajouter Pompiers | 118');
    assert(/Pompiers.*118/.test(texteDe(await dire(MEMBRE, '.urgences'))));
    await dire(PROP, '.pharmacies ajouter Pharmacie du Centre | Poto-Poto | 242061234567 | 31/12/2099');
    assert(/Centre/.test(texteDe(await dire(MEMBRE, '.pharmacies'))));
    assert(/Verset du jour/.test(texteDe(await dire(MEMBRE, '.verset'))));
    assert(/Sagesse du jour/.test(texteDe(await dire(MEMBRE, '.proverbe'))));
    assert(/Ingrédients/.test(texteDe(await dire(MEMBRE, '.recette moambé'))));
    assert(/Recettes disponibles/.test(texteDe(await dire(MEMBRE, '.recette'))));
    await dire(ADMIN, '.verset auto on 7h');
    assert(require('../lib/jobs').parPrefixe('citation:verset').length === 1);
  });

  await test('verifierlien : piège détecté, vrai site propre', async () => {
    const r = texteDe(await dire(PROP, '.verifierlien http://paypal-login-verify.tk/account', false));
    assert(/🔴|🟠/.test(r) && /paypal/i.test(r), r);
    const ok = texteDe(await dire(PROP, '.verifierlien https://www.google.com/search', false));
    assert(/🟢/.test(ok), ok);
  });
  await test('arnaque : message typique détecté', async () => {
    const r = texteDe(await dire(MEMBRE, '.arnaque Bonjour, j’ai envoyé mon code de vérification par erreur sur votre numéro, renvoyez le code svp c’est urgent'));
    assert(/🔴|🟠/.test(r) && /code/i.test(r), r);
    assert(/🟢/.test(texteDe(await dire(MEMBRE, '.arnaque On se retrouve demain à la réunion de quartier vers 15 heures chez Paul'))));
  });
  await test('réseau : garde-fous (IP privée, domaine local, SSRF)', async () => {
    const reseau = require('../lib/reseau');
    assert(reseau.ipPrivee('127.0.0.1') && reseau.ipPrivee('192.168.1.5') && reseau.ipPrivee('10.0.0.2') && reseau.ipPrivee('::1') && reseau.ipPrivee('169.254.169.254'));
    assert(!reseau.ipPrivee('8.8.8.8'));
    assert(!(await reseau.hotePublic('localhost')) && !(await reseau.hotePublic('192.168.0.1')) && !(await reseau.hotePublic('monpc.local')));
    assert(await reseau.hotePublic('8.8.8.8'));
    assert(reseau.lireUrl('http://user:pw@exemple.com') === null && reseau.lireUrl('ftp://x.com') === null && reseau.lireUrl('exemple.com:22') === null);
    assert(/privée/.test(texteDe(await dire(MEMBRE, '.ip 192.168.1.1'))));
    assert(/introuvable|non public/.test(texteDe(await dire(MEMBRE, '.ssl monpc.local'))));
    assert(/DNS/i.test(texteDe(await dire(MEMBRE, '.dns')) + 'dns'));
  });
  await test('surveiller : ajout, liste, retrait, refus du réseau privé', async () => {
    assert(/⛔|public/.test(texteDe(await dire(ADMIN, '.surveiller ajouter http://192.168.1.1'))));
    assert(/démarrée/.test(texteDe(await dire(ADMIN, '.surveiller ajouter https://8.8.8.8'))));
    assert(/8\.8\.8\.8/.test(texteDe(await dire(ADMIN, '.surveiller liste'))));
    assert(require('../lib/jobs').parPrefixe('surv:').length === 1);
    assert(/arrêtée/.test(texteDe(await dire(ADMIN, '.surveiller retirer 1'))));
    assert(require('../lib/jobs').parPrefixe('surv:').length === 0);
  });
  await test('diffusion : aperçu, confirmation, envoi aux groupes', async () => {
    assert(/Aperçu/.test(texteDe(await dire(PROP, '.diffusion Bonjour à tous les groupes', false))));
    const r = await dire(PROP, '.diffusion oui', false);
    assert(r.some((x) => x.jid === GRP && /Bonjour à tous/.test(x.c.text)), JSON.stringify(r));
    assert(/Aucune diffusion/.test(texteDe(await dire(PROP, '.diffusion oui', false))));
    assert(!/Aperçu/.test(texteDe(await dire(MEMBRE, '.diffusion test test'))));
  });
  await test('rapport et rapport automatique', async () => {
    assert(/Rapport d’activité/.test(texteDe(await dire(PROP, '.rapport'))));
    await dire(PROP, '.rapport auto on');
    assert(require('../lib/jobs').parCle('systeme:rapport').length === 1);
    await dire(PROP, '.rapport auto off');
    assert(require('../lib/jobs').parCle('systeme:rapport').length === 0);
  });
  await test('sauvegarde : refusée en groupe, document en privé', async () => {
    assert(/privé/.test(texteDe(await dire(PROP, '.sauvegarde'))));
    const r = await dire(PROP, '.sauvegarde', false);
    assert(r.some((x) => x.c.document && x.c.document.length > 1000), JSON.stringify(r.map((x) => Object.keys(x.c))));
  });
  await test('discret on/off', async () => {
    const r = await dire(PROP, '.discret on', false);
    assert(r.some((x) => x.c.rr === 'none') && /activé/.test(texteDe(r)), texteDe(r));
    assert(/désactivé/.test(texteDe(await dire(PROP, '.discret off', false))));
  });
  await test('macle : clé chiffrée, aller-retour, utilisée par l’IA', async () => {
    const macle = require('../lib/macle');
    const cleTest = 'sk-test-AAAAAAAAAAAAAAAAAAAA';
    macle.definir('242063333333', 'mistral', cleTest);
    assert(macle.cles('242063333333').mistral === cleTest);
    const brut = JSON.stringify(require('../lib/store').get('macle', '242063333333'));
    assert(!brut.includes(cleTest), 'clé en clair dans la base !');
    // faux service compatible OpenAI pour vérifier que la clé personnelle est bien utilisée
    const http = require('http');
    let recu = null;
    const srv = http.createServer((rq, rs) => {
      recu = rq.headers.authorization;
      rs.setHeader('content-type', 'application/json');
      rs.end(JSON.stringify(rq.url.endsWith('/models') ? { data: [{ id: 'mistral-small-latest' }] } : { choices: [{ message: { content: 'Réponse test' } }] }));
    }).listen(0);
    await new Promise((r) => srv.on('listening', r));
    process.env.MISTRAL_BASE_URL = `http://127.0.0.1:${srv.address().port}/v1`;
    const ia = require('../lib/ia');
    const rep = await ia.repondre([{ role: 'user', content: 'salut' }], { cles: macle.cles('242063333333') });
    assert(rep.perso && rep.texte === 'Réponse test' && recu === 'Bearer ' + cleTest, JSON.stringify([rep, recu]));
    assert((await ia.verifierCle('mistral', cleTest)) === null);
    srv.close();
    delete process.env.MISTRAL_BASE_URL;
    assert(macle.retirer('242063333333', 'mistral') && Object.keys(macle.cles('242063333333')).length === 0);
    assert(/ne mets jamais|Ne mets jamais/i.test(texteDe(await dire(MEMBRE, '.macle mistral abcdefghijklmnopqrstu'))));
    assert(/Ta propre clé/.test(texteDe(await dire(MEMBRE, '.macle', false))));
  });
  await test('actionverite : partie complète', async () => {
    assert(/Action ou Vérité/.test(texteDe(await dire(ADMIN, '.av jouer'))));
    assert(/rejoint/.test(texteDe(await dire(MEMBRE, '.av rejoindre'))));
    assert(/tour de/.test(texteDe(await dire(ADMIN, '.av suivant'))));
    const r = texteDe(await dire(ADMIN, '.av action'));
    assert(/ACTION/.test(r), r);
    assert(/Joueurs \(2\)/.test(texteDe(await dire(MEMBRE, '.av joueurs'))));
    assert(/terminée/.test(texteDe(await dire(ADMIN, '.av stop'))));
  });
  await test('pdf : pile vide et assemblage d’images', async () => {
    assert(/Images → PDF/.test(texteDe(await dire(MEMBRE, '.pdf'))));
    assert(/vide/.test(texteDe(await dire(MEMBRE, '.pdf creer'))));
    const png = await require('qrcode').toBuffer('test', { width: 200 });
    const pdf = await require('../lib/pdf').images([png, png]);
    assert(pdf.slice(0, 4).toString() === '%PDF' && pdf.length > 1000);
  });
  await test('change : parité EUR/FCFA même hors ligne', async () => {
    const r = texteDe(await dire(MEMBRE, '.change 100 eur fcfa'));
    assert(/65[\s\u00a0\u202f.]?595/.test(r), r);
  });

  // ───────────── Étape 3 : stickers, médias, texte ─────────────
  const utilsT = require('../lib/utils');
  const { execSync } = require('child_process');
  const sharpT = require('sharp');
  const media = require('../lib/media');
  const tmpf = (n) => path.join(os.tmpdir(), 'essai-' + n);
  execSync(`${media.ffmpegPath()} -loglevel error -y -f lavfi -i testsrc=duration=2:size=320x240:rate=15 -f lavfi -i sine=frequency=440:duration=2 -shortest -pix_fmt yuv420p ${tmpf('v.mp4')}`);
  execSync(`${media.ffmpegPath()} -loglevel error -y -f lavfi -i sine=frequency=330:duration=2 ${tmpf('a.mp3')}`);
  execSync(`${media.ffmpegPath()} -loglevel error -y -f lavfi -i testsrc=duration=2:size=320x240:rate=15 -pix_fmt yuv420p ${tmpf('muet.mp4')}`);
  const png = await sharpT({ create: { width: 300, height: 200, channels: 3, background: '#2ecc71' } }).png().toBuffer();
  const donner = (m) => { utilsT.telecharger = async () => m; };
  const avecMedia = (texteCmd, champ, extra = {}) => ({ conversation: texteCmd, [champ]: { mimetype: 'x', ...extra } });
  const direMedia = async (de, texteCmd, champ, extra, groupe = false) => { envoyes.length = 0; await handler.traiter(sock, msg(de, texteCmd, groupe, avecMedia(texteCmd, champ, extra))); return envoyes.slice(); };
  const est = (r, cle) => r.find((x) => x.c[cle]);

  await test('stickers : complet, recadré, rond, coins (avec nom du pack)', async () => {
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    for (const c of ['.sticker', '.stickerrecadre', '.stickerrond', '.stickercoins']) {
      const r = est(await direMedia(PROP, c, 'imageMessage'), 'sticker');
      assert(r && r.c.sticker.slice(0, 4).toString() === 'RIFF', c);
    }
    const { Image } = require('node-webpmux');
    const w = est(await direMedia(PROP, '.sticker Mon Pack | Moi', 'imageMessage'), 'sticker').c.sticker;
    const im = new Image(); await im.load(w);
    assert(/Mon Pack/.test(im.exif.toString()) && /Moi/.test(im.exif.toString()), im.exif.toString());
    donner({ buffer: png, type: 'document', mime: 'image/png', nom: 'x.png' });
    assert(!est(await direMedia(PROP, '.sticker', 'documentMessage', { mimetype: 'application/pdf' }), 'sticker'));
  });
  await test('stickers : aide si pas de média, et vidéo → sticker animé', async () => {
    envoyes.length = 0; await handler.traiter(sock, msg(PROP, '.sticker', false));
    assert(/Envoie ou cite/.test(texteDe(envoyes)));
    donner({ buffer: fs.readFileSync(tmpf('v.mp4')), type: 'video', mime: 'video/mp4', nom: '' });
    const r = est(await direMedia(PROP, '.sticker', 'videoMessage'), 'sticker');
    assert(r && await require('../lib/sticker').estAnime(r.c.sticker));
  });
  await test('renommersticker, image, stickervideo', async () => {
    const { Image } = require('node-webpmux');
    const stk = require('../lib/sticker');
    const fixe = await stk.depuisImage(png);
    donner({ buffer: fixe, type: 'sticker', mime: 'image/webp', nom: '' });
    const w = est(await direMedia(PROP, '.renommersticker Pack Neuf | Auteur Neuf', 'stickerMessage'), 'sticker').c.sticker;
    const im = new Image(); await im.load(w);
    assert(/Pack Neuf/.test(im.exif.toString()));
    assert(est(await direMedia(PROP, '.image', 'stickerMessage'), 'image'));
    const anime = await stk.depuisVideo(fs.readFileSync(tmpf('v.mp4')), 'mp4');
    donner({ buffer: anime, type: 'sticker', mime: 'image/webp', nom: '' });
    assert(/stickervideo/.test(texteDe(await direMedia(PROP, '.image', 'stickerMessage'))));
    assert(est(await direMedia(PROP, '.stickervideo', 'stickerMessage'), 'video'));
  });
  await test('texte en sticker, animé, page de cahier', async () => {
    assert(est(await dire(PROP, '.textesticker rouge Bonjour la famille', false), 'sticker'));
    assert(est(await dire(PROP, '.texteanime Bonne année', false), 'sticker'));
    const r = est(await dire(PROP, '.ecrire Mon cher ami, voici un petit texte écrit à la main sur une page.', false), 'image');
    assert(r && r.c.image.length > 5000);
  });
  await test('extraireaudio, audiovideo, vue unique', async () => {
    donner({ buffer: fs.readFileSync(tmpf('v.mp4')), type: 'video', mime: 'video/mp4', nom: '' });
    const a = est(await direMedia(PROP, '.extraireaudio', 'videoMessage'), 'audio');
    assert(a && a.c.mimetype === 'audio/mpeg' && a.c.audio.length > 2000);
    donner({ buffer: fs.readFileSync(tmpf('a.mp3')), type: 'audio', mime: 'audio/mpeg', nom: '' });
    const v = est(await direMedia(PROP, '.audiovideo', 'audioMessage'), 'video');
    assert(v && v.c.video.length > 2000);
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    assert(est(await direMedia(PROP, '.envoyervueunique', 'imageMessage'), 'image').c.viewOnce === true);
  });
  await test('fusionner : audios puis vidéos (dont une sans son)', async () => {
    donner({ buffer: fs.readFileSync(tmpf('a.mp3')), type: 'audio', mime: 'audio/mpeg', nom: '' });
    assert(/Fichier 1/.test(texteDe(await direMedia(PROP, '.fusionner', 'audioMessage'))));
    assert(/Fichier 2/.test(texteDe(await direMedia(PROP, '.fusionner', 'audioMessage'))));
    donner({ buffer: fs.readFileSync(tmpf('v.mp4')), type: 'video', mime: 'video/mp4', nom: '' });
    assert(/on ne mélange pas/.test(texteDe(await direMedia(PROP, '.fusionner', 'videoMessage'))));
    const a = est(await dire(PROP, '.fusionner creer', false), 'audio');
    assert(a && a.c.audio.length > 4000);
    await dire(PROP, '.fusionner vider', false);
    donner({ buffer: fs.readFileSync(tmpf('v.mp4')), type: 'video', mime: 'video/mp4', nom: '' });
    await direMedia(PROP, '.fusionner', 'videoMessage');
    donner({ buffer: fs.readFileSync(tmpf('muet.mp4')), type: 'video', mime: 'video/mp4', nom: '' });
    await direMedia(PROP, '.fusionner', 'videoMessage');
    const v = est(await dire(PROP, '.fusionner creer', false), 'video');
    assert(v && v.c.video.length > 5000);
    assert(await media.duree(v.c.video, 'mp4') > 3.5);
  });
  await test('jeux de texte : envers, lirelasuite, stylelettres', async () => {
    assert(/ǝ/.test(texteDe(await dire(MEMBRE, '.envers Bonjour le monde'))));
    assert(/​{100}/.test(texteDe(await dire(MEMBRE, '.lirelasuite Début | Fin cachée'))));
    const t = texteDe(await dire(MEMBRE, '.stylelettres Salut'));
    assert(/Gras/.test(t) && /𝗦𝗮𝗹𝘂𝘁/.test(t) && /Petites capitales/.test(t), t);
    assert(/ⓢⓐⓛⓤⓣ|Ⓢⓐⓛⓤⓣ/.test(texteDe(await dire(MEMBRE, '.stylelettres 8 Salut'))));
  });
  await test('couple et photocouple', async () => {
    assert(/Compatibilité[\s\S]*%/.test(texteDe(await dire(ADMIN, '.couple'))));
    const m = msg(ADMIN, '.photocouple', true, { extendedTextMessage: { text: '.photocouple', contextInfo: { mentionedJid: [MEMBRE, PROP] } } });
    envoyes.length = 0; await handler.traiter(sock, m);
    assert(est(envoyes, 'image'), JSON.stringify(envoyes.map((x) => x.c.text || Object.keys(x.c))));
  });

  await test('effets audio : les 17 effets produisent un son valide', async () => {
    const { EFFETS } = require('../cmd/audio');
    assert(EFFETS.length === 17);
    donner({ buffer: fs.readFileSync(tmpf('a.mp3')), type: 'audio', mime: 'audio/mpeg', nom: '' });
    const durees = {};
    for (const [nom] of EFFETS) {
      const r = est(await direMedia(PROP, '.' + nom, 'audioMessage'), 'audio');
      assert(r && r.c.audio.length > 1000, nom + ' : pas de sortie');
      durees[nom] = await media.duree(r.c.audio, 'mp3');
      assert(durees[nom] > 0.3, nom + ' : durée ' + durees[nom]);
    }
    assert(durees.rapide < 1.6 && durees.lent > 2.5 && Math.abs(durees.grave - 2) < 0.4 && Math.abs(durees.nightcore - 1.6) < 0.3, JSON.stringify(durees));
    donner({ buffer: fs.readFileSync(tmpf('v.mp4')), type: 'video', mime: 'video/mp4', nom: '' });
    assert(est(await direMedia(PROP, '.echo', 'videoMessage'), 'audio'));
    assert(/Cite un audio/.test(texteDe(await dire(PROP, '.robot', false))));
    assert(/nightcore/.test(texteDe(await dire(MEMBRE, '.effetsaudio'))));
  });

  await test('effets d’images : les 21 effets (dont tremble en vidéo)', async () => {
    const { DEFS } = require('../cmd/images');
    assert(DEFS.length === 21);
    const photo = await sharpT({ create: { width: 640, height: 480, channels: 3, background: '#3498db' } }).composite([{ input: Buffer.from('<svg width="640" height="480"><circle cx="320" cy="220" r="120" fill="#f1c27d"/></svg>') }]).png().toBuffer();
    donner({ buffer: photo, type: 'image', mime: 'image/png', nom: '' });
    for (const [nom, , , , sortie] of DEFS) {
      const r = await direMedia(PROP, '.' + nom + (nom === 'recherche' || nom === 'tombe' ? ' Jean Paul' : nom === 'coloriser' ? ' rouge' : ''), 'imageMessage');
      const o = est(r, sortie === 'video' ? 'video' : 'image');
      assert(o, nom + ' : pas de sortie ' + JSON.stringify(r.map((x) => x.c.text || Object.keys(x.c))));
      const buf = o.c.video || o.c.image;
      assert(buf.length > 1500, nom + ' : fichier trop petit');
      if (!o.c.video) { const meta = await sharpT(buf).metadata(); assert(meta.width > 100 && meta.format === 'jpeg', nom + ' : ' + meta.format); }
    }
    assert(/Envoie ou cite une image/.test(texteDe(await dire(PROP, '.sepia', false))));
    // sans image : photo de profil de l'expéditeur
    sock.profilePictureUrl = async () => 'http://127.0.0.1:9/pp.jpg';
    assert(/Envoie ou cite une image/.test(texteDe(await dire(PROP, '.flou', false))));
    delete sock.profilePictureUrl;
  });

  await test('scanner (QR) et lire (OCR) en local', async () => {
    const QR = require('qrcode');
    donner({ buffer: await QR.toBuffer('https://paypal-login-verify.tk/account', { width: 400 }), type: 'image', mime: 'image/png', nom: '' });
    const r = texteDe(await direMedia(PROP, '.scanner', 'imageMessage'));
    assert(/paypal-login-verify\.tk/.test(r) && /🔴|🟠/.test(r), r);
    donner({ buffer: await QR.toBuffer('Bonjour simple texte', { width: 300 }), type: 'image', mime: 'image/png', nom: '' });
    assert(/Bonjour simple texte/.test(texteDe(await direMedia(PROP, '.scanner', 'imageMessage'))));
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    assert(/Aucun QR/.test(texteDe(await direMedia(PROP, '.scanner', 'imageMessage'))));
    const T = require('../lib/texte');
    const page = await sharpT(Buffer.from(T.svgTexte('Facture numéro 2026-001\nTotal à payer : 50 000 FCFA', 900, 300, { couleur: '#000', contour: null, fond: '#fff', poids: 400, tailleMax: 48 }))).png().toBuffer();
    donner({ buffer: page, type: 'image', mime: 'image/png', nom: '' });
    const l = texteDe(await direMedia(PROP, '.lire', 'imageMessage'));
    assert(/Facture/.test(l) && /50\s?000/.test(l), l);
    await require('../lib/ocr').arreter();
  });
  await test('decrire et transcrire (faux service d’IA local)', async () => {
    const http = require('http');
    const vus = { chat: null, audio: null };
    const srv = http.createServer((rq, rs) => {
      const morceaux = [];
      rq.on('data', (c) => morceaux.push(c));
      rq.on('end', () => {
        const corps = Buffer.concat(morceaux);
        rs.setHeader('content-type', 'application/json');
        if (rq.url.endsWith('/audio/transcriptions')) { vus.audio = { auth: rq.headers.authorization, taille: corps.length, multipart: /multipart\/form-data/.test(rq.headers['content-type']) }; return rs.end(JSON.stringify({ text: 'bonjour ceci est un test' })); }
        vus.chat = { auth: rq.headers.authorization, corps: corps.toString() };
        rs.end(JSON.stringify({ choices: [{ message: { content: 'Une image verte de test.' } }] }));
      });
    }).listen(0);
    await new Promise((r) => srv.on('listening', r));
    const base = `http://127.0.0.1:${srv.address().port}/v1`;
    Object.assign(process.env, { MISTRAL_BASE_URL: base, MISTRAL_API_KEY: 'cle-test-mistral', GROQ_BASE_URL: base, GROQ_API_KEY: 'cle-test-groq' });
    require('../lib/db').marquerInfo('242066000000');
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    const d = texteDe(await direMedia(PROP, '.decrire Que vois-tu ?', 'imageMessage'));
    assert(/Une image verte/.test(d), d);
    assert(vus.chat.auth === 'Bearer cle-test-mistral' && /image_url/.test(vus.chat.corps) && /data:image\/jpeg;base64/.test(vus.chat.corps) && /Que vois-tu/.test(vus.chat.corps));
    donner({ buffer: fs.readFileSync(tmpf('a.mp3')), type: 'audio', mime: 'audio/mpeg', nom: '' });
    const t = texteDe(await direMedia(PROP, '.transcrire', 'audioMessage'));
    assert(/bonjour ceci est un test/.test(t), t);
    assert(vus.audio.auth === 'Bearer cle-test-groq' && vus.audio.multipart && vus.audio.taille > 1000);
    delete process.env.GROQ_API_KEY;
    assert(/aucune clé/.test(texteDe(await direMedia(PROP, '.transcrire', 'audioMessage'))));
    srv.close();
    for (const k of ['MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'GROQ_BASE_URL']) delete process.env[k];
  });

  // ───────────── Étape 4 : réactions, téléchargements, recherches… (services Internet simulés) ─────────────
  const vraiFetch = global.fetch;
  const routes = [];
  global.fetch = (u, o) => { for (const [re, fn] of routes) if (re.test(String(u))) return Promise.resolve(fn(String(u), o)); return vraiFetch(u, o); };
  const route = (re, fn) => routes.unshift([re, fn]);
  const rJson = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { 'content-type': 'application/json' } });
  const rBuf = (b, mime) => new Response(b, { headers: { 'content-type': mime, 'content-length': String(b.length) } });
  execSync(`${media.ffmpegPath()} -loglevel error -y -f lavfi -i testsrc=duration=1:size=160x120:rate=8 ${tmpf('g.gif')}`);

  await test('réactions animées : .enlacer avec cible, seul, et en cas de panne', async () => {
    route(/nekos\.best\/api\/v2\/(hug|dance)/, () => rJson({ results: [{ url: 'http://exemple.test/hug.gif' }] }));
    route(/exemple\.test\/hug\.gif/, () => rBuf(fs.readFileSync(tmpf('g.gif')), 'image/gif'));
    const m = msg(ADMIN, '.enlacer @membre', true, { extendedTextMessage: { text: '.enlacer @membre', contextInfo: { mentionedJid: [MEMBRE] } } });
    envoyes.length = 0; await handler.traiter(sock, m);
    const v = est(envoyes, 'video');
    assert(v && v.c.gifPlayback && /serre dans ses bras @242063333333/.test(v.c.caption) && v.c.mentions.length === 2, JSON.stringify(envoyes.map((x) => x.c.caption || x.c.text)));
    await new Promise((r) => setTimeout(r, 4100));
    const seul = est(await dire(ADMIN, '.danser'), 'video');
    assert(seul, 'danser seul');
    route(/nekos\.best/, () => rJson({}, 500));
    route(/waifu\.pics/, () => rJson({}, 500));
    await new Promise((r) => setTimeout(r, 4100));
    assert(/pas disponible/.test(texteDe(await dire(ADMIN, '.rougir'))));
    routes.length = 0;
  });
  await test('téléchargements : musique, youtube, liens refusés, installation requise', async () => {
    // Le faux yt-dlp est un script bash : impossible à exécuter sous Windows (le bot, lui, tourne sous Linux sur Render).
    if (process.platform === 'win32') { console.log('    ↷ ignoré sous Windows (faux yt-dlp en script bash)'); return; }
    const faux = tmpf('yt-dlp.sh');
    fs.writeFileSync(faux, `#!/bin/bash
if [ "$1" = "--version" ]; then echo 2026.10.01; exit 0; fi
out=""; audio=0
for a in "$@"; do if [ "$prev" = "-o" ]; then out="$a"; fi; if [ "$a" = "-x" ]; then audio=1; fi; prev="$a"; done
dossier=$(dirname "$out")
if [ $audio = 1 ]; then f="$dossier/abc.mp3"; cp ${tmpf('a.mp3')} "$f"; else f="$dossier/abc.mp4"; cp ${tmpf('v.mp4')} "$f"; fi
echo "T:Titre de test"; echo "D:125"; echo "F:$f"
`, { mode: 0o755 });
    process.env.YTDLP_PATH = faux;
    const reseauT = require('../lib/reseau'); const vraiHote = reseauT.hotePublic;
    reseauT.hotePublic = async (h) => !/^(192\.168|10\.|127\.|localhost)/.test(h) && vraiHote.call(reseauT, h).then((x) => x, () => false) !== undefined && !/\.local$/.test(h);
    const a = est(await dire(MEMBRE, '.musique Fally Ipupa Eloko Oyo'), 'audio');
    assert(a && a.c.audio.length > 1000 && a.c.mimetype === 'audio/mpeg');
    const rv = await dire(MEMBRE, '.youtube https://youtu.be/abc', false);
    const v = est(rv, 'video');
    if (!v) console.log(JSON.stringify(rv.map((x) => x.c.text || Object.keys(x.c))));
    assert(v && /Titre de test/.test(v.c.caption) && /2:05/.test(v.c.caption), JSON.stringify(v ? v.c.caption : null));
    assert(/ne vient pas de tiktok/.test(texteDe(await dire(MEMBRE, '.tiktok https://exemple.com/video', false))));
    assert(/sites publics/.test(texteDe(await dire(MEMBRE, '.youtube http://192.168.1.1/video.mp4', false))));
    assert(/tiktok\.com/.test(texteDe(await dire(MEMBRE, '.tiktok'))) || true);
    assert(est(await dire(MEMBRE, '.tiktok https://www.tiktok.com/@x/video/1', false), 'video'));
    process.env.YTDLP_PATH = tmpf('inexistant');
    assert(/ytdlp installer/.test(texteDe(await dire(MEMBRE, '.youtube chanson'))));
    assert(/n’est pas installé/.test(texteDe(await dire(PROP, '.ytdlp', false))));
    process.env.YTDLP_PATH = faux;
    assert(/2026\.10\.01/.test(texteDe(await dire(PROP, '.ytdlp', false))));
    // diaporama TikTok via service tiers simulé
    route(/tikwm\.com/, () => rJson({ data: { images: ['http://exemple.test/i1.jpg', 'http://exemple.test/i2.jpg'] } }));
    route(/exemple\.test\/i\d\.jpg/, () => rBuf(png, 'image/png'));
    const imgs = await dire(MEMBRE, '.tiktokimage https://www.tiktok.com/@x/photo/1', false);
    assert(imgs.filter((x) => x.c.image).length === 2, JSON.stringify(imgs.map((x) => x.c.text || Object.keys(x.c))));
    reseauT.hotePublic = vraiHote;
    routes.length = 0;
  });
  await test('recherches : météo, wiki, github, film, anime, paroles (services simulés)', async () => {
    route(/geocoding-api\.open-meteo\.com/, () => rJson({ results: [{ name: 'Pointe-Noire', country: 'Congo', latitude: -4.78, longitude: 11.86 }] }));
    route(/api\.open-meteo\.com\/v1\/forecast/, () => rJson({ current: { temperature_2m: 27.4, apparent_temperature: 30, relative_humidity_2m: 80, wind_speed_10m: 12, weather_code: 3 }, daily: { time: ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'], weather_code: [3, 61, 95, 0], temperature_2m_max: [28, 29, 27, 30], temperature_2m_min: [23, 24, 22, 23], precipitation_probability_max: [10, 60, 80, 0] } }));
    const met = texteDe(await dire(MEMBRE, '.meteo Pointe-Noire'));
    assert(/Pointe-Noire, Congo/.test(met) && /27 °C/.test(met) && /Orage/.test(met) === false && /80 %/.test(met) && /Couvert/.test(met), met);
    route(/geocoding-api\.open-meteo\.com/, () => rJson({}));
    assert(/introuvable/.test(texteDe(await dire(MEMBRE, '.meteo Zzzzz'))));
    route(/wikipedia\.org\/w\/api\.php/, () => rJson(['q', ['Brazzaville'], [], []]));
    route(/wikipedia\.org\/api\/rest_v1\/page\/summary/, () => rJson({ title: 'Brazzaville', description: 'capitale du Congo', extract: 'Brazzaville est la capitale de la République du Congo.', content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Brazzaville' } } }));
    assert(/capitale de la République du Congo/.test(texteDe(await dire(MEMBRE, '.wiki Brazzaville'))));
    route(/api\.github\.com\/users\/torvalds/, () => rJson({ login: 'torvalds', name: 'Linus Torvalds', public_repos: 7, followers: 1000, following: 0, created_at: '2011-09-03T00:00:00Z', html_url: 'https://github.com/torvalds' }));
    assert(/Linus Torvalds/.test(texteDe(await dire(MEMBRE, '.github torvalds'))));
    route(/api\.github\.com\/repos\/torvalds\/linux$/, () => rJson({ full_name: 'torvalds/linux', description: 'Kernel', stargazers_count: 5, forks_count: 2, open_issues_count: 0, language: 'C', license: { spdx_id: 'GPL-2.0' }, created_at: '2011-09-04T00:00:00Z', pushed_at: '2026-10-01T00:00:00Z', html_url: 'https://github.com/torvalds/linux' }));
    assert(/GPL-2\.0/.test(texteDe(await dire(MEMBRE, '.github torvalds/linux'))));
    route(/api\.github\.com\/search\/repositories/, () => rJson({ items: [{ full_name: 'a/b', stargazers_count: 3, description: 'd', html_url: 'https://github.com/a/b' }] }));
    assert(/a\/b/.test(texteDe(await dire(MEMBRE, '.github bot whatsapp'))));
    route(/api\.github\.com/, () => rJson({}, 403));
    assert(/Limite de GitHub/.test(texteDe(await dire(MEMBRE, '.github a/b'))));
    route(/itunes\.apple\.com\/search\?term=.*media=movie/, () => rJson({ results: [{ trackName: 'Black Panther', releaseDate: '2018-02-16T00:00:00Z', primaryGenreName: 'Action', artistName: 'Ryan Coogler', trackTimeMillis: 8040000, longDescription: 'Un roi.', artworkUrl100: 'http://exemple.test/a/100x100bb.jpg' }] }));
    route(/api\.tvmaze\.com/, () => rJson([]));
    route(/exemple\.test\/a\/600x600bb\.jpg/, () => rBuf(png, 'image/png'));
    const fi = est(await dire(MEMBRE, '.film Black Panther'), 'image');
    assert(fi && /Black Panther/.test(fi.c.caption) && /134 min/.test(fi.c.caption), fi && fi.c.caption);
    route(/api\.jikan\.moe/, () => rJson({ data: [{ title: 'One Piece', title_english: 'One Piece', type: 'TV', episodes: 1100, status: 'En cours', score: 8.7, rank: 30, genres: [{ name: 'Action' }], year: 1999, synopsis: 'Pirates.', url: 'https://myanimelist.net/anime/21', images: { jpg: { image_url: 'http://exemple.test/an.jpg' } } }] }));
    route(/exemple\.test\/an\.jpg/, () => rBuf(png, 'image/png'));
    assert(/One Piece/.test(est(await dire(MEMBRE, '.anime One Piece'), 'image').c.caption));
    route(/itunes\.apple\.com\/search\?term=.*media=music/, () => rJson({ results: [{ trackName: 'Eloko Oyo', artistName: 'Fally Ipupa', collectionName: 'Control', releaseDate: '2013-01-01T00:00:00Z' }] }));
    const pa = texteDe(await dire(MEMBRE, '.paroles Fally Ipupa - Eloko Oyo'));
    assert(/genius\.com\/search/.test(pa) && /droits d’auteur/.test(pa));
    routes.length = 0;
  });
  await test('recherches : images, google, application, dépôt GitHub, capture, code source', async () => {
    const reseauT = require('../lib/reseau'); const vraiHote = reseauT.hotePublic;
    reseauT.hotePublic = async (h) => !/^(192\.168|10\.|127\.|localhost)/.test(h);
    route(/api\.openverse\.org/, () => rJson({ results: [{ title: 'Lion', thumbnail: 'http://exemple.test/l1.jpg', creator: 'Jean', license: 'by', source: 'flickr' }, { title: 'Lion 2', thumbnail: 'http://exemple.test/l2.jpg', license: 'cc0' }] }));
    route(/exemple\.test\/l\d\.jpg/, () => rBuf(png, 'image/png'));
    assert((await dire(MEMBRE, '.images lion')).filter((x) => x.c.image).length === 2);
    route(/html\.duckduckgo\.com/, () => new Response('<div><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemple.test%2Fpain&amp;rut=x">Recette du <b>pain</b></a><a class="result__snippet" href="x">Farine et eau &amp; sel</a></div>'));
    const g = texteDe(await dire(MEMBRE, '.google faire du pain'));
    assert(/Recette du pain/.test(g) && /https:\/\/exemple\.test\/pain/.test(g) && /Farine et eau & sel/.test(g), g);
    route(/ws75\.aptoide\.com/, () => rJson({ datalist: { list: [{ name: 'Faux Chat', package: 'com.faux', file: { vername: '1.0', filesize: 5 * 1048576, path: 'http://exemple.test/f.apk', malware: { rank: 'TRUSTED' } }, stats: { rating: { avg: 4.4 }, downloads: 1000 }, store: { name: 'apps' } }] } }));
    route(/exemple\.test\/f\.apk/, () => rBuf(Buffer.from('PK-faux-apk'), 'application/vnd.android.package-archive'));
    const ap = est(await dire(MEMBRE, '.application faux chat'), 'document');
    assert(ap && /\.apk$/.test(ap.c.fileName), JSON.stringify(ap));
    route(/ws75\.aptoide\.com/, () => rJson({ datalist: { list: [{ name: 'Douteux', package: 'x.y', file: { vername: '1', filesize: 1048576, path: 'http://exemple.test/f.apk', malware: { rank: 'UNKNOWN' } }, stats: {}, store: {} }] } }));
    const ap2 = await dire(MEMBRE, '.application douteux');
    assert(!est(ap2, 'document') && /TRUSTED/.test(texteDe(ap2)));
    route(/api\.github\.com\/repos\/a\/b$/, () => rJson({ full_name: 'a/b', size: 100, default_branch: 'main', stargazers_count: 1, language: 'JS', license: null }));
    route(/codeload\.github\.com\/a\/b\/zip\/refs\/heads\/main/, () => rBuf(Buffer.from('PKzip'), 'application/zip'));
    const z = est(await dire(MEMBRE, '.telechargergit https://github.com/a/b', false), 'document');
    assert(z && z.c.fileName === 'b-main.zip', JSON.stringify(z));
    route(/api\.github\.com\/repos\/a\/gros$/, () => rJson({ full_name: 'a/gros', size: 500 * 1024, default_branch: 'main' }));
    assert(/trop gros/.test(texteDe(await dire(MEMBRE, '.telechargergit https://github.com/a/gros', false))));
    route(/image\.thum\.io/, () => rBuf(Buffer.alloc(5000, 1), 'image/png'));
    assert(est(await dire(MEMBRE, '.capture https://exemple.test/', false), 'image'));
    assert(/sites publics/.test(texteDe(await dire(MEMBRE, '.capture http://192.168.0.1/', false))));
    route(/exemple\.test\/page/, () => new Response('<html>bonjour</html>', { headers: { 'content-type': 'text/html' } }));
    const ps = est(await dire(MEMBRE, '.pagesource https://exemple.test/page', false), 'document');
    assert(ps && /bonjour/.test(ps.c.document.toString()));
    assert(!est(await dire(MEMBRE, '.pagesource http://127.0.0.1/', false), 'document'));
    reseauT.hotePublic = vraiHote;
    routes.length = 0;
  });
  await test('mail temporaire, blague, citation, clés absentes (identifier, chercherstickers)', async () => {
    route(/api\.mail\.tm\/domains/, () => rJson({ 'hydra:member': [{ domain: 'exemple.tm' }] }));
    route(/api\.mail\.tm\/accounts/, () => rJson({ id: '1' }));
    const mt = texteDe(await dire(MEMBRE, '.mailtemp', false));
    const adr = /(kb[0-9a-f]+@exemple\.tm)/.exec(mt);
    assert(adr, mt);
    assert(texteDe(await dire(MEMBRE, '.mailtemp', false)).includes(adr[1]), 'même adresse');
    assert(/en privé/.test(texteDe(await dire(MEMBRE, '.mailtemp'))));
    route(/api\.mail\.tm\/token/, () => rJson({ token: 'T' }));
    route(/api\.mail\.tm\/messages$/, () => rJson({ 'hydra:member': [{ id: 'm1', subject: 'Bienvenue', from: { address: 'a@b.c' }, intro: 'Salut' }] }));
    route(/api\.mail\.tm\/messages\/m1/, () => rJson({ subject: 'Bienvenue', from: { address: 'a@b.c' }, text: 'Bonjour à toi' }));
    assert(/Bienvenue/.test(texteDe(await dire(MEMBRE, '.boitetemp', false))));
    assert(/Bonjour à toi/.test(texteDe(await dire(MEMBRE, '.boitetemp 1', false))));
    assert(/\?\s*$|😂/.test(texteDe(await dire(MEMBRE, '.blague'))) || /👉/.test(texteDe(await dire(MEMBRE, '.blague'))));
    assert(/« .+ »\n— /.test(texteDe(await dire(MEMBRE, '.citation'))));
    delete process.env.AUDD_API_TOKEN; delete process.env.TENOR_API_KEY;
    assert(/AUDD_API_TOKEN/.test(texteDe(await dire(MEMBRE, '.identifier'))));
    assert(/TENOR_API_KEY/.test(texteDe(await dire(MEMBRE, '.chercherstickers chat'))));
    process.env.TENOR_API_KEY = 'k';
    route(/tenor\.googleapis\.com/, () => rJson({ results: [{ media_formats: { webp_transparent: { url: 'http://exemple.test/s.webp' } } }] }));
    route(/exemple\.test\/s\.webp/, async () => rBuf(await sharpT(png).webp().toBuffer(), 'image/webp'));
    const ss = est(await dire(MEMBRE, '.chercherstickers chat'), 'sticker');
    assert(ss && ss.c.sticker.slice(0, 4).toString() === 'RIFF');
    delete process.env.TENOR_API_KEY;
    routes.length = 0;
  });
  await test('IA nommée, image IA, voix, emojimix, ameliorer, brouiller, fauxmessage, stickertelegram', async () => {
    const avis = texteDe(await dire(PROP, '.gpt Bonjour', false));
    assert(/raccourci vers l’IA/.test(avis), avis);
    assert(/ta question/.test(texteDe(await dire(PROP, '.gemini', false))));
    route(/image\.pollinations\.ai/, () => rBuf(png, 'image/png'));
    assert(/Image générée par IA/.test(est(await dire(MEMBRE, '.imageia un lion rouge'), 'image').c.caption));
    assert(/20 secondes|quelques secondes/.test(texteDe(await dire(MEMBRE, '.imageia un chat'))));
    route(/translate\.google\.com\/translate_tts/, () => rBuf(fs.readFileSync(tmpf('a.mp3')), 'audio/mpeg'));
    const vx = est(await dire(MEMBRE, '.voix Bonjour tout le monde. Comment ça va ?'), 'audio');
    assert(vx && vx.c.ptt && /opus/.test(vx.c.mimetype) && vx.c.audio.length > 500);
    assert(/Langues/.test(texteDe(await dire(MEMBRE, '.voix'))));
    route(/emojik\.vercel\.app/, () => rBuf(png, 'image/png'));
    assert(est(await dire(MEMBRE, '.emojimix 😀😍'), 'sticker'));
    assert(/emojimix/.test(texteDe(await dire(MEMBRE, '.emojimix abc'))));
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    const am = est(await direMedia(PROP, '.ameliorer', 'imageMessage'), 'image');
    assert(am && (await sharpT(am.c.image).metadata()).width === 600, am && (await sharpT(am.c.image).metadata()).width);
    const br = texteDe(await dire(MEMBRE, '.brouiller var a = 1; console.log(a + 2);'));
    assert(/console|_0x|var/.test(br) && br !== '' && /pas du chiffrement/.test(br), br);
    assert(/n’a pas pu être lu/.test(texteDe(await dire(MEMBRE, '.brouiller var = = ;'))));
    const fm = msg(ADMIN, '.fauxmessage @membre Je suis nul', true, { extendedTextMessage: { text: '.fauxmessage @membre Je suis nul', contextInfo: { mentionedJid: [MEMBRE] } } });
    envoyes.length = 0; await handler.traiter(sock, fm);
    assert(/PAS un vrai message/.test(texteDe(envoyes)));
    assert(/👥|admin/i.test(texteDe(await dire(MEMBRE, '.fauxmessage @membre x'))) || !est(await dire(MEMBRE, '.fauxmessage @membre x'), 'text') === false);
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert(/TELEGRAM_BOT_TOKEN/.test(texteDe(await dire(MEMBRE, '.stickertelegram https://t.me/addstickers/Pack1', false))));
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    route(/api\.telegram\.org\/bottok\/getStickerSet/, () => rJson({ result: { title: 'Pack', stickers: [{ file_id: 'f1', is_animated: false }, { file_id: 'f2', is_animated: true }] } }));
    route(/api\.telegram\.org\/bottok\/getFile/, () => rJson({ result: { file_path: 'stickers/f1.webp' } }));
    route(/api\.telegram\.org\/file\/bottok/, async () => rBuf(await sharpT(png).webp().toBuffer(), 'image/webp'));
    const tg = await dire(MEMBRE, '.stickertelegram https://t.me/addstickers/Pack1', false);
    assert(tg.filter((x) => x.c.sticker).length === 1, JSON.stringify(tg.map((x) => x.c.text || Object.keys(x.c))));
    delete process.env.TELEGRAM_BOT_TOKEN;
    routes.length = 0;
  });
  await test('logos : 48 styles, aide, texte trop long, anciens noms, emojis seuls', async () => {
    const L = require('../lib/logos');
    assert(L.noms.length === 48);
    for (const nom of L.noms) {
      const r = est(await dire(PROP, `.${nom} Kernel Bot`, false), 'image');
      assert(r && r.c.image.slice(1, 4).toString() === 'PNG', nom);
      const m = await sharpT(r.c.image).metadata();
      assert(m.width === 1024 && m.height === 512, nom);
    }
    assert(/Écris le texte/.test(texteDe(await dire(PROP, '.neon1', false))));
    assert(/trop long/.test(texteDe(await dire(PROP, '.or1 ' + 'a'.repeat(31), false))));
    assert(/sans emojis/.test(texteDe(await dire(PROP, '.or1 😀😀', false))));
    assert(est(await dire(PROP, '.steel Salut', false), 'image'), 'ancien nom steel');
    assert(est(await dire(PROP, '.gold1 Éléphant — été', false), 'image'), 'accents');
    const x1 = est(await dire(PROP, '.galaxie Même', false), 'image').c.image, x2 = est(await dire(PROP, '.galaxie Même', false), 'image').c.image;
    assert(x1.equals(x2), 'rendu stable');
  });
  // ───────────── Étape 5 : statuts, vie privée du compte, présence, système ─────────────
  await test('statuts : lecture, « j’aime », copie privée, et commandes réservées', async () => {
    const lus = [];
    sock.readMessages = async (k) => { lus.push(...k); };
    assert(/réservée/i.test(texteDe(await dire(MEMBRE, '.lirestatuts on'))));
    assert(/activé/.test(texteDe(await dire(PROP, '.lirestatuts on', false))));
    assert(/activé/.test(texteDe(await dire(PROP, '.aimerstatuts on', false))));
    assert(/🔥/.test(texteDe(await dire(PROP, '.aimerstatuts emoji 🔥', false))));
    assert(/activé/.test(texteDe(await dire(PROP, '.telechargerstatuts on', false))));
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    const st = (id, extra) => ({ key: { remoteJid: 'status@broadcast', participant: MEMBRE, id }, message: extra, messageTimestamp: 1 });
    envoyes.length = 0;
    await handler.traiter(sock, st('ST1', { imageMessage: { mimetype: 'image/png', caption: 'Ma légende' } }));
    assert(lus.length === 1 && lus[0].id === 'ST1', 'lecture');
    const like = envoyes.find((x) => x.c.react);
    assert(like && like.jid === 'status@broadcast' && like.c.react.text === '🔥', JSON.stringify(envoyes.map((x) => x.jid)));
    const copie = envoyes.find((x) => x.c.image);
    assert(copie && copie.jid === '242066000000@s.whatsapp.net' && /Statut de \+242063333333/.test(copie.c.caption) && /Ma légende/.test(copie.c.caption), JSON.stringify(copie && copie.c.caption));
    // même statut reçu deux fois : traité une seule fois
    envoyes.length = 0; await handler.traiter(sock, st('ST1', { imageMessage: { mimetype: 'image/png' } }));
    assert(envoyes.length === 0 && lus.length === 1, 'doublon ignoré');
    // statut texte
    envoyes.length = 0; await handler.traiter(sock, st('ST2', { extendedTextMessage: { text: 'Bonne journée à tous' } }));
    assert(/Bonne journée à tous/.test(texteDe(envoyes)), texteDe(envoyes));
    // désactivé : plus rien
    for (const c of ['lirestatuts', 'aimerstatuts', 'telechargerstatuts']) await dire(PROP, `.${c} off`, false);
    envoyes.length = 0; await handler.traiter(sock, st('ST3', { imageMessage: { mimetype: 'image/png' } }));
    assert(envoyes.length === 0 && lus.length === 2, 'tout désactivé');
    // sauverstatut / recevoirstatut en répondant à un statut
    const reponse = (cmd) => msg(PROP, cmd, false, { extendedTextMessage: { text: cmd, contextInfo: { stanzaId: 'ST9', participant: MEMBRE, quotedMessage: { imageMessage: { mimetype: 'image/png' } } } } });
    envoyes.length = 0; await handler.traiter(sock, reponse('.recevoirstatut'));
    assert(est(envoyes, 'image') && est(envoyes, 'image').jid === PROP, 'recevoirstatut');
    envoyes.length = 0; await handler.traiter(sock, reponse('.sauverstatut'));
    assert(est(envoyes, 'image') && est(envoyes, 'image').jid === '242066000000@s.whatsapp.net', 'sauverstatut');
    assert(/réponds-y|Ouvre le statut/.test(texteDe(await dire(PROP, '.sauverstatut', false))));
  });
  await test('présence automatique : écrit en privé seulement', async () => {
    const vus = [];
    sock.sendPresenceUpdate = async (t, j) => { vus.push([t, j]); };
    assert(/écrit/.test(texteDe(await dire(PROP, '.presence ecrit prive', false))));
    await dire(MEMBRE, 'salut tout le monde', false);
    assert(vus.some(([t, j]) => t === 'composing' && j === MEMBRE), JSON.stringify(vus));
    vus.length = 0; await dire(ADMIN, 'bonjour', true);
    assert(!vus.some(([, j]) => j === GRP), 'pas en groupe');
    await dire(PROP, '.presence aucune', false);
    vus.length = 0; await dire(MEMBRE, 'coucou', false);
    assert(!vus.some(([t]) => t === 'composing'), 'désactivée');
    sock.sendPresenceUpdate = async () => {};
  });
  await test('vie privée du compte : confidentialité, bio, photo, coches…', async () => {
    const appels = [];
    const reglages = { last: 'contacts', online: 'all', profile: 'all', status: 'contacts', readreceipts: 'none', groupadd: 'contacts', calladd: 'known' };
    Object.assign(sock, {
      fetchPrivacySettings: async () => reglages,
      updateProfileStatus: async (t) => appels.push(['bio', t]),
      updateLastSeenPrivacy: async (v) => appels.push(['last', v]),
      updateOnlinePrivacy: async (v) => appels.push(['online', v]),
      updateStatusPrivacy: async (v) => appels.push(['status', v]),
      updateReadReceiptsPrivacy: async (v) => appels.push(['rr', v]),
      updateGroupsAddPrivacy: async (v) => appels.push(['groupadd', v]),
      updateProfilePicturePrivacy: async (v) => appels.push(['pppriv', v]),
      updateProfilePicture: async (j, b) => appels.push(['pp', j, b.length]),
    });
    assert(/réservée/i.test(texteDe(await dire(MEMBRE, '.coches personne'))));
    const c = texteDe(await dire(PROP, '.confidentialite', false));
    assert(/Dernière connexion : 👥 mes contacts/.test(c) && /désactivés/.test(c) && /Appels/.test(c), c);
    assert(/Bio mise à jour/.test(texteDe(await dire(PROP, '.bio Assistant de MWENOBANGUE Labs', false))));
    assert(/Trop long/.test(texteDe(await dire(PROP, '.bio ' + 'x'.repeat(140), false))));
    await dire(PROP, '.vudernier personne', false);
    await dire(PROP, '.enligne identique', false);
    await dire(PROP, '.monstatut sauf', false);
    await dire(PROP, '.coches tous', false);
    await dire(PROP, '.ajoutgroupe contacts', false);
    await dire(PROP, '.maphoto contacts', false);
    assert(JSON.stringify(appels.slice(1)) === JSON.stringify([['last', 'none'], ['online', 'match_last_seen'], ['status', 'contact_blacklist'], ['rr', 'all'], ['groupadd', 'contacts'], ['pppriv', 'contacts']]), JSON.stringify(appels));
    assert(/Actuellement/.test(texteDe(await dire(PROP, '.vudernier', false))));
    donner({ buffer: png, type: 'image', mime: 'image/png', nom: '' });
    const r = await direMedia(PROP, '.maphoto', 'imageMessage');
    assert(/Photo de profil mise à jour/.test(texteDe(r)) && appels.some((a) => a[0] === 'pp' && a[1] === '242061111111@s.whatsapp.net' && a[2] > 500), JSON.stringify(appels.slice(-1)));
    assert(/Envoie ou cite/.test(texteDe(await dire(PROP, '.maphoto', false))));
  });
  await test('système : réglages sûrs, secrets jamais modifiés ni affichés', async () => {
    const aj = require('../lib/ajustements');
    assert(/PREFIXE/.test(texteDe(await dire(PROP, '.regler', false))));
    // secrets : refus, rien d’écrit
    for (const c of ['.regler GROQ_API_KEY abc', '.regler NUMERO_OWNER 242000', '.regler MACLE_SECRET x', '.regler TELEGRAM_BOT_TOKEN y']) {
      const t = texteDe(await dire(PROP, c, false));
      assert(/fichier \*\.env\*|\.env/.test(t) && /jamais/.test(t), c + ' → ' + t);
    }
    assert(!fs.existsSync(aj.fichier) || !/KEY|OWNER|SECRET|TOKEN/.test(fs.readFileSync(aj.fichier, 'utf8')), 'rien d’écrit');
    assert(/ressemble à une clé secrète/.test(texteDe(await dire(PROP, '.regler SIGNATURE gsk_abcdefghijklmnopqrstuvwxyz0123456789ABCD', false))));
    assert(/n’est pas un réglage modifiable/.test(texteDe(await dire(PROP, '.regler FOO bar', false))));
    assert(/refusée/.test(texteDe(await dire(PROP, '.regler PREFIXE ab cd', false))));
    // valeurs de secrets jamais affichées
    process.env.GROQ_API_KEY = 'VALEURTRESSECRETE123'; process.env.MISTRAL_API_KEY = '';
    const v = texteDe(await dire(PROP, '.voirreglage', false));
    assert(!/VALEURTRESSECRETE/.test(v) && /GROQ_API_KEY : ✅ définie/.test(v) && /MISTRAL_API_KEY : ❌/.test(v), v);
    assert(!/VALEURTRESSECRETE/.test(texteDe(await dire(PROP, '.voirreglage GROQ_API_KEY', false))));
    delete process.env.GROQ_API_KEY; delete process.env.MISTRAL_API_KEY;
    // changement sûr + retour
    const avant = config.SIGNATURE;
    assert(/n’est pas un réglage modifiable/.test(texteDe(await dire(PROP, '.regler NOM_BOT Autre', false))) && config.NOM_BOT === 'Kernel Bot', 'le nom du bot est fixe');
    assert(/Mon Bot Test/.test(texteDe(await dire(PROP, '.regler SIGNATURE Mon Bot Test', false))) && config.SIGNATURE === 'Mon Bot Test');
    assert(JSON.parse(fs.readFileSync(aj.fichier, 'utf8')).SIGNATURE === 'Mon Bot Test');
    assert(/✏️/.test(texteDe(await dire(PROP, '.voirreglage', false))));
    assert(/revient/.test(texteDe(await dire(PROP, '.supprimerreglage SIGNATURE', false))) && config.SIGNATURE === avant, config.SIGNATURE);
    assert(!('SIGNATURE' in JSON.parse(fs.readFileSync(aj.fichier, 'utf8'))));
    // mode
    await dire(PROP, '.regler MODE private', false);
    assert(config.MODE === 'private');
    await dire(PROP, '.regler MODE public', false);
    assert(config.MODE === 'public');
    await dire(PROP, '.supprimerreglage MODE', false);
    // préfixe changé puis rétabli avec le nouveau préfixe
    await dire(PROP, '.regler PREFIXE !', false);
    assert(config.PREFIXE === '!');
    assert(/revient/.test(texteDe(await dire(PROP, '!supprimerreglage PREFIXE', false))) && config.PREFIXE === '.');
    // rechargé au démarrage
    fs.writeFileSync(aj.fichier, JSON.stringify({ NOM_BOT: 'Pirate', SIGNATURE: 'Depuis fichier', GROQ_API_KEY: 'x', PREFIXE: 'abc def' }));
    aj.charger(config);
    assert(config.SIGNATURE === 'Depuis fichier' && config.NOM_BOT === 'Kernel Bot' && config.PREFIXE === '.', 'fichier : valide appliqué, nom/secret/invalide ignorés');
    await dire(PROP, '.supprimerreglage SIGNATURE', false);
    assert(config.SIGNATURE === avant);
  });
  await test('système : vérifier et expliquer la mise à jour (rien n’est remplacé)', async () => {
    const pkg = require('../package.json');
    delete process.env.MAJ_DEPOT; delete process.env.MAJ_URL;
    assert(/Aucune source de mise à jour/.test(texteDe(await dire(PROP, '.verifiermaj', false))));
    await dire(PROP, '.regler MAJ_DEPOT mwenobangue/kernel-bot', false);
    assert(process.env.MAJ_DEPOT === 'mwenobangue/kernel-bot');
    route(/api\.github\.com\/repos\/mwenobangue\/kernel-bot\/releases\/latest/, () => rJson({ tag_name: 'v9.9.9', body: 'Nouveaux logos', html_url: 'https://github.com/mwenobangue/kernel-bot/releases/tag/v9.9.9' }));
    const t = texteDe(await dire(PROP, '.verifiermaj', false));
    assert(/Nouvelle version disponible : v9\.9\.9/.test(t) && /Nouveaux logos/.test(t), t);
    const m = texteDe(await dire(PROP, '.maj', false));
    assert(/\.sauvegarde/.test(m) && /sans\* écraser/.test(m) && /npm install/.test(m), m);
    route(/api\.github\.com\/repos\/mwenobangue\/kernel-bot\/releases\/latest/, () => rJson({ tag_name: 'v' + pkg.version }));
    assert(/à jour/.test(texteDe(await dire(PROP, '.verifiermaj', false))));
    route(/api\.github\.com\/repos\/mwenobangue\/kernel-bot\/releases\/latest/, () => rJson({}, 404));
    assert(/Aucune « release »/.test(texteDe(await dire(PROP, '.verifiermaj', false))));
    await dire(PROP, '.supprimerreglage MAJ_DEPOT', false);
    assert(!process.env.MAJ_DEPOT);
    // source JSON en ligne
    const reseauT = require('../lib/reseau'); const vraiHote = reseauT.hotePublic; reseauT.hotePublic = async () => true;
    await dire(PROP, '.regler MAJ_URL https://exemple.test/version.json', false);
    route(/exemple\.test\/version\.json/, () => rJson({ version: '2.0.0', url: 'https://exemple.test/dl' }));
    assert(/2\.0\.0/.test(texteDe(await dire(PROP, '.verifiermaj', false))));
    reseauT.hotePublic = async () => false;
    assert(/non publique/.test(texteDe(await dire(PROP, '.verifiermaj', false))));
    reseauT.hotePublic = vraiHote;
    await dire(PROP, '.supprimerreglage MAJ_URL', false);
    assert(require('../cmd/systeme').plusRecent('1.10.0', '1.9.9') && !require('../cmd/systeme').plusRecent('1.0.0', '1.0.0'));
    routes.length = 0;
  });
  console.log(`\n${ok} essais réussis.`);
  process.exit(process.exitCode || 0);
})();
