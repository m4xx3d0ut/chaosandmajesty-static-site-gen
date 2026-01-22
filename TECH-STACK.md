# Tech Stack

## Overview
This repository is a Node.js-based static site generator and deployment bundle for the “Chaos & Majesty” site. It combines a custom generator (`static-sitegen/`), a Node-based RSS/SSE proxy (`rss-proxy/`), and an Nginx runtime container with optional WebDAV support. Content and configuration are YAML- and Markdown-driven and are rendered through EJS templates into the `site-output/` static bundle.

## Languages & Formats
- **JavaScript (ES modules)**: generator core, CLI, RSS proxy, local dev server.
- **Bash / POSIX shell**: build orchestration and asset preparation scripts.
- **YAML**: site configuration and data (`smoke-test.yaml`, `config/`).
- **Markdown**: content source (`content/`), blog posts, docs.
- **EJS**: HTML templating (`static-sitegen/templates/`).
- **HTML/CSS/JS**: generated output and frontend runtime assets.
- **Dockerfile / Compose / Nginx config**: containerized build + serving.

## Runtime & Tooling
- **Node.js**
  - Build/runtime containers use `node:20-slim` (see `Dockerfile`, `rss-proxy/Dockerfile`).
  - Smoke-test target uses `node:18-alpine` (see `Makefile`).
- **npm** for dependency installation (`package-lock.json`).
- **Git CLI** for repository mirroring and artifact extraction.
- **curl** for fetching external assets (e.g., DOOM wasm).
- **Python http.server** for lightweight local static serving.

## Node Dependencies (by package)
### Root `package.json` (top-level tooling)
- `chalk` `^5.3.0` — CLI output styling.
- `commander` `^11.0.0` — CLI argument parsing.
- `ejs` `^3.1.9` — template rendering.
- `fast-xml-parser` `^4.4.0` — RSS XML parsing.
- `fs-extra` `^11.1.1` — filesystem helpers.
- `js-yaml` `^4.1.0` — YAML parsing.
- `marked` `^9.1.0` — Markdown rendering.
- `sanitize-html` `^2.12.1` — RSS/HTML sanitization.
- `sharp` `^0.34.2` — image processing utilities.

### `static-sitegen/package.json` (generator engine)
- `chalk` `^4.1.2` — CLI output styling.
- `commander` `^9.4.0` — CLI argument parsing (used by `bin/sitegen.js`).
- `ejs` `^3.1.9` — HTML template rendering.
- `js-yaml` `^4.1.0` — YAML parsing.
- `marked` `^4.3.0` — Markdown to HTML.
- `sharp` `^0.34.2` — image utilities (`bin/parallax.js`).
- `yargs` `^17.7.2` — listed dependency (not currently referenced in `bin/`).

### `rss-proxy/package.json` (RSS/SSE proxy)
- `fast-xml-parser` `^4.4.0`
- `js-yaml` `^4.1.0`
- `sanitize-html` `^2.12.1`

## Static Site Generator (`static-sitegen/`)
### Core Pipeline
- **CLI entrypoint**: `static-sitegen/bin/sitegen.js` uses `commander` to parse `--config`, `--output`, and `--verbose`.
- **Config loading**: YAML parsing + normalization in `static-sitegen/lib/loadConfig.js` and `static-sitegen/lib/config.js`.
- **Rendering**: `static-sitegen/lib/generateSite.js` renders pages via EJS templates and injects generated HTML into `site-output/`.
- **Markdown**: `marked` converts Markdown content and front matter to HTML.
- **Assets**: recursive copy of assets into output; root files (`robots.txt`, `site.webmanifest`) copied when present.
- **Sitemap**: auto-generates `sitemap.html` with page/section/doc links.

### Blog + Content System
- **Blog**: Markdown posts in `content/blog/` support front matter and are rendered into HTML + fragments.
- **Sections**: YAML-defined sections generate `sections/<id>.html`.
- **Static docs**: Optional doc bundles can be copied into output and injected with a home link.

### Git Artifacts & Repo Browser
- **Repository metadata**: `static-sitegen/lib/gitArtifacts.js` uses the Git CLI to extract commit logs, refs, and file trees.
- **Generated artifacts**: per-repo HTML fragments, JSON commit data, raw file exports.
- **Manifest-driven**: repo list is pulled from `config/git/manifest.txt` and mirrored by `scripts/sync-git-manifest.sh`.

### RSS Generation
- **Local RSS**: `static-sitegen/lib/rssFeeds.js` builds a combined feed from blog posts and git commits.
- **External RSS**: optional external feeds parsed with `fast-xml-parser` and sanitized with `sanitize-html`.
- **Outputs**: `feeds/local.json`, `feeds/combined.json`, and `feeds/rss.xml` in `site-output/`.

### Image Utilities
- **Parallax tool**: `static-sitegen/bin/parallax.js` uses `sharp` to generate tiled, rounded-corner parallax images.

## Frontend Stack
- **CSS**: terminal-style theme in `cm.css`, fallback/alt styles in `modern.css`.
- **JavaScript**:
  - `cm.js` — terminal UI, contrast/toggle logic, DOOM integration hooks.
  - `cmLogo.js` — 3D SVG logo renderer (WebGL/Three.js).
- **Libraries via CDN**:
  - **HTMX** `1.9.12` + SSE extension (loaded in `templates/partials/cm-head.ejs`).
    - **Usage scope**: included on CM-headed pages, but primarily used for blog post fragment swapping (`templates/blog/index.ejs`) and RSS widget SSE refresh hooks (`templates/partials/rss-widget.ejs`). Additional HTMX event hooks rehydrate blog UI in `cm.js`.
  - **Three.js** `0.146.0` + `SVGLoader` for the 3D logo (`templates/partials/cm-image.ejs`).
- **Assets**: images/fonts under `cm-source/static/` → copied into `static-sitegen/assets/` by `prepare-cm-files.sh`.
- **Optional WASM**: DOOM wasm assets in `static-sitegen/assets/doom/` built/downloaded by `scripts/build-doom.sh`.

## RSS Proxy Service (`rss-proxy/`)
- **Node HTTP server** that exposes:
  - `/sse/feeds` for Server-Sent Events updates.
  - `/refresh` to force feed regeneration.
  - `/health` for health checks.
- **Uses** shared generator code (`static-sitegen/lib/rssFeeds.js`) to reuse feed logic.
- **Config**: environment-driven (`RSS_CONFIG_PATH`, `RSS_OUTPUT_DIR`, `RSS_REFRESH_INTERVAL`).

## Serving & Infrastructure
- **Nginx runtime**: `nginxinc/nginx-unprivileged:alpine` serves static output (`/usr/share/nginx/html`).
- **Nginx config** (`nginx/`):
  - SPA fallback (`try_files … /index.html`).
  - `/sse/feeds` reverse-proxy to `rss-proxy`.
  - `/git/*.git` static “dumb HTTP” Git clones.
  - Optional WebDAV (`/dav`) with `nginx-dav-ext` module.
  - Health endpoint at `/health`.
- **Docker build**:
  - Multi-stage build in `Dockerfile` (Node build → Nginx runtime).
  - Separate `rss-proxy/Dockerfile` for the RSS sidecar.
  - `Dockerfile.dev` runs both Nginx + rss-proxy via `supervisord` for local dev.
- **docker-compose**: `docker-compose.yml` wires `cm` (Nginx) + `rss-proxy`.

## Automation & Deployment
- **Makefile**: local build, dev server, Docker workflows, MicroK8s registry build/push.
- **Ansible**: `ansible/` playbooks deploy containers to a VPS via `community.docker`.
- **Shell scripts**:
  - `build-site.sh` — main build, git mirror sync, and output validation.
  - `prepare-cm-files.sh` — asset hydration into `static-sitegen/`.
  - `scripts/sync-git-manifest.sh` — clone/fetch git mirrors.
  - `scripts/export-git-http.sh` — generate bare HTTP clones in `site-output/git/`.
  - `scripts/serve-local-sse.mjs` — local static server with SSE proxy.

## Output Artifacts
- **Static site bundle**: `site-output/` with HTML pages, assets, and RSS XML (now under `feeds/rss.xml`).
- **Git fragments**: `site-output/git/<repo>/` + optional `.git` clones for HTTP access.
- **Feeds**: `site-output/feeds/*.json` and `site-output/feeds/rss.xml`.

## Testing
- `npm test` is currently a stub; `make test` runs inside a Node 18 container and reports if no tests are configured.
