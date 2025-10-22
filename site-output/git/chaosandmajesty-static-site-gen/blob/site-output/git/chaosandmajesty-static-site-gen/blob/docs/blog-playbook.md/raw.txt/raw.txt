# Blog Playbook

A quick reference for maintaining the Chaos & Majesty blog, adding authors, and shipping new posts with the HTMX-enhanced experience.

## 1. Verify Author Access
1. Open `smoke-test.yaml` and locate the `blog.authors` list.
2. If the writer already appears there, note their `id` (e.g., `m4xx3d0ut`).
3. To add a new author:
   - Append an entry with a unique `id`, `name`, optional `title`, `avatar`, `bio`, and `social` links.
   - Use repository-relative paths for avatars (e.g., `assets/static/img/authors/chaos.png`).
   - Commit the asset to `static-sitegen/assets/static/img/` (or ensure `cm-source` supplies it), then re-run `./prepare-cm-files.sh` if needed.

## 2. Create the Markdown Source
1. Inside `content/blog/`, copy an existing file or create `<slug>.md`.
2. Populate the YAML front matter:
   ```yaml
   ---
   title: "Console Resonance"
   slug: console-resonance
   author: m4xx3d0ut
   summary: "Why the prompt should hum when you start typing."
   publishedAt: 2024-06-01
   readingMinutes: 5
   tags:
     - audio
     - ux
   heroImage: assets/static/img/blog/console-resonance.webp
   ---
   ```
3. Write the body in Markdown below the front matter. You can embed code fences, quotes, and headings freely; the generator converts it with `marked`.
4. Optional fields:
   - `updatedAt`: ISO date string if you revise later.
   - `seoDescription`: override summary for meta tags.

## 3. Local Build & Preview
1. Run `./build-site.sh` to regenerate `site-output/`.
2. Browse `site-output/blog.html` to confirm:
   - The new post appears in the sidebar list with the right metadata.
   - Clicking the post fetches `/blog/fragments/<slug>.html` (watch the network panel) and swaps in the article pane.
   - The browser URL updates to `/blog/<slug>.html` and direct navigation works without JavaScript.
3. Serve the output for live validation: `make serve-local` (opens at `http://localhost:8080`).

## 4. Author & Asset Tips
- Keep author bios short; the card renders beneath each article.
- Prefer `.webp` for hero images to keep the static bundle light.
- Shared art belongs in `cm-source/`. After updating that directory, run `./prepare-cm-files.sh` so assets sync into `static-sitegen/assets/` for future builds.

## 5. HTMX Workflow Notes
- Fragment paths live under `site-output/blog/fragments/`; ensure they are deployed with the rest of the static site so live swaps succeed.
- Because links are standard `<a>` tags, the blog still works without HTMX (progressive enhancement).
- If you tweak template HTML, rebuild and inspect both `blog.html` and the per-post pages (`site-output/blog/<slug>.html`) to maintain parity.

## 6. Pull Request Checklist
- Include the new Markdown file(s) and any assets.
- Show the diff for `smoke-test.yaml` if author metadata changed.
- Paste the final `./build-site.sh` output in the PR description.
- Optional: attach screenshots or a short GIF demonstrating the HTMX swap for reviewers.

The system remains configuration-first: keep metadata in YAML, prose in Markdown, and let the generator handle HTML output and interactivity.
