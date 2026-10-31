# Kernel Bot : moteur personnel. Copie ce fichier tel quel, sans rien changer.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV BOT_REPO=https://github.com/manu-jo339/kernel-bot.git
ENV BOT_REF=stable

# Copie de secours faite à la construction. Au démarrage, le moteur récupère lui-même la dernière version.
WORKDIR /app
RUN git clone --depth 1 --branch "${BOT_REF}" "${BOT_REPO}" /app/base \
    && rm -rf /app/base/.git \
    && cd /app/base && npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 10000
RUN chown -R node:node /app
USER node
CMD ["sh", "/app/base/deploy/demarrer.sh"]
