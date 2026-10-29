# Kernel Bot — image pour Render / Docker (Node 22 : le bot utilise node:sqlite)
FROM node:22-bookworm-slim

# ffmpeg : stickers animés, audio, vidéo
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Render fournit PORT ; la page d'état répond dessus
EXPOSE 10000

# Un utilisateur sans privilèges
RUN chown -R node:node /app
USER node

CMD ["node", "supervisor.js"]
