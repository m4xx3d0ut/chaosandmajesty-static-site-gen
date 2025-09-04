# Static SiteGen

A Node.js static website generator that builds a complete static site from a single YAML configuration file.

---

## 1. How It Works

You describe your website structure, theme, pages, header, and content in a YAML file.
SiteGen reads the YAML, applies your choices, and outputs a ready-to-deploy static site with HTML and assets.

---

### SiteGen Capabilities & Features

* **YAML-Driven Configuration**

  * Define your entire site structure, theme, navigation, and content from a single YAML file

* **Markdown & HTML Content Support**

  * Write page and section content in Markdown or raw HTML
  * Automatic conversion of Markdown to HTML

* **Responsive Modern Design**

  * Built-in CSS for mobile-friendly, modern layouts
  * Supports light and dark mode with easy theming

* **Customizable Templates**

  * EJS-based templates for headers, footers, pages, and sections
  * Override templates or use the provided modern defaults

* **Parallax Background Support**

  * Easily add and customize parallax scrolling backgrounds to any page

* **Image & Asset Management**

  * Copy and reference local assets, images, and logos
  * Asset paths configurable via YAML

* **Navigation & Header Links**

  * Flexible navigation menu generated from YAML-defined links

* **SEO & Social Metadata**

  * Add meta tags for description, keywords, and social preview images
  * Google Analytics and tag manager integration

* **Section & Page System**

  * Mix standard pages and referenceable content sections
  * Generate individual HTML files for both pages and sections

* **Custom Call-to-Action (CTA) Blocks**

  * Easily add CTA buttons and banners to pages via YAML

* **Automatic Sitemap Generation**

  * Generates a sitemap with links to all pages and sections

* **Simple CLI Tool**

  * One-command static site generation (`sitegen config.yaml output_dir`)
  * Fast build for instant iteration

* **Asset & Directory Structure Management**

  * Copies and organizes all referenced assets for production-ready output

* **Extensible & Open Source**

  * Easily modify, extend, or integrate into your own build pipelines

---

## 2. Basic Usage

Install globally (or run locally):

```sh
npm install -g ./static-sitegen
```

Generate a site:

```sh
sitegen --config ./example.yaml --output ./site_output
```

* `--config` (`-c`): Path to your YAML site config.
* `--output` (`-o`): (optional) Output directory (default: `./dist`).
* `--verbose` (`-v`): Enable verbose logging.

---

## 3. YAML Configuration

The core of SiteGen is the YAML config.
**Example:**

```yaml
title: "c0r3 SiteGen"
description: "A modern static site generated from YAML!"
baseUrl: "/"
theme:
  mode: "dark"
  primary: "#1e40af"
  secondary: "#f59e42"
styles:
  - "assets/modern.css"
assets: "./assets"
logo: "assets/logo.svg"
header:
  links:
    - label: "Home"
      href: "/"
    - label: "Docs"
      href: "#docs"
    - label: "Contact"
      href: "contact.html"

pages:
  - title: "Contact"
    slug: "contact"
    content: |
      ## Get in touch
      Email us at [info@sitegen.dev](mailto:info@sitegen.dev)  
      Or use the form below.
    image: "assets/placeholder.jpg"

sections:
  - id: "docs"
    heading: "Documentation"
    content: |
      # Getting Started
      Use YAML to generate your entire site, including sections!
    image: "assets/placeholder.jpg"
    cta:
      label: "Get Started"
      href: "contact.html"

footer:
  text: "© 2025 c0r3 SiteGen"
  links:
    - label: "GitHub"
      href: "https://github.com/yourrepo"
```

---

## 4. Schema Reference

| Field          | Type   | Description                                                    |
| -------------- | ------ | -------------------------------------------------------------- |
| `title`        | string | The site title, shown in header and `<title>` tag              |
| `description`  | string | Short description, for SEO/meta                                |
| `theme`        | object | Site-wide theme settings (e.g., `mode: dark`)                  |
| `styles`       | array  | List of CSS files to include (relative to output/assets)       |
| `assets`       | string | Path to your assets directory (images, CSS, logo)              |
| `logo`         | string | Path to logo image, shown in header (optional)                 |
| `header.links` | array  | Links for the navigation bar. Each link: `{ label, href }`     |
| `pages`        | array  | Standalone pages. Each: `{ title, slug, content, image }`      |
| `sections`     | array  | Content sections. Each: `{ id, heading, content, image, cta }` |
| `footer.text`  | string | Text shown in the footer                                       |
| `footer.links` | array  | Footer links: `{ label, href }`                                |

**Notes:**

* `content` can be Markdown.
* `image` fields are optional and used for hero/section backgrounds or previews.
* `cta` in sections allows adding a "call to action" button (label + href).

---

## 5. Advanced Options

* **Templates:** Use your own EJS templates (default: `templates/base.ejs` and `templates/page.ejs`).
* **Custom Assets:** Place images, CSS, and SVGs in the `assets/` folder referenced by YAML.

---

## 6. Example Directory Layout

```
yourproject/
├── assets/
│   ├── logo.svg
│   └── placeholder.jpg
├── example.yaml
├── templates/
│   ├── base.ejs
│   └── page.ejs
```

---

## 7. CLI Options

```sh
sitegen --config ./example.yaml --output ./dist --verbose
```

---

## 8. See Also

* See `example.yaml` for a full working sample.
* Customization: edit or add templates under `templates/`.
* Assets: referenced by YAML path (relative to project root or assets folder).

---

## 9. YAML Tips

* Use `"./assets"` for the `assets` field to pick up images and CSS.
* `theme` supports `mode: dark` for dark mode out of the box.
* Markdown content is parsed automatically.
* Footer and header links can be to internal pages (`contact.html`), sections (`#about`), or external URLs.

---

## 10. Output

SiteGen will generate:

* `index.html` for your main page
* `sections/*.html` for each section
* Standalone pages as their own `.html`
* All CSS and assets copied into output
* A sitemap: `sitemap.html`

---

*See the code and template files for more advanced features!*

