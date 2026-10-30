# Kernel Bot — MWENOBANGUE Labs

Bot WhatsApp multi-appareil en français, en Node.js (Baileys), avec 350 commandes simples : protections de groupe, stickers, outils, assistants IA, vie locale… Tape `.menu` dans WhatsApp pour les voir par catégorie, et `.aide nom` pour le détail d'une commande.

Kernel Bot peut s'utiliser de deux façons :
- **piloté depuis le site Kernel Connect**, sur ton propre compte Render gratuit : voir [Mon propre moteur](#mon-propre-moteur--mon-bot-sur-mon-render-piloté-depuis-kernel-connect) ;
- **en autonome** sur ton ordinateur ou sur un hébergeur : voir [Installation](#installation-autonome).

> WhatsApp n'autorise pas officiellement les bots non officiels : utilise de préférence un numéro dédié. Ne partage jamais le dossier `auth/` ni le fichier `.env`.

## Mon propre moteur : mon bot sur mon Render, piloté depuis Kernel Connect

Tu veux utiliser Kernel Connect (le site) sans passer par le serveur de son propriétaire ? Tu héberges toi-même le moteur sur ton compte Render gratuit, et le site le pilote : création des instances, code d'appairage, état, déconnexion. **Tu n'as besoin d'aucune base de données** : la session WhatsApp et l'état sont gardés par le site, et ce moteur ne détient aucune clé de base.

Ce qu'il te faut : un compte sur le site Kernel Connect, un compte gratuit sur Render, un compte GitHub. Compte environ 15 minutes.

**Étape 1 : choisir ton secret.** C'est un mot de passe long (au moins 16 caractères, 32 conseillés) qui sert à signer les échanges entre ton moteur et le site. Génère-le avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, ou avec n'importe quel gestionnaire de mots de passe. Garde-le : tu le saisiras deux fois (Render, puis le site). Ne le partage avec personne et ne l'écris dans aucun fichier du dépôt.

**Étape 2 : ton dépôt GitHub, avec un seul fichier.**
1. Sur GitHub, crée un nouveau dépôt à ton nom (nom au choix, par exemple `mon-kernel-bot`). Il peut être privé.
2. Ajoute-y un seul fichier nommé exactement `Dockerfile`, avec le contenu du fichier [`deploy/ami/Dockerfile`](deploy/ami/Dockerfile) de ce dépôt (bouton *Add file* → *Create new file*, colle le contenu, *Commit*).

Tu n'as rien d'autre à copier : ce fichier télécharge lui-même la dernière version de Kernel Bot à chaque construction.

**Étape 3 : créer le service sur Render.**
1. Render → *New* → *Web Service* → *Git Provider* → choisis TON dépôt (celui de l'étape 2).
2. *Language* : **Docker**. *Instance type* : **Free**.
3. Dans *Environment*, ajoute deux variables, et seulement elles :
   - `SITE_URL` = l'adresse https du site Kernel Connect (par exemple `https://kernel-connect.vercel.app`, sans `/` à la fin) ;
   - `ENGINE_SECRET` = le secret de l'étape 1.
   `MAX_SESSIONS=2` est la valeur par défaut conseillée sur l'offre gratuite (512 Mo de mémoire).
4. *Create Web Service* et attends que le service soit **Live** (la première construction prend quelques minutes). Note son adresse (elle se termine par `.onrender.com`).

L'adresse publique est détectée toute seule sur Render. Dans les logs tu dois voir « Mode site : ce moteur est relié à Kernel Connect ». Avant l'étape suivante tu peux voir un message « le site refuse ce moteur » : c'est normal, il ne te connaît pas encore.

**Étape 4 : l'enregistrer sur le site.**
1. Connecte-toi à Kernel Connect → menu **Mon moteur**.
2. Saisis un nom, l'adresse Render et le même secret, puis *Enregistrer*.
3. Le site appelle ton moteur avec une signature pour vérifier que tout est bon. S'il répond « en ligne », c'est fini. Sinon, vérifie que le service Render est bien Live, l'adresse (exactement la même), et le secret (même valeur des deux côtés).

**Étape 5 : créer ta première instance.** *Mes instances* → *Nouvelle instance* → choisis **Mon moteur** → saisis ton numéro WhatsApp → le site affiche le code d'appairage. Dans WhatsApp : *Appareils connectés* → *Connecter un appareil* → *Connecter avec un numéro de téléphone*, puis saisis le code. Le code n'apparaît jamais dans les logs de Render.

**Bon à savoir**
- Le bot ne tourne que pour les instances créées depuis le site : il n'y a pas de bot principal sur ce moteur.
- Ta session WhatsApp survit aux redémarrages de Render, car elle est gardée par le site. En revanche, les données locales du bot (avertissements, niveaux, réglages…) repartent à zéro à chaque redémarrage sur l'offre gratuite.
- Le service gratuit s'endort après environ 15 minutes sans visite ; le bot s'appelle lui-même pour rester éveillé. Un service de ping externe (par exemple UptimeRobot, sur l'adresse racine du service) peut aider.
- Les mises à jour : sur Render, *Manual Deploy* → **Clear build cache & deploy**. Le moteur télécharge alors la dernière version de Kernel Bot. Sans vider le cache, Render peut réutiliser l'ancienne version.
- Sécurité : le site ne communique qu'avec des adresses `https://….onrender.com`. Ton moteur ne peut toucher qu'à **tes** instances ; il ne voit ni celles des autres moteurs, ni celles du moteur partagé. Et inversement, le site n'utilise ton secret que pour ton moteur.
- Un compte qui n'a pas reçu le droit au moteur partagé ne peut créer des instances que sur son propre moteur.
- **Confidentialité** : la session WhatsApp de ton moteur est gardée dans la base de Kernel Connect, pas sur ton Render. Elle est donc accessible à la personne qui administre le site. Ne l'utilise qu'avec quelqu'un en qui tu as confiance, et de préférence avec un numéro dédié au bot.

## Installation autonome

1. Installer [Node.js](https://nodejs.org) 22.5 ou plus.
2. Dans le dossier du bot : `npm install`, puis `copy .env.example .env` et `notepad .env` (Windows) ou `cp .env.example .env` (Linux/macOS).
3. Dans `.env`, renseigner `NUMERO_BOT` (le numéro qui sera connecté) et `NUMERO_OWNER` (ton numéro), au format international sans `+` (par exemple `242061234567`).
4. `npm start` : un code d'appairage s'affiche. Sur le téléphone du bot : WhatsApp → Appareils connectés → Connecter un appareil → Se connecter avec un numéro de téléphone → saisir le code.

Aux lancements suivants, la connexion est automatique. Pour changer de numéro, supprime le dossier `auth/`.

**Personnaliser** : le préfixe, le mode public/privé et les numéros se règlent dans `.env` (toutes les variables sont expliquées dans `.env.example`). Signature, titre et pied du menu, emojis, messages d'erreur, noms de commandes et commandes à désactiver se règlent dans `personnalisation.json`. **Ajouter une commande** : copie `cmd/_modele.js` vers `cmd/mescommandes.js`, modifie-le et redémarre le bot.

**Vérifier** : `npm test` lance les essais automatiques avec un faux WhatsApp (aucune connexion réelle).

## Héberger sur Render avec la session dans Supabase

Render gratuit efface les fichiers à chaque redémarrage : la session WhatsApp est donc gardée dans Supabase.

1. Dans le *SQL Editor* de Supabase, exécute une fois `deploy/supabase.sql` (table `kernel_auth`, accessible seulement avec la clé `service_role`).
2. Mets le projet dans ton dépôt GitHub (le `.gitignore` exclut déjà `.env`, `auth`, `sessions` et `data`).
3. Render → *New* → *Web Service* → ton dépôt → *Language* : Docker → instance *Free*.
4. Variables (onglet *Environment*, jamais dans le code) : `NUMERO_BOT`, `NUMERO_OWNER`, `NOM_OWNER`, `PREFIXE`, `MODE`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, et les clés du chatbot si besoin.
5. Au premier démarrage, le code d'appairage s'affiche dans les *Logs* de Render. Ensuite, le bot se reconnecte seul.

Seule la session survit aux redémarrages : les données du dossier `data` (avertissements, niveaux…) repartent à zéro sur l'offre gratuite.

## API moteur pour Kernel Connect

Le site pilote le moteur par des appels signés (HMAC-SHA256 de `horodatage.MÉTHODE.chemin.corps`, valables 60 secondes, jamais rejoués). Avec `ENGINE_SECRET` défini, le moteur expose `GET /engine/health` et, par instance, `POST /engine/instances/:id/pair`, `…/disconnect`, `…/reconnect` et `DELETE /engine/instances/:id`. Sans `ENGINE_SECRET`, l'API reste fermée. Avec `PRINCIPAL=non`, aucun bot principal n'est lancé : les codes d'appairage ne sont affichés que sur le site. Sur Render gratuit, garde `MAX_SESSIONS=2`.


---

MWENOBANGUE Labs · Brazzaville
