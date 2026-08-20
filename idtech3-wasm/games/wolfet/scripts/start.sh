#!/bin/sh
# Documented ETJS start: website + one shared dedicated match
set -e
cd "$(dirname "$0")/.."
if [ ! -d node_modules/ws ]; then
  npm install
fi
exec node server/index.js
