#!/bin/sh

set -e  # Exit on any error

echo "Building site with sitegen..."

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
MANIFEST_PATH="${GIT_MANIFEST_PATH:-config/stagit/manifest.txt}"
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

# Check if config file exists
if [ ! -f "smoke-test.yaml" ]; then
    echo "Error: smoke-test.yaml not found"
    exit 1
fi

# Run the site generator
./static-sitegen/bin/sitegen.js -c smoke-test.yaml -o site-output -v

# Validate critical files exist
echo "Validating build output..."
if [ ! -f "site-output/index.html" ]; then
    echo "Error: index.html not generated"
    exit 1
fi

if [ ! -d "site-output/assets" ]; then
    echo "Error: assets directory not copied"
    exit 1
fi

echo "Site build completed successfully!"
echo "Generated files:"
find site-output -type f | head -10
