/**
 * Monterrey Tile — Webflow CMS, ~1700 products. Catalog discovered via sitemap.xml.
 * Each product page has structured data we can extract.
 */
const LiteScraper = require('../lite-scraper');

class MonterreyTileScraper extends LiteScraper {
  constructor() {
    super({
      vendorId: 'monterrey-tile',
      vendorName: 'Monterrey Tile',
      baseUrl: 'https://www.monterreytile.com',
      minDelayMs: 700,
      maxDelayMs: 1400
    });
    this.maxProducts = 5000;  // raised from 250 — scrape the full ~1709-product Monterrey catalog
  }

  async scrape() {
    // Step 1: pull sitemap to discover all product URLs
    this.log('info', 'Fetching sitemap…');
    const sitemap = await this.fetchHtml(`${this.baseUrl}/sitemap.xml`);
    if (!sitemap) {
      this.log('error', 'Sitemap fetch failed.');
      return;
    }
    const productUrls = (sitemap.match(/<loc>https:\/\/www\.monterreytile\.com\/product\/[^<]+<\/loc>/g) || [])
      .map(loc => loc.replace(/<\/?loc>/g, ''));
    this.log('info', `Sitemap: ${productUrls.length} product URLs`);

    // Step 2: scrape each (capped to maxProducts for first run)
    const urls = productUrls.slice(0, this.maxProducts);
    let i = 0;
    for (const url of urls) {
      i++;
      if (i % 25 === 0) this.log('info', `Progress: ${i}/${urls.length}`);
      const html = await this.fetchHtml(url);
      if (!html) continue;
      const product = this.parseProduct(html, url);
      if (product) {
        const norm = this.normalize(product);
        if (norm) this.scrapedProducts.push(norm);
      }
      await this.delay();
    }
  }

  parseProduct(html, url) {
    // Slug derived from URL
    const slug = url.split('/product/')[1]?.replace(/\/$/, '') || '';
    const m = (re) => (html.match(re) || [])[1] || null;

    // Name from <title> "Monterrey Tile Company - Shop <NAME> products today!"
    const title = m(/<title>[^<]*Shop\s+(.*?)\s+products today!?<\/title>/i)
               || m(/<h1[^>]*>([^<]+)<\/h1>/);
    if (!title) return null;

    // Open Graph image
    const ogImage = m(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);

    // Description from og:description or meta description
    const description = m(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/)
                     || m(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);

    // Look for material/category — Monterrey uses "Material:" or category labels
    const material = m(/<div[^>]*class="[^"]*table-(?:title|description)[^"]*"[^>]*>\s*Material[^:]*:?\s*<\/div>\s*<div[^>]*>([^<]+)<\/div>/i)
                  || m(/Material:\s*<[^>]*>([^<]+)<\/[^>]*>/i);

    // Try to parse the product info table — Monterrey has structured tables
    const finishMatch = m(/Finish[^:]*:?\s*<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
    const sizeMatch = m(/(?:Size|Dimensions|Format)[^:]*:?\s*<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
    const colorMatch = m(/Color[^:]*:?\s*<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);

    // Category inference: most Monterrey products are tile, with subcategories
    let category = 'tile';
    let subcategory = null;
    const slugLower = slug.toLowerCase();
    if (slugLower.includes('mosaic')) subcategory = 'mosaic-tile';
    else if (slugLower.includes('floor')) subcategory = 'floor-tile';
    else if (slugLower.includes('wall')) subcategory = 'wall-tile';
    else if (slugLower.includes('subway')) subcategory = 'subway-tile';
    else subcategory = 'porcelain-tile';
    if (material && /wood|laminate|lvp|hardwood/i.test(material)) {
      category = 'flooring';
      subcategory = 'lvp';
    }

    // Image gallery — pull all webflow CDN images on the page
    const galleryMatches = html.match(/https:\/\/cdn\.prod\.website-files\.com\/[^\s"')]+\.(?:jpg|jpeg|png|webp|avif)/gi) || [];
    const image_urls = [...new Set(galleryMatches)].slice(0, 8);
    const primary_image_url = ogImage || image_urls[0] || null;

    return {
      sku: `mt-${slug}`,
      name: title,
      brand: 'Monterrey Tile',
      category,
      subcategory,
      description: description || null,
      short_description: description ? (description.length > 200 ? description.slice(0, 197) + '…' : description) : null,
      primary_image_url,
      image_urls,
      vendor_cost: null,             // Monterrey doesn't show prices to public
      retail_price: null,
      price_unit: 'sqft',
      size: sizeMatch || null,
      finish: finishMatch || null,
      color_family: colorMatch || null,
      vendor_url: url,
      sample_eligible: true,         // tile samples — customer pays shipping per Joshua
      sample_price: 5.00,            // placeholder
      tags: [],
      specs: { slug, material: material || null }
    };
  }
}

module.exports = MonterreyTileScraper;

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../api/.env') });
  (async () => {
    const s = new MonterreyTileScraper();
    const stats = await s.run();
    console.log('\nFinal stats:', stats);
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
