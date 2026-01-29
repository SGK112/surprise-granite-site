/**
 * Authentication & SSO Routes
 * Handles enterprise SSO, team management, sessions
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { handleApiError } = require('../utils/security');
const { authenticateJWT, requireRole, logAuditEvent, getClientIP } = require('../lib/auth/middleware');

// Email transporter (will be initialized from app settings)
let transporter = null;

// Initialize email transporter
function initTransporter() {
  if (!transporter) {
    const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
    const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (SMTP_USER && SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      });
    }
  }
  return transporter;
}

// ============ SSO AUTHENTICATION ============

/**
 * Check if email domain requires SSO
 * POST /api/auth/check-sso-domain
 */
router.post('/check-sso-domain', async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.json({ sso_required: false });
    }

    const domain = '@' + email.split('@')[1].toLowerCase();

    const { data: ssoConfig } = await supabase
      .from('distributor_sso_config')
      .select('provider, enforce_sso, distributor_id, default_role')
      .filter('email_domains', 'cs', `{${domain}}`)
      .eq('is_active', true)
      .single();

    if (ssoConfig) {
      res.json({
        sso_required: ssoConfig.enforce_sso,
        sso_available: true,
        provider: ssoConfig.provider,
        distributor_id: ssoConfig.distributor_id
      });
    } else {
      res.json({ sso_required: false, sso_available: false });
    }
  } catch (error) {
    logger.error('Check SSO domain error:', error);
    res.json({ sso_required: false, sso_available: false });
  }
});

/**
 * Provision SSO user after successful OAuth login
 * POST /api/auth/provision-sso-user
 */
router.post('/provision-sso-user', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const user = req.user;
    const email = user.email;
    const domain = '@' + email.split('@')[1].toLowerCase();

    const { data: ssoConfig } = await supabase
      .from('distributor_sso_config')
      .select('distributor_id, default_role, auto_provision_users')
      .filter('email_domains', 'cs', `{${domain}}`)
      .eq('is_active', true)
      .single();

    if (!ssoConfig) {
      return res.status(404).json({
        error: 'No SSO configuration found for your email domain',
        code: 'NO_SSO_CONFIG'
      });
    }

    const { data: existingRole } = await supabase
      .from('distributor_user_roles')
      .select('role, permissions, is_active')
      .eq('user_id', user.id)
      .eq('distributor_id', ssoConfig.distributor_id)
      .single();

    if (existingRole) {
      await logAuditEvent({
        eventType: 'sso_login',
        userId: user.id,
        distributorId: ssoConfig.distributor_id,
        details: { existing_role: existingRole.role },
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent']
      });

      return res.json({
        distributor_id: ssoConfig.distributor_id,
        role: existingRole.role,
        permissions: existingRole.permissions,
        existing: true
      });
    }

    if (ssoConfig.auto_provision_users) {
      const { data: template } = await supabase
        .from('role_permission_templates')
        .select('permissions')
        .eq('role', ssoConfig.default_role)
        .single();

      const { data: newRole, error: roleError } = await supabase
        .from('distributor_user_roles')
        .insert({
          distributor_id: ssoConfig.distributor_id,
          user_id: user.id,
          role: ssoConfig.default_role,
          permissions: template?.permissions || {},
          is_active: true,
          accepted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (roleError) throw roleError;

      await logAuditEvent({
        eventType: 'sso_provisioned',
        userId: user.id,
        distributorId: ssoConfig.distributor_id,
        details: { role: ssoConfig.default_role, auto_provisioned: true },
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent']
      });

      return res.json({
        distributor_id: ssoConfig.distributor_id,
        role: newRole.role,
        permissions: newRole.permissions,
        provisioned: true
      });
    }

    res.json({
      distributor_id: ssoConfig.distributor_id,
      pending_approval: true,
      message: 'Your account requires administrator approval'
    });

  } catch (error) {
    logger.error('Provision SSO user error:', error);
    return handleApiError(res, error, 'Provision SSO user');
  }
});

/**
 * Get current user's distributor access
 * GET /api/auth/my-distributors
 */
router.get('/my-distributors', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: roles, error } = await supabase
      .from('distributor_user_roles')
      .select(`
        distributor_id,
        role,
        permissions,
        is_active,
        accepted_at,
        distributors(id, company_name, logo_url, status)
      `)
      .eq('user_id', req.user.id)
      .eq('is_active', true);

    if (error) throw error;

    res.json({
      distributors: roles.map(r => ({
        distributor_id: r.distributor_id,
        role: r.role,
        permissions: r.permissions,
        joined_at: r.accepted_at,
        company_name: r.distributors?.company_name,
        logo_url: r.distributors?.logo_url,
        status: r.distributors?.status
      }))
    });
  } catch (error) {
    logger.error('Get my distributors error:', error);
    return handleApiError(res, error, 'Get distributors');
  }
});

/**
 * Get user's role for a specific distributor
 * GET /api/auth/role/:distributorId
 */
router.get('/role/:distributorId', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: role, error } = await supabase
      .from('distributor_user_roles')
      .select('role, permissions, is_active')
      .eq('user_id', req.user.id)
      .eq('distributor_id', req.params.distributorId)
      .single();

    if (error || !role || !role.is_active) {
      return res.status(404).json({
        error: 'No role found for this distributor',
        code: 'NO_ROLE'
      });
    }

    res.json(role);
  } catch (error) {
    logger.error('Get role error:', error);
    return handleApiError(res, error, 'Get role');
  }
});

/**
 * Accept team invitation
 * POST /api/auth/accept-invite
 */
router.post('/accept-invite', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Invitation token required' });
    }

    const { data: invite, error: findError } = await supabase
      .from('distributor_user_roles')
      .select('*, distributors(company_name)')
      .eq('invite_token', token)
      .eq('is_active', false)
      .single();

    if (findError || !invite) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    if (new Date(invite.invite_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    const { error: updateError } = await supabase
      .from('distributor_user_roles')
      .update({
        user_id: req.user.id,
        is_active: true,
        accepted_at: new Date().toISOString(),
        invite_token: null,
        invite_expires_at: null
      })
      .eq('id', invite.id);

    if (updateError) throw updateError;

    await logAuditEvent({
      eventType: 'user_accepted_invite',
      userId: req.user.id,
      distributorId: invite.distributor_id,
      details: { role: invite.role },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      distributor_id: invite.distributor_id,
      role: invite.role,
      company_name: invite.distributors?.company_name
    });

  } catch (error) {
    logger.error('Accept invite error:', error);
    return handleApiError(res, error, 'Accept invite');
  }
});

/**
 * Get user sessions
 * GET /api/auth/sessions
 */
router.get('/sessions', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('id, device_info, ip_address, last_active_at, created_at')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .order('last_active_at', { ascending: false });

    if (error) throw error;

    res.json({ sessions: sessions || [] });
  } catch (error) {
    logger.error('Get sessions error:', error);
    return handleApiError(res, error, 'Get sessions');
  }
});

/**
 * Revoke a specific session
 * DELETE /api/auth/sessions/:sessionId
 */
router.delete('/sessions/:sessionId', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { error } = await supabase
      .from('user_sessions')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', req.params.sessionId)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke session error:', error);
    return handleApiError(res, error, 'Revoke session');
  }
});

/**
 * Revoke all other sessions
 * POST /api/auth/sessions/revoke-others
 */
router.post('/sessions/revoke-others', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const currentSessionId = req.headers['x-session-id'];

    let query = supabase
      .from('user_sessions')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .eq('is_active', true);

    if (currentSessionId) {
      query = query.neq('id', currentSessionId);
    }

    const { error } = await query;

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke other sessions error:', error);
    return handleApiError(res, error, 'Revoke sessions');
  }
});

// ============ TEAM MANAGEMENT ============

/**
 * Invite user to distributor team
 * POST /api/auth/distributor/:id/team/invite
 */
router.post('/distributor/:id/team/invite', authenticateJWT, requireRole('admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { email, role } = req.body;
    const distributorId = req.params.id;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    const validRoles = ['admin', 'sales', 'warehouse_manager', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role', validRoles });
    }

    const { data: template } = await supabase
      .from('role_permission_templates')
      .select('permissions')
      .eq('role', role)
      .single();

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    let userId = existingUser?.id;

    const { data: invite, error } = await supabase
      .from('distributor_user_roles')
      .upsert({
        distributor_id: distributorId,
        user_id: userId,
        role,
        permissions: template?.permissions || {},
        is_active: false,
        invited_at: new Date().toISOString(),
        invited_by: req.user.id,
        invite_token: inviteToken,
        invite_expires_at: inviteExpires.toISOString()
      }, {
        onConflict: 'distributor_id,user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    const { data: distributor } = await supabase
      .from('distributors')
      .select('company_name')
      .eq('id', distributorId)
      .single();

    // Send invitation email
    const emailTransporter = initTransporter();
    if (emailTransporter) {
      const inviteUrl = `https://www.surprisegranite.com/distributor/invite?token=${inviteToken}`;

      await emailTransporter.sendMail({
        from: `"Surprise Granite" <${process.env.ADMIN_EMAIL || 'info@surprisegranite.com'}>`,
        to: email,
        subject: `You've been invited to join ${distributor?.company_name || 'a distributor'} on Surprise Granite`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: white; padding: 30px; border-radius: 12px;">
            <h2 style="color: #f9cb00;">Team Invitation</h2>
            <p>You've been invited to join <strong>${distributor?.company_name || 'a distributor'}</strong> as a <strong>${role}</strong>.</p>
            <p>Click the button below to accept this invitation:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #f9cb00; color: #1a1a2e; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Accept Invitation</a>
            </div>
            <p style="color: #888; font-size: 14px;">This invitation expires in 7 days.</p>
          </div>
        `
      });
    }

    await logAuditEvent({
      eventType: 'user_invited',
      userId: req.user.id,
      distributorId,
      details: { invited_email: email, role },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: `Invitation sent to ${email}`,
      invite_id: invite.id
    });

  } catch (error) {
    logger.error('Invite user error:', error);
    return handleApiError(res, error, 'Invite user');
  }
});

/**
 * Get team members for a distributor
 * GET /api/auth/distributor/:id/team
 */
router.get('/distributor/:id/team', authenticateJWT, requireRole('admin', 'sales'), async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: members, error } = await supabase
      .from('distributor_user_roles')
      .select(`
        id,
        user_id,
        role,
        permissions,
        is_active,
        invited_at,
        accepted_at,
        sg_users(id, email, full_name, avatar_url)
      `)
      .eq('distributor_id', req.params.id)
      .order('accepted_at', { ascending: false });

    if (error) throw error;

    res.json({
      members: members.map(m => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        permissions: m.permissions,
        is_active: m.is_active,
        invited_at: m.invited_at,
        accepted_at: m.accepted_at,
        email: m.sg_users?.email,
        full_name: m.sg_users?.full_name,
        avatar_url: m.sg_users?.avatar_url
      }))
    });
  } catch (error) {
    logger.error('Get team error:', error);
    return handleApiError(res, error, 'Get team');
  }
});

/**
 * Update team member role
 * PATCH /api/auth/distributor/:id/team/:memberId
 */
router.patch('/distributor/:id/team/:memberId', authenticateJWT, requireRole('admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { role, permissions, is_active } = req.body;
    const updates = {};

    if (role) updates.role = role;
    if (permissions) updates.permissions = permissions;
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    const { data: member, error } = await supabase
      .from('distributor_user_roles')
      .update(updates)
      .eq('id', req.params.memberId)
      .eq('distributor_id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      eventType: 'user_role_updated',
      userId: req.user.id,
      distributorId: req.params.id,
      details: { member_id: req.params.memberId, updates },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ member });
  } catch (error) {
    logger.error('Update member error:', error);
    return handleApiError(res, error, 'Update member');
  }
});

/**
 * Remove team member
 * DELETE /api/auth/distributor/:id/team/:memberId
 */
router.delete('/distributor/:id/team/:memberId', authenticateJWT, requireRole('admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { error } = await supabase
      .from('distributor_user_roles')
      .delete()
      .eq('id', req.params.memberId)
      .eq('distributor_id', req.params.id);

    if (error) throw error;

    await logAuditEvent({
      eventType: 'user_removed',
      userId: req.user.id,
      distributorId: req.params.id,
      details: { member_id: req.params.memberId },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Remove member error:', error);
    return handleApiError(res, error, 'Remove member');
  }
});

/**
 * Get audit logs for distributor
 * GET /api/auth/distributor/:id/audit-logs
 */
router.get('/distributor/:id/audit-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { limit = 50 } = req.query;

    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select(`
        id,
        event_type,
        user_id,
        details,
        ip_address,
        created_at,
        sg_users(email, full_name)
      `)
      .eq('distributor_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ logs: logs || [] });
  } catch (error) {
    logger.error('Get audit logs error:', error);
    return handleApiError(res, error, 'Get audit logs');
  }
});

module.exports = router;
