// Kernel Bot — effets sur les voix et la musique (ffmpeg, tout se passe sur l'ordinateur du bot)
// Utilisation : cite un audio, un vocal ou une vidéo avec la commande de l'effet (ex. .nightcore)
const config = require('../config');
const media = require('../lib/media');
const { recuperer, erreurMedia } = require('../lib/recup');

const N = 'aresample=44100,'; // on normalise d'abord la fréquence : les vocaux WhatsApp sont en 48 kHz
// Change la hauteur de la voix sans changer la vitesse (facteur > 1 : plus aigu, < 1 : plus grave)
const hauteur = (f) => `asetrate=44100*${f},aresample=44100,atempo=${(1 / f).toFixed(4)}`;

// [nom, alias (anciens noms OVL), description, filtre ffmpeg]
const EFFETS = [
  ['basses', ['bass'], 'Renforce les basses (ça fait vibrer)', 'bass=g=18:f=110:w=0.6,volume=1.4,alimiter=limit=0.95'],
  ['sature', ['blown'], 'Son saturé, distordu', 'acrusher=level_in=4:level_out=2:bits=8:mode=log:aa=1,alimiter=limit=0.95'],
  ['grave', ['deep'], 'Voix plus grave et profonde', hauteur(0.85) + ',bass=g=6'],
  ['fort', ['earrape'], 'Volume très fort (attention aux oreilles !)', 'volume=5,alimiter=limit=0.98'],
  ['rapide', ['fast'], 'Plus rapide (x1,5)', 'atempo=1.5'],
  ['epais', ['fat'], 'Voix épaisse et lourde', 'asetrate=44100*0.88,aresample=44100,atempo=1.0909,bass=g=10'],
  ['nightcore', ['nightcore'], 'Effet nightcore : plus aigu et plus rapide', 'asetrate=44100*1.25,aresample=44100'],
  ['audioinverse', ['reverse'], 'Joue l’audio à l’envers', 'areverse'],
  ['robot', ['robot'], 'Voix de robot', 'vibrato=f=35:d=0.6,aecho=0.9:0.7:6|12:0.7|0.5,volume=1.3'],
  ['lent', ['slow'], 'Plus lent (x0,7)', 'atempo=0.7'],
  ['doux', ['smooth'], 'Son plus doux, moins agressif', 'lowpass=f=3000,volume=0.9'],
  ['ecureuil', ['squirrel'], 'Voix d’écureuil, très aiguë', hauteur(1.8)],
  ['bas', ['low'], 'Voix très basse, de monstre', hauteur(0.62)],
  ['echo', ['echo'], 'Ajoute de l’écho', 'aecho=0.8:0.9:500|1000:0.4|0.25'],
  ['reverb', ['reverse_echo', 'reverberation'], 'Ambiance de grande salle (réverbération)', 'aecho=0.8:0.7:20|40|70|110:0.5|0.4|0.3|0.2'],
  ['tamia', ['chipmunk'], 'Voix de petit tamia', hauteur(1.4)],
  ['boue', ['mud', 'muffled'], 'Son étouffé, comme sous l’eau', 'lowpass=f=600,volume=1.6'],
];

function commande([nom, aliases, desc, filtre]) {
  return {
    name: nom,
    aliases,
    categorie: 'Audio',
    desc,
    usage: `{P}${nom} — cite un audio, un vocal ou une vidéo`,
    run: async (ctx) => {
      const { sock, jid, msg, reply } = ctx;
      const m = await recuperer(ctx, ['audio', 'video'], `🎚️ Cite un audio, un vocal ou une vidéo avec ${config.PREFIXE}${nom}\n_${desc}_`);
      if (!m) return;
      const ext = media.extDe(m.mime, m.nom);
      try {
        const d = await media.duree(m.buffer, ext);
        if (d > 300) return reply('⚠️ Audio trop long (5 minutes maximum).');
        const mp3 = await media.convertir({ buffer: m.buffer, ext }, (ins, out) => ['-i', ins[0], '-vn', '-af', N + filtre, '-acodec', 'libmp3lame', '-q:a', '3', out], 'mp3', 150000);
        await sock.sendMessage(jid, { audio: mp3, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
      } catch (e) {
        await erreurMedia(reply, /does not contain any stream|Output file/.test(e.message) ? new Error('aucun son dans ce fichier') : e);
      }
    },
  };
}

const commandes = EFFETS.map(commande);
commandes.push({
  name: 'effetsaudio',
  aliases: ['effets', 'audioeffets'],
  categorie: 'Audio',
  desc: 'Liste des effets sonores disponibles',
  run: async ({ reply }) => reply(`🎚️ *Effets sonores* (cite un audio / vocal / vidéo)\n\n${EFFETS.map(([n, , d]) => `• ${config.PREFIXE}${n} — ${d}`).join('\n')}`),
});
commandes.EFFETS = EFFETS;
module.exports = commandes;
