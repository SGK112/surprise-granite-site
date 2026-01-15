/**
 * Browser Console Scraper for Daltile Images
 *
 * INSTRUCTIONS:
 * 1. Go to https://www.daltile.com/
 * 2. Open DevTools (F12 or Cmd+Option+I)
 * 3. Go to Console tab
 * 4. Paste this entire script and press Enter
 * 5. The script will output image URLs that you can then download
 *
 * This is a simpler alternative to the Node.js scraper that runs in your browser.
 */

(async function() {
  console.log('%c=== Daltile Image Scraper ===', 'color: #4CAF50; font-size: 16px; font-weight: bold');

  // Products from the Daltile CTF Price List
  const products = [
    // Granite
    { name: 'Absolute Black', category: 'granite' },
    { name: 'Alaska White', category: 'granite' },
    { name: 'Bianco Antico', category: 'granite' },
    { name: 'Black Galaxy', category: 'granite' },
    { name: 'Blue Pearl', category: 'granite' },
    { name: 'Giallo Ornamental', category: 'granite' },
    { name: 'New Venetian Gold', category: 'granite' },
    { name: 'Santa Cecilia', category: 'granite' },
    { name: 'Steel Grey', category: 'granite' },
    { name: 'Uba Tuba', category: 'granite' },
    // Quartz
    { name: 'Alabaster White Quartz', category: 'quartz' },
    { name: 'Carrara Mist Quartz', category: 'quartz' },
    { name: 'Frost White Quartz', category: 'quartz' },
    { name: 'Calacatta Laza Quartz', category: 'quartz' },
    { name: 'Simply White Quartz', category: 'quartz' }
  ];

  const results = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  console.log(`Searching for ${products.length} products...`);
  console.log('This may take a few minutes. Please wait...\n');

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] Searching: ${product.name}`);

    try {
      // Use Daltile's search API
      const searchUrl = `https://www.daltile.com/search?q=${encodeURIComponent(product.name)}`;

      const response = await fetch(searchUrl);
      const html = await response.text();

      // Parse the HTML to find product images
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Look for product images in search results
      const images = doc.querySelectorAll('img[src*="daltile"], img[data-src*="daltile"]');

      let imageUrl = null;
      for (const img of images) {
        const src = img.src || img.dataset.src;
        if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('placeholder')) {
          imageUrl = src;
          break;
        }
      }

      if (imageUrl) {
        console.log(`  ✓ Found: ${imageUrl}`);
        results.push({
          name: product.name,
          category: product.category,
          imageUrl: imageUrl
        });
      } else {
        console.log(`  ✗ No image found`);
        results.push({
          name: product.name,
          category: product.category,
          imageUrl: null
        });
      }

    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      results.push({
        name: product.name,
        category: product.category,
        imageUrl: null,
        error: error.message
      });
    }

    // Delay between requests to be respectful
    await delay(1000);
  }

  // Output results
  console.log('\n%c=== RESULTS ===', 'color: #2196F3; font-size: 14px; font-weight: bold');
  console.table(results);

  // Generate downloadable JSON
  const jsonData = JSON.stringify(results, null, 2);
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  console.log('\n%cDownload results:', 'color: #FF9800; font-weight: bold');
  console.log(url);
  console.log('Right-click the URL above and "Save link as..." to download the JSON file');

  // Also provide copy-paste format
  console.log('\n%cFor manual download, copy this:', 'color: #9C27B0; font-weight: bold');
  console.log(jsonData);

  return results;
})();
