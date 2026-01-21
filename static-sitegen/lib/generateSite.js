import { promises as fs } from 'fs';
import path from 'path';
import { marked } from 'marked';
import * as ejs from 'ejs';
import yaml from 'js-yaml';
import { ensureGitRepoArtifacts, DEFAULT_COMMIT_LIMIT as DEFAULT_GIT_COMMIT_LIMIT } from './gitArtifacts.js';
import { normalizeRssConfig, generateRssArtifacts } from './rssFeeds.js';

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

const DEFAULT_LICENSE_FILE_NAME = 'LICENSE';
const DEFAULT_LICENSE_MATCH_NAMES = ['license', 'license.txt', 'license.md', 'license.markdown'];
const STATIC_DOCS_BASENAME_PATTERN = /^[a-z0-9-]+$/;
const RESERVED_STATIC_DOCS_BASENAMES = new Set([
  'assets',
  'sections',
  'static',
  'blog',
  'fragments',
  'index.html',
  'sitemap.html',
  'robots.txt',
  'site.webmanifest'
]);
const STATIC_DOCS_HOME_STYLE_MARKER = '<!-- cm-static-docs-home-style -->';
const STATIC_DOCS_HOME_LINK_MARKER = '<!-- cm-static-docs-home-link -->';

function buildDefaultMitLicense(holder) {
  const year = new Date().getFullYear();
  const safeHolder = holder && holder.trim ? holder.trim() : '';
  const copyrightHolder = safeHolder || 'Chaos & Majesty';
  return `MIT License

Copyright (c) ${year} ${copyrightHolder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

async function resolveLicenseOverrideConfig(rawValue, siteConfig, verbose = false) {
  if (rawValue === false || rawValue === null) {
    return null;
  }

  let resolvedConfig = {};
  if (rawValue === undefined) {
    resolvedConfig = {};
  } else if (rawValue === true) {
    resolvedConfig = { enabled: true };
  } else if (typeof rawValue === 'string') {
    resolvedConfig = { contentPath: rawValue };
  } else if (typeof rawValue === 'object') {
    resolvedConfig = { ...rawValue };
  } else {
    return null;
  }

  const enabled = resolvedConfig.enabled !== false;
  if (!enabled) {
    return null;
  }

  const fileName = typeof resolvedConfig.fileName === 'string' && resolvedConfig.fileName.trim().length > 0
    ? resolvedConfig.fileName.trim()
    : DEFAULT_LICENSE_FILE_NAME;

  let content = '';
  if (typeof resolvedConfig.content === 'string' && resolvedConfig.content.trim().length > 0) {
    content = resolvedConfig.content;
  } else if (typeof resolvedConfig.contentPath === 'string' && resolvedConfig.contentPath.trim().length > 0) {
    const resolvedPath = path.resolve(process.cwd(), resolvedConfig.contentPath.trim());
    try {
      content = await fs.readFile(resolvedPath, 'utf8');
    } catch (error) {
      if (verbose) {
        console.warn(`Unable to read license override at ${resolvedPath}: ${error.message}`);
      }
    }
  }

  if (!content) {
    const holder = typeof resolvedConfig.holder === 'string' && resolvedConfig.holder.trim().length > 0
      ? resolvedConfig.holder.trim()
      : (siteConfig && typeof siteConfig.title === 'string' && siteConfig.title.trim().length > 0
        ? siteConfig.title.trim()
        : 'Chaos & Majesty');
    content = buildDefaultMitLicense(holder);
  }

  const matchNamesInput = Array.isArray(resolvedConfig.matchNames) ? resolvedConfig.matchNames : [];
  const matchNames = matchNamesInput
    .map(name => (typeof name === 'string' ? name.trim().toLowerCase() : ''))
    .filter(Boolean);
  const fileNameLower = fileName.toLowerCase();
  if (!matchNames.includes(fileNameLower)) {
    matchNames.push(fileNameLower);
  }
  DEFAULT_LICENSE_MATCH_NAMES.forEach(defaultName => {
    if (!matchNames.includes(defaultName)) {
      matchNames.push(defaultName);
    }
  });

  return {
    enabled: true,
    fileName,
    matchNames,
    content
  };
}

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

const DEFAULT_GIT_DETAIL_SUFFIX = 'log.html';
const DEFAULT_GIT_MANIFEST_PATH = path.join('config', 'git', 'manifest.txt');

function deriveGitRepoPath(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    const parsed = new URL(url, 'http://localhost');
    const pathname = parsed.pathname || '';
    return pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  } catch (error) {
    return url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  }
}

function buildGitRepoSearchText(record) {
  if (!record) return '';
  return [
    record.label,
    record.branch,
    record.stage,
    record.owner,
    record.description,
    record.repoPath,
    record.detailUrl,
    record.httpUrl
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return null;
}

function parseBooleanFlag(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', 'yes', 'y', '1', 'on', 'enable', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '0', 'off', 'disable', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function normalizeStaticDocsConfig(staticDocs) {
  if (staticDocs === undefined || staticDocs === null) {
    return [];
  }
  if (!Array.isArray(staticDocs)) {
    throw new Error('staticDocs must be an array');
  }
  const normalized = [];
  const seenBasenames = new Set();
  staticDocs.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`staticDocs[${index}] must be an object`);
    }
    const rawPath = typeof entry.path === 'string' ? entry.path.trim() : '';
    const rawBasename = typeof entry.basename === 'string' ? entry.basename.trim() : '';
    if (!rawPath) {
      throw new Error(`staticDocs[${index}] missing required field: path`);
    }
    if (!rawBasename) {
      throw new Error(`staticDocs[${index}] missing required field: basename`);
    }
    if (!STATIC_DOCS_BASENAME_PATTERN.test(rawBasename)) {
      throw new Error(`staticDocs[${index}] basename "${rawBasename}" must match ${STATIC_DOCS_BASENAME_PATTERN}`);
    }
    if (RESERVED_STATIC_DOCS_BASENAMES.has(rawBasename)) {
      throw new Error(`staticDocs[${index}] basename "${rawBasename}" is reserved`);
    }
    if (seenBasenames.has(rawBasename)) {
      throw new Error(`staticDocs basename "${rawBasename}" is duplicated`);
    }
    seenBasenames.add(rawBasename);
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null;
    const includeInSitemapFlag = parseBooleanFlag(entry.includeInSitemap);
    const includeInSitemap = includeInSitemapFlag === null ? false : includeInSitemapFlag;
    normalized.push({
      ...entry,
      path: rawPath,
      basename: rawBasename,
      label,
      includeInSitemap
    });
  });
  return normalized;
}

function appendStaticDocsNavLinks(siteConfig, staticDocs) {
  if (!staticDocs || staticDocs.length === 0) {
    return siteConfig;
  }
  const docsWithLabels = staticDocs.filter(doc => doc.label);
  if (docsWithLabels.length === 0) {
    return siteConfig;
  }
  const header = { ...(siteConfig.header || {}) };
  const existingLinks = Array.isArray(header.links) ? [...header.links] : [];
  const existingHrefs = new Set(existingLinks.map(link => (link && link.href ? link.href : '')));
  const appendedLinks = docsWithLabels
    .map(doc => ({ label: doc.label, href: `${doc.basename}/index.html` }))
    .filter(link => !existingHrefs.has(link.href));
  if (appendedLinks.length === 0) {
    return siteConfig;
  }
  header.links = [...existingLinks, ...appendedLinks];
  return { ...siteConfig, header };
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function copyStaticDocs(staticDocs, outputDir, verbose = false) {
  if (!staticDocs || staticDocs.length === 0) {
    return [];
  }
  const outputRoot = path.resolve(outputDir);
  const copied = [];

  for (const doc of staticDocs) {
    const sourcePath = path.resolve(process.cwd(), doc.path);
    if (isPathInside(outputRoot, sourcePath)) {
      throw new Error(`staticDocs path "${doc.path}" must not be inside the output directory`);
    }
    let stats;
    try {
      stats = await fs.stat(sourcePath);
    } catch (error) {
      throw new Error(`staticDocs path "${doc.path}" does not exist`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`staticDocs path "${doc.path}" must be a directory`);
    }

    const indexPath = path.join(sourcePath, 'index.html');
    try {
      await fs.access(indexPath);
    } catch {
      console.warn(`Warning: static docs export at ${doc.path} is missing index.html`);
    }

    const destination = path.join(outputRoot, doc.basename);
    if (verbose) {
      console.log(`Copying static docs: ${sourcePath} -> ${destination}`);
    }
    await copyDirRecursive(sourcePath, destination, verbose);
    copied.push({ ...doc, sourcePath, outputPath: destination });
  }

  return copied;
}

async function listHtmlFiles(rootDir) {
  const files = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listHtmlFiles(entryPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
}

function buildStaticDocsHomeStyle() {
  return `
  ${STATIC_DOCS_HOME_STYLE_MARKER}
  <style>
    .cm-static-docs-home {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 999;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(10, 10, 10, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      text-decoration: none;
    }

    .cm-static-docs-home img {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      display: block;
    }

    .cm-static-docs-home:hover,
    .cm-static-docs-home:focus-visible {
      border-color: rgba(255, 255, 255, 0.4);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    }

    @media (max-width: 640px) {
      .cm-static-docs-home {
        top: 10px;
        left: 10px;
        padding: 4px 8px;
      }

      .cm-static-docs-home img {
        width: 24px;
        height: 24px;
      }
    }
  </style>
`;
}

function buildStaticDocsHomeLink(homeHref, iconHref) {
  return `
  ${STATIC_DOCS_HOME_LINK_MARKER}
  <a class="cm-static-docs-home" href="${homeHref}" aria-label="Home">
    <img src="${iconHref}" alt="Home">
  </a>
`;
}

function injectStaticDocsHomeMarkup(html, homeHref, iconHref) {
  let updated = html;

  if (!updated.includes(STATIC_DOCS_HOME_STYLE_MARKER)) {
    const styleBlock = buildStaticDocsHomeStyle();
    if (updated.includes('</head>')) {
      updated = updated.replace(/<\/head>/i, `${styleBlock}\n</head>`);
    } else {
      updated = `${styleBlock}\n${updated}`;
    }
  }

  if (!updated.includes(STATIC_DOCS_HOME_LINK_MARKER)) {
    const linkBlock = buildStaticDocsHomeLink(homeHref, iconHref);
    const bodyMatch = updated.match(/<body[^>]*>/i);
    if (bodyMatch) {
      const insertAt = bodyMatch.index + bodyMatch[0].length;
      updated = `${updated.slice(0, insertAt)}${linkBlock}${updated.slice(insertAt)}`;
    } else {
      updated = `${linkBlock}\n${updated}`;
    }
  }

  return updated;
}

async function injectStaticDocsHomeLinks(staticDocs, siteConfig, verbose = false) {
  if (!staticDocs || staticDocs.length === 0) {
    return;
  }

  const baseUrlRaw = siteConfig.baseUrl || '/';
  const normalizedBase = baseUrlRaw.endsWith('/') ? baseUrlRaw.slice(0, -1) : baseUrlRaw;
  const rootPrefix = normalizedBase && normalizedBase !== '/' ? normalizedBase : '';
  const homeHref = `${rootPrefix}/index.html`;
  const iconHref = `${rootPrefix}/assets/static/img/not-dead.webp`;

  for (const doc of staticDocs) {
    const docRoot = doc.outputPath || path.join(process.cwd(), doc.basename);
    const htmlFiles = await listHtmlFiles(docRoot);
    for (const htmlPath of htmlFiles) {
      const original = await fs.readFile(htmlPath, 'utf8');
      const updated = injectStaticDocsHomeMarkup(original, homeHref, iconHref);
      if (updated !== original) {
        await fs.writeFile(htmlPath, updated, 'utf8');
        if (verbose) {
          console.log(`Injected home link into ${htmlPath}`);
        }
      }
    }
  }
}

function normalizeStringArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  const items = [];
  if (Array.isArray(value)) {
    items.push(...value);
  } else if (typeof value === 'string') {
    const split = value.includes(',') ? value.split(',') : value.split(/\r?\n/);
    items.push(...split);
  } else {
    items.push(String(value));
  }
  const results = [];
  const seen = new Set();
  for (const item of items) {
    if (item === undefined || item === null) continue;
    const normalized = item
      .toString()
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\/+/, '');
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(normalized);
    }
  }
  return results;
}

function mergeStringArrays(...arrays) {
  const seen = new Set();
  const merged = [];
  for (const arr of arrays) {
    if (!arr || !Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'string') continue;
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }
  return merged;
}

function normalizeGitRepoRecord(seed, detailSuffix = DEFAULT_GIT_DETAIL_SUFFIX) {
  if (!seed) {
    return null;
  }
  const suffix = (typeof detailSuffix === 'string' && detailSuffix.trim().length > 0)
    ? detailSuffix.trim()
    : DEFAULT_GIT_DETAIL_SUFFIX;

  const normalized = { ...seed };
  const label =
    normalized.label ||
    normalized.name ||
    normalized.id ||
    normalized.repo ||
    normalized.detailUrl ||
    normalized.httpUrl ||
    '';

  let httpUrl = normalized.httpUrl || normalized.browseUrl || normalized.url || '';
  let detailUrl = normalized.detailUrl || normalized.logUrl || normalized.url || '';

  if (detailUrl && !/\.html?(?:[?#]|$)/i.test(detailUrl)) {
    const trimmed = detailUrl.replace(/\/+$/, '');
    detailUrl = `${trimmed}/${suffix.replace(/^\/+/, '')}`;
  } else if (!detailUrl && httpUrl) {
    const trimmed = httpUrl.replace(/\/+$/, '');
    detailUrl = `${trimmed}/${suffix.replace(/^\/+/, '')}`;
  }

  if (!httpUrl && detailUrl) {
    const detail = detailUrl.replace(/[?#].*$/, '');
    const withoutSuffix = detail.replace(new RegExp(`${suffix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i'), '');
    httpUrl = withoutSuffix.replace(/\/+$/, '');
  }

  const repoPath = normalized.repoPath || normalized.relativePath || deriveGitRepoPath(httpUrl || detailUrl || '');
  const branch = normalized.branch || normalized.defaultBranch || normalized.stage || normalized.env || '';
  const stage = normalized.stage || normalized.env || branch || '';
  const stageLabel = normalized.stageLabel || (stage ? stage.toUpperCase() : '');
  const owner = normalized.owner || normalized.maintainer || '';
  const description = normalized.description || normalized.summary || '';
  const searchText = (normalized.searchText || buildGitRepoSearchText({
    label,
    branch,
    stage,
    owner,
    description,
    repoPath,
    detailUrl,
    httpUrl
  })).toLowerCase();

  const idSource = normalized.id || label || detailUrl || httpUrl;
  const id = idSource
    ? idSource.toString().trim().toLowerCase().replace(/\s+/g, '-')
    : `repo-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    label,
    branch,
    stage,
    stageLabel,
    owner,
    description,
    searchText,
    repoPath,
    detailUrl: detailUrl || '',
    httpUrl: httpUrl || '',
    sshUrl: normalized.sshUrl || normalized.gitUrl || '',
    manifestSource: normalized.manifestSource || '',
    tags: Array.isArray(normalized.tags) ? normalized.tags : (stage ? [stage.toLowerCase()] : []),
    commitLimit: parsePositiveInteger(normalized.commitLimit || normalized.commit_limit || normalized.historyLimit || normalized.limit),
    skipGlobs: normalizeStringArray(normalized.skipGlobs || normalized.skip_globs || normalized.exclude || normalized.excludes)
  };
}

function dedupeGitRepos(repos) {
  const seen = new Set();
  const results = [];
  for (const repo of repos) {
    if (!repo || !repo.detailUrl) {
      continue;
    }
    const key = repo.detailUrl.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(repo);
  }
  return results;
}

function slugifyRepoKey(value) {
  if (!value) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function findFirstExistingDirectory(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return null;
  }
  for (const candidate of paths) {
    if (!candidate) {
      continue;
    }
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {
      // Ignore missing paths
    }
  }
  return null;
}

function parseGitManifestContent(content, detailSuffix, manifestSource, verbose = false) {
  if (!content || typeof content !== 'string') {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const repos = [];
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const parts = line.split('|');
    if (parts.length < 6) {
      if (verbose) {
        console.warn(`Skipping malformed manifest entry on line ${index + 1} in ${manifestSource || 'manifest'}`);
      }
      continue;
    }
    const [sshUrl, branchField, name, owner, description, httpUrl] = parts.map(part => part.trim());
    const repoRecord = normalizeGitRepoRecord({
      label: name,
      stage: branchField,
      branch: branchField,
      owner,
      description,
      httpUrl,
      sshUrl,
      manifestSource: manifestSource || ''
    }, detailSuffix);
    if (repoRecord) {
      repos.push(repoRecord);
    }
  }
  return repos;
}

async function hydrateGitPageConfig(pageConfig, siteConfig, verbose = false) {
  if (!pageConfig || !pageConfig.git) {
    return;
  }

  const gitConfig = { ...pageConfig.git };
  const siteGitConfig = siteConfig && siteConfig.git ? siteConfig.git : {};
  const detailSuffix = (typeof gitConfig.repoDetailSuffix === 'string' && gitConfig.repoDetailSuffix.trim().length > 0)
    ? gitConfig.repoDetailSuffix.trim()
    : (typeof siteGitConfig.repoDetailSuffix === 'string' && siteGitConfig.repoDetailSuffix.trim().length > 0)
      ? siteGitConfig.repoDetailSuffix.trim()
      : DEFAULT_GIT_DETAIL_SUFFIX;

  const localOverridesRaw = {
    ...(siteGitConfig.localRepoOverrides || {}),
    ...(gitConfig.localRepoOverrides || {})
  };

  const localRepoOverrides = {};
  for (const [rawKey, value] of Object.entries(localOverridesRaw)) {
    if (!rawKey || value === undefined || value === null) {
      continue;
    }
    const key = rawKey.toString().toLowerCase();
    let pathOverride = null;
    let branchOverride = null;
    let depthOverride = null;
    let commitLimitOverride = null;
    let skipGlobsOverride = null;

    if (typeof value === 'string') {
      pathOverride = path.resolve(process.cwd(), value);
    } else if (typeof value === 'object') {
      if (value.path) {
        pathOverride = path.resolve(process.cwd(), value.path);
      }
      if (typeof value.branch === 'string' && value.branch.trim().length > 0) {
        branchOverride = value.branch.trim();
      } else if (typeof value.defaultBranch === 'string' && value.defaultBranch.trim().length > 0) {
        branchOverride = value.defaultBranch.trim();
      }
      if (typeof value.depth === 'number' && Number.isFinite(value.depth) && value.depth > 0) {
        depthOverride = Math.floor(value.depth);
      }
      if (Object.prototype.hasOwnProperty.call(value, 'commitLimit')) {
        commitLimitOverride = parsePositiveInteger(value.commitLimit);
      } else if (Object.prototype.hasOwnProperty.call(value, 'commit_limit')) {
        commitLimitOverride = parsePositiveInteger(value.commit_limit);
      }
      const overrideSkipRaw =
        value.skipGlobs ??
        value.skip_globs ??
        value.exclude ??
        value.excludes ??
        value.ignore;
      const normalizedSkip = normalizeStringArray(overrideSkipRaw);
      if (normalizedSkip.length > 0) {
        skipGlobsOverride = normalizedSkip;
      }
    }

    localRepoOverrides[key] = {
      path: pathOverride,
      branch: branchOverride,
      depth: depthOverride,
      commitLimit: commitLimitOverride,
      skipGlobs: skipGlobsOverride
    };
  }
  gitConfig.localRepoOverrides = localRepoOverrides;

  const manifestCandidates = [];
  if (gitConfig.manifest) {
    manifestCandidates.push(gitConfig.manifest);
  }
  if (siteGitConfig.manifest) {
    manifestCandidates.push(siteGitConfig.manifest);
  }
  manifestCandidates.push(DEFAULT_GIT_MANIFEST_PATH);

  let manifestContent = null;
  let manifestResolvedPath = null;
  for (const candidate of manifestCandidates) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }
    const resolved = path.resolve(process.cwd(), candidate);
    try {
      manifestContent = await fs.readFile(resolved, 'utf8');
      manifestResolvedPath = resolved;
      break;
    } catch (error) {
      const isExplicit = candidate === gitConfig.manifest || candidate === siteGitConfig.manifest;
      if (verbose && isExplicit) {
        console.warn(`Unable to read git manifest at ${resolved}: ${error.message}`);
      }
    }
  }

  const manifestRepos = manifestContent
    ? parseGitManifestContent(manifestContent, detailSuffix, manifestResolvedPath, verbose)
    : [];

  const manualSeeds = [];
  if (Array.isArray(gitConfig.repos)) {
    manualSeeds.push(...gitConfig.repos);
  }
  if (Array.isArray(gitConfig.fallbackRepos)) {
    manualSeeds.push(...gitConfig.fallbackRepos);
  }

  const manualRepos = manualSeeds
    .map(seed => normalizeGitRepoRecord(seed, detailSuffix))
    .filter(Boolean);

  let combinedRepos = dedupeGitRepos([...manifestRepos, ...manualRepos]);

  const mirrorDirInputs = [
    gitConfig.manifestMirrorDir,
    siteGitConfig.manifestMirrorDir,
    process.env.SITEGEN_GIT_MANIFEST_DIR,
    process.env.SITEGEN_GIT_MIRRORS_DIR,
    process.env.GIT_MANIFEST_MIRRORS_DIR,
    process.env.GIT_MANIFEST_CACHE_DIR
  ];
  const mirrorDirs = [];
  const seenMirrorDirs = new Set();
  for (const input of mirrorDirInputs) {
    if (!input || typeof input !== 'string') {
      continue;
    }
    const resolvedDir = path.resolve(process.cwd(), input);
    if (seenMirrorDirs.has(resolvedDir)) {
      continue;
    }
    seenMirrorDirs.add(resolvedDir);
    mirrorDirs.push(resolvedDir);
  }
  const defaultMirrorDir = path.resolve(process.cwd(), 'tmp', 'git-mirrors');
  if (!seenMirrorDirs.has(defaultMirrorDir)) {
    seenMirrorDirs.add(defaultMirrorDir);
    mirrorDirs.push(defaultMirrorDir);
  }
  if (mirrorDirs.length > 0) {
    gitConfig.manifestMirrorDir = mirrorDirs[0];
  }

  const licenseOverrideRaw = Object.prototype.hasOwnProperty.call(gitConfig, 'licenseOverride')
    ? gitConfig.licenseOverride
    : (Object.prototype.hasOwnProperty.call(siteGitConfig, 'licenseOverride')
      ? siteGitConfig.licenseOverride
      : undefined);
  gitConfig.licenseOverride = await resolveLicenseOverrideConfig(licenseOverrideRaw, siteConfig, verbose);

  const siteSkipGlobs = normalizeStringArray(siteGitConfig.skipGlobs);
  const pageSkipGlobs = normalizeStringArray(gitConfig.skipGlobs);
  const envSkipGlobs = normalizeStringArray(process.env.SITEGEN_GIT_SKIP_GLOBS);
  const defaultSkipGlobs = mergeStringArrays(siteSkipGlobs, pageSkipGlobs, envSkipGlobs);
  gitConfig.skipGlobs = defaultSkipGlobs;

  const commitLimitCandidates = [
    gitConfig.commitLimit,
    siteGitConfig.commitLimit,
    process.env.SITEGEN_GIT_COMMIT_LIMIT
  ];
  let defaultCommitLimit = null;
  for (const candidate of commitLimitCandidates) {
    const parsed = parsePositiveInteger(candidate);
    if (parsed !== null) {
      defaultCommitLimit = parsed;
      break;
    }
  }
  if (defaultCommitLimit === null) {
    defaultCommitLimit = DEFAULT_GIT_COMMIT_LIMIT;
  }
  gitConfig.commitLimit = defaultCommitLimit;

  const commitLinkFlagCandidates = [
    gitConfig.commitLinksEnabled,
    siteGitConfig.commitLinksEnabled,
    gitConfig.enableCommitLinks,
    siteGitConfig.enableCommitLinks
  ];
  let commitLinksEnabled = null;
  for (const candidate of commitLinkFlagCandidates) {
    const parsed = parseBooleanFlag(candidate);
    if (parsed !== null) {
      commitLinksEnabled = parsed;
      break;
    }
  }
  if (commitLinksEnabled === null) {
    commitLinksEnabled = true;
  }
  gitConfig.commitLinksEnabled = commitLinksEnabled;

  const processedRepos = [];
  for (const repo of combinedRepos) {
    if (!repo) {
      continue;
    }
    const nextRepo = { ...repo };
    nextRepo.searchText = nextRepo.searchText || buildGitRepoSearchText(nextRepo);

    const overrideCandidates = [
      nextRepo.id,
      nextRepo.label,
      nextRepo.repoPath,
      nextRepo.detailUrl,
      nextRepo.httpUrl,
      nextRepo.sshUrl
    ];

    let matchedOverride = null;
    for (const candidate of overrideCandidates) {
      if (!candidate) {
        continue;
      }
      const key = candidate.toString().toLowerCase();
      if (localRepoOverrides[key]) {
        matchedOverride = localRepoOverrides[key];
        break;
      }
    }

    if (!matchedOverride && nextRepo.manifestSource) {
      const manifestKey = `${nextRepo.manifestSource}:${nextRepo.label || nextRepo.id || ''}`.toLowerCase();
      if (localRepoOverrides[manifestKey]) {
        matchedOverride = localRepoOverrides[manifestKey];
      }
    }

    if (matchedOverride) {
      if (matchedOverride.path) {
        nextRepo.localPath = matchedOverride.path;
      }
      if (!nextRepo.branch && matchedOverride.branch) {
        nextRepo.branch = matchedOverride.branch;
      }
      if (matchedOverride.branch) {
        nextRepo.overrideBranch = matchedOverride.branch;
      }
      if (matchedOverride.depth) {
        nextRepo.overrideDepth = matchedOverride.depth;
      }
      if (matchedOverride.commitLimit) {
        nextRepo.overrideCommitLimit = matchedOverride.commitLimit;
      }
      nextRepo.localOverride = matchedOverride;
    }

    let resolvedMirrorPath = null;
    if (mirrorDirs.length > 0) {
      const slugSources = [
        nextRepo.id,
        nextRepo.label,
        nextRepo.repoPath,
        deriveGitRepoPath(nextRepo.detailUrl || nextRepo.httpUrl || ''),
        nextRepo.detailUrl,
        nextRepo.httpUrl,
        nextRepo.sshUrl
      ];
      const slugCandidates = new Set();
      const rawPathCandidates = new Set();
      for (const source of slugSources) {
        if (!source) {
          continue;
        }
        const trimmed = source.toString().trim();
        if (!trimmed) {
          continue;
        }
        rawPathCandidates.add(trimmed);
        const slug = slugifyRepoKey(trimmed);
        if (slug) {
          slugCandidates.add(slug);
        }
        if (trimmed.includes('/')) {
          const tail = trimmed.split('/').pop();
          if (tail) {
            rawPathCandidates.add(tail);
            const tailSlug = slugifyRepoKey(tail);
            if (tailSlug) {
              slugCandidates.add(tailSlug);
            }
          }
        }
      }

      const candidatePaths = [];
      for (const dir of mirrorDirs) {
        for (const slug of slugCandidates) {
          candidatePaths.push(path.join(dir, slug));
        }
        for (const rawPath of rawPathCandidates) {
          const normalized = rawPath.replace(/^[./]+/, '');
          if (normalized) {
            candidatePaths.push(path.join(dir, normalized));
          }
        }
      }

      resolvedMirrorPath = await findFirstExistingDirectory(candidatePaths);
    }

    if (resolvedMirrorPath) {
      nextRepo.mirrorPath = resolvedMirrorPath;
      nextRepo.manifestMirror = resolvedMirrorPath;
      if (!nextRepo.localPath) {
        nextRepo.localPath = resolvedMirrorPath;
      }
    }

    const repoSkipGlobs = normalizeStringArray(nextRepo.skipGlobs);
    const overrideSkipGlobs = matchedOverride && Array.isArray(matchedOverride.skipGlobs)
      ? matchedOverride.skipGlobs
      : [];
    const effectiveSkipGlobs = mergeStringArrays(defaultSkipGlobs, repoSkipGlobs, overrideSkipGlobs);
    if (effectiveSkipGlobs.length > 0) {
      nextRepo.skipGlobs = effectiveSkipGlobs;
    } else {
      delete nextRepo.skipGlobs;
    }

    let repoCommitLimit = parsePositiveInteger(nextRepo.commitLimit);
    const overrideCommitLimit = matchedOverride && matchedOverride.commitLimit
      ? parsePositiveInteger(matchedOverride.commitLimit)
      : null;
    if (!repoCommitLimit && overrideCommitLimit) {
      repoCommitLimit = overrideCommitLimit;
    }
    if (!repoCommitLimit && defaultCommitLimit) {
      repoCommitLimit = defaultCommitLimit;
    }
    if (repoCommitLimit) {
      nextRepo.commitLimit = repoCommitLimit;
    } else {
      delete nextRepo.commitLimit;
    }

    processedRepos.push(nextRepo);
  }

  combinedRepos = processedRepos;

  combinedRepos.sort((a, b) => {
    const stageA = (a.stageLabel || '').toLowerCase();
    const stageB = (b.stageLabel || '').toLowerCase();
    if (stageA && !stageB) return -1;
    if (!stageA && stageB) return 1;
    const stageCompare = stageA.localeCompare(stageB);
    if (stageCompare !== 0) {
      return stageCompare;
    }
    return (a.label || '').toLowerCase().localeCompare((b.label || '').toLowerCase());
  });

  const defaultLabelRaw = gitConfig.defaultRepoLabel || siteGitConfig.defaultRepoLabel || '';
  const defaultUrlRaw = gitConfig.defaultRepoUrl || siteGitConfig.defaultRepoUrl || '';

  if (!gitConfig.defaultRepoUrl && defaultLabelRaw) {
    const matchByLabel = combinedRepos.find(repo => (repo.label || '').toLowerCase() === defaultLabelRaw.toLowerCase());
    if (matchByLabel) {
      gitConfig.defaultRepoUrl = matchByLabel.detailUrl;
    }
  }

  if (!gitConfig.defaultRepoUrl && defaultUrlRaw) {
    gitConfig.defaultRepoUrl = defaultUrlRaw;
  }

  if (!gitConfig.defaultRepoLabel && defaultLabelRaw) {
    gitConfig.defaultRepoLabel = defaultLabelRaw;
  }

  if (!gitConfig.defaultRepoUrl && combinedRepos.length > 0) {
    gitConfig.defaultRepoUrl = combinedRepos[0].detailUrl;
    if (!gitConfig.defaultRepoLabel) {
      gitConfig.defaultRepoLabel = combinedRepos[0].label;
    }
  } else if (!gitConfig.defaultRepoLabel && gitConfig.defaultRepoUrl) {
    const matchByUrl = combinedRepos.find(repo => repo.detailUrl === gitConfig.defaultRepoUrl);
    if (matchByUrl) {
      gitConfig.defaultRepoLabel = matchByUrl.label;
    }
  }

  gitConfig.repoDetailSuffix = detailSuffix;
  gitConfig.generatedRepos = manifestRepos;
  gitConfig.resolvedRepos = combinedRepos;
  gitConfig.manifestResolvedPath = manifestResolvedPath;

  pageConfig.git = gitConfig;
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
  const escapeHtml = (value) => (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const blogMarkdownRenderer = (() => {
    const renderer = new marked.Renderer();
    const baseCodeRenderer = renderer.code ? renderer.code.bind(renderer) : null;
    renderer.code = (code, infostring, escaped) => {
      const lang = (infostring || '').trim().split(/\s+/)[0].toLowerCase();
      if (lang === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(code)}</div>`;
      }
      if (baseCodeRenderer) {
        return baseCodeRenderer(code, infostring, escaped);
      }
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    };
    return renderer;
  })();
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
          ? (publicBase
            ? toPublicPath(normalizedAvatar)
            : normalizedAvatar.replace(/^\/+/, ''))
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

    const html = marked.parse(body || '', { renderer: blogMarkdownRenderer });
    const summary = attributes.summary || truncateSummary(body || '');
    const readingMinutes = attributes.readingMinutes || estimateReadingMinutes(body);
    const heroImageNormalized = normalizeAssetPath(attributes.heroImage);
    const heroImagePath = heroImageNormalized && !isExternalUrl(heroImageNormalized)
      ? (publicBase
        ? toPublicPath(heroImageNormalized)
        : heroImageNormalized.replace(/^\/+/, ''))
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
      publicHref = publicBase ? canonicalHref : postRelPath;
      fragmentHref = publicBase ? toPublicPath(`/${fragmentRelPath}`) : fragmentRelPath;
    }

    let showArticleNav = null;
    if (attributes.forceArticleNav === true) {
      showArticleNav = true;
    } else if (typeof attributes.showArticleNav === 'boolean') {
      showArticleNav = attributes.showArticleNav;
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
      isHidden: markHidden,
      showArticleNav
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

  const formatNeighbor = (post) => {
    if (!post) return null;
    return {
      slug: post.slug,
      title: post.title,
      displayPublishedAt: post.displayPublishedAt,
      relativeHref: post.relativeHref,
      publicHref: post.publicHref,
      fragmentPath: post.fragmentPath,
      fragmentHref: post.fragmentHref
    };
  };

  posts.forEach((post, index) => {
    const prevVisible = (() => {
      for (let i = index - 1; i >= 0; i -= 1) {
        if (!posts[i].isHidden) {
          return posts[i];
        }
      }
      return null;
    })();

    const nextVisible = (() => {
      for (let i = index + 1; i < posts.length; i += 1) {
        if (!posts[i].isHidden) {
          return posts[i];
        }
      }
      return null;
    })();

    post.adjacent = {
      previous: formatNeighbor(prevVisible),
      next: formatNeighbor(nextVisible)
    };
  });

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
      initialPost = hiddenPosts[0] || displayPosts[0] || null;
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
        indexHref: publicBase ? toPublicPath('/blog.html') : 'blog.html',
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
  let updatedConfig = ensureCssIsLoaded(config);
  const normalizedStaticDocs = normalizeStaticDocsConfig(updatedConfig.staticDocs);
  updatedConfig = appendStaticDocsNavLinks(updatedConfig, normalizedStaticDocs);
  updatedConfig.staticDocs = normalizedStaticDocs;
  const rssConfig = normalizeRssConfig(updatedConfig);
  const gitFeedRepoMap = new Map();

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

    const copiedStaticDocs = await copyStaticDocs(normalizedStaticDocs, outputDir, verbose);
    await injectStaticDocsHomeLinks(copiedStaticDocs, updatedConfig, verbose);
    
    // Create a mapping of section IDs for navigation
    const sectionMap = {};
    if (updatedConfig.sections && Array.isArray(updatedConfig.sections)) {
      updatedConfig.sections.forEach(section => {
        if (section.id) {
          sectionMap[section.id] = `sections/${section.id}.html`;
        }
      });
    }

    const templatesDirAbsolute = path.resolve(
      process.cwd(),
      updatedConfig.templates || 'templates'
    );
    const gitArtifactsContext = { generated: new Set() };
    
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
    if (typeof indexPageConfigData.baseDepth !== 'number') {
      indexPageConfigData.baseDepth = 0;
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

      const consoleDispatches = blogArtifacts.posts
        .filter(post => !post.isHidden)
        .map(post => ({
          slug: post.slug,
          title: post.title,
          authorId: post.author?.id || '',
          authorName: post.author?.name || post.author?.id || '',
          summary: post.summary || '',
          url: post.publicHref || post.canonicalHref || post.relativeHref,
          publishedAtIso: post.publishedAtIso || (post.publishedAt ? post.publishedAt.toISOString() : null),
          displayPublishedAt: post.displayPublishedAt || '',
          readingMinutes: post.readingMinutes || null,
          tags: Array.isArray(post.tags) ? post.tags : []
        }));

      if (consoleDispatches.length > 0) {
        indexPageConfigData.consoleDispatches = consoleDispatches;
      }
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

    const staticDocsForSitemap = normalizedStaticDocs.filter(doc => doc.includeInSitemap);
    
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
        ${staticDocsForSitemap.length > 0 ? `
          <li><strong>Docs:</strong></li>
          ${staticDocsForSitemap.map(doc => `<li><a href="${doc.basename}/index.html">${doc.label || doc.basename}</a></li>`).join('\n')}
        ` : ''}
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
        if (typeof pageCopy.baseDepth !== 'number') {
          pageCopy.baseDepth = 0;
        }

        if (pageCopy.git) {
          await hydrateGitPageConfig(pageCopy, updatedConfig, verbose);
          if (pageCopy.git && Array.isArray(pageCopy.git.resolvedRepos) && pageCopy.git.resolvedRepos.length > 0) {
            await ensureGitRepoArtifacts({
              repos: pageCopy.git.resolvedRepos,
              siteConfig: updatedConfig,
              pageConfig: pageCopy,
              outputDir,
              templatesDir: templatesDirAbsolute,
              verbose,
              context: gitArtifactsContext
            });
            pageCopy.git.resolvedRepos.forEach(repo => {
              if (!repo) return;
              const key = repo.id || repo.label || repo.detailUrl || repo.httpUrl;
              if (!key) return;
              gitFeedRepoMap.set(key, repo);
            });
          }
        }
        
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
          baseDepth: typeof sectionCopy.baseDepth === 'number' ? sectionCopy.baseDepth : 1,
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
    
    if (rssConfig && rssConfig.enabled) {
      await generateRssArtifacts({
        rssConfig,
        siteConfig: updatedConfig,
        blogArtifacts,
        gitRepos: Array.from(gitFeedRepoMap.values()),
        outputDir,
        verbose,
        fetchExternal: rssConfig.fetchExternalAtBuild
      });
    }

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
