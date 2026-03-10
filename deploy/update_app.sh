#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/workout/app"
VENV_DIR="/opt/workout/venv"
BRANCH="${WORKOUT_BRANCH:-codex/workout-ledger}"

cd "$APP_DIR"
git fetch origin "$BRANCH"
LOCAL_REV="$(git rev-parse HEAD)"
REMOTE_REV="$(git rev-parse "origin/$BRANCH")"

if [[ "$LOCAL_REV" == "$REMOTE_REV" ]]; then
  exit 0
fi

git reset --hard "origin/$BRANCH"
"$VENV_DIR/bin/pip" install -r requirements.txt
install -m 644 deploy/workout-ledger.service /etc/systemd/system/workout-ledger.service
install -m 644 deploy/workout-ledger-update.service /etc/systemd/system/workout-ledger-update.service
install -m 644 deploy/workout-ledger-update.timer /etc/systemd/system/workout-ledger-update.timer
install -m 644 deploy/nginx-workout.conf /etc/nginx/sites-available/workout-ledger
ln -sf /etc/nginx/sites-available/workout-ledger /etc/nginx/sites-enabled/workout-ledger
systemctl daemon-reload
nginx -t
systemctl reload nginx
systemctl restart workout-ledger.service
