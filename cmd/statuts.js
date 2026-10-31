// Kernel Bot — statuts WhatsApp (propriétaire) : lecture auto, « j'aime » auto, copie privée auto, sauvegarde d'un statut précis
const reglages = require('../lib/reglages');
const statuts = require('../lib/statuts');
const utils = require('../lib/utils');

const base = { categorie: 'Statuts', ownerOnly: true };
const OUI = ['on', 'oui', 'activer', '1'];
const NON = ['off', 'non', 'desactiver', 'désactiver', '0'];

function interrupteur({ name, aliases = [], cle, desc, aide, extra }) {
  return {
    ...base,
    name,
    aliases,
    desc,
    run: async (ctx) => {
      const { args, reply, config } = ctx;
      const a = (args[0] || '').toLowerCase();
      if (OUI.includes(a)) {
        reglages.ecrire({ [cle]: true });
        return reply(`✅ *${name}* activé.${aide ? '\n' + aide : ''}`);
      }
      if (NON.includes(a)) {
        reglages.ecrire({ [cle]: false });
        return reply(`❌ *${name}* désactivé.`);
      }
      if (extra) {
        const r = await extra(ctx, a);
        if (r) return r;
      }
      const p = config.PREFIXE;
      await reply(`⚙️ *${name}* : ${reglages.lire()[cle] ? '✅ activé' : '❌ désactivé'}\n\n${p}${name} on / off\n_${desc}_`);
    },
  };
}

// Envoie le statut cité (média ou texte) vers une discussion
async function transferer(ctx, versProprio) {
  const { sock, msg, jid, reply, config } = ctx;
  const ci = utils.contextInfo(msg);
  if (!ci.quotedMessage) return reply(`📌 Ouvre le statut, réponds-y avec *${config.PREFIXE}${versProprio ? 'sauverstatut' : 'recevoirstatut'}*.`);
  const cle = { remoteJid: 'status@broadcast', id: ci.stanzaId, participant: ci.participant, fromMe: false };
  // Le statut d'origine reçu par le bot (avec sa clé de déchiffrement) vaut mieux que la citation, qui en est dépourvue
  const origine = statuts.retrouver(ci.stanzaId);
  const faux = origine ? { key: origine.key, message: origine.message } : { key: cle, message: ci.quotedMessage };
  const vers = versProprio ? statuts.jidProprietaire(sock) : jid;
  try {
    const ok = await statuts.envoyerStatut(sock, faux, vers, `📥 Statut de +${utils.numero(ci.participant) || '?'}`);
    if (!ok) return reply('❓ Ce message n’est pas un statut que je peux copier (texte, image, vidéo ou audio, 30 Mo maximum).');
    // Commande discrète : le statut part chez le propriétaire, rien n'est écrit dans la conversation (la réaction ✅ suffit)
  } catch (e) {
    console.error('[statut]', e.message);
    await reply(/media key|not a media message/i.test(String(e.message))
      ? '⚠️ Je n’ai pas reçu ce statut : je ne peux copier que les statuts publiés *pendant que le bot était connecté* (et pas encore expirés). Réessaie avec un statut plus récent.'
      : '⚠️ Impossible de récupérer ce statut (il a peut-être expiré après 24 h).');
  }
}

module.exports = [
  interrupteur({
    name: 'lirestatuts',
    aliases: ['lecture_status'],
    cle: 'statutLire',
    desc: 'Lit automatiquement les statuts de tes contacts (ils verront que tu les as vus)',
  }),
  interrupteur({
    name: 'aimerstatuts',
    aliases: ['likestatus'],
    cle: 'statutAimer',
    desc: 'Réagit automatiquement aux statuts de tes contacts avec un emoji',
    extra: async ({ args, reply, config }, a) => {
      if (a === 'emoji' && args[1]) {
        const e = [...args[1]].slice(0, 2).join('');
        reglages.ecrire({ statutEmoji: e });
        return reply(`✅ Emoji des « j’aime » : ${e}`);
      }
      return null;
    },
    aide: 'Au plus 60 réactions par heure, pour éviter de ressembler à un robot.\nChanger d’emoji : .aimerstatuts emoji 🔥',
  }),
  interrupteur({
    name: 'telechargerstatuts',
    aliases: ['dl_status'],
    cle: 'statutTelecharger',
    desc: 'Envoie en privé, dans ta discussion, chaque nouveau statut de tes contacts',
    aide: 'Au plus 60 statuts copiés par heure. Respecte les personnes : ne republie pas leurs statuts sans leur accord.',
  }),
  {
    ...base,
    name: 'sauverstatut',
    aliases: ['save'],
    desc: 'Réponds à un statut avec cette commande : il est enregistré dans ta discussion privée',
    discrete: true,
    run: (ctx) => transferer(ctx, true),
  },
  {
    ...base,
    name: 'recevoirstatut',
    aliases: ['sendme'],
    desc: 'Réponds à un statut avec cette commande : je te le renvoie ici',
    run: (ctx) => transferer(ctx, false),
  },
];
