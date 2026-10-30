# Kernel Bot — MWENOBANGUE Labs

Bot WhatsApp multi-appareil en français, en Node.js (Baileys).
**Aucun serveur tiers, aucune télémétrie** : ta session WhatsApp reste dans le dossier `auth/` de ton ordinateur.

## 1. Installation (Windows)

1. Installer Node.js 22.5 ou plus : https://nodejs.org
2. Ouvrir l'invite de commandes dans le dossier du bot, puis :
   ```
   npm install
   copy .env.example .env
   notepad .env
   ```
3. Dans `.env`, renseigner `NUMERO_BOT` (le numéro qui sera connecté) et `NUMERO_OWNER` (ton numéro), au format international sans `+` (ex. `242061234567`).

## 2. Premier lancement

```
npm start
```

Un **code d'appairage** s'affiche (ex. `ABCD-1234`). Sur le téléphone du numéro du bot :
WhatsApp → Appareils connectés → Connecter un appareil → *Se connecter avec un numéro de téléphone* → saisir le code.

Aux lancements suivants, la connexion est automatique. Pour changer de numéro : supprimer le dossier `auth/`.

## 3. Personnaliser

| Ce que tu veux changer | Où |
|---|---|
| Préfixe, mode public/privé, nom du bot, numéros | `.env` |
| Signature, titre et pied du menu, emojis, messages d'erreur, commandes à désactiver | `personnalisation.json` |

Après chaque modification : `Ctrl + C` puis `npm start` (ou la commande `.redemarrer` depuis WhatsApp).

Renommer une commande : dans `personnalisation.json`, section `noms` : `"expulser": "virer"`. L'ancien nom continue de marcher.
Changer l'apparence du menu : `.theme` (classique, cadre, moderne, minimal).

## 4. Ajouter une commande

1. Copier `cmd/_modele.js` vers `cmd/mescommandes.js` (sans le `_` au début).
2. Modifier le nom, la description, la catégorie et le code dans `run`.
3. Redémarrer le bot. La commande apparaît automatiquement dans `.menu`.

Un même fichier peut contenir autant de commandes que tu veux (une liste `[ {...}, {...} ]`).
Restrictions disponibles : `ownerOnly`, `groupOnly`, `adminOnly`.

## 5. Chatbot (IA gratuite avec relais automatique)

Le bot peut discuter grâce à Mistral, Cerebras et Groq (gratuits). Si un service atteint sa limite, le suivant prend le relais.

1. Crée une clé API gratuite sur chaque service, puis colle-les dans `.env` (`MISTRAL_API_KEY=`, `CEREBRAS_API_KEY=`, `GROQ_API_KEY=`). Jamais dans un message, jamais sur GitHub.
2. Redémarre le bot.
3. En privé, le bot répond automatiquement (il envoie d'abord un message d'information). Dans un groupe, un admin tape `.chatbot on` ; on lui parle en le mentionnant ou en répondant à l'un de ses messages.

| Commande | Rôle |
|---|---|
| `.ia <question>` | Poser une question (fonctionne partout) |
| `.chatbot on` / `off` / `statut` | Activer, couper ou voir l'état ici (admins dans un groupe) |
| `.oublier` | Effacer la mémoire (`.oublier tout` : admins, efface le groupe) |
| `.chatbot global on/off` | Propriétaire : tout allumer ou éteindre |
| `.chatbot services` | Propriétaire : état de Mistral / Cerebras / Groq |

La mémoire est stockée dans `data/bot.db` (sur ta machine) et effacée automatiquement après 30 jours.
Tu peux donner des informations à l'IA (tes services, tarifs, horaires…) en écrivant un fichier `data/connaissances.txt`.

## 6. Commandes actuelles

Le bot compte **350 commandes**, toutes en mots français simples (les anciens noms anglais restent utilisables comme alias). Tape `.menu` pour les voir par catégorie, `.menu logos` pour une catégorie précise, `.aide nom` pour le détail d'une commande. Les sections 9 à 15 ci-dessous les décrivent.

## Bon à savoir

- WhatsApp n'autorise pas officiellement les bots non officiels : utilise de préférence un numéro dédié.
- Ne partage jamais le dossier `auth/` ni le fichier `.env`.

_MWENOBANGUE Labs_


## 6. Protections de groupe (admins)

| Commande | Rôle |
|---|---|
| `.antilien on/off/supprimer/avertir/expulser` | Supprime les liens ; `.antilien autoriser youtube.com` laisse passer un site |
| `.antispam on/off` · `max 6` · `secondes 8` | Trop de messages trop vite |
| `.antibot` | Exclut les autres bots (détection approximative) |
| `.antimention` · `.antimentiongroupe` | Mentions en masse / mention du groupe en statut |
| `.antipromotion` · `.antidegradation` | Annule les promotions / rétrogradations faites par d'autres que le propriétaire |
| `.alertepromotion` · `.alertedegradation` | Annonce les changements d'admins |
| `.bienvenue` · `.aurevoir` | `on/off`, `message <texte>` (variables `{nom}` `{groupe}` `{membres}`), `test` |
| `.avertir @membre raison` | `voir`, `retirer`, `zero`, `limite 3` — exclusion automatique à la limite |

Le bot doit être **administrateur** du groupe pour supprimer des messages ou exclure.

## 7. Plusieurs numéros

`.connecter 242061234567` donne un code d'appairage pour un autre numéro ; `.numerosconnectes` les liste ; `.deconnecter <numéro>` en retire un.
Seuls les numéros de `NUMERO_OWNER` sont propriétaires : le titulaire d'un numéro supplémentaire n'a **pas** les droits d'administration du bot.
Limite réglable avec `MAX_SESSIONS` (3 par défaut).

## 8. Vérifier que tout marche

`npm test` lance des essais automatiques avec un faux WhatsApp (aucune connexion réelle).

## 9. Outils, affaires, communauté et vie locale

| Famille | Commandes |
|---|---|
| Outils | `.calcul` `.change` `.qrcode` `.tirage` `.note` `.jours` `.heure` `.unites` `.raccourcir` `.motdepasse` `.lienwa` `.pdf` |
| Rappels | `.rappel 30min texte` · `dans 1h30` · `à 18h30` · `demain 8h` · `25/12 9h` · `tous les jours à 7h` — `liste` / `annuler`. `.programmer` (admins) envoie un message au groupe à l'heure choisie |
| Assistants IA | `.resume` `.corriger` `.rediger` `.traduire` — mêmes règles que le chatbot (avis en privé, limite par jour) |
| Ma clé | `.macle mistral TA_CLÉ` (en privé) : tes questions IA passent par ta clé gratuite, sans limite du bot. Clés chiffrées (AES-256) ; secret réglable avec `MACLE_SECRET` dans `.env` |
| Affaires | `.catalogue` `.commander` `.horaires` `.faq` `.facture` / `.devis` (PDF) `.stock` `.rdv` `.dette` `.carte` `.cv` `.lettre` `.licence` `.absent` |
| Communauté (groupes) | `.annonce` `.cotisation` `.tontine` `.anniversaire` `.evenement` `.inscription` `.annonces` `.suggestion` `.signaler` `.appel` `.devoir` `.election` `.inactifs` `.annuaire` |
| Vie locale | `.urgences` `.pharmacies` (remplis par le propriétaire) `.verset` (+ `auto on 7h`) `.proverbe` `.recette` |
| Réseau et sécurité | `.verifierlien` `.arnaque` `.dns` `.ip` `.whois` `.ssl` `.surveiller` |
| Jeux | `.actionverite` (alias `.av`) |
| Propriétaire | `.diffusion` (aperçu + confirmation, pauses entre groupes) `.rapport` (+ `auto on` chaque soir à 20h) `.sauvegarde` (copie de la base, en privé) `.discret on/off` |

Notes :
- Les analyses de liens et de messages (`verifierlien`, `arnaque`) se font **localement** : rien n'est envoyé à un service de réputation.
- `surveiller`, `ip`, `ssl`, `dns` refusent les adresses du réseau privé (ton ordinateur, ton routeur) : le bot ne peut pas servir à les explorer.
- `urgences` et `pharmacies` sont vides au départ : aucun numéro n'est inventé, c'est à toi de les saisir (`.urgences ajouter Pompiers | 118`).
- Pour une licence payante, `.licence creer 242061234567 30j` donne 30 jours d'accès premium, qui expire tout seul.

## 10. Stickers, médias et jeux de texte

| Famille | Commandes |
|---|---|
| Stickers | `.sticker` (image, vidéo 8 s max, GIF) · `.stickerrecadre` · `.stickerrond` · `.stickercoins` · `.renommersticker Pack | Auteur` · `.textesticker [couleur] texte` · `.texteanime texte` |
| Conversions | `.image` (sticker → image) · `.stickervideo` (sticker animé → vidéo) · `.extraireaudio` (vidéo → MP3) · `.audiovideo` (audio → vidéo avec onde) · `.envoyervueunique` · `.fusionner` (audios ou vidéos bout à bout) |
| Texte | `.ecrire` (page de cahier) · `.envers` · `.lirelasuite début | fin` · `.stylelettres [n°] texte` · `.couple` · `.photocouple @a @b` |

- Le nom du pack et de l'auteur des stickers vient du nom du bot (fixe) et de la signature ; tu peux les fixer avec `STICKER_PACK_NAME` et `STICKER_AUTHOR_NAME` dans `.env`.
- Tout est fabriqué **sur ton ordinateur** (sharp pour les images, ffmpeg pour le son et la vidéo) : rien n'est envoyé à un service extérieur. ffmpeg est installé automatiquement avec `npm install` ; si tu préfères le tien, mets `FFMPEG_PATH` dans `.env`.
- La police des textes (Roboto, licence SIL OFL) est dans `assets/fonts/`.

## 11. Effets audio, effets d'image, lecture

| Famille | Commandes |
|---|---|
| Audio (cite un audio, un vocal ou une vidéo) | `.basses` `.sature` `.grave` `.fort` `.rapide` `.epais` `.nightcore` `.audioinverse` `.robot` `.lent` `.doux` `.ecureuil` `.bas` `.echo` `.reverb` `.tamia` `.boue` — `.effetsaudio` donne la liste |
| Images (envoie/cite une image, ou mentionne quelqu'un pour utiliser sa photo de profil) | `.wasted` `.recherche [nom]` `.tremble` (vidéo) `.poubelle` `.tombe [nom]` `.sepia` `.arcenciel` `.couleursinversees` `.prison` `.affect` `.beau` `.flou` `.cercle` `.facepalm` `.gris` `.blagueperdue` `.fenetresuppression` `.sombre` `.coloriser [couleur]` `.contraste` `.pixeliser` |
| Lecture | `.scanner` (QR code + vérification du lien) · `.lire` (texte d'une photo, français/anglais, **100 % local**) · `.transcrire` (vocal → texte, Whisper via Groq) · `.decrire [question]` (décrit une image, Mistral ou Groq) |

- `.transcrire` demande une clé Groq (`GROQ_API_KEY` dans `.env`, ou `.macle groq …` pour chacun). `.decrire` utilise Mistral puis Groq ; les photos sont réduites et leurs données EXIF (lieu, appareil) retirées avant l'envoi. Les deux suivent les mêmes règles que le chatbot (avis en privé, limite par jour).
- Les effets d'image sont des dessins originaux faits sur ton ordinateur, aucun service extérieur.
- `hitler` et `boobs` ne sont pas fournies : une moquerie de la photo d'une vraie personne et du contenu sexuel n'ont pas leur place dans un bot public.

## 12. Téléchargements, recherches, réactions, logos et IA

| Famille | Commandes |
|---|---|
| Téléchargements | `.musique titre ou lien` (MP3) · `.youtube` · `.ytaudio` · `.ytvideo` · `.facebook` · `.tiktok` · `.tiktokaudio` · `.tiktokimage` (diaporama) · `.instagram` · `.twitter` · `.application nom` (APK, seulement si l'antivirus d'Aptoide dit « TRUSTED ») · `.telechargergit lien` (ZIP) |
| Recherches | `.images` (libres de droits, Openverse) · `.google` (DuckDuckGo) · `.wiki` · `.github` · `.film` · `.anime` · `.meteo ville` · `.paroles` (lien vers Genius, les paroles sont protégées) · `.capture lien` · `.pagesource lien` |
| Reconnaissance | `.identifier` (chanson, clé `AUDD_API_TOKEN`) · `.chercherstickers` (clé `TENOR_API_KEY`) · `.stickertelegram lien` (jeton `TELEGRAM_BOT_TOKEN`) |
| Réactions animées | 25 commandes : `.enlacer` `.caliner` `.embrasser` `.danser` `.rougir` `.saluer` `.highfive` … avec ou sans @personne |
| Fun | `.blague` · `.citation` · `.emojimix 😀😍` · `.fauxmessage @membre texte` (admins ; toujours marqué « [simulé] ») |
| Voix et image IA | `.voix [langue] texte` (vocal) · `.imageia description` (Pollinations) · `.ameliorer` (agrandit et rend une photo plus nette, sans IA) |
| IA nommée | `.gpt` `.gemini` `.claude` `.blackbox` : **raccourcis honnêtes** vers `.ia`. Le modèle réel est celui de ton `.env` (le bot le précise la première fois). |
| Développeur | `.brouiller code` (rend du JavaScript illisible ; ce n'est pas du chiffrement) |
| Mail temporaire | `.mailtemp` · `.boitetemp` (en privé, service mail.tm) |
| Logos (48 styles) | `.neon1` `.neon2` `.neon3` `.or1`…`.or5` `.galaxie` `.espace` `.metal` `.acier` `.bois` `.sable` `.hacker` `.scifi` `.futuriste` `.graffiti1`…`3` `.nuage1` `.nuage2` `.ete` `.sousleau` `.verre` `.blackpink`…`3` `.football`…`3` `.dragonball` `.dragonball2` `.naruto` `.avengers` `.captainamerica` `.deadpool` `.thor` `.onepiece` … Exemple : `.neon1 Mon Entreprise` |

À savoir :
- **yt-dlp** n'est pas livré avec le bot. Le propriétaire tape `.ytdlp installer` : le bot télécharge le programme officiel depuis GitHub et **vérifie son empreinte SHA-256** avant de l'installer dans `bin/`. `.ytdlp maj` le met à jour. Limites : 20 min et 60 Mo par fichier.
- Les logos sont **dessinés sur ton ordinateur** (aucun service extérieur). Les noms comme `dragonball` ou `avengers` ne sont que des ambiances de couleurs : aucun logo officiel ni personnage n'est reproduit.
- Les liens donnés par les utilisateurs (`capture`, `pagesource`, téléchargements) sont refusés s'ils pointent vers un réseau privé : le bot ne peut pas servir à explorer ton ordinateur ou ton routeur.
- Les services gratuits utilisés (Open-Meteo, Wikipédia, Openverse, DuckDuckGo, Jikan, iTunes, TVMaze, Aptoide, Pollinations, mail.tm, Google Traduction pour la voix, thum.io pour les captures) ne demandent pas de clé, mais ils peuvent être lents ou indisponibles : le bot le dit simplement.
- Pour `.imageia`, `.voix`, `.capture`, `.mailtemp`… ce que la personne écrit est transmis au service concerné (c'est indiqué dans la réponse).

## 13. Statuts, compte et système (propriétaire)

| Famille | Commandes |
|---|---|
| Statuts | `.lirestatuts on/off` (lit les statuts de tes contacts) · `.aimerstatuts on/off` (+ `emoji 🔥`) · `.telechargerstatuts on/off` (copie chaque statut dans ta discussion privée) · `.sauverstatut` / `.recevoirstatut` (réponds à un statut avec la commande) |
| Compte | `.confidentialite` (tout voir) · `.bio texte` · `.maphoto` (image) ou `.maphoto tous/contacts/sauf/personne` · `.vudernier` · `.enligne` · `.monstatut` · `.coches tous/personne` · `.ajoutgroupe` |
| Présence | `.presence ecrit/enregistre/enligne/hors/aucune [prive/groupe/tous]` |
| Réglages | `.regler CLE valeur` · `.voirreglage` · `.supprimerreglage CLE` |
| Mises à jour | `.verifiermaj` · `.maj` |

- Les statuts : au plus 60 « j'aime » et 60 copies par heure. Ne republie pas les statuts des autres sans leur accord.
- **Réglages par message** : seulement une liste blanche (`PREFIXE`, `MODE`, `NOM_OWNER`, `SIGNATURE`, `STICKER_PACK`, `STICKER_AUTEUR`, `MAJ_DEPOT`, `MAJ_URL`). Ils sont enregistrés dans `data/reglages.json` et passent avant le `.env`. **Les clés secrètes, jetons et numéros de propriétaires ne se règlent jamais et ne s'affichent jamais par WhatsApp** (`.voirreglage` dit seulement « définie » ou « non définie »). Une valeur qui ressemble à une clé collée par erreur est refusée.
- **Mises à jour** : le bot compare sa version à celle de ton dépôt GitHub (`.regler MAJ_DEPOT proprietaire/depot`, dernière « release ») ou à un fichier JSON (`MAJ_URL`). Il **ne remplace jamais ses propres fichiers tout seul** : `.maj` explique les étapes (sauvegarde, copie sans écraser `.env`, `personnalisation.json`, `data/`, `auth/`, puis `npm install`).

## 14. Variables du fichier .env

| Variable | Rôle |
|---|---|
| `NUMERO_OWNER`, `NUMERO_BOT`, `PREFIXE`, `MODE` | Base du bot (le nom « Kernel Bot » est fixe, il ne se change nulle part) |
| `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `GROQ_API_KEY` | Chatbot et assistants IA (relais Mistral → Cerebras → Groq) ; Groq sert aussi à `.transcrire` et `.decrire` |
| `MACLE_SECRET` | Secret de chiffrement des clés personnelles `.macle` (sinon créé dans `data/.macle_secret`) |
| `YTDLP_PATH`, `FFMPEG_PATH` | Chemins personnalisés (facultatif) |
| `NOM_OWNER` | Ton nom, affiché comme propriétaire dans le menu |
| `STICKER_PACK_NAME`, `STICKER_AUTHOR_NAME` | Nom et auteur inscrits dans les stickers |
| `TELEGRAM_BOT_TOKEN` | `.stickertelegram` |
| `TENOR_API_KEY` | `.chercherstickers` |
| `AUDD_API_TOKEN` | `.identifier` |
| `GITHUB_TOKEN` | Facultatif : relève les limites de `.github`, `.telechargergit` et `.verifiermaj` |
| `MAJ_DEPOT`, `MAJ_URL` | Source des mises à jour |

Chaque clé reste **uniquement** dans ton `.env` : ne la colle jamais dans une discussion.

## 15. Ce qui n'est volontairement pas fourni

`hitler` (moquerie de la photo d'une vraie personne), `boobs` (contenu sexuel), les commandes d'économie, `pair`, `support`, `repo`, `url`, `quotely`, `copilot`, `llama`, `awoo`, `lecher`, ainsi que tout ce qui envoyait des données vers le serveur du développeur d'origine.

Vérification : `npm test` lance les essais automatiques avec un faux WhatsApp et de faux services Internet. Les commandes qui dépendent d'Internet (téléchargements, recherches, voix, image IA…) ne peuvent être vraiment validées que sur ton ordinateur connecté : essaie-les une par une.


## 16. Déployer sur Render (gratuit) avec la session dans Supabase

Render gratuit efface les fichiers à chaque redémarrage : sans précaution, le bot perdrait sa connexion WhatsApp. La session est donc gardée dans Supabase.

1. **Supabase** : dans *SQL Editor*, exécuter une fois le contenu de `deploy/supabase.sql` (table `kernel_auth`, protégée : seule la clé `service_role` y accède).
2. **GitHub** : mettre le projet dans un dépôt **privé** (le `.gitignore` exclut déjà `.env`, `auth`, `sessions` et `data`).
3. **Render** : *New → Web Service → Git Provider*, choisir le dépôt, *Language : Docker* (le `Dockerfile` est fourni), instance *Free*.
4. **Variables d'environnement** (onglet *Environment*, jamais dans le code) :
   `NUMERO_BOT`, `NUMERO_OWNER`, `NOM_OWNER`, `PREFIXE`, `MODE`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, et les clés du chatbot si besoin.
5. Au premier démarrage, le **code d'appairage** s'affiche dans les *Logs* de Render : le saisir dans WhatsApp > Appareils connectés.
6. Aux redémarrages suivants, le bot se reconnecte seul (aucun nouveau code).

À savoir sur l'offre gratuite :
- Le service se met en veille après ~15 min sans visite ; le bot s'appelle lui-même toutes les 10 min via l'adresse publique Render pour rester éveillé (un service de ping externe comme UptimeRobot peut aussi aider).
- Seule la **session WhatsApp** survit aux redémarrages. Les réglages et données du dossier `data` (avertissements, niveaux, etc.) sont repartis à zéro à chaque redémarrage ; pour les garder il faut un disque persistant (offre payante) ou une synchronisation vers Supabase (prévue plus tard).
- La page publique du service répond seulement « en ligne » : aucun numéro, aucune session n'y apparaît.


## 17. API moteur pour Kernel Connect (le site)

Le site **Kernel Connect** (Vercel) utilise ce bot comme moteur WhatsApp : il lui demande un vrai code d'appairage (ou un QR) pour chaque instance d'un utilisateur. Une instance = une session supplémentaire dont l'identifiant est l'UUID de l'instance.

Activation : définir `ENGINE_SECRET` (au moins 16 caractères, **la même valeur** que dans Vercel), plus `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`. Sans `ENGINE_SECRET`, l'API reste fermée.

| Appel (sur l'adresse publique du service) | Rôle |
|---|---|
| `GET /engine/health` | état : sessions en cours, capacité, mémoire |
| `POST /engine/instances/:id/pair` `{telephone, methode: CODE\|QR}` | lance la session et renvoie `{code}` ou `{qr}` |
| `POST /engine/instances/:id/disconnect` | déconnecte et efface la session (sans erreur si elle n'existe plus) |
| `POST /engine/instances/:id/reconnect` | relance une session déjà appairée (404 si inconnue) |
| `DELETE /engine/instances/:id` | supprime définitivement (404 si inconnue) |

Sécurité : chaque appel porte `X-KC-Timestamp` et `X-KC-Signature` (HMAC-SHA256 de `horodatage.MÉTHODE.chemin.corps`). Un appel non signé, modifié, plus vieux que 60 s ou rejoué est refusé (401). Le code d'appairage n'est jamais écrit dans les logs ni dans les événements.

Le moteur tient l'état à jour dans Supabase (`instances`, `instance_events`, `pairing_requests`) : appairage en cours, connecté, connexion perdue, déconnecté depuis WhatsApp. Un appairage non terminé au bout de 5 minutes est abandonné.

Au redémarrage, toutes les sessions appairées enregistrées dans Supabase sont relancées (jusqu'à `MAX_SESSIONS`). **Sur Render gratuit (512 Mo), garde `MAX_SESSIONS=2`** : chaque session WhatsApp consomme de la mémoire, et le bot principal en prend déjà une part. Quand la limite est atteinte, le site affiche « moteur complet ».
