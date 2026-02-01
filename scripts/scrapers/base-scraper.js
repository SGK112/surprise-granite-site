/**
 * Base Scraper Class
 * Provides common functionality for all vendor scrapers
 */

const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');
const RateLimiter = require('./utils/rate-limiter');
const ChangeDetector = require('./utils/change-detector');
const ReportGenerator = require('./utils/report-generator');
const path = require('path');
const fs = require('fs');

class BaseScraper {
  constructor(config) {
    this.vendorId = config.vendorId;
    this.vendorName = config.vendorName;
    this.baseUrl = config.baseUrl;
    this.config = config;

    // Rate limiter
    this.rateLimiter = new RateLimiter({
      minDelay: config.minDelay || 1500,
      maxDelay: config.maxDelay || 3000
    });

    // Browser
    this.browser = null;
    this.page = null;

    // Supabase client
    this.supabase = null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
    }

    // Report generator
    this.report = new ReportGenerator(this.vendorId);

    // Change detector (initialized after loading existing products)
    this.changeDetector = null;

    // Scraped products
    this.scrapedProducts = [];
  }

  /**
   * Initialize the scraper
   */
  async init() {
    console.log(`[${this.vendorId}] Initializing scraper...`);

    // Launch browser
    await this.launchBrowser();

    // Load existing products for comparison
    await this.loadExistingProducts();

    console.log(`[${this.vendorId}] Initialization complete`);
  }

  /**
   * Launch Puppeteer browser
   */
  async launchBrowser() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    this.browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();

    // Set user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  /**
   * Load existing products from database
   */
  async loadExistingProducts() {
    if (!this.supabase) {
      console.log(`[${this.vendorId}] No Supabase connection, skipping existing products load`);
      this.changeDetector = new ChangeDetector([]);
      return;
    }

    try {
      const { data: products, error } = await this.supabase
        .from('distributor_products')
        .select('id, sku, product_sku, name, product_name, wholesale_cost, price, images, image_urls')
        .eq('vendor_id', this.vendorId);

      if (error) throw error;

      console.log(`[${this.vendorId}] Loaded ${products?.length || 0} existing products`);
      this.changeDetector = new ChangeDetector(products || []);
    } catch (err) {
      console.error(`[${this.vendorId}] Error loading existing products:`, err.message);
      this.changeDetector = new ChangeDetector([]);
    }
  }

  /**
   * Navigate to a URL with rate limiting
   */
  async navigateTo(url) {
    await this.rateLimiter.wait();

    try {
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
    } catch (err) {
      this.rateLimiter.recordError();
      throw err;
    }
  }

  /**
   * Get page content
   */
  async getPageContent() {
    return await this.page.content();
  }

  /**
   * Extract data using selector
   */
  async extractText(selector) {
    try {
      return await this.page.$eval(selector, el => el.textContent?.trim());
    } catch {
      return null;
    }
  }

  /**
   * Extract multiple elements
   */
  async extractAll(selector, extractor) {
    try {
      return await this.page.$$eval(selector, (elements, fn) => {
        return elements.map(el => {
          // Execute extractor logic
          return eval(`(${fn})`)(el);
        });
      }, extractor.toString());
    } catch {
      return [];
    }
  }

  /**
   * Wait for selector with timeout
   */
  async waitFor(selector, timeout = 10000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download an image to Supabase storage
   */
  async downloadImage(imageUrl, productSku) {
    if (!this.supabase || !imageUrl) return null;

    try {
      // Fetch image
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : 'jpg';

      // Upload to Supabase Storage
      const filename = `${this.vendorId}/${productSku.replace(/[^a-z0-9]/gi, '-')}.${ext}`;
      const { error } = await this.supabase.storage
        .from('product-images')
        .upload(filename, buffer, {
          contentType,
          upsert: true
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from('product-images')
        .getPublicUrl(filename);

      this.report.recordImageDownload();
      return urlData.publicUrl;
    } catch (err) {
      console.error(`[${this.vendorId}] Error downloading image:`, err.message);
      return null;
    }
  }

  /**
   * Record a scraped product
   */
  recordProduct(product) {
    this.scrapedProducts.push(product);

    const changes = this.changeDetector.detectChanges(product);
    this.report.recordProduct(changes);

    return changes;
  }

  /**
   * Detect discontinued products
   */
  detectDiscontinued() {
    const scrapedSkus = this.scrapedProducts.map(p => p.sku);
    const missing = this.changeDetector.findMissingProducts(scrapedSkus);

    for (const product of missing) {
      this.report.recordDiscontinued(product);
    }

    return missing;
  }

  /**
   * Save results to database
   */
  async saveResults() {
    if (!this.supabase) {
      console.log(`[${this.vendorId}] No Supabase connection, skipping save`);
      return;
    }

    // Save scraper run record
    const summary = this.report.getSummary();
    const { data: run, error: runError } = await this.supabase
      .from('vendor_scraper_runs')
      .insert({
        vendor_id: this.vendorId,
        status: summary.status,
        started_at: summary.started_at,
        completed_at: summary.completed_at,
        products_scraped: summary.stats.total_scraped,
        products_updated: summary.stats.updated_products,
        products_new: summary.stats.new_products,
        products_discontinued: summary.stats.discontinued,
        images_downloaded: summary.stats.images_downloaded,
        errors_count: summary.stats.errors,
        change_summary: summary
      })
      .select()
      .single();

    if (runError) {
      console.error(`[${this.vendorId}] Error saving run:`, runError.message);
      return;
    }

    console.log(`[${this.vendorId}] Saved scraper run: ${run.id}`);

    // Save discontinued products
    const discontinued = this.report.discontinued;
    if (discontinued.length > 0) {
      const discontinuedRecords = discontinued.map(p => ({
        vendor_id: this.vendorId,
        product_sku: p.sku,
        product_name: p.name,
        product_id: p.product_id,
        detection_source: 'scraper',
        scraper_run_id: run.id
      }));

      const { error: discError } = await this.supabase
        .from('product_discontinuations')
        .insert(discontinuedRecords);

      if (discError) {
        console.error(`[${this.vendorId}] Error saving discontinuations:`, discError.message);
      }
    }
  }

  /**
   * Run the scraper - to be implemented by subclasses
   */
  async scrape() {
    throw new Error('scrape() must be implemented by subclass');
  }

  /**
   * Execute full scraper workflow
   */
  async run() {
    try {
      await this.init();
      await this.scrape();
      this.detectDiscontinued();
      this.report.complete();
      await this.saveResults();

      // Save report to file
      const reportDir = path.join(__dirname, '../../data/scraper-reports');
      const reportPath = this.report.saveToFile(reportDir);
      console.log(`[${this.vendorId}] Report saved to: ${reportPath}`);

      // Print summary
      console.log(this.report.toConsole());

      return this.report.getSummary();
    } catch (err) {
      this.report.recordError(err);
      console.error(`[${this.vendorId}] Scraper error:`, err);
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = BaseScraper;
