// Essais du mode « site » (moteur personnel) : le bot ne parle qu'à Kernel Connect, par appels signés.
// Un faux site (serveur HTTP local) vérifie la signature comme le vrai site et garde les données en mémoire. Aucun réseau, aucune vraie clé.
// Lancer : node tests/site.js
const http = require('http');
const assert = require('assert');
const crypto = require('crypto');

const SECRET = 'secret-de-test-assez-long-123456';
const ID = '11111111-1111-4111-8111-111111111111';
let ok = 0;
const test = async (nom, fn) => { try { await fn(); ok++; console.log('  ✔', nom); } catch (e) { console.error('  ✘', nom, '\n   ', e.message); process.exitCode = 1; } };

const verifier = (secret, ts, chemin, corps, sig) => {
  const attendu = crypto.createHmac('sha256', secret).update(`${ts}.POST.${chemin}.${corps}`).digest('hex');
  return Math.abs(Date.now() - Number(ts)) < 60_000 && attendu === sig;
};

// Faux site : mêmes en-têtes et même contrat que /api/hub/<op>
function fauxSite({ secret = SECRET, hoteAttendu = 'mon-bot.onrender.com' } = {}) {
  const journal = [];
  const kv = new Map(); // "session|cle" -> valeur
  const etat = { panne: false, refus: false, nom: 'Josué' };
  const serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => (corps += c));
    req.on('end', () => {
      const op = req.url.replace('/api/hub/', '');
      const h = req.headers;
      journal.push({ op, corps: corps ? JSON.parse(corps) : {}, hote: h['x-kc-engine'], signeOk: verifier(secret, h['x-kc-timestamp'], req.url, corps, h['x-kc-signature']) });
      const fin = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (etat.panne) return fin(503, { erreur: 'panne' });
      if (etat.refus || h['x-kc-engine'] !== hoteAttendu || !verifier(secret, h['x-kc-timestamp'], req.url, corps, h['x-kc-signature'])) return fin(403, { erreur: 'Refusé' });
      const c = JSON.parse(corps || '{}');
      if (op === 'auth-read') return fin(200, { valeurs: Object.fromEntries(c.cles.filter((k) => kv.has(`${c.session}|${k}`)).map((k) => [k, kv.get(`${c.session}|${k}`)])) });
      if (op === 'auth-write') { c.lignes.forEach((l) => kv.set(`${c.session}|${l.cle}`, l.valeur)); return fin(200, { ok: true }); }
      if (op === 'auth-delete') { c.cles.forEach((k) => kv.delete(`${c.session}|${k}`)); return fin(200, { ok: true }); }
      if (op === 'auth-drop') { [...kv.keys()].filter((k) => k.startsWith(c.session + '|')).forEach((k) => kv.delete(k)); return fin(200, { ok: true }); }
      if (op === 'sessions') return fin(200, { ids: [...new Set([...kv.keys()].filter((k) => k.endsWith('|creds')).map((k) => k.split('|')[0]))] });
      if (op === 'profile') return fin(200, { nom: etat.nom });
      return fin(200, { ok: true });
    });
  });
  return new Promise((ok2) => serveur.listen(0, '127.0.0.1', () => ok2({ url: `http://127.0.0.1:${serveur.address().port}`, journal, kv, etat, fermer: () => new Promise((f) => serveur.close(f)) })));
}

(async () => {
  // Le fetch du bot refuse http:// ? Non : SITE_URL doit être https dans la vraie vie ; les essais utilisent http local via la variable de contournement ci-dessous.
  const site = await fauxSite();
  const reglerEnv = (extra = {}) => {
    for (const k of ['SITE_URL', 'ENGINE_SECRET', 'RENDER_EXTERNAL_URL', 'RENDER_EXTERNAL_HOSTNAME', 'ENGINE_PUBLIC_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) delete process.env[k];
    Object.assign(process.env, { SITE_URL: site.url, ENGINE_SECRET: SECRET, RENDER_EXTERNAL_URL: 'https://mon-bot.onrender.com', ...extra });
  };
  reglerEnv();
  // problemes() exige https : on teste la validation séparément, puis on contourne pour parler au faux site local
  const auth = require('../lib/auth_site');
  const vraiProblemes = auth.problemes;

  await test('signature : identique à celle du site (contrat entre les deux programmes)', () => {
    assert.strictEqual(auth.signer('secret-de-test-assez-long-123456', '1700000000000', 'POST', '/api/hub/auth-read', '{"session":"x"}'), '14a7378e23fa2835ab52aa779bc2f977ee3524583f9a919d873eac82eea0bf6d');
  });
  await test('configuration : SITE_URL doit être https ; secret et adresse publique obligatoires ; rien n’est dit par erreur', () => {
    process.env.SITE_URL = 'http://exemple.test'; assert(vraiProblemes().some((p) => /SITE_URL/.test(p)));
    reglerEnv({ SITE_URL: 'https://kernel-connect.vercel.app', ENGINE_SECRET: 'court' }); assert(vraiProblemes().some((p) => /ENGINE_SECRET/.test(p)));
    reglerEnv({ SITE_URL: 'https://kernel-connect.vercel.app', RENDER_EXTERNAL_URL: '' }); assert(vraiProblemes().some((p) => /adresse publique/.test(p)));
    reglerEnv({ SITE_URL: 'https://kernel-connect.vercel.app' }); assert.deepStrictEqual(vraiProblemes(), []);
    reglerEnv({ SITE_URL: 'https://kernel-connect.vercel.app', RENDER_EXTERNAL_URL: '', ENGINE_PUBLIC_URL: 'https://Autre.Exemple.org/' }); assert.strictEqual(auth.hote(), 'autre.exemple.org');
  });
  await test('stockage : mode site dès que SITE_URL est défini (jamais de repli silencieux), sinon Supabase, sinon local', () => {
    const st = require('../lib/stockage');
    reglerEnv({ SITE_URL: 'https://kernel-connect.vercel.app' }); assert.strictEqual(st.mode, 'site');
    reglerEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_x' }); delete process.env.SITE_URL; assert.strictEqual(st.mode, 'supabase');
    reglerEnv(); delete process.env.SITE_URL; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; assert.strictEqual(st.mode, 'local');
  });

  // À partir d'ici : on parle au faux site local (http://127.0.0.1, seule exception à https).
  reglerEnv();

  await test('appel : en-têtes d’identité (hôte du moteur), horodatage, signature valide ; corps JSON', async () => {
    site.journal.length = 0;
    await auth.sessionsEnregistrees();
    const a = site.journal[0];
    assert.strictEqual(a.op, 'sessions'); assert.strictEqual(a.hote, 'mon-bot.onrender.com'); assert.strictEqual(a.signeOk, true);
  });
  await test('session WhatsApp : écrite et relue à l’identique (clés binaires incluses) par le site, effacée clé par clé puis en entier', async () => {
    const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');
    const { state, saveCreds } = await auth.useSupabaseAuthState(ID);
    state.creds.registered = true;
    await saveCreds();
    await state.keys.set({ 'pre-key': { 1: { private: Buffer.from('abc'), public: Buffer.from('def') } } });
    const relu = await auth.useSupabaseAuthState(ID);
    assert.strictEqual(relu.state.creds.registered, true);
    assert.deepStrictEqual(relu.state.creds.noiseKey.private, state.creds.noiseKey.private);
    const k = await relu.state.keys.get('pre-key', ['1', '2']);
    assert.strictEqual(Buffer.from(k['1'].private).toString(), 'abc'); assert.strictEqual(k['2'], null);
    await state.keys.set({ 'pre-key': { 1: null } });
    assert.strictEqual((await relu.state.keys.get('pre-key', ['1']))['1'], null);
    assert.deepStrictEqual(await auth.sessionsEnregistrees(), [ID]);
    await auth.supprimerSession(ID);
    assert.strictEqual(site.kv.size, 0);
    void BufferJSON; void initAuthCreds;
  });
  await test('beaucoup de clés : envoyées par lots (100 maximum par appel)', async () => {
    site.journal.length = 0;
    const { state } = await auth.useSupabaseAuthState(ID);
    const lot = {}; for (let i = 0; i < 250; i++) lot[i] = { v: i };
    await state.keys.set({ 'session': lot });
    const ecritures = site.journal.filter((j) => j.op === 'auth-write');
    assert.strictEqual(ecritures.length, 3); assert(ecritures.every((e) => e.corps.lignes.length <= 100));
    await auth.supprimerSession(ID);
  });
  await test('nom de l’utilisateur : rendu par le site', async () => { assert.strictEqual(await auth.nomUtilisateur(ID), 'Josué'); });
  await test('état des instances : chaque action part vers le site avec les bons champs', async () => {
    site.journal.length = 0;
    assert.strictEqual(await auth.base.majInstance(ID, { connection_status: 'CONNECTED' }), true);
    await auth.base.evenement(ID, 'CONNECTED', 'INFO', 'Connecté à WhatsApp');
    await auth.base.qr(ID, '2@abc', 20);
    await auth.base.viderAppairages(ID);
    assert.deepStrictEqual(site.journal.map((j) => j.op), ['instance-update', 'event', 'qr', 'clear-pairing']);
    assert.deepStrictEqual(site.journal[1].corps, { id: ID, type: 'CONNECTED', severite: 'INFO', message: 'Connecté à WhatsApp' });
  });
  await test('moteur : creerBase prend l’état du mode site (aucune requête Supabase)', () => {
    const { creer } = require('../lib/moteur');
    const faux = { base: { marqueur: 1 }, actif: () => true, sessionsEnregistrees: async () => [] };
    const m = creer({ session: { sessions: new Map(), MAX_SECONDAIRES: 1, surEvenement: () => () => {}, connectee: () => false, retirerSession: async () => {}, lancer: async () => {} }, authSupabase: faux });
    assert(m.sante().stockage);
  });
  await test('panne ou refus du site : l’état n’est jamais bloquant (false, pas d’exception) ; la session, elle, échoue clairement', async () => {
    site.etat.panne = true;
    assert.strictEqual(await auth.base.majInstance(ID, { connection_status: 'CONNECTED' }), false);
    await assert.rejects(() => auth.useSupabaseAuthState(ID), /site HTTP 503/);
    site.etat.panne = false; site.etat.refus = true;
    assert.strictEqual(await auth.base.evenement(ID, 'CONNECTED', 'INFO', 'x'), false);
    await assert.rejects(() => auth.sessionsEnregistrees(), /Mon moteur/);
    site.etat.refus = false;
  });
  await test('un refus (403) n’est pas réessayé ; une panne (5xx) l’est trois fois', async () => {
    site.journal.length = 0; site.etat.refus = true;
    await assert.rejects(() => auth.sessionsEnregistrees());
    assert.strictEqual(site.journal.length, 1);
    site.etat.refus = false; site.journal.length = 0; site.etat.panne = true;
    await assert.rejects(() => auth.sessionsEnregistrees());
    assert.strictEqual(site.journal.length, 3);
    site.etat.panne = false;
  });
  await test('mauvais secret ou mauvaise adresse : le site refuse, le moteur l’explique', async () => {
    process.env.ENGINE_SECRET = 'un-autre-secret-0123456789';
    await assert.rejects(() => auth.sessionsEnregistrees(), /refuse ce moteur/);
    reglerEnv({ RENDER_EXTERNAL_URL: 'https://pas-moi.onrender.com' });
    await assert.rejects(() => auth.sessionsEnregistrees(), /refuse ce moteur/);
    reglerEnv();
  });
  await test('mode site : aucun bot principal au démarrage et aucune restauration depuis le disque', async () => {
    const os = require('os'), fs = require('fs'), path = require('path');
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-site-'));
    reglerEnv(); delete process.env.PRINCIPAL;
    const s = require('../lib/session');
    await s.demarrerTout();
    assert.strictEqual(s.principale(), null);
    assert.strictEqual(s.sessions.size, 0, 'le faux site ne connaît aucune session appairée');
  });

  await site.fermer();
  console.log(`\n${ok} essais réussis`);
  process.exit(process.exitCode || 0);
})();
