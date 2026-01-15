import { promises as fs } from 'fs';
import path from 'path';
import ejs from 'ejs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { marked } from 'marked';

const execFileAsync = promisify(execFile);

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';
const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%ct%x1f%s%x1f%D%x1e';
const DEFAULT_LICENSE_FILE_NAME = 'LICENSE';

export const DEFAULT_COMMIT_LIMIT = 5;
export const DEFAULT_INITIAL_LOG_LIMIT = 10;
export const DEFAULT_CLONE_DEPTH = 1;

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

function globToRegex(pattern) {
  let normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized) {
    return null;
  }
  let regex = escapeRegex(normalized);
  regex = regex.replace(/\\\*\\\*/g, '.*');
  regex = regex.replace(/\\\*/g, '[^/]*');
  regex = regex.replace(/\\\?/g, '[^/]');
  return new RegExp(`^${regex}$`);
}

function createGlobMatcher(patterns) {
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
    return null;
  }
  const regexes = [];
  for (const pattern of patterns) {
    if (!pattern || typeof pattern !== 'string') continue;
    const compiled = globToRegex(pattern.trim());
    if (compiled) {
      regexes.push(compiled);
    }
  }
  if (regexes.length === 0) {
    return null;
  }
  return value => {
    if (!value) return false;
    const candidate = value.replace(/\\/g, '/');
    return regexes.some(regex => regex.test(candidate));
  };
}

function toPosixPath(value) {
  if (!value) return '';
  return value.split(path.sep).join('/');
}

function sanitizeSlug(value) {
  if (!value) {
    return 'repo';
  }
  const base = value.toString().trim().toLowerCase();
  return base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'repo';
}

function normalizeDisplayBranch(branch) {
  if (!branch) return '';
  return branch
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^origin\//, '');
}

function deriveCommitDetailBase(detailUrl) {
  if (!detailUrl) return null;
  const withoutQuery = detailUrl.replace(/[?#].*$/, '');
  return withoutQuery.replace(/\/log\.html?$/i, '');
}

function buildCloneUrl(repo) {
  if (repo.cloneUrl) {
    return repo.cloneUrl;
  }
  if (repo.httpUrl) {
    const trimmed = repo.httpUrl.replace(/\/+$/, '');
    if (/\.git(?:[?#]|$)/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}.git`;
  }
  if (repo.sshUrl) {
    return repo.sshUrl;
  }
  return null;
}

function buildCloneCommand({ url }) {
  if (!url) {
    return '';
  }
  return ['git', 'clone', url].join(' ');
}

function formatRelativeTime(epochMs, nowMs = Date.now()) {
  if (!Number.isFinite(epochMs)) {
    return '';
  }
  const diffSeconds = Math.round((epochMs - nowMs) / 1000);
  const units = [
    { unit: 'year', seconds: 60 * 60 * 24 * 365 },
    { unit: 'month', seconds: 60 * 60 * 24 * 30 },
    { unit: 'week', seconds: 60 * 60 * 24 * 7 },
    { unit: 'day', seconds: 60 * 60 * 24 },
    { unit: 'hour', seconds: 60 * 60 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 }
  ];

  for (const { unit, seconds } of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === 'second') {
      const value = Math.round(diffSeconds / seconds);
      return relativeTimeFormatter.format(value, unit);
    }
  }
  return '';
}

function parseRefs(refString) {
  if (!refString) {
    return { tags: [], heads: [], remotes: [], raw: [] };
  }
  const entries = refString.split(',').map(entry => entry.trim()).filter(Boolean);
  const tags = [];
  const heads = [];
  const remotes = [];
  for (const entry of entries) {
    if (entry.startsWith('tag: ')) {
      tags.push(entry.replace(/^tag:\s*/, ''));
      continue;
    }
    if (entry.startsWith('HEAD -> ')) {
      heads.push(entry.replace(/^HEAD ->\s*/, ''));
      continue;
    }
    if (entry.startsWith('origin/')) {
      remotes.push(entry);
      continue;
    }
  }
  return { tags, heads, remotes, raw: entries };
}

async function resolveGitRef(repoPath, branch, verbose = false) {
  const attempts = [];
  const candidates = [];

  if (branch && typeof branch === 'string') {
    const trimmed = branch.trim();
    if (trimmed) {
      candidates.push(trimmed);
      if (!trimmed.startsWith('refs/')) {
        candidates.push(`refs/heads/${trimmed}`);
        candidates.push(`origin/${trimmed}`);
        candidates.push(`refs/remotes/${trimmed}`);
      }
    }
  }
  candidates.push('HEAD');

  for (const candidate of candidates) {
    if (attempts.includes(candidate)) {
      continue;
    }
    attempts.push(candidate);
    try {
      await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--verify', candidate], {
        maxBuffer: 1024 * 1024
      });
      return { ref: candidate, display: normalizeDisplayBranch(candidate) || branch || candidate };
    } catch (error) {
      if (verbose) {
        console.warn(`[git-artifacts] ref lookup failed for ${candidate} in ${repoPath}: ${error.message}`);
      }
    }
  }

  return { ref: 'HEAD', display: normalizeDisplayBranch(branch) || 'HEAD' };
}

async function loadGitCommits(repoPath, ref, limit, verbose = false) {
  const args = [
    '-C',
    repoPath,
    'log',
    '--no-color',
    '--date=iso-strict',
    `--pretty=format:${LOG_FORMAT}`,
    '-n',
    String(limit)
  ];
  if (ref) {
    args.push(ref);
  }

  try {
    const { stdout } = await execFileAsync('git', args, {
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        LC_ALL: 'C'
      }
    });
    return parseGitLogOutput(stdout);
  } catch (error) {
    const message = error.stderr || error.stdout || error.message;
    if (verbose) {
      console.error(`[git-artifacts] git log failed for ${repoPath}: ${message}`);
    }
    throw new Error(`Unable to read commits for ${repoPath}: ${message}`);
  }
}

function parseGitLogOutput(output) {
  if (!output) {
    return [];
  }
  const records = output.split(RECORD_SEPARATOR);
  const commits = [];
  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) {
      continue;
    }
    const fields = trimmed.split(FIELD_SEPARATOR);
    if (fields.length < 7) {
      continue;
    }
    const [
      sha,
      shortSha,
      authorName,
      authorEmail,
      authoredIso,
      authoredEpochSeconds,
      subject,
      refNamesRaw
    ] = fields;
    const epochSeconds = Number(authoredEpochSeconds);
    const epochMs = Number.isFinite(epochSeconds) ? epochSeconds * 1000 : NaN;
    const relativeTime = formatRelativeTime(epochMs);
    const refs = parseRefs(refNamesRaw);

    commits.push({
      sha,
      shortSha,
      subject,
      authorName,
      authorEmail,
      authoredIso,
      authoredEpochMs: epochMs,
      authoredDisplay: Number.isFinite(epochMs) ? dateTimeFormatter.format(new Date(epochMs)) : authoredIso,
      relativeTime,
      tags: refs.tags,
      heads: refs.heads,
      refNames: refs.raw
    });
  }
  return commits;
}

function enrichCommits(commits, detailBaseUrl, displayBranch) {
  return commits.map(commit => {
    const result = { ...commit };
    if (detailBaseUrl) {
      result.commitUrl = `${detailBaseUrl}/commit/${commit.sha}.html`;
      result.treeUrl = displayBranch
        ? `${detailBaseUrl}/tree/${displayBranch}/${commit.sha}/`
        : `${detailBaseUrl}/tree/${commit.sha}/`;
    } else {
      result.commitUrl = null;
      result.treeUrl = null;
    }
    return result;
  });
}

const MAX_BLOB_BYTES = 512 * 1024;
const MARKDOWN_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx'
]);
const IMAGE_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp'
]);
const README_CANDIDATES = [
  'README.md',
  'README.MD',
  'README.markdown',
  'README.txt',
  'README',
  'readme.md',
  'readme',
  'readme.txt'
];

function escapeHtml(value) {
  if (value == null) return '';
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isLikelyMarkdown(filePath) {
  if (!filePath) return false;
  const lowered = filePath.toLowerCase();
  for (const ext of MARKDOWN_EXTENSIONS) {
    if (lowered.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

function isImagePath(filePath) {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function isBinaryBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  const sampleLength = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleLength; i += 1) {
    const byte = buffer[i];
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

function splitUrlSuffix(value) {
  const raw = value || '';
  let cutIndex = raw.length;
  const hashIndex = raw.indexOf('#');
  const queryIndex = raw.indexOf('?');
  if (hashIndex >= 0) {
    cutIndex = Math.min(cutIndex, hashIndex);
  }
  if (queryIndex >= 0) {
    cutIndex = Math.min(cutIndex, queryIndex);
  }
  return {
    path: raw.slice(0, cutIndex),
    suffix: raw.slice(cutIndex)
  };
}

function isAbsoluteUrl(value) {
  if (!value) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) {
    return true;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function resolveRepoRelativePath(basePath, relativePath) {
  if (!relativePath) return '';
  const normalizedRelative = relativePath.replace(/\\/g, '/');
  if (!normalizedRelative) return '';
  const normalizedBase = basePath ? basePath.replace(/\\/g, '/') : '';
  const baseDir = normalizedBase ? path.posix.dirname(normalizedBase) : '';
  const joined = normalizedRelative.startsWith('/')
    ? normalizedRelative.replace(/^\/+/, '')
    : path.posix.join(baseDir === '.' ? '' : baseDir, normalizedRelative);
  const normalized = path.posix.normalize(joined)
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '');
  return normalized === '.' ? '' : normalized;
}

function resolveMarkdownImageHref(href, options = {}) {
  const { slug, markdownPath } = options;
  if (!href || !slug) return href;
  const trimmed = href.trim();
  if (!trimmed) return href;
  if (trimmed.startsWith('#')) return trimmed;
  if (isAbsoluteUrl(trimmed)) return trimmed;
  const { path: pathPart, suffix } = splitUrlSuffix(trimmed);
  if (!pathPart) return trimmed;
  const resolvedPath = resolveRepoRelativePath(markdownPath, pathPart);
  if (!resolvedPath) return trimmed;
  const rawRel = toPosixPath(path.join('git', slug, 'raw', resolvedPath));
  const rawHref = rawRel.startsWith('/') || rawRel.startsWith('.') ? rawRel : `./${rawRel}`;
  return `${rawHref}${suffix}`;
}

function createMarkdownRenderer(options) {
  const renderer = new marked.Renderer();
  const baseImageRenderer = renderer.image.bind(renderer);
  renderer.image = (href, title, text) => {
    const resolvedHref = resolveMarkdownImageHref(href, options);
    return baseImageRenderer(resolvedHref, title, text);
  };
  return renderer;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

async function renderRepoPanel(templatePath, payload, fallback) {
  if (templatePath) {
    try {
      return await ejs.renderFile(templatePath, payload, { async: true });
    } catch (error) {
      console.warn(`[git-artifacts] Unable to render ${templatePath}: ${error.message}`);
    }
  }
  if (typeof fallback === 'function') {
    return fallback(payload);
  }
  return '';
}

function buildFallbackPanelHtml(payload) {
  const { repo, clone, commits } = payload;
  const latest = commits && commits.length > 0 ? commits[0] : null;
  const lines = [];
  lines.push(`<article data-repo-id="${repo.id || ''}">`);
  lines.push(`<h3>${repo.label || 'Repository'}</h3>`);
  if (repo.description) {
    lines.push(`<p>${repo.description}</p>`);
  }
  if (clone && clone.command) {
    lines.push(`<p><code>${clone.command}</code></p>`);
  }
  if (latest) {
    lines.push(`<p>Latest commit ${latest.shortSha} by ${latest.authorName} on ${latest.authoredDisplay}</p>`);
  }
  lines.push('</article>');
  return lines.join('\n');
}

async function writeJson(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, 'utf8');
}

function buildRepoSummary(repo, branchDisplay, detailBaseUrl) {
  return {
    id: repo.id,
    label: repo.label,
    branch: branchDisplay,
    requestedBranch: repo.branch || '',
    description: repo.description || '',
    owner: repo.owner || '',
    httpUrl: repo.httpUrl || '',
    detailUrl: repo.detailUrl || '',
    baseDetailUrl: detailBaseUrl || '',
    manifestSource: repo.manifestSource || '',
    repoPath: repo.repoPath || '',
    stage: repo.stage || '',
    stageLabel: repo.stageLabel || ''
  };
}

function defaultGeneratedKey(repo) {
  return (repo.detailUrl || repo.httpUrl || repo.id || repo.label || '').toLowerCase();
}

async function loadGitTree(repoPath, ref, verbose = false, options = {}) {
  const skipMatcher = typeof options.skipMatcher === 'function' ? options.skipMatcher : null;
  const args = [
    '-C',
    repoPath,
    'ls-tree',
    '--full-tree',
    '-r',
    '-l',
    ref
  ];
  try {
    const { stdout } = await execFileAsync('git', args, {
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        LC_ALL: 'C'
      }
    });
    return parseTreeOutput(stdout, skipMatcher);
  } catch (error) {
    if (verbose) {
      console.error(`[git-artifacts] git ls-tree failed for ${repoPath}: ${error.stderr || error.stdout || error.message}`);
    }
    return { root: createTreeNode('root', ''), files: [], directories: [] };
  }
}

function createTreeNode(name, fullPath, type = 'tree') {
  return {
    name,
    path: fullPath,
    type,
    size: 0,
    entries: [],
    fileCount: 0,
    directoryCount: 0,
    blobFragment: null,
    isMarkdown: false
  };
}

function parseTreeOutput(output, skipMatcher) {
  const root = createTreeNode('', '');
  const files = [];
  const directories = new Map();
  directories.set('', root);

  if (!output) {
    return { root, files, directories: Array.from(directories.values()) };
  }

  const lines = output.split('\n').filter(Boolean);
  for (const line of lines) {
    // Format: mode type sha size\tpath
    const tabIndex = line.indexOf('\t');
    if (tabIndex === -1) continue;
    const meta = line.slice(0, tabIndex).split(/\s+/);
    const filePath = line.slice(tabIndex + 1);
    if (!filePath) continue;
    if (skipMatcher && skipMatcher(filePath)) {
      continue;
    }
    const type = meta[1] || '';
    const size = meta[3] && meta[3] !== '-' ? Number(meta[3]) : 0;

    const segments = filePath.split('/');
    let currentPath = '';
    let parentNode = root;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      if (isLeaf && type === 'blob') {
        const fileNode = createTreeNode(segment, filePath, 'blob');
        fileNode.size = size;
        parentNode.entries.push(fileNode);
        parentNode.fileCount += 1;
        files.push(fileNode);
      } else {
        let directoryNode = directories.get(currentPath);
        if (!directoryNode) {
          directoryNode = createTreeNode(segment, currentPath, 'tree');
          directories.set(currentPath, directoryNode);
          parentNode.entries.push(directoryNode);
          parentNode.directoryCount += 1;
        }
        parentNode = directoryNode;
      }
    }
  }

  sortTreeEntries(root);
  root.directoryCount = root.entries.filter(entry => entry.type === 'tree').length;
  root.fileCount = root.entries.filter(entry => entry.type === 'blob').length;

  return { root, files, directories: Array.from(directories.values()) };
}

function sortTreeEntries(node) {
  if (!node || !Array.isArray(node.entries)) {
    return;
  }
  node.entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'tree' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  node.entries.forEach(child => {
    if (child.type === 'tree') {
      sortTreeEntries(child);
      child.directoryCount = child.entries.filter(entry => entry.type === 'tree').length;
      child.fileCount = child.entries.filter(entry => entry.type === 'blob').length;
    }
  });
}

function matchesLicenseOverride(filePath, licenseOverride) {
  if (!licenseOverride || !licenseOverride.enabled || !filePath) {
    return false;
  }
  const normalizedPath = filePath.trim().toLowerCase();
  if (!normalizedPath) {
    return false;
  }
  const matchNames = Array.isArray(licenseOverride.matchNames) && licenseOverride.matchNames.length > 0
    ? licenseOverride.matchNames
    : [(licenseOverride.fileName || DEFAULT_LICENSE_FILE_NAME).toLowerCase()];
  return matchNames.includes(normalizedPath);
}

function applyLicenseOverrideToTree(treeData, licenseOverride, skipMatcher) {
  if (!treeData || !treeData.root || !licenseOverride || !licenseOverride.enabled || !licenseOverride.content) {
    return;
  }

  const fileName = licenseOverride.fileName || DEFAULT_LICENSE_FILE_NAME;
  const matchNames = Array.isArray(licenseOverride.matchNames) && licenseOverride.matchNames.length > 0
    ? licenseOverride.matchNames
    : [fileName.toLowerCase()];
  const matchSet = new Set(matchNames.map(name => (typeof name === 'string' ? name.toLowerCase() : '')));

  let existing = treeData.files.find(node => node.path && matchSet.has(node.path.toLowerCase()));
  if (skipMatcher && skipMatcher(fileName)) {
    return;
  }

  if (!existing) {
    existing = createTreeNode(fileName, fileName, 'blob');
    treeData.files.push(existing);
    if (!Array.isArray(treeData.root.entries)) {
      treeData.root.entries = [];
    }
    treeData.root.entries.push(existing);
  }

  const size = Buffer.byteLength(licenseOverride.content, 'utf8');
  existing.size = size;
  existing.licenseOverride = true;
  existing.isMarkdown = false;

  treeData.root.fileCount = treeData.root.entries.filter(entry => entry.type === 'blob').length;
  sortTreeEntries(treeData.root);
}

function normalizeRefSelector(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  if (value.startsWith('refs/')) {
    return value;
  }
  if (value.includes('/')) {
    return `refs/remotes/${value.replace(/^\/+/, '')}`;
  }
  return `refs/heads/${value}`;
}

async function loadGitRefs(repoPath, verbose = false, options = {}) {
  const selectors = [];
  const normalizedRef = normalizeRefSelector(options.ref);
  const normalizedBranch = !options.ref ? normalizeRefSelector(options.branch) : null;
  if (normalizedRef) {
    selectors.push(normalizedRef);
  }
  if (normalizedBranch) {
    selectors.push(normalizedBranch);
    if (normalizedBranch.startsWith('refs/heads/')) {
      const branchName = normalizedBranch.replace(/^refs\/heads\//, '');
      selectors.push(normalizeRefSelector(`origin/${branchName}`));
    }
  }

  const includeTags = options.includeTags ?? (selectors.length === 0);

  if (selectors.length === 0) {
    selectors.push('refs/heads');
    if (includeTags) {
      selectors.push('refs/tags');
    }
  } else if (includeTags) {
    selectors.push('refs/tags');
  }

  const selectorSet = [];
  const seenSelectors = new Set();
  for (const selector of selectors) {
    if (!selector) {
      continue;
    }
    if (!seenSelectors.has(selector)) {
      seenSelectors.add(selector);
      selectorSet.push(selector);
    }
  }
  if (selectorSet.length === 0) {
    selectorSet.push('refs/heads');
  }

  const args = [
    '-C',
    repoPath,
    'for-each-ref',
    '--format=%(refname)\t%(objectname:short)\t%(committerdate:iso8601)\t%(committerdate:relative)\t%(authorname)\t%(subject)',
    ...selectorSet
  ];
  try {
    const { stdout } = await execFileAsync('git', args, {
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        LC_ALL: 'C'
      }
    });
    const heads = [];
    const tags = [];
    const remoteCandidates = [];
    stdout.split('\n').forEach(line => {
      if (!line.trim()) return;
      const [refname, shortSha, isoDate, relativeDate, authorName, subject] = line.split('\t');
      const entry = {
        refname,
        shortSha,
        isoDate,
        relativeDate,
        authorName,
        subject
      };
      if (refname.startsWith('refs/heads/')) {
        entry.display = refname.replace(/^refs\/heads\//, '');
        heads.push(entry);
      } else if (refname.startsWith('refs/tags/')) {
        entry.display = refname.replace(/^refs\/tags\//, '');
        tags.push(entry);
      } else if (refname.startsWith('refs/remotes/')) {
        const remoteDisplay = refname.replace(/^refs\/remotes\//, '');
        const branchDisplay = remoteDisplay.includes('/')
          ? remoteDisplay.split('/').slice(1).join('/')
          : remoteDisplay;
        if (!branchDisplay || branchDisplay === 'HEAD') {
          return;
        }
        remoteCandidates.push({
          ...entry,
          remote: true,
          remoteDisplay,
          display: branchDisplay
        });
      }
    });
    if (heads.length === 0 && remoteCandidates.length > 0) {
      const seen = new Set();
      for (const remoteEntry of remoteCandidates) {
        const display = remoteEntry.display || remoteEntry.remoteDisplay;
        if (!display || seen.has(display)) {
          continue;
        }
        seen.add(display);
        heads.push({
          ...remoteEntry,
          display
        });
      }
    }
    return { heads, tags };
  } catch (error) {
    if (verbose) {
      console.error(`[git-artifacts] git for-each-ref failed for ${repoPath}: ${error.stderr || error.stdout || error.message}`);
    }
    return { heads: [], tags: [] };
  }
}

async function loadGitBlob(repoPath, ref, filePath, verbose = false) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'cat-file', '-s', `${ref}:${filePath}`], {
      maxBuffer: 64 * 1024,
      encoding: 'utf8'
    });
    const size = Number(stdout.trim());
    if (Number.isFinite(size) && size > MAX_BLOB_BYTES) {
      return { skipped: true, reason: `File is too large (${formatFileSize(size)}).` };
    }
  } catch (error) {
    if (verbose) {
      console.warn(`[git-artifacts] git cat-file -s failed for ${filePath}: ${error.stderr || error.stdout || error.message}`);
    }
  }

  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'show', `${ref}:${filePath}`], {
      maxBuffer: MAX_BLOB_BYTES + 64 * 1024,
      encoding: 'buffer'
    });
    const buffer = Buffer.from(stdout);
    if (isBinaryBuffer(buffer)) {
      return { buffer, isBinary: true };
    }
    const content = buffer.toString('utf8');
    return { buffer, content, isBinary: false };
  } catch (error) {
    const message = error.stderr || error.stdout || error.message;
    if (verbose) {
      console.warn(`[git-artifacts] git show failed for ${filePath}: ${message}`);
    }
    return { skipped: true, reason: `Unable to load file: ${message}` };
  }
}

function renderTreeHtml(node, options = {}) {
  const depth = options.depth || 0;
  if (!node || !Array.isArray(node.entries)) {
    return '';
  }
  const fragments = node.entries.map(entry => {
    if (entry.type === 'tree') {
      const summaryLabel = escapeHtml(entry.name || (depth === 0 ? 'root' : ''));
      const counts = [];
      if (entry.directoryCount > 0) {
        counts.push(`${entry.directoryCount} dir${entry.directoryCount === 1 ? '' : 's'}`);
      }
      if (entry.fileCount > 0) {
        counts.push(`${entry.fileCount} file${entry.fileCount === 1 ? '' : 's'}`);
      }
      const meta = counts.length > 0 ? ` <span class="git-tree-meta">${counts.join(' · ')}</span>` : '';
      return `
        <li class="git-tree-item git-tree-dir" data-git-tree-item="dir">
          <details ${depth < 2 ? 'open' : ''}>
            <summary>
              <span class="git-tree-name">${summaryLabel}</span>${meta}
            </summary>
            <ul class="git-tree-children">
              ${renderTreeHtml(entry, { depth: depth + 1 })}
            </ul>
          </details>
        </li>
      `;
    }
    const fileLabel = escapeHtml(entry.name);
    const sizeLabel = entry.size ? `<span class="git-tree-size">${formatFileSize(entry.size)}</span>` : '';
    const blobAttr = entry.blobFragment ? ` data-git-blob="${escapeHtml(entry.blobFragment)}"` : '';
    const filePathAttr = entry.path ? ` data-git-file-path="${escapeHtml(entry.path)}"` : '';
    const markdownAttr = entry.isMarkdown ? ' data-git-file-markdown="true"' : '';
    return `
      <li class="git-tree-item git-tree-file" data-git-tree-item="file">
        <button type="button" class="git-tree-entry"${blobAttr}${filePathAttr}${markdownAttr}>
          <span class="git-tree-name">${fileLabel}</span>
          ${sizeLabel}
        </button>
      </li>
    `;
  });
  return fragments.join('\n');
}

function buildFilesFragmentHtml(payload) {
  const treeHtml = payload.treeHtml || '';
  const stats = payload.stats || {};
  const headerMeta = [];
  if (Number.isFinite(stats.directories)) {
    headerMeta.push(`${stats.directories} director${stats.directories === 1 ? 'y' : 'ies'}`);
  }
  if (Number.isFinite(stats.files)) {
    headerMeta.push(`${stats.files} file${stats.files === 1 ? '' : 's'}`);
  }
  const metaLine = headerMeta.length > 0 ? headerMeta.join(' · ') : '';
  return `
    <section class="git-panel git-files-panel" data-git-panel-section="files">
      <header class="git-files-header">
        <h4 class="git-files-title">${escapeHtml(payload.repo.label || 'Repository files')}</h4>
        <p class="git-files-meta">${escapeHtml(metaLine)}</p>
      </header>
      <div class="git-files-layout">
        <aside class="git-files-tree" data-git-tree>
          <ul class="git-tree-root">
            ${treeHtml}
          </ul>
        </aside>
        <section class="git-files-preview" data-git-file-preview>
          <div class="git-file-placeholder">
            Select a file to view its contents.
          </div>
        </section>
      </div>
    </section>
  `;
}

function buildRefsFragmentHtml(payload) {
  const { heads = [], tags = [], repo } = payload;
  const renderList = (items, emptyCopy) => {
    if (!items || items.length === 0) {
      return `<p class="git-refs-empty">${escapeHtml(emptyCopy)}</p>`;
    }
    const entries = items.map(item => `
      <li class="git-ref-item">
        <div class="git-ref-name">${escapeHtml(item.display || item.refname)}</div>
        <div class="git-ref-meta">
          <span class="git-ref-sha">${escapeHtml(item.shortSha || '')}</span>
          ${item.relativeDate ? `<span class="git-ref-date">${escapeHtml(item.relativeDate)}</span>` : ''}
          ${item.authorName ? `<span class="git-ref-author">${escapeHtml(item.authorName)}</span>` : ''}
        </div>
        ${item.subject ? `<div class="git-ref-subject">${escapeHtml(item.subject)}</div>` : ''}
      </li>
    `);
    return `<ul class="git-ref-list">${entries.join('\n')}</ul>`;
  };
  return `
    <section class="git-panel git-refs-panel" data-git-panel-section="refs">
      <header class="git-refs-header">
        <h4 class="git-refs-title">${escapeHtml(repo.label || 'Repository refs')}</h4>
      </header>
      <div class="git-refs-columns">
        <article class="git-refs-column">
          <h5>Branches</h5>
          ${renderList(heads, 'No branches were found in this repository.')}
        </article>
        <article class="git-refs-column">
          <h5>Tags</h5>
          ${renderList(tags, 'No tags were found in this repository.')}
        </article>
      </div>
    </section>
  `;
}

function buildReadmeFragmentHtml(payload) {
  if (!payload || !payload.bodyHtml) {
    return `
      <section class="git-panel git-readme-panel" data-git-panel-section="readme">
        <p class="git-readme-empty">No README was found for this branch.</p>
      </section>
    `;
  }
  return `
    <article class="git-panel git-readme-panel" data-git-panel-section="readme">
      <header class="git-readme-header">
        <h4 class="git-readme-title">${escapeHtml(payload.title || 'README')}</h4>
        ${payload.meta ? `<p class="git-readme-meta">${escapeHtml(payload.meta)}</p>` : ''}
      </header>
      <div class="git-readme-body">${payload.bodyHtml}</div>
    </article>
  `;
}

function splitContentLines(content) {
  const normalized = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const hasTrailingNewline = normalized.endsWith('\n');
  const lines = normalized.split('\n');
  if (hasTrailingNewline) {
    lines.pop();
  }
  if (lines.length === 0) {
    lines.push('');
  }
  return { lines, normalized };
}

function renderCodeListingHtml(content) {
  const { lines } = splitContentLines(content);
  const fragments = lines.map((line, index) => {
    const lineNumber = index + 1;
    const safeLine = line.length > 0 ? escapeHtml(line) : '&#8203;';
    return `
      <li class="git-code-line" id="L${lineNumber}" data-git-line="${lineNumber}">
        <button
          type="button"
          class="git-code-anchor"
          data-git-line-anchor="${lineNumber}"
          aria-label="Copy permalink for line ${lineNumber}"
          title="Copy permalink for line ${lineNumber}"
        >${lineNumber}</button>
        <span class="git-code-text">${safeLine}</span>
      </li>
    `;
  });
  return `
    <div class="git-code-shell" data-git-code-shell>
      <ol class="git-code-list" data-git-code-list>
        ${fragments.join('\n')}
      </ol>
    </div>
  `;
}

async function resolveTemplatePath(templatesDir, filename) {
  if (!templatesDir) {
    return null;
  }
  const candidate = path.join(templatesDir, 'git-fragments', filename);
  try {
    await fs.access(candidate);
    return candidate;
  } catch (error) {
    return null;
  }
}

function buildBlobFragmentHtml(payload) {
  if (!payload || payload.skipped) {
    const reason = payload && payload.reason ? escapeHtml(payload.reason) : 'Preview unavailable.';
    const fragmentAttr = payload && payload.fragmentPath ? ` data-git-fragment-path="${escapeHtml(payload.fragmentPath)}"` : '';
    return `
      <article class="git-file-panel" data-git-panel-section="blob"${fragmentAttr}>
        <header class="git-file-header">
          <h4 class="git-file-title">${escapeHtml(payload && payload.fileName ? payload.fileName : 'File preview')}</h4>
        </header>
        <div class="git-file-empty">${reason}</div>
      </article>
    `;
  }

  const fragmentAttr = payload.fragmentPath ? ` data-git-fragment-path="${escapeHtml(payload.fragmentPath)}"` : '';
  const rawAttr = payload.rawPath ? ` data-git-raw-path="${escapeHtml(payload.rawPath)}"` : '';
  const lineCountAttr = Number.isFinite(payload.lineCount) ? ` data-git-line-count="${payload.lineCount}"` : '';

  const metaParts = [];
  if (payload.sizeLabel) {
    metaParts.push(escapeHtml(payload.sizeLabel));
  }
  if (payload.lineCountLabel) {
    metaParts.push(escapeHtml(payload.lineCountLabel));
  }
  if (payload.path) {
    metaParts.push(escapeHtml(payload.path));
  }
  const metaHtml = metaParts.length > 0 ? `<div class="git-file-meta">${metaParts.join(' · ')}</div>` : '';

  const rawHref = payload.rawHref ? escapeHtml(payload.rawHref) : '';
  const copyButton = payload.rawPath
    ? `<button type="button" class="git-file-action git-file-action--copy" data-git-file-copy>Copy</button>`
    : `<button type="button" class="git-file-action git-file-action--copy" data-git-file-copy disabled>Copy</button>`;
  const rawButton = payload.rawPath
    ? `<a class="git-file-action git-file-action--raw" href="${rawHref}" target="_blank" rel="noopener">Raw</a>`
    : '';

  return `
    <article class="git-file-panel" data-git-panel-section="blob"${fragmentAttr}${rawAttr}${lineCountAttr}>
      <header class="git-file-header">
        <div class="git-file-header-main">
          <h4 class="git-file-title">${escapeHtml(payload.fileName || 'File preview')}</h4>
          ${metaHtml}
        </div>
        <div class="git-file-actions">
          ${rawButton}
          ${copyButton}
        </div>
      </header>
      <div class="git-file-body" data-git-file-body>
        ${payload.bodyHtml}
      </div>
    </article>
  `;
}

async function ensureBlobFragment({
  repoPath,
  repoOutputDir,
  slug,
  fileNode,
  ref,
  templatesDir,
  verbose = false,
  licenseOverride = null
}) {
  if (!fileNode || fileNode.type !== 'blob') {
    return null;
  }
  const segments = fileNode.path.split('/');
  const blobDir = path.join(repoOutputDir, 'blob', ...segments);
  await fs.mkdir(blobDir, { recursive: true });
  const fragmentOutputPath = path.join(blobDir, 'index.html');
  const fragmentRel = toPosixPath(path.join('git', slug, 'blob', ...segments, 'index.html'));

  const blobKey = `${ref}:${fileNode.path}`;
  const overrideActive = matchesLicenseOverride(fileNode.path, licenseOverride);

  let bodyHtml = '';
  let skipped = false;
  let reason = null;
  let rawPath = null;
  let rawHref = null;
  let lineCount = null;
  let lineCountLabel = '';
  let textContent = '';
  let blobBuffer = null;
  let isBinary = false;
  const isImage = isImagePath(fileNode.path);

  if (overrideActive) {
    textContent = typeof licenseOverride.content === 'string' ? licenseOverride.content : '';
    fileNode.size = Buffer.byteLength(textContent, 'utf8');
    blobBuffer = Buffer.from(textContent, 'utf8');
  } else {
    const result = await loadGitBlob(repoPath, ref, fileNode.path, verbose);
    if (result.skipped) {
      skipped = true;
      reason = result.reason;
    } else {
      blobBuffer = result.buffer || null;
      isBinary = !!result.isBinary;
      textContent = typeof result.content === 'string' ? result.content : '';
    }
  }

  if (!skipped && isImage && blobBuffer) {
    const rawAssetPath = path.join(repoOutputDir, 'raw', ...segments);
    await fs.mkdir(path.dirname(rawAssetPath), { recursive: true });
    await fs.writeFile(rawAssetPath, blobBuffer);
  }

  if (!skipped && isBinary) {
    skipped = true;
    reason = 'Binary file preview is not available.';
  }

  if (!skipped) {
    const { lines } = splitContentLines(textContent);
    lineCount = lines.length;
    lineCountLabel = `${lineCount} line${lineCount === 1 ? '' : 's'}`;

    if (isLikelyMarkdown(fileNode.path)) {
      const renderer = createMarkdownRenderer({ slug, markdownPath: fileNode.path });
      bodyHtml = marked.parse(textContent, { renderer });
    } else {
      bodyHtml = renderCodeListingHtml(textContent);
    }

    const rawRel = toPosixPath(path.join('git', slug, 'blob', ...segments, 'raw.txt'));
    rawPath = rawRel;
    rawHref = rawRel.startsWith('/') || rawRel.startsWith('.') ? rawRel : `./${rawRel}`;
    await fs.writeFile(path.join(blobDir, 'raw.txt'), textContent, 'utf8');
  }

  const payload = skipped
    ? {
        skipped: true,
        reason,
        fileName: fileNode.name,
        path: fileNode.path,
        fragmentPath: fragmentRel
      }
    : {
        fileName: fileNode.name,
        path: fileNode.path,
        sizeLabel: formatFileSize(fileNode.size),
        bodyHtml,
        fragmentPath: fragmentRel,
        rawPath,
        rawHref,
        lineCount,
        lineCountLabel
      };

  const blobTemplatePath = await resolveTemplatePath(templatesDir, 'blob.ejs');

  let html;
  if (blobTemplatePath) {
    try {
      html = await ejs.renderFile(blobTemplatePath, {
        file: payload,
        skipped,
        reason
      }, { async: true });
    } catch (error) {
      console.warn(`[git-artifacts] Unable to render ${blobTemplatePath}: ${error.message}`);
      html = buildBlobFragmentHtml(payload);
    }
  } else {
    html = buildBlobFragmentHtml(payload);
  }

  await fs.writeFile(fragmentOutputPath, html, 'utf8');

  return {
    fragmentPath: fragmentRel,
    rawPath,
    skipped,
    reason,
    blobKey,
    payload
  };
}

export async function ensureGitRepoArtifacts({
  repos,
  siteConfig,
  pageConfig,
  outputDir,
  templatesDir,
  verbose = false,
  context = {}
}) {
  if (!Array.isArray(repos) || repos.length === 0) {
    return;
  }

  const generatedSet = context.generated instanceof Set ? context.generated : new Set();
  context.generated = generatedSet;

  const templatePath = await resolveTemplatePath(templatesDir, 'repo-panel.ejs');
  const filesTemplatePath = await resolveTemplatePath(templatesDir, 'files.ejs');
  const refsTemplatePath = await resolveTemplatePath(templatesDir, 'refs.ejs');
  const readmeTemplatePath = await resolveTemplatePath(templatesDir, 'readme.ejs');

  const licenseOverride =
    (pageConfig && pageConfig.git && pageConfig.git.licenseOverride)
      || (siteConfig && siteConfig.git && siteConfig.git.licenseOverride)
      || null;
  let commitLinksEnabled = true;
  if (pageConfig && pageConfig.git && typeof pageConfig.git.commitLinksEnabled === 'boolean') {
    commitLinksEnabled = pageConfig.git.commitLinksEnabled;
  } else if (siteConfig && siteConfig.git && typeof siteConfig.git.commitLinksEnabled === 'boolean') {
    commitLinksEnabled = siteConfig.git.commitLinksEnabled;
  }

  for (const repo of repos) {
    const generatedKey = defaultGeneratedKey(repo);
    if (!repo || generatedSet.has(generatedKey)) {
      continue;
    }
    const hasAnyPath =
      Boolean(repo.localPath) ||
      Boolean(repo.mirrorPath) ||
      Boolean(repo.manifestMirror) ||
      (Array.isArray(repo.fallbackPaths) && repo.fallbackPaths.length > 0);
    if (!hasAnyPath) {
      if (verbose) {
        console.warn(`[git-artifacts] Skipping ${repo.label || repo.id || repo.httpUrl}: no local Git mirror available.`);
      }
      continue;
    }

    const slug = sanitizeSlug(repo.id || repo.label || repo.repoPath || 'repo');
    const repoOutputDir = path.join(outputDir, 'git', slug);
    await fs.mkdir(repoOutputDir, { recursive: true });

    const commitLimit = Number.isFinite(repo.commitLimit) && repo.commitLimit > 0
      ? Math.floor(repo.commitLimit)
      : DEFAULT_COMMIT_LIMIT;

    const skipGlobs = Array.isArray(repo.skipGlobs) ? repo.skipGlobs : [];
    const skipMatcher = createGlobMatcher(skipGlobs);

    const candidatePaths = [];
    const seenPaths = new Set();
    const pushCandidate = candidate => {
      if (!candidate || typeof candidate !== 'string') {
        return;
      }
      let normalized;
      try {
        normalized = path.resolve(candidate);
      } catch {
        normalized = candidate;
      }
      if (seenPaths.has(normalized)) {
        return;
      }
      seenPaths.add(normalized);
      candidatePaths.push(candidate);
    };

    pushCandidate(repo.localPath);
    pushCandidate(repo.mirrorPath);
    pushCandidate(repo.manifestMirror);
    if (Array.isArray(repo.fallbackPaths)) {
      for (const candidate of repo.fallbackPaths) {
        pushCandidate(candidate);
      }
    }

    let activeRepoPath = null;
    let ref = null;
    let display = null;
    let commitsRaw = null;
    let treeData = null;
    let lastError = null;

    for (const candidatePath of candidatePaths) {
      if (!candidatePath) {
        continue;
      }
      try {
        const refInfo = await resolveGitRef(candidatePath, repo.branch, verbose);
        const candidateCommits = await loadGitCommits(candidatePath, refInfo.ref, commitLimit, verbose);
        const candidateTree = await loadGitTree(candidatePath, refInfo.ref, verbose, { skipMatcher });
        activeRepoPath = candidatePath;
        ref = refInfo.ref;
        display = refInfo.display;
        commitsRaw = candidateCommits;
        treeData = candidateTree;
        if (verbose && repo.localPath && path.resolve(candidatePath) !== path.resolve(repo.localPath)) {
          console.warn(`[git-artifacts] Fallback git source selected for ${repo.label || repo.id || repo.detailUrl || 'repository'}: ${candidatePath}`);
        }
        break;
      } catch (error) {
        lastError = error;
        if (verbose) {
          console.warn(`[git-artifacts] Unable to load git data for ${repo.label || repo.id || repo.detailUrl || 'repository'} at ${candidatePath}: ${error.message}`);
        }
      }
    }

    if (!activeRepoPath || !commitsRaw || !treeData) {
      if (verbose) {
        const reason = lastError ? lastError.message : 'no candidate paths resolved';
        console.warn(`[git-artifacts] Skipping ${repo.label || repo.id || repo.detailUrl || 'repository'} – unable to fetch git metadata (${reason}).`);
      }
      continue;
    }

    const detailBaseUrl = deriveCommitDetailBase(repo.detailUrl);
    const commits = enrichCommits(commitsRaw, detailBaseUrl, display);
    const cloneUrl = buildCloneUrl(repo);
    const cloneCommand = buildCloneCommand({
      url: cloneUrl
    });

    const generatedAtIso = new Date().toISOString();

    const payload = {
      site: siteConfig,
      page: pageConfig,
      commitLinksEnabled,
      repo: buildRepoSummary(repo, display, detailBaseUrl),
      commits,
      clone: {
        url: cloneUrl,
        command: cloneCommand,
        branch: display || repo.branch || ''
      },
      stats: {
        generatedAtIso,
        totalCommits: commits.length,
        displayedCommits: commits.length,
        ref,
        refDisplay: display
      }
    };

    const initialLogLimit = Math.max(1, Math.min(DEFAULT_INITIAL_LOG_LIMIT, commitLimit));
    const limitedCommits = commits.length > initialLogLimit ? commits.slice(0, initialLogLimit) : commits.slice();
    const limitedDisplayedCount = limitedCommits.length;
    const hasAdditionalCommits = commits.length > limitedDisplayedCount;

    const fragmentRel = toPosixPath(path.join('git', slug, 'index.html'));
    const fragmentOutputPath = path.join(repoOutputDir, 'index.html');
    const fullFragmentRel = toPosixPath(path.join('git', slug, 'full.html'));
    const fullFragmentOutputPath = path.join(repoOutputDir, 'full.html');
    const commitsRel = toPosixPath(path.join('git', slug, 'commits.json'));
    const commitsOutputPath = path.join(repoOutputDir, 'commits.json');

    const baseLogContext = {
      totalCommits: commits.length,
      displayedCommits: commits.length,
      initialLimit: initialLogLimit,
      fullFragmentPath: hasAdditionalCommits ? fullFragmentRel : fragmentRel,
      limitedFragmentPath: fragmentRel
    };

    const limitedPayload = {
      ...payload,
      commits: limitedCommits,
      stats: {
        ...payload.stats,
        displayedCommits: limitedDisplayedCount
      },
      log: {
        ...baseLogContext,
        displayedCommits: limitedDisplayedCount,
        isTruncated: hasAdditionalCommits,
        mode: hasAdditionalCommits ? 'limited' : 'full',
        fullFragmentPath: hasAdditionalCommits ? fullFragmentRel : ''
      }
    };

    const fullPayload = {
      ...payload,
      stats: {
        ...payload.stats,
        displayedCommits: commits.length
      },
      log: {
        ...baseLogContext,
        displayedCommits: commits.length,
        isTruncated: false,
        mode: 'full'
      }
    };

    const panelHtml = await renderRepoPanel(templatePath, limitedPayload, buildFallbackPanelHtml);
    await fs.writeFile(fragmentOutputPath, panelHtml, 'utf8');

    if (hasAdditionalCommits) {
      const fullPanelHtml = await renderRepoPanel(templatePath, fullPayload, buildFallbackPanelHtml);
      await fs.writeFile(fullFragmentOutputPath, fullPanelHtml, 'utf8');
    }

    await writeJson(commitsOutputPath, {
      repo: payload.repo,
      clone: payload.clone,
      commits
    });

    if (licenseOverride && licenseOverride.enabled && licenseOverride.content) {
      applyLicenseOverrideToTree(treeData, licenseOverride, skipMatcher);
    }
    const blobArtifacts = new Map();
    let readmeCandidateNode = null;
    let readmeBlob = null;

    for (const fileNode of treeData.files) {
      if (skipMatcher && skipMatcher(fileNode.path)) {
        continue;
      }
      fileNode.isMarkdown = isLikelyMarkdown(fileNode.path);
      const blobInfo = await ensureBlobFragment({
        repoPath: activeRepoPath,
        repoOutputDir,
        slug,
        fileNode,
        ref,
        templatesDir,
        verbose,
        licenseOverride
      });
      if (blobInfo && blobInfo.fragmentPath) {
        fileNode.blobFragment = blobInfo.fragmentPath;
        blobArtifacts.set(fileNode.path, blobInfo);
      }
      const nameLower = fileNode.name.toLowerCase();
      if (!readmeCandidateNode && README_CANDIDATES.includes(fileNode.name) && !fileNode.path.includes('/')) {
        readmeCandidateNode = fileNode;
        readmeBlob = blobInfo || null;
      } else if (!readmeCandidateNode && README_CANDIDATES.includes(fileNode.path)) {
        readmeCandidateNode = fileNode;
        readmeBlob = blobInfo || null;
      }
    }

    const treeHtml = renderTreeHtml(treeData.root);
    const filesStats = {
      directories: Math.max(0, treeData.directories.length - 1),
      files: treeData.files.length
    };

    const filesPayload = {
      repo: payload.repo,
      treeHtml,
      stats: filesStats
    };

    let filesHtml;
    if (filesTemplatePath) {
      try {
        filesHtml = await ejs.renderFile(filesTemplatePath, filesPayload, { async: true });
      } catch (error) {
        console.warn(`[git-artifacts] Unable to render ${filesTemplatePath}: ${error.message}`);
        filesHtml = buildFilesFragmentHtml(filesPayload);
      }
    } else {
      filesHtml = buildFilesFragmentHtml(filesPayload);
    }
    const filesOutputPath = path.join(repoOutputDir, 'files.html');
    await fs.writeFile(filesOutputPath, filesHtml, 'utf8');
    const filesFragmentRel = toPosixPath(path.join('git', slug, 'files.html'));

    const branchForRefs = repo.overrideBranch || repo.branch || display || '';
    const refForRefs = ref && ref.startsWith('refs/') ? ref : null;
    const refsData = await loadGitRefs(activeRepoPath, verbose, {
      ref: refForRefs,
      branch: branchForRefs,
      includeTags: false
    });
    const refsPayload = {
      repo: payload.repo,
      heads: refsData.heads,
      tags: refsData.tags
    };
    let refsHtml;
    if (refsTemplatePath) {
      try {
        refsHtml = await ejs.renderFile(refsTemplatePath, refsPayload, { async: true });
      } catch (error) {
        console.warn(`[git-artifacts] Unable to render ${refsTemplatePath}: ${error.message}`);
        refsHtml = buildRefsFragmentHtml(refsPayload);
      }
    } else {
      refsHtml = buildRefsFragmentHtml(refsPayload);
    }
    const refsOutputPath = path.join(repoOutputDir, 'refs.html');
    await fs.writeFile(refsOutputPath, refsHtml, 'utf8');
    const refsFragmentRel = toPosixPath(path.join('git', slug, 'refs.html'));

    let readmeHtml;
    const readmePayload = !readmeCandidateNode || !readmeBlob || readmeBlob.skipped || !readmeBlob.payload
      ? null
      : {
          title: readmeCandidateNode.name,
          meta: `${payload.repo.label || ''} · ${display || repo.branch || 'HEAD'}`,
          bodyHtml: readmeBlob.payload.bodyHtml || ''
        };
    if (readmeTemplatePath) {
      try {
        readmeHtml = await ejs.renderFile(readmeTemplatePath, {
          repo: payload.repo,
          readme: readmePayload
        }, { async: true });
      } catch (error) {
        console.warn(`[git-artifacts] Unable to render ${readmeTemplatePath}: ${error.message}`);
        readmeHtml = buildReadmeFragmentHtml(readmePayload);
      }
    } else {
      readmeHtml = buildReadmeFragmentHtml(readmePayload);
    }
    const readmeOutputPath = path.join(repoOutputDir, 'readme.html');
    await fs.writeFile(readmeOutputPath, readmeHtml, 'utf8');
    const readmeFragmentRel = toPosixPath(path.join('git', slug, 'readme.html'));

    repo.fragmentPath = fragmentRel;
    repo.limitedFragmentPath = fragmentRel;
    repo.fullLogFragmentPath = hasAdditionalCommits ? fullFragmentRel : fragmentRel;
    repo.commitsJsonPath = commitsRel;
    repo.generatedArtifacts = {
      panel: fragmentRel,
      fullLog: hasAdditionalCommits ? fullFragmentRel : fragmentRel,
      commits: commitsRel,
      files: filesFragmentRel,
      refs: refsFragmentRel,
      readme: readmeFragmentRel,
      outputDir: repoOutputDir,
      slug
    };
    repo.filesFragmentPath = filesFragmentRel;
    repo.refsFragmentPath = refsFragmentRel;
    repo.readmeFragmentPath = readmeFragmentRel;
    repo.cloneCommand = cloneCommand;
    repo.logInitialLimit = initialLogLimit;
    repo.logTotalCommits = commits.length;

    generatedSet.add(generatedKey);
  }
}
