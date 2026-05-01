/**
 * Lions Floor — WordPress + Yoast SEO. Catalog spread across 5 sub-sitemaps:
 *   /luxury_vinyl_tile-sitemap.xml  → /lvp-floorings/*    (LVT)
 *   /laminate_catalog-sitemap.xml   → /laminate-floorings/* (laminate)
 *   /spc_flooring-sitemap.xml       → /spc-floorings/*    (SPC)
 *   /wpc_flooring-sitemap.xml       → /wpc-floorings/*    (WPC)
 *   /loose_lay-sitemap.xml          → /loose-lay/*        (loose lay)
 *
 * Each product page exposes a JSON-LD Product block with name, sku, image,
 * brand. Pricing isn't published; we leave price null and let SG_PRICING
 * supply tier-based per-sqft figures on the marketplace pages.
 */
const LiteScraper = require('../lite-scraper');

const SITEMAPS = [
  { url: 'https://www.lionsfloor.com/luxury_vinyl_tile-sitemap.xml', subcategory: 'lvp' },
  { url: 'https://www.lionsfloor.com/laminate_catalog-sitemap.xml',  subcategory: 'laminate' },
  { url: 'https://www.lionsfloor.com/spc_flooring-sitemap.xml',      subcategory: 'spc' },
  { url: 'https://www.lionsfloor.com/wpc_flooring-sitemap.xml',      subcategory: 'wpc' },
  { url: 'https://www.lionsfloor.com/loose_lay-sitemap.xml',         subcategory: 'loose-lay' }
];

class LionsFloorScraper extends LiteScraper {
  constructor() {
    super({
      vendorId: 'lions-floor',
      vendorName: 'Lions Floor',
      baseUrl: 'https://www.lionsfloor.com',
      minDelayMs: 600,
      maxDelayMs: 1200
    });
  }

  async scrape() {
    const allUrls = [];
    for (const { url, subcategory } of SITEMAPS) {
      const xml = await this.fetchHtml(url);
      if (!xml) {
        this.log('warn', `Sitemap fetch failed: ${url}`);
        continue;
      }
      const urls = (xml.match(/<loc>[^<]+<\/loc>/g) || [])
        .map(loc => loc.replace(/<\/?loc>/g, ''))
        .filter(u => u.includes('/') && !u.endsWith('-sitemap.xml'));
      this.log('info', `${subcategory}: ${urls.length} URLs`);
      urls.forEach(u => allUrls.push({ url: u, subcategory }));
    }
    this.log('info', `Total: ${allUrls.length} product URLs`);

    let i = 0;
    for (const { url, subcategory } of allUrls) {
      i++;
      if (i % 20 === 0) this.log('info', `Detail progress: ${i}/${allUrls.length}`);
      const html = await this.fetchHtml(url);
      if (!html) continue;
      const product = this.parseProduct(html, url, subcategory);
      if (product) {
        const norm = this.normalize(product);
        if (norm) this.scrapedProducts.push(norm);
      }
      await this.delay();
    }
  }

  parseProduct(html, url, subcategory) {
    // Yoast JSON-LD Product block — primary source of truth
    const ldBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]);
    let product = null;
    for (const block of ldBlocks) {
      try {
        const d = JSON.parse(block);
        if (d && d['@type'] === 'Product') { product = d; break; }
      } catch { /* skip non-JSON */ }
    }
    if (!product || !product.sku) return null;

    // Slug from URL
    const slug = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/|\/$/g, '');

    // Color family inference from name
    const name = product.name || '';
    const colorFamily = this.guessColorFamily(name);

    // Hero image — Yoast provides one; gallery harvested from page HTML
    const cdn = (html.match(/https:\/\/(?:mm-media-res\.cloudinary\.com|mmllc-images\.s3\.amazonaws\.com)\/[^\s"')]+\.(?:jpg|jpeg|png|webp|avif)/gi) || []);
    const image_urls = [...new Set([product.image, ...cdn].filter(Boolean))].slice(0, 8);

    return {
      sku: String(product.sku).toUpperCase(),
      name,
      brand: 'Lions Floor',
      category: 'flooring',
      subcategory,
      description: product.description || null,
      short_description: name,
      primary_image_url: product.image || image_urls[0] || null,
      image_urls,
      vendor_cost: null,
      retail_price: null,
      price_unit: 'sqft',
      vendor_url: url,
      sample_eligible: true,
      sample_price: 5.00,
      color_family: colorFamily,
      tags: [subcategory, 'flooring', 'lions-floor'],
      specs: { slug, mpn: product.mpn || product.sku }
    };
  }

  guessColorFamily(name) {
    const n = name.toLowerCase();
    if (/(white|ivory|cream|chalk|pearl)/.test(n)) return 'white';
    if (/(black|charcoal|onyx|coal)/.test(n)) return 'black';
    if (/(grey|gray|slate|stone|silver)/.test(n)) return 'grey';
    if (/(beige|tan|sand|wheat|honey|natural|oak)/.test(n)) return 'beige';
    if (/(brown|walnut|chestnut|cocoa|espresso|hickory|mahogany)/.test(n)) return 'brown';
    if (/(red|rust|terracotta)/.test(n)) return 'red';
    if (/(blue|navy|denim)/.test(n)) return 'blue';
    if (/(green|sage|olive)/.test(n)) return 'green';
    return null;
  }
}

module.exports = LionsFloorScraper;

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../api/.env') });
  (async () => {
    const s = new LionsFloorScraper();
    const stats = await s.run();
    console.log('\nFinal stats:', stats);
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
