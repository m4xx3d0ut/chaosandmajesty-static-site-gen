# Blog Content Model

The blog feature pulls structured metadata and markdown content into the static build so we can power HTMX-driven navigation without a live application server. All data is source-controlled and rendered at build time by `static-sitegen`.

## Directory Layout

```
content/
  blog/
    <slug>.md        # Markdown body + YAML front matter per article

static-sitegen/templates/blog/
  index.ejs          # Blog landing page with post list + HTMX wiring
  post.ejs           # Standalone full page variant for non-JS fallback
  fragment.ejs       # Article-only snippet fetched via HTMX swaps
```

## Configuration (`smoke-test.yaml`)

```yaml
blog:
  enabled: true
  postsDir: content/blog
  fragmentsDir: blog/fragments
  outputDir: blog
  indexTemplate: blog/index.ejs
  postTemplate: blog/post.ejs
  fragmentTemplate: blog/fragment.ejs
  authors:
    - id: m4xx3d0ut
      name: "m4xx3d0ut"
      title: "Chaos Wrangler"
      avatar: "assets/static/img/authors/m4xx3d0ut.png"
      bio: "...
    - id: reneerules
      name: "Reneé Rules"
      title: "Majesty Maestro"
      avatar: "assets/static/img/authors/renee-rules.png"
      bio: "...
  index:
    heroTitle: "Chaos & Majesty Journal"
    heroTagline: "Dispatches from the underground"
    ctaLabel: "View latest"
```

### Post Front Matter

Each blog markdown file must start with a YAML block providing metadata:

```yaml
---
title: "When the Console Glows"
slug: console-glows
author: m4xx3d0ut
summary: "How we shaped the neon terminal aesthetic."
publishedAt: 2024-05-05
updatedAt: 2024-05-08
readingMinutes: 6
tags:
  - design
  - terminal
heroImage: assets/static/img/blog/console-glows.webp
---
```

- `author` references one of the configured author IDs.
- `publishedAt` drives sorting (newest first); `updatedAt` is optional.
- `readingMinutes` renders as “X min read”.
- The remainder of the file is markdown content rendered with `marked`.

## Generated Output

At build time we produce:

- `site-output/blog.html` – HTMX-enabled landing page.
- `site-output/blog/<slug>.html` – standalone article page, used for direct links and progressive enhancement.
- `site-output/blog/fragments/<slug>.html` – article body partial fetched by HTMX swaps.
- `site-output/blog/index.json` (optional future enhancement) could surface metadata for search.

All pages inherit the CM console styling and include `hx-push-url` interactions so navigation and history back/forward feel native.
