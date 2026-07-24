// Per-product customer reviews.
//
// Google-compliant path to product star ratings: reviews are collected from real customers
// (post-delivery email link carries the order id → `verified`), stored as `pending`, and only
// `approved` reviews are ever exposed or fed into Product review/aggregateRating schema. No
// self-authored or fabricated ratings — that would risk a manual action.
//
//   POST /api/reviews                     submit a review (public; stored pending)
//   GET  /api/reviews?sku=SKU             approved reviews + summary for one product (public)
//   GET  /api/reviews/summary             {sku: {count, average}} for ALL approved (page generator)
//   GET  /api/reviews/pending             moderation queue           (staff: x-aria-service-key)
//   POST /api/reviews/:id/moderate        {action:'approve'|'reject'} (staff: x-aria-service-key)
const express = require('express');
const router = express.Router();

// Two keys open the moderation endpoints:
//  - ARIA_SERVICE_KEY  (x-aria-service-key): the full staff/Aria key (also unlocks catalog cost).
//  - REVIEW_MODERATION_KEY (x-review-key): a NARROW key for the /staff/reviews/ browser UI. It is
//    accepted ONLY here, never by the catalog cost-gate, so exposing it in a staff browser can't
//    leak dealer pricing/margin. Set it on the email-api Render service.
const isInternal = (req) => {
  const aria = process.env.ARIA_SERVICE_KEY;
  const mod = process.env.REVIEW_MODERATION_KEY;
  if (aria && req.get('x-aria-service-key') === aria) return true;
  if (mod && req.get('x-review-key') === mod) return true;
  return false;
};
const clean = (s, max) => String(s == null ? "" : s).replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);

// Fire the site's refresh-reviews GitHub Action so approved reviews roll onto the static product
// pages (~3 min). Debounced: a burst of approvals coalesces into ONE rebuild 60s after the last,
// so approving 10 reviews triggers a single regenerate. No-ops when GITHUB_DISPATCH_TOKEN is unset
// — the nightly scheduled run still covers it, so instant publish is an enhancement, not a hard dep.
const GH_REPO = process.env.GITHUB_DISPATCH_REPO || 'SGK112/surprise-granite-site';
let rebuildTimer = null;
function dispatchRebuild() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token || typeof fetch !== 'function') return false;
  fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/refresh-reviews.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'sg-review-moderation' },
    body: JSON.stringify({ ref: 'main' }),
  }).then((r) => { if (!r.ok) console.error('[reviews] rebuild dispatch HTTP', r.status); })
    .catch((e) => console.error('[reviews] rebuild dispatch error', e.message));
  return true;
}
function scheduleRebuild() {
  if (!process.env.GITHUB_DISPATCH_TOKEN) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { rebuildTimer = null; dispatchRebuild(); }, 60000);
}

// Light per-IP throttle so the public submit endpoint can't be spammed.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => t > now - 3600e3); // 1h window
  if (arr.length >= 8) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}
const ipOf = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';

// ---- submit (public) ----
router.post('/', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'db unavailable' });
    if (rateLimited(ipOf(req))) return res.status(429).json({ error: 'too many submissions, please try later' });
    const b = req.body || {};
    const rating = parseInt(b.rating, 10);
    const sku = clean(b.sku, 80);
    if (!sku) return res.status(400).json({ error: 'sku is required' });
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'rating must be 1–5' });
    const row = {
      sku,
      slug: clean(b.slug, 200) || null,
      category: clean(b.category, 40) || null,
      rating,
      author_name: clean(b.name || b.author_name, 80) || 'Verified Customer',
      title: clean(b.title, 140) || null,
      body: clean(b.body || b.text, 4000) || null,
      order_id: clean(b.order || b.order_id, 80) || null,
      verified: !!(b.order || b.order_id), // came through the emailed post-delivery link
      status: 'pending',
    };
    const { data, error } = await supabase.from('product_reviews').insert(row).select('id').single();
    if (error) { console.error('review insert', error.message); return res.status(500).json({ error: 'could not save review' }); }
    return res.json({ success: true, id: data.id, status: 'pending', message: 'Thank you! Your review is being reviewed and will appear shortly.' });
  } catch (e) { return res.status(500).json({ error: 'server error' }); }
});

// ---- approved reviews + summary for one product (public) ----
router.get('/', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'db unavailable' });
    const sku = clean(req.query.sku, 80);
    if (!sku) return res.status(400).json({ error: 'sku is required' });
    const { data, error } = await supabase.from('product_reviews')
      .select('rating, author_name, title, body, created_at, verified')
      .eq('sku', sku).eq('status', 'approved').order('created_at', { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: 'query failed' });
    const reviews = data || [];
    const count = reviews.length;
    const average = count ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : null;
    return res.json({ success: true, sku, count, average, reviews });
  } catch (e) { return res.status(500).json({ error: 'server error' }); }
});

// ---- bulk approved summary (page generator reads this to emit schema) ----
router.get('/summary', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'db unavailable' });
    const { data, error } = await supabase.from('product_reviews').select('sku, rating').eq('status', 'approved');
    if (error) return res.status(500).json({ error: 'query failed' });
    const acc = {};
    for (const r of (data || [])) (acc[r.sku] = acc[r.sku] || []).push(r.rating);
    const products = {};
    for (const sku in acc) { const a = acc[sku]; products[sku] = { count: a.length, average: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 }; }
    return res.json({ success: true, products });
  } catch (e) { return res.status(500).json({ error: 'server error' }); }
});

// ---- moderation (staff / Aria) ----
router.get('/pending', async (req, res) => {
  if (!isInternal(req)) return res.status(403).json({ error: 'forbidden' });
  const supabase = req.app.get('supabase');
  const { data, error } = await supabase.from('product_reviews').select('*').eq('status', 'pending').order('verified', { ascending: false }).order('created_at', { ascending: true }).limit(200);
  if (error) return res.status(500).json({ error: 'query failed' });
  return res.json({ success: true, pending: data || [] });
});
router.post('/:id/moderate', async (req, res) => {
  if (!isInternal(req)) return res.status(403).json({ error: 'forbidden' });
  const supabase = req.app.get('supabase');
  const approve = (req.body && req.body.action) !== 'reject';
  const patch = { status: approve ? 'approved' : 'rejected', approved_at: approve ? new Date().toISOString() : null };
  const { error } = await supabase.from('product_reviews').update(patch).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'update failed' });
  if (approve) scheduleRebuild(); // roll the new star rating onto the product pages
  return res.json({ success: true, id: req.params.id, status: patch.status });
});

// ---- manual "publish now" (staff): fire the rebuild immediately (the UI's Refresh button) ----
router.post('/publish', (req, res) => {
  if (!isInternal(req)) return res.status(403).json({ error: 'forbidden' });
  const triggered = dispatchRebuild();
  return res.json({ success: true, triggered,
    message: triggered ? 'rebuild triggered — stars live in ~3 min'
      : 'instant rebuild not configured (GITHUB_DISPATCH_TOKEN unset); the nightly run will refresh' });
});

module.exports = router;
