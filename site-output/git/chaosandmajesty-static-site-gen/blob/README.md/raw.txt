# Chaos & Majesty Static SiteGen

A Node.js static website generator that builds complete static "Chaos & Majesty" site from YAML configuration with specialized support for terminal-style interfaces and interactive console themes.

---

## 🚀 Quick Start

```bash
# 1. Prepare your static assets (one-time setup)
./prepare-cm-files.sh [source-directory]

# 2. Build your site
./build-site.sh

# 3. Deploy from site-output/
```

Your site is ready at `site-output/` with all assets, HTML files, and proper structure.

---

## 🎯 What Makes This Different

Unlike generic static site generators, this system is purpose-built for:

* **Terminal/Console Themed Sites** - Built-in support for retro terminal aesthetics
* **Interactive Console Elements** - Real terminal-like input/output interfaces  
* **3D Logo Integration** - Three.js powered 3D SVG logo rendering
* **Specialized Asset Pipeline** - Handles complex asset relationships and dependencies
* **Production-Ready Builds** - Comprehensive validation and error handling

---

## 📁 Project Structure

```
├── build-site.sh              # Main build script
├── prepare-cm-files.sh        # Asset preparation (one-time)
├── smoke-test.yaml            # Site configuration
├── content/                   # Markdown content files
├── data/                      # YAML data files
├── static-sitegen/            # Generator engine
│   ├── bin/sitegen.js         # CLI tool
│   ├── lib/                   # Core modules (ES6)
│   ├── templates/             # EJS templates
│   └── assets/                # Development assets
└── site-output/               # Generated site (deploy this)
```

---

## 🔧 Core Features

### **YAML-Driven Configuration**
Define your entire site structure, theme, navigation, and content from a single YAML file.

### **Terminal Console Interface**
Built-in support for interactive terminal-style interfaces with:
- Real-time command input/output
- Customizable terminal themes
- Shell-like interaction patterns

### **3D Logo Rendering**
Integrated Three.js support for 3D SVG logo rendering:
- Automatic SVG loading and processing
- Configurable 3D transformations
- Fallback to static images

### **Advanced Asset Management**
- Intelligent asset copying and organization
- Consistent path resolution for root and section pages
- Support for complex asset dependencies
- Automatic CSS/JS minification ready

## 📄 License Notes

The Chaos & Majesty site generator sources are distributed under the terms
described in individual files. Bundled DOOM engine assets binary (`doom.wasm`)
and corresponding patches are licensed under GPL-2.0-or-later; see `COPYING`,
`docs/doom.md`, and `static-sitegen/assets/doom/` for provenance and rebuild
instructions.

### **Robust Build System**
- ES6 module architecture throughout
- Comprehensive error handling and validation
- Build verification with proper exit codes
- Development and production modes

### **Flexible Content System**
- **Pages**: Standalone HTML files (`contact.html`, `about.html`)
- **Sections**: Referenceable content blocks with anchor links
- **Markdown Support**: Automatic conversion to HTML
- **Mixed Content**: Combine Markdown and raw HTML

---

## 📝 YAML Configuration

### Basic Example (`smoke-test.yaml`):

```yaml
title: "Chaos & Majesty"
description: "Terminal interface for the digital underground"
baseUrl: "/"

# Terminal theme configuration
cmTitle: "CHAOS & MAJESTY"
cmTagline: "Welcome to the machine"
cmFooterText: "Warning! Chaosandmajesty.com accepts no responsibility for your interactions with WOPR."
use3DLogo: true

# Asset configuration
assets: "./assets"
styles:
  - "assets/static/style/cm.css"

# Navigation
header:
  links:
    - label: "Home"
      href: "/"
    - label: "Blog" 
      href: "blog.html"
    - label: "About"
      href: "#about"

# Content pages
pages:
  - title: "Blog"
    slug: "blog"
    content: |
      # Latest Posts
      Check back for updates from the digital underground.

# Content sections  
sections:
  - id: "about"
    heading: "About the System"
    content: |
      ## Digital Archaeology
      Exploring the intersection of chaos and majesty in cyberspace.
    cta:
      label: "Enter System"
      href: "#console"

footer:
  text: "© 2025 Chaos & Majesty"
```

---

## 🛠️ Build Process

### 1. **Asset Preparation** (One-time setup)
```bash
# Copy assets from source directory to build environment
./prepare-cm-files.sh cm-source

# Or from a different source
./prepare-cm-files.sh ../backup/static-files
```

This copies:
- Static assets (`js/`, `css/`, `img/`)
- Root files (`robots.txt`, `site.webmanifest`)
- Template partials (auto-generated)

### 2. **Site Generation**
```bash
# Full build with validation
./build-site.sh

# Manual build (advanced)
cd static-sitegen
node bin/sitegen.js --config ../smoke-test.yaml --output ../site-output --verbose
```

### 3. **Build Validation**
The build system automatically validates:
- ✅ All required files generated
- ✅ Assets copied to correct locations  
- ✅ HTML files have proper structure
- ✅ Asset paths resolve correctly
- ✅ No broken internal links

---

## 🎨 Customization

### **Templates** (`static-sitegen/templates/`)
- `layout.ejs` - Base HTML structure
- `partials/cm-head.ejs` - HTML head with assets
- `partials/cm-console.ejs` - Terminal interface
- `partials/cm-footer.ejs` - Footer content

### **Styling** (`static-sitegen/assets/static/style/`)
- `cm.css` - Main terminal theme stylesheet
- Supports CSS custom properties for theming
- Mobile-responsive design included

### **JavaScript** (`static-sitegen/assets/static/js/`)
- `cm.js` - Terminal interface logic
- `cmLogo.js` - 3D logo rendering (Three.js)
- Modular, extensible architecture

---

## 📋 Schema Reference

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Site title (HTML `<title>` and header) |
| `description` | string | Meta description for SEO |
| `cmTitle` | string | Terminal console title |
| `cmTagline` | string | Console tagline/subtitle |
| `use3DLogo` | boolean | Enable 3D SVG logo rendering |
| `assets` | string | Path to assets directory |
| `styles` | array | CSS files to include |
| `header.links` | array | Navigation menu items |
| `pages` | array | Standalone pages |
| `sections` | array | Content sections with anchors |
| `footer` | object | Footer configuration |

---

## 🔍 Advanced Features

### **Section Navigation**
Sections generate both:
- Anchor links on main page (`#section-id`)
- Individual HTML files (`sections/section-id.html`)

### **Asset Path Resolution**
Automatic path handling for:
- Root pages: `assets/static/style/cm.css`
- Section pages: `../assets/static/style/cm.css`

### **3D Logo System**
```yaml
use3DLogo: true  # Enables Three.js 3D rendering
cmImage: "assets/static/img/logo.png"  # Fallback image
```

### **Terminal Console**
Interactive terminal interface with:
- Command input/output simulation
- Customizable prompt and responses
- Retro terminal styling

---

## 🚀 Deployment

The generated `site-output/` directory contains:
```
site-output/
├── index.html              # Main page
├── blog.html              # Generated pages  
├── sections/              # Section pages
│   └── about.html
├── assets/               # All static assets
│   ├── static/
│   │   ├── style/cm.css
│   │   ├── js/cm.js
│   │   └── img/
│   ├── robots.txt
│   └── site.webmanifest
└── sitemap.html          # Site navigation
```

Deploy this directory to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

---

## 🧪 Development

### **Local Development**
```bash
# Watch for changes (if implemented)
npm run dev

# Manual rebuild
./build-site.sh

# Serve locally
cd site-output && python -m http.server 8000
```

### **Testing**
```bash
# Validate build output
./build-site.sh  # Includes validation

# Check asset paths
find site-output -name "*.html" -exec grep -l "assets/" {} \;
```

---

## 🔧 CLI Options

```bash
# Basic usage
sitegen --config config.yaml --output dist/

# With options
sitegen --config smoke-test.yaml --output site-output --verbose

# Help
sitegen --help
```

**Options:**
- `--config` (`-c`): YAML configuration file
- `--output` (`-o`): Output directory (default: `./dist`)
- `--verbose` (`-v`): Enable detailed logging

---

## 🎯 Use Cases

Perfect for:
- **Developer portfolios** with terminal aesthetics
- **Tech blogs** with retro computing themes  
- **Project documentation** with interactive elements
- **Digital art galleries** with 3D logo integration
- **Corporate sites** needing terminal-style interfaces

---

## 🔄 Migration from Other Generators

Coming from Jekyll/Hugo/Gatsby? Key differences:
- **Single YAML config** instead of multiple config files
- **Built-in terminal theme** instead of generic templates
- **Integrated 3D rendering** instead of plugin dependencies
- **Asset pipeline** handles complex dependencies automatically

---

## 📚 Examples

See working examples:
- `smoke-test.yaml` - Full-featured terminal site
- `content/` - Markdown content examples
- `data/` - YAML data file examples

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Test your changes (`./build-site.sh`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

---

## 📄 License

MIT © 2025 - Build amazing terminal-themed static sites with ease.

---

*Ready to build something chaotic and majestic? Start with `./prepare-cm-files.sh` and `./build-site.sh`!*
