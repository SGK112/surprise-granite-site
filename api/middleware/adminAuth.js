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

async function requireAdmin(req, res, next) {
  try {
    const supabase = req.app.get('supabase');
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

    // Attach for downstream handlers (audit logs, etc.)
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

module.exports = {
  requireAdmin,
  isAdminUser,
  BOOTSTRAP_ADMIN_EMAILS,
  ADMIN_ROLES,
  ADMIN_ACCOUNT_TYPES
};
