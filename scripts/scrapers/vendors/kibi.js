/**
 * Kibi USA — Shopify-backed kitchen and bath fixtures (faucets, shower trim, valves).
 * Uses Shopify's open /products.json endpoint — no auth needed.
 *
 * Catalog category mapping: Kibi product_type → our category.
 */
const LiteScraper = require('../lite-scraper');

const CATEGORY_MAP = {
  'kitchen faucets':       'faucet',
  'bathroom faucets':      'faucet',
  'shower':                'faucet',
  'shower & tub parts':    'faucet',
  'shower & tub trim':     'faucet',
  'tub fillers':           'faucet',
  'pot fillers':           'faucet',
  'bar faucets':           'faucet',
  'sinks':                 'sink',
  'kitchen sinks':         'sink',
  'bathroom sinks':        'sink',
  'accessories':           'accessory',
  'parts':                 'accessory'
};

class KibiScraper extends LiteScraper {
  constructor() {
    super({
      vendorId: 'kibi',
      vendorName: 'Kibi USA',
      baseUrl: 'https://www.kibiusa.com',
      minDelayMs: 600,
      maxDelayMs: 1200
    });
  }

  classifyCategory(type) {
    const t = (type || '').toLowerCase().trim();
    if (CATEGORY_MAP[t]) return CATEGORY_MAP[t];
    for (const k of Object.keys(CATEGORY_MAP)) {
      if (t.includes(k)) return CATEGORY_MAP[k];
    }
    if (t.includes('faucet')) return 'faucet';
    if (t.includes('sink')) return 'sink';
    return 'fixture';
  }

  async scrape() {
    const PER_PAGE = 250;
    let page = 1;
    let totalSeen = 0;
    while (page <= 50) {  // hard cap so we never loop forever
      const url = `${this.baseUrl}/products.json?limit=${PER_PAGE}&page=${page}`;
      const data = await this.fetchJson(url);
      if (!data || !Array.isArray(data.products)) {
        this.log('warn', `Page ${page}: no data, stopping.`);
        break;
      }
      const batch = data.products;
      if (batch.length === 0) {
        this.log('info', `Page ${page}: empty, done.`);
        break;
      }
      this.log('info', `Page ${page}: ${batch.length} products`);
      for (const p of batch) {
        const variant = (p.variants || [])[0] || {};
        const image = (p.images || [])[0] || {};
        const cost = parseFloat(variant.price) || 0;
        const norm = this.normalize({
          sku: variant.sku || `${p.id}-${variant.id}`,
          name: p.title,
          brand: p.vendor || 'Kibi USA',
          category: this.classifyCategory(p.product_type),
          subcategory: p.product_type || null,
          description: this.stripHtml(p.body_html),
          short_description: this.firstSentence(this.stripHtml(p.body_html)),
          primary_image_url: image.src || null,
          image_urls: (p.images || []).map(i => i.src).filter(Boolean),
          vendor_cost: cost,
          retail_price: cost ? +(cost * 1.30).toFixed(2) : null,
          price_unit: 'each',
          tags: p.tags ? p.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          vendor_url: `${this.baseUrl}/products/${p.handle}`,
          in_stock: variant.available !== false,
          sample_eligible: false,        // faucets/fixtures: full units only, no samples
          specs: {
            shopify_id: p.id,
            handle: p.handle,
            published_at: p.published_at
          }
        });
        if (norm) this.scrapedProducts.push(norm);
      }
      totalSeen += batch.length;
      if (batch.length < PER_PAGE) break;  // last page
      await this.delay();
      page++;
    }
    this.log('info', `Kibi scrape complete: ${totalSeen} products seen, ${this.scrapedProducts.length} normalized.`);
  }

  stripHtml(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  firstSentence(text) {
    if (!text) return '';
    const s = text.split(/(?<=[.!?])\s+/)[0] || text;
    return s.length > 200 ? s.slice(0, 197) + '…' : s;
  }
}

module.exports = KibiScraper;

// CLI entry: node scripts/scrapers/vendors/kibi.js
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../api/.env') });
  (async () => {
    const s = new KibiScraper();
    const stats = await s.run();
    console.log('\nFinal stats:', stats);
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
