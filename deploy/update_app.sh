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
systemctl restart segrada.service
