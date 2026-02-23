#!/bin/sh

set -e  # Exit on any error

echo "Building site with sitegen..."

# Output directory (override for alternate builds)
SITE_OUTPUT_DIR="${SITE_OUTPUT_DIR:-site-output}"

if [ "${ENABLE_DOOM_BUILD:-0}" != "0" ]; then
    if [ -x "scripts/build-doom.sh" ]; then
        echo "Preparing DOOM wasm assets (ENABLE_DOOM_BUILD enabled)..."
        if ! ./scripts/build-doom.sh; then
            echo "Warning: DOOM assets could not be prepared. Continuing build without them." >&2
        fi
    else
        echo "Warning: scripts/build-doom.sh missing; skipping DOOM asset build." >&2
    fi
fi

# Prepare Git manifest mirrors so the Git page has local data to render.
MANIFEST_PATH="${GIT_MANIFEST_PATH:-config/git/manifest.txt}"
SITEGEN_GIT_MIRRORS_DIR="${SITEGEN_GIT_MIRRORS_DIR:-tmp/git-mirrors}"
export SITEGEN_GIT_MIRRORS_DIR

if [ "${SKIP_GIT_MANIFEST_SYNC:-0}" != "1" ]; then
    if [ -f "$MANIFEST_PATH" ]; then
        echo "Syncing Git manifest repositories..."
        if ! ./scripts/sync-git-manifest.sh -m "$MANIFEST_PATH" -o "$SITEGEN_GIT_MIRRORS_DIR"; then
            echo "Warning: Unable to fully sync Git manifest repositories; continuing with available data." >&2
        fi
    else
        echo "Warning: Git manifest not found at ${MANIFEST_PATH}; skipping repository sync." >&2
    fi
else
    echo "Skipping Git manifest sync (SKIP_GIT_MANIFEST_SYNC=${SKIP_GIT_MANIFEST_SYNC})."
fi

# Ensure the pinned default repository branch is available locally when using
# the working tree override (prevents missing refs when CI clones a single branch).
PINNED_REPO_BRANCH="${PINNED_REPO_BRANCH:-prod}"
PINNED_REPO_REMOTE="${PINNED_REPO_REMOTE:-origin}"
PINNED_REPO_FETCH_DEPTH="${PINNED_REPO_FETCH_DEPTH:-200}"
if [ -d ".git" ] && [ -n "$PINNED_REPO_BRANCH" ]; then
    if git rev-parse --verify "refs/heads/${PINNED_REPO_BRANCH}" >/dev/null 2>&1 || \
       git rev-parse --verify "refs/remotes/${PINNED_REPO_REMOTE}/${PINNED_REPO_BRANCH}" >/dev/null 2>&1; then
        :
    else
        echo "Fetching ${PINNED_REPO_REMOTE}/${PINNED_REPO_BRANCH} for pinned Git fragments..."
        if ! git fetch "$PINNED_REPO_REMOTE" "$PINNED_REPO_BRANCH" --depth "$PINNED_REPO_FETCH_DEPTH"; then
            echo "Warning: Unable to fetch ${PINNED_REPO_REMOTE}/${PINNED_REPO_BRANCH}; pinned repository refs may be incomplete." >&2
        fi
    fi
fi

# Check if config file exists
if [ ! -f "smoke-test.yaml" ]; then
    echo "Error: smoke-test.yaml not found"
    exit 1
fi

# Run the site generator
./static-sitegen/bin/sitegen.js -c smoke-test.yaml -o "$SITE_OUTPUT_DIR" -v

# Export shallow HTTP clones for Git repos so nginx can serve /git/<repo>.git
if [ "${EXPORT_GIT_HTTP_CLONES:-1}" = "1" ]; then
    if [ -f "$MANIFEST_PATH" ]; then
        echo "Exporting HTTP-friendly Git mirrors..."
        if ! ./scripts/export-git-http.sh --manifest "$MANIFEST_PATH" --source "$SITEGEN_GIT_MIRRORS_DIR" --output "$SITE_OUTPUT_DIR/git"; then
            echo "Warning: Unable to export HTTP Git mirrors; clones may fail over HTTPS." >&2
        fi
    else
        echo "Warning: Git manifest not found; skipping HTTP Git export."
    fi
else
    echo "Skipping HTTP Git export (EXPORT_GIT_HTTP_CLONES=${EXPORT_GIT_HTTP_CLONES})."
fi

# Validate critical files exist
echo "Validating build output..."
if [ ! -f "$SITE_OUTPUT_DIR/index.html" ]; then
    echo "Error: index.html not generated"
    exit 1
fi

if [ ! -d "$SITE_OUTPUT_DIR/assets" ]; then
    echo "Error: assets directory not copied"
    exit 1
fi

echo "Site build completed successfully!"
echo "Generated files:"
find "$SITE_OUTPUT_DIR" -type f | head -10
