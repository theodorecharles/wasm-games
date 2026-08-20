#!/bin/sh
set -eu

case "$(uname -m)" in
  x86_64|amd64) ;;
  *)
    echo "wolfet-wasm: this image supports amd64 only (found $(uname -m))" >&2
    exit 1
    ;;
esac

APP_ROOT="/opt/wolfet-wasm"
DATA_ROOT="${ETJS_DATA_ROOT:-/data}"
SEED_ROOT="$APP_ROOT/seed/runtime"
ANNOUNCER_ROOT="$DATA_ROOT/announcer"

# A bind-mounted data root normally belongs to the host user while this
# entrypoint runs as root. Preserve that owner for the operator-facing drop
# folder so desktop file managers can add and remove custom PK3s.
mkdir -p "$DATA_ROOT"
DATA_OWNER_UID="$(stat -c '%u' "$DATA_ROOT")"
DATA_OWNER_GID="$(stat -c '%g' "$DATA_ROOT")"

mkdir -p "$DATA_ROOT/runtime/etmain" "$DATA_ROOT/runtime/legacy" \
  "$DATA_ROOT/runtime/omni-bot-user" \
  "$DATA_ROOT/web/sound/music" "$DATA_ROOT/custom_maps" "$ANNOUNCER_ROOT"
chown "$DATA_OWNER_UID:$DATA_OWNER_GID" "$DATA_ROOT/custom_maps" "$ANNOUNCER_ROOT"
chmod 0775 "$DATA_ROOT/custom_maps" "$ANNOUNCER_ROOT"

# Seed text configuration only when absent so a persistent volume remains
# user-editable. Project binaries and data are refreshed on every image start.
cp -an "$SEED_ROOT/." "$DATA_ROOT/runtime/"
install -m 0755 "$SEED_ROOT/legacy/qagame.mp.x86_64.so" \
  "$DATA_ROOT/runtime/legacy/qagame.mp.x86_64.so"
install -m 0644 "$SEED_ROOT/legacy/etjs.pk3" \
  "$DATA_ROOT/runtime/legacy/etjs.pk3"

# Original UT2004 announcer recordings are licensed game assets and therefore
# are never bundled in this public image. Operators who own the game may place
# their locally extracted WAVs in /data/announcer. Build a private overlay for
# that instance without modifying or redistributing the source installation.
ANNOUNCER_COMPLETE=1
for announcer_name in doublekill multikill megakill ultrakill monsterkill; do
  [ -s "$ANNOUNCER_ROOT/$announcer_name.wav" ] || ANNOUNCER_COMPLETE=0
done
if [ "$ANNOUNCER_COMPLETE" -eq 1 ]; then
  ANNOUNCER_TMP="$(mktemp -d /tmp/wolfet-announcer.XXXXXX)"
  unzip -q "$SEED_ROOT/legacy/etjs.pk3" -d "$ANNOUNCER_TMP"
  mkdir -p "$ANNOUNCER_TMP/sound/announcer"
  for announcer_name in doublekill multikill megakill ultrakill monsterkill; do
    install -m 0644 "$ANNOUNCER_ROOT/$announcer_name.wav" \
      "$ANNOUNCER_TMP/sound/announcer/$announcer_name.wav"
  done
  (cd "$ANNOUNCER_TMP" && zip -q -9 -r "$ANNOUNCER_TMP/etjs.pk3" . \
    -x etjs.pk3)
  install -m 0644 "$ANNOUNCER_TMP/etjs.pk3" \
    "$DATA_ROOT/runtime/legacy/etjs.pk3"
  rm -rf "$ANNOUNCER_TMP"
  echo "wolfet-wasm: installed locally supplied UT2004 announcer"
fi
# Browser UI files are application code, not operator configuration. Refresh
# them on every image start so a persistent /data volume cannot pin an older
# menu layout after the container is upgraded.
mkdir -p "$DATA_ROOT/runtime/legacy/ui"
for seed_ui_file in "$SEED_ROOT"/legacy/ui/*; do
  [ -f "$seed_ui_file" ] || continue
  install -m 0644 "$seed_ui_file" "$DATA_ROOT/runtime/legacy/ui/$(basename "$seed_ui_file")"
done
install -m 0644 "$SEED_ROOT/omni-bot-user/omni-bot.cfg" \
  "$DATA_ROOT/runtime/omni-bot-user/omni-bot.cfg"

if [ -f "$DATA_ROOT/runtime/omni-bot-user/omni-bot.cfg" ]; then
  install -m 0644 "$DATA_ROOT/runtime/omni-bot-user/omni-bot.cfg" \
    /legacy/server/legacy/omni-bot/et/user/omni-bot.cfg
fi

export ETJS_DATA_ROOT="$DATA_ROOT"
export ETJS_LEGACY_PAK_SOURCE="/legacy/server/legacy/legacy_v2.84.0.pk3"
export ETJS_EMBEDDED_DED=1
export ETJS_DED_BIN="/legacy/server/etlded"
export ETJS_DED_PORT="${ETJS_DED_PORT:-27960}"
export ETJS_HTTP_PORT="${ETJS_HTTP_PORT:-8088}"
export ETJS_MODE="${ETJS_MODE:-arcade}"
export ETJS_SLOTS="${ETJS_SLOTS:-12}"
export ETJS_TRUST_PROXY="${ETJS_TRUST_PROXY:-0}"
export ETJS_OMNIBOT="${ETJS_OMNIBOT:-1}"
export KEEP_ALIVE="${KEEP_ALIVE:-${keep_alive:-false}}"
export IDLE_TIMEOUT="${IDLE_TIMEOUT:-${idle_timeout:-15m}}"

echo "wolfet-wasm: validating game data in $DATA_ROOT"
sh "$APP_ROOT/scripts/fetch-game-data.sh"
echo "wolfet-wasm: starting $ETJS_MODE mode with $ETJS_SLOTS slots on tcp/$ETJS_HTTP_PORT and udp/$ETJS_DED_PORT (keep_alive=$KEEP_ALIVE idle_timeout=$IDLE_TIMEOUT)"

exec "$@"
