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
