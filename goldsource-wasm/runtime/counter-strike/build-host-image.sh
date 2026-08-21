#!/usr/bin/env bash
set -euo pipefail

runtime_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base_image="${CS_BASE_IMAGE:-yohimik/cs-web-server@sha256:1618f2cf059f2f5857f09701846767ce4089efcc41d776a47acdfa6f994ccda2}"
output_image="${CS_SERVER_IMAGE:-wasm-games/counter-strike-yapb:4.4.957}"
yapb_url="https://github.com/yapb/yapb/releases/download/4.4.957/yapb-4.4.957-linux.tar.xz"
yapb_sha256="8c095ac89b9b2ccc70a66a71d608e1a570b5268c57c6083ced8c06161533a4b1"
context="$(mktemp -d -t goldsource-yapb-image.XXXXXX)"

cleanup() {
  find "${context}" -mindepth 1 -depth -delete 2>/dev/null || true
  rmdir "${context}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

curl -fsSL --retry 3 "${yapb_url}" -o "${context}/yapb.tar.xz"
printf '%s  %s\n' "${yapb_sha256}" "${context}/yapb.tar.xz" | sha256sum --check --status
tar -xJf "${context}/yapb.tar.xz" -C "${context}"
rm "${context}/yapb.tar.xz"
cp "${runtime_dir}/Dockerfile" "${context}/Dockerfile"
cp "${runtime_dir}/start-yapb.sh" "${context}/start-yapb.sh"

docker build --platform linux/386 \
  --build-arg "CS_BASE_IMAGE=${base_image}" \
  --tag "${output_image}" "${context}"
docker run --rm --platform linux/386 --entrypoint sh "${output_image}" -c \
  "grep -Fq 'gamedll_linux \"addons/yapb/bin/yapb.so\"' /xashds/cstrike/liblist.gam && \
   test -s /xashds/cstrike/addons/yapb/bin/yapb.so && \
   test -s /xashds/cstrike/addons/yapb/data/graph/de_dust2.graph && \
   test -x /usr/local/bin/start-yapb"
printf '%s\n' "${output_image}"
