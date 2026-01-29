/**
 * SURPRISE GRANITE - COLLABORATION & DESIGN HANDOFF API
 * Handles project collaborators and design handoff workflow
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const { escapeHtml } = require('../utils/security');

// Initialize Supabase with service role for admin operations
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn('Collaboration: Supabase credentials not configured - routes will be disabled');
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

// Supported collaborator roles (now includes customer)
const COLLABORATOR_ROLES = ['designer', 'fabricator', 'contractor', 'installer', 'viewer', 'customer'];

const schemas = {
  inviteCollaborator: Joi.object({
    user_id: Joi.string().uuid().required(),
    role: Joi.string().valid(...COLLABORATOR_ROLES).required(),
    access_level: Joi.string().valid('read', 'write', 'admin').default('read'),
    notes: Joi.string().max(500).trim().allow('')
  }),

  updateCollaborator: Joi.object({
    invitation_status: Joi.string().valid('accepted', 'declined', 'removed'),
    access_level: Joi.string().valid('read', 'write', 'admin'),
    role: Joi.string().valid(...COLLABORATOR_ROLES),
    notes: Joi.string().max(500).trim().allow('')
  }),

  addCustomerCollaborator: Joi.object({
    customer_email: Joi.string().email().max(254).lowercase().trim(),
    customer_name: Joi.string().max(200).trim(),
    customer_phone: Joi.string().max(20).allow('', null),
    portal_access: Joi.boolean().default(true),
    can_view_files: Joi.boolean().default(true),
    can_view_schedule: Joi.boolean().default(true),
    can_view_handoff: Joi.boolean().default(true),
    can_send_messages: Joi.boolean().default(true)
  }),

  createHandoff: Joi.object({
    title: Joi.string().max(200).trim().required(),
    description: Joi.string().max(2000).trim().allow(''),
    fabricator_id: Joi.string().uuid().allow(null),
    contractor_id: Joi.string().uuid().allow(null),
    design_file_url: Joi.string().uri().max(500).allow('', null),
    notes: Joi.string().max(2000).trim().allow('')
  }),

  inviteByEmail: Joi.object({
    email: Joi.string().email().max(254).lowercase().trim().required(),
    role: Joi.string().valid(...COLLABORATOR_ROLES).required(),
    access_level: Joi.string().valid('read', 'write', 'admin').default('read'),
    notes: Joi.string().max(500).trim().allow('')
  }),

  acceptInvitation: Joi.object({
    token: Joi.string().hex().length(64).required()
  }),

  updateHandoff: Joi.object({
    title: Joi.string().max(200).trim(),
    description: Joi.string().max(2000).trim().allow(''),
    stage: Joi.string().valid(
      'design_created', 'design_review', 'design_approved',
      'fabrication_quote_requested', 'fabrication_quote_received',
      'fabrication_approved', 'materials_ordered',
      'fabrication_in_progress', 'fabrication_complete',
      'install_scheduled', 'install_in_progress',
      'install_complete', 'final_review'
    ),
    fabricator_id: Joi.string().uuid().allow(null),
    contractor_id: Joi.string().uuid().allow(null),
    design_file_url: Joi.string().uri().max(500).allow('', null),
    quote_amount: Joi.number().precision(2).min(0).allow(null),
    scheduled_date: Joi.date().iso().allow(null),
    notes: Joi.string().max(2000).trim().allow('')
  })
};

// ============================================================
// MIDDLEWARE: Verify Pro or Designer User
// ============================================================

const verifyProOrDesigner = async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

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

    // Check if pro, designer, or admin
    if (!['pro', 'designer', 'admin', 'super_admin'].includes(profile.role) &&
        !['pro', 'designer', 'enterprise'].includes(profile.pro_subscription_tier)) {
      return res.status(403).json({ error: 'Pro or Designer subscription required' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    logger.apiError(err, { context: 'Collaboration auth error' });
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// HELPER: Create notification
// ============================================================

async function createCollaborationNotification(proUserId, type, title, message, data = {}) {
  try {
    await supabase
      .from('pro_notifications')
      .insert({
        pro_user_id: proUserId,
        notification_type: type,
        title,
        message,
        data
      });
  } catch (err) {
    logger.apiError(err, { context: 'Failed to create collaboration notification' });
  }
}

// ============================================================
// HELPER: Invitation token utilities
// ============================================================

function generateInvitationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// ============================================================
// HELPER: Generate collaboration invitation email
// ============================================================

function generateCollaborationInviteEmail({ inviterName, projectTitle, role, isExistingUser, acceptUrl }) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">You're Invited to Collaborate</h2>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px; line-height: 1.6;">
      <strong>${escapeHtml(inviterName)}</strong> has invited you to collaborate on
      <strong>"${escapeHtml(projectTitle || 'Untitled Project')}"</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.
    </p>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
      <table width="100%" cellspacing="0" cellpadding="8">
        <tr>
          <td style="color: #666; font-weight: 600; width: 120px;">Project:</td>
          <td style="color: #1a1a2e;">${escapeHtml(projectTitle || 'Untitled Project')}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Your Role:</td>
          <td style="color: #1a1a2e;">${escapeHtml(roleLabel)}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Invited By:</td>
          <td style="color: #1a1a2e;">${escapeHtml(inviterName)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${acceptUrl}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        ${isExistingUser ? 'Accept Invitation' : 'Create Account &amp; Join'}
      </a>
    </div>

    <p style="margin: 0 0 8px; color: #888; font-size: 13px; text-align: center;">
      ${isExistingUser
        ? 'Click above to accept this collaboration invite.'
        : 'Create your free account to start collaborating on this project.'}
    </p>
    <p style="margin: 0; color: #aaa; font-size: 12px; text-align: center;">
      This invitation expires in 7 days.
    </p>
  `;

  return {
    subject: `${inviterName} invited you to collaborate - Remodely`,
    html: emailService.wrapEmailTemplate(content, { headerText: 'Project Invitation' })
  };
}

// ============================================================
// COLLABORATOR MANAGEMENT
// ============================================================

/**
 * GET /api/collaboration/projects/:projectId/collaborators
 * List project collaborators
 */
router.get('/projects/:projectId/collaborators', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  // Verify user is owner or collaborator
  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isOwner = project.user_id === req.user.id;

  if (!isOwner) {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to view collaborators' });
    }
  }

  const { data: collaborators, error } = await supabase
    .from('project_collaborators')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Fetch user details for collaborators
  const userIds = collaborators?.filter(c => c.user_id).map(c => c.user_id) || [];
  let userMap = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('sg_users')
      .select('id, full_name, email, avatar_url, role')
      .in('id', userIds);

    userMap = (users || []).reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
  }

  // Attach user details
  const enrichedCollaborators = collaborators?.map(c => ({
    ...c,
    user: c.user_id ? userMap[c.user_id] || null : null
  })) || [];

  logger.info('Listed project collaborators', { projectId, count: enrichedCollaborators.length });

  res.json({ success: true, collaborators: enrichedCollaborators });
}));

/**
 * POST /api/collaboration/projects/:projectId/collaborators
 * Invite a user as collaborator
 */
router.post('/projects/:projectId/collaborators',
  verifyProOrDesigner,
  validateBody(schemas.inviteCollaborator),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { user_id, role, access_level, notes } = req.body;

    // Verify project exists and user is owner
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only project owner can invite collaborators' });
    }

    // Cannot invite yourself
    if (user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot invite yourself as collaborator' });
    }

    // Check if already invited
    const { data: existing } = await supabase
      .from('project_collaborators')
      .select('id, invitation_status')
      .eq('project_id', projectId)
      .eq('user_id', user_id)
      .single();

    if (existing && existing.invitation_status !== 'removed' && existing.invitation_status !== 'declined') {
      return res.status(400).json({ error: 'User already invited to this project' });
    }

    let collaborator;
    if (existing) {
      // Re-invite removed/declined user
      const { data, error } = await supabase
        .from('project_collaborators')
        .update({
          role,
          access_level,
          notes: notes || null,
          invitation_status: 'pending',
          invited_by: req.user.id,
          invited_at: new Date().toISOString(),
          removed_at: null,
          accepted_at: null
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      collaborator = data;
    } else {
      const { data, error } = await supabase
        .from('project_collaborators')
        .insert({
          project_id: projectId,
          user_id,
          role,
          access_level,
          notes: notes || null,
          invited_by: req.user.id
        })
        .select()
        .single();

      if (error) throw error;
      collaborator = data;
    }

    // Notify the invited user
    await createCollaborationNotification(
      user_id,
      'collaborator_invited',
      'Project Collaboration Invite',
      `You have been invited as a ${role} on project "${project.name || 'Untitled'}"`,
      { projectId, role, access_level, invited_by: req.user.id }
    );

    logger.info('Collaborator invited', { projectId, userId: user_id, role });

    res.json({ success: true, collaborator });
  })
);

/**
 * PUT /api/collaboration/projects/:projectId/collaborators/:collaboratorId
 * Accept/decline/update collaborator
 */
router.put('/projects/:projectId/collaborators/:collaboratorId',
  verifyProOrDesigner,
  validateBody(schemas.updateCollaborator),
  asyncHandler(async (req, res) => {
    const { projectId, collaboratorId } = req.params;
    const updates = req.body;

    // Get current collaborator record
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('*')
      .eq('id', collaboratorId)
      .eq('project_id', projectId)
      .single();

    if (!collab) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    // Determine permissions
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    const isOwner = project && project.user_id === req.user.id;
    const isSelf = collab.user_id === req.user.id;

    // Self can accept/decline; owner can update role/access/remove
    if (!isOwner && !isSelf && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to update this collaborator' });
    }

    const updateData = {};

    // Self can only accept or decline
    if (isSelf && !isOwner) {
      if (updates.invitation_status && ['accepted', 'declined'].includes(updates.invitation_status)) {
        updateData.invitation_status = updates.invitation_status;
        if (updates.invitation_status === 'accepted') {
          updateData.accepted_at = new Date().toISOString();
        }
      }
    } else {
      // Owner can update everything
      if (updates.invitation_status) updateData.invitation_status = updates.invitation_status;
      if (updates.access_level) updateData.access_level = updates.access_level;
      if (updates.role) updateData.role = updates.role;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.invitation_status === 'removed') {
        updateData.removed_at = new Date().toISOString();
      }
      if (updates.invitation_status === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const { data: updated, error } = await supabase
      .from('project_collaborators')
      .update(updateData)
      .eq('id', collaboratorId)
      .select()
      .single();

    if (error) throw error;

    // Notify on acceptance
    if (updateData.invitation_status === 'accepted' && collab.invited_by) {
      await createCollaborationNotification(
        collab.invited_by,
        'collaborator_accepted',
        'Collaboration Accepted',
        `A collaborator has accepted your invitation to the project`,
        { projectId, collaboratorId, role: collab.role }
      );
    }

    logger.info('Collaborator updated', { projectId, collaboratorId, updates: updateData });

    res.json({ success: true, collaborator: updated });
  })
);

/**
 * DELETE /api/collaboration/projects/:projectId/collaborators/:collaboratorId
 * Remove collaborator
 */
router.delete('/projects/:projectId/collaborators/:collaboratorId',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { projectId, collaboratorId } = req.params;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only project owner can remove collaborators' });
    }

    const { error } = await supabase
      .from('project_collaborators')
      .update({
        invitation_status: 'removed',
        removed_at: new Date().toISOString()
      })
      .eq('id', collaboratorId)
      .eq('project_id', projectId);

    if (error) throw error;

    logger.info('Collaborator removed', { projectId, collaboratorId });

    res.json({ success: true });
  })
);

/**
 * GET /api/collaboration/my-projects
 * List projects where user is a collaborator
 */
router.get('/my-projects', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { status, role } = req.query;

  let query = supabase
    .from('project_collaborators')
    .select('*, project:projects!project_id(id, name, status, created_at, user_id)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('invitation_status', status);
  }

  if (role) {
    query = query.eq('role', role);
  }

  const { data: collaborations, error } = await query;

  if (error) throw error;

  logger.info('Listed user collaborations', { userId: req.user.id, count: collaborations?.length || 0 });

  res.json({ success: true, collaborations: collaborations || [] });
}));

// ============================================================
// DESIGN HANDOFF WORKFLOW
// ============================================================

// Ordered stage list for advancement
const HANDOFF_STAGES = [
  'design_created',
  'design_review',
  'design_approved',
  'fabrication_quote_requested',
  'fabrication_quote_received',
  'fabrication_approved',
  'materials_ordered',
  'fabrication_in_progress',
  'fabrication_complete',
  'install_scheduled',
  'install_in_progress',
  'install_complete',
  'final_review'
];

/**
 * GET /api/collaboration/projects/:projectId/handoffs
 * List all handoff stages for a project
 */
router.get('/projects/:projectId/handoffs', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  // Verify access
  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isOwner = project.user_id === req.user.id;

  if (!isOwner && req.profile.role !== 'super_admin') {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab) {
      // Also check if user is a handoff participant
      const { data: handoff } = await supabase
        .from('design_handoffs')
        .select('id')
        .eq('project_id', projectId)
        .or(`designer_id.eq.${req.user.id},fabricator_id.eq.${req.user.id},contractor_id.eq.${req.user.id}`)
        .limit(1)
        .single();

      if (!handoff) {
        return res.status(403).json({ error: 'Not authorized to view handoffs' });
      }
    }
  }

  const { data: handoffs, error } = await supabase
    .from('design_handoffs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  logger.info('Listed project handoffs', { projectId, count: handoffs?.length || 0 });

  res.json({ success: true, handoffs: handoffs || [] });
}));

/**
 * POST /api/collaboration/projects/:projectId/handoffs
 * Create a new handoff stage
 */
router.post('/projects/:projectId/handoffs',
  verifyProOrDesigner,
  validateBody(schemas.createHandoff),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { title, description, fabricator_id, contractor_id, design_file_url, notes } = req.body;

    // Verify project exists
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Must be owner, collaborator with write access, or super admin
    const isOwner = project.user_id === req.user.id;
    let hasWriteAccess = false;

    if (!isOwner) {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('access_level')
        .eq('project_id', projectId)
        .eq('user_id', req.user.id)
        .eq('invitation_status', 'accepted')
        .single();

      hasWriteAccess = collab && ['write', 'admin'].includes(collab.access_level);
    }

    if (!isOwner && !hasWriteAccess && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Write access required to create handoffs' });
    }

    const { data: handoff, error } = await supabase
      .from('design_handoffs')
      .insert({
        project_id: projectId,
        designer_id: req.user.id,
        fabricator_id: fabricator_id || null,
        contractor_id: contractor_id || null,
        title,
        description: description || null,
        design_file_url: design_file_url || null,
        notes: notes || null,
        stage: 'design_created',
        stage_history: [{ stage: 'design_created', changed_by: req.user.id, changed_at: new Date().toISOString() }]
      })
      .select()
      .single();

    if (error) throw error;

    // Notify project owner if creator is not owner
    if (!isOwner) {
      await createCollaborationNotification(
        project.user_id,
        'design_handoff_created',
        'New Design Handoff',
        `A design handoff "${title}" has been created for project "${project.name || 'Untitled'}"`,
        { projectId, handoffId: handoff.id, designerId: req.user.id }
      );
    }

    // Notify fabricator if assigned
    if (fabricator_id) {
      await createCollaborationNotification(
        fabricator_id,
        'design_handoff_created',
        'Design Handoff Assigned',
        `You have been assigned as fabricator on handoff "${title}"`,
        { projectId, handoffId: handoff.id }
      );
    }

    // Notify contractor if assigned
    if (contractor_id) {
      await createCollaborationNotification(
        contractor_id,
        'design_handoff_created',
        'Design Handoff Assigned',
        `You have been assigned as contractor on handoff "${title}"`,
        { projectId, handoffId: handoff.id }
      );
    }

    logger.info('Design handoff created', { projectId, handoffId: handoff.id, title });

    res.json({ success: true, handoff });
  })
);

/**
 * PUT /api/collaboration/handoffs/:handoffId
 * Update handoff details/status
 */
router.put('/handoffs/:handoffId',
  verifyProOrDesigner,
  validateBody(schemas.updateHandoff),
  asyncHandler(async (req, res) => {
    const { handoffId } = req.params;

    // Get current handoff
    const { data: handoff } = await supabase
      .from('design_handoffs')
      .select('*')
      .eq('id', handoffId)
      .single();

    if (!handoff) {
      return res.status(404).json({ error: 'Handoff not found' });
    }

    // Verify participant access
    const isParticipant = [handoff.designer_id, handoff.fabricator_id, handoff.contractor_id].includes(req.user.id);
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', handoff.project_id)
      .single();

    const isOwner = project && project.user_id === req.user.id;

    if (!isParticipant && !isOwner && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to update this handoff' });
    }

    const updateData = {};
    if (req.body.title) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.stage) updateData.stage = req.body.stage;
    if (req.body.fabricator_id !== undefined) updateData.fabricator_id = req.body.fabricator_id;
    if (req.body.contractor_id !== undefined) updateData.contractor_id = req.body.contractor_id;
    if (req.body.design_file_url !== undefined) updateData.design_file_url = req.body.design_file_url;
    if (req.body.quote_amount !== undefined) updateData.quote_amount = req.body.quote_amount;
    if (req.body.scheduled_date !== undefined) updateData.scheduled_date = req.body.scheduled_date;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const { data: updated, error } = await supabase
      .from('design_handoffs')
      .update(updateData)
      .eq('id', handoffId)
      .select()
      .single();

    if (error) throw error;

    // Send stage change notification if stage changed
    if (req.body.stage && req.body.stage !== handoff.stage) {
      const notifyUsers = [handoff.designer_id, handoff.fabricator_id, handoff.contractor_id, project?.user_id]
        .filter(id => id && id !== req.user.id);

      const uniqueUsers = [...new Set(notifyUsers)];

      for (const userId of uniqueUsers) {
        await createCollaborationNotification(
          userId,
          'design_handoff_stage_change',
          'Handoff Stage Updated',
          `"${handoff.title}" moved to ${req.body.stage.replace(/_/g, ' ')}`,
          { handoffId, fromStage: handoff.stage, toStage: req.body.stage, projectId: handoff.project_id }
        );
      }
    }

    // Notify on quote received
    if (req.body.stage === 'fabrication_quote_received' && handoff.designer_id) {
      await createCollaborationNotification(
        handoff.designer_id,
        'fabrication_quote_ready',
        'Fabrication Quote Ready',
        `Quote received for "${handoff.title}"${req.body.quote_amount ? ': $' + req.body.quote_amount : ''}`,
        { handoffId, quoteAmount: req.body.quote_amount, projectId: handoff.project_id }
      );
    }

    // Notify on install scheduled
    if (req.body.stage === 'install_scheduled') {
      const notifyUsers = [handoff.designer_id, handoff.contractor_id, project?.user_id]
        .filter(id => id && id !== req.user.id);

      for (const userId of [...new Set(notifyUsers)]) {
        await createCollaborationNotification(
          userId,
          'install_scheduled',
          'Installation Scheduled',
          `Installation scheduled for "${handoff.title}"${req.body.scheduled_date ? ' on ' + new Date(req.body.scheduled_date).toLocaleDateString() : ''}`,
          { handoffId, scheduledDate: req.body.scheduled_date, projectId: handoff.project_id }
        );
      }
    }

    logger.info('Handoff updated', { handoffId, updates: Object.keys(updateData) });

    res.json({ success: true, handoff: updated });
  })
);

/**
 * GET /api/collaboration/handoffs/:handoffId
 * Get handoff details
 */
router.get('/handoffs/:handoffId', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { handoffId } = req.params;

  const { data: handoff, error } = await supabase
    .from('design_handoffs')
    .select(`
      *,
      designer:sg_users!designer_id(full_name, email, avatar_url),
      fabricator:sg_users!fabricator_id(full_name, email, avatar_url),
      contractor:sg_users!contractor_id(full_name, email, avatar_url)
    `)
    .eq('id', handoffId)
    .single();

  if (error || !handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  // Verify participant access
  const isParticipant = [handoff.designer_id, handoff.fabricator_id, handoff.contractor_id].includes(req.user.id);

  if (!isParticipant && req.profile.role !== 'super_admin') {
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', handoff.project_id)
      .single();

    const isOwner = project && project.user_id === req.user.id;

    if (!isOwner) {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id')
        .eq('project_id', handoff.project_id)
        .eq('user_id', req.user.id)
        .eq('invitation_status', 'accepted')
        .single();

      if (!collab) {
        return res.status(403).json({ error: 'Not authorized to view this handoff' });
      }
    }
  }

  logger.info('Handoff details fetched', { handoffId });

  res.json({ success: true, handoff });
}));

/**
 * POST /api/collaboration/handoffs/:handoffId/advance
 * Advance to the next workflow stage
 */
router.post('/handoffs/:handoffId/advance', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { handoffId } = req.params;

  // Get current handoff
  const { data: handoff } = await supabase
    .from('design_handoffs')
    .select('*')
    .eq('id', handoffId)
    .single();

  if (!handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  // Verify participant access
  const isParticipant = [handoff.designer_id, handoff.fabricator_id, handoff.contractor_id].includes(req.user.id);
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', handoff.project_id)
    .single();

  const isOwner = project && project.user_id === req.user.id;

  if (!isParticipant && !isOwner && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized to advance this handoff' });
  }

  // Determine next stage
  const currentIndex = HANDOFF_STAGES.indexOf(handoff.stage);
  if (currentIndex === -1 || currentIndex >= HANDOFF_STAGES.length - 1) {
    return res.status(400).json({
      error: 'Handoff is already at the final stage or in an unknown state',
      currentStage: handoff.stage
    });
  }

  const nextStage = HANDOFF_STAGES[currentIndex + 1];

  const { data: updated, error } = await supabase
    .from('design_handoffs')
    .update({ stage: nextStage })
    .eq('id', handoffId)
    .select()
    .single();

  if (error) throw error;

  // Notify all participants of advancement
  const notifyUsers = [handoff.designer_id, handoff.fabricator_id, handoff.contractor_id, project?.user_id]
    .filter(id => id && id !== req.user.id);

  const uniqueUsers = [...new Set(notifyUsers)];

  // Use specific notification types for key stages
  let notificationType = 'design_handoff_stage_change';
  if (nextStage === 'fabrication_quote_received') notificationType = 'fabrication_quote_ready';
  if (nextStage === 'install_scheduled') notificationType = 'install_scheduled';
  if (nextStage === 'final_review') notificationType = 'handoff_review_requested';

  for (const userId of uniqueUsers) {
    await createCollaborationNotification(
      userId,
      notificationType,
      'Handoff Advanced',
      `"${handoff.title}" advanced to ${nextStage.replace(/_/g, ' ')}`,
      { handoffId, fromStage: handoff.stage, toStage: nextStage, projectId: handoff.project_id }
    );
  }

  // If final review, also send handoff_completed to designer
  if (nextStage === 'final_review' && handoff.designer_id && handoff.designer_id !== req.user.id) {
    await createCollaborationNotification(
      handoff.designer_id,
      'handoff_completed',
      'Handoff Complete',
      `Design handoff "${handoff.title}" has reached final review`,
      { handoffId, projectId: handoff.project_id }
    );
  }

  logger.info('Handoff advanced', { handoffId, fromStage: handoff.stage, toStage: nextStage });

  res.json({
    success: true,
    handoff: updated,
    previousStage: handoff.stage,
    currentStage: nextStage
  });
}));

// ============================================================
// EMAIL-BASED INVITATION FLOW
// ============================================================

/**
 * POST /api/collaboration/projects/:projectId/invite
 * Invite a collaborator by email address
 * - Existing user: creates collaborator record + sends accept email
 * - New user: creates pending invitation + sends signup email
 */
router.post('/projects/:projectId/invite',
  verifyProOrDesigner,
  validateBody(schemas.inviteByEmail),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { email, role, access_level, notes } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Verify project exists and user is owner
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only project owner can invite collaborators' });
    }

    // Cannot invite yourself
    if (normalizedEmail === req.profile.email?.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot invite yourself as collaborator' });
    }

    // Check if user exists by email
    const { data: existingUser } = await supabase
      .from('sg_users')
      .select('id, email, full_name')
      .eq('email', normalizedEmail)
      .single();

    const SITE_URL = process.env.SITE_URL || 'https://www.surprisegranite.com';
    const inviterName = req.profile.full_name || req.profile.email || 'A Remodely Pro';

    if (existingUser) {
      // --- EXISTING USER FLOW ---
      const { data: existing } = await supabase
        .from('project_collaborators')
        .select('id, invitation_status')
        .eq('project_id', projectId)
        .eq('user_id', existingUser.id)
        .single();

      if (existing && existing.invitation_status !== 'removed' && existing.invitation_status !== 'declined') {
        return res.status(400).json({ error: 'User already invited to this project' });
      }

      let collaborator;
      if (existing) {
        const { data, error } = await supabase
          .from('project_collaborators')
          .update({
            role,
            access_level,
            notes: notes || null,
            invitation_status: 'pending',
            invited_by: req.user.id,
            invited_at: new Date().toISOString(),
            removed_at: null,
            accepted_at: null
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        collaborator = data;
      } else {
        const { data, error } = await supabase
          .from('project_collaborators')
          .insert({
            project_id: projectId,
            user_id: existingUser.id,
            role,
            access_level,
            notes: notes || null,
            invited_by: req.user.id
          })
          .select()
          .single();

        if (error) throw error;
        collaborator = data;
      }

      // Generate token for email accept link
      const { rawToken, tokenHash } = generateInvitationToken();

      await supabase
        .from('pending_email_invitations')
        .insert({
          project_id: projectId,
          email: normalizedEmail,
          role,
          access_level,
          notes: notes || null,
          token_hash: tokenHash,
          token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          invited_by: req.user.id,
          metadata: { user_id: existingUser.id, collaborator_id: collaborator.id }
        });

      // Send branded accept email
      const acceptUrl = `${SITE_URL}/account/?accept_invite=${rawToken}`;
      const emailContent = generateCollaborationInviteEmail({
        inviterName,
        projectTitle: project.name,
        role,
        isExistingUser: true,
        acceptUrl
      });

      await emailService.sendNotification(normalizedEmail, emailContent.subject, emailContent.html);

      // In-app notification
      await createCollaborationNotification(
        existingUser.id,
        'collaborator_invited',
        'Project Collaboration Invite',
        `${inviterName} invited you as a ${role} on project "${project.name || 'Untitled'}"`,
        { projectId, role, access_level, invited_by: req.user.id }
      );

      logger.info('Collaborator invited by email (existing user)', {
        projectId, email: normalizedEmail, role
      });

      res.json({
        success: true,
        collaborator,
        inviteType: 'existing_user',
        message: `Invitation sent to ${normalizedEmail}`
      });

    } else {
      // --- NEW USER FLOW ---
      const { data: existingInvite } = await supabase
        .from('pending_email_invitations')
        .select('id')
        .eq('project_id', projectId)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .single();

      if (existingInvite) {
        return res.status(400).json({ error: 'An invitation is already pending for this email' });
      }

      const { rawToken, tokenHash } = generateInvitationToken();

      const { data: invitation, error } = await supabase
        .from('pending_email_invitations')
        .insert({
          project_id: projectId,
          email: normalizedEmail,
          role,
          access_level,
          notes: notes || null,
          token_hash: tokenHash,
          token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          invited_by: req.user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Send signup + invite email
      const signupUrl = `${SITE_URL}/sign-up/?invite=${rawToken}`;
      const emailContent = generateCollaborationInviteEmail({
        inviterName,
        projectTitle: project.name,
        role,
        isExistingUser: false,
        acceptUrl: signupUrl
      });

      await emailService.sendNotification(normalizedEmail, emailContent.subject, emailContent.html);

      logger.info('Collaborator invited by email (new user)', {
        projectId, email: normalizedEmail, role, invitationId: invitation.id
      });

      res.json({
        success: true,
        invitation: { id: invitation.id, email: normalizedEmail, role, status: 'pending' },
        inviteType: 'new_user',
        message: `Invitation sent to ${normalizedEmail}. They will need to create an account.`
      });
    }
  })
);

/**
 * POST /api/collaboration/invite/accept
 * Accept an invitation via token (requires authentication)
 */
router.post('/invite/accept',
  verifyProOrDesigner,
  validateBody(schemas.acceptInvitation),
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    const tokenHash = hashToken(token);

    const { data: invitation } = await supabase
      .from('pending_email_invitations')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('status', 'pending')
      .single();

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation token' });
    }

    if (new Date(invitation.token_expires_at) < new Date()) {
      await supabase
        .from('pending_email_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'This invitation has expired' });
    }

    // Verify email matches the authenticated user
    const userEmail = req.profile.email?.toLowerCase();
    if (userEmail !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        error: 'This invitation was sent to a different email address'
      });
    }

    // Create or update collaborator record
    const { data: existing } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', invitation.project_id)
      .eq('user_id', req.user.id)
      .single();

    let collaborator;
    if (existing) {
      const { data, error } = await supabase
        .from('project_collaborators')
        .update({
          invitation_status: 'accepted',
          accepted_at: new Date().toISOString(),
          role: invitation.role,
          access_level: invitation.access_level
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      collaborator = data;
    } else {
      const { data, error } = await supabase
        .from('project_collaborators')
        .insert({
          project_id: invitation.project_id,
          user_id: req.user.id,
          role: invitation.role,
          access_level: invitation.access_level,
          notes: invitation.notes,
          invited_by: invitation.invited_by,
          invitation_status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      collaborator = data;
    }

    // Mark invitation as accepted
    await supabase
      .from('pending_email_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    // Notify the inviter
    await createCollaborationNotification(
      invitation.invited_by,
      'collaborator_accepted',
      'Collaboration Accepted',
      `${req.profile.full_name || req.profile.email} accepted your invitation`,
      { projectId: invitation.project_id, collaboratorId: collaborator.id, role: invitation.role }
    );

    logger.info('Invitation accepted via token', {
      invitationId: invitation.id,
      projectId: invitation.project_id,
      userId: req.user.id
    });

    res.json({
      success: true,
      collaborator,
      projectId: invitation.project_id,
      message: 'Invitation accepted successfully'
    });
  })
);

/**
 * GET /api/collaboration/invite/verify/:token
 * Verify an invitation token (public - no auth required)
 * Used by frontend to show invitation details before login/signup
 */
router.get('/invite/verify/:token', asyncHandler(async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { token } = req.params;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid token format' });
  }

  const tokenHash = hashToken(token);

  const { data: invitation } = await supabase
    .from('pending_email_invitations')
    .select('id, project_id, email, role, access_level, status, token_expires_at, invited_by')
    .eq('token_hash', tokenHash)
    .single();

  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  if (invitation.status !== 'pending') {
    return res.status(400).json({ error: 'This invitation has already been ' + invitation.status });
  }

  if (new Date(invitation.token_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This invitation has expired' });
  }

  // Get project title and inviter name for display
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', invitation.project_id)
    .single();

  const { data: inviter } = await supabase
    .from('sg_users')
    .select('full_name, email')
    .eq('id', invitation.invited_by)
    .single();

  // Check if user already has an account
  const { data: existingUser } = await supabase
    .from('sg_users')
    .select('id')
    .eq('email', invitation.email.toLowerCase())
    .single();

  res.json({
    success: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      access_level: invitation.access_level,
      projectTitle: project?.name || 'Untitled Project',
      inviterName: inviter?.full_name || inviter?.email || 'A team member',
      hasAccount: !!existingUser,
      expiresAt: invitation.token_expires_at
    }
  });
}));

/**
 * POST /api/collaboration/invite/claim
 * Claim all pending invitations for the authenticated user's email
 * Called after signup or login
 */
router.post('/invite/claim', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const userEmail = req.profile.email?.toLowerCase();

  if (!userEmail) {
    return res.status(400).json({ error: 'User email not found in profile' });
  }

  // Try RPC function first
  const { data, error } = await supabase
    .rpc('claim_pending_invitations', {
      p_user_id: req.user.id,
      p_email: userEmail
    });

  if (error) {
    // Fallback: claim manually
    logger.warn('RPC claim_pending_invitations failed, using fallback', { error: error.message });

    const { data: pendingInvites } = await supabase
      .from('pending_email_invitations')
      .select('*')
      .eq('email', userEmail)
      .eq('status', 'pending')
      .gt('token_expires_at', new Date().toISOString());

    let claimedCount = 0;
    for (const inv of (pendingInvites || [])) {
      const { error: insertError } = await supabase
        .from('project_collaborators')
        .upsert({
          project_id: inv.project_id,
          user_id: req.user.id,
          role: inv.role,
          access_level: inv.access_level,
          notes: inv.notes,
          invited_by: inv.invited_by,
          invitation_status: 'accepted',
          accepted_at: new Date().toISOString()
        }, { onConflict: 'project_id,user_id' });

      if (!insertError) {
        await supabase
          .from('pending_email_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', inv.id);

        await createCollaborationNotification(
          inv.invited_by,
          'collaborator_accepted',
          'Collaboration Accepted',
          `${req.profile.full_name || userEmail} accepted your invitation`,
          { projectId: inv.project_id, role: inv.role }
        );

        claimedCount++;
      }
    }

    logger.info('Pending invitations claimed (fallback)', { userId: req.user.id, claimedCount });
    return res.json({ success: true, claimedCount });
  }

  const claimedCount = data || 0;

  logger.info('Pending invitations claimed', { userId: req.user.id, email: userEmail, claimedCount });

  res.json({ success: true, claimedCount });
}));

/**
 * GET /api/collaboration/projects/:projectId/pending-invitations
 * List pending email invitations for a project (owner only)
 */
router.get('/projects/:projectId/pending-invitations',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only project owner can view pending invitations' });
    }

    const { data: invitations, error } = await supabase
      .from('pending_email_invitations')
      .select('id, email, role, access_level, status, created_at, token_expires_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, invitations: invitations || [] });
  })
);

/**
 * DELETE /api/collaboration/projects/:projectId/pending-invitations/:invitationId
 * Cancel a pending email invitation
 */
router.delete('/projects/:projectId/pending-invitations/:invitationId',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { projectId, invitationId } = req.params;

    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (!project || (project.user_id !== req.user.id && req.profile.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Only project owner can cancel invitations' });
    }

    const { error } = await supabase
      .from('pending_email_invitations')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('project_id', projectId)
      .eq('status', 'pending');

    if (error) throw error;

    logger.info('Pending invitation cancelled', { projectId, invitationId });

    res.json({ success: true });
  })
);

// ============================================================
// GENERAL COLLABORATORS (PROJECT-INDEPENDENT)
// ============================================================

const generalCollaboratorSchema = Joi.object({
  email: Joi.string().email().max(254).lowercase().trim().allow('', null),
  phone: Joi.string().max(20).trim().allow('', null),
  name: Joi.string().max(200).trim().allow('', null),
  role: Joi.string().valid('designer', 'fabricator', 'contractor', 'installer', 'vendor', 'partner').default('partner'),
  notes: Joi.string().max(500).trim().allow('')
}).custom((value, helpers) => {
  // Require at least email or phone
  if (!value.email && !value.phone) {
    return helpers.error('any.custom', { message: 'Either email or phone is required' });
  }
  // Default name from email if not provided
  if (!value.name && value.email) {
    value.name = value.email.split('@')[0];
  }
  return value;
});

/**
 * Helper: Generate general collaborator invitation email
 */
function generateGeneralInviteEmail({ inviterName, inviterBusiness, role, isExistingUser, acceptUrl }) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">You're Invited to Connect</h2>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px; line-height: 1.6;">
      <strong>${escapeHtml(inviterName)}</strong>${inviterBusiness ? ` from <strong>${escapeHtml(inviterBusiness)}</strong>` : ''}
      has invited you to join their professional network as a <strong>${escapeHtml(roleLabel)}</strong>.
    </p>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
      <table width="100%" cellspacing="0" cellpadding="8">
        <tr>
          <td style="color: #666; font-weight: 600; width: 140px;">Your Role:</td>
          <td style="color: #1a1a2e;">${escapeHtml(roleLabel)}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Invited By:</td>
          <td style="color: #1a1a2e;">${escapeHtml(inviterName)}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 14px; line-height: 1.6;">
      By accepting this invitation, you'll be able to:
    </p>
    <ul style="margin: 0 0 25px; color: #444; font-size: 14px; line-height: 1.8;">
      <li>Collaborate on projects together</li>
      <li>Share designs and specifications</li>
      <li>Communicate directly through the platform</li>
    </ul>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${acceptUrl}" style="display: inline-block; background: linear-gradient(135deg, #4285F4 0%, #34A853 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        ${isExistingUser ? 'Accept Invitation' : 'Join Remodely Free'}
      </a>
    </div>

    <p style="margin: 0; color: #aaa; font-size: 12px; text-align: center;">
      This invitation expires in 7 days.
    </p>
  `;

  return {
    subject: `${inviterName} wants to connect on Remodely`,
    html: emailService.wrapEmailTemplate(content, { headerText: 'Network Invitation' })
  };
}

/**
 * POST /api/collaboration/invite-general
 * Invite a collaborator without requiring a project
 */
router.post('/invite-general',
  verifyProOrDesigner,
  validateBody(generalCollaboratorSchema),
  asyncHandler(async (req, res) => {
    const { email, phone, name, role, notes } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;

    // Must have email or phone
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Please provide email or phone number' });
    }

    // Cannot invite yourself
    if (normalizedEmail && normalizedEmail === req.profile.email?.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    // Check if already invited by this user (by email or phone)
    let existingQuery = supabase
      .from('general_collaborators')
      .select('id, status')
      .eq('invited_by', req.user.id);

    if (normalizedEmail) {
      existingQuery = existingQuery.eq('email', normalizedEmail);
    } else if (normalizedPhone) {
      existingQuery = existingQuery.ilike('metadata->>phone', `%${normalizedPhone.slice(-10)}%`);
    }

    const { data: existing } = await existingQuery.single();

    if (existing && existing.status !== 'removed' && existing.status !== 'declined') {
      return res.status(400).json({ error: 'You have already invited this person' });
    }

    const SITE_URL = process.env.SITE_URL || 'https://www.surprisegranite.com';
    const inviterName = req.profile.full_name || req.profile.email || 'A Remodely Pro';
    const inviterBusiness = req.profile.company_name;

    // Check if user exists (by email)
    let existingUser = null;
    if (normalizedEmail) {
      const { data } = await supabase
        .from('sg_users')
        .select('id, email, full_name')
        .eq('email', normalizedEmail)
        .single();
      existingUser = data;
    }

    const { rawToken, tokenHash } = generateInvitationToken();
    const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let collaborator;
    const collaboratorData = {
      name: name || existingUser?.full_name || null,
      role,
      status: 'pending',
      notes: notes || null,
      token_hash: tokenHash,
      token_expires_at: tokenExpires,
      invited_at: new Date().toISOString(),
      accepted_at: null,
      user_id: existingUser?.id || null,
      email: normalizedEmail || null,
      metadata: { phone: normalizedPhone }
    };

    if (existing) {
      // Re-invite removed/declined collaborator
      const { data, error } = await supabase
        .from('general_collaborators')
        .update(collaboratorData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      collaborator = data;
    } else {
      const { data, error } = await supabase
        .from('general_collaborators')
        .insert({
          ...collaboratorData,
          invited_by: req.user.id
        })
        .select()
        .single();

      if (error) throw error;
      collaborator = data;
    }

    // Build invite URL
    const acceptUrl = existingUser
      ? `${SITE_URL}/account/?accept_network=${rawToken}`
      : `${SITE_URL}/sign-up/?network_invite=${rawToken}`;

    let sentVia = [];

    // Send invitation email if we have email
    if (normalizedEmail) {
      try {
        const emailContent = generateGeneralInviteEmail({
          inviterName,
          inviterBusiness,
          role,
          isExistingUser: !!existingUser,
          acceptUrl
        });
        await emailService.sendNotification(normalizedEmail, emailContent.subject, emailContent.html);
        sentVia.push('email');
      } catch (emailErr) {
        logger.warn('Failed to send invite email', { error: emailErr.message });
      }
    }

    // Send SMS if we have phone
    if (normalizedPhone && smsService) {
      try {
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        const smsMessage = `${inviterName} invited you to Remodely as a ${roleLabel}! Sign up free: ${acceptUrl}`;
        await smsService.sendSMS(normalizedPhone, smsMessage);
        sentVia.push('SMS');
      } catch (smsErr) {
        logger.warn('Failed to send invite SMS', { error: smsErr.message });
      }
    }

    // In-app notification if user exists
    if (existingUser) {
      await createCollaborationNotification(
        existingUser.id,
        'network_invitation',
        'Network Connection Request',
        `${inviterName} wants to add you to their professional network as a ${role}`,
        { collaboratorId: collaborator.id, role, invited_by: req.user.id }
      );
    }

    logger.info('General collaborator invited', {
      email: normalizedEmail, phone: normalizedPhone ? '***' : null, role, existingUser: !!existingUser, sentVia
    });

    // Build response message
    let message = 'Invite sent';
    if (sentVia.length > 0) {
      message = `Invite sent via ${sentVia.join(' and ')} to ${name}`;
    } else if (existingUser) {
      message = `${name} will see the invite in their dashboard`;
    }

    res.json({
      success: true,
      collaborator,
      inviteType: existingUser ? 'existing_user' : 'new_user',
      sentVia,
      message
    });
  })
);

/**
 * POST /api/collaboration/quick-share
 * Generate a quick shareable invite link (no email sent, just returns the link)
 */
router.post('/quick-share', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const SITE_URL = process.env.SITE_URL || 'https://www.surprisegranite.com';
  const inviterName = req.profile.full_name || req.profile.email || 'A Remodely Pro';

  const { rawToken, tokenHash } = generateInvitationToken();
  const tokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  // Create a pending collaborator entry with just the token
  const { data: collaborator, error } = await supabase
    .from('general_collaborators')
    .insert({
      invited_by: req.user.id,
      name: null,
      email: null,
      role: 'partner',
      status: 'pending',
      notes: 'Quick share link',
      token_hash: tokenHash,
      token_expires_at: tokenExpires,
      invited_at: new Date().toISOString(),
      metadata: { quick_share: true }
    })
    .select()
    .single();

  if (error) {
    logger.error('Quick share link creation failed', { error: error.message });
    throw error;
  }

  // Generate the invite URL
  const inviteUrl = `${SITE_URL}/sign-up/?network_invite=${rawToken}`;

  logger.info('Quick share link generated', { userId: req.user.id });

  res.json({
    success: true,
    link: inviteUrl,
    expiresAt: tokenExpires,
    inviterName,
    message: 'Share this link to invite collaborators'
  });
}));

/**
 * GET /api/collaboration/my-collaborators
 * List your general collaborators (network)
 */
router.get('/my-collaborators', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { status, role } = req.query;

  let query = supabase
    .from('general_collaborators')
    .select('*')
    .eq('invited_by', req.user.id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  } else {
    // Default: exclude removed
    query = query.neq('status', 'removed');
  }

  if (role) {
    query = query.eq('role', role);
  }

  const { data: collaborators, error } = await query;

  if (error) throw error;

  // Fetch user details for collaborators who have registered
  const userIds = collaborators?.filter(c => c.user_id).map(c => c.user_id) || [];
  let userMap = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('sg_users')
      .select('id, full_name, email, avatar_url, role')
      .in('id', userIds);

    userMap = (users || []).reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
  }

  // Attach user details to collaborators
  const enrichedCollaborators = collaborators?.map(c => ({
    ...c,
    user: c.user_id ? userMap[c.user_id] || null : null
  })) || [];

  logger.info('Listed general collaborators', { userId: req.user.id, count: enrichedCollaborators.length });

  res.json({ success: true, collaborators: enrichedCollaborators });
}));

/**
 * GET /api/collaboration/my-invitations
 * List invitations I've received (as collaborator)
 */
router.get('/my-invitations', verifyProOrDesigner, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const userEmail = req.profile.email?.toLowerCase();

  let query = supabase
    .from('general_collaborators')
    .select('*')
    .or(`user_id.eq.${req.user.id},email.eq.${userEmail}`)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: invitations, error } = await query;

  if (error) throw error;

  // Fetch inviter details
  const inviterIds = [...new Set(invitations?.map(i => i.invited_by) || [])];
  let inviterMap = {};

  if (inviterIds.length > 0) {
    const { data: inviters } = await supabase
      .from('sg_users')
      .select('id, full_name, email, avatar_url, company_name')
      .in('id', inviterIds);

    inviterMap = (inviters || []).reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
  }

  // Attach inviter details
  const enrichedInvitations = invitations?.map(i => ({
    ...i,
    inviter: inviterMap[i.invited_by] || null
  })) || [];

  res.json({ success: true, invitations: enrichedInvitations });
}));

/**
 * POST /api/collaboration/network/accept
 * Accept a network invitation via token
 */
router.post('/network/accept',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const tokenHash = hashToken(token);

    const { data: invitation } = await supabase
      .from('general_collaborators')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('status', 'pending')
      .single();

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    if (new Date(invitation.token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invitation has expired' });
    }

    // Verify user can accept this invite
    // If invite has user_id, it must match current user
    // If invite has email, user's email should match (but allow if no email on invite - phone-only)
    const userEmail = req.profile.email?.toLowerCase();
    if (invitation.user_id && invitation.user_id !== req.user.id) {
      return res.status(403).json({ error: 'This invitation was sent to a different user' });
    }
    if (!invitation.user_id && invitation.email && userEmail !== invitation.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }
    // If phone-only invite (no email), allow anyone with the token to accept

    // Accept the invitation
    const { data: updated, error } = await supabase
      .from('general_collaborators')
      .update({
        status: 'accepted',
        user_id: req.user.id,
        accepted_at: new Date().toISOString(),
        token_hash: null,
        token_expires_at: null
      })
      .eq('id', invitation.id)
      .select()
      .single();

    if (error) throw error;

    // Notify the inviter
    await createCollaborationNotification(
      invitation.invited_by,
      'network_accepted',
      'Connection Accepted',
      `${req.profile.full_name || req.profile.email} accepted your invitation to connect`,
      { collaboratorId: invitation.id, role: invitation.role }
    );

    logger.info('Network invitation accepted', {
      invitationId: invitation.id, userId: req.user.id
    });

    res.json({ success: true, collaborator: updated });
  })
);

/**
 * POST /api/collaboration/network/respond/:id
 * Accept or decline a network invitation by ID (for authenticated users)
 */
router.post('/network/respond/:id',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { response } = req.body; // 'accept' or 'decline'

    if (!['accept', 'decline'].includes(response)) {
      return res.status(400).json({ error: 'Invalid response. Use "accept" or "decline".' });
    }

    const userEmail = req.profile.email?.toLowerCase();

    // Get invitation
    const { data: invitation } = await supabase
      .from('general_collaborators')
      .select('*')
      .eq('id', id)
      .eq('status', 'pending')
      .or(`user_id.eq.${req.user.id},email.eq.${userEmail}`)
      .single();

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or already processed' });
    }

    const newStatus = response === 'accept' ? 'accepted' : 'declined';

    const { data: updated, error } = await supabase
      .from('general_collaborators')
      .update({
        status: newStatus,
        user_id: req.user.id,
        accepted_at: response === 'accept' ? new Date().toISOString() : null,
        token_hash: null,
        token_expires_at: null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Notify the inviter
    await createCollaborationNotification(
      invitation.invited_by,
      response === 'accept' ? 'network_accepted' : 'network_declined',
      response === 'accept' ? 'Connection Accepted' : 'Connection Declined',
      `${req.profile.full_name || req.profile.email} ${response === 'accept' ? 'accepted' : 'declined'} your invitation`,
      { collaboratorId: id, role: invitation.role }
    );

    logger.info(`Network invitation ${newStatus}`, { invitationId: id, userId: req.user.id });

    res.json({ success: true, collaborator: updated });
  })
);

/**
 * DELETE /api/collaboration/collaborators/:id
 * Remove a general collaborator from your network
 */
router.delete('/collaborators/:id',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify ownership
    const { data: collab } = await supabase
      .from('general_collaborators')
      .select('id, invited_by')
      .eq('id', id)
      .single();

    if (!collab) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    if (collab.invited_by !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to remove this collaborator' });
    }

    const { error } = await supabase
      .from('general_collaborators')
      .update({ status: 'removed' })
      .eq('id', id);

    if (error) throw error;

    logger.info('General collaborator removed', { collaboratorId: id });

    res.json({ success: true });
  })
);

/**
 * PUT /api/collaboration/collaborators/:id
 * Update a general collaborator (role, notes)
 */
router.put('/collaborators/:id',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, notes } = req.body;

    // Verify ownership
    const { data: collab } = await supabase
      .from('general_collaborators')
      .select('id, invited_by')
      .eq('id', id)
      .single();

    if (!collab) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    if (collab.invited_by !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to update this collaborator' });
    }

    const updateData = {};
    if (role && ['designer', 'fabricator', 'contractor', 'installer', 'vendor', 'partner'].includes(role)) {
      updateData.role = role;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const { data: updated, error } = await supabase
      .from('general_collaborators')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info('General collaborator updated', { collaboratorId: id, updates: Object.keys(updateData) });

    res.json({ success: true, collaborator: updated });
  })
);

/**
 * POST /api/collaboration/collaborators/:id/assign-project
 * Assign a general collaborator to a specific project
 */
router.post('/collaborators/:id/assign-project',
  verifyProOrDesigner,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { project_id, access_level = 'read' } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Get the collaborator
    const { data: collab } = await supabase
      .from('general_collaborators')
      .select('*')
      .eq('id', id)
      .eq('status', 'accepted')
      .single();

    if (!collab) {
      return res.status(404).json({ error: 'Collaborator not found or not accepted' });
    }

    if (collab.invited_by !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!collab.user_id) {
      return res.status(400).json({ error: 'Collaborator has not created an account yet' });
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', project_id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to add collaborators to this project' });
    }

    // Check if already on project
    const { data: existing } = await supabase
      .from('project_collaborators')
      .select('id, invitation_status')
      .eq('project_id', project_id)
      .eq('user_id', collab.user_id)
      .single();

    let projectCollab;
    if (existing) {
      const { data, error } = await supabase
        .from('project_collaborators')
        .update({
          role: collab.role,
          access_level,
          invitation_status: 'accepted',
          accepted_at: new Date().toISOString(),
          notes: collab.notes
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      projectCollab = data;
    } else {
      const { data, error } = await supabase
        .from('project_collaborators')
        .insert({
          project_id,
          user_id: collab.user_id,
          role: collab.role,
          access_level,
          invitation_status: 'accepted',
          invited_by: req.user.id,
          accepted_at: new Date().toISOString(),
          notes: collab.notes
        })
        .select()
        .single();

      if (error) throw error;
      projectCollab = data;
    }

    // Notify the collaborator
    await createCollaborationNotification(
      collab.user_id,
      'project_assigned',
      'Added to Project',
      `You have been added to project "${project.name || 'Untitled'}" as a ${collab.role}`,
      { projectId: project_id, role: collab.role }
    );

    logger.info('Collaborator assigned to project', {
      collaboratorId: id, projectId: project_id, userId: collab.user_id
    });

    res.json({ success: true, projectCollaborator: projectCollab });
  })
);

/**
 * GET /api/collaboration/network/verify/:token
 * Verify a network invitation token (public)
 */
router.get('/network/verify/:token', asyncHandler(async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { token } = req.params;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid token format' });
  }

  const tokenHash = hashToken(token);

  const { data: invitation } = await supabase
    .from('general_collaborators')
    .select('id, email, role, status, token_expires_at, invited_by, metadata')
    .eq('token_hash', tokenHash)
    .single();

  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  if (invitation.status !== 'pending') {
    return res.status(400).json({ error: 'This invitation has already been ' + invitation.status });
  }

  if (new Date(invitation.token_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This invitation has expired' });
  }

  // Get inviter info
  const { data: inviter } = await supabase
    .from('sg_users')
    .select('full_name, email, business_name')
    .eq('id', invitation.invited_by)
    .single();

  // Check if user already has an account (only if email provided)
  let existingUser = null;
  if (invitation.email) {
    const { data } = await supabase
      .from('sg_users')
      .select('id')
      .eq('email', invitation.email.toLowerCase())
      .single();
    existingUser = data;
  }

  res.json({
    success: true,
    invitation: {
      email: invitation.email,
      phone: invitation.metadata?.phone || null,
      role: invitation.role,
      inviterName: inviter?.full_name || inviter?.email || 'A team member',
      inviterBusiness: inviter?.business_name,
      hasAccount: !!existingUser,
      expiresAt: invitation.token_expires_at
    }
  });
}));

// ============================================================
// CUSTOMER COLLABORATION (Project-Specific)
// ============================================================

/**
 * POST /api/collaboration/projects/:projectId/add-customer
 * Add project customer as a collaborator with portal access
 */
router.post('/projects/:projectId/add-customer',
  verifyProOrDesigner,
  validateBody(schemas.addCustomerCollaborator),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const {
      customer_email,
      customer_name,
      customer_phone,
      portal_access = true,
      can_view_files = true,
      can_view_schedule = true,
      can_view_handoff = true,
      can_send_messages = true
    } = req.body;

    // Verify project exists and get customer info
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, customer_name, customer_email, customer_phone')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only project owner can add customer collaborator' });
    }

    // Use provided data or fall back to project data
    const email = (customer_email || project.customer_email || '').toLowerCase().trim();
    const name = customer_name || project.customer_name;
    const phone = customer_phone || project.customer_phone;

    if (!email) {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    // Check if customer already added as collaborator
    const { data: existing } = await supabase
      .from('project_collaborators')
      .select('id, invitation_status, role')
      .eq('project_id', projectId)
      .eq('email', email)
      .single();

    if (existing && existing.invitation_status !== 'removed') {
      // Update existing collaborator with customer permissions
      const { data: updated, error } = await supabase
        .from('project_collaborators')
        .update({
          role: 'customer',
          portal_access,
          can_view_files,
          can_view_schedule,
          can_view_handoff,
          can_send_messages,
          invitation_status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        collaborator: updated,
        message: 'Customer collaborator updated'
      });
    }

    // Check if user has an account
    const { data: existingUser } = await supabase
      .from('sg_users')
      .select('id, full_name')
      .eq('email', email)
      .single();

    // Create new customer collaborator
    const collaboratorData = {
      project_id: projectId,
      email,
      user_id: existingUser?.id || null,
      role: 'customer',
      access_level: 'read',
      invitation_status: 'accepted', // Auto-accept for customers
      accepted_at: new Date().toISOString(),
      invited_by: req.user.id,
      notes: `Customer: ${name}`,
      portal_access,
      can_view_files,
      can_view_schedule,
      can_view_handoff,
      can_send_messages
    };

    const { data: collaborator, error } = await supabase
      .from('project_collaborators')
      .insert(collaboratorData)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase
      .from('project_activity')
      .insert({
        project_id: projectId,
        user_id: req.user.id,
        action: 'customer_added',
        description: `Customer ${name} added as collaborator`
      });

    logger.info('Customer added as collaborator', { projectId, email });

    res.json({
      success: true,
      collaborator,
      message: 'Customer added as collaborator'
    });
  })
);

/**
 * GET /api/collaboration/projects/:projectId/customer-view
 * Get project data visible to customer (no auth required, uses portal token)
 */
router.get('/projects/:projectId/customer-view', asyncHandler(async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { projectId } = req.params;
  const { token, email } = req.query;

  if (!token && !email) {
    return res.status(400).json({ error: 'Portal token or email required' });
  }

  // Find project and verify access
  let project;
  if (token) {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('portal_token', token)
      .eq('portal_enabled', true)
      .single();
    project = data;
  }

  if (!project && email) {
    // Verify email is a customer collaborator
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id, can_view_files, can_view_schedule, can_view_handoff')
      .eq('project_id', projectId)
      .eq('email', email.toLowerCase())
      .eq('role', 'customer')
      .eq('invitation_status', 'accepted')
      .single();

    if (collab) {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      project = data;
      project._permissions = collab;
    }
  }

  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied' });
  }

  const permissions = project._permissions || {
    can_view_files: true,
    can_view_schedule: true,
    can_view_handoff: true
  };

  // Build customer-visible data
  const customerView = {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      progress: project.progress,
      address: project.job_address || project.address,
      city: project.job_city || project.city,
      state: project.job_state || project.state,
      zip: project.job_zip || project.zip,
      scheduled_dates: {
        measure: project.field_measure_date,
        install: project.install_date
      },
      materials: {
        name: project.material_name,
        status: project.material_status
      },
      customer_notes: project.customer_notes
    },
    financials: {
      total: project.value || project.contract_amount,
      paid: project.total_paid,
      due: project.balance_due
    }
  };

  // Get files visible to customer
  if (permissions.can_view_files) {
    const { data: files } = await supabase
      .from('project_files')
      .select('id, name, file_type, file_url, description, created_at')
      .eq('project_id', projectId)
      .eq('visible_to_customer', true)
      .order('created_at', { ascending: false });

    customerView.files = files || [];
  }

  // Get calendar events
  if (permissions.can_view_schedule) {
    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title, event_type, start_time, end_time, location, status')
      .eq('project_id', projectId)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true });

    customerView.calendar_events = events || [];
  }

  // Get design handoff status
  if (permissions.can_view_handoff) {
    const { data: handoffs } = await supabase
      .from('design_handoffs')
      .select('id, title, stage, created_at, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffs && handoffs.length > 0) {
      const handoff = handoffs[0];
      // Map stage to customer-friendly progress
      const stageOrder = [
        'design_created', 'design_review', 'design_approved',
        'fabrication_quote_requested', 'fabrication_quote_received', 'fabrication_approved',
        'materials_ordered', 'fabrication_in_progress', 'fabrication_complete',
        'install_scheduled', 'install_in_progress', 'install_complete', 'final_review'
      ];
      const currentIndex = stageOrder.indexOf(handoff.stage);

      customerView.handoff = {
        id: handoff.id,
        title: handoff.title,
        stage: handoff.stage,
        stage_label: handoff.stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        progress: Math.round((currentIndex + 1) / stageOrder.length * 100),
        updated_at: handoff.updated_at
      };
    }
  }

  res.json({ success: true, ...customerView });
}));

/**
 * GET /api/collaboration/projects/:projectId/handoff-status
 * Get design handoff status for customer (simplified view)
 */
router.get('/projects/:projectId/handoff-status', asyncHandler(async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { projectId } = req.params;
  const { token } = req.query;

  // Verify access via portal token
  const { data: project } = await supabase
    .from('projects')
    .select('id, portal_token, portal_enabled')
    .eq('id', projectId)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Verify token if portal is enabled
  if (project.portal_enabled && token !== project.portal_token) {
    return res.status(403).json({ error: 'Invalid portal token' });
  }

  // Get handoffs
  const { data: handoffs, error } = await supabase
    .from('design_handoffs')
    .select('id, title, stage, description, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Map to customer-friendly format
  const stageDescriptions = {
    'design_created': 'Your design has been created',
    'design_review': 'Design is under review',
    'design_approved': 'Design has been approved',
    'fabrication_quote_requested': 'Requesting fabrication quote',
    'fabrication_quote_received': 'Quote received from fabricator',
    'fabrication_approved': 'Fabrication approved and scheduled',
    'materials_ordered': 'Materials have been ordered',
    'fabrication_in_progress': 'Your countertops are being fabricated',
    'fabrication_complete': 'Fabrication complete - ready for installation',
    'install_scheduled': 'Installation has been scheduled',
    'install_in_progress': 'Installation in progress',
    'install_complete': 'Installation complete',
    'final_review': 'Final review and completion'
  };

  const customerHandoffs = (handoffs || []).map(h => ({
    id: h.id,
    title: h.title,
    stage: h.stage,
    stage_label: h.stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: stageDescriptions[h.stage] || h.description,
    updated_at: h.updated_at
  }));

  res.json({ success: true, handoffs: customerHandoffs });
}));

module.exports = router;
