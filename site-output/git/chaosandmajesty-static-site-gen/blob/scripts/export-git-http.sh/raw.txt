#!/usr/bin/env bash

# Create bare, shallow HTTP clones for repos listed in the Git manifest.
# This allows "git clone https://…/git/<slug>.git" against the static site.

set -euo pipefail

DEFAULT_MANIFEST="config/git/manifest.txt"
DEFAULT_SOURCE_DIR="tmp/git-mirrors"
DEFAULT_DEST_DIR="site-output/git"
DEFAULT_DEPTH="${GIT_HTTP_EXPORT_DEPTH:-${SYNC_GIT_MANIFEST_DEPTH:-200}}"
STRICT_MODE="${GIT_HTTP_EXPORT_STRICT:-0}"

usage() {
  cat <<'EOF'
export-git-http.sh [options]

Creates bare, shallow clones suitable for dumb-HTTP Git access based on
repositories defined in the manifest.

Options:
  -m, --manifest <path>   Path to manifest file (default: config/git/manifest.txt)
      --source <dir>      Directory containing working mirrors (default: tmp/git-mirrors)
  -o, --output <dir>      Destination directory for bare HTTP clones (default: site-output/git)
  -d, --depth <n>         History depth for exported clones
  -s, --strict            Fail fast if any repo cannot be exported
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

warn_or_exit() {
  local message=$1
  if [ "${STRICT_MODE:-0}" = "1" ]; then
    echo "[export-git-http] ERROR: $message" >&2
    exit 1
  fi
  echo "[export-git-http] WARN: $message" >&2
}

MANIFEST="$DEFAULT_MANIFEST"
SOURCE_DIR="$DEFAULT_SOURCE_DIR"
DEST_DIR="$DEFAULT_DEST_DIR"
CLONE_DEPTH="$DEFAULT_DEPTH"

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--manifest)
      MANIFEST=$2
      shift 2
      ;;
    --source)
      SOURCE_DIR=$2
      shift 2
      ;;
    -o|--output)
      DEST_DIR=$2
      shift 2
      ;;
    -d|--depth)
      CLONE_DEPTH=$2
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
  echo "[export-git-http] Manifest not found at $MANIFEST – skipping."
  exit 0
fi

if [ ! -d "$SOURCE_DIR" ]; then
  warn_or_exit "Source directory $SOURCE_DIR does not exist."
  exit 0
fi

mkdir -p "$DEST_DIR"

line_no=0
while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  line_no=$((line_no + 1))
  line=$(printf '%s' "$raw_line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  if [ -z "$line" ] || [ "${line#\#}" != "$line" ]; then
    continue
  fi

  IFS='|' read -r _ branch name _ _ _ <<<"$line"
  if [ -z "${name:-}" ] || [ -z "${branch:-}" ]; then
    warn_or_exit "Skipping malformed entry on line $line_no (expected branch and name)."
    continue
  fi

  slug=$(slugify "$name")
  source_repo="$SOURCE_DIR/$slug"
  if [ ! -d "$source_repo/.git" ]; then
    warn_or_exit "Mirror not found for ${name} at ${source_repo}."
    continue
  fi

  dest_repo="$DEST_DIR/${slug}.git"
  tmp_repo="${dest_repo}.tmp.$$"
  rm -rf "$tmp_repo"

  echo "[export-git-http] Exporting ${name} (${branch}) → ${dest_repo}"
  if ! git clone --bare --no-local --single-branch --branch "$branch" --depth "$CLONE_DEPTH" "$source_repo" "$tmp_repo" >/dev/null 2>&1; then
    rm -rf "$tmp_repo"
    warn_or_exit "Failed to export bare clone for ${name}."
    continue
  fi

  if ! git --git-dir="$tmp_repo" update-server-info >/dev/null 2>&1; then
    rm -rf "$tmp_repo"
    warn_or_exit "git update-server-info failed for ${name}."
    continue
  fi

  rm -rf "$dest_repo"
  mv "$tmp_repo" "$dest_repo"
done < "$MANIFEST"

exit 0
