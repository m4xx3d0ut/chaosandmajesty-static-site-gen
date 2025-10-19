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

export const DEFAULT_COMMIT_LIMIT = 40;
export const DEFAULT_CLONE_DEPTH = 1;

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

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

async function loadGitTree(repoPath, ref, verbose = false) {
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
    return parseTreeOutput(stdout);
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

function parseTreeOutput(output) {
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

async function loadGitRefs(repoPath, verbose = false) {
  const args = [
    '-C',
    repoPath,
    'for-each-ref',
    '--format=%(refname)\t%(objectname:short)\t%(committerdate:iso8601)\t%(committerdate:relative)\t%(authorname)\t%(subject)',
    'refs/heads',
    'refs/tags'
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
      }
    });
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
      return { skipped: true, reason: 'Binary file preview is not available.' };
    }
    const content = buffer.toString('utf8');
    return { content };
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
    return `
      <article class="git-panel git-file-panel" data-git-panel-section="blob">
        <header class="git-file-header">
          <h4 class="git-file-title">${escapeHtml(payload && payload.fileName ? payload.fileName : 'File preview')}</h4>
        </header>
        <div class="git-file-empty">${reason}</div>
      </article>
    `;
  }
  return `
    <article class="git-panel git-file-panel" data-git-panel-section="blob">
      <header class="git-file-header">
        <h4 class="git-file-title">${escapeHtml(payload.fileName || 'File preview')}</h4>
        <div class="git-file-meta">
          ${payload.sizeLabel ? `<span>${escapeHtml(payload.sizeLabel)}</span>` : ''}
          ${payload.path ? `<span>${escapeHtml(payload.path)}</span>` : ''}
        </div>
      </header>
      <div class="git-file-body">
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
  verbose = false
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
  const result = await loadGitBlob(repoPath, ref, fileNode.path, verbose);

  let bodyHtml = '';
  let skipped = false;
  let reason = null;
  if (result.skipped) {
    skipped = true;
    reason = result.reason;
  } else {
    if (isLikelyMarkdown(fileNode.path)) {
      bodyHtml = marked.parse(result.content || '');
    } else {
      bodyHtml = `<pre><code>${escapeHtml(result.content || '')}</code></pre>`;
    }
  }

  const payload = skipped
    ? { skipped: true, reason, fileName: fileNode.name, path: fileNode.path }
    : {
        fileName: fileNode.name,
        path: fileNode.path,
        sizeLabel: formatFileSize(fileNode.size),
        bodyHtml
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

  for (const repo of repos) {
    const generatedKey = defaultGeneratedKey(repo);
    if (!repo || generatedSet.has(generatedKey)) {
      continue;
    }
    if (!repo.localPath) {
      if (verbose) {
        console.warn(`[git-artifacts] Skipping ${repo.label || repo.id || repo.httpUrl}: no localPath specified.`);
      }
      continue;
    }

    const slug = sanitizeSlug(repo.id || repo.label || repo.repoPath || 'repo');
    const repoOutputDir = path.join(outputDir, 'git', slug);
    await fs.mkdir(repoOutputDir, { recursive: true });

    const commitLimit = Number.isFinite(repo.commitLimit) && repo.commitLimit > 0
      ? Math.floor(repo.commitLimit)
      : DEFAULT_COMMIT_LIMIT;

    const { ref, display } = await resolveGitRef(repo.localPath, repo.branch, verbose);
    const commitsRaw = await loadGitCommits(repo.localPath, ref, commitLimit, verbose);
    const detailBaseUrl = deriveCommitDetailBase(repo.detailUrl);
    const commits = enrichCommits(commitsRaw, detailBaseUrl, display);
    const cloneUrl = buildCloneUrl(repo);
    const cloneCommand = buildCloneCommand({
      url: cloneUrl
    });

    const payload = {
      site: siteConfig,
      page: pageConfig,
      repo: buildRepoSummary(repo, display, detailBaseUrl),
      commits,
      clone: {
        url: cloneUrl,
        command: cloneCommand,
        branch: display || repo.branch || ''
      },
      stats: {
        generatedAtIso: new Date().toISOString(),
        totalCommits: commits.length,
        ref,
        refDisplay: display
      }
    };

    const panelHtml = await renderRepoPanel(templatePath, payload, buildFallbackPanelHtml);
    const panelOutputPath = path.join(repoOutputDir, 'index.html');
    await fs.writeFile(panelOutputPath, panelHtml, 'utf8');

    const commitsOutputPath = path.join(repoOutputDir, 'commits.json');
    await writeJson(commitsOutputPath, {
      repo: payload.repo,
      clone: payload.clone,
      commits
    });

    const fragmentRel = toPosixPath(path.join('git', slug, 'index.html'));
    const commitsRel = toPosixPath(path.join('git', slug, 'commits.json'));

    const treeData = await loadGitTree(repo.localPath, ref, verbose);
    const blobArtifacts = new Map();
    let readmeCandidateNode = null;
    let readmeBlob = null;

    for (const fileNode of treeData.files) {
      fileNode.isMarkdown = isLikelyMarkdown(fileNode.path);
      const blobInfo = await ensureBlobFragment({
        repoPath: repo.localPath,
        repoOutputDir,
        slug,
        fileNode,
        ref,
        templatesDir,
        verbose
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

    const refsData = await loadGitRefs(repo.localPath, verbose);
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
    repo.commitsJsonPath = commitsRel;
    repo.generatedArtifacts = {
      panel: fragmentRel,
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

    generatedSet.add(generatedKey);
  }
}
