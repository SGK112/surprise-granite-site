/**
 * Daltile Product Image Scraper
 *
 * This script scrapes product images from Daltile.com and uploads them
 * to either Cloudinary or Supabase storage.
 *
 * Usage:
 *   node daltile-scraper.js --storage=cloudinary
 *   node daltile-scraper.js --storage=supabase
 *
 * Prerequisites:
 *   npm install axios cheerio puppeteer cloudinary @supabase/supabase-js dotenv
 */

const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '../assets/daltile'),
  materialsJsonPath: path.join(__dirname, '../data/daltile-materials.json'),
  baseUrl: 'https://www.daltile.com',
  delayBetweenRequests: 1500, // Be respectful to the server
  maxRetries: 3
};

// Product categories and their URL patterns on Daltile.com
const PRODUCT_CATEGORIES = {
  granite: {
    searchUrl: '/natural-stone/granite',
    type: 'countertop'
  },
  marble: {
    searchUrl: '/natural-stone/marble',
    type: 'countertop'
  },
  quartzite: {
    searchUrl: '/natural-stone/quartzite',
    type: 'countertop'
  },
  quartz: {
    searchUrl: '/one-quartz-surfaces',
    type: 'countertop'
  },
  porcelain: {
    searchUrl: '/tile/porcelain-tile',
    type: 'tile'
  },
  ceramic: {
    searchUrl: '/tile/ceramic-tile',
    type: 'tile'
  }
};

// Products from the Daltile CTF Price List (January 2026)
const PRICE_LIST_PRODUCTS = {
  granite: [
    { name: 'Absolute Black', sku: 'L75712121L', price: 10.45 },
    { name: 'African Rainbow', sku: 'L79012121L', price: 16.05 },
    { name: 'Alaska White', sku: 'L77612121L', price: 23.40 },
    { name: 'Ambrosia White', sku: 'L78212121L', price: 31.45 },
    { name: 'Azul Platino', sku: 'L79412121L', price: 16.05 },
    { name: 'Baltic Brown', sku: 'L75512121L', price: 10.45 },
    { name: 'Bianco Antico', sku: 'L79912121L', price: 25.90 },
    { name: 'Bianco Romano', sku: 'L80012121L', price: 16.05 },
    { name: 'Black Galaxy', sku: 'L76712121L', price: 10.45 },
    { name: 'Black Pearl', sku: 'L76612121L', price: 10.45 },
    { name: 'Blue Pearl', sku: 'L75812121L', price: 16.05 },
    { name: 'Cafe Imperial', sku: 'L79612121L', price: 16.05 },
    { name: 'Caledonia', sku: 'L78012121L', price: 10.45 },
    { name: 'Colonial White', sku: 'L79512121L', price: 23.40 },
    { name: 'Delicatus White', sku: 'L80812121L', price: 31.45 },
    { name: 'Fantasy Brown', sku: 'L81212121L', price: 25.90 },
    { name: 'Giallo Napoli', sku: 'L81312121L', price: 23.40 },
    { name: 'Giallo Ornamental', sku: 'L76012121L', price: 10.45 },
    { name: 'Giallo Vitoria', sku: 'L80512121L', price: 16.05 },
    { name: 'Golden Crema', sku: 'L80212121L', price: 10.45 },
    { name: 'Golden Leaf', sku: 'L81012121L', price: 16.05 },
    { name: 'Ivory Fantasy', sku: 'L81612121L', price: 16.05 },
    { name: 'Luna Pearl', sku: 'L75912121L', price: 10.45 },
    { name: 'Mombasa', sku: 'L81412121L', price: 10.45 },
    { name: 'Moon White', sku: 'L80112121L', price: 10.45 },
    { name: 'New Venetian Gold', sku: 'L76112121L', price: 10.45 },
    { name: 'Ornamental White', sku: 'L80912121L', price: 23.40 },
    { name: 'River White', sku: 'L80712121L', price: 23.40 },
    { name: 'Rosa Beta', sku: 'L76412121L', price: 5.80 },
    { name: 'Santa Cecilia', sku: 'L76212121L', price: 10.45 },
    { name: 'Sapphire Blue', sku: 'L79212121L', price: 16.05 },
    { name: 'Silver Cloud', sku: 'L79712121L', price: 10.45 },
    { name: 'Snowfall', sku: 'L81512121L', price: 25.90 },
    { name: 'Steel Grey', sku: 'L78512121L', price: 10.45 },
    { name: 'Tan Brown', sku: 'L75612121L', price: 10.45 },
    { name: 'Typhoon Bordeaux', sku: 'L79812121L', price: 25.90 },
    { name: 'Uba Tuba', sku: 'L76312121L', price: 5.80 },
    { name: 'White Ice', sku: 'L81112121L', price: 23.40 }
  ],
  marble: [
    { name: 'Carrara White C', sku: 'M70112181U', price: 10.45 },
    { name: 'Carrara White Polished', sku: 'M70112181L', price: 12.25 },
    { name: 'First Snow Elegance', sku: 'M19012181L', price: 38.80 }
  ],
  quartzite: [
    { name: 'Allure', sku: 'L02712121L', price: 39.85 },
    { name: 'Azul Macaubas', sku: 'L02512121L', price: 39.85 },
    { name: 'Calacatta Macaubas', sku: 'L02612121L', price: 39.85 },
    { name: 'Fusion', sku: 'L02412121L', price: 39.85 },
    { name: 'Madre Perla', sku: 'L02812121L', price: 31.20 },
    { name: 'Sea Pearl', sku: 'L02312121L', price: 39.85 },
    { name: 'Super White', sku: 'L02212121L', price: 39.85 },
    { name: 'Taj Mahal', sku: 'L02112121L', price: 39.85 },
    { name: 'White Macaubas', sku: 'L02012121L', price: 39.85 }
  ],
  quartz: [
    { name: 'Aalto', sku: 'NQ93', price: 21.15 },
    { name: 'Alabaster White', sku: 'NQ90', price: 7.90 },
    { name: 'Arctic', sku: 'NQ62', price: 21.15 },
    { name: 'Ash Grey', sku: 'NQ57', price: 12.60 },
    { name: 'Bento', sku: 'NQ30', price: 21.15 },
    { name: 'Calcutta Vicenza', sku: 'NQ08', price: 25.50 },
    { name: 'Calacatta Laza', sku: 'NQ73', price: 34.60 },
    { name: 'Carrara Mist', sku: 'NQ64', price: 21.15 },
    { name: 'Crystalline', sku: 'NQ60', price: 21.15 },
    { name: 'Empire Grey', sku: 'NQ96', price: 21.15 },
    { name: 'Frost White', sku: 'NQ01', price: 12.60 },
    { name: 'Gardenia White', sku: 'NQ09', price: 12.60 },
    { name: 'Iced White', sku: 'NQ67', price: 21.15 },
    { name: 'Lyra', sku: 'NQ05', price: 21.15 },
    { name: 'Marisol', sku: 'NQ97', price: 21.15 },
    { name: 'Midnight Majesty', sku: 'NQ10', price: 21.15 },
    { name: 'Moonshine', sku: 'NQ94', price: 21.15 },
    { name: 'Oyster', sku: 'NQ52', price: 12.60 },
    { name: 'Pebble Grey', sku: 'NQ59', price: 12.60 },
    { name: 'Polar', sku: 'NQ04', price: 12.60 },
    { name: 'Sahara Beige', sku: 'NQ56', price: 12.60 },
    { name: 'Sandy Ridge', sku: 'NQ69', price: 21.15 },
    { name: 'Shadow Grey', sku: 'NQ58', price: 12.60 },
    { name: 'Simply White', sku: 'NQ51', price: 7.90 },
    { name: 'Smoke', sku: 'NQ03', price: 12.60 },
    { name: 'Snow Drift', sku: 'NQ72', price: 21.15 },
    { name: 'Sparkling White', sku: 'NQ02', price: 12.60 },
    { name: 'Sterling', sku: 'NQ76', price: 21.15 },
    { name: 'Urban Putty', sku: 'NQ54', price: 12.60 },
    { name: 'White Lace', sku: 'NQ79', price: 21.15 }
  ]
};

// Cloudinary upload helper
async function uploadToCloudinary(imagePath, publicId) {
  const cloudinary = require('cloudinary').v2;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      public_id: `daltile/${publicId}`,
      folder: 'surprise-granite/materials',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });
    return result.secure_url;
  } catch (error) {
    console.error(`Cloudinary upload failed for ${publicId}:`, error.message);
    return null;
  }
}

// Supabase upload helper
async function uploadToSupabase(imageBuffer, fileName) {
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co',
    process.env.SUPABASE_SERVICE_KEY // Need service key for storage uploads
  );

  try {
    const { data, error } = await supabase.storage
      .from('materials')
      .upload(`daltile/${fileName}`, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('materials')
      .getPublicUrl(`daltile/${fileName}`);

    return urlData.publicUrl;
  } catch (error) {
    console.error(`Supabase upload failed for ${fileName}:`, error.message);
    return null;
  }
}

// Scrape product page for image
async function scrapeProductImage(browser, productName, category) {
  const page = await browser.newPage();

  try {
    // Set user agent to avoid blocking
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Search for the product
    const searchUrl = `${CONFIG.baseUrl}/search?q=${encodeURIComponent(productName)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for search results
    await page.waitForSelector('.product-tile, .search-result, [class*="product"]', { timeout: 10000 }).catch(() => null);

    // Get the first product link
    const productLink = await page.evaluate(() => {
      const link = document.querySelector('.product-tile a, .search-result a, [class*="product"] a');
      return link ? link.href : null;
    });

    if (!productLink) {
      console.log(`  No product found for: ${productName}`);
      await page.close();
      return null;
    }

    // Go to product page
    await page.goto(productLink, { waitUntil: 'networkidle2', timeout: 30000 });

    // Get the main product image
    const imageUrl = await page.evaluate(() => {
      // Try various selectors for product images
      const selectors = [
        '.product-image img',
        '.pdp-image img',
        '[class*="gallery"] img',
        '.main-image img',
        '#product-image img',
        'img[src*="daltile"]'
      ];

      for (const selector of selectors) {
        const img = document.querySelector(selector);
        if (img && img.src && !img.src.includes('placeholder')) {
          return img.src;
        }
      }

      // Fallback: find any large product image
      const allImages = document.querySelectorAll('img');
      for (const img of allImages) {
        if (img.width > 200 && img.height > 200 && img.src && !img.src.includes('icon')) {
          return img.src;
        }
      }

      return null;
    });

    await page.close();
    return imageUrl;

  } catch (error) {
    console.error(`  Error scraping ${productName}:`, error.message);
    await page.close();
    return null;
  }
}

// Download image to buffer
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`  Failed to download image: ${error.message}`);
    return null;
  }
}

// Generate slug from product name
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Main scraping function
async function scrapeAndUpload(storageType = 'cloudinary') {
  console.log('='.repeat(60));
  console.log('Daltile Product Image Scraper');
  console.log(`Storage: ${storageType}`);
  console.log('='.repeat(60));

  // Ensure output directories exist
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  await fs.mkdir(path.dirname(CONFIG.materialsJsonPath), { recursive: true });

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const materials = [];
  let successCount = 0;
  let failCount = 0;

  try {
    // Process each category
    for (const [category, products] of Object.entries(PRICE_LIST_PRODUCTS)) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`Processing ${category.toUpperCase()} (${products.length} products)`);
      console.log('─'.repeat(50));

      for (const product of products) {
        console.log(`\n→ ${product.name}`);

        // Scrape the image URL
        const imageUrl = await scrapeProductImage(browser, product.name, category);

        if (!imageUrl) {
          console.log('  ✗ No image found');
          failCount++;

          // Still add to materials with placeholder
          materials.push({
            id: generateSlug(`${category}-${product.name}`),
            name: product.name,
            category: category,
            type: PRODUCT_CATEGORIES[category]?.type || 'countertop',
            sku: product.sku,
            price: product.price,
            priceUnit: 'sqft',
            image: null,
            brand: 'Daltile',
            source: 'Daltile CTF Price List 2026'
          });
          continue;
        }

        console.log(`  ✓ Found image: ${imageUrl.substring(0, 60)}...`);

        // Download the image
        const imageBuffer = await downloadImage(imageUrl);

        if (!imageBuffer) {
          console.log('  ✗ Download failed');
          failCount++;
          continue;
        }

        // Upload to chosen storage
        const fileName = `${generateSlug(category)}-${generateSlug(product.name)}.jpg`;
        let uploadedUrl = null;

        if (storageType === 'cloudinary') {
          // Save locally first, then upload
          const localPath = path.join(CONFIG.outputDir, fileName);
          await fs.writeFile(localPath, imageBuffer);
          uploadedUrl = await uploadToCloudinary(localPath, generateSlug(`${category}-${product.name}`));
        } else if (storageType === 'supabase') {
          uploadedUrl = await uploadToSupabase(imageBuffer, fileName);
        } else {
          // Local storage only
          const localPath = path.join(CONFIG.outputDir, fileName);
          await fs.writeFile(localPath, imageBuffer);
          uploadedUrl = `/tools/room-designer/assets/daltile/${fileName}`;
        }

        if (uploadedUrl) {
          console.log(`  ✓ Uploaded: ${uploadedUrl.substring(0, 60)}...`);
          successCount++;
        } else {
          console.log('  ✗ Upload failed');
          failCount++;
        }

        // Add to materials list
        materials.push({
          id: generateSlug(`${category}-${product.name}`),
          name: product.name,
          category: category,
          type: PRODUCT_CATEGORIES[category]?.type || 'countertop',
          sku: product.sku,
          price: product.price,
          priceUnit: 'sqft',
          image: uploadedUrl || imageUrl,
          brand: 'Daltile',
          source: 'Daltile CTF Price List 2026'
        });

        // Delay between requests
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
      }
    }

  } finally {
    await browser.close();
  }

  // Save materials JSON
  const materialsData = {
    version: '1.0',
    generated: new Date().toISOString(),
    source: 'Daltile CTF Price List - Effective January 1, 2026',
    materials: materials
  };

  await fs.writeFile(
    CONFIG.materialsJsonPath,
    JSON.stringify(materialsData, null, 2)
  );

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total products: ${materials.length}`);
  console.log(`Successfully scraped: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Materials JSON saved to: ${CONFIG.materialsJsonPath}`);
  console.log('='.repeat(60));

  return materials;
}

// CLI argument parsing
const args = process.argv.slice(2);
const storageArg = args.find(a => a.startsWith('--storage='));
const storageType = storageArg ? storageArg.split('=')[1] : 'local';

// Validate storage type
if (!['cloudinary', 'supabase', 'local'].includes(storageType)) {
  console.error('Invalid storage type. Use: cloudinary, supabase, or local');
  process.exit(1);
}

// Run the scraper
scrapeAndUpload(storageType).catch(error => {
  console.error('Scraper failed:', error);
  process.exit(1);
});
