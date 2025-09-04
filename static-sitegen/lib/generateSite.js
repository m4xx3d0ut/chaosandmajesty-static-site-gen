import { promises as fs } from 'fs';
import path from 'path';
import { marked } from 'marked';
import * as ejs from 'ejs';

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
    
    // Generate index page if specified
    if (updatedConfig.index) {
      await generatePage({...updatedConfig.index, isIndex: true, sectionMap}, updatedConfig, outputDir, verbose, 'index.html');
    } else {
      // Create a default index page
      await generatePage({
        title: updatedConfig.title,
        content: updatedConfig.description || `Welcome to ${updatedConfig.title}`,
        isIndex: true,
        sectionMap
      }, updatedConfig, outputDir, verbose, 'index.html');
    }
    
    // Create a sitemap.html file with links to all pages
    const pages = ['index.html'];
    
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

