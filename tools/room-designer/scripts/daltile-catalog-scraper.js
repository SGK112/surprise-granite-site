/**
 * Daltile Catalog Image Scraper
 *
 * Scrapes product images from Daltile's digital catalog and product pages.
 * Uses the known CDN URL pattern: https://digitalassets.daltile.com/content/dam/Daltile/...
 *
 * Usage:
 *   node daltile-catalog-scraper.js
 *
 * Prerequisites:
 *   npm install puppeteer axios dotenv @supabase/supabase-js cloudinary
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Daltile CDN base URL
const DALTILE_CDN = 'https://digitalassets.daltile.com/content/dam/Daltile';

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '../assets/daltile'),
  materialsJsonPath: path.join(__dirname, '../data/daltile-materials.json'),
  imagesJsonPath: path.join(__dirname, '../data/daltile-images.json'),
  delayBetweenRequests: 2000
};

// Known product image paths from Daltile CDN
// Format: productId -> relative path on CDN
const KNOWN_IMAGE_PATHS = {
  // ONE Quartz Surfaces
  'quartz-calacatta-independence': '/website/images/1-1-ratio/DAL_OQ_NationalMarble_COM_01_CU01_CalacattaIndependence_11web.jpg',
  'quartz-calacatta-laza': '/products/one-quartz-surfaces/colors/calacatta-laza/NQ73_CalacattaLaza_chip.jpg',
  'quartz-carrara-mist': '/products/one-quartz-surfaces/colors/carrara-mist/NQ64_CarraraMist_chip.jpg',
  'quartz-frost-white': '/products/one-quartz-surfaces/colors/frost-white/NQ01_FrostWhite_chip.jpg',
  'quartz-simply-white': '/products/one-quartz-surfaces/colors/simply-white/NQ51_SimplyWhite_chip.jpg',

  // Purevana Mineral Surfaces
  'purevana-calacatta-joule': '/website/images/1-1-ratio/PUR_LQ05_CalacattaJoule_RES_01_OH01_500x500.jpg',

  // Panoramic Porcelain
  'panoramic-elestial': '/website/images/1-1-ratio/PAN_CM48_Elestial_RES_01_11.jpg'
};

// Generate slug from name
function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Download image
async function downloadImage(url, filename) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const filepath = path.join(CONFIG.outputDir, filename);
    await fs.writeFile(filepath, response.data);
    console.log(`  ✓ Downloaded: ${filename}`);
    return filepath;
  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);
    return null;
  }
}

// Scrape digital catalog pages
async function scrapeCatalogPages(browser) {
  const images = [];
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  // Catalog pages to scrape
  const catalogPages = [
    { url: 'https://catalogs.daltile.com/Builder-Studio/', name: 'Builder Studio' },
    { url: 'https://catalogs.daltile.com/Multifamily-Studio/', name: 'Multifamily Studio' },
    { url: 'https://catalogs.daltile.com/Boutique-Box-Custom-Home-Builder/', name: 'Boutique Box' }
  ];

  for (const catalog of catalogPages) {
    console.log(`\nScraping catalog: ${catalog.name}`);

    try {
      await page.goto(catalog.url, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      // Wait for catalog to load
      await page.waitForTimeout(5000);

      // Click through pages to load images
      for (let pageNum = 1; pageNum <= 20; pageNum++) {
        try {
          // Get all images on current page
          const pageImages = await page.evaluate(() => {
            const imgs = document.querySelectorAll('img');
            return Array.from(imgs)
              .map(img => ({
                src: img.src || img.dataset.src,
                alt: img.alt,
                width: img.naturalWidth,
                height: img.naturalHeight
              }))
              .filter(img =>
                img.src &&
                !img.src.includes('splash') &&
                !img.src.includes('loader') &&
                !img.src.includes('icon') &&
                img.width > 100
              );
          });

          if (pageImages.length > 0) {
            console.log(`  Page ${pageNum}: Found ${pageImages.length} images`);
            images.push(...pageImages);
          }

          // Try to go to next page
          const nextButton = await page.$('[class*="next"], [class*="forward"], button[aria-label*="next"]');
          if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(2000);
          } else {
            break;
          }
        } catch (e) {
          break;
        }
      }

    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  await page.close();
  return images;
}

// Scrape main product pages
async function scrapeProductPages(browser) {
  const images = [];
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  // Product pages to scrape
  const productPages = [
    'https://www.daltile.com/products/countertops',
    'https://www.daltile.com/products/tile',
    'https://www.daltile.com/products/natural-stone'
  ];

  for (const url of productPages) {
    console.log(`\nScraping: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for content to load
      await page.waitForTimeout(3000);

      // Get all product images
      const pageImages = await page.evaluate(() => {
        const results = [];

        // Find product tiles/cards
        const productCards = document.querySelectorAll(
          '.product-tile, .product-card, [class*="product"], .swatch, .color-swatch'
        );

        productCards.forEach(card => {
          const img = card.querySelector('img');
          const name = card.querySelector('h3, h4, .product-name, .title')?.textContent?.trim();

          if (img && img.src) {
            results.push({
              src: img.src,
              name: name || img.alt || 'Unknown',
              category: 'product'
            });
          }
        });

        // Also get any images from digitalassets CDN
        const cdnImages = document.querySelectorAll('img[src*="digitalassets.daltile.com"]');
        cdnImages.forEach(img => {
          if (!results.find(r => r.src === img.src)) {
            results.push({
              src: img.src,
              name: img.alt || 'Unknown',
              category: 'cdn'
            });
          }
        });

        return results;
      });

      if (pageImages.length > 0) {
        console.log(`  Found ${pageImages.length} images`);
        images.push(...pageImages);
      }

      // Find and follow product links
      const productLinks = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/products/"]');
        return Array.from(links)
          .map(a => a.href)
          .filter(href => !href.includes('#'))
          .slice(0, 10); // Limit to 10 sub-pages
      });

      for (const link of productLinks) {
        try {
          await page.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });
          await page.waitForTimeout(2000);

          const subImages = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img[src*="digitalassets.daltile.com"]'))
              .map(img => ({
                src: img.src,
                name: img.alt || 'Unknown',
                category: 'product-detail'
              }));
          });

          if (subImages.length > 0) {
            console.log(`    Sub-page found ${subImages.length} images`);
            images.push(...subImages);
          }
        } catch (e) {
          // Skip failed sub-pages
        }

        await new Promise(r => setTimeout(r, CONFIG.delayBetweenRequests));
      }

    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  await page.close();
  return images;
}

// Upload to Cloudinary
async function uploadToCloudinary(imagePath, publicId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;

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
        { width: 600, height: 600, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });
    return result.secure_url;
  } catch (error) {
    console.error(`Cloudinary upload failed: ${error.message}`);
    return null;
  }
}

// Upload to Supabase Storage
async function uploadToSupabase(imagePath, fileName) {
  if (!process.env.SUPABASE_SERVICE_KEY) return null;

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const fileBuffer = await fs.readFile(imagePath);

    const { data, error } = await supabase.storage
      .from('materials')
      .upload(`daltile/${fileName}`, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('materials')
      .getPublicUrl(`daltile/${fileName}`);

    return urlData.publicUrl;
  } catch (error) {
    console.error(`Supabase upload failed: ${error.message}`);
    return null;
  }
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('Daltile Catalog Image Scraper');
  console.log('='.repeat(60));

  // Ensure output directory exists
  await fs.mkdir(CONFIG.outputDir, { recursive: true });

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let allImages = [];

  try {
    // Download known images first
    console.log('\n--- Downloading Known Images ---');
    for (const [productId, relativePath] of Object.entries(KNOWN_IMAGE_PATHS)) {
      const fullUrl = DALTILE_CDN + relativePath;
      const filename = `${productId}.jpg`;
      console.log(`\n${productId}`);

      const localPath = await downloadImage(fullUrl, filename);
      if (localPath) {
        allImages.push({
          productId,
          url: fullUrl,
          localPath,
          source: 'known'
        });
      }
    }

    // Scrape product pages
    console.log('\n--- Scraping Product Pages ---');
    const productImages = await scrapeProductPages(browser);
    allImages.push(...productImages.map(img => ({
      url: img.src,
      name: img.name,
      source: 'product-page'
    })));

    // Scrape catalogs (optional, can be slow)
    if (process.argv.includes('--catalogs')) {
      console.log('\n--- Scraping Digital Catalogs ---');
      const catalogImages = await scrapeCatalogPages(browser);
      allImages.push(...catalogImages.map(img => ({
        url: img.src,
        alt: img.alt,
        source: 'catalog'
      })));
    }

  } finally {
    await browser.close();
  }

  // Remove duplicates
  const uniqueImages = [...new Map(allImages.map(img => [img.url, img])).values()];

  // Save results
  const results = {
    generated: new Date().toISOString(),
    totalImages: uniqueImages.length,
    images: uniqueImages
  };

  await fs.writeFile(CONFIG.imagesJsonPath, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total unique images found: ${uniqueImages.length}`);
  console.log(`Results saved to: ${CONFIG.imagesJsonPath}`);
  console.log('='.repeat(60));

  // Print instructions for manual download
  console.log('\n--- MANUAL IMAGE DOWNLOAD ---');
  console.log('If automated scraping fails, you can manually download images from:');
  console.log('1. https://www.daltile.com/products/countertops');
  console.log('2. https://catalogs.daltile.com/Builder-Studio/');
  console.log('3. Right-click on product images and "Save Image As..."');
  console.log('\nUpload to Cloudinary or Supabase using the upload scripts.');
}

main().catch(console.error);
