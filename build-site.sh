#!/bin/sh

set -e  # Exit on any error

echo "Building site with sitegen..."

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

