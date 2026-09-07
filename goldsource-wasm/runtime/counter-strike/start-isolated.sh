#!/bin/sh
set -eu
# Only these bot configuration/runtime directories are writable. Keep the
# accepted engine, retail assets and graph on the read-only image filesystem.
cp -a /opt/cs-yapb-default-conf/. /xashds/cstrike/addons/yapb/conf/
exec /usr/local/bin/start-yapb "$@"
