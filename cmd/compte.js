// Kernel Bot — compte WhatsApp du bot (propriétaire) : vie privée, bio, photo de profil, présence
const sharp = require('sharp');
const reglages = require('../lib/reglages');
const { recuperer, erreurMedia } = require('../lib/recup');

const base = { categorie: 'Confidentialité', ownerOnly: true };

// Vocabulaire français → valeurs de WhatsApp
const VISIBILITE = { tous: 'all', tout: 'all', contacts: 'contacts', sauf: 'contact_blacklist', personne: 'none', aucun: 'none' };
const LIBELLE = { all: '🌍 tout le monde', contacts: '👥 mes contacts', contact_blacklist: '👥 mes contacts, sauf certains (la liste des exceptions se règle dans WhatsApp)', none: '🚫 personne', match_last_seen: '↔️ comme « vu à »', known: '👥 contacts connus', true: 'oui', false: 'non' };
const lib = (v) => LIBELLE[v] || v || '—';

// Commande de réglage : .nom <choix> ; sans choix, affiche l'état et les choix possibles
function reglage({ name, aliases = [], desc, choix, appliquer, lire, titre }) {
  return {
    ...base,
    name,
    aliases,
    desc,
    run: async ({ sock, args, reply, config }) => {
      const a = (args[0] || '').toLowerCase();
      const valeur = choix[a];
      if (!valeur) {
        let etat = '';
        try {
          const s = await sock.fetchPrivacySettings(true);
          etat = `\nActuellement : ${lib(lire(s))}`;
        } catch {}
        return reply(`🔐 *${titre}*${etat}\n\n${Object.keys(choix).map((c) => `${config.PREFIXE}${name} ${c}`).join('\n')}\n\n_${desc}_`);
      }
      try {
        await appliquer(sock, valeur);
        await reply(`✅ ${titre} : ${lib(valeur)}`);
      } catch (e) {
        await reply('⚠️ WhatsApp a refusé le changement : ' + String(e.message).slice(0, 100));
      }
    },
  };
}

module.exports = [
  {
    ...base,
    name: 'confidentialite',
    aliases: ['getprivacy'],
    desc: 'Affiche les réglages de confidentialité du compte du bot',
    run: async ({ sock, reply }) => {
      try {
        const s = await sock.fetchPrivacySettings(true);
        await reply(`🔐 *Confidentialité du compte*\n\n👁️ Dernière connexion : ${lib(s.last)}\n🟢 Statut « en ligne » : ${lib(s.online)}\n🖼️ Photo de profil : ${lib(s.profile)}\n📝 Statuts : ${lib(s.status)}\n✅ Accusés de lecture (coches bleues) : ${s.readreceipts === 'all' ? 'envoyés' : 'désactivés'}\n👥 Ajout aux groupes : ${lib(s.groupadd)}${s.calladd ? `\n📞 Appels : ${lib(s.calladd)}` : ''}${s.messages ? `\n💬 Messages : ${lib(s.messages)}` : ''}`);
      } catch (e) {
        await reply('⚠️ Impossible de lire les réglages : ' + String(e.message).slice(0, 100));
      }
    },
  },
  {
    ...base,
    name: 'bio',
    aliases: ['setbio'],
    desc: 'Change la bio (« Info ») du compte du bot : .bio Assistant de MWENOBANGUE Labs',
    run: async ({ sock, args, reply, config }) => {
      const t = args.join(' ').trim();
      if (!t) return reply(`📝 ${config.PREFIXE}bio Ton nouveau texte (139 caractères maximum)`);
      if (t.length > 139) return reply(`⚠️ Trop long : ${t.length} caractères (139 maximum).`);
      try {
        await sock.updateProfileStatus(t);
        await reply('✅ Bio mise à jour.');
      } catch (e) {
        await reply('⚠️ WhatsApp a refusé le changement : ' + String(e.message).slice(0, 100));
      }
    },
  },
  reglage({
    name: 'vudernier',
    aliases: ['lastseen'],
    titre: 'Dernière connexion',
    desc: 'Qui voit ta dernière connexion',
    choix: { tous: 'all', contacts: 'contacts', sauf: 'contact_blacklist', personne: 'none' },
    lire: (s) => s.last,
    appliquer: (sock, v) => sock.updateLastSeenPrivacy(v),
  }),
  reglage({
    name: 'enligne',
    aliases: ['online'],
    titre: 'Statut « en ligne »',
    desc: 'Qui voit quand tu es en ligne : tous, ou comme la dernière connexion',
    choix: { tous: 'all', identique: 'match_last_seen' },
    lire: (s) => s.online,
    appliquer: (sock, v) => sock.updateOnlinePrivacy(v),
  }),
  reglage({
    name: 'monstatut',
    aliases: ['mystatus'],
    titre: 'Qui voit mes statuts',
    desc: 'Qui peut voir les statuts que tu publies',
    choix: { tous: 'all', contacts: 'contacts', sauf: 'contact_blacklist', personne: 'none' },
    lire: (s) => s.status,
    appliquer: (sock, v) => sock.updateStatusPrivacy(v),
  }),
  reglage({
    name: 'coches',
    aliases: ['read'],
    titre: 'Accusés de lecture (coches bleues)',
    desc: 'Envoyer ou non les coches bleues : tous, ou personne',
    choix: { tous: 'all', personne: 'none' },
    lire: (s) => s.readreceipts,
    appliquer: (sock, v) => sock.updateReadReceiptsPrivacy(v),
  }),
  reglage({
    name: 'ajoutgroupe',
    aliases: ['groupadd'],
    titre: 'Qui peut m’ajouter à un groupe',
    desc: 'Qui peut ajouter ce compte dans un groupe',
    choix: { tous: 'all', contacts: 'contacts', sauf: 'contact_blacklist' },
    lire: (s) => s.groupadd,
    appliquer: (sock, v) => sock.updateGroupsAddPrivacy(v),
  }),
  {
    ...base,
    name: 'maphoto',
    aliases: ['mypp'],
    desc: 'Envoie ou cite une image : elle devient la photo de profil. Sinon : .maphoto tous|contacts|sauf|personne règle qui la voit',
    run: async (ctx) => {
      const { sock, args, reply, config, msg } = ctx;
      const a = (args[0] || '').toLowerCase();
      if (VISIBILITE[a]) {
        try {
          await sock.updateProfilePicturePrivacy(VISIBILITE[a]);
          return reply(`✅ Photo de profil visible par : ${lib(VISIBILITE[a])}`);
        } catch (e) {
          return reply('⚠️ WhatsApp a refusé le changement : ' + String(e.message).slice(0, 100));
        }
      }
      const m = await recuperer(ctx, ['image'], `🖼️ Envoie ou cite une image avec ${config.PREFIXE}maphoto pour changer la photo de profil.\nOu ${config.PREFIXE}maphoto tous | contacts | sauf | personne pour choisir qui la voit.`);
      if (!m) return;
      try {
        const carre = await sharp(m.buffer).rotate().resize(640, 640, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
        await sock.updateProfilePicture(sock.user.id.replace(/:\d+@/, '@'), carre);
        await reply('✅ Photo de profil mise à jour.');
      } catch (e) {
        await erreurMedia(reply, e);
      }
    },
  },
  {
    ...base,
    name: 'presence',
    aliases: [],
    desc: 'Présence automatique du bot : .presence ecrit|enregistre|enligne|hors|aucune [prive|groupe|tous]',
    run: async ({ args, reply, config }) => {
      const modes = { ecrit: 'écrit…', enregistre: 'enregistre un vocal…', enligne: 'en ligne', hors: 'hors ligne', aucune: 'aucune (désactivée)' };
      const a = (args[0] || '').toLowerCase();
      const ou = (args[1] || '').toLowerCase();
      const r = reglages.lire();
      if (!modes[a]) {
        return reply(`👀 *Présence automatique* : ${modes[r.presenceMode] || modes.aucune} (dans : ${r.presenceOu})\n\n${config.PREFIXE}presence ecrit\n${config.PREFIXE}presence enregistre\n${config.PREFIXE}presence enligne\n${config.PREFIXE}presence hors\n${config.PREFIXE}presence aucune\n\nAjoute prive, groupe ou tous pour choisir où l’appliquer (par défaut : tous).`);
      }
      const patch = { presenceMode: a };
      if (['prive', 'groupe', 'tous'].includes(ou)) patch.presenceOu = ou;
      reglages.ecrire(patch);
      await reply(`✅ Présence : ${modes[a]}${patch.presenceOu ? ' (' + patch.presenceOu + ')' : ''}`);
    },
  },
];
