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

strip_suffix() {
  local value="${1:-}"
  local suffix="${2:-}"
  if [[ -n "$suffix" && "$value" == *"$suffix" ]]; then
    printf '%s' "${value%"$suffix"}"
  else
    printf '%s' "$value"
  fi
}

prune_refs_except() {
  local gitdir="$1"
  local prefix="$2"
  local keep="$3"
  local ref

  while IFS= read -r ref; do
    [[ "$ref" == "$keep" ]] && continue
    git --git-dir="$gitdir" update-ref -d "$ref"
  done < <(git --git-dir="$gitdir" for-each-ref --format='%(refname)' "$prefix")
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

copy_asset() {
  local src="$1"
  local dest="$2"

  if [[ ! -f "$src" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" && ! -L "$dest" ]] && cmp -s "$src" "$dest"; then
    return 0
  fi

  rm -f "$dest"
  cp -f "$src" "$dest"
}

sed_escape() {
  local str="${1//\\/\\\\}"
  str="${str//&/\\&}"
  printf '%s' "$str"
}

PUBLIC_HTTP_BASE="$(strip "${STAGIT_PUBLIC_HTTP_BASE:-}")"
if [[ -n "$PUBLIC_HTTP_BASE" ]]; then
  PUBLIC_HTTP_BASE="${PUBLIC_HTTP_BASE%/}"
fi
PUBLIC_LOGO_URL="$(strip "${STAGIT_PUBLIC_LOGO_URL:-/assets/static/img/not-dead.webp}")"
PUBLIC_CLONE_BASE="$(strip "${STAGIT_PUBLIC_CLONE_BASE:-}")"
if [[ -n "$PUBLIC_CLONE_BASE" ]]; then
  PUBLIC_CLONE_BASE="${PUBLIC_CLONE_BASE%/}"
fi
PUBLIC_CLONE_SUFFIX="${STAGIT_PUBLIC_CLONE_SUFFIX:-}"
HTTP_CLONE_BASE="$(strip "${STAGIT_HTTP_CLONE_BASE:-}")"
if [[ -z "$HTTP_CLONE_BASE" ]]; then
  HTTP_CLONE_BASE="$HTMLBASE"
fi
if [[ -n "$HTTP_CLONE_BASE" ]]; then
  HTTP_CLONE_BASE="${HTTP_CLONE_BASE%/}"
fi
HTTP_CLONE_SUFFIX="${STAGIT_HTTP_CLONE_SUFFIX:-.git}"

rewrite_logo_in_file() {
  local file="$1"

  [[ -f "$file" ]] || return 0
  [[ -n "$PUBLIC_LOGO_URL" ]] || return 0

  local logo_url_escaped
  logo_url_escaped="$(sed_escape "$PUBLIC_LOGO_URL")"

  sed -i \
    -e "s@src=\"logo.png\"@src=\"${logo_url_escaped}\"@g" \
    -e "s@src='logo.png'@src='${logo_url_escaped}'@g" \
    -e "s@href=\"logo.png\"@href=\"${logo_url_escaped}\"@g" \
    -e "s@href='logo.png'@href='${logo_url_escaped}'@g" \
    "$file"
}

rewrite_logo_in_tree() {
  local root="$1"
  [[ -d "$root" ]] || return 0
  [[ -n "$PUBLIC_LOGO_URL" ]] || return 0

  while IFS= read -r -d '' file; do
    rewrite_logo_in_file "$file"
  done < <(find "$root" -type f -name '*.html' -print0)
}

rewrite_clone_url_in_tree() {
  local root="$1"
  local clone_url="$2"
  local remote_url="$3"
  [[ -d "$root" ]] || return 0
  [[ -n "$clone_url" ]] || return 0
  [[ -n "$remote_url" ]] || return 0

  while IFS= read -r -d '' file; do
    python3 - "$file" "$remote_url" "$clone_url" <<'PY'
import sys
path, old_url, new_url = sys.argv[1:]
with open(path, 'r', encoding='utf-8') as fh:
    original = fh.read()

updated = original.replace(old_url, new_url)

if updated != original:
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(updated)
PY
  done < <(find "$root" -type f -name '*.html' -print0)
}

update_root_index_stylesheet() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  sed -i \
    -e "s@href=\"style.css\"@href=\"_assets/style.css\"@g" \
    -e "s@href='style.css'@href='_assets/style.css'@g" \
    "$file"
}

sync_http_clone_repo() {
  local src="$1"
  local dest="$2"
  local dest_dir tmpdest

  [[ -n "$HTTP_CLONE_BASE" ]] || return 0
  [[ -n "$dest" ]] || return 1

  if [[ "$dest" == "$HTTP_CLONE_BASE" ]]; then
    log "Refusing to sync HTTP clone to base path '$dest'"
    return 1
  fi

  dest_dir="$(dirname "$dest")"
  mkdir -p "$dest_dir"

  tmpdest="${dest}.tmp.$$"
  rm -rf "$tmpdest"

  if ! cp -a "$src" "$tmpdest"; then
    log "Failed to copy bare repo for HTTP clone: $src -> $tmpdest"
    rm -rf "$tmpdest"
    return 1
  fi

  if ! git --git-dir="$tmpdest" update-server-info; then
    log "git update-server-info failed for $tmpdest"
    rm -rf "$tmpdest"
    return 1
  fi

  rm -rf "$dest"
  mv "$tmpdest" "$dest"
  log "Exported HTTP clone to $dest"
}

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

  remote_url="$(rewrite_url "$url")"

  if [[ -z "$remote_url" ]]; then
    log "Skipping manifest entry with empty url"
    continue
  fi

  if [[ -z "$name" ]]; then
    name="$(basename "$remote_url")"
    name="${name%.git}"
  fi

  if [[ -z "$branch" ]]; then
    branch='main'
  fi

  if [[ -z "$description" ]]; then
    description="$name"
  fi

  public_url=''
  clone_url=''

  if [[ -n "$homepage" ]]; then
    public_url="$homepage"
  elif [[ -n "$PUBLIC_HTTP_BASE" ]]; then
    public_url="$PUBLIC_HTTP_BASE/$name"
  else
    public_url="$remote_url"
  fi

  if [[ -n "$PUBLIC_CLONE_BASE" ]]; then
    clone_url="$PUBLIC_CLONE_BASE/$name$PUBLIC_CLONE_SUFFIX"
  elif [[ -n "$PUBLIC_HTTP_BASE" ]]; then
    clone_url="$PUBLIC_HTTP_BASE/$name"
  else
    clone_url="$remote_url"
  fi

  desired["$name"]=1

  bare="$REPOBASE/$name.git"
  out="$HTMLBASE/$name"
  clone_export=''
  if [[ -n "$HTTP_CLONE_BASE" ]]; then
    clone_export="$HTTP_CLONE_BASE/$name$HTTP_CLONE_SUFFIX"
  fi

  if [[ ! -d "$bare" ]]; then
    log "Cloning $remote_url (branch $branch) -> $bare"
    if ! git clone --bare --single-branch --branch "$branch" "$remote_url" "$bare"; then
      log "Failed to clone $remote_url"
      continue
    fi
  fi

  if ! git --git-dir="$bare" remote set-url origin "$remote_url"; then
    log "Failed to update remote URL for $name"
  fi
  git --git-dir="$bare" config --unset remote.origin.mirror 2>/dev/null || true
  git --git-dir="$bare" config --unset-all remote.origin.fetch 2>/dev/null || true
  git --git-dir="$bare" config remote.origin.fetch "+refs/heads/$branch:refs/heads/$branch"
  git --git-dir="$bare" config remote.origin.tagOpt --no-tags

  if ! git --git-dir="$bare" fetch --prune --no-tags origin; then
    log "Failed to fetch updates for $name"
    continue
  fi

  prune_refs_except "$bare" "refs/heads" "refs/heads/$branch"
  prune_refs_except "$bare" "refs/remotes/origin" "refs/remotes/origin/$branch"
  if ! git --git-dir="$bare" gc --prune=now; then
    log "git gc failed for $name"
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
  printf '%s\n' "$public_url" > "$bare/url"
  printf '%s\n' "$clone_url" > "$bare/cloneurl"

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

      rewrite_logo_in_tree "$out"
      rewrite_clone_url_in_tree "$out" "$clone_url" "$remote_url"

      mkdir -p "$ASSETSDIR"
      for asset in "${SHARED_ASSETS[@]}"; do
        [[ -z "$asset" ]] && continue
        if [[ -f "$ASSETSDIR/$asset" ]]; then
          copy_asset "$ASSETSDIR/$asset" "$out/$asset"
        fi
      done

      if [[ -n "$clone_export" ]]; then
        if [[ "$clone_export" == "$out" ]]; then
          log "Skipping HTTP clone export for $name due to destination conflict ($clone_export)"
        elif ! sync_http_clone_repo "$bare" "$clone_export"; then
          log "Failed to export HTTP clone for $name"
        fi
      fi

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

for asset in "${SHARED_ASSETS[@]}"; do
  [[ -z "$asset" ]] && continue
  if [[ -f "$ASSETSDIR/$asset" ]]; then
    copy_asset "$ASSETSDIR/$asset" "$HTMLBASE/$asset"
  fi
done

if [[ -f "$ASSETSDIR/style.css" ]]; then
  copy_asset "$ASSETSDIR/style.css" "$HTMLBASE/style.css"
fi

shopt -s nullglob
for dir in "$HTMLBASE"/*; do
  base="$(basename "$dir")"
  [[ "$base" == '_assets' ]] && continue
  if [[ -n "$HTTP_CLONE_BASE" && "$dir" == "$HTTP_CLONE_BASE"/*"$HTTP_CLONE_SUFFIX" ]]; then
    continue
  fi
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

if [[ -n "$HTTP_CLONE_BASE" ]]; then
  shopt -s nullglob
  for clone_dir in "$HTTP_CLONE_BASE"/*; do
    [[ -d "$clone_dir" ]] || continue
    clone_base="$(basename "$clone_dir")"
    canonical="$(strip_suffix "$clone_base" "$HTTP_CLONE_SUFFIX")"
    if [[ -z "${desired[$canonical]:-}" ]]; then
      log "Removing stale HTTP clone $clone_dir"
      rm -rf "$clone_dir"
    fi
  done
  shopt -u nullglob
fi

shopt -s nullglob
repos=("$REPOBASE"/*.git)
shopt -u nullglob

if (( ${#repos[@]} )); then
  tmp_index="$HTMLBASE/index.html.tmp"
  if stagit-index "${repos[@]}" > "$tmp_index"; then
    mv "$tmp_index" "$HTMLBASE/index.html"
    rewrite_logo_in_file "$HTMLBASE/index.html"
    update_root_index_stylesheet "$HTMLBASE/index.html"
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
  rewrite_logo_in_file "$HTMLBASE/index.html"
  update_root_index_stylesheet "$HTMLBASE/index.html"
  log "No repositories mirrored; wrote placeholder index"
fi

log "Stagit update complete (processed $processed repositories)"
