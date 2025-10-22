#!/usr/bin/env bash
# Rebuilds the GPL-licensed DOOM wasm artefact with Binaryen optimisation.
#
# Requires:
#   - curl, tar, git, make, cargo, rustup (with wasm32-unknown-unknown target)
#   - A copy of the shareware doom1.wad (set DOOM_WAD_PATH=/path/to/doom1.wad)
#
# Optional env vars:
#   BINARYEN_VERSION (default: version_119)
#   BINARYEN_ARCH    (default: x86_64-linux)
#   DOOM_UPSTREAM_REPO (default: https://github.com/diekmann/wasm-fizzbuzz.git)
#   DOOM_COMMIT (default: 51a7030bea563d96027301a36619c17347b9270d)
#   DOOM_PATCH (default: static-sitegen/assets/doom/patches/0001-chaos-and-majesty-doom-wasm.patch)
#   DOOM_OUTPUT (default: static-sitegen/assets/doom/doom.wasm)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: missing required command '$1'" >&2
    exit 1
  }
}

require curl
require tar
require git
require make
require cargo

if ! rustup target list --installed | grep -q 'wasm32-unknown-unknown'; then
  echo "[doom-rebuild] installing rust target wasm32-unknown-unknown"
  rustup target add wasm32-unknown-unknown
fi

BINARYEN_VERSION="${BINARYEN_VERSION:-version_119}"
BINARYEN_ARCH="${BINARYEN_ARCH:-x86_64-linux}"
locate_binaryen_dir() {
  local candidates=(
    "${REPO_ROOT}/tmp/binaryen-${BINARYEN_VERSION}-${BINARYEN_ARCH}"
    "${REPO_ROOT}/tmp/binaryen-${BINARYEN_VERSION}"
  )
  for candidate in "${candidates[@]}"; do
    if [ -x "${candidate}/bin/wasm-opt" ]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

BINARYEN_BASENAME="binaryen-${BINARYEN_VERSION}-${BINARYEN_ARCH}"
BINARYEN_URL="https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/${BINARYEN_BASENAME}.tar.gz"

mkdir -p "${REPO_ROOT}/tmp"

if ! BINARYEN_DIR="$(locate_binaryen_dir)"; then
  echo "[doom-rebuild] fetching Binaryen (${BINARYEN_URL})"
  ARCHIVE="${REPO_ROOT}/tmp/${BINARYEN_BASENAME}.tar.gz"
  curl -L --fail -o "${ARCHIVE}" "${BINARYEN_URL}"
  tar -xf "${ARCHIVE}" -C "${REPO_ROOT}/tmp"
fi

BINARYEN_DIR="$(locate_binaryen_dir)"
if [ -z "${BINARYEN_DIR}" ]; then
  echo "error: Binaryen directory with wasm-opt not found after extraction" >&2
  exit 1
fi

BINARYEN_BIN="${BINARYEN_DIR}/bin"
PATH="${BINARYEN_BIN}:$PATH"
export PATH

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "error: wasm-opt not found after Binaryen installation" >&2
  exit 1
fi

DOOM_UPSTREAM_REPO="${DOOM_UPSTREAM_REPO:-https://github.com/diekmann/wasm-fizzbuzz.git}"
DOOM_COMMIT="${DOOM_COMMIT:-51a7030bea563d96027301a36619c17347b9270d}"
DOOM_PATCH="${DOOM_PATCH:-${REPO_ROOT}/static-sitegen/assets/doom/patches/0001-chaos-and-majesty-doom-wasm.patch}"
DOOM_OUTPUT="${DOOM_OUTPUT:-${REPO_ROOT}/static-sitegen/assets/doom/doom.wasm}"
DOOM_WAD_PATH="${DOOM_WAD_PATH:-}"

if [ -z "${DOOM_WAD_PATH}" ] || [ ! -f "${DOOM_WAD_PATH}" ]; then
  echo "error: DOOM_WAD_PATH must point to an existing doom1.wad shareware file" >&2
  exit 1
fi

if [ ! -f "${DOOM_PATCH}" ]; then
  echo "error: patch file not found: ${DOOM_PATCH}" >&2
  exit 1
fi

BUILD_DIR="${REPO_ROOT}/tmp/wasm-fizzbuzz-build"
rm -rf "${BUILD_DIR}"

echo "[doom-rebuild] cloning ${DOOM_UPSTREAM_REPO}"
git clone "${DOOM_UPSTREAM_REPO}" "${BUILD_DIR}"

cd "${BUILD_DIR}/doom"
git checkout "${DOOM_COMMIT}"

echo "[doom-rebuild] applying Chaos & Majesty patch"
git apply "${DOOM_PATCH}"

echo "[doom-rebuild] copying doom1.wad"
cp "${DOOM_WAD_PATH}" doom1.wad

echo "[doom-rebuild] building doom.wasm"
make doom.wasm

install -d "$(dirname "${DOOM_OUTPUT}")"
cp doom.wasm "${DOOM_OUTPUT}"

echo "[doom-rebuild] build complete -> ${DOOM_OUTPUT}"
sha256sum "${DOOM_OUTPUT}"
