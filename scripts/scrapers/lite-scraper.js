/**
 * Lightweight HTTP/JSON scraper base — for vendors that don't need a real browser.
 * Use BaseScraper (puppeteer-core) for Cloudflare-protected or JS-rendered sites.
 *
 * Vendor adapters extend this and implement scrape() returning normalized
 * Product objects matching the Supabase products schema.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

class LiteScraper {
  constructor(config) {
    this.vendorId = config.vendorId;
    this.vendorName = config.vendorName;
    this.baseUrl = config.baseUrl;
    this.userAgent = config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 SurpriseGraniteScraper/1.0';
    this.minDelayMs = config.minDelayMs || 800;
    this.maxDelayMs = config.maxDelayMs || 2000;
    this.config = config;

    // Supabase
    this.supabase = null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
    }

    // Run state
    this.scrapeRunId = `${this.vendorId}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    this.scrapedProducts = [];
    this.errors = [];
  }

  /**
   * Subclass entry point. Must return an array of normalized products.
   * Override in vendor subclass.
   */
  async scrape() {
    throw new Error(`scrape() not implemented for ${this.vendorId}`);
  }

  /**
   * GET a URL with our UA + retries. Returns body string or null.
   */
  async fetchHtml(url, opts = {}) {
    const tries = opts.tries || 2;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': opts.accept || 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            ...opts.headers
          },
          signal: AbortSignal.timeout(opts.timeoutMs || 30000)
        });
        if (!res.ok) {
          this.log('warn', `${url} → HTTP ${res.status}`);
          if (attempt + 1 < tries) await this.delay();
          continue;
        }
        return await res.text();
      } catch (e) {
        this.log('warn', `${url} → fetch error: ${e.message}`);
        if (attempt + 1 < tries) await this.delay();
      }
    }
    return null;
  }

  /**
   * GET a URL expecting JSON.
   */
  async fetchJson(url, opts = {}) {
    const text = await this.fetchHtml(url, { ...opts, accept: 'application/json,*/*' });
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) { this.log('warn', `${url} → JSON parse failed: ${e.message}`); return null; }
  }

  delay(ms) {
    const d = ms || (this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs));
    return new Promise(r => setTimeout(r, d));
  }

  log(level, msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${this.vendorId}] ${level.toUpperCase()}: ${msg}`);
  }

  /**
   * Normalize a scraped product to match the Supabase products schema.
   * Subclasses call this to push into this.scrapedProducts.
   */
  normalize(p) {
    if (!p || !p.sku || !p.name) {
      this.errors.push({ stage: 'normalize', reason: 'missing sku or name', input: p });
      return null;
    }
    const cost = parseFloat(p.vendor_cost ?? p.cost ?? 0) || null;
    const retail = parseFloat(p.retail_price ?? p.price ?? 0) || (cost ? +(cost * 1.30).toFixed(2) : null);
    const out = {
      vendor_id: this.vendorId,
      sku: String(p.sku).trim(),
      name: String(p.name).trim(),
      brand: p.brand || this.vendorName,
      category: p.category || 'other',
      subcategory: p.subcategory || null,
      description: p.description || null,
      short_description: p.short_description || null,
      primary_image_url: p.primary_image_url || (p.image_urls && p.image_urls[0]) || null,
      image_urls: Array.isArray(p.image_urls) ? p.image_urls.slice(0, 12) : null,
      vendor_cost: cost,
      retail_price: retail,
      price_unit: p.price_unit || 'each',
      size: p.size || null,
      finish: p.finish || null,
      color_family: p.color_family || null,
      sample_eligible: !!p.sample_eligible,
      sample_price: parseFloat(p.sample_price) || 0,
      sample_sku: p.sample_sku || null,
      in_stock: p.in_stock !== false,
      stock_quantity: p.stock_quantity ?? null,
      lead_time_days: p.lead_time_days ?? null,
      vendor_url: p.vendor_url || null,
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 30) : null,
      specs: p.specs || {},
      active: true,
      last_scraped_at: new Date().toISOString()
    };
    return out;
  }

  /**
   * Persist scraped products to Supabase via upsert on (vendor_id, sku).
   * Also writes vendor_inventory time-series row for each.
   */
  async persist() {
    if (!this.supabase) {
      this.log('warn', 'No Supabase client; skipping persist (dry run).');
      return { upserted: 0, dryRun: true };
    }
    if (this.scrapedProducts.length === 0) {
      this.log('warn', 'No products scraped; skipping persist.');
      return { upserted: 0 };
    }
    // Chunk inserts so a single bad row doesn't sink the whole run
    const CHUNK = 50;
    let upserted = 0;
    for (let i = 0; i < this.scrapedProducts.length; i += CHUNK) {
      const chunk = this.scrapedProducts.slice(i, i + CHUNK);
      const { data, error } = await this.supabase
        .from('catalog_products')
        .upsert(chunk, { onConflict: 'vendor_id,sku', ignoreDuplicates: false })
        .select('id, sku');
      if (error) {
        this.log('error', `Upsert chunk ${i}-${i+chunk.length} failed: ${error.message}`);
        this.errors.push({ stage: 'upsert', chunk: i, reason: error.message });
        continue;
      }
      upserted += (data || []).length;

      // Write vendor_inventory snapshots for the upserted batch
      const inventoryRows = chunk.map((p, idx) => ({
        vendor_id: this.vendorId,
        sku: p.sku,
        product_id: data?.[idx]?.id || null,
        in_stock: p.in_stock,
        stock_quantity: p.stock_quantity,
        vendor_cost: p.vendor_cost,
        retail_price: p.retail_price,
        source_url: p.vendor_url,
        scrape_run_id: this.scrapeRunId
      }));
      const { error: invErr } = await this.supabase.from('vendor_inventory').insert(inventoryRows);
      if (invErr) this.log('warn', `Inventory snapshot insert failed: ${invErr.message}`);
    }

    // Update vendor_config last_scraped_at
    await this.supabase
      .from('vendor_config')
      .update({ last_scraped_at: new Date().toISOString(), last_scrape_status: this.errors.length ? 'errors' : 'ok' })
      .eq('vendor_id', this.vendorId);

    return { upserted };
  }

  /**
   * Save the scrape result to /scripts/scraper-output/<vendor>-<timestamp>.json for audit/debugging.
   */
  async writeAuditFile(stats) {
    const dir = path.join(__dirname, '../scraper-output');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.vendorId}-${new Date().toISOString().slice(0,10)}.json`);
    fs.writeFileSync(file, JSON.stringify({
      vendorId: this.vendorId,
      runId: this.scrapeRunId,
      finishedAt: new Date().toISOString(),
      stats,
      errors: this.errors,
      sampleProducts: this.scrapedProducts.slice(0, 3)
    }, null, 2));
    this.log('info', `Audit file: ${file}`);
  }

  async run() {
    const t0 = Date.now();
    this.log('info', `Starting scrape (${this.vendorName})`);
    try {
      await this.scrape();
    } catch (e) {
      this.log('error', `scrape() threw: ${e.message}`);
      this.errors.push({ stage: 'scrape', reason: e.message, stack: e.stack });
    }
    const stats = {
      duration_ms: Date.now() - t0,
      products_scraped: this.scrapedProducts.length,
      errors: this.errors.length
    };
    this.log('info', `Scraped ${stats.products_scraped} products in ${stats.duration_ms}ms (${stats.errors} errors)`);
    const persistRes = await this.persist();
    stats.products_persisted = persistRes.upserted;
    await this.writeAuditFile(stats);
    return stats;
  }
}

module.exports = LiteScraper;
