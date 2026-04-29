/**
 * ASPN — Arizona Stone Providers Network
 *
 * Frictionless signup + public directory + member profile API.
 * Backed by `aspn_members` table (see migrations/014_aspn_members.sql).
 *
 * Routes:
 *   POST /api/aspn/signup            — public, frictionless signup (3 fields)
 *   GET  /api/aspn/members           — public, lists approved members (filterable)
 *   GET  /api/aspn/members/:slug     — public, single member by slug
 *   PATCH /api/aspn/members/:id      — protected by verification_token (member edits own profile)
 *   POST /api/aspn/members/:id/approve — admin-only (X-Admin-Key header)
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
let leadRateLimiter = null;
try { leadRateLimiter = require('../middleware/rateLimiter').leadRateLimiter; }
catch (e) { logger.warn('ASPN: rate limiter unavailable, signup unlimited', { error: e.message }); }

// Allowed service categories (match landing page dropdown)
const SERVICE_CATEGORIES = [
  'stone-yard',
  'fabricator',
  'tile-installer',
  'flooring-installer',
  'cabinet-installer',
  'designer',
  'general-contractor',
  'sealer-restorer',
  'distributor',
  'other'
];

function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

function sanitize(s, maxLen = 200) {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim().slice(0, maxLen);
  return trimmed || null;
}

/**
 * POST /api/aspn/signup
 * Body: { email, business_name, service_category, [city, phone, website, contact_name] }
 * Response: { success, member: { id, slug, verification_token } }
 */
const signupHandlers = [];
if (leadRateLimiter) signupHandlers.push(leadRateLimiter);
signupHandlers.push(async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    // Defensive — req.body can be undefined if no Content-Type header
    const body = req.body || {};
    const email = sanitize(body.email, 254);
    const business_name = sanitize(body.business_name, 200);
    const service_category = sanitize(body.service_category, 50);

    // Required field check
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Valid email required' });
    if (!business_name || business_name.length < 2) return res.status(400).json({ error: 'Business name required' });
    if (!service_category || !SERVICE_CATEGORIES.includes(service_category)) {
      return res.status(400).json({ error: 'Service category required', allowed: SERVICE_CATEGORIES });
    }

    // Check if email already registered (case-insensitive)
    const { data: existing } = await supabase
      .from('aspn_members')
      .select('id, slug, business_name')
      .ilike('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        success: true,
        already_registered: true,
        member: existing,
        message: `${email} is already in the network as "${existing.business_name}". Check your email for the original confirmation link.`
      });
    }

    // Optional fields
    const insertRow = {
      email,
      business_name,
      service_category,
      contact_name: sanitize(body.contact_name, 100),
      phone: sanitize(body.phone, 30),
      website: sanitize(body.website, 300),
      city: sanitize(body.city, 100),
      state: sanitize(body.state, 30) || 'AZ',
      zip: sanitize(body.zip, 20),
      short_description: sanitize(body.short_description, 200),
      az_roc_license: sanitize(body.az_roc_license, 30),
      // Slug + verification_token + created_at handled by DB defaults/triggers
    };

    const { data: row, error } = await supabase
      .from('aspn_members')
      .insert(insertRow)
      .select('id, slug, verification_token, business_name, email, founder_status, approved')
      .single();

    if (error) {
      logger.error('ASPN signup insert failed', { error: error.message, code: error.code });
      return res.status(500).json({ error: 'Signup failed', details: error.message });
    }

    // Notify admin — non-blocking, but log failures (no silent catches)
    try {
      const emailService = require('../services/emailService');
      const adminEmail = process.env.ADMIN_EMAIL || 'joshb@surprisegranite.com';
      await emailService.send({
        to: adminEmail,
        subject: `[ASPN] New member signup: ${row.business_name}`,
        html: `<h2>New ASPN member awaiting approval</h2>
          <p><strong>${row.business_name}</strong> (${service_category})</p>
          <p>Email: ${email}<br/>City: ${insertRow.city || '(not provided)'}<br/>Phone: ${insertRow.phone || '(not provided)'}</p>
          <p><a href="https://www.surprisegranite.com/aspn/admin/?id=${row.id}">Review and approve →</a></p>`
      });
    } catch (e) {
      logger.warn('ASPN admin notify failed (non-blocking)', { error: e.message, member_id: row.id });
    }

    return res.status(201).json({
      success: true,
      member: {
        id: row.id,
        slug: row.slug,
        verification_token: row.verification_token,
        business_name: row.business_name,
        founder_status: row.founder_status,
        approved: row.approved
      },
      message: 'Welcome to the Arizona Stone Providers Network. Your profile is pending review and will publish within 24 hours.',
      profile_completion_url: `/aspn/complete/?token=${row.verification_token}&id=${row.id}`
    });
  } catch (e) {
    logger.error('ASPN signup error', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/signup', ...signupHandlers);

/**
 * GET /api/aspn/members
 * Query: ?category=&city=&search=&limit=50&offset=0
 * Returns approved members only (RLS enforces this for anon).
 */
router.get('/members', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const limit = Math.min(parseInt(req.query?.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query?.offset) || 0, 0);
    const category = sanitize(req.query?.category, 50);
    const city = sanitize(req.query?.city, 100);
    const search = sanitize(req.query?.search, 100);

    let q = supabase
      .from('aspn_members')
      .select('id, slug, business_name, service_category, city, state, short_description, logo_url, website, founder_status, featured', { count: 'exact' })
      .eq('approved', true)
      .order('founder_status', { ascending: false })
      .order('featured', { ascending: false })
      .order('business_name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category && SERVICE_CATEGORIES.includes(category)) q = q.eq('service_category', category);
    if (city) q = q.ilike('city', `%${city}%`);
    if (search) q = q.or(`business_name.ilike.%${search}%,short_description.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) {
      logger.error('ASPN list error', { error: error.message });
      return res.status(500).json({ error: 'Could not list members' });
    }
    return res.json({ success: true, members: data || [], total: count, limit, offset });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/aspn/members/:slug
 */
router.get('/members/:slug', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const slug = sanitize(req.params?.slug, 100);
    if (!slug) return res.status(400).json({ error: 'Invalid slug' });

    const { data, error } = await supabase
      .from('aspn_members')
      .select('id, slug, business_name, service_category, contact_name, phone, website, city, state, zip, short_description, long_description, service_areas, specialties, instagram_url, facebook_url, houzz_url, yelp_url, google_url, linkedin_url, az_roc_license, bonded_insured, logo_url, cover_image_url, gallery_urls, founder_status, featured, approved, created_at')
      .eq('slug', slug)
      .eq('approved', true)
      .maybeSingle();

    if (error) {
      logger.error('ASPN member fetch error', { error: error.message, slug });
      return res.status(500).json({ error: 'Fetch failed' });
    }
    if (!data) return res.status(404).json({ error: 'Member not found' });
    return res.json({ success: true, member: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * PATCH /api/aspn/members/:id
 * Body must include verification_token matching the row.
 * Allows the member to complete/edit their own profile without auth.
 */
router.patch('/members/:id', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const body = req.body || {};
    const id = sanitize(req.params?.id, 50);
    const token = sanitize(body.verification_token, 100) || sanitize(req.headers['x-verification-token'], 100);
    if (!id || !token) return res.status(400).json({ error: 'id and verification_token required' });

    // Verify token matches
    const { data: existing, error: fetchErr } = await supabase
      .from('aspn_members')
      .select('id, verification_token, slug')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Member not found' });
    if (existing.verification_token !== token) return res.status(403).json({ error: 'Invalid verification token' });

    // Whitelist of fields a member can edit on their own
    const allowed = [
      'business_name', 'contact_name', 'phone', 'website', 'city', 'state', 'zip',
      'short_description', 'long_description', 'service_areas', 'specialties',
      'instagram_url', 'facebook_url', 'houzz_url', 'yelp_url', 'google_url', 'linkedin_url',
      'az_roc_license', 'bonded_insured', 'logo_url', 'cover_image_url', 'gallery_urls'
    ];
    const updates = {};
    for (const key of allowed) {
      const v = body[key];
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        updates[key] = v.slice(0, 50).map(item => sanitize(item, 200)).filter(Boolean);
      } else if (typeof v === 'boolean') {
        updates[key] = v;
      } else {
        const cleaned = sanitize(v, 2000);
        if (cleaned !== null) updates[key] = cleaned;
      }
    }
    // Email verification side-effect on first profile completion
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });
    updates.email_verified = true;
    updates.email_verified_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('aspn_members')
      .update(updates)
      .eq('id', id)
      .select('id, slug, business_name, approved')
      .single();
    if (error) {
      logger.error('ASPN PATCH error', { error: error.message, id });
      return res.status(500).json({ error: 'Update failed', details: error.message });
    }
    return res.json({ success: true, member: updated });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/aspn/members/:id/approve
 * Admin-only (header X-Admin-Key matches env ADMIN_KEY)
 * Body: { approved: boolean, rejected: boolean, rejection_reason: string, featured: boolean }
 */
router.post('/members/:id/approve', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const adminKey = process.env.ADMIN_KEY || process.env.ASPN_ADMIN_KEY;
    if (!adminKey) return res.status(503).json({ error: 'Admin not configured' });
    if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ error: 'Unauthorized' });

    const id = sanitize(req.params?.id, 50);
    if (!id) return res.status(400).json({ error: 'id required' });

    const body = req.body || {};
    const updates = {};
    if (typeof body.approved === 'boolean') updates.approved = body.approved;
    if (typeof body.rejected === 'boolean') updates.rejected = body.rejected;
    if (typeof body.featured === 'boolean') updates.featured = body.featured;
    if (body.rejection_reason) updates.rejection_reason = sanitize(body.rejection_reason, 500);
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const { data, error } = await supabase
      .from('aspn_members')
      .update(updates)
      .eq('id', id)
      .select('id, slug, approved, rejected, founder_status')
      .single();
    if (error) return res.status(500).json({ error: 'Update failed', details: error.message });

    return res.json({ success: true, member: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/aspn/admin/pending
 * Admin-only. Lists members awaiting approval.
 */
router.get('/admin/pending', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const adminKey = process.env.ADMIN_KEY || process.env.ASPN_ADMIN_KEY;
    if (!adminKey) return res.status(503).json({ error: 'Admin not configured' });
    if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('aspn_members')
      .select('id, slug, business_name, email, service_category, contact_name, phone, website, city, state, zip, short_description, az_roc_license, founder_status, approved, rejected, featured, created_at')
      .eq('approved', false)
      .eq('rejected', false)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: 'Fetch failed', details: error.message });
    return res.json({ success: true, members: data || [] });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/aspn/stats
 * Public stats for landing page social proof.
 */
router.get('/stats', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const { count: approvedCount } = await supabase
      .from('aspn_members').select('*', { count: 'exact', head: true }).eq('approved', true);
    const { count: totalCount } = await supabase
      .from('aspn_members').select('*', { count: 'exact', head: true });
    const { count: founderCount } = await supabase
      .from('aspn_members').select('*', { count: 'exact', head: true }).eq('founder_status', true).eq('approved', true);

    // Coerce to integers — `count` from Supabase can be null on certain RLS configs
    const members = Number.isFinite(approvedCount) ? approvedCount : 0;
    const founders = Number.isFinite(founderCount) ? founderCount : 0;
    const total = Number.isFinite(totalCount) ? totalCount : 0;
    return res.json({
      success: true,
      stats: {
        members,
        founders,
        total_signups: total,
        founder_seats_remaining: Math.max(50 - founders, 0)
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
