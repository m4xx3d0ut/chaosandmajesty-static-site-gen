import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Default configuration values
 */
const defaultConfig = {
  input: './content',
  output: './dist',
  templates: './templates',
  assets: './assets',
  data: './data',
  title: 'Static Site',
  description: 'A static site generated with sitegen',
  styles: ['assets/modern.css'],
  baseUrl: '/',
  pages: [],
  header: { links: [] }
};

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

/**
 * Normalize all paths in the configuration
 */
function normalizePaths(config) {
  const normalized = { ...config };
  
  ['input', 'output', 'templates', 'assets', 'data'].forEach(key => {
    if (normalized[key]) {
      normalized[key] = path.normalize(normalized[key]);
    }
  });
  
  if (normalized.customPaths) {
    normalized.customPaths = Object.entries(normalized.customPaths).reduce((acc, [key, value]) => {
      acc[key] = path.normalize(value);
      return acc;
    }, {});
  }

  const normalizedStaticDocs = normalizeStaticDocs(normalized.staticDocs);
  if (normalizedStaticDocs !== undefined) {
    normalized.staticDocs = normalizedStaticDocs;
  }
  
  return normalized;
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

function normalizeStaticDocs(staticDocs) {
  if (staticDocs === undefined || staticDocs === null) {
    return undefined;
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
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : undefined;
    const includeInSitemapFlag = parseBooleanFlag(entry.includeInSitemap);
    const includeInSitemap = includeInSitemapFlag === null ? false : includeInSitemapFlag;
    normalized.push({
      ...entry,
      path: path.normalize(rawPath),
      basename: rawBasename,
      label,
      includeInSitemap
    });
  });
  return normalized;
}

/**
 * Validate configuration object
 */
function validateConfig(config) {
  const errors = [];
  
  if (!config.title) {
    errors.push('Missing required field: title');
  }
  
  if (config.pages && !Array.isArray(config.pages)) {
    errors.push('pages must be an array');
  }
  
  if (config.sections && !Array.isArray(config.sections)) {
    errors.push('sections must be an array');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
  
  return config;
}

/**
 * Load and normalize configuration from a YAML file
 * @param {string} configPath - Path to the configuration file
 * @returns {Object} Normalized configuration object
 */
export async function loadConfig(configPath) {
  try {
    const configFile = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(configFile) || {};

    const mergedConfig = { ...defaultConfig, ...config };
    const normalizedConfig = normalizePaths(mergedConfig);
    
    return validateConfig(normalizedConfig);
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }
}
