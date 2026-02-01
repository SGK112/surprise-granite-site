/**
 * MSI Surfaces Scraper
 * Scrapes product data from msisurfaces.com
 */

const BaseScraper = require('../base-scraper');

class MSIScraper extends BaseScraper {
  constructor() {
    super({
      vendorId: 'msi',
      vendorName: 'MSI Surfaces',
      baseUrl: 'https://www.msisurfaces.com',
      minDelay: 2000,
      maxDelay: 4000
    });

    this.categories = [
      { name: 'Quartz', url: '/quartz-countertops' },
      { name: 'Granite', url: '/natural-stone-granite' },
      { name: 'Marble', url: '/natural-stone-marble' },
      { name: 'Quartzite', url: '/natural-stone-quartzite' },
      { name: 'Porcelain', url: '/porcelain-countertops' }
    ];
  }

  async scrape() {
    console.log(`[${this.vendorId}] Starting MSI scrape...`);

    for (const category of this.categories) {
      console.log(`[${this.vendorId}] Scraping category: ${category.name}`);
      await this.scrapeCategory(category);
    }

    console.log(`[${this.vendorId}] Scrape complete. ${this.scrapedProducts.length} products found.`);
  }

  async scrapeCategory(category) {
    try {
      const url = `${this.baseUrl}${category.url}`;
      await this.navigateTo(url);

      // Wait for product grid
      await this.waitFor('.product-grid, .products-list, [class*="product"]');

      // Get product links
      const productLinks = await this.page.evaluate(() => {
        const links = [];
        const items = document.querySelectorAll('.product-item a, .product-card a, [class*="product"] a[href*="/"]');

        items.forEach(a => {
          const href = a.getAttribute('href');
          if (href && !links.includes(href) && !href.includes('#')) {
            links.push(href);
          }
        });

        return links.slice(0, 50); // Limit for testing
      });

      console.log(`[${this.vendorId}] Found ${productLinks.length} products in ${category.name}`);

      // Scrape each product
      for (const link of productLinks) {
        try {
          await this.scrapeProduct(link, category.name);
        } catch (err) {
          console.error(`[${this.vendorId}] Error scraping ${link}:`, err.message);
          this.report.recordError(err);
        }
      }
    } catch (err) {
      console.error(`[${this.vendorId}] Error scraping category ${category.name}:`, err.message);
      this.report.recordError(err);
    }
  }

  async scrapeProduct(productUrl, category) {
    const fullUrl = productUrl.startsWith('http') ? productUrl : `${this.baseUrl}${productUrl}`;

    await this.navigateTo(fullUrl);
    await this.waitFor('h1, .product-title, [class*="product-name"]');

    // Extract product data
    const productData = await this.page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || null;
      };

      const getImage = () => {
        const img = document.querySelector('.product-image img, .gallery-main img, [class*="product"] img');
        return img?.src || img?.dataset?.src || null;
      };

      const getAllImages = () => {
        const images = [];
        document.querySelectorAll('.product-images img, .gallery img, [class*="thumbnail"] img').forEach(img => {
          const src = img.src || img.dataset.src;
          if (src && !images.includes(src)) {
            images.push(src);
          }
        });
        return images;
      };

      const getSku = () => {
        // Try various patterns for SKU
        const skuEl = document.querySelector('[class*="sku"], [data-sku], .product-sku');
        if (skuEl) return skuEl.textContent.replace(/[^a-zA-Z0-9-]/g, '');

        // Extract from URL
        const path = window.location.pathname;
        const match = path.match(/\/([a-z0-9-]+)\/?$/i);
        return match ? match[1] : null;
      };

      const getSpecs = () => {
        const specs = {};
        document.querySelectorAll('.spec-row, .product-spec, [class*="specification"] tr').forEach(row => {
          const label = row.querySelector('.spec-label, th, dt')?.textContent?.trim().toLowerCase();
          const value = row.querySelector('.spec-value, td, dd')?.textContent?.trim();
          if (label && value) {
            if (label.includes('color')) specs.color = value;
            if (label.includes('material')) specs.material = value;
            if (label.includes('thickness')) specs.thickness = value;
            if (label.includes('finish')) specs.finish = value;
          }
        });
        return specs;
      };

      return {
        name: getText('h1, .product-title, [class*="product-name"]'),
        sku: getSku(),
        description: getText('.product-description, [class*="description"]'),
        mainImage: getImage(),
        images: getAllImages(),
        specs: getSpecs()
      };
    });

    if (!productData.name || !productData.sku) {
      console.log(`[${this.vendorId}] Skipping product - missing name or SKU: ${fullUrl}`);
      return;
    }

    // Build product object
    const product = {
      sku: productData.sku,
      name: productData.name,
      description: productData.description,
      category,
      material: productData.specs.material || category,
      color: productData.specs.color,
      thickness: productData.specs.thickness,
      finish: productData.specs.finish,
      images: productData.images,
      sourceUrl: fullUrl
    };

    // Download main image if available
    if (productData.mainImage) {
      const uploadedUrl = await this.downloadImage(productData.mainImage, product.sku);
      if (uploadedUrl) {
        product.uploadedImage = uploadedUrl;
      }
    }

    // Record the product
    const changes = this.recordProduct(product);

    if (changes.changes.length > 0) {
      console.log(`[${this.vendorId}] ${product.sku}: ${changes.isNew ? 'NEW' : 'UPDATED'}`);
    }
  }
}

module.exports = MSIScraper;
