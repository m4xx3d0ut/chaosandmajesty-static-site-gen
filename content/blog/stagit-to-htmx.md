---
title: "Retiring Stagit: Rebuilding the Git Page with HTMX"
slug: stagit-to-htmx
author: m4xx3d0ut
summary: "How the site moved from publishing upstream Stagit snapshots to serving an integrated, HTMX-powered Git explorer."
publishedAt: '2025-10-21'
readingMinutes: 7
tags:
- git
- htmx
- static-site
hidden: false
---

## TL;DR

- The first revision of the site shipped a Stagit export under `site-output/stagit/`, refreshed by an `update-stagit.sh` helper and linked from the main nav.
- The October 2025 `feat-stagit-101525` work dropped that mirror, taught `scripts/sync-git-manifest.sh` to hydrate local mirrors, and let `gitArtifacts.js` render commit, file, README, and ref fragments directly during the build.
- A single `git.ejs` + `git-layout.ejs` page now streams repositories over HTMX: search-as-you-type, tabbed panels, copyable clone commands, deep links down to individual lines, and consistent styling with the rest of the site.

## The Stagit era

When the static generator first went live we leaned on upstream Stagit binaries to produce a static Git mirror. The build pulled pre-rendered HTML into `site-output/stagit/`, wired the main navigation to `stagit/index.html`, and trusted Stagit’s own layout for commit logs, tree listings, and raw blobs. It was a quick win that proved we could host project history alongside the blog without running a Gitea instance in public.

### What worked

- Stagit gave us comprehensive coverage—log, commit detail, tree browsing, raw blob download, and tag indexes—with almost zero engineering time.
- Because the artifacts were plain HTML, we could publish them from the static generator and serve them straight from object storage or NGINX.
- An `update-stagit.sh` script kept the mirror current whenever we ran the deploy job.

### What hurt

- The UI never matched the rest of the site. Separate CSS, non-responsive tables, and duplicated header/footer fragments created a jarring transition away from the CM neon styling.
- Stagit is tied to one branch per export. Surfacing prod, dev, and feature branches meant copying multiple directories or accepting stale mirrors.
- There was no inline search, filtering, or navigation awareness. Readers had to hunt through long tables or leave the page altogether.
- Accessibility and interop suffered—tab order, ARIA labels, and mobile gestures were outside our control.

## Designing the replacement

The new pipeline starts with `config/git/manifest.txt`, a six-field manifest that lists the repositories, branches, and metadata we want to display. `scripts/sync-git-manifest.sh` mirrors each entry into `tmp/git-mirrors/`, supporting shallow fetches, optional URL rewrites, and a `--strict` mode for CI. From there, `gitArtifacts.js` shells out to `git log`, walks commit trees, and renders a bundle of fragments per repository:

- `index.html` for the default log view and summary cards.
- `full.html` and `files.html` for the expanded commit history and tree explorer.
- `readme.html`, rendered through `marked`, so each repo can surface its README inline.
- `refs.html` and `commits.json` for branches, tags, and machine-readable history.

Because the generator owns these fragments, they pick up the same design tokens, typography, and accessibility hooks as the rest of the site. The static site output now ships under `site-output/git/<repo>/...`, eliminating the duplicated `stagit/` directory entirely.

## HTMX in the front end

`static-sitegen/templates/git.ejs` wraps the fragments in a single page, and `partials/git-layout.ejs` wires the client-side experience with plain JavaScript and a few well-placed `hx-` calls. Highlights:

- A searchable repository list that filters on name, owner, stage (prod/dev), and description as you type.
- Tabbed panels (`Log`, `Files`, `README`, `Refs`) that swap in the correct fragment without a full reload. The log panel streams the first ten commits (matching `DEFAULT_INITIAL_LOG_LIMIT`) and exposes a one-click “expand” action for the full history.
- The file explorer uses native `<details>` disclosure widgets, fetches blob previews on demand, and remembers deep links so `#repo=...&blob=...&line=...` still highlights the right code.
- Clone commands, raw file bodies, and line permalinks all ship with copy-to-clipboard helpers and visual feedback bubbles.
- Sidebars collapse automatically on small breakpoints, keyboard focus is preserved after swaps, and the active repository name stays in sync with history state.

Under the hood the page works without JavaScript—every fragment renders as a full HTML document—HTMX just swaps the pieces to keep navigation fast.

## What improved overall

- **Consistent branding:** The git experience now uses the same Orbitron/Audiowide typography, neon palette, and container widths as home, blog, and terminal pages.
- **Less drift:** We build from live mirrors instead of copying Stagit exports by hand, so the site can ship with dozens of repositories without manual intervention.
- **Better ergonomics:** Readers can stay on one page to hop between repos, skim commit metadata, open READMEs, or inspect a single file.
- **More surface area for tooling:** Because `commits.json` is part of the build, future automation (RSS feeds, changelog rollups, search indexing) can originate from the same artifacts.

## What’s next

The HTMX rewrite gets us a maintainable baseline, but there is headroom: inline diffs, commit-to-commit comparisons, and bundle-size budgets for the JS glue are all on deck. For now, the git page finally feels like it belongs to the rest of the site—and we can retire the Stagit crutch for good.
