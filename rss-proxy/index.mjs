import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { loadConfig } from '../static-sitegen/lib/loadConfig.js';
import {
  normalizeRssConfig,
  fetchExternalFeeds,
  mergeFeeds,
  buildRssXml,
  writeJson
} from '../static-sitegen/lib/rssFeeds.js';

const CONFIG_PATH = process.env.RSS_CONFIG_PATH || path.resolve(process.cwd(), 'smoke-test.yaml');
const OUTPUT_DIR = process.env.RSS_OUTPUT_DIR || path.resolve(process.cwd(), 'site-output');
const FEEDS_DIR = process.env.RSS_FEEDS_DIR || path.join(OUTPUT_DIR, 'feeds');
const PORT = Number.parseInt(process.env.RSS_PROXY_PORT || '7070', 10);
const REFRESH_INTERVAL = Number.parseInt(process.env.RSS_REFRESH_INTERVAL || '600000', 10);

const LOCAL_FEED_PATH = path.join(FEEDS_DIR, 'local.json');
const COMBINED_FEED_PATH = path.join(FEEDS_DIR, 'combined.json');

let siteConfig = null;
let rssConfig = null;
let lastHash = null;
const feedCache = new Map();
const clients = new Set();

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[rss-proxy] ${timestamp} ${message}`);
}

async function loadSiteConfig() {
  try {
    siteConfig = await loadConfig(CONFIG_PATH);
    rssConfig = normalizeRssConfig(siteConfig);
  } catch (error) {
    log(`Failed to load config: ${error.message}`);
    siteConfig = null;
    rssConfig = null;
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function computeFeedHash(feed) {
  const payload = JSON.stringify({
    sources: feed.sources || [],
    items: feed.items || []
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

async function refreshFeeds({ force = false } = {}) {
  if (!rssConfig || !rssConfig.enabled) {
    return;
  }

  const localFeed = (await readJsonFile(LOCAL_FEED_PATH)) || { sources: [], items: [] };
  const externalFeed = rssConfig.includeExternal
    ? await fetchExternalFeeds(rssConfig, { cache: feedCache })
    : { sources: [], items: [] };

  const combinedFeed = mergeFeeds({
    localFeed,
    externalFeed,
    rssConfig
  });

  const nextHash = computeFeedHash(combinedFeed);
  if (!force && nextHash === lastHash) {
    return;
  }

  combinedFeed.generatedAt = new Date().toISOString();
  await writeJson(COMBINED_FEED_PATH, combinedFeed);

  const rssXml = buildRssXml(combinedFeed, rssConfig, siteConfig || {});
  const rssPath = path.join(OUTPUT_DIR, rssConfig.outputPath || 'rss.xml');
  await fs.mkdir(path.dirname(rssPath), { recursive: true });
  await fs.writeFile(rssPath, rssXml);

  lastHash = nextHash;
  broadcast('rss-update', combinedFeed.generatedAt);
  log(`Feed refreshed (${combinedFeed.items.length} items).`);
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(': connected\n\n');
  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

async function handleRefresh(req, res) {
  await refreshFeeds({ force: true });
  res.writeHead(202, { 'Content-Type': 'text/plain' });
  res.end('refresh queued\n');
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404);
    res.end();
    return;
  }

  if (req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }

  if (req.url.startsWith('/sse/feeds')) {
    handleSse(req, res);
    return;
  }

  if (req.url.startsWith('/refresh')) {
    await handleRefresh(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found\n');
});

await loadSiteConfig();
await refreshFeeds({ force: true });

if (Number.isFinite(REFRESH_INTERVAL) && REFRESH_INTERVAL > 0) {
  setInterval(() => {
    refreshFeeds().catch(error => log(`Refresh error: ${error.message}`));
  }, REFRESH_INTERVAL);
}

server.listen(PORT, () => {
  log(`Listening on :${PORT}`);
});
