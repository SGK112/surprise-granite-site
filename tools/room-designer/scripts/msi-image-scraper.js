/**
 * MSI Product Image Scraper
 *
 * Scrapes product images from MSI Surfaces website.
 * Images are hosted on their CDN at images.msisurfaces.com
 *
 * Usage:
 *   node msi-image-scraper.js [--quartz] [--lvt] [--cabinets] [--all]
 *
 * Prerequisites:
 *   npm install puppeteer axios
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '../assets/msi'),
  dataDir: path.join(__dirname, '../data'),
  delayBetweenRequests: 1500,
  timeout: 30000
};

// MSI product page URLs
const MSI_URLS = {
  quartz: 'https://www.msisurfaces.com/quartz-countertops/',
  quartzColors: 'https://www.msisurfaces.com/quartz-countertops/q-premium-natural-quartz/',
  lvt: 'https://www.msisurfaces.com/lvt-flooring/',
  lvtCyrus: 'https://www.msisurfaces.com/lvt-flooring/cyrus/',
  lvtPrescott: 'https://www.msisurfaces.com/lvt-flooring/prescott/',
  lvtAndover: 'https://www.msisurfaces.com/lvt-flooring/andover/',
  cabinets: 'https://www.msisurfaces.com/quartz-countertops/', // Cabinets section
  pavers: 'https://www.msisurfaces.com/natural-stone-pavers/',
  stackedStone: 'https://www.msisurfaces.com/stacked-stone/'
};

// Known MSI CDN patterns
const MSI_CDN_PATTERNS = [
  'https://images.msisurfaces.com',
  'https://www.msisurfaces.com/images',
  'https://cdn.msisurfaces.com'
];

// Generate slug from product name
function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Download image to local directory
async function downloadImage(url, filename) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: CONFIG.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.msisurfaces.com/'
      }
    });

    const filepath = path.join(CONFIG.outputDir, filename);
    await fs.writeFile(filepath, response.data);
    console.log(`  ✓ Downloaded: ${filename}`);
    return { success: true, filepath, size: response.data.length };
  } catch (error) {
    console.log(`  ✗ Failed: ${filename} - ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Extract images from a page
async function extractImagesFromPage(page, category) {
  const images = await page.evaluate((cat) => {
    const results = [];

    // Find all product images
    const productCards = document.querySelectorAll(
      '.product-card, .product-tile, .color-tile, .swatch-tile, ' +
      '[class*="product"], [class*="swatch"], [class*="color-item"]'
    );

    productCards.forEach(card => {
      const img = card.querySelector('img');
      const nameEl = card.querySelector('h3, h4, .product-name, .title, .color-name, [class*="name"]');

      if (img) {
        const src = img.src || img.dataset.src || img.dataset.lazySrc;
        const name = nameEl?.textContent?.trim() || img.alt || 'Unknown';

        if (src && !src.includes('placeholder') && !src.includes('loading')) {
          results.push({
            src: src,
            name: name,
            category: cat
          });
        }
      }
    });

    // Also find standalone product images
    const allImages = document.querySelectorAll('img[src*="msisurfaces"], img[data-src*="msisurfaces"]');
    allImages.forEach(img => {
      const src = img.src || img.dataset.src;
      if (src &&
          !results.find(r => r.src === src) &&
          !src.includes('logo') &&
          !src.includes('icon') &&
          !src.includes('banner') &&
          img.naturalWidth > 100) {
        results.push({
          src: src,
          name: img.alt || 'Unknown',
          category: cat
        });
      }
    });

    return results;
  }, category);

  return images;
}

// Scrape quartz products
async function scrapeQuartz(browser) {
  console.log('\n--- Scraping MSI Quartz Products ---');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const images = [];

  try {
    // Main quartz page
    console.log('Loading quartz catalog...');
    await page.goto(MSI_URLS.quartzColors, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for images to load
    await page.waitForTimeout(3000);

    // Scroll to load lazy images
    await autoScroll(page);

    // Extract images
    const pageImages = await extractImagesFromPage(page, 'quartz');
    console.log(`Found ${pageImages.length} quartz images`);
    images.push(...pageImages);

    // Try to find and click on individual color pages
    const colorLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/quartz-countertops/"][href*="-quartz"]');
      return Array.from(links).map(a => a.href).slice(0, 30); // Limit to 30 colors
    });

    console.log(`Found ${colorLinks.length} color detail pages`);

    for (const link of colorLinks) {
      try {
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(1500);

        const detailImages = await page.evaluate(() => {
          const results = [];
          // Get high-res product image
          const mainImg = document.querySelector('.product-image img, .hero-image img, [class*="detail"] img');
          if (mainImg) {
            results.push({
              src: mainImg.src || mainImg.dataset.src,
              name: document.querySelector('h1')?.textContent?.trim() || mainImg.alt,
              category: 'quartz-detail'
            });
          }

          // Get swatch/chip images
          const swatches = document.querySelectorAll('.swatch img, .chip img, [class*="thumbnail"] img');
          swatches.forEach(img => {
            if (img.src && !results.find(r => r.src === img.src)) {
              results.push({
                src: img.src,
                name: img.alt || 'swatch',
                category: 'quartz-swatch'
              });
            }
          });

          return results;
        });

        images.push(...detailImages);
        console.log(`  ${link.split('/').pop()}: ${detailImages.length} images`);

      } catch (e) {
        // Skip failed pages
      }

      await new Promise(r => setTimeout(r, CONFIG.delayBetweenRequests));
    }

  } catch (error) {
    console.log(`Error scraping quartz: ${error.message}`);
  }

  await page.close();
  return images;
}

// Scrape LVT flooring products
async function scrapeLVT(browser) {
  console.log('\n--- Scraping MSI LVT Flooring ---');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const images = [];
  const series = ['cyrus', 'prescott', 'andover', 'ashton', 'laurel', 'trecento'];

  for (const seriesName of series) {
    try {
      const url = `https://www.msisurfaces.com/lvt-flooring/${seriesName}/`;
      console.log(`Loading ${seriesName} series...`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForTimeout(2000);
      await autoScroll(page);

      const seriesImages = await extractImagesFromPage(page, `lvt-${seriesName}`);
      console.log(`  Found ${seriesImages.length} ${seriesName} images`);
      images.push(...seriesImages);

    } catch (error) {
      console.log(`  Error with ${seriesName}: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, CONFIG.delayBetweenRequests));
  }

  await page.close();
  return images;
}

// Scrape hardscape/pavers
async function scrapeHardscape(browser) {
  console.log('\n--- Scraping MSI Hardscape ---');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const images = [];

  const urls = [
    { url: MSI_URLS.pavers, category: 'pavers' },
    { url: MSI_URLS.stackedStone, category: 'stacked-stone' }
  ];

  for (const { url, category } of urls) {
    try {
      console.log(`Loading ${category}...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForTimeout(2000);
      await autoScroll(page);

      const catImages = await extractImagesFromPage(page, category);
      console.log(`  Found ${catImages.length} ${category} images`);
      images.push(...catImages);

    } catch (error) {
      console.log(`  Error with ${category}: ${error.message}`);
    }
  }

  await page.close();
  return images;
}

// Auto-scroll page to trigger lazy loading
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const scrapeAll = args.includes('--all') || args.length === 0;
  const scrapeQuartzFlag = args.includes('--quartz') || scrapeAll;
  const scrapeLVTFlag = args.includes('--lvt') || scrapeAll;
  const scrapeHardscapeFlag = args.includes('--hardscape') || scrapeAll;

  console.log('='.repeat(60));
  console.log('MSI Product Image Scraper');
  console.log('='.repeat(60));

  // Ensure output directory exists
  await fs.mkdir(CONFIG.outputDir, { recursive: true });

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  let allImages = [];

  try {
    if (scrapeQuartzFlag) {
      const quartzImages = await scrapeQuartz(browser);
      allImages.push(...quartzImages);
    }

    if (scrapeLVTFlag) {
      const lvtImages = await scrapeLVT(browser);
      allImages.push(...lvtImages);
    }

    if (scrapeHardscapeFlag) {
      const hardscapeImages = await scrapeHardscape(browser);
      allImages.push(...hardscapeImages);
    }

  } finally {
    await browser.close();
  }

  // Remove duplicates
  const uniqueImages = [...new Map(allImages.map(img => [img.src, img])).values()];
  console.log(`\nTotal unique images found: ${uniqueImages.length}`);

  // Download images
  console.log('\n--- Downloading Images ---');
  const downloaded = [];

  for (const img of uniqueImages) {
    if (!img.src) continue;

    const slug = generateSlug(img.name);
    const ext = img.src.includes('.png') ? 'png' : 'jpg';
    const filename = `${img.category}-${slug}.${ext}`;

    const result = await downloadImage(img.src, filename);
    if (result.success) {
      downloaded.push({
        ...img,
        localPath: result.filepath,
        filename
      });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Save results
  const results = {
    generated: new Date().toISOString(),
    totalFound: uniqueImages.length,
    totalDownloaded: downloaded.length,
    images: downloaded
  };

  const outputPath = path.join(CONFIG.dataDir, 'msi-images.json');
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Images found: ${uniqueImages.length}`);
  console.log(`Images downloaded: ${downloaded.length}`);
  console.log(`Results saved to: ${outputPath}`);
  console.log(`Images saved to: ${CONFIG.outputDir}`);
  console.log('='.repeat(60));

  // Print manual download instructions
  console.log('\n--- ALTERNATIVE: Manual Image Download ---');
  console.log('If automated scraping is blocked, download images manually:');
  console.log('1. Visit https://www.msisurfaces.com/quartz-countertops/');
  console.log('2. Right-click product images → "Save Image As..."');
  console.log('3. Save to: tools/room-designer/assets/msi/');
  console.log('\nOr use the MSI Quartz Visualizer:');
  console.log('https://www.msisurfaces.com/quartz-visualizer/');
}

main().catch(console.error);
