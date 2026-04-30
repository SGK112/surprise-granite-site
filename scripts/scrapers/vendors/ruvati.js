/**
 * Ruvati — Odoo-backed eCommerce at zen.ruvati.com/shop.
 * Public catalog scrapeable by paginating /shop/page/N.
 * Each product page exposes the data we need via og:image + Odoo template ID.
 */
const LiteScraper = require('../lite-scraper');

class RuvatiScraper extends LiteScraper {
  constructor() {
    super({
      vendorId: 'ruvati',
      vendorName: 'Ruvati',
      baseUrl: 'https://zen.ruvati.com',
      minDelayMs: 800,
      maxDelayMs: 1600
    });
    this.maxPages = 30;     // hard cap; ~140 products
  }

  async scrape() {
    // Step 1: paginate /shop and collect product URLs
    const productUrls = new Set();
    for (let page = 1; page <= this.maxPages; page++) {
      const url = page === 1 ? `${this.baseUrl}/shop` : `${this.baseUrl}/shop/page/${page}`;
      const html = await this.fetchHtml(url);
      if (!html) break;
      const links = (html.match(/href="\/shop\/product\/[^"]+"/g) || [])
        .map(h => h.replace(/href="/, '').replace(/"$/, ''));
      const before = productUrls.size;
      links.forEach(l => productUrls.add(this.baseUrl + l));
      this.log('info', `Page ${page}: +${productUrls.size - before} URLs (total ${productUrls.size})`);
      if (links.length === 0 || productUrls.size === before) break;
      await this.delay();
    }

    this.log('info', `Discovered ${productUrls.size} Ruvati products. Fetching detail pages…`);

    // Step 2: scrape each product page
    let i = 0;
    for (const url of productUrls) {
      i++;
      if (i % 25 === 0) this.log('info', `Detail progress: ${i}/${productUrls.size}`);
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
    const m = (re) => (html.match(re) || [])[1] || null;

    // Title from <title> "Ruvati <NAME> | My Website"
    const fullTitle = m(/<title>\s*([^<|]+?)\s*\|/);
    if (!fullTitle) return null;
    const name = fullTitle.replace(/^Ruvati\s+/, '').trim();

    // SKU: Ruvati uses "RVA####" / "RVH####" / "RVU####" SKUs in product names and URLs
    const skuFromName = (name.match(/\b(R(?:VA|VH|VG|VM|VU)\d{3,5}[A-Z]*)\b/i) || [])[1];
    // Fallback to template id
    const templateId = m(/product\.template\/(\d+)/);
    const sku = skuFromName || (templateId ? `ruvati-${templateId}` : null);
    if (!sku) return null;

    // Image
    const ogImage = m(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    // Replace zen.ruvati.com http with https
    const primary_image_url = ogImage ? ogImage.replace(/^http:/, 'https:') : null;

    // Description from meta
    const description = m(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);

    // Category inference from name keywords
    let category = 'sink';
    let subcategory = null;
    const nameLower = name.toLowerCase();
    if (/kitchen sink|workstation|farmhouse|undermount|topmount/.test(nameLower)) {
      category = 'sink';
      subcategory = 'kitchen-sink';
    } else if (/bathroom sink|vanity sink|vessel/.test(nameLower)) {
      category = 'sink';
      subcategory = 'bathroom-sink';
    } else if (/faucet|tap/.test(nameLower)) {
      category = 'faucet';
    } else if (/strainer|drain|grid|cutting board|colander|disposal|caddy|accessory|towel|soap dispenser/.test(nameLower)) {
      category = 'accessory';
      subcategory = 'sink-accessory';
    }

    // Price — Odoo doesn't expose unauthenticated; leave null, retail computed from cost later
    return {
      sku,
      name,
      brand: 'Ruvati',
      category,
      subcategory,
      description: description || null,
      short_description: description ? (description.length > 200 ? description.slice(0, 197) + '…' : description) : null,
      primary_image_url,
      image_urls: primary_image_url ? [primary_image_url] : [],
      vendor_cost: null,
      retail_price: null,
      price_unit: 'each',
      vendor_url: url,
      sample_eligible: false,         // sinks: full units only, no samples
      tags: [],
      specs: {
        odoo_template_id: templateId,
        ruvati_sku: skuFromName
      }
    };
  }
}

module.exports = RuvatiScraper;

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../api/.env') });
  (async () => {
    const s = new RuvatiScraper();
    const stats = await s.run();
    console.log('\nFinal stats:', stats);
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
