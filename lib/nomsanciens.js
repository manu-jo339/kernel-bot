// Kernel Bot — les commandes portent NOS noms (français), mais les anciens noms (style OVL : vv, vv2, kick, kickall…)
// sont reconnus eux aussi, pour les habitués de l'ancien bot. ANCIENS_NOMS=non les désactive.
module.exports = () => !/^(non|0|false|faux|no)$/i.test(String(process.env.ANCIENS_NOMS || '').trim());
