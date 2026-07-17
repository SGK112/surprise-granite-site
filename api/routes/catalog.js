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

// ── Response cache ────────────────────────────────────────────────────────
// The catalog is read far more often than it changes, and the storefront fires
// one `?vendor=X&limit=1` per vendor purely to read `total` — a dozen-plus
// count:'exact' scans over ~9k rows per page view. A normal traffic burst
// queued enough of those to OOM-kill the 512Mi instance repeatedly.
//
// Bounded by BYTES, not entry count: a 250-product page serialises to ~220KB,
// so an entry cap alone could let the cache grow past the heap it's protecting.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_BYTES = 24 * 1024 * 1024;
const cache = new Map();   // url -> { at, body: string, bytes }

/**
 * The only `specs` keys a customer may see. Everything else is withheld.
 *
 * This was a DENY regex, and a blocklist guarding a public endpoint fails open:
 * it caught `cost_basis` and `msrp` but shipped `sqft_price` — which equals
 * vendor_cost on 1,020 slabs — plus `each_price`, `msi_price_sqft`, `lots`,
 * `slab_count` and the yard's stock levels. We removed dealer cost from
 * retail_price and kept publishing it here.
 *
 * A new scraper key is invisible until someone adds it below, which is the point:
 * an unknown key is withheld, not published.
 */
const PUBLIC_SPEC_KEYS = new Set([
  'material', 'thickness', 'finish', 'origin', 'style', 'accentColor',
  'collection', 'line', 'product_line', 'printed_quartz',
  'slab_size', 'slab_sqft', 'piece_size', 'piece_sqft',   // physical dimensions
  'wear_layer', 'sf_per_box',                             // flooring
  'spec_pdf_url', 'install_pdf_url', 'parts_pdf_url',     // vendor spec/cut sheets (public-safe)
]);

function publicSpecs(specs) {
  const out = {};
  for (const k of Object.keys(specs)) {
    if (PUBLIC_SPEC_KEYS.has(k)) out[k] = specs[k];
  }
  return out;
}
let cacheBytes = 0;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    cacheBytes -= hit.bytes;
    return null;
  }
  return hit.body;
}

function cacheSet(key, body) {
  const bytes = Buffer.byteLength(body);
  if (bytes > CACHE_MAX_BYTES) return;      // never cache a single oversized body
  const prev = cache.get(key);
  if (prev) cacheBytes -= prev.bytes;
  cache.set(key, { at: Date.now(), body, bytes });
  cacheBytes += bytes;
  // Map preserves insertion order, so the first key is the oldest.
  for (const k of cache.keys()) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    cacheBytes -= cache.get(k).bytes;
    cache.delete(k);
  }
}

// ── Load shedding ─────────────────────────────────────────────────────────
// The catalog is the only public endpoint doing a full count per request, and
// it is the one a crawler hammers. Without a ceiling, ~100 req/s queued faster
// than Postgres drained and took the instance down. Reject early and cheaply.
//
// Bounded: entries are swept on a timer, so the limiter cannot itself leak the
// way publicRateLimitStore does (that one keys on ip+path and is never pruned).
// A single browse page issues ~10 uncached catalog reads (it pages the whole
// slab list at limit=250), and a visitor moves through several material pages a
// minute. 60/min throttled real customers into the static fallback. This is a
// crawler ceiling, not a browsing budget: keep it far above what a page view
// costs and let the response cache absorb the repeats.
const RATE_LIMIT_MAX = 300;         // per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map();             // ip -> number[] (timestamps)

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, stamps] of hits) {
    const live = stamps.filter((t) => t > cutoff);
    if (live.length) hits.set(ip, live);
    else hits.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// A Supabase/Cloudflare failure puts a whole HTML error page in error.message.
// Logging that verbatim at request rate is what turned a database outage into
// an OOM kill: ~200KB allocated and retained per failed request.
const MAX_LOGGED_ERROR = 200;
const briefly = (err) => String(err?.message ?? err ?? 'unknown').replace(/\s+/g, ' ').slice(0, MAX_LOGGED_ERROR);

// Circuit breaker. When the database is unreachable, every request otherwise
// waits out its timeout while holding memory. After a few consecutive failures,
// fail immediately and stop touching the database until the window elapses.
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 15_000;
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

const breakerOpen = () => {
  if (consecutiveFailures < BREAKER_THRESHOLD) return false;
  if (Date.now() - breakerOpenedAt < BREAKER_COOLDOWN_MS) return true;
  consecutiveFailures = 0;   // half-open: let the next request probe the database
  return false;
};
const noteFailure = () => {
  consecutiveFailures++;
  if (consecutiveFailures === BREAKER_THRESHOLD) {
    breakerOpenedAt = Date.now();
    logger.error('Catalog circuit breaker opened — database unreachable');
  }
};
const noteSuccess = () => { consecutiveFailures = 0; };

function overLimit(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const stamps = (hits.get(ip) || []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
  if (stamps.length >= RATE_LIMIT_MAX) return true;
  stamps.push(now);
  hits.set(ip, stamps);
  return false;
}

router.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl || req.url;

  // A cache hit costs nothing, so only rate-limit what would reach the database.
  const cachedBody = cacheGet(key);
  if (!cachedBody && breakerOpen()) {
    res.set('Retry-After', '15');
    return res.status(503).json({ error: 'Catalog temporarily unavailable' });
  }
  if (!cachedBody && overLimit(req)) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const hit = cachedBody;
  res.set('Cache-Control', 'public, max-age=60');
  if (hit) {
    res.set('X-Cache', 'HIT');
    return res.type('application/json').send(hit);
  }

  res.set('X-Cache', 'MISS');
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      try { cacheSet(key, JSON.stringify(body)); } catch (_) { /* never fail a response to cache it */ }
    }
    return sendJson(body);
  };
  next();
});

// Staff/Aria present the shared ARIA_SERVICE_KEY header; those callers get dealer cost
// + margin. Everyone else gets the public retail view (owner rule 2026-07-07: no inside
// info to the public). One catalog, one endpoint — the response just adapts to the caller.
function isInternal(req) {
  const k = process.env.ARIA_SERVICE_KEY;
  return !!(k && req.get('x-aria-service-key') === k);
}

// The Yard stores the raw slab price (= our material cost); the customer price adds
// fabrication + install ($55/sqft, +$150 pickup on remnants). This is the SAME formula
// the storefront grid + Aria's find_products already apply — computed here so a direct
// /api/catalog caller (Aria) gets the real quote in installed_total / installed_sqft
// instead of the raw material price. retail_price is left as the material cost basis.
function sqftFromSize(size) {
  if (!size) return 0;
  const m = String(size).match(/(\d+(?:\.\d+)?)\D+?(\d+(?:\.\d+)?)/);
  return m ? (parseFloat(m[1]) * parseFloat(m[2])) / 144 : 0;
}
// The Yard charges us 9.1% AZ sales tax on the material (we're not tax-exempt with them —
// see order #67349: $295 + $26.85 tax). That tax is a real cost, so our cost = raw*1.091 +
// $26/sqft fab. Customer price is unchanged (margin absorbs the tax).
const YARD_TAX = 1.091;
function withInstalled(p, internal) {
  if (!p) return p;

  // The Yard: retail_price is the WHOLE-PIECE raw price; installed = piece + pickup + $55/sqft.
  if (p.vendor_id === 'the-yard-az') {
    const sqft = sqftFromSize(p.size);
    const raw = Number(p.retail_price) || 0;
    if (!sqft || !raw) return p;
    const pickup = p.category === 'remnant' ? 150 : 0;
    const total = Math.round(raw + pickup + 55 * sqft); // customer installed price
    const out = { ...p, installed_total: total, installed_sqft: Math.round((total / sqft) * 100) / 100,
      price_note: 'installed (fab+install); retail_price is pre-tax Yard material' };
    if (internal) {
      const materialTaxed = raw * YARD_TAX;                 // Yard price + 9.1% AZ tax we pay
      const ourCost = Math.round(materialTaxed + 26 * sqft); // + $26/sqft fab/install cost
      out.material_cost_taxed = Math.round(materialTaxed);
      out.installed_cost = ourCost;
      out.margin_pct = total > 0 ? Math.round(((total - ourCost) / total) * 100) : null;
    }
    return out;
  }

  // Distributor slabs: retail_price (from the master sheet) is the MATERIAL price PER SQFT.
  // Installed = material + $55/sqft fab & install — the same rate as the countertop
  // calculator and the Yard formula, so every surface quotes the same number. Sanity-gate
  // to per-sqft-looking prices so a stray lump-sum row can't produce a nonsense quote.
  if (p.category === 'slab') {
    const perSqft = Number(p.retail_price) || 0;
    if (perSqft > 0 && perSqft <= 500) {
      return { ...p, installed_sqft: Math.round((perSqft + 55) * 100) / 100,
        price_note: 'installed_sqft = material $/sqft + $55/sqft fab & install; retail_price is material per sqft' };
    }
  }
  return p;
}

router.get('/', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const limit = Math.min(parseInt(req.query?.limit) || 60, 250);
    const offset = Math.max(parseInt(req.query?.offset) || 0, 0);
    const category = sanitize(req.query?.category, 50);
    const vendor = sanitize(req.query?.vendor, 50);
    const material = sanitize(req.query?.material || req.query?.subcategory, 50); // e.g. Quartz/Granite on slab pages
    const search = sanitize(req.query?.search, 100);
    const sampleOnly = req.query?.sample_only === 'true' || req.query?.sample_only === '1';
    const inStockOnly = req.query?.in_stock !== 'false';

    let q = supabase
      .from('catalog_products')
      .select('id, vendor_id, sku, slug, name, brand, category, subcategory, short_description, primary_image_url, image_urls, retail_price, price_unit, size, finish, color_family, sample_eligible, sample_price, in_stock, vendor_url, tags, vendor_cost', { count: 'exact' })
      .eq('active', true)
      .order('vendor_id', { ascending: true })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category) q = q.eq('category', category);
    if (material) q = q.ilike('subcategory', material); // case-insensitive material match
    if (vendor) q = q.eq('vendor_id', vendor);
    if (sampleOnly) q = q.eq('sample_eligible', true);
    if (inStockOnly) q = q.eq('in_stock', true);
    if (search) {
      // Escape PostgREST or-filter delimiters so commas/parens can't break the query.
      // Products carry no SKU, so we match the fields that actually exist.
      const s = search.replace(/[(),*]/g, ' ').trim();
      q = q.or(`name.ilike.%${s}%,brand.ilike.%${s}%,subcategory.ilike.%${s}%,short_description.ilike.%${s}%`);
    }

    const { data, error, count } = await q;
    if (error) {
      noteFailure();
      logger.error('Catalog list error', { error: briefly(error) });
      return res.status(500).json({ error: 'Could not list catalog' });
    }
    noteSuccess();
    const internal = isInternal(req);
    const products = (data || []).map(p => {
      if (internal) {
        const cost = Number(p.vendor_cost) || 0, price = Number(p.retail_price) || 0;
        return withInstalled({ ...p, margin_pct: (cost > 0 && price > 0) ? Math.round((price - cost) / price * 100) : null }, true);
      }
      const { vendor_cost, ...pub } = p; // public: retail only
      return withInstalled(pub, false);
    });
    return res.json({ success: true, products, total: count, limit, offset, cost_visible: internal });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    // Supabase caps a single select at 1000 rows, so a one-shot fetch-and-count silently
    // undercounts (reported 276 slabs when there are 2416). Page through ALL active rows.
    const counts = {};
    const vendorByCat = {};
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('category, vendor_id')
        .eq('active', true)
        .range(from, from + PAGE - 1);
      if (error) {
        noteFailure();
        logger.error('Catalog query error', { error: briefly(error) });
        return res.status(500).json({ error: 'Catalog unavailable' });
      }
      (data || []).forEach(r => {
        counts[r.category] = (counts[r.category] || 0) + 1;
        vendorByCat[r.category] = vendorByCat[r.category] || new Set();
        vendorByCat[r.category].add(r.vendor_id);
      });
      if (!data || data.length < PAGE) break;
    }
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
    if (error) {
      noteFailure();
      logger.error('Catalog query error', { error: briefly(error) });
      return res.status(500).json({ error: 'Catalog unavailable' });
    }
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
    if (error) {
      noteFailure();
      logger.error('Catalog query error', { error: briefly(error) });
      return res.status(500).json({ error: 'Catalog unavailable' });
    }
    if (!data) return res.status(404).json({ error: 'Product not found' });

    // One catalog serves both: staff/Aria (service key) see cost + provenance; the public
    // never does (owner rule 2026-07-07 — "no inside information").
    const internal = isInternal(req);
    if (internal) {
      const cost = Number(data.vendor_cost) || 0, price = Number(data.retail_price) || 0;
      data.margin_pct = (cost > 0 && price > 0) ? Math.round((price - cost) / price * 100) : null;
    } else {
      delete data.vendor_cost;
      delete data.default_markup_pct;
      delete data.last_scraped_at;
      delete data.first_scraped_at;
      delete data.last_changed_at;
      delete data.vendor_sku;
      delete data.lookup_mode;
      if (data.specs && typeof data.specs === 'object') {
        data.specs = publicSpecs(data.specs);
      }
    }
    return res.json({ success: true, product: withInstalled(data, internal), cost_visible: internal });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
// Exported for api/tests/unit/publicSpecs.test.js — this allowlist is the only
// thing standing between dealer cost and a public JSON response.
module.exports.publicSpecs = publicSpecs;
module.exports.PUBLIC_SPEC_KEYS = PUBLIC_SPEC_KEYS;
