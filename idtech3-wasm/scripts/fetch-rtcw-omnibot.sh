#!/bin/sh
# Download the official Omni-Bot 0.93 RTCW pack and keep only the dedicated
# 64-bit module, stock-compatible qagame, and mp_depot navigation/scripts.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DEST="${RTCW_OMNIBOT_DEST:-$ROOT/games/rtcw/omni-bot}"
CACHE="${RTCW_OMNIBOT_CACHE:-$ROOT/.sources/omnibot}"
URL="https://github.com/jswigart/omni-bot/releases/download/0.93/omni-bot_0_93_RTCW.zip"
SHA256="6275af05c97016636aa810b41f7521a74b09655bbf02beda83f862c831bf2418"
ZIP="$CACHE/omni-bot_0_93_RTCW.zip"

mkdir -p "$CACHE"
if [ ! -f "$ZIP" ]; then
  curl -fL --retry 3 --retry-delay 2 -o "$ZIP.partial" "$URL"
  mv "$ZIP.partial" "$ZIP"
fi
actual="$(sha256sum "$ZIP" | awk '{print $1}')"
if [ "$actual" != "$SHA256" ]; then
  echo "Omni-Bot archive sha256 mismatch: $actual" >&2
  exit 1
fi

STAGE="$(mktemp -d -t rtcw-omnibot.XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
unzip -q -o "$ZIP" -d "$STAGE"

rm -rf "$DEST/rtcw" "$DEST/global_scripts"
mkdir -p "$DEST/rtcw/nav" "$DEST/rtcw/scripts" "$DEST/rtcw/user" "$DEST/native"
install -m 0644 "$STAGE/omni-bot/omnibot_rtcw.x86_64.so" "$DEST/omnibot_rtcw.x86_64.so"
install -m 0644 "$STAGE/omnibot/qagame.mp.x86_64.so" "$DEST/native/qagame.mp.x86_64.so"
cp -a "$STAGE/omni-bot/rtcw/scripts/." "$DEST/rtcw/scripts/"
cp -a "$STAGE/omni-bot/global_scripts/." "$DEST/global_scripts/"
for name in mp_depot.way mp_depot.gm mp_depot_goals.gm mp_depot_cp.gm; do
  install -m 0644 "$STAGE/omni-bot/rtcw/nav/$name" "$DEST/rtcw/nav/$name"
done
# Keep the authored user cfg if present; otherwise write MinBots=8 defaults.
if [ ! -f "$DEST/rtcw/user/omni-bot.cfg" ]; then
  cat > "$DEST/rtcw/user/omni-bot.cfg" <<'CFG'
ServerManager.MinBots = 8;
ServerManager.MaxBots = 8;
ServerManager.BalanceTeams = true;
Log.LogLevel = 2;
Log.LogInfo = true;
CFG
fi

test -f "$DEST/omnibot_rtcw.x86_64.so"
test -f "$DEST/native/qagame.mp.x86_64.so"
test -f "$DEST/rtcw/nav/mp_depot.way"
echo "Omni-Bot 0.93 RTCW dedicated files ready in $DEST"
