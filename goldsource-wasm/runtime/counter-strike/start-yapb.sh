#!/bin/sh
set -eu

bot_quota="${CS_BOTS:-9}"
bot_difficulty="${CS_BOT_DIFFICULTY:-2}"
case "${bot_quota}" in *[!0-9]*|'') echo 'CS_BOTS must be an integer.' >&2; exit 64;; esac
case "${bot_difficulty}" in 0|1|2|3|4) ;; *) echo 'CS_BOT_DIFFICULTY must be 0 through 4.' >&2; exit 64;; esac

config_dir=/xashds/cstrike/addons/yapb/conf
main_cfg="${config_dir}/yapb.cfg"
custom_cfg="${config_dir}/custom.cfg"

# YaPB executes yapb.cfg while its game DLL is loading.  Write the requested
# runtime values into that authoritative file before Xash starts; custom.cfg is
# kept as a small, human-readable record for runtime inspection.
sed -i \
  -e "s/^yb_quota .*/yb_quota \"${bot_quota}\"/" \
  -e "s/^yb_difficulty .*/yb_difficulty \"${bot_difficulty}\"/" \
  "${main_cfg}"
{
  printf 'yb_quota "%s"\n' "${bot_quota}"
  printf 'yb_difficulty "%s"\n' "${bot_difficulty}"
} >"${custom_cfg}"

exec /xashds/xash +ip 0.0.0.0 -port 27015 -game cstrike "$@"
