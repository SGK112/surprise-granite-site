#!/usr/bin/env node
/**
 * Bravo Tile Image Scraper
 * Scrapes product images from bravotileandstone.com (Wix site)
 *
 * Usage: node scripts/scrape-bravo-images.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  sitemapUrl: 'https://www.bravotileandstone.com/store-products-sitemap.xml',
  outputDir: path.join(__dirname, '../images/vendors/bravo-tile'),
  jsonOutputFile: path.join(__dirname, '../data/bravo-tile-images.json'),
  delayBetweenRequests: 1000, // 1 second delay to be polite
  maxConcurrent: 3,
  timeout: 15000,
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  console.log(`Created directory: ${CONFIG.outputDir}`);
}

/**
 * Fetch URL with timeout
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      timeout: CONFIG.timeout,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Download image to file
 */
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: CONFIG.timeout,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(filepath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(filepath);
      });

      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete partial file
        reject(err);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Parse sitemap XML to get product URLs
 */
function parseSitemap(xml) {
  const urls = [];
  const regex = /<loc>(https:\/\/www\.bravotileandstone\.com\/product-page\/[^<]+)<\/loc>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Extract product name from URL
 */
function getProductNameFromUrl(url) {
  const slug = url.split('/product-page/')[1] || '';
  return slug
    .replace(/-/g, ' ')
    .replace(/copy of /gi, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

/**
 * Create safe filename from product name
 */
function createFilename(productName) {
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) + '.jpg';
}

/**
 * Extract main product image from page HTML
 */
function extractProductImage(html) {
  // Look for wixstatic.com image URLs in the HTML
  // Pattern: https://static.wixstatic.com/media/7b5021_[hash]~mv2.jpg

  // Try to find the main product image (usually in og:image or main content)
  const patterns = [
    // Open Graph image (most reliable for product image)
    /property="og:image"\s+content="([^"]+wixstatic\.com\/media\/[^"]+)"/i,
    /content="([^"]+wixstatic\.com\/media\/[^"]+)"\s+property="og:image"/i,

    // Image in product gallery
    /src="(https:\/\/static\.wixstatic\.com\/media\/7b5021_[a-f0-9]+~mv2\.[a-z]+)/i,

    // Any wixstatic product image (7b5021 is their account ID)
    /(https:\/\/static\.wixstatic\.com\/media\/7b5021_[a-f0-9]+~mv2\.(jpg|jpeg|png|webp))/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let imageUrl = match[1];

      // Clean up the URL - get the base image without resize params
      const baseMatch = imageUrl.match(/(https:\/\/static\.wixstatic\.com\/media\/[^\/]+)/);
      if (baseMatch) {
        imageUrl = baseMatch[1];
      }

      // Skip logo and icon images
      if (imageUrl.includes('24cc94bd4e99') || // logo
          imageUrl.includes('1b86aa0aa88a') || // favicon
          imageUrl.includes('0fdef751') ||
          imageUrl.includes('01c3aff5')) {
        continue;
      }

      return imageUrl;
    }
  }

  return null;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process a single product
 */
async function processProduct(url, index, total) {
  const productName = getProductNameFromUrl(url);
  const filename = createFilename(productName);
  const filepath = path.join(CONFIG.outputDir, filename);

  // Skip if already downloaded
  if (fs.existsSync(filepath)) {
    console.log(`[${index + 1}/${total}] SKIP (exists): ${productName}`);
    return {
      name: productName,
      url: url,
      image: `/images/vendors/bravo-tile/${filename}`,
      status: 'exists'
    };
  }

  try {
    // Fetch product page
    const html = await fetchUrl(url);

    // Extract image URL
    const imageUrl = extractProductImage(html);

    if (!imageUrl) {
      console.log(`[${index + 1}/${total}] NO IMAGE: ${productName}`);
      return {
        name: productName,
        url: url,
        image: null,
        status: 'no_image'
      };
    }

    // Download image
    await downloadImage(imageUrl, filepath);

    console.log(`[${index + 1}/${total}] OK: ${productName}`);

    return {
      name: productName,
      url: url,
      image: `/images/vendors/bravo-tile/${filename}`,
      sourceUrl: imageUrl,
      status: 'downloaded'
    };

  } catch (error) {
    console.log(`[${index + 1}/${total}] ERROR: ${productName} - ${error.message}`);
    return {
      name: productName,
      url: url,
      image: null,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Main scraper function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Bravo Tile Image Scraper');
  console.log('='.repeat(60));

  // Step 1: Fetch sitemap
  console.log('\n[1/3] Fetching sitemap...');
  let sitemap;
  try {
    sitemap = await fetchUrl(CONFIG.sitemapUrl);
  } catch (error) {
    console.error('Failed to fetch sitemap:', error.message);
    process.exit(1);
  }

  // Step 2: Parse product URLs
  console.log('[2/3] Parsing product URLs...');
  const productUrls = parseSitemap(sitemap);
  console.log(`Found ${productUrls.length} products`);

  if (productUrls.length === 0) {
    console.error('No products found in sitemap');
    process.exit(1);
  }

  // Step 3: Process each product
  console.log(`[3/3] Downloading images (${CONFIG.delayBetweenRequests}ms delay between requests)...\n`);

  const results = [];
  const stats = { downloaded: 0, exists: 0, no_image: 0, error: 0 };

  for (let i = 0; i < productUrls.length; i++) {
    const result = await processProduct(productUrls[i], i, productUrls.length);
    results.push(result);
    stats[result.status]++;

    // Delay between requests
    if (i < productUrls.length - 1) {
      await sleep(CONFIG.delayBetweenRequests);
    }
  }

  // Save results to JSON
  console.log('\nSaving results...');
  fs.writeFileSync(CONFIG.jsonOutputFile, JSON.stringify(results, null, 2));

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total products:  ${productUrls.length}`);
  console.log(`Downloaded:      ${stats.downloaded}`);
  console.log(`Already existed: ${stats.exists}`);
  console.log(`No image found:  ${stats.no_image}`);
  console.log(`Errors:          ${stats.error}`);
  console.log(`\nImages saved to: ${CONFIG.outputDir}`);
  console.log(`Results JSON:    ${CONFIG.jsonOutputFile}`);
}

// Run
main().catch(console.error);
