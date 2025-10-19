# HTMX Blog Rendering Project Plan

## Objectives
- Deliver an interactive blog experience using HTMX while preserving the fully static build pipeline.
- Keep the existing YAML-driven content model and Node-based generator as the source of truth.
- Maintain progressive enhancement: all content should remain reachable through standard links without HTMX.

## Current State
- `smoke-test.yaml` defines a single `blog` page stub that today renders static markdown into `site-output/blog.html`.
- Templates in `static-sitegen/templates/` do not currently emit HTMX attributes or partial fragments.
- FEAT.md outlines best practices for an HTMX-first architecture that we can adapt to a static-generation workflow (fetching pre-rendered HTML instead of server-side fragments).

## Step-by-Step Plan
1. **Scope & Content Audit**
   - Review the existing blog page configuration inside `smoke-test.yaml` and any related markdown assets.
   - Confirm requirements for metadata (author, publish date, tags) and desired UX (inline article view, modal, dedicated page).
   - Capture open questions (pagination, tagging, comments) before implementation.

2. **Define Blog Content Model**
   - Decide on source-of-truth files (`content/blog/<slug>.md` plus front-matter or YAML entries).
   - Extend the configuration schema (`static-sitegen/lib/config.js` if needed) to load blog metadata and associate markdown bodies.
   - Document the model in FEAT.md or a new `docs/blog-model.md`.

3. **Template & Generator Enhancements**
   - Introduce dedicated EJS templates: `templates/blog/index.ejs`, `templates/blog/post.ejs`, and `templates/blog/partials/post-body.ejs`.
   - Update `generateSite.js` to:
     * Build a blog index page with post listings.
     * Emit standalone static post pages (`blog/<slug>.html`) for non-JS fallback.
     * Emit HTMX-friendly fragments (e.g., `blog/fragments/<slug>.html`) that contain only the article body.
   - Ensure sitemap generation links to the canonical post pages.

4. **Embed HTMX Library & Wiring**
   - Add the HTMX script to the shared head partial (`templates/partials/cm-head.ejs`) with integrity hashing and local fallback.
   - Confirm the script load respects existing console-themed layout.

5. **Interactive Blog Index UX**
   - Update the blog index template to:
     * Render the first article body server-side for immediate content.
     * Use `hx-get` to fetch fragment URLs, targeting a content container (`#blog-article`).
     * Apply `hx-push-url="true"` so URL updates reflect the selected post.
   - Provide loading indicator handling (`hx-indicator`) matching site styling.

6. **Progressive Enhancement & Fallbacks**
   - Ensure each post title remains a normal `<a href="blog/<slug>.html">` link so navigation works without HTMX.
   - Add a `noscript` notice if desired, but keep the experience functional when HTMX is absent.

7. **Build & Local Testing Pipeline**
   - Extend `build-site.sh` smoke checks to verify new fragment files exist.
   - Create targeted QA instructions (e.g., `make serve-local` then navigate between posts; confirm history/back button behavior).
   - Plan exploratory testing for mobile and console-themed layout regressions.

8. **Documentation & Examples**
   - Update README quick-start with new directories (`content/blog/`, `blog/fragments/`).
   - Expand FEAT.md (or a new doc) with HTMX fragment usage patterns specific to our static build.
   - Provide a sample blog post illustrating front-matter and markdown conventions.

9. **Future Enhancements (Optional Roadmap)**
   - Add pagination and tag filtering with `hx-select`/`hx-vals` support.
   - Consider lightweight search (pre-built JSON + HTMX requests) or comment integrations.
   - Evaluate hydration-free analytics or telemetry for blog interactions.

## Open Questions
- Do we need author bios or listing pages at launch?
- Are we targeting deployment on a CDN that supports custom headers required by HTMX history cache (e.g., caching fragment responses)?
- Should we introduce tests under a new `tests/` directory or rely on manual QA for the first iteration?
