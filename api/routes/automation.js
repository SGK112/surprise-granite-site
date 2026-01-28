/**
 * SURPRISE GRANITE - AUTOMATION API
 * Lead nurturing and client retention automation sequences
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn('Automation: Supabase credentials not configured - routes will be disabled');
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const stepSchema = Joi.object({
  step_number: Joi.number().integer().min(1).required(),
  delay_hours: Joi.number().integer().default(0),
  delay_type: Joi.string().valid('hours', 'days', 'business_days').default('hours'),
  action_type: Joi.string().valid('email', 'sms', 'notification', 'task', 'webhook').required(),
  template_id: Joi.string().uuid().allow(null),
  template_override: Joi.object({
    subject: Joi.string().max(200),
    body: Joi.string().max(5000)
  }).allow(null),
  conditions: Joi.object().default({}),
  stop_on_reply: Joi.boolean().default(false)
});

const schemas = {
  createSequence: Joi.object({
    name: Joi.string().max(200).trim().required(),
    description: Joi.string().max(1000).trim().allow('', null),
    trigger_type: Joi.string().valid(
      'new_lead', 'lead_no_response', 'lead_qualified', 'lead_unqualified',
      'estimate_sent', 'estimate_approved', 'estimate_declined', 'estimate_expired',
      'job_started', 'job_completed', 'job_cancelled',
      'appointment_booked', 'appointment_reminder', 'appointment_completed', 'appointment_no_show',
      'payment_received', 'payment_overdue',
      'anniversary', 'inactive_customer', 'review_request',
      'manual'
    ).required(),
    trigger_conditions: Joi.object().default({}),
    is_active: Joi.boolean().default(true),
    steps: Joi.array().items(stepSchema).min(1).required()
  }),

  updateSequence: Joi.object({
    name: Joi.string().max(200).trim(),
    description: Joi.string().max(1000).trim().allow('', null),
    trigger_type: Joi.string().valid(
      'new_lead', 'lead_no_response', 'lead_qualified', 'lead_unqualified',
      'estimate_sent', 'estimate_approved', 'estimate_declined', 'estimate_expired',
      'job_started', 'job_completed', 'job_cancelled',
      'appointment_booked', 'appointment_reminder', 'appointment_completed', 'appointment_no_show',
      'payment_received', 'payment_overdue',
      'anniversary', 'inactive_customer', 'review_request',
      'manual'
    ),
    trigger_conditions: Joi.object(),
    is_active: Joi.boolean(),
    steps: Joi.array().items(stepSchema).min(1)
  }),

  createTemplate: Joi.object({
    name: Joi.string().max(200).trim().required(),
    description: Joi.string().max(500).trim().allow('', null),
    channel: Joi.string().valid('email', 'sms', 'both', 'notification').required(),
    email_subject: Joi.string().max(200).when('channel', {
      is: Joi.valid('email', 'both'),
      then: Joi.required()
    }),
    email_body: Joi.string().max(10000).when('channel', {
      is: Joi.valid('email', 'both'),
      then: Joi.required()
    }),
    email_preheader: Joi.string().max(200).allow('', null),
    sms_body: Joi.string().max(1600).when('channel', {
      is: Joi.valid('sms', 'both'),
      then: Joi.required()
    }),
    notification_title: Joi.string().max(100),
    notification_body: Joi.string().max(500),
    notification_type: Joi.string().max(50),
    category: Joi.string().valid(
      'welcome', 'follow_up', 'reminder', 'thank_you', 'review_request',
      'promotional', 'educational', 'retention', 'win_back', 'other'
    ).default('other'),
    variables: Joi.array().items(Joi.string()).default([])
  }),

  updateTemplate: Joi.object({
    name: Joi.string().max(200).trim(),
    description: Joi.string().max(500).trim().allow('', null),
    channel: Joi.string().valid('email', 'sms', 'both', 'notification'),
    email_subject: Joi.string().max(200),
    email_body: Joi.string().max(10000),
    email_preheader: Joi.string().max(200).allow('', null),
    sms_body: Joi.string().max(1600),
    notification_title: Joi.string().max(100),
    notification_body: Joi.string().max(500),
    notification_type: Joi.string().max(50),
    category: Joi.string().valid(
      'welcome', 'follow_up', 'reminder', 'thank_you', 'review_request',
      'promotional', 'educational', 'retention', 'win_back', 'other'
    ),
    is_active: Joi.boolean(),
    variables: Joi.array().items(Joi.string())
  }),

  enrollEntity: Joi.object({
    sequence_id: Joi.string().uuid().required(),
    lead_id: Joi.string().uuid().allow(null),
    customer_id: Joi.string().uuid().allow(null),
    email: Joi.string().email().allow(null),
    phone: Joi.string().max(50).allow(null),
    name: Joi.string().max(200).allow(null)
  }).or('lead_id', 'customer_id', 'email')
};

// ============================================================
// MIDDLEWARE: Verify Authenticated Pro User
// ============================================================

const verifyUser = async (req, res, next) => {
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

    const { data: profile } = await supabase
      .from('sg_users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    // Require pro subscription for automation features
    if (!['pro', 'designer', 'admin', 'super_admin'].includes(profile.role) &&
        !['pro', 'designer', 'enterprise'].includes(profile.pro_subscription_tier)) {
      return res.status(403).json({ error: 'Pro subscription required for automation features' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    logger.apiError(err, { context: 'Automation auth error' });
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// SEQUENCES CRUD
// ============================================================

/**
 * GET /api/automation/sequences
 * List user's automation sequences
 */
router.get('/sequences', verifyUser, asyncHandler(async (req, res) => {
  const { trigger_type, is_active } = req.query;

  let query = supabase
    .from('automation_sequences')
    .select('*')
    .or(`user_id.eq.${req.user.id},is_system.eq.true`)
    .order('created_at', { ascending: false });

  if (trigger_type) {
    query = query.eq('trigger_type', trigger_type);
  }

  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true');
  }

  const { data: sequences, error } = await query;

  if (error) throw error;

  res.json({ success: true, sequences: sequences || [] });
}));

/**
 * GET /api/automation/sequences/:id
 * Get sequence details with enrollment stats
 */
router.get('/sequences/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: sequence, error } = await supabase
    .from('automation_sequences')
    .select('*')
    .eq('id', id)
    .or(`user_id.eq.${req.user.id},is_system.eq.true`)
    .single();

  if (error || !sequence) {
    return res.status(404).json({ error: 'Sequence not found' });
  }

  // Get enrollment stats
  const { data: enrollmentStats } = await supabase
    .from('automation_enrollments')
    .select('status')
    .eq('sequence_id', id);

  const stats = {
    total: enrollmentStats?.length || 0,
    active: enrollmentStats?.filter(e => e.status === 'active').length || 0,
    completed: enrollmentStats?.filter(e => e.status === 'completed').length || 0,
    paused: enrollmentStats?.filter(e => e.status === 'paused').length || 0,
    converted: enrollmentStats?.filter(e => e.status === 'converted').length || 0
  };

  res.json({ success: true, sequence, stats });
}));

/**
 * POST /api/automation/sequences
 * Create a new automation sequence
 */
router.post('/sequences',
  verifyUser,
  validateBody(schemas.createSequence),
  asyncHandler(async (req, res) => {
    const sequenceData = req.body;

    // Normalize step numbers
    sequenceData.steps = sequenceData.steps.map((step, index) => ({
      ...step,
      step_number: index + 1
    }));

    const { data: sequence, error } = await supabase
      .from('automation_sequences')
      .insert({
        ...sequenceData,
        user_id: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Automation sequence created', { sequenceId: sequence.id, name: sequence.name });

    res.json({ success: true, sequence });
  })
);

/**
 * PUT /api/automation/sequences/:id
 * Update a sequence
 */
router.put('/sequences/:id',
  verifyUser,
  validateBody(schemas.updateSequence),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Verify ownership
    const { data: existing } = await supabase
      .from('automation_sequences')
      .select('id, user_id, is_system')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    if (existing.user_id !== req.user.id && !existing.is_system) {
      return res.status(403).json({ error: 'Not authorized to update this sequence' });
    }

    if (existing.is_system && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify system sequences' });
    }

    // Normalize step numbers if steps provided
    if (updates.steps) {
      updates.steps = updates.steps.map((step, index) => ({
        ...step,
        step_number: index + 1
      }));
    }

    const { data: sequence, error } = await supabase
      .from('automation_sequences')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info('Automation sequence updated', { sequenceId: id });

    res.json({ success: true, sequence });
  })
);

/**
 * DELETE /api/automation/sequences/:id
 * Delete a sequence (and cancel active enrollments)
 */
router.delete('/sequences/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify ownership
  const { data: existing } = await supabase
    .from('automation_sequences')
    .select('id, user_id, is_system')
    .eq('id', id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: 'Sequence not found' });
  }

  if (existing.user_id !== req.user.id || existing.is_system) {
    return res.status(403).json({ error: 'Cannot delete this sequence' });
  }

  // Cancel active enrollments first
  await supabase
    .from('automation_enrollments')
    .update({ status: 'cancelled' })
    .eq('sequence_id', id)
    .eq('status', 'active');

  // Delete the sequence
  const { error } = await supabase
    .from('automation_sequences')
    .delete()
    .eq('id', id);

  if (error) throw error;

  logger.info('Automation sequence deleted', { sequenceId: id });

  res.json({ success: true });
}));

/**
 * POST /api/automation/sequences/:id/toggle
 * Toggle sequence active state
 */
router.post('/sequences/:id/toggle', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: sequence } = await supabase
    .from('automation_sequences')
    .select('id, user_id, is_active')
    .eq('id', id)
    .single();

  if (!sequence) {
    return res.status(404).json({ error: 'Sequence not found' });
  }

  if (sequence.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { data: updated, error } = await supabase
    .from('automation_sequences')
    .update({ is_active: !sequence.is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  logger.info('Automation sequence toggled', { sequenceId: id, isActive: updated.is_active });

  res.json({ success: true, sequence: updated });
}));

// ============================================================
// ENROLLMENTS
// ============================================================

/**
 * POST /api/automation/enroll
 * Manually enroll a lead/customer in a sequence
 */
router.post('/enroll',
  verifyUser,
  validateBody(schemas.enrollEntity),
  asyncHandler(async (req, res) => {
    const { sequence_id, lead_id, customer_id, email, phone, name } = req.body;

    // Verify sequence exists and is active
    const { data: sequence } = await supabase
      .from('automation_sequences')
      .select('id, name, steps, is_active')
      .eq('id', sequence_id)
      .or(`user_id.eq.${req.user.id},is_system.eq.true`)
      .single();

    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    if (!sequence.is_active) {
      return res.status(400).json({ error: 'Sequence is not active' });
    }

    // Check for existing active enrollment
    let existingQuery = supabase
      .from('automation_enrollments')
      .select('id')
      .eq('sequence_id', sequence_id)
      .eq('status', 'active');

    if (lead_id) existingQuery = existingQuery.eq('lead_id', lead_id);
    if (customer_id) existingQuery = existingQuery.eq('customer_id', customer_id);
    if (email && !lead_id && !customer_id) existingQuery = existingQuery.eq('contact_email', email);

    const { data: existing } = await existingQuery.single();

    if (existing) {
      return res.status(400).json({ error: 'Already enrolled in this sequence' });
    }

    // Get contact info from lead/customer if provided
    let contactEmail = email;
    let contactPhone = phone;
    let contactName = name;

    if (lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('email, phone, name')
        .eq('id', lead_id)
        .single();

      if (lead) {
        contactEmail = contactEmail || lead.email;
        contactPhone = contactPhone || lead.phone;
        contactName = contactName || lead.name;
      }
    }

    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('email, phone, name')
        .eq('id', customer_id)
        .single();

      if (customer) {
        contactEmail = contactEmail || customer.email;
        contactPhone = contactPhone || customer.phone;
        contactName = contactName || customer.name;
      }
    }

    // Calculate first action time
    const firstStep = sequence.steps[0];
    const delayHours = firstStep?.delay_hours || 0;
    const nextActionAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

    const { data: enrollment, error } = await supabase
      .from('automation_enrollments')
      .insert({
        sequence_id,
        lead_id,
        customer_id,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        contact_name: contactName,
        current_step: 0,
        status: 'active',
        next_action_at: nextActionAt.toISOString(),
        enrolled_by: 'manual'
      })
      .select()
      .single();

    if (error) throw error;

    // Update sequence stats
    await supabase
      .from('automation_sequences')
      .update({ total_enrolled: sequence.total_enrolled + 1 })
      .eq('id', sequence_id);

    logger.info('Manual enrollment created', {
      enrollmentId: enrollment.id, sequenceId: sequence_id
    });

    res.json({ success: true, enrollment });
  })
);

/**
 * GET /api/automation/enrollments
 * List enrollments (optionally filtered)
 */
router.get('/enrollments', verifyUser, asyncHandler(async (req, res) => {
  const { sequence_id, status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('automation_enrollments')
    .select(`
      *,
      sequence:automation_sequences!sequence_id(id, name, trigger_type),
      lead:leads!lead_id(id, name, email),
      customer:customers!customer_id(id, name, email)
    `)
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  // Filter to user's sequences
  query = query.in('sequence_id',
    supabase
      .from('automation_sequences')
      .select('id')
      .or(`user_id.eq.${req.user.id},is_system.eq.true`)
  );

  if (sequence_id) {
    query = query.eq('sequence_id', sequence_id);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data: enrollments, error } = await query;

  if (error) throw error;

  res.json({ success: true, enrollments: enrollments || [] });
}));

/**
 * GET /api/automation/enrollments/:id
 * Get enrollment details with step history
 */
router.get('/enrollments/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: enrollment, error } = await supabase
    .from('automation_enrollments')
    .select(`
      *,
      sequence:automation_sequences!sequence_id(id, name, steps, trigger_type),
      lead:leads!lead_id(id, name, email, phone),
      customer:customers!customer_id(id, name, email, phone)
    `)
    .eq('id', id)
    .single();

  if (error || !enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  // Get execution logs
  const { data: logs } = await supabase
    .from('automation_logs')
    .select('*')
    .eq('enrollment_id', id)
    .order('executed_at', { ascending: false })
    .limit(50);

  res.json({ success: true, enrollment, logs: logs || [] });
}));

/**
 * POST /api/automation/enrollments/:id/pause
 * Pause an active enrollment
 */
router.post('/enrollments/:id/pause', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: enrollment } = await supabase
    .from('automation_enrollments')
    .select('id, status, sequence:automation_sequences!sequence_id(user_id)')
    .eq('id', id)
    .single();

  if (!enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (enrollment.sequence?.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (enrollment.status !== 'active') {
    return res.status(400).json({ error: 'Can only pause active enrollments' });
  }

  const { data: updated, error } = await supabase
    .from('automation_enrollments')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  logger.info('Enrollment paused', { enrollmentId: id });

  res.json({ success: true, enrollment: updated });
}));

/**
 * POST /api/automation/enrollments/:id/resume
 * Resume a paused enrollment
 */
router.post('/enrollments/:id/resume', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: enrollment } = await supabase
    .from('automation_enrollments')
    .select('id, status, current_step, sequence:automation_sequences!sequence_id(user_id, steps)')
    .eq('id', id)
    .single();

  if (!enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (enrollment.sequence?.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (enrollment.status !== 'paused') {
    return res.status(400).json({ error: 'Can only resume paused enrollments' });
  }

  // Calculate next action time
  const currentStep = enrollment.sequence.steps[enrollment.current_step];
  const delayHours = currentStep?.delay_hours || 1;
  const nextActionAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  const { data: updated, error } = await supabase
    .from('automation_enrollments')
    .update({
      status: 'active',
      paused_at: null,
      next_action_at: nextActionAt.toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  logger.info('Enrollment resumed', { enrollmentId: id });

  res.json({ success: true, enrollment: updated });
}));

/**
 * POST /api/automation/enrollments/:id/cancel
 * Cancel an enrollment
 */
router.post('/enrollments/:id/cancel', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: enrollment } = await supabase
    .from('automation_enrollments')
    .select('id, status, sequence:automation_sequences!sequence_id(user_id)')
    .eq('id', id)
    .single();

  if (!enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (enrollment.sequence?.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (['completed', 'cancelled'].includes(enrollment.status)) {
    return res.status(400).json({ error: 'Enrollment already finished' });
  }

  const { data: updated, error } = await supabase
    .from('automation_enrollments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  logger.info('Enrollment cancelled', { enrollmentId: id });

  res.json({ success: true, enrollment: updated });
}));

// ============================================================
// TEMPLATES
// ============================================================

/**
 * GET /api/automation/templates
 * List templates
 */
router.get('/templates', verifyUser, asyncHandler(async (req, res) => {
  const { channel, category } = req.query;

  let query = supabase
    .from('automation_templates')
    .select('*')
    .or(`user_id.eq.${req.user.id},is_system.eq.true,user_id.is.null`)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (channel) {
    query = query.eq('channel', channel);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data: templates, error } = await query;

  if (error) throw error;

  res.json({ success: true, templates: templates || [] });
}));

/**
 * GET /api/automation/templates/:id
 * Get template details
 */
router.get('/templates/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: template, error } = await supabase
    .from('automation_templates')
    .select('*')
    .eq('id', id)
    .or(`user_id.eq.${req.user.id},is_system.eq.true,user_id.is.null`)
    .single();

  if (error || !template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json({ success: true, template });
}));

/**
 * POST /api/automation/templates
 * Create a new template
 */
router.post('/templates',
  verifyUser,
  validateBody(schemas.createTemplate),
  asyncHandler(async (req, res) => {
    const templateData = req.body;

    const { data: template, error } = await supabase
      .from('automation_templates')
      .insert({
        ...templateData,
        user_id: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Automation template created', { templateId: template.id, name: template.name });

    res.json({ success: true, template });
  })
);

/**
 * PUT /api/automation/templates/:id
 * Update a template
 */
router.put('/templates/:id',
  verifyUser,
  validateBody(schemas.updateTemplate),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const { data: existing } = await supabase
      .from('automation_templates')
      .select('id, user_id, is_system')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (existing.user_id !== req.user.id && !existing.is_system) {
      return res.status(403).json({ error: 'Not authorized to update this template' });
    }

    if (existing.is_system && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify system templates' });
    }

    const { data: template, error } = await supabase
      .from('automation_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info('Automation template updated', { templateId: id });

    res.json({ success: true, template });
  })
);

/**
 * DELETE /api/automation/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: existing } = await supabase
    .from('automation_templates')
    .select('id, user_id, is_system')
    .eq('id', id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: 'Template not found' });
  }

  if (existing.user_id !== req.user.id || existing.is_system) {
    return res.status(403).json({ error: 'Cannot delete this template' });
  }

  const { error } = await supabase
    .from('automation_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;

  logger.info('Automation template deleted', { templateId: id });

  res.json({ success: true });
}));

/**
 * POST /api/automation/templates/:id/preview
 * Preview a template with sample data
 */
router.post('/templates/:id/preview', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { variables = {} } = req.body;

  const { data: template } = await supabase
    .from('automation_templates')
    .select('*')
    .eq('id', id)
    .or(`user_id.eq.${req.user.id},is_system.eq.true,user_id.is.null`)
    .single();

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Replace variables in template
  const replaceVariables = (text) => {
    if (!text) return text;
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] || match;
    });
  };

  const preview = {
    email_subject: replaceVariables(template.email_subject),
    email_body: replaceVariables(template.email_body),
    sms_body: replaceVariables(template.sms_body),
    notification_title: replaceVariables(template.notification_title),
    notification_body: replaceVariables(template.notification_body)
  };

  res.json({ success: true, preview });
}));

// ============================================================
// ANALYTICS
// ============================================================

/**
 * GET /api/automation/analytics
 * Get automation analytics/dashboard data
 */
router.get('/analytics', verifyUser, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

  // Get sequence stats
  const { data: sequences } = await supabase
    .from('automation_sequences')
    .select('id, name, total_enrolled, total_completed, total_converted, is_active')
    .or(`user_id.eq.${req.user.id},is_system.eq.true`);

  // Get recent enrollments count by status
  const { data: recentEnrollments } = await supabase
    .from('automation_enrollments')
    .select('status, created_at')
    .gte('created_at', startDate.toISOString());

  // Get action logs summary
  const { data: recentLogs } = await supabase
    .from('automation_logs')
    .select('status, action_type, executed_at')
    .gte('executed_at', startDate.toISOString());

  const analytics = {
    sequences: {
      total: sequences?.length || 0,
      active: sequences?.filter(s => s.is_active).length || 0,
      totalEnrolled: sequences?.reduce((sum, s) => sum + (s.total_enrolled || 0), 0) || 0,
      totalCompleted: sequences?.reduce((sum, s) => sum + (s.total_completed || 0), 0) || 0,
      totalConverted: sequences?.reduce((sum, s) => sum + (s.total_converted || 0), 0) || 0
    },
    recentEnrollments: {
      total: recentEnrollments?.length || 0,
      active: recentEnrollments?.filter(e => e.status === 'active').length || 0,
      completed: recentEnrollments?.filter(e => e.status === 'completed').length || 0,
      converted: recentEnrollments?.filter(e => e.status === 'converted').length || 0
    },
    recentActions: {
      total: recentLogs?.length || 0,
      success: recentLogs?.filter(l => l.status === 'success').length || 0,
      failed: recentLogs?.filter(l => l.status === 'failed').length || 0,
      byType: {
        email: recentLogs?.filter(l => l.action_type === 'email').length || 0,
        sms: recentLogs?.filter(l => l.action_type === 'sms').length || 0,
        notification: recentLogs?.filter(l => l.action_type === 'notification').length || 0
      }
    }
  };

  res.json({ success: true, analytics });
}));

/**
 * GET /api/automation/logs
 * Get automation execution logs
 */
router.get('/logs', verifyUser, asyncHandler(async (req, res) => {
  const { sequence_id, enrollment_id, status, limit = 100, offset = 0 } = req.query;

  let query = supabase
    .from('automation_logs')
    .select(`
      *,
      enrollment:automation_enrollments!enrollment_id(
        contact_name, contact_email,
        lead:leads!lead_id(id, name),
        customer:customers!customer_id(id, name)
      ),
      template:automation_templates!template_id(id, name)
    `)
    .order('executed_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (sequence_id) {
    query = query.eq('sequence_id', sequence_id);
  }

  if (enrollment_id) {
    query = query.eq('enrollment_id', enrollment_id);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data: logs, error } = await query;

  if (error) throw error;

  res.json({ success: true, logs: logs || [] });
}));

module.exports = router;
