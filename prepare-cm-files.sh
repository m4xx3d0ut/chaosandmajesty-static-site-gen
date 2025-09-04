#!/bin/bash
# prepare-cm-files.sh
# One-time setup: copies static and template files from a source directory to static-sitegen/ for development.
# Usage: ./prepare-cm-files.sh [source-dir]
# Default source-dir is 'cm-source'
# DO NOT RUN before every build; this is for initial setup or re-sync only!

set -e

SOURCE_DIR="${1:-cm-source}"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source directory '$SOURCE_DIR' does not exist"
    echo "Usage: $0 [source-directory]"
    exit 1
fi

echo "Preparing static-sitegen working directories from '$SOURCE_DIR'..."

# Create necessary directories if they don't exist
mkdir -p static-sitegen/assets/static/js
mkdir -p static-sitegen/assets/static/style
mkdir -p static-sitegen/assets/static/img
mkdir -p static-sitegen/templates/partials

# Copy static files from source into static-sitegen/assets for development
if [ -d "$SOURCE_DIR/static/js" ]; then
    echo "Copying JS files from $SOURCE_DIR/static/js/..."
    cp -v "$SOURCE_DIR/static/js"/*.js static-sitegen/assets/static/js/ 2>/dev/null || echo "No JS files found in $SOURCE_DIR/static/js/"
fi

if [ -d "$SOURCE_DIR/static/style" ]; then
    echo "Copying CSS files from $SOURCE_DIR/static/style/..."
    cp -v "$SOURCE_DIR/static/style"/*.css static-sitegen/assets/static/style/ 2>/dev/null || echo "No CSS files found in $SOURCE_DIR/static/style/"
    
    # Create symlink for cm.css if it exists
    if [ -f "static-sitegen/assets/static/style/cm.css" ]; then
        rm -f static-sitegen/assets/cm.css
        ln -sf static/style/cm.css static-sitegen/assets/cm.css
    fi
fi

if [ -d "$SOURCE_DIR/static/img" ]; then
    echo "Copying image files from $SOURCE_DIR/static/img/..."
    cp -v "$SOURCE_DIR/static/img"/* static-sitegen/assets/static/img/ 2>/dev/null || echo "No image files found in $SOURCE_DIR/static/img/"
fi

# Copy root files if they exist
echo "Copying root files from $SOURCE_DIR/..."
for file in robots.txt site.webmanifest; do
    if [ -f "$SOURCE_DIR/$file" ]; then
        cp -v "$SOURCE_DIR/$file" static-sitegen/assets/
        echo "Copied $file"
    else
        echo "Skipping $file (not found in $SOURCE_DIR)"
    fi
done

# Copy any additional files from project root that should be in the build
echo "Copying additional files from project root..."
for file in bunny-punx.svg paperman.svg cmLogo.js paperman.js; do
    if [ -f "$file" ]; then
        # Determine destination based on file type
        case "$file" in
            *.svg)
                cp -v "$file" static-sitegen/assets/static/img/
                echo "Copied $file to static/img/"
                ;;
            *.js)
                cp -v "$file" static-sitegen/assets/static/js/
                echo "Copied $file to static/js/"
                ;;
        esac
    fi
done

# Create/overwrite template partials (unchanged)
echo "Creating template partials..."

cat > static-sitegen/templates/partials/cm-head.ejs << 'EOL'
<!-- head partial (auto-generated) -->
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=0.7, user-scalable=no, user-scalable=0"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik+Iso&display=swap" rel="stylesheet">
<link rel="stylesheet" type="text/css" href="<%= isSection ? '../assets/static/style/cm.css' : 'assets/static/style/cm.css' %>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne+Mono&display=swap" rel="stylesheet">
<script type="text/javascript" src="<%= isSection ? '../assets/static/js/cm.js' : 'assets/static/js/cm.js' %>"></script>
<link rel="manifest" href="<%= isSection ? '../site.webmanifest' : 'site.webmanifest' %>"/>
<link rel="icon" type="image/x-icon" href="<%= isSection ? '../assets/static/img/favicon.ico' : 'assets/static/img/favicon.ico' %>">
EOL

cat > static-sitegen/templates/partials/cm-console.ejs << 'EOL'
<!-- console partial (auto-generated) -->
<div class="console-center">
  <div id="tagline">
    <h1><%= page.cmTitle || site.cmTitle || site.title %></h1>
    <p><%= page.cmTagline || site.cmTagline || site.description %></p>
  </div>

  <% if (page.use3DLogo || site.use3DLogo) { %>
    <div id="cm-logo-container" class="center" style="width:100%; height:300px; position:relative; z-index:1;"></div>
    <!-- Use the same CDN sources as in the test page -->
    <script src="https://cdn.jsdelivr.net/npm/three@0.146.0/build/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.146.0/examples/js/loaders/SVGLoader.js"></script>
    <script>
      window.cmLogoSvgPath = '<%= isSection ? "../assets" : "assets" %>/static/img/bunny-punx.svg';
    </script>
    <script src="<%= isSection ? '../assets/static/js/cmLogo.js' : 'assets/static/js/cmLogo.js' %>"></script>
  <% } else if (page.cmImage || site.cmImage) { %>
    <div>
      <img src="<%= isSection ? '../' + (page.cmImage || site.cmImage) : (page.cmImage || site.cmImage) %>"
           alt="<%= page.cmImageAlt || site.cmImageAlt || 'Main image' %>" class="center">
    </div>
  <% } %>

  <div id="console">
    <div class="screen hscroll" id="tOut">$</div>
    <input class="term" type="text" id="uIn" autofocus>
  </div>
</div>
EOL

cat > static-sitegen/templates/partials/cm-footer.ejs << 'EOL'
<!-- footer partial (auto-generated) -->
<div id="foot">
  <p>
    <center>
      <%= page.cmFooterText || site.cmFooterText || 'Warning! Chaosandmajesty.com accepts no responsibility for your interactions with WOPR.' %>
    </center>
  </p>
</div>
EOL

echo "Done! Files copied from '$SOURCE_DIR' to static-sitegen/"
echo "Ready to build with static-sitegen/bin/sitegen.js"
