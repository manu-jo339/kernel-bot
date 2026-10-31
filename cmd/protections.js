// Kernel Bot — protections et réglages de groupe (réservés aux administrateurs)
const groupes = require('../lib/groupes');
const warns = require('../lib/avertissements');
const { numero, cibles } = require('../lib/utils');

const base = { categorie: 'Protection', groupOnly: true, adminOnly: true };
const OUI = ['on', 'oui', 'activer', 'active', '1', 'true'];
const NON = ['off', 'non', 'desactiver', 'désactiver', 'desactive', '0', 'false'];
const ACTIONS = { supprimer: 'supprimer le message', avertir: 'supprimer + avertir (exclusion à la limite)', expulser: 'supprimer + exclure' };
const etat = (b) => (b ? '✅ activé' : '❌ désactivé');

// Fabrique une commande « interrupteur » : .nom on | off | statut [+ options]
function interrupteur({ name, desc, cle, actions = false, defautAction = 'supprimer', options = {}, aide = '' }) {
  return {
    ...base,
    name,
    desc,
    run: async ({ jid, args, reply, config }) => {
      const p = config.PREFIXE;
      const a = (args[0] || '').toLowerCase();
      const c = groupes.sous(jid, cle);
      const montrer = () =>
        reply(
          `🛡️ *${cle}* : ${etat(c.actif)}` +
            (actions ? `\n⚙️ Sanction : ${c.action || defautAction}` : '') +
            Object.entries(options).map(([k, o]) => `\n${o.libelle} : ${c[k] ?? o.defaut}`).join('') +
            `\n\n${p}${cle} on / off` +
            (actions ? `\n${p}${cle} supprimer | avertir | expulser` : '') +
            Object.entries(options).map(([k, o]) => `\n${p}${cle} ${k} <valeur>`).join('') +
            (aide ? `\n${aide.replace(/\{P\}/g, p)}` : '')
        );
      if (!a || a === 'statut') return montrer();
      if (OUI.includes(a)) {
        groupes.majSous(jid, cle, { actif: true });
        return reply(`✅ *${cle}* activé.${actions ? ` Sanction : ${c.action || defautAction}.` : ''}`);
      }
      if (NON.includes(a)) {
        groupes.majSous(jid, cle, { actif: false });
        return reply(`❌ *${cle}* désactivé.`);
      }
      if (actions && ACTIONS[a]) {
        groupes.majSous(jid, cle, { actif: true, action: a });
        return reply(`✅ *${cle}* activé — sanction : ${ACTIONS[a]}.`);
      }
      if (options[a]) {
        const v = parseInt(args[1], 10);
        if (!v || v < 1 || v > 1000) return reply(`✏️ Donne un nombre : ${p}${cle} ${a} 5`);
        groupes.majSous(jid, cle, { [a]: v });
        return reply(`✅ ${options[a].libelle} : ${v}`);
      }
      if (cle === 'antilien' && ['autoriser', 'retirer'].includes(a)) {
        const dom = (args[1] || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!dom) return reply(`✏️ Exemple : ${p}antilien ${a} youtube.com`);
        const liste = new Set(c.autorises || []);
        a === 'autoriser' ? liste.add(dom) : liste.delete(dom);
        groupes.majSous(jid, cle, { autorises: [...liste] });
        return reply(`✅ Sites autorisés : ${[...liste].join(', ') || 'aucun'}`);
      }
      return montrer();
    },
  };
}

// Bienvenue / au revoir : message personnalisable
function messageAccueil({ name, desc, cle, exemple }) {
  return {
    ...base,
    name,
    desc,
    run: async ({ jid, args, reply, config, sock, metadata, sender }) => {
      const p = config.PREFIXE;
      const a = (args[0] || '').toLowerCase();
      const c = groupes.sous(jid, cle);
      if (OUI.includes(a)) {
        groupes.majSous(jid, cle, { actif: true });
        return reply(`✅ *${cle}* activé.`);
      }
      if (NON.includes(a)) {
        groupes.majSous(jid, cle, { actif: false });
        return reply(`❌ *${cle}* désactivé.`);
      }
      if (a === 'message') {
        const t = args.slice(1).join(' ').trim();
        if (!t) return reply(`✏️ Exemple : ${p}${cle} message ${exemple}\n\nVariables : {nom} {groupe} {membres}`);
        groupes.majSous(jid, cle, { message: t });
        return reply('✅ Message enregistré.');
      }
      if (a === 'reinitialiser' || a === 'défaut' || a === 'defaut') {
        groupes.majSous(jid, cle, { message: '' });
        return reply('✅ Message par défaut rétabli.');
      }
      if (a === 'test') {
        if (!metadata) return reply('⚠️ Lecture du groupe impossible.');
        const ev = require('../lib/evenements');
        const t = (c.message || ev.TEXTES[cle]).replace(/\{nom\}/g, '@' + numero(sender)).replace(/\{groupe\}/g, metadata?.subject || '').replace(/\{membres\}/g, metadata?.participants?.length || '');
        return sock.sendMessage(jid, { text: t, mentions: [sender] });
      }
      return reply(
        `👋 *${cle}* : ${etat(c.actif)}\nMessage : ${c.message || '(par défaut)'}\n\n${p}${cle} on / off\n${p}${cle} message <texte>\n${p}${cle} test\n${p}${cle} defaut`
      );
    },
  };
}

module.exports = [
  {
    ...base,
    name: 'warn',
    aliases: ['avertissement', 'avertissements'],
    desc: 'Avertit un membre (exclusion à la limite)',
    metaSiGroupe: true,
    run: async ({ sock, jid, msg, args, metadata, reply, config }) => {
      const p = config.PREFIXE;
      const sous = (args[0] || '').toLowerCase();
      if (sous === 'limite') {
        const n = parseInt(args[1], 10);
        if (!n || n < 1 || n > 20) return reply(`✏️ Exemple : ${p}avertir limite 3`);
        groupes.majSous(jid, 'avertir', { limite: n });
        return reply(`✅ Un membre est exclu après ${n} avertissements.`);
      }
      const action = ['voir', 'retirer', 'zero'].includes(sous) ? sous : 'ajouter';
      const reste = action === 'ajouter' ? args : args.slice(1);
      const [cible] = cibles(msg, reste, metadata);
      if (!cible) return reply(`✏️ Utilisation :\n${p}avertir @membre raison\n${p}avertir voir @membre\n${p}avertir retirer @membre\n${p}avertir limite 3`);
      const lim = warns.limite(jid);
      const nom = '@' + numero(cible);
      if (action === 'voir') {
        const w = warns.lire(jid, cible);
        return sock.sendMessage(jid, { text: `📋 ${nom} : ${w.n}/${lim} avertissement(s)${w.raisons.length ? '\n' + w.raisons.map((r) => `• ${r.raison || '—'}`).join('\n') : ''}`, mentions: [cible] }, { quoted: msg });
      }
      if (action === 'retirer') {
        const w = warns.retirer(jid, cible);
        return sock.sendMessage(jid, { text: `✅ ${nom} : ${w.n}/${lim} avertissement(s).`, mentions: [cible] });
      }
      if (action === 'zero') {
        warns.remettreAZero(jid, cible);
        return sock.sendMessage(jid, { text: `✅ Avertissements de ${nom} remis à zéro.`, mentions: [cible] });
      }
      if (metadata && groupes.estAdmin(metadata, [cible])) return reply('🛡️ Impossible d’avertir un administrateur.');
      const raison = reste.filter((x) => !/^@?\d{6,}$/.test(x)).join(' ') || 'comportement inapproprié';
      const w = warns.ajouter(jid, cible, raison);
      if (w.n >= lim) {
        await sock.sendMessage(jid, { text: `🚫 ${nom} atteint ${lim} avertissements (${raison}) et est exclu.`, mentions: [cible] });
        try {
          await sock.groupParticipantsUpdate(jid, [cible], 'remove');
          warns.remettreAZero(jid, cible);
        } catch {
          await reply('⚠️ Je n’ai pas pu l’exclure : je dois être administrateur.');
        }
      } else {
        await sock.sendMessage(jid, { text: `⚠️ ${nom} — ${raison}\nAvertissement ${w.n}/${lim}.`, mentions: [cible] });
      }
    },
  },
  interrupteur({
    name: 'antilink', cle: 'antilien', desc: 'Supprime les liens envoyés par les membres', actions: true,
    aide: '{P}antilien autoriser youtube.com — laisse passer un site\n{P}antilien retirer youtube.com',
  }),
  interrupteur({
    name: 'antitag', cle: 'antimention', desc: 'Bloque les mentions en masse', actions: true, defautAction: 'avertir',
    options: { seuil: { libelle: 'Seuil (mentions)', defaut: 10 } },
  }),
  interrupteur({
    name: 'antispam', cle: 'antispam', desc: 'Bloque ceux qui envoient trop de messages trop vite', actions: true, defautAction: 'avertir',
    options: { max: { libelle: 'Messages max', defaut: 6 }, secondes: { libelle: 'Fenêtre (secondes)', defaut: 8 } },
  }),
  interrupteur({ name: 'antibot', cle: 'antibot', desc: 'Exclut les autres bots WhatsApp (détection approximative)', actions: true }),
  interrupteur({ name: 'antimentiongc', cle: 'antimentiongroupe', desc: 'Bloque les mentions du groupe en statut', actions: true }),
  interrupteur({ name: 'antipromote', cle: 'antipromotion', desc: 'Annule les promotions faites par d’autres que le propriétaire' }),
  interrupteur({ name: 'antidemote', cle: 'antidegradation', desc: 'Annule les rétrogradations faites par d’autres que le propriétaire' }),
  interrupteur({ name: 'antiraid', cle: 'antiraid', desc: 'Ferme le groupe si quelqu’un retire ou nomme trop de monde en une minute', options: { seuil: { libelle: 'Seuil de retraits en 1 minute', defaut: 5 } }, aide: 'Ne compte jamais le bot ni les propriétaires du bot. {P}ouvrir rouvre le groupe.' }),
  interrupteur({ name: 'promotealert', cle: 'alertepromotion', desc: 'Annonce les nouvelles promotions' }),
  interrupteur({ name: 'demotealert', cle: 'alertedegradation', desc: 'Annonce les rétrogradations' }),
  messageAccueil({ name: 'welcome', cle: 'bienvenue', desc: 'Message de bienvenue aux nouveaux membres', exemple: 'Bienvenue {nom} dans {groupe} !' }),
  messageAccueil({ name: 'goodbye', cle: 'aurevoir', desc: 'Message quand un membre part', exemple: '{nom} nous a quittés.' }),
];
