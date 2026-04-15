/**
 * Shared admin authorization middleware.
 *
 * Replaces the three copy-pasted ADMIN_EMAILS whitelists that lived in
 * routes/orders.js, routes/promotions.js, and routes/inventory.js.
 *
 * Source of truth is sg_users.role, so new admins (including Aria) are
 * granted access by updating the DB, not by editing code. A small
 * bootstrap email list stays as a safety net for the human founders —
 * if the DB check ever fails, Josh can still log in.
 *
 * Usage:
 *   const { requireAdmin } = require('../middleware/adminAuth');
 *   router.get('/', authenticateJWT, requireAdmin, handler);
 */

const logger = require('../utils/logger');

// Bootstrap admins — only used if the sg_users row lookup fails or
// the row has no role set. Keep this list tiny; real admin access
// should live in the DB.
const BOOTSTRAP_ADMIN_EMAILS = new Set([
  'joshb@surprisegranite.com',
  'josh.b@surprisegranite.com',
  'info@surprisegranite.com',
  'aria@surprisegranite.com'
]);

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'owner']);
const ADMIN_ACCOUNT_TYPES = new Set(['admin', 'super_admin']);

// Aria's service identity (sg_users row created 2026-04-15).
// Used when a request arrives with a valid ARIA_SERVICE_KEY header but
// no Supabase JWT — the VoiceNow backend calling us server-to-server.
const ARIA_SG_USER_ID = 'ab552f45-b7da-4650-8f2e-5d90d0c4eb88';

/**
 * Look up Aria's sg_users row so downstream handlers get a real
 * adminUser object (with email + role + full_name) instead of a stub.
 * Falls back to a synthetic row if the lookup fails for any reason,
 * so service-to-service auth never hangs on a DB hiccup.
 */
async function loadAriaServiceUser(supabase) {
  try {
    if (!supabase) throw new Error('no supabase');
    const { data: user } = await supabase
      .from('sg_users')
      .select('id, email, full_name, role, account_type')
      .eq('id', ARIA_SG_USER_ID)
      .single();
    if (user) return user;
  } catch (_) { /* fall through */ }
  return {
    id: ARIA_SG_USER_ID,
    email: 'aria@surprisegranite.com',
    full_name: 'Aria',
    role: 'super_admin',
    account_type: 'super_admin'
  };
}

async function requireAdmin(req, res, next) {
  try {
    const supabase = req.app.get('supabase');

    // --- Service-to-service path for Aria (VoiceNow backend) ---
    // If ARIA_SERVICE_KEY is set on this service and the caller sends a
    // matching X-Aria-Service-Key header, the request is authenticated
    // as Aria's sg_users identity. JWT not required.
    const serviceKey = process.env.ARIA_SERVICE_KEY;
    const presentedKey = req.get('x-aria-service-key');
    if (serviceKey && presentedKey && presentedKey === serviceKey) {
      const aria = await loadAriaServiceUser(supabase);
      req.user = { id: aria.id, email: aria.email };
      req.adminUser = aria;
      req.isServiceCall = true;
      return next();
    }

    // --- Human / Supabase JWT path ---
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: user } = await supabase
      .from('sg_users')
      .select('id, email, full_name, role, account_type')
      .eq('id', req.user.id)
      .single();

    const email = (user?.email || req.user.email || '').toLowerCase();
    const isAdmin =
      ADMIN_ROLES.has(user?.role) ||
      ADMIN_ACCOUNT_TYPES.has(user?.account_type) ||
      BOOTSTRAP_ADMIN_EMAILS.has(email);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.adminUser = user || { id: req.user.id, email };
    next();
  } catch (err) {
    logger.error('requireAdmin error:', err.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

/**
 * Programmatic check — for places that don't sit in the middleware
 * chain (e.g. the invoice handler that uses verifyAdminAccess inline).
 */
async function isAdminUser(supabase, userId) {
  if (!supabase || !userId) return false;
  try {
    const { data: user } = await supabase
      .from('sg_users')
      .select('email, role, account_type')
      .eq('id', userId)
      .single();
    if (!user) return false;
    const email = (user.email || '').toLowerCase();
    return (
      ADMIN_ROLES.has(user.role) ||
      ADMIN_ACCOUNT_TYPES.has(user.account_type) ||
      BOOTSTRAP_ADMIN_EMAILS.has(email)
    );
  } catch (_) {
    return false;
  }
}

/**
 * Combined middleware: accepts either an X-Aria-Service-Key (for
 * server-to-server Aria calls from VoiceNow) OR a Supabase JWT that
 * belongs to an admin user. Use this instead of
 * [authenticateJWT, requireAdmin] so service-key requests bypass JWT.
 */
const { authenticateJWT } = require('../lib/auth/middleware');
function adminAccess(req, res, next) {
  const serviceKey = process.env.ARIA_SERVICE_KEY;
  const presentedKey = req.get('x-aria-service-key');
  if (serviceKey && presentedKey && presentedKey === serviceKey) {
    // Skip JWT — requireAdmin will resolve Aria's identity.
    return requireAdmin(req, res, next);
  }
  // Normal path: require JWT, then admin.
  authenticateJWT(req, res, (err) => {
    if (err) return next(err);
    requireAdmin(req, res, next);
  });
}

module.exports = {
  requireAdmin,
  adminAccess,
  isAdminUser,
  BOOTSTRAP_ADMIN_EMAILS,
  ADMIN_ROLES,
  ADMIN_ACCOUNT_TYPES
};
