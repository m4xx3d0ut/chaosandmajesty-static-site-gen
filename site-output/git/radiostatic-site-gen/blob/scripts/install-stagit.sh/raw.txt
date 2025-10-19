#!/usr/bin/env bash

# Strict mode
set -euo pipefail

# Installs stagit from source into /usr/local.
# Requires sudo privileges (GitHub-hosted and microk8s runners allow this).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAGIT_REF="master"
DEFAULT_REMOTES=(
  "git://git.codemadness.org/stagit"
  "git://git.2f30.org/stagit"
  "https://github.com/chaosandmajesty-mirrors/stagit.git"
  "https://github.com/rski/stagit.git"
)

if [[ -n "${STAGIT_REMOTE_OVERRIDE:-}" ]]; then
  DEFAULT_REMOTES=("${STAGIT_REMOTE_OVERRIDE}" "${DEFAULT_REMOTES[@]}")
fi

if command -v stagit >/dev/null 2>&1 && command -v stagit-index >/dev/null 2>&1; then
  exit 0
fi

echo "[install-stagit] Updating apt cache and installing build prerequisites" >&2
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends build-essential pkg-config libgit2-dev git ca-certificates curl

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

srcdir=""
export GIT_TERMINAL_PROMPT=0

for remote in "${DEFAULT_REMOTES[@]}"; do
  [[ -z "$remote" ]] && continue
  echo "[install-stagit] Cloning ${remote} (${STAGIT_REF})" >&2
  rm -rf "${tmpdir}/stagit"
  if [[ "$remote" == git://* ]]; then
    if git clone --depth 1 "$remote" "${tmpdir}/stagit"; then
      srcdir="${tmpdir}/stagit"
      break
    fi
  else
    if git clone --depth 1 --branch "${STAGIT_REF}" "$remote" "${tmpdir}/stagit"; then
      srcdir="${tmpdir}/stagit"
      break
    fi
    echo "[install-stagit] Branch clone failed for ${remote}; attempting default branch" >&2
    rm -rf "${tmpdir}/stagit"
    if git clone --depth 1 "$remote" "${tmpdir}/stagit"; then
      srcdir="${tmpdir}/stagit"
      break
    fi
  fi
  echo "[install-stagit] Clone failed for ${remote}; trying next mirror" >&2
done

if [[ -z "$srcdir" ]]; then
  for local_tar in "${SCRIPT_DIR}/stagit"/*.tar.gz; do
    [[ ! -f "$local_tar" ]] && continue
    echo "[install-stagit] Using bundled tarball ${local_tar}" >&2
    cp "$local_tar" "${tmpdir}/stagit.tar.gz"
    tar -xzf "${tmpdir}/stagit.tar.gz" -C "$tmpdir"
    srcdir="$(find "$tmpdir" -maxdepth 1 -type d -name 'stagit-*' -print -quit)"
    if [[ -n "$srcdir" ]]; then
      break
    fi
  done
fi

if [[ -z "$srcdir" ]]; then
  echo "[install-stagit] Falling back to tarball download" >&2
  tarball_urls=(
    "https://git.codemadness.org/stagit/snapshot/stagit-${STAGIT_REF}.tar.gz"
    "https://git.2f30.org/stagit/snapshot/stagit-${STAGIT_REF}.tar.gz"
    "https://codeload.github.com/chaosandmajesty-mirrors/stagit/tar.gz/refs/heads/${STAGIT_REF}"
    "https://codeload.github.com/rski/stagit/tar.gz/refs/heads/${STAGIT_REF}"
  )
  for url in "${tarball_urls[@]}"; do
    [[ -z "$url" ]] && continue
    if curl -fsSL "$url" -o "${tmpdir}/stagit.tar.gz"; then
      tar -xzf "${tmpdir}/stagit.tar.gz" -C "$tmpdir"
      srcdir="$(find "$tmpdir" -maxdepth 1 -type d -name 'stagit-*' -print -quit)"
      if [[ -n "$srcdir" ]]; then
        break
      fi
    fi
  done
fi

if [[ -z "$srcdir" ]]; then
  echo "[install-stagit] Unable to obtain stagit sources from any mirror or local cache" >&2
  exit 1
fi

cd "$srcdir"

echo "[install-stagit] Building stagit" >&2
make

echo "[install-stagit] Installing to /usr/local/bin" >&2
sudo make install

echo "[install-stagit] stagit installed at $(command -v stagit)" >&2
