#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import { generateSite } from '../lib/generateSite.js'; 
import { loadConfig } from '../lib/loadConfig.js'; 

const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename); 

program
  .name('sitegen')
  .requiredOption('-c, --config <path>', 'path to YAML config file')
  .option('-o, --output <directory>', 'output directory', './dist')
  .option('-v, --verbose', 'enable verbose output')
  .parse(process.argv);

const options = program.opts();

try {
  const configPath = path.resolve(process.cwd(), options.config);
  const config = await loadConfig(configPath);
  
  const outputDir = path.resolve(process.cwd(), options.output);
  
  const result = await generateSite(config, outputDir, options.verbose);
  
  if (options.verbose) {
    console.log(`Site generated successfully in ${outputDir}`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
