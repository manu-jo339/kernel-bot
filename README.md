# Comment déployer son bot sur son propre Render, piloté depuis Kernel Connect

Avec [Kernel Connect](https://kernel-connect.vercel.app), tu gères ton bot WhatsApp depuis le site. Pour ne dépendre du serveur de personne, ton bot tourne sur **ton propre compte Render** (gratuit). Le site s'en occupe ensuite à ta place : création de ton bot, code de connexion, état.

Il te faut seulement un navigateur (sur téléphone ou ordinateur) et trois comptes gratuits : **Kernel Connect**, **GitHub** et **Render**. Aucun logiciel à installer. Compte environ 15 minutes.

📢 Rejoins aussi la [chaîne WhatsApp](https://whatsapp.com/channel/0029Vb92uHC84OmJV6r39n41) pour les nouveautés et l'assistance.

## Étape 1 : générer ton secret

1. Va sur [Kernel Connect](https://kernel-connect.vercel.app), crée ton compte ou connecte-toi, puis ouvre **Mon moteur**.
2. Clique sur **Générer un secret**, puis sur **Copier**.
3. Colle ce secret dans les notes de ton téléphone : tu en auras besoin à l'étape 3.

Ne le partage avec personne.

## Étape 2 : créer ton dépôt GitHub

1. Sur [GitHub](https://github.com) (crée un compte si besoin), clique sur **New repository**, donne-lui un nom (par exemple `mon-kernel-bot`), choisis **Private** et crée-le.
2. Sur la page suivante, clique sur **creating a new file**, puis nomme le fichier exactement `Dockerfile` (avec la majuscule, sans extension).
3. Copie-colle le contenu ci-dessous dans le fichier, puis clique sur **Commit changes**.

```dockerfile
# Kernel Bot : moteur personnel. Copie ce fichier tel quel, sans rien changer.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG BOT_REPO=https://github.com/manu-jo339/kernel-bot.git
ARG BOT_REF=main

WORKDIR /app
RUN git clone --depth 1 --branch "${BOT_REF}" "${BOT_REPO}" /app \
    && rm -rf /app/.git \
    && npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 10000
RUN chown -R node:node /app
USER node
CMD ["node", "supervisor.js"]
```

## Étape 3 : créer ton service sur Render

1. Va sur [Render](https://render.com) et crée ton compte avec le bouton **GitHub**. Autorise Render à voir ton dépôt.
2. Clique sur **New** → **Web Service**, puis choisis ton dépôt de l'étape 2.
3. **Language** : `Docker`. **Instance Type** : `Free`.
4. Dans **Environment Variables**, ajoute deux variables :
   - `SITE_URL` : `https://kernel-connect.vercel.app` (sans `/` à la fin) ;
   - `ENGINE_SECRET` : le secret de l'étape 1.
5. Clique sur **Create Web Service**. Attends que l'état passe à **Live** (quelques minutes la première fois), puis copie l'adresse de ton service, tout en haut (elle se termine par `.onrender.com`).

## Étape 4 : relier ton Render au site

1. Retourne sur [Kernel Connect](https://kernel-connect.vercel.app) → **Mon moteur**.
2. Donne un nom, colle l'adresse de ton service Render et le secret de tes notes, puis clique sur **Vérifier et enregistrer**.
3. Si le site affiche « Moteur enregistré et vérifié », c'est bon. Sinon, vérifie que ton service est bien **Live**, que l'adresse est exactement la même, et que le secret est identique des deux côtés.

## Étape 5 : connecter ton WhatsApp

1. Sur Kernel Connect, clique sur **Nouvelle instance**, donne-lui un nom, choisis **Mon propre moteur** et continue.
2. Saisis ton numéro WhatsApp : le site affiche un code.
3. Sur ton téléphone : WhatsApp → **Appareils connectés** → **Connecter un appareil** → **Se connecter avec un numéro de téléphone**, puis saisis le code.

C'est terminé : ton bot répond maintenant sur ce numéro. Tape `.menu` dans WhatsApp pour voir ses commandes.

## Bon à savoir

- **Mettre à jour ton bot** : sur Render, **Manual Deploy** → **Clear build cache & deploy**.
- **Mise en veille** : sur l'offre gratuite, Render peut mettre le service en veille. Le bot s'appelle lui-même toutes les 10 minutes pour l'éviter. Après une coupure, la première action sur le site peut prendre une minute.
- **Tes réglages** (avertissements, niveaux…) sont remis à zéro quand Render redémarre le service. La connexion WhatsApp, elle, est conservée.
- **Confidentialité** : la connexion WhatsApp de ton bot est gardée par Kernel Connect, pas par ton Render. La personne qui administre le site peut donc y accéder. Utilise de préférence un numéro dédié au bot, et seulement si tu fais confiance à cette personne.
- **Ton bot ne gère que tes instances.** Personne d'autre ne peut l'utiliser, et tu ne vois pas celles des autres.
