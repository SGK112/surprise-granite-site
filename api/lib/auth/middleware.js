/**
 * Enterprise Authentication Middleware
 * JWT verification, role-based access control, and permission checking
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase client (will be set from server.js)
let supabase = null;

/**
 * Initialize the auth middleware with Supabase client
 */
function initAuth(supabaseClient) {
  supabase = supabaseClient;
}

/**
 * Log audit event to database
 */
async function logAuditEvent({
  eventType,
  userId = null,
  distributorId = null,
  details = {},
  ipAddress = null,
  userAgent = null,
  status = 'success',
  errorMessage = null
}) {
  if (!supabase) return;

  try {
    await supabase.from('auth_audit_logs').insert({
      event_type: eventType,
      event_status: status,
      user_id: userId,
      distributor_id: distributorId,
      ip_address: ipAddress,
      user_agent: userAgent,
      details,
      error_message: errorMessage
    });
  } catch (error) {
    console.error('Failed to log audit event:', error.message);
  }
}

/**
 * Extract client IP from request
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
}

/**
 * Verify distributor API key
 */
async function verifyApiKey(apiKey) {
  if (!supabase || !apiKey || !apiKey.startsWith('sg_')) return null;

  const keyPrefix = apiKey.substring(0, 11);
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const { data, error } = await supabase
    .from('distributor_api_keys')
    .select('id, distributor_id, permissions, rate_limit_per_hour, allowed_ips, is_active')
    .eq('key_prefix', keyPrefix)
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  // Update last used
  await supabase
    .from('distributor_api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      total_requests: supabase.sql`total_requests + 1`
    })
    .eq('id', data.id);

  return data;
}

/**
 * JWT Authentication Middleware
 * Verifies Bearer tokens, API keys, or legacy headers
 */
async function authenticateJWT(req, res, next) {
  if (!supabase) {
    return res.status(500).json({ error: 'Authentication service not configured' });
  }

  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'];

  try {
    // Priority 1: Bearer token (JWT)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        await logAuditEvent({
          eventType: 'login_failed',
          details: { method: 'jwt', reason: error?.message || 'Invalid token' },
          ipAddress,
          userAgent,
          status: 'failed'
        });

        return res.status(401).json({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }

      req.user = user;
      req.accessToken = token;
      req.authMethod = 'jwt';
      return next();
    }

    // Priority 2: API Key (machine-to-machine)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const keyData = await verifyApiKey(apiKey);

      if (!keyData) {
        await logAuditEvent({
          eventType: 'api_key_used',
          details: { reason: 'Invalid API key' },
          ipAddress,
          userAgent,
          status: 'failed'
        });

        return res.status(401).json({
          error: 'Invalid API key',
          code: 'INVALID_API_KEY'
        });
      }

      // Check IP allowlist if configured
      if (keyData.allowed_ips && keyData.allowed_ips.length > 0) {
        if (!keyData.allowed_ips.includes(ipAddress)) {
          await logAuditEvent({
            eventType: 'api_key_used',
            distributorId: keyData.distributor_id,
            details: { reason: 'IP not allowed', ip: ipAddress },
            ipAddress,
            userAgent,
            status: 'blocked'
          });

          return res.status(403).json({
            error: 'IP address not allowed',
            code: 'IP_BLOCKED'
          });
        }
      }

      await logAuditEvent({
        eventType: 'api_key_used',
        distributorId: keyData.distributor_id,
        details: { key_id: keyData.id },
        ipAddress,
        userAgent,
        status: 'success'
      });

      req.apiKey = keyData;
      req.distributorId = keyData.distributor_id;
      req.permissions = keyData.permissions;
      req.authMethod = 'api_key';
      return next();
    }

    // Legacy x-user-id header has been removed for security
    // All clients must use JWT Bearer tokens or API keys

    // No authentication provided
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH',
      hint: 'Provide Authorization: Bearer <token> header or x-api-key header'
    });

  } catch (error) {
    console.error('Auth middleware error:', error);

    await logAuditEvent({
      eventType: 'login_failed',
      details: { error: error.message },
      ipAddress,
      userAgent,
      status: 'failed',
      errorMessage: error.message
    });

    return res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional authentication - doesn't fail if not authenticated
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  const userId = req.headers['x-user-id'];

  if (!authHeader && !apiKey && !userId) {
    // No auth provided - continue without user context
    return next();
  }

  // Try to authenticate but don't fail
  return authenticateJWT(req, res, (err) => {
    if (err) {
      // Authentication failed but we allow anonymous access
      console.log('Optional auth failed, continuing anonymously');
    }
    next();
  });
}

/**
 * Get distributor ID from request (handles both JWT and API key auth)
 */
async function getDistributorId(req) {
  // If API key auth, distributor ID is already set
  if (req.distributorId) {
    return req.distributorId;
  }

  // If JWT auth, look up distributor by user ID
  if (req.user?.id) {
    // Check distributors table
    const { data: distributor } = await supabase
      .from('distributors')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (distributor?.id) return distributor.id;

    // Check user roles table (for team members)
    const { data: role } = await supabase
      .from('distributor_user_roles')
      .select('distributor_id')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .single();

    return role?.distributor_id || null;
  }

  return null;
}

/**
 * Load user's role and permissions for a distributor
 */
async function loadUserRole(req, distributorId) {
  if (!req.user?.id || !distributorId) return null;

  const { data: role, error } = await supabase
    .from('distributor_user_roles')
    .select('role, permissions, is_active')
    .eq('user_id', req.user.id)
    .eq('distributor_id', distributorId)
    .single();

  if (error || !role || !role.is_active) return null;

  return role;
}

/**
 * Role-based authorization middleware
 * Checks if user has one of the allowed roles
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user && !req.apiKey) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // API keys have their own permission system
    if (req.authMethod === 'api_key') {
      // API keys are considered to have 'api' role - check permissions instead
      return next();
    }

    // Get distributor ID from route or query
    const distributorId = req.params.distributorId ||
                         req.params.id ||
                         req.query.distributor_id ||
                         await getDistributorId(req);

    if (!distributorId) {
      return res.status(400).json({
        error: 'Distributor context required',
        code: 'NO_DISTRIBUTOR'
      });
    }

    req.distributorId = distributorId;

    try {
      const role = await loadUserRole(req, distributorId);

      if (!role) {
        await logAuditEvent({
          eventType: 'permission_denied',
          userId: req.user.id,
          distributorId,
          details: { reason: 'No role assigned', required: allowedRoles },
          ipAddress: getClientIP(req),
          status: 'failed'
        });

        return res.status(403).json({
          error: 'Access denied - no role assigned for this distributor',
          code: 'NO_ROLE'
        });
      }

      if (!allowedRoles.includes(role.role)) {
        await logAuditEvent({
          eventType: 'permission_denied',
          userId: req.user.id,
          distributorId,
          details: { userRole: role.role, required: allowedRoles },
          ipAddress: getClientIP(req),
          status: 'failed'
        });

        return res.status(403).json({
          error: `Access denied - requires ${allowedRoles.join(' or ')} role`,
          code: 'INSUFFICIENT_ROLE',
          yourRole: role.role
        });
      }

      req.userRole = role.role;
      req.userPermissions = role.permissions;
      next();

    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ error: 'Authorization service error' });
    }
  };
}

/**
 * Permission-based authorization middleware
 * Checks if user has specific permission for a resource/action
 */
function requirePermission(resource, action) {
  return async (req, res, next) => {
    // For API keys, check their permissions array
    if (req.authMethod === 'api_key') {
      const permissions = req.permissions || [];
      const actionMap = { read: 'read', write: 'write', delete: 'delete' };
      const requiredPerm = actionMap[action] || action;

      if (!permissions.includes(requiredPerm)) {
        await logAuditEvent({
          eventType: 'permission_denied',
          distributorId: req.distributorId,
          details: { resource, action, method: 'api_key' },
          ipAddress: getClientIP(req),
          status: 'failed'
        });

        return res.status(403).json({
          error: `API key lacks '${requiredPerm}' permission`,
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }
      return next();
    }

    // For JWT auth, check user permissions
    if (!req.userPermissions) {
      // Try to load permissions if not already loaded
      const distributorId = req.distributorId || await getDistributorId(req);
      if (distributorId) {
        const role = await loadUserRole(req, distributorId);
        if (role) {
          req.userPermissions = role.permissions;
          req.userRole = role.role;
        }
      }
    }

    const hasPermission = req.userPermissions?.[resource]?.[action] === true;

    if (!hasPermission) {
      await logAuditEvent({
        eventType: 'permission_denied',
        userId: req.user?.id,
        distributorId: req.distributorId,
        details: { resource, action },
        ipAddress: getClientIP(req),
        status: 'failed'
      });

      return res.status(403).json({
        error: `Permission denied: ${resource}.${action}`,
        code: 'PERMISSION_DENIED'
      });
    }

    next();
  };
}

/**
 * Distributor context middleware
 * Ensures distributor ID is available and user has access
 */
async function requireDistributor(req, res, next) {
  const distributorId = req.params.distributorId ||
                       req.params.id ||
                       req.query.distributor_id ||
                       await getDistributorId(req);

  if (!distributorId) {
    return res.status(400).json({
      error: 'Distributor context required',
      code: 'NO_DISTRIBUTOR'
    });
  }

  // Verify user has access to this distributor
  if (req.user?.id && req.authMethod !== 'api_key') {
    const role = await loadUserRole(req, distributorId);
    if (!role) {
      return res.status(403).json({
        error: 'You do not have access to this distributor',
        code: 'NO_ACCESS'
      });
    }
    req.userRole = role.role;
    req.userPermissions = role.permissions;
  }

  req.distributorId = distributorId;
  next();
}

module.exports = {
  initAuth,
  authenticateJWT,
  optionalAuth,
  requireRole,
  requirePermission,
  requireDistributor,
  getDistributorId,
  loadUserRole,
  logAuditEvent,
  getClientIP,
  verifyApiKey
};
