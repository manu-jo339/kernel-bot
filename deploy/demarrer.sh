#!/bin/sh
# Kernel Bot — démarrage d'un moteur personnel (Render).
# À chaque démarrage : récupère la dernière version publiée (branche « stable » du dépôt public) ;
# si GitHub ne répond pas, ou si l'installation échoue, le moteur démarre avec la copie faite à la construction.
# Redémarrer le service = mettre à jour le bot. Aucun secret n'est lu ni envoyé ici.
APP="${APP_DIR:-/app}"
BRANCHE="${BOT_REF:-stable}"
DEPOT="${BOT_REPO:-https://github.com/manu-jo339/kernel-bot.git}"

cd "$APP" || exit 1
rm -rf "$APP/live"

if timeout 120 git clone -q --depth 1 --branch "$BRANCHE" "$DEPOT" "$APP/live" 2>/dev/null; then
  rm -rf "$APP/live/.git"
  if cmp -s "$APP/live/package-lock.json" "$APP/base/package-lock.json"; then
    # mêmes dépendances que la copie de secours : on les réutilise (démarrage rapide)
    ln -s "$APP/base/node_modules" "$APP/live/node_modules"
  elif (cd "$APP/live" && timeout 300 npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1); then
    :
  else
    echo "[démarrage] installation de la dernière version impossible : copie de secours utilisée"
    rm -rf "$APP/live"
  fi
else
  echo "[démarrage] GitHub injoignable ou branche « $BRANCHE » absente : copie de secours utilisée"
fi

if [ -f "$APP/live/supervisor.js" ]; then
  cd "$APP/live" || exit 1
  echo "[démarrage] dernière version récupérée"
else
  cd "$APP/base" || exit 1
fi
exec node supervisor.js
