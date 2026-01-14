#!/usr/bin/env bash

# Synchronise repositories listed in the Git manifest so the static generator
# can hydrate the Git page without depending on external Stagit output.

set -euo pipefail

DEFAULT_MANIFEST="config/git/manifest.txt"
DEFAULT_OUTPUT="tmp/git-mirrors"
DEFAULT_DEPTH="${SYNC_GIT_MANIFEST_DEPTH:-200}"
STRICT_MODE="${SYNC_GIT_MANIFEST_STRICT:-0}"
REWRITE_RULES="${SYNC_GIT_MANIFEST_URL_REWRITE:-}"

usage() {
  cat <<'EOF'
sync-git-manifest.sh [options]

Fetches or clones repositories defined in the Git manifest so the static site
generator can build local fragments for the Git page.

Options:
  -m, --manifest <path>   Path to manifest file (default: config/git/manifest.txt)
  -o, --output <dir>      Destination directory for mirrors (default: tmp/git-mirrors)
  -d, --depth <n>         Shallow clone depth (default: 200 or $SYNC_GIT_MANIFEST_DEPTH)
  -r, --rewrite <rules>   Comma-separated prefix rewrites (from=>to,from2=>to2)
  -s, --strict            Fail the script if any repository fails to sync
  -h, --help              Show this help message
EOF
}

slugify() {
  local input=$1
  local slug
  slug=$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g')
  if [ -z "$slug" ]; then
    slug="repo"
  fi
  printf '%s' "$slug"
}

declare -a REWRITE_PAIRS=()

parse_rewrite_rules() {
  local rules=$1
  if [ -z "$rules" ]; then
    return
  fi
  IFS=',' read -r -a raw_rules <<<"$rules"
  for raw in "${raw_rules[@]}"; do
    if [ -z "$raw" ]; then
      continue
    fi
    if [[ "$raw" != *"=>"* ]]; then
      echo "[sync-git-manifest] WARN: ignoring malformed rewrite '${raw}'" >&2
      continue
    fi
    local from=${raw%%=>*}
    local to=${raw#*=>}
    REWRITE_PAIRS+=("$from" "$to")
  done
}

rewrite_url() {
  local value=$1
  local i=0
  local length=${#REWRITE_PAIRS[@]}
  while [ "$i" -lt "$length" ]; do
    local from=${REWRITE_PAIRS[$i]}
    local to=${REWRITE_PAIRS[$((i + 1))]}
    if [ -n "$from" ] && [[ "$value" == "$from"* ]]; then
      value="${to}${value#$from}"
      break
    fi
    i=$((i + 2))
  done
  printf '%s' "$value"
}

MANIFEST="$DEFAULT_MANIFEST"
OUTPUT_DIR="$DEFAULT_OUTPUT"
CLONE_DEPTH="$DEFAULT_DEPTH"

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--manifest)
      MANIFEST=$2
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR=$2
      shift 2
      ;;
    -d|--depth)
      CLONE_DEPTH=$2
      shift 2
      ;;
    -r|--rewrite)
      REWRITE_RULES=$2
      shift 2
      ;;
    -s|--strict)
      STRICT_MODE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$MANIFEST" ]; then
  echo "[sync-git-manifest] Manifest not found at $MANIFEST – skipping." >&2
  exit 0
fi

parse_rewrite_rules "$REWRITE_RULES"

mkdir -p "$OUTPUT_DIR"

warn_or_exit() {
  local message=$1
  if [ "${STRICT_MODE:-0}" = "1" ]; then
    echo "[sync-git-manifest] ERROR: $message" >&2
    exit 1
  fi
  echo "[sync-git-manifest] WARN: $message" >&2
}

line_no=0
while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  line_no=$((line_no + 1))
  # Trim surrounding whitespace
  line=$(printf '%s' "$raw_line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  if [ -z "$line" ] || [ "${line#\#}" != "$line" ]; then
    continue
  fi

  IFS='|' read -r ssh_url branch name owner description homepage <<<"$line"

  if [ -z "${ssh_url:-}" ] || [ -z "${branch:-}" ] || [ -z "${name:-}" ]; then
    warn_or_exit "Skipping malformed entry on line $line_no (expected six fields)."
    continue
  fi

  sync_url=$(rewrite_url "$ssh_url")

  slug=$(slugify "$name")
  repo_dir="$OUTPUT_DIR/$slug"

  echo "[sync-git-manifest] Syncing ${name} (${branch}) → ${repo_dir}"

  if [ -d "$repo_dir/.git" ]; then
    if ! git -C "$repo_dir" remote set-url origin "$sync_url"; then
      warn_or_exit "Failed to update remote URL for ${name}."
      continue
    fi
    if ! git -C "$repo_dir" fetch --depth "$CLONE_DEPTH" origin "refs/heads/$branch:refs/remotes/origin/$branch"; then
      warn_or_exit "git fetch failed for ${name}."
      continue
    fi
    if ! git -C "$repo_dir" checkout "$branch" >/dev/null 2>&1; then
      if ! git -C "$repo_dir" checkout -B "$branch" "origin/$branch" >/dev/null 2>&1; then
        warn_or_exit "Unable to check out branch ${branch} for ${name}."
        continue
      fi
    fi
    if ! git -C "$repo_dir" reset --hard "origin/$branch" >/dev/null 2>&1; then
      warn_or_exit "git reset failed for ${name}."
      continue
    fi
  else
    tmp_dir="${repo_dir}.tmp.$$"
    rm -rf "$tmp_dir"
    if ! git clone --depth "$CLONE_DEPTH" --single-branch --branch "$branch" "$sync_url" "$tmp_dir"; then
      rm -rf "$tmp_dir"
      warn_or_exit "git clone failed for ${name}."
      continue
    fi
    mv "$tmp_dir" "$repo_dir"
  fi
done < "$MANIFEST"

exit 0
