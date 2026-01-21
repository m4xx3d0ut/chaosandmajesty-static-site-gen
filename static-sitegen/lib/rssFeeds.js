import { promises as fs } from 'fs';
import path from 'path';
import sanitizeHtml from 'sanitize-html';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_MAX_ITEMS = 40;
const DEFAULT_EXTERNAL_MAX_ITEMS = 20;
const DEFAULT_GIT_MAX_COMMITS = 10;
const DEFAULT_SUMMARY_LENGTH = 200;

const RSS_ALLOWED_TAGS = [
  'a',
  'p',
  'br',
  'em',
  'strong',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote'
];

const RSS_ALLOWED_ATTRIBUTES = {
  a: ['href', 'title', 'rel', 'target']
};

const RSS_ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  cdataPropName: '__cdata',
  trimValues: true,
  processEntities: true
});

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeFeedId(value, fallback = 'feed') {
  const base = safeString(value).toLowerCase();
  return base ? base.replace(/[^a-z0-9._-]+/g, '-') : fallback;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const normalized = safeString(tag).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .toString()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSummary(text, maxLength = DEFAULT_SUMMARY_LENGTH) {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trimEnd() + '…';
}

function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapCdata(value) {
  const content = value || '';
  return `<![CDATA[${content.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toRfc2822Date(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toUTCString();
}

function resolveLink(value, baseUrl) {
  const raw = safeString(value);
  if (!raw) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) {
    return raw;
  }
  if (!baseUrl) return raw;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function extractText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (typeof value.__cdata === 'string') {
      return value.__cdata;
    }
    if (typeof value['#text'] === 'string') {
      return value['#text'];
    }
  }
  return String(value);
}

function sanitizeFeedHtml(value) {
  if (!value) return '';
  return sanitizeHtml(value, {
    allowedTags: RSS_ALLOWED_TAGS,
    allowedAttributes: RSS_ALLOWED_ATTRIBUTES,
    allowedSchemes: RSS_ALLOWED_SCHEMES,
    disallowedTagsMode: 'discard'
  }).trim();
}

function buildItemId(sourceId, guid, link, title, publishedAt) {
  const base = safeString(guid) || safeString(link) || `${safeString(title)}-${safeString(publishedAt)}`;
  return `${sourceId}:${base}`.replace(/\s+/g, '-');
}

function sortByPublishedDesc(a, b) {
  const aTime = a.publishedTimestamp || 0;
  const bTime = b.publishedTimestamp || 0;
  return bTime - aTime;
}

function dedupeSources(sources) {
  const seen = new Set();
  const results = [];
  for (const source of sources) {
    if (!source || !source.id) continue;
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    results.push(source);
  }
  return results;
}

function dedupeItems(items) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    if (!item || !item.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    results.push(item);
  }
  return results;
}

export function normalizeRssConfig(siteConfig = {}) {
  const hasRssConfig = Object.prototype.hasOwnProperty.call(siteConfig, 'rss');
  const raw = siteConfig.rss || {};
  const enabled = hasRssConfig ? (raw.enabled !== false) : false;
  const outputPath = safeString(raw.outputPath) || 'rss.xml';
  const includeBlog = raw.includeBlog !== false;
  const includeGit = raw.includeGit !== false;
  const includeExternal = raw.includeExternal !== false;
  const fetchExternalAtBuild = raw.fetchExternalAtBuild !== false;
  const maxItems = parsePositiveInteger(raw.maxItems, DEFAULT_MAX_ITEMS);
  const gitConfig = raw.git || {};
  const gitIncludeRepos = Array.isArray(gitConfig.includeRepos)
    ? gitConfig.includeRepos.map(entry => normalizeFeedId(entry)).filter(Boolean)
    : [];
  const gitMaxCommits = parsePositiveInteger(gitConfig.maxCommits, DEFAULT_GIT_MAX_COMMITS);
  const feedsRaw = Array.isArray(siteConfig.rssFeeds) ? siteConfig.rssFeeds : [];
  const feeds = feedsRaw.map((feed, index) => {
    if (!feed || typeof feed !== 'object') return null;
    const url = safeString(feed.url);
    if (!url) return null;
    const id = normalizeFeedId(feed.id || feed.label || `feed-${index + 1}`);
    return {
      id,
      label: safeString(feed.label) || id,
      url,
      maxItems: parsePositiveInteger(feed.maxItems, DEFAULT_EXTERNAL_MAX_ITEMS),
      tags: normalizeTags(feed.tags || [])
    };
  }).filter(Boolean);

  return {
    enabled,
    outputPath,
    includeBlog,
    includeGit,
    includeExternal,
    fetchExternalAtBuild,
    maxItems,
    git: {
      includeRepos: gitIncludeRepos,
      maxCommits: gitMaxCommits
    },
    feeds
  };
}

export function parseExternalFeedXml(xml, source, { sanitize = true } = {}) {
  if (!xml || typeof xml !== 'string') return [];
  const parsed = XML_PARSER.parse(xml);
  const channel = parsed?.rss?.channel || parsed?.channel || parsed?.feed;
  if (!channel) return [];
  const baseUrl = source?.url || '';
  const items = toArray(channel.item || channel.entry || []);
  const results = [];

  for (const item of items) {
    const title = safeString(item.title?.['#text'] || item.title) || 'Untitled';
    const linkRaw = item.link?.href || item.link?.['#text'] || item.link;
    const link = resolveLink(linkRaw, baseUrl);
    const guid = safeString(item.guid?.['#text'] || item.guid);
    const pubDate = safeString(item.pubDate || item.published || item.updated);
    const publishedDate = pubDate ? new Date(pubDate) : null;
    const publishedAt = publishedDate && !Number.isNaN(publishedDate.getTime())
      ? publishedDate.toISOString()
      : null;
    const publishedTimestamp = publishedDate && !Number.isNaN(publishedDate.getTime())
      ? publishedDate.getTime()
      : 0;
    const descriptionRaw = extractText(item.description || item.summary || '');
    const contentRaw = extractText(item['content:encoded'] || item.content || descriptionRaw || '');
    const summaryHtml = sanitize ? sanitizeFeedHtml(descriptionRaw || contentRaw) : safeString(descriptionRaw || contentRaw);
    const contentHtml = sanitize ? sanitizeFeedHtml(contentRaw || descriptionRaw) : safeString(contentRaw || descriptionRaw);
    const summaryText = truncateSummary(stripHtml(summaryHtml));
    const contentText = stripHtml(contentHtml);
    const categories = toArray(item.category || item.categories || []);
    const categoryTags = categories.map(cat => {
      if (typeof cat === 'string') return cat;
      if (cat && typeof cat.term === 'string') return cat.term;
      if (cat && typeof cat['#text'] === 'string') return cat['#text'];
      return '';
    });
    const tags = normalizeTags([...(source?.tags || []), ...categoryTags]);
    const sourceId = source?.id || 'external';
    const sourceLabel = source?.label || sourceId;
    const id = buildItemId(sourceId, guid, link, title, publishedAt || pubDate);

    results.push({
      id,
      title,
      link,
      summaryHtml,
      contentHtml,
      summaryText,
      contentText,
      tags,
      publishedAt,
      publishedTimestamp,
      sourceId,
      sourceLabel,
      sourceType: 'external',
      sourceUrl: source?.url || ''
    });
  }

  return results;
}

export async function buildLocalFeed({ blogArtifacts, gitRepos, rssConfig, siteConfig, outputDir, verbose = false }) {
  const items = [];
  const sources = [];
  const addSource = (source) => {
    if (!source || !source.id) return;
    sources.push(source);
  };

  if (rssConfig.includeBlog && blogArtifacts && Array.isArray(blogArtifacts.posts)) {
    const blogTitle = (siteConfig.blog && siteConfig.blog.title) || siteConfig.title || 'Blog';
    addSource({ id: 'blog', label: blogTitle, type: 'blog' });
    blogArtifacts.posts.forEach(post => {
      if (!post || post.isHidden) return;
      const publishedAt = post.publishedAtIso || (post.publishedAt ? post.publishedAt.toISOString() : null);
      const publishedTimestamp = post.publishedAt ? post.publishedAt.getTime() : 0;
      const summaryText = safeString(post.summary || '');
      const summaryHtml = summaryText ? `<p>${escapeXml(summaryText)}</p>` : '';
      const contentHtml = safeString(post.html || '');
      const contentText = stripHtml(contentHtml);
      const id = buildItemId('blog', post.slug || post.title, post.publicHref || post.relativeHref, post.title, publishedAt);
      items.push({
        id,
        title: post.title,
        link: post.publicHref || post.canonicalHref || post.relativeHref || '',
        summaryHtml,
        contentHtml,
        summaryText: truncateSummary(summaryText),
        contentText,
        tags: normalizeTags(post.tags || []),
        publishedAt,
        publishedTimestamp,
        sourceId: 'blog',
        sourceLabel: blogTitle,
        sourceType: 'blog',
        sourceUrl: blogArtifacts.indexPath || ''
      });
    });
  }

  if (rssConfig.includeGit && Array.isArray(gitRepos) && gitRepos.length > 0) {
    const includeSet = new Set(rssConfig.git.includeRepos || []);
    const shouldIncludeRepo = (repo) => {
      if (!repo) return false;
      if (includeSet.size === 0) return false;
      const candidates = [
        repo.id,
        repo.label,
        repo.repoPath,
        repo.detailUrl,
        repo.httpUrl
      ];
      return candidates.some(candidate => {
        const key = normalizeFeedId(candidate || '');
        return key && includeSet.has(key);
      });
    };

    for (const repo of gitRepos) {
      if (!shouldIncludeRepo(repo)) continue;
      const repoId = normalizeFeedId(repo.id || repo.label || repo.repoPath || 'repo');
      const sourceId = `git:${repoId}`;
      addSource({ id: sourceId, label: `Git: ${repo.label || repoId}`, type: 'git', url: repo.detailUrl || repo.httpUrl || '' });

      const commitsRel = repo?.generatedArtifacts?.commits;
      const commitSlug = repo?.generatedArtifacts?.slug || repoId;
      const commitsPath = commitsRel
        ? path.join(outputDir, commitsRel)
        : path.join(outputDir, 'git', commitSlug, 'commits.json');
      let commitData = null;
      try {
        const raw = await fs.readFile(commitsPath, 'utf8');
        commitData = JSON.parse(raw);
      } catch (error) {
        if (verbose) {
          console.warn(`[rss] Unable to read commit data for ${repo.label || repo.id}: ${error.message}`);
        }
        continue;
      }
      const commits = Array.isArray(commitData?.commits) ? commitData.commits : [];
      const limit = Math.min(commits.length, rssConfig.git.maxCommits || DEFAULT_GIT_MAX_COMMITS);
      for (const commit of commits.slice(0, limit)) {
        const title = commit.subject ? `${repo.label || repoId}: ${commit.subject}` : repo.label || repoId;
        const publishedAt = commit.authoredIso || null;
        const publishedTimestamp = commit.authoredEpochMs || 0;
        const summaryText = `${commit.shortSha || ''} • ${commit.authorName || ''}`.trim();
        const summaryHtml = summaryText ? `<p>${escapeXml(summaryText)}</p>` : '';
        const contentHtml = commit.subject
          ? `<p>${escapeXml(commit.subject)}</p>`
          : summaryHtml;
        const contentText = stripHtml(contentHtml);
        const id = buildItemId(sourceId, commit.sha, commit.commitUrl || '', title, publishedAt);
        items.push({
          id,
          title,
          link: commit.commitUrl || repo.detailUrl || repo.httpUrl || '',
          summaryHtml,
          contentHtml,
          summaryText: truncateSummary(summaryText),
          contentText,
          tags: normalizeTags(repo.tags || []),
          publishedAt,
          publishedTimestamp,
          sourceId,
          sourceLabel: `Git: ${repo.label || repoId}`,
          sourceType: 'git',
          sourceUrl: repo.detailUrl || repo.httpUrl || ''
        });
      }
    }
  }

  const dedupedItems = dedupeItems(items).sort(sortByPublishedDesc);

  return {
    generatedAt: new Date().toISOString(),
    sources: dedupeSources(sources),
    items: dedupedItems
  };
}

export async function fetchExternalFeeds(rssConfig, { cache = new Map(), verbose = false } = {}) {
  const sources = [];
  const items = [];
  for (const feed of rssConfig.feeds) {
    if (!feed || !feed.url) continue;
    sources.push({ id: feed.id, label: feed.label, type: 'external', url: feed.url });
    const cacheEntry = cache.get(feed.id) || {};
    const headers = {};
    if (cacheEntry.etag) headers['If-None-Match'] = cacheEntry.etag;
    if (cacheEntry.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified;
    let response;
    try {
      response = await fetch(feed.url, { headers });
    } catch (error) {
      if (verbose) {
        console.warn(`[rss] Failed to fetch ${feed.url}: ${error.message}`);
      }
      if (cacheEntry.items) {
        items.push(...cacheEntry.items);
      }
      continue;
    }
    if (response.status === 304 && cacheEntry.items) {
      items.push(...cacheEntry.items);
      continue;
    }
    if (!response.ok) {
      if (verbose) {
        console.warn(`[rss] Feed ${feed.url} returned ${response.status}`);
      }
      if (cacheEntry.items) {
        items.push(...cacheEntry.items);
      }
      continue;
    }
    const xml = await response.text();
    const parsedItems = parseExternalFeedXml(xml, feed);
    const limited = parsedItems.slice(0, feed.maxItems || DEFAULT_EXTERNAL_MAX_ITEMS);
    cache.set(feed.id, {
      etag: response.headers.get('etag') || cacheEntry.etag || null,
      lastModified: response.headers.get('last-modified') || cacheEntry.lastModified || null,
      items: limited
    });
    items.push(...limited);
  }

  return {
    sources: dedupeSources(sources),
    items: dedupeItems(items)
  };
}

export function mergeFeeds({ localFeed, externalFeed, rssConfig }) {
  const sources = dedupeSources([
    ...(localFeed?.sources || []),
    ...(externalFeed?.sources || [])
  ]);

  const items = dedupeItems([
    ...(localFeed?.items || []),
    ...(externalFeed?.items || [])
  ]).sort(sortByPublishedDesc);

  const limitedItems = items.slice(0, rssConfig.maxItems || DEFAULT_MAX_ITEMS);

  return {
    generatedAt: new Date().toISOString(),
    sources,
    items: limitedItems
  };
}

export function buildRssXml(feed, rssConfig, siteConfig) {
  const channelTitle = escapeXml((siteConfig && siteConfig.title) || 'Chaos & Majesty');
  const channelLink = escapeXml((siteConfig && siteConfig.baseUrl) || '');
  const channelDescription = escapeXml((siteConfig && siteConfig.description) || '');
  const lastBuildDate = toRfc2822Date(feed.generatedAt || new Date());
  const itemsXml = (feed.items || []).map(item => {
    const title = escapeXml(item.title || '');
    const link = escapeXml(item.link || '');
    const guid = escapeXml(item.id || '');
    const pubDate = toRfc2822Date(item.publishedAt);
    const description = wrapCdata(item.summaryHtml || '');
    const content = wrapCdata(item.contentHtml || item.summaryHtml || '');
    const sourceLabel = escapeXml(item.sourceLabel || '');
    const sourceUrl = escapeXml(item.sourceUrl || '');
    const sourceTag = sourceLabel
      ? `<source${sourceUrl ? ` url="${sourceUrl}"` : ''}>${sourceLabel}</source>`
      : '';
    return [
      '    <item>',
      `      <title>${title}</title>`,
      link ? `      <link>${link}</link>` : '',
      pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
      guid ? `      <guid isPermaLink="false">${guid}</guid>` : '',
      sourceTag ? `      ${sourceTag}` : '',
      `      <description>${description}</description>`,
      `      <content:encoded>${content}</content:encoded>`,
      '    </item>'
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    <title>${channelTitle}</title>`,
    channelLink ? `    <link>${channelLink}</link>` : '',
    channelDescription ? `    <description>${channelDescription}</description>` : '',
    lastBuildDate ? `    <lastBuildDate>${lastBuildDate}</lastBuildDate>` : '',
    itemsXml,
    '  </channel>',
    '</rss>'
  ].filter(Boolean).join('\n');
}

export async function writeJson(outputPath, payload) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
}

export async function generateRssArtifacts({
  rssConfig,
  siteConfig,
  blogArtifacts,
  gitRepos,
  outputDir,
  verbose = false,
  fetchExternal = false
}) {
  if (!rssConfig || !rssConfig.enabled) return null;
  const localFeed = await buildLocalFeed({ blogArtifacts, gitRepos, rssConfig, siteConfig, outputDir, verbose });
  const externalFeed = fetchExternal && rssConfig.includeExternal
    ? await fetchExternalFeeds(rssConfig, { verbose })
    : { sources: [], items: [] };
  const combinedFeed = mergeFeeds({ localFeed, externalFeed, rssConfig });
  const combinedPath = path.join(outputDir, 'feeds', 'combined.json');
  const localPath = path.join(outputDir, 'feeds', 'local.json');
  await writeJson(localPath, localFeed);
  await writeJson(combinedPath, combinedFeed);

  const xml = buildRssXml(combinedFeed, rssConfig, siteConfig);
  const rssPath = path.join(outputDir, rssConfig.outputPath || 'rss.xml');
  await fs.mkdir(path.dirname(rssPath), { recursive: true });
  await fs.writeFile(rssPath, xml);

  if (verbose) {
    console.log(`[rss] Wrote ${combinedPath} and ${rssPath}`);
  }

  return { localFeed, combinedFeed };
}
