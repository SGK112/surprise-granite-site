/**
 * Authorization Middleware
 * Consolidated authorization helpers used across routes
 */

const logger = require('../utils/logger');

// Admin email whitelist
const ADMIN_EMAILS = [
  'joshb@surprisegranite.com',
  'josh.b@surprisegranite.com'
];

// Account types with admin privileges
const ADMIN_ACCOUNT_TYPES = ['admin', 'business', 'enterprise', 'super_admin'];

// Account types with pro/contractor privileges
const PRO_ACCOUNT_TYPES = ['contractor', 'pro', 'business', 'enterprise', 'admin', 'super_admin'];

/**
 * Check if user has admin access
 * @param {string} userId - User ID to check
 * @param {object} supabase - Supabase client
 * @returns {Promise<boolean>}
 */
async function verifyAdminAccess(userId, supabase) {
  if (!userId || !supabase) return false;

  try {
    const { data: userInfo, error } = await supabase
      .from('sg_users')
      .select('account_type, email')
      .eq('id', userId)
      .single();

    if (error || !userInfo) return false;

    return ADMIN_ACCOUNT_TYPES.includes(userInfo.account_type) ||
           ADMIN_EMAILS.includes(userInfo.email?.toLowerCase());
  } catch (err) {
    logger.error('verifyAdminAccess error:', err);
    return false;
  }
}

/**
 * Check if user has pro/contractor access
 * @param {string} userId - User ID to check
 * @param {object} supabase - Supabase client
 * @returns {Promise<boolean>}
 */
async function verifyProAccess(userId, supabase) {
  if (!userId || !supabase) return false;

  try {
    const { data: userInfo, error } = await supabase
      .from('sg_users')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (error || !userInfo) return false;

    return PRO_ACCOUNT_TYPES.includes(userInfo.account_type);
  } catch (err) {
    logger.error('verifyProAccess error:', err);
    return false;
  }
}

/**
 * Get user profile with role info
 * @param {string} userId - User ID
 * @param {object} supabase - Supabase client
 * @returns {Promise<object|null>}
 */
async function getUserProfile(userId, supabase) {
  if (!userId || !supabase) return null;

  try {
    const { data: profile, error } = await supabase
      .from('sg_users')
      .select('id, email, account_type, full_name, company_name, phone')
      .eq('id', userId)
      .single();

    if (error) return null;

    return {
      ...profile,
      isAdmin: ADMIN_ACCOUNT_TYPES.includes(profile.account_type) ||
               ADMIN_EMAILS.includes(profile.email?.toLowerCase()),
      isPro: PRO_ACCOUNT_TYPES.includes(profile.account_type)
    };
  } catch (err) {
    logger.error('getUserProfile error:', err);
    return null;
  }
}

/**
 * Middleware: Require admin access
 * Attaches isAdmin flag to request
 */
function requireAdmin(req, res, next) {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  verifyAdminAccess(userId, supabase).then(isAdmin => {
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.isAdmin = true;
    next();
  }).catch(err => {
    logger.error('requireAdmin error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  });
}

/**
 * Middleware: Require pro/contractor access
 */
function requirePro(req, res, next) {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  verifyProAccess(userId, supabase).then(isPro => {
    if (!isPro) {
      return res.status(403).json({ error: 'Pro account required' });
    }
    req.isPro = true;
    next();
  }).catch(err => {
    logger.error('requirePro error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  });
}

/**
 * Middleware: Attach user profile to request
 * Non-blocking - continues even if profile not found
 */
function attachProfile(req, res, next) {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!userId) {
    return next();
  }

  getUserProfile(userId, supabase).then(profile => {
    req.profile = profile;
    next();
  }).catch(err => {
    logger.warn('attachProfile error:', err);
    next();
  });
}

module.exports = {
  verifyAdminAccess,
  verifyProAccess,
  getUserProfile,
  requireAdmin,
  requirePro,
  attachProfile,
  ADMIN_EMAILS,
  ADMIN_ACCOUNT_TYPES,
  PRO_ACCOUNT_TYPES
};
