#!/usr/bin/env bash
# Stamps a copy of install.sh with real versions and SHA-256 sums for a release (R1, R24, T072).
# Usage: stamp.sh <template install.sh> <output install.sh> <ytcreator-version> <node-version> <SHA256SUMS file>
set -euo pipefail

template="$1"
output="$2"
version="$3"
node_version="$4"
sums_file="$5"

sum_for() {
  # $1: exact filename as it appears in SHA256SUMS
  local name="$1"
  local line
  line="$(grep -F "  ${name}" "${sums_file}" | head -n1)"
  if [ -z "${line}" ]; then
    echo "stamp.sh: no SHA-256 sum for ${name} in ${sums_file}" >&2
    exit 1
  fi
  echo "${line}" | awk '{print $1}'
}

release_file="ytcreator-${version}.tar.gz"
sha_release="$(sum_for "${release_file}")"
sha_darwin_arm64="$(sum_for "node-v${node_version}-darwin-arm64.tar.gz")"
sha_darwin_x64="$(sum_for "node-v${node_version}-darwin-x64.tar.gz")"
sha_linux_x64="$(sum_for "node-v${node_version}-linux-x64.tar.gz")"
sha_linux_arm64="$(sum_for "node-v${node_version}-linux-arm64.tar.gz")"

cp "${template}" "${output}"

replace() {
  # $1: marker, $2: value. Uses | as sed delimiter since values here never contain it.
  sed -i.bak "s|$1|$2|g" "${output}"
  rm -f "${output}.bak"
}

replace "__YTCREATOR_VERSION__" "${version}"
replace "__NODE_VERSION__" "${node_version}"
replace "__SHA_RELEASE__" "${sha_release}"
replace "__SHA_NODE_DARWIN_ARM64__" "${sha_darwin_arm64}"
replace "__SHA_NODE_DARWIN_X64__" "${sha_darwin_x64}"
replace "__SHA_NODE_LINUX_X64__" "${sha_linux_x64}"
replace "__SHA_NODE_LINUX_ARM64__" "${sha_linux_arm64}"

chmod +x "${output}"
