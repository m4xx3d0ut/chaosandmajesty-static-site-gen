#!/usr/bin/env bash
# builds the DOOM wasm assets expected by the console minigame
#
# usage:
#   ./scripts/build-doom.sh [--force]
#
# By default this script downloads the published wasm artefact from
# https://diekmann.github.io/wasm-fizzbuzz/doom/.
#
# Set DOOM_WASM_URL to override the download source, or DOOM_SOURCE_DIR to copy
# from a local checkout (containing a built doom.wasm). See docs/doom.md for
# the full build instructions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSET_DIR="$REPO_ROOT/static-sitegen/assets/doom"
FORCE=0

if [[ ${1:-} == "--force" ]]; then
  FORCE=1
fi

mkdir -p "$ASSET_DIR"

ASSET_FILES=(doom.wasm)

missing=()
for f in "${ASSET_FILES[@]}"; do
  if [[ ! -f "$ASSET_DIR/$f" ]]; then
    missing+=("$f")
  fi
done

if [[ ${#missing[@]} -eq 0 && $FORCE -eq 0 ]]; then
  echo "[doom] assets already exist in $ASSET_DIR (use --force to overwrite)"
  exit 0
fi

SOURCE_DIR=${DOOM_SOURCE_DIR:-""}
WASM_URL=${DOOM_WASM_URL:-"https://diekmann.github.io/wasm-fizzbuzz/doom/doom.wasm"}

copy_from_dir() {
  local dir="$1"
  echo "[doom] copying assets from $dir -> $ASSET_DIR"
  for f in "${ASSET_FILES[@]}"; do
    if [[ -f "$dir/$f" ]]; then
      cp "$dir/$f" "$ASSET_DIR/$f"
    else
      echo "[doom] warning: missing $f in source; continuing" >&2
    fi
  done
}

if [[ -n "$SOURCE_DIR" ]]; then
  if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "[doom] DOOM_SOURCE_DIR does not exist: $SOURCE_DIR" >&2
    exit 1
  fi

  CANDIDATES=(
    "$SOURCE_DIR"
    "$SOURCE_DIR/dist/doom"
    "$SOURCE_DIR/doom"
  )
  SOURCE_FOUND=""
  for dir in "${CANDIDATES[@]}"; do
    if [[ -f "$dir/doom.wasm" ]]; then
      SOURCE_FOUND="$dir"
      break
    fi
  done
  if [[ -z "$SOURCE_FOUND" ]]; then
    echo "[doom] could not find doom.wasm in $SOURCE_DIR or known subdirectories." >&2
    exit 1
  fi
  copy_from_dir "$SOURCE_FOUND"
else
  tmp="$(mktemp)"
  echo "[doom] downloading wasm from $WASM_URL"
  if ! curl -L --fail --output "$tmp" "$WASM_URL"; then
    echo "[doom] download failed" >&2
    rm -f "$tmp"
    exit 1
  fi
  mv "$tmp" "$ASSET_DIR/doom.wasm"
fi

echo "[doom] done"
