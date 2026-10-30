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

  console.log(`\n${ok} essais réussis`);
  process.exit(process.exitCode || 0);
})();
