#!/usr/bin/env bash
set -euo pipefail

REPOLIST="${STAGIT_REPOLIST:-./manifest.txt}"
REPOBASE="${STAGIT_REPOBASE:-./repos}"
HTMLBASE="${STAGIT_HTMLBASE:-./html}"
ASSETSDIR="${STAGIT_ASSETSDIR:-${HTMLBASE}/_assets}"
SHARED_ASSETS_STR="${STAGIT_SHARED_ASSETS:-style.css logo.png favicon.png}"
IFS=' ' read -r -a SHARED_ASSETS <<< "$SHARED_ASSETS_STR"

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

strip() {
  local value="${1:-}"
  value="${value#${value%%[!$' \t']*}}"
  value="${value%${value##*[!$' \t']}}"
  printf '%s' "$value"
}

URL_REWRITE_SPEC="${STAGIT_URL_REWRITE:-}"
declare -A URL_REWRITE_MAP=()

if [[ -n "$URL_REWRITE_SPEC" ]]; then
  IFS=',' read -r -a _rewrite_pairs <<< "$URL_REWRITE_SPEC"
  for raw_pair in "${_rewrite_pairs[@]}"; do
    pair="$(strip "$raw_pair")"
    [[ -z "$pair" ]] && continue
    if [[ "$pair" == *'=>'* ]]; then
      from="$(strip "${pair%%=>*}")"
      to="$(strip "${pair#*=>}")"
      [[ -z "$from" || -z "$to" ]] && continue
      URL_REWRITE_MAP["$from"]="$to"
    fi
  done
  unset _rewrite_pairs
fi

rewrite_url() {
  local original="${1:-}"
  if (( ${#URL_REWRITE_MAP[@]} )); then
    for from in "${!URL_REWRITE_MAP[@]}"; do
      if [[ "$original" == "$from"* ]]; then
        local candidate="${URL_REWRITE_MAP[$from]}${original#"$from"}"
        if [[ "$candidate" != "$original" ]]; then
          log "Rewriting URL '$original' -> '$candidate'"
        fi
        printf '%s' "$candidate"
        return
      fi
    done
  fi
  printf '%s' "$original"
}

require_binary() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Required binary '$1' not found in PATH"
    exit 1
  fi
}

require_binary git
require_binary stagit
require_binary stagit-index

mkdir -p "$REPOBASE" "$HTMLBASE" "$ASSETSDIR"

if [[ ! -f "$REPOLIST" ]]; then
  log "Manifest $REPOLIST not found; nothing to mirror"
  exit 0
fi

declare -A desired=()
processed=0

while IFS= read -r raw; do
  line="${raw%%#*}"
  if [[ -z "${line//[[:space:]]/}" ]]; then
    continue
  fi

  IFS='|' read -r url branch name owner description homepage <<< "$line"

  url="$(strip "$url")"
  branch="$(strip "${branch:-}")"
  name="$(strip "${name:-}")"
  owner="$(strip "${owner:-}")"
  description="$(strip "${description:-}")"
  homepage="$(strip "${homepage:-}")"

  url="$(rewrite_url "$url")"

  if [[ -z "$url" ]]; then
    log "Skipping manifest entry with empty url"
    continue
  fi

  if [[ -z "$name" ]]; then
    name="$(basename "$url")"
    name="${name%.git}"
  fi

  if [[ -z "$branch" ]]; then
    branch='main'
  fi

  if [[ -z "$description" ]]; then
    description="$name"
  fi

  desired["$name"]=1

  bare="$REPOBASE/$name.git"
  out="$HTMLBASE/$name"

  if [[ ! -d "$bare" ]]; then
    log "Cloning $url -> $bare"
    if ! git clone --mirror "$url" "$bare"; then
      log "Failed to clone $url"
      continue
    fi
  fi

  if ! git --git-dir="$bare" remote set-url origin "$url"; then
    log "Failed to update remote URL for $name"
  fi

  if ! git --git-dir="$bare" fetch --prune --tags origin; then
    log "Failed to fetch updates for $name"
    continue
  fi

  if ! git --git-dir="$bare" show-ref --verify --quiet "refs/heads/$branch"; then
    log "Branch $branch not found in $name; removing generated output"
    rm -rf "$out"
    continue
  fi

  if ! git --git-dir="$bare" symbolic-ref HEAD "refs/heads/$branch"; then
    log "Unable to set HEAD for $name; removing generated output"
    rm -rf "$out"
    continue
  fi

  printf '%s\n' "$description" > "$bare/description"
  printf '%s\n' "$owner" > "$bare/owner"
  if [[ -n "$homepage" ]]; then
    printf '%s\n' "$homepage" > "$bare/url"
  else
    printf '%s\n' "$url" > "$bare/url"
  fi

  tmpdir="$(mktemp -d)"
  if [[ ! -d "$tmpdir" ]]; then
    log "Failed to allocate temporary directory for $name"
    continue
  fi

  if pushd "$tmpdir" >/dev/null 2>&1; then
    if stagit "$bare"; then
      popd >/dev/null 2>&1
      mkdir -p "$out"
      find "$out" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      cp -a "$tmpdir"/. "$out"/
      rm -rf "$tmpdir"

      mkdir -p "$ASSETSDIR"
      for asset in "${SHARED_ASSETS[@]}"; do
        [[ -z "$asset" ]] && continue
        if [[ -f "$ASSETSDIR/$asset" ]]; then
          ln -snf "../_assets/$asset" "$out/$asset"
        fi
      done

      log "Rendered $name ($branch)"
      processed=$((processed + 1))
    else
      popd >/dev/null 2>&1
      log "stagit rendering failed for $name"
      rm -rf "$tmpdir"
      continue
    fi
  else
    log "Failed to enter temporary directory for $name"
    rm -rf "$tmpdir"
    continue
  fi

done < "$REPOLIST"

shopt -s nullglob
for dir in "$HTMLBASE"/*; do
  base="$(basename "$dir")"
  [[ "$base" == '_assets' ]] && continue
  if [[ -z "${desired[$base]:-}" ]]; then
    log "Removing stale HTML directory $dir"
    rm -rf "$dir"
  fi
done

for repo_dir in "$REPOBASE"/*.git; do
  base="$(basename "$repo_dir" .git)"
  if [[ -z "${desired[$base]:-}" ]]; then
    log "Removing stale mirror $repo_dir"
    rm -rf "$repo_dir"
  fi
done
shopt -u nullglob

shopt -s nullglob
repos=("$REPOBASE"/*.git)
shopt -u nullglob

if (( ${#repos[@]} )); then
  tmp_index="$HTMLBASE/index.html.tmp"
  if stagit-index "${repos[@]}" > "$tmp_index"; then
    mv "$tmp_index" "$HTMLBASE/index.html"
    log "Updated stagit index"
  else
    rm -f "$tmp_index"
    log "Failed to rebuild stagit index"
  fi
else
  cat > "$HTMLBASE/index.html" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Source Archives</title>
    <link rel="stylesheet" href="./_assets/style.css" />
  </head>
  <body>
    <header>
      <h1>Source Archives</h1>
      <p>No repositories are mirrored yet. Add entries to the manifest.</p>
    </header>
  </body>
</html>
HTML
  log "No repositories mirrored; wrote placeholder index"
fi

log "Stagit update complete (processed $processed repositories)"
