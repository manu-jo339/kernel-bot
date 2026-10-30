# Kernel Bot — moteur personnel (à copier tel quel dans TON dépôt GitHub, sous le nom « Dockerfile »)
# Ce fichier ne contient aucun secret : il télécharge le code public de Kernel Bot au moment de la construction.
# Variables à définir sur Render (onglet Environment) : SITE_URL et ENGINE_SECRET. Rien d'autre.
FROM node:22-bookworm-slim

# ffmpeg : stickers animés, audio, vidéo. git : pour télécharger le code du bot.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dépôt et version du bot. « main » = toujours la dernière version à chaque reconstruction.
# Pour figer une version stable, remplace par une étiquette, par exemple v1.0.0.
ARG BOT_REPO=https://github.com/manu-jo339/kernel-bot.git
ARG BOT_REF=main

WORKDIR /app
RUN git clone --depth 1 --branch "${BOT_REF}" "${BOT_REPO}" /app \
    && rm -rf /app/.git \
    && npm ci --omit=dev

ENV NODE_ENV=production
# Render fournit PORT ; la page d'état répond dessus
EXPOSE 10000

# Un utilisateur sans privilèges
RUN chown -R node:node /app
USER node

CMD ["node", "supervisor.js"]
