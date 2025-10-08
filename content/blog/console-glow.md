---
title: "When the Console Glows"
slug: console-glow
author: m4xx3d0ut
summary: "Shaping the neon terminal aesthetic that defines Chaos & Majesty."
publishedAt: 2024-05-05
updatedAt: 2024-05-08
readingMinutes: 6
tags:
  - design
  - terminal
heroImage: assets/static/img/bunny-punx.webp
---

## Lighting the Grid

We wanted the interface to feel like a living console. That meant leaning into saturated greens, animated scanlines, and assets that react to cursor movement. The generator now ships with a CM-specific head partial so we can drop the terminal look onto any page without re-work.

### Palette Experiments

- Radiant phosphor (#64ffda)
- Deep void (#040606)
- Warning amber (#fcbf49)

Those combinations keep text legible while still feeling like an underground terminal.

### Asset Pipeline

`prepare-cm-files.sh` now syncs SVG and JS assets straight from `cm-source/`. That keeps artists and engineers aligned without handing off zip files.

> TL;DR: treat every page like a terminal window and the vibe carries itself.

