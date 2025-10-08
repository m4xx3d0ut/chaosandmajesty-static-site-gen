---
title: "Routing Majesty Signals"
slug: routing-majesty-signals
author: reneerules
summary: "A layered content strategy for dual personas and terminal UX."
publishedAt: 2024-05-12
readingMinutes: 7
tags:
  - architecture
  - content
heroImage: assets/static/img/bunny-punx.webp
---

## Personas in Stereo

Chaos and Majesty are two sides of the same console. We keep that duality alive by splitting content streams: Chaos pushes rapid-fire updates and experimental scripts, while Majesty carries the polished releases.

### Content Types

1. **Dispatches** – quick snippets, almost changelog style.
2. **Features** – long-form walkthroughs (like this one) that double as documentation.
3. **Signals** – short call-outs we embed directly into sections via YAML.

### YAML All the Way Down

The generator reads a single configuration file, so keeping personas straight means tracking them in metadata. Every post lives in `content/blog/` with front matter for author, tags, and publish dates. That powers listings, fragments, and future filters.

### What HTMX Unlocks

HTMX lets us keep the static output lean while still swapping between posts instantly. Each link fetches a fragment (`blog/fragments/<slug>.html`) and rewrites the article pane without losing keyboard focus or breaking the back button.

Stay tuned—next up is piping tag filters through `hx-vals` so you can jump between Chaos and Majesty with zero page reloads.
