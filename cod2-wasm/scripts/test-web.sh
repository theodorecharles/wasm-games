#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"${repo_root}/scripts/build-web.sh"
echo "Call of Duty 2 full object compile and canonical web-package checks passed"
