#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/segrada/app"
VENV_DIR="/opt/segrada/venv"
BRANCH="${SEGRADA_BRANCH:-main}"

cd "$APP_DIR"
git fetch origin "$BRANCH"
LOCAL_REV="$(git rev-parse HEAD)"
REMOTE_REV="$(git rev-parse "origin/$BRANCH")"

if [[ "$LOCAL_REV" == "$REMOTE_REV" ]]; then
  exit 0
fi

git reset --hard "origin/$BRANCH"
"$VENV_DIR/bin/pip" install -r requirements.txt
install -m 644 deploy/segrada.service /etc/systemd/system/segrada.service
install -m 644 deploy/segrada-update.service /etc/systemd/system/segrada-update.service
install -m 644 deploy/segrada-update.timer /etc/systemd/system/segrada-update.timer
install -m 644 deploy/nginx-segrada.conf /etc/nginx/sites-available/segrada
ln -sf /etc/nginx/sites-available/segrada /etc/nginx/sites-enabled/segrada
systemctl daemon-reload
nginx -t
systemctl reload nginx
systemctl restart segrada.service
