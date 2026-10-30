// Kernel Bot — commandes système (propriétaire) : réglages sûrs et mises à jour
// Règle d'or : les clés secrètes (API, jetons…) ne se règlent JAMAIS par WhatsApp, ni ne s'affichent. Elles vivent uniquement dans le fichier .env.
const aj = require('../lib/ajustements');
const web = require('../lib/web');
const reseau = require('../lib/reseau');
const pkg = require('../package.json');

const menu = require('../lib/menu');
const base = { categorie: 'Système', ownerOnly: true, strict: true };

const REFUS_SECRET = (P) => `🔐 Pour ta sécurité, les clés secrètes (API, jetons, mots de passe…) ne se règlent *jamais* par message WhatsApp : ils resteraient dans l’historique de la discussion.\n\nOuvre le fichier *.env* sur ton ordinateur, modifie la ligne voulue, puis redémarre le bot (${P}redemarrer).`;

const affiche = (v) => (v === undefined || v === '' ? '_(vide)_' : `*${v}*`);

// Compare deux numéros de version « 1.2.3 »
function plusRecent(a, b) {
  const n = (v) => String(v).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// Interroge la source de mises à jour configurée (MAJ_URL ou MAJ_DEPOT). Renvoie { version, notes, url } ou lève une erreur parlante.
async function derniereVersion() {
  const url = process.env.MAJ_URL;
  const depot = process.env.MAJ_DEPOT;
  if (!url && !depot) throw Object.assign(new Error('non configuré'), { code: 'CONFIG' });
  if (url) {
    const u = new URL(url);
    if (!(await reseau.hotePublic(u.hostname))) throw new Error('adresse non publique');
    const j = await web.json(url);
    if (!j.version) throw new Error('le fichier ne contient pas de « version »');
    return { version: String(j.version), notes: j.notes ? String(j.notes) : '', url: j.url ? String(j.url) : url };
  }
  const h = process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {};
  const j = await web.json(`https://api.github.com/repos/${depot}/releases/latest`, { headers: h });
  return { version: String(j.tag_name || ''), notes: j.body ? String(j.body) : '', url: j.html_url };
}

async function verifier(reply, P, detail) {
  let d;
  try {
    d = await derniereVersion();
  } catch (e) {
    if (e.code === 'CONFIG') return reply(`🔄 Aucune source de mise à jour n’est configurée.\n\nSi tu publies Kernel Bot sur GitHub :\n${P}regler MAJ_DEPOT proprietaire/depot\n\nOu avec un fichier JSON en ligne :\n${P}regler MAJ_URL https://exemple.com/version.json\n\n_Version actuelle : ${pkg.version}_`);
    if (e.statut === 404) return reply('🔄 Aucune « release » publiée sur ce dépôt pour le moment.');
    return reply('⚠️ Impossible de vérifier : ' + String(e.message).slice(0, 120));
  }
  if (!plusRecent(d.version, pkg.version)) return reply(`✅ Kernel Bot est à jour (version ${pkg.version}).`);
  let t = `🆕 *Nouvelle version disponible : ${d.version}*\nVersion installée : ${pkg.version}\n🔗 ${d.url}`;
  if (d.notes) t += `\n\n📋 Nouveautés :\n${d.notes.slice(0, 700)}`;
  if (detail) t += `\n\n*Comment mettre à jour (rien n’est remplacé automatiquement)*\n1. ${detail.P}sauvegarde — pour garder une copie de ta base.\n2. Télécharge la nouvelle version depuis le lien ci-dessus.\n3. Copie ses fichiers par-dessus ton dossier, *sans* écraser : .env, personnalisation.json, data/ et auth/.\n4. Dans la fenêtre noire : npm install, puis npm start.`;
  else t += `\n\nTape ${P}maj pour voir comment l’installer.`;
  await reply(t);
}

module.exports = [
  {
    ...base,
    name: 'regler',
    aliases: ['setvar'],
    desc: 'Change un réglage sûr du bot : .regler PREFIXE ! · .regler MODE private',
    run: async ({ args, reply, config, isGroup }) => {
      const P = config.PREFIXE;
      if (!args.length) {
        return reply(`⚙️ *Réglages modifiables par message*\n\n${Object.entries(aj.REGLABLES).map(([k, r]) => `• *${k}* — ${r.desc}`).join('\n')}\n\nExemple : ${P}regler MODE private\nVoir : ${P}voirreglage · Annuler : ${P}supprimerreglage CLE\n\n🔐 Les clés secrètes se règlent uniquement dans le fichier .env.`);
      }
      const cle = args[0].toUpperCase();
      if (aj.estSecret(cle)) return reply(REFUS_SECRET(P));
      if (!aj.REGLABLES[cle]) return reply(`❓ « ${args[0]} » n’est pas un réglage modifiable par message.\nTape ${P}regler pour voir la liste.\n\n${REFUS_SECRET(P)}`);
      const v = args.slice(1).join(' ');
      if (!v) return reply(`✏️ ${P}regler ${cle} valeur\n_${aj.REGLABLES[cle].desc}_`);
      const r = aj.definir(config, cle, v);
      if (!r.ok) {
        if (r.raison === 'valeurSecrete') return reply(`🛑 Cette valeur ressemble à une clé secrète : je ne l’enregistre pas. *Supprime ton message* et mets-la dans le fichier .env.\n\n${REFUS_SECRET(P)}`);
        return reply(`⚠️ Valeur refusée pour ${cle}.\n_${aj.REGLABLES[cle].desc}_`);
      }
      await reply(`✅ *${cle}* est maintenant ${affiche(r.valeur)}${cle === 'PREFIXE' ? `\n⚠️ Les commandes commencent désormais par « ${r.valeur} ».` : ''}\n_(Annuler : ${config.PREFIXE}supprimerreglage ${cle})_`);
    },
  },
  {
    ...base,
    name: 'supprimerreglage',
    aliases: ['delvar'],
    desc: 'Annule un réglage fait avec « regler » et revient à la valeur du fichier .env',
    run: async ({ args, reply, config }) => {
      const P = config.PREFIXE;
      if (!args[0]) {
        const m = aj.modifies();
        return reply(m.length ? `↩️ Réglages modifiés : ${m.join(', ')}\n${P}supprimerreglage CLE` : `ℹ️ Aucun réglage n’a été modifié par message.`);
      }
      const r = aj.supprimer(config, args[0]);
      if (!r.ok) return reply(r.raison === 'secret' ? REFUS_SECRET(P) : `❓ « ${args[0]} » n’est pas un réglage modifiable.`);
      await reply(r.avait ? `↩️ *${args[0].toUpperCase()}* revient à ${affiche(r.valeur)} (valeur du fichier .env ou par défaut).` : `ℹ️ ${args[0].toUpperCase()} n’avait pas été modifié.`);
    },
  },
  {
    ...base,
    name: 'voirreglage',
    aliases: ['getvar'],
    desc: 'Affiche les réglages actuels (jamais les valeurs des clés secrètes)',
    run: async ({ args, reply, config }) => {
      const P = config.PREFIXE;
      if (args[0]) {
        const cle = args[0].toUpperCase();
        if (aj.REGLABLES[cle]) return reply(`⚙️ *${cle}* = ${affiche(aj.valeur(config, cle))}${aj.modifies().includes(cle) ? '\n_(modifié par commande)_' : ''}\n_${aj.REGLABLES[cle].desc}_`);
        if (aj.estSecret(cle)) return reply(`🔐 *${cle}* : ${process.env[cle] ? '✅ définie' : '❌ non définie'} dans le fichier .env.\nPar sécurité, je n’affiche jamais la valeur d’une clé secrète.`);
        return reply(`❓ Réglage inconnu. Tape ${P}voirreglage pour la liste.`);
      }
      const mod = aj.modifies();
      const lignes = Object.keys(aj.REGLABLES).map((k) => `• ${k} = ${affiche(aj.valeur(config, k))}${mod.includes(k) ? ' ✏️' : ''}`);
      const secrets = aj.SECRETS_CONNUS.map((k) => `• ${k} : ${process.env[k] ? '✅ définie' : '❌ non définie'}`);
      await reply(`⚙️ *Réglages*\n${lignes.join('\n')}\n_✏️ = modifié par commande_\n\n🔐 *Clés secrètes* (valeurs jamais affichées)\n${secrets.join('\n')}\n\n👑 Propriétaires : ${config.OWNERS.length} numéro(s) défini(s) dans .env`);
    },
  },
  {
    ...base,
    name: 'verifiermaj',
    aliases: ['checkupdate'],
    desc: 'Vérifie s’il existe une version plus récente de Kernel Bot',
    run: async (ctx) => verifier((t) => menu.avecImage(ctx, t), ctx.config.PREFIXE, null),
  },
  {
    ...base,
    name: 'maj',
    aliases: ['update'],
    desc: 'Explique comment installer une nouvelle version (rien n’est remplacé automatiquement)',
    run: async (ctx) => verifier((t) => menu.avecImage(ctx, t), ctx.config.PREFIXE, { P: ctx.config.PREFIXE }),
  },
];

module.exports.plusRecent = plusRecent;
