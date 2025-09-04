import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Load and normalize configuration from a YAML file
 * @param {string} configPath - Path to the configuration file
 * @returns {Object} Normalized configuration object
 */
export async function loadConfig(configPath) {
  const defaultConfig = {
    input: './content',
    output: './dist',
    templates: './templates',
    assets: './assets',
    data: './data'
  };
  
  try {
    const configFile = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(configFile) || {};
    
    const mergedConfig = { ...defaultConfig, ...config };
    return normalizePaths(mergedConfig);
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }
}

/**
 * Normalize all paths in the configuration
 * @param {Object} config - Configuration object
 * @returns {Object} Configuration with normalized paths
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
