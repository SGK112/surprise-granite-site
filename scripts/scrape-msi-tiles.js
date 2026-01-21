#!/usr/bin/env node
/**
 * Scrape MSI tile products from their website
 * Run with: node scripts/scrape-msi-tiles.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/tile.json');

// MSI tile category URLs to scrape
const MSI_URLS = [
  'https://www.msisurfaces.com/porcelain-tile/',
  'https://www.msisurfaces.com/ceramic-tile/',
  'https://www.msisurfaces.com/natural-stone-tile/',
  'https://www.msisurfaces.com/glass-tile/',
  'https://www.msisurfaces.com/decorative-mosaics/'
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractTilesFromHTML(html, category) {
  const tiles = [];

  // Look for product cards - MSI uses various patterns
  const productPatterns = [
    /<a[^>]*href="([^"]*\/tile\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<h[23][^>]*>([^<]+)/gi,
    /class="product-card"[\s\S]*?href="([^"]+)"[\s\S]*?src="([^"]+)"[\s\S]*?title">([^<]+)/gi,
    /data-product[\s\S]*?href="([^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?name[^>]*>([^<]+)/gi
  ];

  for (const pattern of productPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const [, url, image, name] = match;
      if (url && name) {
        const slug = url.split('/').filter(Boolean).pop() ||
                     name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        tiles.push({
          name: name.trim(),
          slug: slug,
          brand: 'msi',
          primaryImage: image || '',
          primaryColor: '',
          type: category,
          material: category,
          category: 'tile'
        });
      }
    }
  }

  return tiles;
}

async function scrapeMSITiles() {
  console.log('Scraping MSI tiles...\n');

  const allNewTiles = [];

  for (const url of MSI_URLS) {
    const category = url.split('/').filter(Boolean).pop().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    console.log(`Fetching ${category}...`);

    try {
      const html = await fetchPage(url);
      const tiles = extractTilesFromHTML(html, category);
      console.log(`  Found ${tiles.length} tiles`);
      allNewTiles.push(...tiles);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  console.log(`\nTotal new tiles scraped: ${allNewTiles.length}`);

  // Load existing tiles
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingSlugs = new Set(existingData.tiles.map(t => t.slug));

  // Add only new tiles
  let addedCount = 0;
  for (const tile of allNewTiles) {
    if (!existingSlugs.has(tile.slug)) {
      existingData.tiles.push(tile);
      existingSlugs.add(tile.slug);
      addedCount++;
    }
  }

  console.log(`Added ${addedCount} new unique tiles`);
  console.log(`Total tiles now: ${existingData.tiles.length}`);

  // Update filters
  const materials = new Set();
  const colors = new Set();
  const styles = new Set();
  const brands = new Set();

  existingData.tiles.forEach(tile => {
    if (tile.material) materials.add(tile.material);
    if (tile.primaryColor) colors.add(tile.primaryColor);
    if (tile.type) styles.add(tile.type);
    if (tile.brand) brands.add(tile.brand);
  });

  existingData.filters = {
    materials: [...materials].sort(),
    colors: [...colors].sort(),
    styles: [...styles].sort(),
    brands: [...brands].sort()
  };

  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingData, null, 2));
  console.log('\nSaved to', OUTPUT_FILE);
}

scrapeMSITiles().catch(console.error);
