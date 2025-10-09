import { promises as fs } from 'fs';
import path from 'path';
import { marked } from 'marked';
import * as ejs from 'ejs';
import yaml from 'js-yaml';

// Default template for when no template is found
const DEFAULT_TEMPLATE = `
<!DOCTYPE html>\
<html lang="en">\
<head>\
    <meta charset="UTF-8">\
    <meta name="viewport" content="width=device-width, initial-scale=1.0">\
    <title><%= site.title %> - <%= page.title %></title>\
    <% if (site.styles && site.styles.length > 0) { %>\
        <% site.styles.forEach(function(style) { %>\
    <link rel="stylesheet" href="<%= style %>">\
        <% }); %>\ 
    <% } else { %>\
    <link rel="stylesheet" href="<%= isSection ? '../assets/modern.css' : 'assets/modern.css' %>">\
    <% } %>\
</head>\
<body class="<%= site.theme && site.theme.mode === 'dark' ? 'dark-mode' : 'light-mode' %>" \
      data-theme="<%= site.theme && site.theme.mode === 'dark' ? 'dark' : 'light' %>">\
    <header>\
        <div class="container header-container">\
            <h1 class="logo"><%= site.title %></h1>\
            <nav>\
                <ul class="nav-links">\
                    <% if (site.header && site.header.links) { %>\
                        <% site.header.links.forEach(function(link) { 
                           let href = link.href;
                           if (link.href.startsWith('#')) {
                             // This is a section link
                             href = 'sections/' + link.href.substring(1) + '.html';
                           }
                           if (isSection && !href.startsWith('http')) {
                             href = '../' + href;
                           }
                        %>\
                    <li><a href="<%= href %>"><%= link.label %></a></li>\
                        <% }); %>\
                    <% } else if (site.pages) { %>\
                        <li><a href="<%= isSection ? '../index.html' : 'index.html' %>">Home</a></li>\
                        <% site.pages.forEach(function(page) { %>\
                    <li><a href="<%= isSection ? '../' : '' %><%= page.slug || page.title.toLowerCase().replace(/\\s+/g, '-') %>.html"><%= page.title %></a></li>\
                        <% }); %>\
                        <% if (site.sections) { site.sections.forEach(function(section) { %>\
                    <li><a href="<%= isSection ? '' : 'sections/' %><%= section.id %>.html"><%= section.heading || section.id %></a></li>\
                        <% }); } %>\
                    <% } else { %>\
                    <li><a href="<%= isSection ? '../index.html' : 'index.html' %>">Home</a></li>\
                    <% } %>\
                </ul>\
            </nav>\
        </div>\
    </header>\
    <main class="container">\
        <h2><%= page.title %></h2>\
        <%- content %>\
    </main>\
    <footer>\
        <div class="container">\
            <p>&copy; <%= new Date().getFullYear() %> <%= site.title %>. All rights reserved.</p>\
        </div>\
    </footer>\
</body>\
</html>
`;

/**
 * Copy directory recursively with proper error handling
 */
async function copyDirRecursive(src, dest, verbose = false) {
  try {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirRecursive(srcPath, destPath, verbose);
      } else {
        await fs.copyFile(srcPath, destPath);
        if (verbose) console.log(`Copied: ${srcPath} -> ${destPath}`);
      }
    }
  } catch (error) {
    if (verbose) console.error(`Error copying ${src}: ${error.message}`);
    throw error;
  }
}

// Helper function to ensure CSS is properly loaded
function ensureCssIsLoaded(config) {
  // Create a copy to avoid modifying the original
  const updatedConfig = { ...config };
  
  // Initialize styles array if it doesn't exist
  if (!updatedConfig.styles) {
    updatedConfig.styles = [];
  }
  
  // If styles is empty or doesn't include modern.css, add it
  if (Array.isArray(updatedConfig.styles)) {
    const hasModernCss = updatedConfig.styles.some(style => 
      style.includes('modern.css') || style.includes('styles.css')
    );
    
    if (!hasModernCss) {
      updatedConfig.styles.push('assets/modern.css');
    }
  }
  return updatedConfig;
}

// --- COPY STATIC FILES FROM cm-source IF EXISTS (RECURSIVE NOW) ---
async function copyStaticFiles(outputDir, verbose = false) {
  try {
    const staticDir = path.join(outputDir, 'static');
    // Always create parent dirs for static
    await fs.mkdir(staticDir, { recursive: true });

    // Check if cm-source exists
    const cmSourceDir = path.join(process.cwd(), 'cm-source');
    // Use try/catch for exists
    let cmSourceExists = false;
    try {
      await fs.access(cmSourceDir);
      cmSourceExists = true;
    } catch {}

    if (cmSourceExists) {
      // Recursively copy static contents from cm-source/static/* to output/static/*
      const cmSourceStatic = path.join(cmSourceDir, 'static');
      try {
        await copyDirRecursive(cmSourceStatic, staticDir, verbose);
      } catch (e) {
        if (verbose) console.error(`Error copying cm-source static files: ${e.message}`);
      }

      // Copy root files like robots.txt and site.webmanifest if they exist
      const rootFiles = ['robots.txt', 'site.webmanifest'];
      for (const file of rootFiles) {
        const sourcePath = path.join(cmSourceDir, file);
        try {
          await fs.access(sourcePath);
          await fs.copyFile(sourcePath, path.join(outputDir, file));
          if (verbose) console.log(`Copied root file: ${file}`);
        } catch {}
      }
    }
  } catch (error) {
    console.error(`Error copying static files: ${error.message}`);
  }
}

async function generateBlog(blogConfig, siteConfig, outputDir, verbose = false) {
  const postsDir = path.resolve(process.cwd(), blogConfig.postsDir || 'content/blog');
  const blogOutputRel = (blogConfig.outputDir || 'blog').replace(/^(\.\/)+/, '').replace(/\\/g, '/');
  const fragmentRelDir = (blogConfig.fragmentDir || `${blogOutputRel}/fragments`).replace(/^(\.\/)+/, '').replace(/\\/g, '/');
  const baseUrl = siteConfig.baseUrl || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const publicBase = normalizedBaseUrl === '/' ? '' : normalizedBaseUrl;
  const toPublicPath = (p) => {
    if (!p) return publicBase || '/';
    return `${publicBase}${p.startsWith('/') ? p : '/' + p}`;
  };
  let files;

  try {
    files = await fs.readdir(postsDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Blog posts directory not found at ${postsDir}, skipping blog generation.`);
      return { indexPath: null, postPaths: [], fragmentPaths: [], posts: [] };
    }
    throw error;
  }

  const isExternalUrl = (value) => typeof value === 'string' && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);

  const authors = Array.isArray(blogConfig.authors)
    ? blogConfig.authors.map(author => {
        const normalizedAvatar = normalizeAssetPath(author.avatar);
        const avatarHref = normalizedAvatar && !isExternalUrl(normalizedAvatar)
          ? toPublicPath(normalizedAvatar)
          : normalizedAvatar;
        return {
          ...author,
          avatarPath: avatarHref
        };
      })
    : [];

  const authorsById = new Map(authors.map(author => [author.id, author]));

  const posts = [];

  const defaultPostPathConfig = blogConfig.index?.defaultPostPath || blogConfig.defaultPostPath;
  const defaultPostAbs = defaultPostPathConfig
    ? path.resolve(process.cwd(), defaultPostPathConfig)
    : null;

  function createPostObject(fileName, attributes, body, { includeOutputPaths = true, markHidden = false } = {}) {
    const slug = attributes.slug || slugFromFilename(fileName);
    const title = attributes.title || slug.replace(/-/g, ' ');

    const authorId = attributes.author;
    const author = authorId ? authorsById.get(authorId) : null;

    if (!author && authorId && verbose) {
      console.warn(`No author configured for id "${authorId}" while processing ${fileName}`);
    }

    const publishedAtIso = attributes.publishedAt || attributes.date;
    const publishedAtRaw = publishedAtIso ? new Date(publishedAtIso) : null;
    const publishedAtValid = publishedAtRaw && !Number.isNaN(publishedAtRaw.getTime())
      ? publishedAtRaw
      : null;
    const updatedAtIso = attributes.updatedAt;
    const updatedAt = updatedAtIso ? new Date(updatedAtIso) : null;

    const html = marked.parse(body || '');
    const summary = attributes.summary || truncateSummary(body || '');
    const readingMinutes = attributes.readingMinutes || estimateReadingMinutes(body);
    const heroImageNormalized = normalizeAssetPath(attributes.heroImage);
    const heroImagePath = heroImageNormalized && !isExternalUrl(heroImageNormalized)
      ? toPublicPath(heroImageNormalized)
      : heroImageNormalized;

    let postRelPath = null;
    let fragmentRelPath = null;
    let canonicalHref = null;
    let publicHref = null;
    let fragmentHref = null;

    if (includeOutputPaths) {
      postRelPath = path.posix.join(blogOutputRel, `${slug}.html`);
      fragmentRelPath = path.posix.join(fragmentRelDir, `${slug}.html`);
      canonicalHref = toPublicPath(`/${postRelPath}`);
      publicHref = canonicalHref;
      fragmentHref = toPublicPath(`/${fragmentRelPath}`);
    }

    return {
      slug,
      title,
      author,
      summary,
      html,
      rawBody: body,
      tags: attributes.tags || [],
      publishedAt: publishedAtValid,
      publishedAtIso: publishedAtValid ? (publishedAtIso || publishedAtValid.toISOString()) : null,
      updatedAt,
      updatedAtIso: updatedAtIso || (updatedAt ? updatedAt.toISOString() : null),
      displayPublishedAt: formatDisplayDate(publishedAtIso || publishedAtValid),
      displayUpdatedAt: formatDisplayDate(updatedAtIso),
      readingMinutes,
      heroImagePath,
      canonicalPath: postRelPath,
      canonicalHref,
      relativeHref: postRelPath,
      publicHref,
      fragmentPath: fragmentRelPath,
      fragmentHref,
      seoDescription: attributes.seoDescription || summary,
      isHidden: markHidden
    };
  }

  for (const file of files) {
    if (!file.endsWith('.md')) {
      continue;
    }

    const fullPath = path.join(postsDir, file);
    if (defaultPostAbs && path.resolve(fullPath) === defaultPostAbs) {
      continue;
    }
    const raw = await fs.readFile(fullPath, 'utf8');
    const { attributes, body } = parseFrontMatter(raw, file);
    if (attributes.hidden) {
      posts.push(createPostObject(file, attributes, body, { includeOutputPaths: true, markHidden: true }));
      continue;
    }

    posts.push(createPostObject(file, attributes, body, { includeOutputPaths: true }));
  }

  if (posts.length === 0 && !defaultPostAbs) {
    console.warn('No blog posts found, skipping blog generation.');
    return { indexPath: null, postPaths: [], fragmentPaths: [], posts: [] };
  }

  if (posts.length > 1) {
    posts.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }

  const hiddenPosts = posts.filter(post => post.isHidden);
  const displayPosts = posts.filter(post => !post.isHidden);

  if (displayPosts.length === 0 && !defaultPostAbs) {
    console.warn('No visible blog posts found, skipping blog generation.');
    return { indexPath: null, postPaths: [], fragmentPaths: [], posts: [] };
  }

  let defaultInitialPost = null;
  if (defaultPostAbs) {
    try {
      const raw = await fs.readFile(defaultPostAbs, 'utf8');
      const { attributes, body } = parseFrontMatter(raw, path.basename(defaultPostAbs));
      defaultInitialPost = createPostObject(path.basename(defaultPostAbs), attributes, body, {
        includeOutputPaths: false
      });
    } catch (error) {
      console.warn(`Failed to load default blog post at ${defaultPostAbs}: ${error.message}`);
    }
  }

  const blogOutputDir = path.join(outputDir, blogOutputRel);
  const fragmentOutputDir = path.join(outputDir, fragmentRelDir);
  await fs.mkdir(blogOutputDir, { recursive: true });
  await fs.mkdir(fragmentOutputDir, { recursive: true });

  const indexTemplate = blogConfig.indexTemplate || 'blog/index.ejs';
  const postTemplate = blogConfig.postTemplate || 'blog/post.ejs';
  const fragmentTemplate = blogConfig.fragmentTemplate || 'blog/fragment.ejs';

  const shouldRenderInitial = blogConfig.index?.renderInitialPost !== false;
  let initialPost = null;
  let isDefaultInitialPost = false;
  let isHiddenInitialPost = false;

  if (shouldRenderInitial) {
    if (defaultInitialPost) {
      initialPost = defaultInitialPost;
      isDefaultInitialPost = true;
    } else {
      initialPost = displayPosts[0] || hiddenPosts[0] || null;
      if (initialPost && initialPost.isHidden) {
        isHiddenInitialPost = true;
      }
    }
  }

  const indexPageConfig = {
    title: blogConfig.title || 'Blog',
    template: indexTemplate,
    hideTitle: true,
    useCmHead: blogConfig.index?.useCmHead ?? siteConfig.useCmHead,
    useCmFooter: blogConfig.index?.useCmFooter ?? siteConfig.useCmFooter,
    cmImage: blogConfig.index?.cmImage || siteConfig.cmImage,
    baseDepth: 0,
    hero: {
      title: blogConfig.index?.heroTitle || blogConfig.title || 'Blog',
      tagline: blogConfig.index?.heroTagline || blogConfig.description,
      intro: blogConfig.index?.intro || blogConfig.description
    },
    blogDescription: blogConfig.description,
    posts: displayPosts,
    hiddenPosts,
    authors,
    initialPost,
    isDefaultInitialPost,
    isHiddenInitialPost,
    sidebarPageSize: blogConfig.index?.sidebarPageSize || blogConfig.sidebarPageSize || 6,
    emptyStateText: blogConfig.index?.emptyStateText || blogConfig.emptyStateText || null,
    emptyStateHtml: blogConfig.index?.emptyStateText || blogConfig.emptyStateText
      ? marked.parse(blogConfig.index?.emptyStateText || blogConfig.emptyStateText)
      : null,
    fragmentDir: fragmentRelDir,
    outputDir: blogOutputRel,
    fragmentTemplate,
    postTemplate,
    rootBase: publicBase,
    authorFilter: blogConfig.enableAuthorFilter !== false
  };

  await generatePage(indexPageConfig, siteConfig, outputDir, verbose, 'blog.html');

  // Also emit a directory index for /blog/ routing convenience
  const directoryIndexConfig = { ...indexPageConfig, baseDepth: 1 };
  await generatePage(directoryIndexConfig, siteConfig, blogOutputDir, verbose, 'index.html');

  for (const post of posts) {
    const postPageConfig = {
      title: post.title,
      template: postTemplate,
      hideTitle: true,
      useCmHead: blogConfig.index?.useCmHead ?? siteConfig.useCmHead,
      useCmFooter: blogConfig.index?.useCmFooter ?? siteConfig.useCmFooter,
      cmImage: blogConfig.index?.cmImage || siteConfig.cmImage,
      baseDepth: 1,
      post,
      blog: {
        title: blogConfig.title || 'Blog',
        description: blogConfig.description,
        indexHref: toPublicPath('/blog.html'),
        rootBase: publicBase
      },
      rootBase: publicBase
    };

    await generatePage(postPageConfig, siteConfig, blogOutputDir, verbose, `${post.slug}.html`);

    const fragmentPageConfig = {
      title: post.title,
      template: fragmentTemplate,
      hideTitle: true,
      useCmHead: false,
      useCmFooter: false,
      baseDepth: 0,
      post,
      rootBase: publicBase
    };

    await generatePage(fragmentPageConfig, siteConfig, fragmentOutputDir, verbose, `${post.slug}.html`);
  }

  return {
    indexPath: 'blog.html',
    postPaths: posts.map(post => post.canonicalPath),
    fragmentPaths: posts.map(post => post.fragmentPath),
    posts,
    hiddenPosts
  };
}

const FRONT_MATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)/;

function parseFrontMatter(rawContent, fileName) {
  const match = rawContent.match(FRONT_MATTER_REGEX);
  if (!match) {
    return { attributes: {}, body: rawContent };
  }

  let attributes = {};
  try {
    attributes = yaml.load(match[1]) || {};
  } catch (error) {
    throw new Error(`Failed to parse front matter in ${fileName}: ${error.message}`);
  }

  const body = match[2] || '';
  return { attributes, body };
}

function normalizeAssetPath(value) {
  if (!value) return value;
  if (typeof value !== 'string') return value;
  if (/^(?:https?:)?\/\//.test(value) || value.startsWith('data:') || value.startsWith('/')) {
    return value;
  }
  return '/' + value.replace(/^\/+/, '');
}

function formatDisplayDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function estimateReadingMinutes(content, fallback = 5) {
  if (!content) return fallback;
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function truncateSummary(text, maxLength = 160) {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trimEnd() + '…';
}

function slugFromFilename(filename) {
  const base = path.parse(filename).name;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Generate a static site based on the provided configuration
 * @param {Object} config - Site configuration
 * @param {string} outputDir - Output directory path
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Object} Result object
 */
export async function generateSite(config, outputDir, verbose = false) {
  const updatedConfig = ensureCssIsLoaded(config);

  try {
    // Clean and create output directory
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Copy assets with exact structure matching site-output/
    if (config.assets) {
      const assetsDir = path.resolve(process.cwd(), config.assets);
      const outputAssetsDir = path.join(outputDir, 'assets');
      
      if (verbose) console.log(`Copying assets: ${assetsDir} -> ${outputAssetsDir}`);
      await copyDirRecursive(assetsDir, outputAssetsDir, verbose);
    }

    // Copy root files (robots.txt, site.webmanifest)
    const rootFiles = ['robots.txt', 'site.webmanifest'];
    for (const file of rootFiles) {
      const sourcePath = path.join(process.cwd(), config.assets || 'assets', file);
      try {
        await fs.access(sourcePath);
        await fs.copyFile(sourcePath, path.join(outputDir, file));
        if (verbose) console.log(`Copied root file: ${file}`);
      } catch {
        // File doesn't exist, skip
      }
    }
    
    // Create a mapping of section IDs for navigation
    const sectionMap = {};
    if (updatedConfig.sections && Array.isArray(updatedConfig.sections)) {
      updatedConfig.sections.forEach(section => {
        if (section.id) {
          sectionMap[section.id] = `sections/${section.id}.html`;
        }
      });
    }
    
    let indexPageConfigData;
    if (updatedConfig.index) {
      indexPageConfigData = { ...updatedConfig.index, isIndex: true, sectionMap };
    } else {
      indexPageConfigData = {
        title: updatedConfig.title,
        content: updatedConfig.description || `Welcome to ${updatedConfig.title}`,
        isIndex: true,
        sectionMap
      };
    }
    
    // Generate blog content if enabled
    let blogArtifacts = { indexPath: null, postPaths: [], fragmentPaths: [], posts: [] };
    if (updatedConfig.blog && updatedConfig.blog.enabled) {
      blogArtifacts = await generateBlog(updatedConfig.blog, updatedConfig, outputDir, verbose);
    }

    if (blogArtifacts.posts && blogArtifacts.posts.length > 0) {
      const latestPostsByAuthor = {};
      for (const post of blogArtifacts.posts) {
        if (!post || !post.author || !post.author.id) {
          continue;
        }
        if (post.isHidden) {
          continue;
        }
        const authorId = post.author.id.toLowerCase();
        if (latestPostsByAuthor[authorId]) {
          continue;
        }
        const aliases = new Set();
        aliases.add(authorId);
        if (post.author.name) {
          aliases.add(post.author.name.toLowerCase());
        }
        latestPostsByAuthor[authorId] = {
          id: post.author.id,
          name: post.author.name || post.author.id,
          title: post.title,
          summary: post.summary || '',
          url: post.publicHref || post.canonicalHref,
          aliases: Array.from(aliases).filter(Boolean)
        };
      }
      indexPageConfigData.latestPostsByAuthor = latestPostsByAuthor;
    }

    await generatePage(indexPageConfigData, updatedConfig, outputDir, verbose, 'index.html');

    // Create a sitemap.html file with links to all pages
    const pages = ['index.html'];
    if (blogArtifacts.indexPath) {
      pages.push(blogArtifacts.indexPath);
    }
    if (blogArtifacts.postPaths && blogArtifacts.postPaths.length > 0) {
      pages.push(...blogArtifacts.postPaths);
    }
    
    // Add regular pages to sitemap
    if (updatedConfig.pages) {
      pages.push(...updatedConfig.pages.map(p => `${p.slug || p.title.toLowerCase().replace(/\s+/g, '-')}.html`));
    }
    
    // Add section pages to sitemap
    if (updatedConfig.sections && Array.isArray(updatedConfig.sections)) {
      // Create a sections directory if it doesn't exist yet
      const sectionsDir = path.join(outputDir, 'sections');
      try {
        await fs.mkdir(sectionsDir, { recursive: true });
      } catch (error) {
        // Directory might already exist, ignore error
      }
      pages.push(...updatedConfig.sections.map(s => `sections/${s.id}.html`));
    }
    
    // Generate sitemap content with proper links and descriptions
    const sitemapContent = `
      <h1>Sitemap</h1>
      <ul class="sitemap-list">
        <li><a href="index.html">Home</a></li>
        ${updatedConfig.pages ? updatedConfig.pages.map(p => 
          `<li><a href="${p.slug || p.title.toLowerCase().replace(/\s+/g, '-')}.html">${p.title}</a></li>`
        ).join('\n') : ''}
        ${blogArtifacts.indexPath ? `<li><a href="${blogArtifacts.indexPath}">${updatedConfig.blog?.title || 'Blog'}</a></li>` : ''}
        ${blogArtifacts.posts && blogArtifacts.posts.length > 0 ? `
          <li><strong>Blog Posts:</strong></li>
          ${blogArtifacts.posts.map(post => `<li><a href="${post.relativeHref}">${post.title}</a></li>`).join('\n')}
        ` : ''}
        <li><strong>Sections:</strong></li>
        ${updatedConfig.sections ? updatedConfig.sections.map(s => 
          `<li><a href="sections/${s.id}.html">${s.heading || s.id}</a></li>`
        ).join('\n') : ''}
      </ul>`;

    await generatePage({
      title: 'Sitemap', 
      processedContent: sitemapContent, 
      sectionMap,
      // Inherit global CM settings for sitemap
      useCmHead: updatedConfig.sitemap?.useCmHead ?? updatedConfig.useCmHead,
      useCmConsole: updatedConfig.sitemap?.useCmConsole ?? updatedConfig.useCmConsole,
      useCmFooter: updatedConfig.sitemap?.useCmFooter ?? updatedConfig.useCmFooter,
      cmImage: updatedConfig.sitemap?.cmImage || updatedConfig.cmImage,
      use3DLogo: updatedConfig.sitemap?.use3DLogo ?? updatedConfig.use3DLogo,
      hideTitle: updatedConfig.sitemap?.hideTitle ?? updatedConfig.hideTitle
    }, updatedConfig, outputDir, verbose, 'sitemap.html');

    if (verbose) console.log('Generated sitemap.html with proper section links');
    
    // Generate pages
    if (updatedConfig.pages && Array.isArray(updatedConfig.pages)) {
      for (const page of updatedConfig.pages) {
        // Create a copy of the page to avoid modifying the original
        const pageCopy = { ...page, sectionMap };
        
        // Process markdown content if it exists
        if (pageCopy.content) {
          try {
            pageCopy.processedContent = marked.parse(pageCopy.content);
          } catch (error) {
            console.error(`Error parsing markdown for page ${pageCopy.slug || 'unknown'}: ${error.message}`);
          }
        }
        await generatePage(pageCopy, updatedConfig, outputDir, verbose);
      }
    }
    
    // Generate section pages if specified
    if (updatedConfig.sections && Array.isArray(updatedConfig.sections)) {
      // Create a sections directory
      const sectionsDir = path.join(outputDir, 'sections');
      await fs.mkdir(sectionsDir, { recursive: true });
      
      // Track section IDs to avoid duplicates with regular pages
      const sectionIds = new Set();
      
      for (const section of updatedConfig.sections) {
        if (!section.id) {
          console.warn('Section without ID found, skipping');
          continue;
        }
        
        sectionIds.add(section.id);
        
        // Create a copy of the section to avoid modifying the original
        const sectionCopy = { ...section };
        
        // Process markdown content for section
        if (sectionCopy.content) {
          try {
            sectionCopy.processedContent = marked.parse(sectionCopy.content);
          } catch (error) {
            console.error(`Error parsing markdown for section ${sectionCopy.id}: ${error.message}`);
          }
        }
        
        // Generate section page
        const sectionPage = { 
          ...sectionCopy, 
          title: sectionCopy.heading || sectionCopy.id,
          isSection: true,
          sectionMap,
          // Inherit global CM settings if not specified in section
          useCmHead: sectionCopy.useCmHead ?? updatedConfig.useCmHead,
          useCmConsole: sectionCopy.useCmConsole ?? updatedConfig.useCmConsole,
          useCmFooter: sectionCopy.useCmFooter ?? updatedConfig.useCmFooter,
          cmImage: sectionCopy.cmImage || updatedConfig.cmImage,
          use3DLogo: sectionCopy.use3DLogo ?? updatedConfig.use3DLogo,
          hideTitle: sectionCopy.hideTitle ?? updatedConfig.hideTitle,
          // Ensure columnLayout is passed through
          columnLayout: sectionCopy.columnLayout
        };

        // Debug logging
        if (verbose && sectionCopy.columnLayout) {
          console.log(`Section ${sectionCopy.id} columnLayout:`, JSON.stringify(sectionCopy.columnLayout, null, 2));
        }
        const filename = `${sectionCopy.id}.html`;
        await generatePage(sectionPage, updatedConfig, sectionsDir, verbose, filename);
      }
      
      // Check for duplicate pages that exist both as regular pages and sections
      if (updatedConfig.pages) {
        for (const page of updatedConfig.pages) {
          const pageId = page.slug || page.title.toLowerCase().replace(/\s+/g, '-');
          if (sectionIds.has(pageId)) {
            console.warn(`Warning: Page "${page.title}" has the same ID as a section. This may cause navigation issues.`);
          }
        }
      }
    }
    
    // if (verbose) {
    //   console.log(`Site generated successfully in ${outputDir}`);
    // }
    
    return { success: true };
  } catch (error) {
    console.error(`Error generating site: ${error.message}`);
    throw error;
  }
}

/**
 * Generate a single page
 * @param {Object} pageConfig - Page configuration
 * @param {Object} siteConfig - Site configuration
 * @param {string} outputDir - Output directory path
 * @param {boolean} verbose - Whether to log verbose output
 * @param {string} filename - Output filename
 */
async function generatePage(pageConfig, siteConfig, outputDir, verbose, filename) {
  try {
    // Process markdown content if available
    if (pageConfig.content && !pageConfig.processedContent) {
      try {
        pageConfig.processedContent = marked.parse(pageConfig.content);
      } catch (error) {
        console.error(`Error parsing markdown: ${error.message}`);
        pageConfig.processedContent = pageConfig.content;
      }
    }
    
    // Process column layout content if it exists
    if (pageConfig.columnLayout && pageConfig.columnLayout.enabled) {
      if (pageConfig.columnLayout.leftContent && !pageConfig.columnLayout.processedLeftContent) {
        try {
          pageConfig.columnLayout.processedLeftContent = marked.parse(pageConfig.columnLayout.leftContent);
        } catch (error) {
          console.error(`Error parsing left column markdown: ${error.message}`);
          pageConfig.columnLayout.processedLeftContent = pageConfig.columnLayout.leftContent;
        }
      }
      if (pageConfig.columnLayout.rightContent && !pageConfig.columnLayout.processedRightContent) {
        try {
          pageConfig.columnLayout.processedRightContent = marked.parse(pageConfig.columnLayout.rightContent);
        } catch (error) {
          console.error(`Error parsing right column markdown: ${error.message}`);
          pageConfig.columnLayout.processedRightContent = pageConfig.columnLayout.rightContent;
        }
      }
    }
    
    // Determine output filename
    if (!filename) {
      if (!pageConfig.slug && !pageConfig.title) {
        console.warn('Page has no slug or title, using "unnamed-page" as filename');
        filename = 'unnamed-page.html';
      } else {
        filename = `${pageConfig.slug || pageConfig.title.toLowerCase().replace(/\s+/g, '-')}.html`;
      }
    }
    
    const outputPath = path.join(outputDir, filename);
    
    // Determine if this is a section page by checking the output directory or explicit flag
    const isSection = pageConfig.isSection || outputDir.endsWith('sections') || outputDir.includes('/sections');
    
    // Adjust styles paths for section pages
    const adjustedStyles = isSection 
      ? (siteConfig.styles || ['assets/modern.css']).map(style => 
          style.startsWith('assets/') ? '../' + style : style
        )
      : siteConfig.styles;
    
    // Get template path
    const templateName = pageConfig.template || 'page.ejs';
    const fallbackTemplateName = 'base.ejs';
    let templatePath = path.join(
      process.cwd(),
      siteConfig.templates || 'templates',
      templateName
    );
    
    let html;
    try {
      // Try to render with the specified template
      if (verbose) console.log(`Using template: ${templatePath}`);
      html = await ejs.renderFile(templatePath, { 
        site: {
          ...siteConfig,
          baseUrl: siteConfig.baseUrl || '',
          styles: adjustedStyles || siteConfig.styles
        },
        page: pageConfig, 
        content: pageConfig.processedContent || pageConfig.content || '',
        isIndex: pageConfig.isIndex,
        isSection: isSection
      });
    } catch (error) {
      if (verbose) {
        console.warn(`Error rendering template ${templateName}: ${error.message}`);
      }
      try {
        // Try fallback template before using default
        const fallbackPath = path.join(
          process.cwd(),
          siteConfig.templates || 'templates',
          fallbackTemplateName
        );
        if (verbose) console.log(`Template not found, trying fallback: ${fallbackPath}`);
        html = await ejs.renderFile(fallbackPath, { 
          site: {
            ...siteConfig,
            baseUrl: siteConfig.baseUrl || '',
            styles: adjustedStyles || siteConfig.styles
          }, 
          page: pageConfig, 
          content: pageConfig.processedContent || pageConfig.content || '',
          isIndex: pageConfig.isIndex,
          isSection: isSection
        });
      } catch (fallbackError) {
        // If both templates not found, use default template
        console.warn(`Templates not found, using default template`);
        html = ejs.render(DEFAULT_TEMPLATE, { 
          site: {
            ...siteConfig,
            baseUrl: siteConfig.baseUrl || '',
            styles: adjustedStyles || siteConfig.styles
          },
          page: pageConfig, 
          content: pageConfig.processedContent || pageConfig.content || '',
          isIndex: pageConfig.isIndex,
          isSection: isSection
        });
      }
    }
    
    // Write output file
    if (verbose) console.log(`Generating page: ${outputPath}`);
    await fs.writeFile(outputPath, html);
  } catch (error) {
    console.error(`Error generating page ${filename}: ${error.message}`);
    throw new Error(`Failed to generate page ${filename}: ${error.message}`);
  }
}
