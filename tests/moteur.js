// Essais de l'API moteur (appels signés du site) avec une fausse session WhatsApp et une fausse base : aucun réseau, aucun vrai code.
// Lancer : node tests/moteur.js
const http = require('http');
const assert = require('assert');
const { creer, signer, signatureValide } = require('../lib/moteur');

const SECRET = 'secret-de-test-assez-long-123456';
const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
let ok = 0;
const test = async (nom, fn) => { try { await fn(); ok++; console.log('  ✔', nom); } catch (e) { console.error('  ✘', nom, '\n   ', e.message); process.exitCode = 1; } };

function monde({ max = 2, secret = SECRET, enregistrees = [], delaiCode = 500, attenteAppairage = 60000 } = {}) {
  const ecouteurs = new Set();
  const sessions = new Map();
  const journal = { lancements: [], retraits: [], logouts: [], base: [] };
  const session = {
    sessions,
    MAX_SECONDAIRES: max,
    connectee: (s) => !!s?.ouverte,
    surEvenement: (f) => (ecouteurs.add(f), () => ecouteurs.delete(f)),
    emettre: (id, type, d) => ecouteurs.forEach((f) => f(id, type, d)),
    retirerSession: async (id) => { journal.retraits.push(id); sessions.delete(id); },
    lancer: async ({ id, numero, onCode, qr, moteur }) => {
      journal.lancements.push({ id, numero, qr: !!qr, moteur: !!moteur });
      const etat = { id, ouverte: false, sock: { logout: async () => journal.logouts.push(id), authState: { creds: { registered: false } } } };
      sessions.set(id, etat);
      if (onCode && !qr) setTimeout(() => onCode('ABCD-1234'), 5);
      if (qr) setTimeout(() => session.emettre(id, 'qr', { qr: '2@QRDATA' }), 5);
      return etat.sock;
    },
  };
  const base = {
    majInstance: (id, c) => journal.base.push(['maj', id, c]),
    evenement: (id, t, s, m) => journal.base.push(['evt', id, t, s, m]),
    qr: (id, p, sec) => journal.base.push(['qr', id, p, sec]),
    viderAppairages: (id) => journal.base.push(['vider', id]),
  };
  const authSupabase = { actif: () => true, sessionsEnregistrees: async () => enregistrees };
  const t0 = { v: Date.now() };
  const m = creer({ session, authSupabase, base, secret, maintenant: () => t0.v, delaiCode, attenteAppairage });
  return { m, session, journal, t0 };
}

// Vrai serveur HTTP avec la vraie route ; le client signe comme le fait le site (lib/engine.ts)
async function appel(srv, { methode = 'POST', chemin, corps = {}, secret = SECRET, ts = String(Date.now()), signature, sansSignature = false }) {
  const texte = methode === 'GET' ? '' : JSON.stringify(corps);
  const sig = signature || signer(secret, ts, methode, chemin, texte);
  const headers = { 'Content-Type': 'application/json' };
  if (!sansSignature) { headers['X-KC-Timestamp'] = ts; headers['X-KC-Signature'] = sig; }
  const r = await fetch(`http://127.0.0.1:${srv.port}${chemin}`, { method: methode, headers, ...(methode === 'GET' ? {} : { body: texte }) });
  return { statut: r.status, json: await r.json().catch(() => ({})) };
}
async function serveur(w) {
  const s = http.createServer(async (req, res) => { if (!(await w.m.gerer(req, res))) { res.writeHead(404).end(); } });
  await new Promise((ok2) => s.listen(0, '127.0.0.1', ok2));
  return { port: s.address().port, close: () => new Promise((ok2) => s.close(ok2)) };
}
const avec = async (opts, fn) => { const w = monde(opts); const s = await serveur(w); try { await fn(w, s); } finally { w.m.arreter(); await s.close(); } };

(async () => {
  console.log('API moteur :');

  await test('signature : bonne, mauvais secret, corps modifié, chemin modifié, trop ancienne, secret trop court', () => {
    const ts = String(Date.now());
    const sig = signer(SECRET, ts, 'POST', '/engine/instances/x/pair', '{"a":1}');
    assert(signatureValide(SECRET, ts, 'POST', '/engine/instances/x/pair', '{"a":1}', sig));
    assert(!signatureValide('autre-secret-assez-long-1234567', ts, 'POST', '/engine/instances/x/pair', '{"a":1}', sig));
    assert(!signatureValide(SECRET, ts, 'POST', '/engine/instances/x/pair', '{"a":2}', sig));
    assert(!signatureValide(SECRET, ts, 'POST', '/engine/instances/y/pair', '{"a":1}', sig));
    assert(!signatureValide(SECRET, ts, 'DELETE', '/engine/instances/x/pair', '{"a":1}', sig));
    const vieux = String(Date.now() - 61000);
    assert(!signatureValide(SECRET, vieux, 'POST', '/p', '', signer(SECRET, vieux, 'POST', '/p', '')));
    assert(!signatureValide('court', ts, 'POST', '/p', '', signer('court', ts, 'POST', '/p', '')));
    assert(!signatureValide(SECRET, ts, 'POST', '/p', '', ''));
  });

  await test('même signature que le site (valeur calculée avec lib/engine.ts de Kernel Connect)', () => {
    assert.strictEqual(
      signer(SECRET, '1700000000000', 'post', '/engine/instances/abc/pair', '{"telephone":"242061234567","methode":"CODE"}'),
      '549f567a6edb83b684fb92a4e6a7506039d0e2929ce83f55ad1a864740f9bc73'
    );
  });

    await test('appel sans signature, signature fausse, horodatage ancien : 401 et rien n’est lancé', () => avec({}, async (w, s) => {
    const chemin = `/engine/instances/${ID}/pair`;
    assert.strictEqual((await appel(s, { chemin, corps: { telephone: '242061234567', methode: 'CODE' }, sansSignature: true })).statut, 401);
    assert.strictEqual((await appel(s, { chemin, corps: { telephone: '242061234567', methode: 'CODE' }, signature: 'a'.repeat(64) })).statut, 401);
    assert.strictEqual((await appel(s, { chemin, corps: { telephone: '242061234567', methode: 'CODE' }, ts: String(Date.now() - 120000) })).statut, 401);
    assert.strictEqual((await appel(s, { chemin, corps: { telephone: '242061234567', methode: 'CODE' }, secret: 'mauvais-secret-assez-long-12345' })).statut, 401);
    assert.strictEqual(w.journal.lancements.length, 0);
  }));

  await test('sans ENGINE_SECRET : tout est fermé (503)', () => avec({ secret: '' }, async (w, s) => {
    assert.strictEqual((await appel(s, { methode: 'GET', chemin: '/engine/health' })).statut, 503);
  }));

  await test('rejeu : le même appel signé est refusé la deuxième fois', () => avec({}, async (w, s) => {
    const ts = String(Date.now());
    const sig = signer(SECRET, ts, 'GET', '/engine/health', '');
    assert.strictEqual((await appel(s, { methode: 'GET', chemin: '/engine/health', ts, signature: sig })).statut, 200);
    assert.strictEqual((await appel(s, { methode: 'GET', chemin: '/engine/health', ts, signature: sig })).statut, 401);
  }));

  await test('santé : sessions, capacité, aucun secret', () => avec({}, async (w, s) => {
    const r = await appel(s, { methode: 'GET', chemin: '/engine/health' });
    assert.strictEqual(r.statut, 200);
    assert.strictEqual(r.json.statut, 'en ligne');
    assert.strictEqual(r.json.capacite, 2);
    assert(!JSON.stringify(r.json).includes(SECRET));
  }));

  await test('appairage par code : renvoie un code, session lancée pour cette instance, aucun code dans la base', () => avec({}, async (w, s) => {
    const r = await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { telephone: '+242 06 123 4567', methode: 'CODE' } });
    assert.strictEqual(r.statut, 200);
    assert.strictEqual(r.json.code, 'ABCD-1234');
    assert.strictEqual(r.json.expireDans, 120);
    assert.deepStrictEqual(w.journal.lancements[0], { id: ID, numero: '242061234567', qr: false, moteur: true });
    assert(w.journal.base.some((x) => x[0] === 'maj' && x[2].connection_status === 'PAIRING'));
    assert(!JSON.stringify(w.journal.base).includes('ABCD'), 'le code ne doit jamais être écrit dans la base par le moteur');
  }));

  await test('appairage par QR : renvoie le premier QR, les suivants sont écrits pour le site', () => avec({}, async (w, s) => {
    const r = await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'QR' } });
    assert.strictEqual(r.statut, 200);
    assert.strictEqual(r.json.qr, '2@QRDATA');
    assert(w.journal.lancements[0].qr);
    w.session.emettre(ID, 'qr', { qr: '2@NOUVEAU' });
    assert(w.journal.base.some((x) => x[0] === 'qr' && x[2] === '2@NOUVEAU' && x[3] === 20));
  }));

  await test('données invalides : méthode inconnue, numéro trop court, identifiant qui n’est pas un UUID → 400, rien lancé', () => avec({}, async (w, s) => {
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'SMS' } })).statut, 400);
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'CODE', telephone: '123' } })).statut, 400);
    assert.strictEqual((await appel(s, { chemin: '/engine/instances/../../etc/pair', corps: { methode: 'QR' } })).statut, 404);
    assert.strictEqual((await appel(s, { chemin: '/engine/instances/pas-un-uuid/pair', corps: { methode: 'QR' } })).statut, 400);
    assert.strictEqual(w.journal.lancements.length, 0);
  }));

  await test('déjà connectée → 409 ; moteur complet → 429', () => avec({ max: 1 }, async (w, s) => {
    w.session.sessions.set(ID, { id: ID, ouverte: true });
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'QR' } })).statut, 409);
    const r = await appel(s, { chemin: `/engine/instances/${ID2}/pair`, corps: { methode: 'QR' } });
    assert.strictEqual(r.statut, 429);
    assert.strictEqual(w.journal.lancements.length, 0);
  }));

  await test('WhatsApp refuse le code : erreur 502, instance en erreur, session retirée', () => avec({}, async (w, s) => {
    w.session.lancer = async ({ id, onCode }) => { w.session.sessions.set(id, { id }); setTimeout(() => onCode(null, 'rate-overlimit'), 5); };
    const r = await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'CODE', telephone: '242061234567' } });
    assert.strictEqual(r.statut, 502);
    assert(w.journal.base.some((x) => x[0] === 'maj' && x[2].connection_status === 'ERROR'));
    assert(!w.session.sessions.has(ID));
  }));

  await test('aucun code reçu à temps : 504 et session retirée', () => avec({ delaiCode: 50 }, async (w, s) => {
    w.session.lancer = async ({ id }) => { w.session.sessions.set(id, { id }); };
    const r = await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'CODE', telephone: '242061234567' } });
    assert.strictEqual(r.statut, 504);
    assert(!w.session.sessions.has(ID));
  }));

  await test('connexion réussie : statut CONNECTED, codes effacés, événement sans numéro ni code', () => avec({}, async (w, s) => {
    await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'CODE', telephone: '242061234567' } });
    w.session.emettre(ID, 'open', { numero: '242061234567' });
    const maj = w.journal.base.find((x) => x[0] === 'maj' && x[2].connection_status === 'CONNECTED');
    assert(maj && maj[2].last_connected_at && maj[2].last_error === null);
    assert(w.journal.base.some((x) => x[0] === 'vider' && x[1] === ID));
    assert(!JSON.stringify(w.journal.base.filter((x) => x[0] === 'evt')).includes('242061234567'));
  }));

  await test('pendant l’appairage, « connecting » et le redémarrage demandé par WhatsApp ne dégradent pas le statut', () => avec({}, async (w, s) => {
    await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'CODE', telephone: '242061234567' } });
    w.journal.base.length = 0;
    w.session.emettre(ID, 'connecting');
    w.session.emettre(ID, 'close', { code: 515, deconnecte: false, essais: 0, redemarrage: true });
    assert.strictEqual(w.journal.base.length, 0);
  }));

  await test('connexion perdue après coup : un seul événement au début, puis ERROR à la 10e tentative', () => avec({}, async (w, s) => {
    w.session.emettre(ID3, 'close', { code: 428, deconnecte: false, essais: 1 });
    w.session.emettre(ID3, 'close', { code: 428, deconnecte: false, essais: 2 });
    w.session.emettre(ID3, 'close', { code: 428, deconnecte: false, essais: 3 });
    assert.strictEqual(w.journal.base.filter((x) => x[0] === 'evt').length, 1);
    w.session.emettre(ID3, 'close', { code: 428, deconnecte: false, essais: 10 });
    assert(w.journal.base.some((x) => x[0] === 'maj' && x[2].connection_status === 'ERROR'));
  }));

  await test('déconnexion depuis WhatsApp : statut DISCONNECTED', () => avec({}, async (w) => {
    w.session.emettre(ID, 'close', { code: 401, deconnecte: true });
    assert(w.journal.base.some((x) => x[0] === 'maj' && x[2].connection_status === 'DISCONNECTED'));
  }));

  await test('événements d’une session qui n’est pas une instance (principale, numéro) : ignorés', () => avec({}, async (w) => {
    w.session.emettre('principal', 'open', {});
    w.session.emettre('242061234567', 'close', { deconnecte: true });
    assert.strictEqual(w.journal.base.length, 0);
  }));

  await test('déconnexion : logout WhatsApp + session effacée ; instance inconnue → OK (idempotent)', () => avec({}, async (w, s) => {
    w.session.sessions.set(ID, { id: ID, ouverte: true, sock: { logout: async () => w.journal.logouts.push(ID) } });
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID}/disconnect` })).statut, 200);
    assert.deepStrictEqual(w.journal.logouts, [ID]);
    assert(w.journal.retraits.includes(ID));
    const r = await appel(s, { chemin: `/engine/instances/${ID2}/disconnect` });
    assert.strictEqual(r.statut, 200);
    assert(r.json.dejaDeconnectee);
  }));

  await test('reconnexion : inconnue → 404 ; enregistrée → relancée ; déjà connectée → 409', () => avec({ enregistrees: [ID2] }, async (w, s) => {
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID}/reconnect` })).statut, 404);
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID2}/reconnect` })).statut, 200);
    assert.deepStrictEqual(w.journal.lancements.at(-1), { id: ID2, numero: ID2, qr: false, moteur: true });
    w.session.sessions.set(ID2, { id: ID2, ouverte: true });
    assert.strictEqual((await appel(s, { chemin: `/engine/instances/${ID2}/reconnect` })).statut, 409);
  }));

  await test('suppression : session détruite ; instance inconnue → 404', () => avec({ enregistrees: [] }, async (w, s) => {
    assert.strictEqual((await appel(s, { methode: 'DELETE', chemin: `/engine/instances/${ID}` })).statut, 404);
    w.session.sessions.set(ID, { id: ID, ouverte: true, sock: { logout: async () => w.journal.logouts.push(ID) } });
    assert.strictEqual((await appel(s, { methode: 'DELETE', chemin: `/engine/instances/${ID}` })).statut, 200);
    assert(w.journal.retraits.includes(ID) && w.journal.logouts.includes(ID));
  }));

  await test('appairage abandonné au bout du délai : session retirée, statut DISCONNECTED', () => avec({ attenteAppairage: 80 }, async (w, s) => {
    await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { methode: 'CODE', telephone: '242061234567' } });
    await new Promise((ok2) => setTimeout(ok2, 200));
    assert(!w.session.sessions.has(ID));
    assert(w.journal.base.some((x) => x[0] === 'maj' && x[2].connection_status === 'DISCONNECTED'));
    assert(w.journal.base.some((x) => x[0] === 'evt' && x[2] === 'PAIRING_EXPIRED'));
  }));

  await test('méthode non permise et chemin inconnu', () => avec({}, async (w, s) => {
    assert.strictEqual((await appel(s, { methode: 'GET', chemin: `/engine/instances/${ID}/pair` })).statut, 405);
    assert.strictEqual((await appel(s, { chemin: '/engine/autre' })).statut, 404);
  }));

  await test('corps trop grand : refusé (413 ou connexion coupée), rien n’est lancé', () => avec({}, async (w, s) => {
    const r = await appel(s, { chemin: `/engine/instances/${ID}/pair`, corps: { telephone: '1'.repeat(6000), methode: 'CODE' } }).catch(() => ({ statut: 'coupé' }));
    assert(r.statut === 413 || r.statut === 'coupé', 'statut ' + r.statut);
    assert.strictEqual(w.journal.lancements.length, 0);
  }));

  await test('PRINCIPAL=non : aucune session principale n’est lancée (pas de code dans les logs)', async () => {
    const os = require('os'), fs = require('fs'), path = require('path');
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-moteur-'));
    process.env.PRINCIPAL = 'non';
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
    const vraie = require('../lib/session');
    await vraie.demarrerTout();
    assert.strictEqual(vraie.sessions.size, 0);
    assert.strictEqual(vraie.principale(), null);
  });

  await test('fermeture de connexion : 440 (session reprise ailleurs) = arrêt sans nouvelle tentative ; 401 = déconnecté ; 515 = redémarrage ; le reste = on retente', async () => {
    const { typeFermeture } = require('../lib/session');
    assert.strictEqual(typeFermeture(440), 'remplacee');
    assert.strictEqual(typeFermeture(401), 'deconnecte');
    assert.strictEqual(typeFermeture(515), 'redemarrage');
    for (const c of [503, 428, 408, 500, undefined]) assert.strictEqual(typeFermeture(c), 'reessayer');
  });

  await test('session reprise par un autre processus : le moteur n’écrit rien dans la base', () => avec({}, async (w) => {
    w.session.emettre(ID, 'close', { code: 440, deconnecte: false, remplacee: true });
    assert.strictEqual(w.journal.base.length, 0);
  }));

  await test('mémoire des messages envoyés : retrouve un message à renvoyer, oublie les plus anciens, ignore les messages sans contenu', async () => {
    const { creerMemoire } = require('../lib/session');
    const m = creerMemoire(3);
    for (const id of ['a', 'b', 'c', 'd']) m.ajouter({ key: { id }, message: { conversation: id } });
    assert.strictEqual(m.taille(), 3);
    assert.strictEqual(m.lire('a'), undefined, 'le plus ancien est oublié');
    assert.deepStrictEqual(m.lire('d'), { conversation: 'd' });
    m.ajouter({ key: { id: 'e' } });
    m.ajouter({ key: {}, message: { conversation: 'x' } });
    assert.strictEqual(m.taille(), 3);
    assert.strictEqual(m.lire('e'), undefined);
  });

  await test('envois espacés : plusieurs messages vers la même conversation partent dans l’ordre, avec un écart ; une autre conversation n’attend pas', async () => {
    const { espacerEnvois } = require('../lib/session');
    const journal = [];
    const sock = { sendMessage: async (jid, c) => { journal.push([jid, c.text, Date.now()]); return { key: { id: c.text } }; } };
    espacerEnvois(sock, 120);
    const [r1, r2, r3, r4] = await Promise.all([sock.sendMessage('a', { text: '1' }), sock.sendMessage('a', { text: '2' }), sock.sendMessage('a', { text: '3' }), sock.sendMessage('b', { text: 'x' })]);
    assert.strictEqual(r1.key.id, '1');
    assert.strictEqual(r4.key.id, 'x');
    assert.deepStrictEqual(journal.filter((j) => j[0] === 'a').map((j) => j[1]), ['1', '2', '3']);
    const a = journal.filter((j) => j[0] === 'a');
    assert.ok(a[1][2] - a[0][2] >= 100 && a[2][2] - a[1][2] >= 100, 'écart entre deux envois');
    assert.ok(journal.find((j) => j[0] === 'b')[2] - a[0][2] < 100, 'l’autre conversation part tout de suite');
    // une erreur d’envoi n’empêche pas les suivants
    let n = 0;
    const s2 = { sendMessage: async () => { if (++n === 1) throw new Error('échec'); return 'ok'; } };
    espacerEnvois(s2, 10);
    const p1 = s2.sendMessage('a', {}).catch((e) => e.message);
    const p2 = s2.sendMessage('a', {});
    assert.strictEqual(await p1, 'échec');
    assert.strictEqual(await p2, 'ok');
  });

  await test('cache de tentatives : get/set/del, borné', async () => {
    const { creerCacheTentatives } = require('../lib/session');
    const c = creerCacheTentatives();
    c.set('k', 2);
    assert.strictEqual(c.get('k'), 2);
    c.del('k');
    assert.strictEqual(c.get('k'), undefined);
    for (let i = 0; i < 2100; i++) c.set('m' + i, i);
    assert.strictEqual(c.get('m0'), undefined);
    assert.strictEqual(c.get('m2099'), 2099);
  });

  await test('arrêt propre : attend l’enregistrement des dernières clés, ferme sans déconnecter, ne bloque pas si l’enregistrement traîne', async () => {
    const session = require('../lib/session');
    let fini = false, ferme = false, logout = false;
    session.sessions.set('essai-arret', { id: 'essai-arret', sock: { end: () => { ferme = true; }, logout: () => { logout = true; } }, viderAuth: () => new Promise((ok) => setTimeout(() => { fini = true; ok(); }, 60)) });
    const n = await session.arreter(2000);
    assert.ok(n >= 1 && fini && ferme && !logout, 'clés enregistrées avant l’arrêt, appareil toujours lié');
    session.sessions.delete('essai-arret');
  });

  await test('file d’écriture de la session : vider() attend les écritures en cours', async () => {
    const { construireEtat } = require('../lib/auth_supabase');
    const ecrites = [];
    const e = await construireEtat('s', { lire: async () => new Map(), ecrire: async (s, l) => { await new Promise((ok) => setTimeout(ok, 40)); ecrites.push(...l.map((x) => x.cle)); }, effacer: async () => {} });
    e.state.keys.set({ session: { 'a.0': { x: 1 } } });
    await e.state.creds && e.saveCreds();
    assert.strictEqual(ecrites.length, 0);
    await e.vider();
    assert.deepStrictEqual(ecrites.sort(), ['creds', 'session-a.0']);
  });

  await test('vues uniques et statuts : gardés après un redémarrage (écrits dans la session, relus au démarrage), sans miniature ; messages ordinaires ignorés', async () => {
    const { creer, genre } = require('../lib/conserve');
    const cache = require('../lib/cache');
    const statuts = require('../lib/statuts');
    const { BufferJSON } = require('@whiskeysockets/baileys');
    const disque = new Map(); // simule la session enregistrée (JSON comme dans Supabase / le site)
    const cles = {
      get: async (type, ids) => Object.fromEntries(ids.map((id) => [id, disque.has(type + '-' + id) ? JSON.parse(disque.get(type + '-' + id), BufferJSON.reviver) : null])),
      set: async (data) => { for (const t in data) for (const id in data[t]) disque.set(t + '-' + id, JSON.stringify(data[t][id], BufferJSON.replacer)); },
    };
    const cle = Buffer.from('clé-secrète-de-test-0123456789ab');
    const vue = { key: { remoteJid: '242061111111@s.whatsapp.net', id: 'VUE1' }, messageTimestamp: 1, message: { viewOnceMessageV2: { message: { imageMessage: { mediaKey: cle, directPath: '/v/x', jpegThumbnail: Buffer.alloc(500), viewOnce: true } } } } };
    const statut = { key: { remoteJid: 'status@broadcast', id: 'ST1', participant: '242062222222@s.whatsapp.net' }, messageTimestamp: 2, message: { videoMessage: { mediaKey: cle, directPath: '/v/y' } } };
    const normal = { key: { remoteJid: '242061111111@s.whatsapp.net', id: 'N1' }, message: { imageMessage: { mediaKey: cle } } };
    const texte = { key: { remoteJid: '242061111111@s.whatsapp.net', id: 'T1' }, message: { conversation: 'salut' } };
    assert.strictEqual(genre(vue), 'vue unique');
    assert.strictEqual(genre(statut), 'statut');
    assert.strictEqual(genre(normal), null, 'une image ordinaire n’est pas gardée (sa citation garde sa clé)');
    assert.strictEqual(genre(texte), null);
    const a = creer(cles, 5);
    for (const m of [vue, statut, normal, texte]) a.noter(m);
    assert.strictEqual(a.taille(), 2);
    assert.strictEqual(await a.sauver(), true);
    assert.strictEqual(await a.sauver(), false, 'rien de nouveau : pas de réécriture');
    // « redémarrage » : mémoire vidée, nouvelle instance qui relit la session
    cache.lire('VUE1'); statuts.retrouver('ST1');
    const b = creer(cles, 5);
    assert.strictEqual(await b.charger(), 2);
    const rl = cache.lire('VUE1');
    assert.ok(rl && Buffer.isBuffer(rl.message.viewOnceMessageV2.message.imageMessage.mediaKey), 'clé de déchiffrement relue en binaire');
    assert.ok(rl.message.viewOnceMessageV2.message.imageMessage.mediaKey.equals(cle));
    assert.strictEqual(rl.message.viewOnceMessageV2.message.imageMessage.jpegThumbnail, undefined, 'miniature retirée');
    assert.ok(statuts.retrouver('ST1'));
    // jamais plus de 80, et les plus anciens d’abord
    const c = creer(cles, 5);
    for (let i = 0; i < 95; i++) c.noter({ ...vue, key: { ...vue.key, id: 'V' + i } });
    assert.strictEqual(c.taille(), 80);
  });

  await test('commandes déjà traitées : retenues dans la session, donc ignorées par le programme suivant après un redéploiement', async () => {
    const { creer } = require('../lib/conserve');
    const { BufferJSON } = require('@whiskeysockets/baileys');
    const disque = new Map();
    const cles = {
      get: async (type, ids) => Object.fromEntries(ids.map((id) => [id, disque.has(type + '-' + id) ? JSON.parse(disque.get(type + '-' + id), BufferJSON.reviver) : null])),
      set: async (data) => { for (const t in data) for (const id in data[t]) disque.set(t + '-' + id, JSON.stringify(data[t][id], BufferJSON.replacer)); },
    };
    const ancien = creer(cles, 5);
    await ancien.charger();
    assert.strictEqual(ancien.dejaVu('a|1'), false);
    ancien.noterVu('a|1');
    ancien.noterVu('a|1');
    await ancien.sauver();
    const nouveau = creer(cles, 5);
    await nouveau.charger();
    assert.strictEqual(nouveau.dejaVu('a|1'), true, 'le nouveau programme sait que la commande a déjà été traitée');
    assert.strictEqual(nouveau.dejaVu('a|2'), false);
    for (let i = 0; i < 350; i++) nouveau.noterVu('b|' + i);
    assert.strictEqual(nouveau.dejaVu('a|1'), false, 'liste bornée à 300');
    assert.strictEqual(nouveau.dejaVu('b|349'), true);
  });

  await test('présence : le bot ne reste jamais « en ligne » (notifications du téléphone), sauf réglage explicite', async () => {
    const { gardienPresence } = require('../lib/session');
    const reglages = require('../lib/reglages');
    const envoyes = [];
    const sock = { sendPresenceUpdate: async (t, j) => { envoyes.push(t); } };
    gardienPresence(sock, { sock, ouverte: true });
    await sock.sendPresenceUpdate('available');
    assert.deepStrictEqual(envoyes, [], '« en ligne » bloqué par défaut');
    await sock.sendPresenceUpdate('composing', 'x@s.whatsapp.net');
    assert.deepStrictEqual(envoyes, ['composing']);
    await new Promise((ok) => setTimeout(ok, 6300));
    assert.deepStrictEqual(envoyes, ['composing', 'unavailable'], 'retour « hors ligne » après avoir écrit');
    reglages.ecrire({ presenceMode: 'enligne' });
    try { await sock.sendPresenceUpdate('available'); assert.strictEqual(envoyes[envoyes.length - 1], 'available', 'réglage explicite respecté'); }
    finally { reglages.ecrire({ presenceMode: 'aucune' }); }
  });

  await test('nom d’utilisateur du site : lu dans la base, assaini, affiché dans le menu et l’accueil (jamais « Propriétaire »)', async () => {
    const auth = require('../lib/auth_supabase');
    const { chargerUtilisateur, assainirNom } = require('../lib/session');
    const menu = require('../lib/menu');
    const bienvenue = require('../lib/bienvenue');
    assert.strictEqual(assainirNom('  *Josué*\n_Arnauld_  '), 'Josué Arnauld');
    assert.strictEqual(assainirNom('x'.repeat(80)).length, 30);
    const sauve = { url: process.env.SUPABASE_URL, cle: process.env.SUPABASE_SERVICE_KEY, fetch: global.fetch };
    process.env.SUPABASE_URL = 'https://exemple.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
    const appels = [];
    global.fetch = async (url) => { appels.push(String(url).replace(/^.*\/rest\/v1\//, '')); return { ok: true, json: async () => [{ profiles: { display_name: ' Josué ' } }] }; };
    try {
      const id = '123e4567-e89b-42d3-a456-426614174000';
      const sock = {};
      await chargerUtilisateur(id, sock);
      assert.strictEqual(sock.utilisateur, 'Josué');
      assert(appels[0].includes(`id=eq.${id}`) && appels[0].includes('profiles(display_name)'));
      const autre = {};
      await chargerUtilisateur('principal', autre);
      assert.strictEqual(autre.utilisateur, undefined, 'session non-UUID : aucune requête');
      assert.strictEqual(appels.length, 1);
      global.fetch = async () => { throw new Error('réseau'); };
      await chargerUtilisateur(id, {}); // ne doit jamais lever
    } finally {
      global.fetch = sauve.fetch;
      for (const [k, v] of [['SUPABASE_URL', sauve.url], ['SUPABASE_SERVICE_KEY', sauve.cle]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
    const liste = [{ name: 'ping', categorie: 'Général', desc: '', aliases: [] }];
    const t = menu.accueil('classique', liste, 'Josué').normalize('NFKC');
    assert(/Utilisateur : Josué/.test(t) && !/Propri[ée]taire/i.test(t), t);
    const b = bienvenue.texte(5, 'classique', 'Josué');
    assert(/Utilisateur : Josué/.test(b) && !/Propri[ée]taire/i.test(b), b);
  });

  console.log(`\n${ok} essais réussis`);
  process.exit(process.exitCode || 0);
})();
