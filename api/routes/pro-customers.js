/**
 * SURPRISE GRANITE - PRO-CUSTOMER SYSTEM API
 * Handles referral codes, customer linking, notifications, and wishlists
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Email service for notifications
const emailService = require('../services/emailService');

// ============================================================
// MIDDLEWARE: Verify Pro User
// ============================================================
const verifyProUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with role
    const { data: profile } = await supabase
      .from('sg_users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    // Check if pro or admin
    if (!['pro', 'admin', 'super_admin'].includes(profile.role) &&
        !['pro', 'enterprise'].includes(profile.pro_subscription_tier)) {
      return res.status(403).json({ error: 'Pro subscription required' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// MIDDLEWARE: Verify Super Admin (GOD MODE)
// ============================================================
const verifySuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: profile } = await supabase
      .from('sg_users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error('Super admin auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// REFERRAL CODES
// ============================================================

/**
 * GET /api/pro/referral-codes
 * Get all referral codes for the logged-in pro user
 */
router.get('/referral-codes', verifyProUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pro_referral_codes')
      .select('*')
      .eq('pro_user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, codes: data });
  } catch (err) {
    console.error('Error fetching referral codes:', err);
    res.status(500).json({ error: 'Failed to fetch referral codes' });
  }
});

/**
 * POST /api/pro/referral-codes
 * Create a new referral code
 */
router.post('/referral-codes', verifyProUser, async (req, res) => {
  try {
    const { name, customCode, maxUses, expiresAt } = req.body;

    // Generate code if not provided
    let code = customCode;
    if (!code) {
      // Generate random 8-character code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // Check if code already exists
    const { data: existing } = await supabase
      .from('pro_referral_codes')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Referral code already exists' });
    }

    const { data, error } = await supabase
      .from('pro_referral_codes')
      .insert({
        pro_user_id: req.user.id,
        code: code.toUpperCase(),
        name: name || 'My Referral Code',
        max_uses: maxUses || null,
        expires_at: expiresAt || null
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, code: data });
  } catch (err) {
    console.error('Error creating referral code:', err);
    res.status(500).json({ error: 'Failed to create referral code' });
  }
});

/**
 * DELETE /api/pro/referral-codes/:id
 * Delete a referral code
 */
router.delete('/referral-codes/:id', verifyProUser, async (req, res) => {
  try {
    const { error } = await supabase
      .from('pro_referral_codes')
      .delete()
      .eq('id', req.params.id)
      .eq('pro_user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting referral code:', err);
    res.status(500).json({ error: 'Failed to delete referral code' });
  }
});

// ============================================================
// REFERRAL TRACKING (Public endpoints)
// ============================================================

/**
 * GET /api/pro/track-referral/:code
 * Track a referral visit (called when customer visits with ?ref=CODE)
 */
router.get('/track-referral/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    // Find the referral code
    const { data: refCode, error: codeError } = await supabase
      .from('pro_referral_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (codeError || !refCode) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Check if expired
    if (refCode.expires_at && new Date(refCode.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Referral code has expired' });
    }

    // Check max uses
    if (refCode.max_uses && refCode.usage_count >= refCode.max_uses) {
      return res.status(410).json({ error: 'Referral code has reached maximum uses' });
    }

    // Get pro user info for display
    const { data: proUser } = await supabase
      .from('sg_users')
      .select('full_name, company_name')
      .eq('id', refCode.pro_user_id)
      .single();

    // Increment usage count
    await supabase
      .from('pro_referral_codes')
      .update({ usage_count: refCode.usage_count + 1 })
      .eq('id', refCode.id);

    res.json({
      success: true,
      referral: {
        code: refCode.code,
        proUserId: refCode.pro_user_id,
        proName: proUser?.company_name || proUser?.full_name || 'Your Pro'
      }
    });
  } catch (err) {
    console.error('Error tracking referral:', err);
    res.status(500).json({ error: 'Failed to track referral' });
  }
});

/**
 * POST /api/pro/link-customer
 * Link a customer to a pro via referral code
 */
router.post('/link-customer', async (req, res) => {
  try {
    const { referralCode, customerEmail, customerUserId } = req.body;

    if (!referralCode || (!customerEmail && !customerUserId)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find referral code
    const { data: refCode } = await supabase
      .from('pro_referral_codes')
      .select('*')
      .eq('code', referralCode.toUpperCase())
      .eq('is_active', true)
      .single();

    if (!refCode) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Check for existing link
    const existingQuery = supabase
      .from('pro_customer_links')
      .select('id')
      .eq('pro_user_id', refCode.pro_user_id);

    if (customerUserId) {
      existingQuery.eq('customer_user_id', customerUserId);
    } else {
      existingQuery.eq('customer_email', customerEmail.toLowerCase());
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      // Update existing link
      await supabase
        .from('pro_customer_links')
        .update({
          total_visits: supabase.sql`total_visits + 1`,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      return res.json({ success: true, message: 'Customer link updated' });
    }

    // Create new link
    const { data: link, error } = await supabase
      .from('pro_customer_links')
      .insert({
        pro_user_id: refCode.pro_user_id,
        customer_user_id: customerUserId || null,
        customer_email: customerEmail?.toLowerCase() || null,
        referral_code_id: refCode.id
      })
      .select()
      .single();

    if (error) throw error;

    // Create notification for pro
    await createProNotification(
      refCode.pro_user_id,
      customerUserId,
      'new_customer',
      'New Customer Connected!',
      `A new customer (${customerEmail || 'via your link'}) has connected through your referral code "${refCode.code}"`,
      { referralCode: refCode.code, customerEmail }
    );

    res.json({ success: true, link });
  } catch (err) {
    console.error('Error linking customer:', err);
    res.status(500).json({ error: 'Failed to link customer' });
  }
});

// ============================================================
// CUSTOMER MANAGEMENT
// ============================================================

/**
 * GET /api/pro/customers
 * Get all linked customers for the logged-in pro
 */
router.get('/customers', verifyProUser, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('pro_dashboard_customers')
      .select('*')
      .eq('pro_user_id', req.user.id)
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ success: true, customers: data, total: count });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/**
 * GET /api/pro/customers/:customerId/favorites
 * Get a customer's favorites/wishlist
 */
router.get('/customers/:customerId/favorites', verifyProUser, async (req, res) => {
  try {
    // Verify this customer is linked to the pro
    const { data: link } = await supabase
      .from('pro_customer_links')
      .select('id')
      .eq('pro_user_id', req.user.id)
      .eq('customer_user_id', req.params.customerId)
      .single();

    // Super admins can view anyone
    if (!link && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Customer not linked to your account' });
    }

    const { data: favorites, error } = await supabase
      .from('user_favorites')
      .select('*')
      .eq('user_id', req.params.customerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, favorites });
  } catch (err) {
    console.error('Error fetching customer favorites:', err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

/**
 * POST /api/pro/customers/:customerId/notes
 * Add notes to a customer
 */
router.post('/customers/:customerId/notes', verifyProUser, async (req, res) => {
  try {
    const { notes } = req.body;

    const { error } = await supabase
      .from('pro_customer_links')
      .update({ notes })
      .eq('pro_user_id', req.user.id)
      .eq('customer_user_id', req.params.customerId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating notes:', err);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// ============================================================
// NOTIFICATIONS
// ============================================================

/**
 * GET /api/pro/notifications
 * Get notifications for the logged-in pro
 */
router.get('/notifications', verifyProUser, async (req, res) => {
  try {
    const { unreadOnly, limit = 50 } = req.query;

    let query = supabase
      .from('pro_notifications')
      .select('*')
      .eq('pro_user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly === 'true') {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Get unread count
    const { count } = await supabase
      .from('pro_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('pro_user_id', req.user.id)
      .eq('is_read', false);

    res.json({ success: true, notifications: data, unreadCount: count });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/pro/notifications/:id/read
 * Mark a notification as read
 */
router.post('/notifications/:id/read', verifyProUser, async (req, res) => {
  try {
    const { error } = await supabase
      .from('pro_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('pro_user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notification read:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

/**
 * POST /api/pro/notifications/read-all
 * Mark all notifications as read
 */
router.post('/notifications/read-all', verifyProUser, async (req, res) => {
  try {
    const { error } = await supabase
      .from('pro_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('pro_user_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking all notifications read:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

/**
 * GET /api/pro/notification-preferences
 * Get notification preferences
 */
router.get('/notification-preferences', verifyProUser, async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('pro_notification_preferences')
      .select('*')
      .eq('pro_user_id', req.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No preferences yet, create defaults
      const { data: newPrefs } = await supabase
        .from('pro_notification_preferences')
        .insert({ pro_user_id: req.user.id })
        .select()
        .single();
      data = newPrefs;
    }

    res.json({ success: true, preferences: data });
  } catch (err) {
    console.error('Error fetching notification preferences:', err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/pro/notification-preferences
 * Update notification preferences
 */
router.put('/notification-preferences', verifyProUser, async (req, res) => {
  try {
    const { error } = await supabase
      .from('pro_notification_preferences')
      .upsert({
        pro_user_id: req.user.id,
        ...req.body
      });

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating notification preferences:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================================
// SHARED WISHLISTS
// ============================================================

/**
 * POST /api/pro/wishlists/share
 * Create a shared wishlist (customer shares with pro)
 */
router.post('/wishlists/share', async (req, res) => {
  try {
    const { customerUserId, customerEmail, customerName, proUserId, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Wishlist items required' });
    }

    // Generate share token
    const shareToken = require('crypto').randomBytes(18).toString('base64url');

    const { data, error } = await supabase
      .from('shared_wishlists')
      .insert({
        share_token: shareToken,
        customer_user_id: customerUserId || null,
        customer_email: customerEmail,
        customer_name: customerName,
        pro_user_id: proUserId || null,
        items: items,
        item_count: items.length
      })
      .select()
      .single();

    if (error) throw error;

    // If pro is specified, create notification
    if (proUserId) {
      await createProNotification(
        proUserId,
        customerUserId,
        'wishlist_shared',
        'Wishlist Shared With You!',
        `${customerName || customerEmail || 'A customer'} shared a wishlist with ${items.length} items`,
        { shareToken, itemCount: items.length }
      );
    }

    res.json({
      success: true,
      shareToken,
      shareUrl: `${process.env.SITE_URL || 'https://www.surprisegranite.com'}/shared-wishlist/?token=${shareToken}`
    });
  } catch (err) {
    console.error('Error sharing wishlist:', err);
    res.status(500).json({ error: 'Failed to share wishlist' });
  }
});

/**
 * GET /api/pro/wishlists/shared/:token
 * View a shared wishlist (public with token)
 */
router.get('/wishlists/shared/:token', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shared_wishlists')
      .select('*')
      .eq('share_token', req.params.token)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Wishlist link has expired' });
    }

    // Increment view count
    await supabase
      .from('shared_wishlists')
      .update({
        view_count: data.view_count + 1,
        last_viewed_at: new Date().toISOString()
      })
      .eq('id', data.id);

    res.json({ success: true, wishlist: data });
  } catch (err) {
    console.error('Error fetching shared wishlist:', err);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

/**
 * POST /api/pro/wishlists/:id/convert-to-estimate
 * Convert a shared wishlist to an estimate
 */
router.post('/wishlists/:id/convert-to-estimate', verifyProUser, async (req, res) => {
  try {
    // Get the wishlist
    const { data: wishlist, error: wlError } = await supabase
      .from('shared_wishlists')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (wlError || !wishlist) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    // Verify pro has access (is the linked pro or super admin)
    if (wishlist.pro_user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to convert this wishlist' });
    }

    // Create estimate from wishlist items
    const estimateNumber = `EST-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;

    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .insert({
        estimate_number: estimateNumber,
        customer_name: wishlist.customer_name,
        customer_email: wishlist.customer_email,
        status: 'draft',
        notes: `Created from shared wishlist (${wishlist.item_count} items)`,
        metadata: {
          source: 'shared_wishlist',
          wishlist_id: wishlist.id,
          original_items: wishlist.items
        }
      })
      .select()
      .single();

    if (estError) throw estError;

    // Create line items from wishlist
    const lineItems = wishlist.items.map((item, index) => ({
      estimate_id: estimate.id,
      line_number: index + 1,
      description: item.product_title || item.title,
      product_type: item.product_type,
      quantity: 1,
      unit: 'ea',
      notes: `From wishlist: ${item.product_url || ''}`,
      metadata: item
    }));

    if (lineItems.length > 0) {
      await supabase.from('estimate_line_items').insert(lineItems);
    }

    // Update wishlist with estimate reference
    await supabase
      .from('shared_wishlists')
      .update({ converted_to_estimate_id: estimate.id })
      .eq('id', wishlist.id);

    res.json({
      success: true,
      estimate,
      estimateUrl: `/estimate/edit/?id=${estimate.id}`
    });
  } catch (err) {
    console.error('Error converting wishlist to estimate:', err);
    res.status(500).json({ error: 'Failed to convert wishlist' });
  }
});

// ============================================================
// SUPER ADMIN (GOD MODE) ENDPOINTS
// ============================================================

/**
 * GET /api/pro/admin/all-users
 * Get all users (super admin only)
 */
router.get('/admin/all-users', verifySuperAdmin, async (req, res) => {
  try {
    const { search, role, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('sg_users')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, users: data });
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/pro/admin/user/:userId
 * Get detailed user info including all favorites and activity
 */
router.get('/admin/user/:userId', verifySuperAdmin, async (req, res) => {
  try {
    // Get user profile
    const { data: user, error: userError } = await supabase
      .from('sg_users')
      .select('*')
      .eq('id', req.params.userId)
      .single();

    if (userError) throw userError;

    // Get their favorites
    const { data: favorites } = await supabase
      .from('user_favorites')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });

    // Get their activity
    const { data: activity } = await supabase
      .from('customer_activity_log')
      .select('*')
      .eq('customer_user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(100);

    // Get linked pros
    const { data: linkedPros } = await supabase
      .from('pro_customer_links')
      .select('*, pro:sg_users!pro_user_id(full_name, email, company_name)')
      .eq('customer_user_id', req.params.userId);

    res.json({
      success: true,
      user,
      favorites: favorites || [],
      activity: activity || [],
      linkedPros: linkedPros || []
    });
  } catch (err) {
    console.error('Error fetching user details:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

/**
 * PUT /api/pro/admin/user/:userId/role
 * Update a user's role (super admin only)
 */
router.put('/admin/user/:userId/role', verifySuperAdmin, async (req, res) => {
  try {
    const { role, proSubscriptionTier } = req.body;

    const updateData = {};
    if (role) updateData.role = role;
    if (proSubscriptionTier) updateData.pro_subscription_tier = proSubscriptionTier;

    const { error } = await supabase
      .from('sg_users')
      .update(updateData)
      .eq('id', req.params.userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * GET /api/pro/admin/all-activity
 * Get all customer activity across the platform
 */
router.get('/admin/all-activity', verifySuperAdmin, async (req, res) => {
  try {
    const { activityType, limit = 100 } = req.query;

    let query = supabase
      .from('customer_activity_log')
      .select('*, customer:sg_users!customer_user_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (activityType) {
      query = query.eq('activity_type', activityType);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, activity: data });
  } catch (err) {
    console.error('Error fetching all activity:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

/**
 * GET /api/pro/admin/dashboard-stats
 * Get platform-wide statistics
 */
router.get('/admin/dashboard-stats', verifySuperAdmin, async (req, res) => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('sg_users')
      .select('*', { count: 'exact', head: true });

    // Pro users
    const { count: proUsers } = await supabase
      .from('sg_users')
      .select('*', { count: 'exact', head: true })
      .in('role', ['pro', 'admin', 'super_admin']);

    // Total favorites
    const { count: totalFavorites } = await supabase
      .from('user_favorites')
      .select('*', { count: 'exact', head: true });

    // Active referral codes
    const { count: activeReferralCodes } = await supabase
      .from('pro_referral_codes')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Customer links
    const { count: customerLinks } = await supabase
      .from('pro_customer_links')
      .select('*', { count: 'exact', head: true });

    // Recent signups (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentSignups } = await supabase
      .from('sg_users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo);

    res.json({
      success: true,
      stats: {
        totalUsers,
        proUsers,
        totalFavorites,
        activeReferralCodes,
        customerLinks,
        recentSignups
      }
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Create a notification for a pro user
 */
async function createProNotification(proUserId, customerUserId, type, title, message, data = {}) {
  try {
    // Insert notification
    await supabase
      .from('pro_notifications')
      .insert({
        pro_user_id: proUserId,
        customer_user_id: customerUserId,
        notification_type: type,
        title,
        message,
        data
      });

    // Check if we should send email
    const { data: prefs } = await supabase
      .from('pro_notification_preferences')
      .select('*')
      .eq('pro_user_id', proUserId)
      .single();

    // Default to sending emails if no preferences set
    const shouldEmail = !prefs || prefs[`email_${type.replace('-', '_')}`] !== false;

    if (shouldEmail && prefs?.email_digest_frequency === 'instant') {
      // Get pro email
      const { data: proUser } = await supabase
        .from('sg_users')
        .select('email, full_name')
        .eq('id', proUserId)
        .single();

      if (proUser?.email) {
        await sendProNotificationEmail(proUser.email, proUser.full_name, title, message, data);
      }
    }
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

/**
 * Send notification email to pro
 */
async function sendProNotificationEmail(email, name, title, message, data) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
          <h1 style="color: #d4a855; margin: 0; font-size: 24px;">Surprise Granite</h1>
          <p style="color: #888; margin: 10px 0 0;">Pro Dashboard Notification</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-top: 0;">${title}</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">${message}</p>
          ${data.shareToken ? `
            <a href="${process.env.SITE_URL || 'https://www.surprisegranite.com'}/shared-wishlist/?token=${data.shareToken}"
               style="display: inline-block; background: #d4a855; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: bold;">
              View Wishlist
            </a>
          ` : ''}
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="color: #888; font-size: 14px;">
            <a href="${process.env.SITE_URL || 'https://www.surprisegranite.com'}/account/pro-dashboard/"
               style="color: #d4a855;">View your Pro Dashboard</a>
            to see all your customers and notifications.
          </p>
        </div>
        <div style="padding: 20px; text-align: center; background: #1a1a2e;">
          <p style="color: #666; font-size: 12px; margin: 0;">
            Surprise Granite | (623) 466-9004
          </p>
        </div>
      </div>
    `;

    await emailService.sendNotification(email, `[Surprise Granite Pro] ${title}`, html);
  } catch (err) {
    console.error('Error sending pro notification email:', err);
  }
}

module.exports = router;
