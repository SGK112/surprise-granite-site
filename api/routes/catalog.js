/**
 * Catalog API — public read of the live products catalog (Supabase `products`).
 * Marketplace pages call this instead of static data/marketplace-products.json.
 *
 * Routes:
 *   GET /api/catalog                — list (filter by category, vendor, search, in_stock)
 *   GET /api/catalog/categories     — distinct categories with counts
 *   GET /api/catalog/vendors        — vendor_config rows (public-facing fields)
 *   GET /api/catalog/:slug          — single product by slug
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

function sanitize(s, max = 200) {
  if (typeof s !== 'string') return null;
  const v = s.trim().slice(0, max);
  return v || null;
}

router.get('/', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const limit = Math.min(parseInt(req.query?.limit) || 60, 250);
    const offset = Math.max(parseInt(req.query?.offset) || 0, 0);
    const category = sanitize(req.query?.category, 50);
    const vendor = sanitize(req.query?.vendor, 50);
    const search = sanitize(req.query?.search, 100);
    const sampleOnly = req.query?.sample_only === 'true' || req.query?.sample_only === '1';
    const inStockOnly = req.query?.in_stock !== 'false';

    let q = supabase
      .from('catalog_products')
      .select('id, vendor_id, sku, slug, name, brand, category, subcategory, short_description, primary_image_url, image_urls, retail_price, price_unit, size, finish, color_family, sample_eligible, sample_price, in_stock, vendor_url, tags', { count: 'exact' })
      .eq('active', true)
      .order('vendor_id', { ascending: true })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category) q = q.eq('category', category);
    if (vendor) q = q.eq('vendor_id', vendor);
    if (sampleOnly) q = q.eq('sample_eligible', true);
    if (inStockOnly) q = q.eq('in_stock', true);
    if (search) q = q.or(`name.ilike.%${search}%,brand.ilike.%${search}%,short_description.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) {
      logger.error('Catalog list error', { error: error.message });
      return res.status(500).json({ error: 'Could not list catalog' });
    }
    return res.json({ success: true, products: data || [], total: count, limit, offset });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { data, error } = await supabase
      .from('catalog_products')
      .select('category, vendor_id')
      .eq('active', true)
      .limit(10000);
    if (error) return res.status(500).json({ error: error.message });
    const counts = {};
    const vendorByCat = {};
    (data || []).forEach(r => {
      counts[r.category] = (counts[r.category] || 0) + 1;
      vendorByCat[r.category] = vendorByCat[r.category] || new Set();
      vendorByCat[r.category].add(r.vendor_id);
    });
    const categories = Object.entries(counts)
      .map(([category, count]) => ({ category, count, vendors: [...vendorByCat[category]] }))
      .sort((a, b) => b.count - a.count);
    return res.json({ success: true, categories });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/vendors', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { data, error } = await supabase
      .from('vendor_config')
      .select('vendor_id, vendor_name, vendor_url, vendor_logo_url, sample_offered, last_scraped_at, last_scrape_status, notes')
      .order('vendor_name');
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, vendors: data || [] });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const slug = sanitize(req.params?.slug, 150);
    if (!slug) return res.status(400).json({ error: 'Invalid slug' });

    const { data, error } = await supabase
      .from('catalog_products')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Product not found' });
    return res.json({ success: true, product: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
