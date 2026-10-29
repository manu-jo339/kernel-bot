// Kernel Bot — logos de texte : .neon1 Kernel · .or1 Mon Entreprise · .galaxie Salut
// Les images sont dessinées en local (aucun service extérieur). Les styles sont des ambiances génériques : aucun logo officiel.
const config = require('../config');
const logos = require('../lib/logos');
const renommage = require('../lib/renommage.json');
const { messageCite, extraireTexte, numero } = require('../lib/utils');

// Anciens noms (OVL) → alias, pour que les habitués retrouvent leurs commandes
const anciens = {};
for (const [ancien, nouveau] of Object.entries(renommage)) if (ancien !== nouveau) (anciens[nouveau] ||= []).push(ancien);

const cooldown = new Map();

const commandes = logos.noms.map((nom) => ({
  name: nom,
  aliases: anciens[nom] || [],
  categorie: 'Logos',
  desc: `Logo « ${nom} » : ${config.PREFIXE}${nom} Ton texte`,
  async run({ sock, jid, msg, args, sender, isOwner, reply }) {
    const cite = messageCite(msg);
    const texte = (args.join(' ').trim() || (cite ? extraireTexte(cite.message) : '')).trim().replace(/\s+/g, ' ');
    if (!texte) return reply(`🎨 Écris le texte du logo après la commande.\nExemple : ${config.PREFIXE}${nom} Mon Entreprise`);
    if (texte.length > 30) return reply('⚠️ Texte trop long pour un logo (30 caractères maximum).');
    if (!isOwner) {
      const k = numero(sender), d = cooldown.get(k) || 0;
      if (Date.now() - d < 3000) return reply('⏳ Un instant, je termine ton logo précédent.');
      cooldown.set(k, Date.now());
    }
    try {
      const png = await logos.creer(nom, texte);
      if (!png) return reply('❓ Je ne sais pas dessiner ces caractères. Utilise des lettres, chiffres et signes simples (sans emojis).');
      await sock.sendMessage(jid, { image: png, caption: `🎨 ${texte}` }, { quoted: msg });
    } catch (e) {
      console.error('[logo]', e.message);
      await reply('⚠️ Impossible de créer ce logo pour le moment.');
    }
  },
}));

module.exports = commandes;
