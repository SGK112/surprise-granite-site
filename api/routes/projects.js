/**
 * SURPRISE GRANITE - UNIFIED PROJECTS API
 * Full project management with consolidated jobs, contractors, materials, calendar
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const { createProjectService } = require('../services/projectService');

// Initialize Supabase with service role for admin operations
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
let projectService = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  projectService = createProjectService(supabase);
} else {
  console.warn('Projects: Supabase credentials not configured - routes will be disabled');
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

// Extended status values for unified project lifecycle
const STATUS_VALUES = [
  'lead', 'contacted', 'qualified', 'approved', 'deposit_paid',
  'material_ordered', 'material_received', 'scheduled',
  'in_progress', 'completed', 'on_hold', 'cancelled'
];
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];

const schemas = {
  createProject: Joi.object({
    name: Joi.string().max(200).trim().required(),
    description: Joi.string().max(2000).trim().allow('', null),
    customer_name: Joi.string().max(200).trim().required(),
    customer_email: Joi.string().email().max(254).allow('', null),
    customer_phone: Joi.string().max(20).allow('', null),
    address: Joi.string().max(500).allow('', null),
    city: Joi.string().max(100).allow('', null),
    state: Joi.string().max(2).allow('', null),
    zip: Joi.string().max(20).allow('', null),
    status: Joi.string().valid(...STATUS_VALUES).default('lead'),
    priority: Joi.string().valid(...PRIORITY_VALUES).default('medium'),
    value: Joi.number().precision(2).min(0).default(0),
    cost: Joi.number().precision(2).min(0).default(0),
    start_date: Joi.date().iso().allow(null),
    end_date: Joi.date().iso().allow(null),
    estimated_duration: Joi.number().integer().min(0).allow(null),
    notes: Joi.string().max(5000).allow('', null),
    customer_notes: Joi.string().max(5000).allow('', null),
    estimate_id: Joi.string().uuid().allow(null),
    invoice_id: Joi.string().uuid().allow(null)
  }),

  updateProject: Joi.object({
    name: Joi.string().max(200).trim(),
    description: Joi.string().max(2000).trim().allow('', null),
    customer_name: Joi.string().max(200).trim(),
    customer_email: Joi.string().email().max(254).allow('', null),
    customer_phone: Joi.string().max(20).allow('', null),
    address: Joi.string().max(500).allow('', null),
    city: Joi.string().max(100).allow('', null),
    state: Joi.string().max(2).allow('', null),
    zip: Joi.string().max(20).allow('', null),
    status: Joi.string().valid(...STATUS_VALUES),
    priority: Joi.string().valid(...PRIORITY_VALUES),
    value: Joi.number().precision(2).min(0),
    cost: Joi.number().precision(2).min(0),
    start_date: Joi.date().iso().allow(null),
    end_date: Joi.date().iso().allow(null),
    estimated_duration: Joi.number().integer().min(0).allow(null),
    actual_duration: Joi.number().integer().min(0).allow(null),
    progress: Joi.number().integer().min(0).max(100),
    notes: Joi.string().max(5000).allow('', null),
    customer_notes: Joi.string().max(5000).allow('', null),
    estimate_id: Joi.string().uuid().allow(null),
    invoice_id: Joi.string().uuid().allow(null)
  }).min(1),

  updateStatus: Joi.object({
    status: Joi.string().valid(...STATUS_VALUES).required()
  }),

  // Contractor assignment
  assignContractor: Joi.object({
    contractor_id: Joi.string().uuid().required(),
    role: Joi.string().valid('installer', 'fabricator', 'measurer', 'helper', 'subcontractor').default('installer'),
    agreed_rate: Joi.number().precision(2).min(0),
    rate_type: Joi.string().valid('flat', 'hourly', 'sqft', 'daily').default('flat'),
    send_invite: Joi.boolean().default(true),
    notes: Joi.string().max(1000).allow('', null)
  }),

  // Contractor response (public)
  contractorResponse: Joi.object({
    token: Joi.string().uuid().required(),
    action: Joi.string().valid('accept', 'decline').required(),
    decline_reason: Joi.string().max(500).allow('', null)
  }),

  // Material order
  createMaterialOrder: Joi.object({
    vendor_name: Joi.string().max(200).required(),
    vendor_id: Joi.string().uuid().allow(null),
    items: Joi.array().items(Joi.object({
      name: Joi.string().max(200).required(),
      color: Joi.string().max(100).allow('', null),
      thickness: Joi.string().max(50).allow('', null),
      quantity: Joi.number().min(0).required(),
      unit: Joi.string().max(20).default('slab'),
      unit_cost: Joi.number().precision(2).min(0),
      total: Joi.number().precision(2).min(0)
    })).default([]),
    expected_delivery: Joi.date().iso().allow(null),
    total_amount: Joi.number().precision(2).min(0),
    notes: Joi.string().max(2000).allow('', null)
  }),

  updateMaterialOrder: Joi.object({
    status: Joi.string().valid('pending', 'ordered', 'confirmed', 'shipped', 'received', 'inspected', 'issue', 'cancelled'),
    tracking_number: Joi.string().max(100).allow('', null),
    confirmation_number: Joi.string().max(100).allow('', null),
    received_at: Joi.date().iso().allow(null),
    notes: Joi.string().max(2000).allow('', null)
  }),

  // File upload
  uploadFile: Joi.object({
    file_name: Joi.string().max(255).required(),
    file_url: Joi.string().uri().max(1000).required(),
    file_type: Joi.string().max(50).default('document'),
    category: Joi.string().valid('photo', 'drawing', 'contract', 'receipt', 'specification', 'general').default('general'),
    description: Joi.string().max(500).allow('', null),
    visible_to_customer: Joi.boolean().default(false),
    visible_to_contractor: Joi.boolean().default(false)
  }),

  // Schedule event
  scheduleEvent: Joi.object({
    event_type: Joi.string().valid('appointment', 'measurement', 'installation', 'delivery', 'meeting', 'follow_up', 'consultation', 'site_visit').required(),
    title: Joi.string().max(200).allow('', null),
    start_time: Joi.date().iso().required(),
    end_time: Joi.date().iso().required(),
    location: Joi.string().max(200).allow('', null),
    participants: Joi.array().items(Joi.object({
      email: Joi.string().email().required(),
      name: Joi.string().max(200).allow('', null),
      phone: Joi.string().max(50).allow('', null),
      type: Joi.string().valid('organizer', 'attendee', 'optional').default('attendee')
    })).default([])
  })
};

// ============================================================
// MIDDLEWARE: Verify Pro or Designer User
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

    if (!['pro', 'designer', 'admin', 'super_admin'].includes(profile.role) &&
        !['pro', 'designer', 'enterprise'].includes(profile.pro_subscription_tier)) {
      return res.status(403).json({ error: 'Pro or Designer subscription required' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    logger.apiError(err, { context: 'Projects auth error' });
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// POST / - Create project
// ============================================================

router.post('/', verifyUser, validateBody(schemas.createProject), asyncHandler(async (req, res) => {
  const projectData = {
    ...req.body,
    user_id: req.user.id
  };

  const { data: project, error } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single();

  if (error) throw error;

  logger.info('Project created', { projectId: project.id, userId: req.user.id, name: project.name });

  res.status(201).json({ success: true, project });
}));

// ============================================================
// GET /stats - Aggregate stats (MUST be before /:id)
// ============================================================

router.get('/stats', verifyUser, asyncHandler(async (req, res) => {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('status, value, cost')
    .eq('user_id', req.user.id);

  if (error) throw error;

  const all = projects || [];
  const stats = {
    total: all.length,
    active: all.filter(p => ['approved', 'scheduled', 'in_progress'].includes(p.status)).length,
    completed: all.filter(p => p.status === 'completed').length,
    on_hold: all.filter(p => p.status === 'on_hold').length,
    leads: all.filter(p => p.status === 'lead').length,
    cancelled: all.filter(p => p.status === 'cancelled').length,
    pipeline_value: all.filter(p => !['completed', 'cancelled'].includes(p.status))
      .reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0),
    total_value: all.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0),
    total_cost: all.reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0)
  };

  res.json({ success: true, stats });
}));

// ============================================================
// GET / - List projects
// ============================================================

router.get('/', verifyUser, asyncHandler(async (req, res) => {
  const { status, priority, search, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('projects')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  if (priority) {
    query = query.eq('priority', priority);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,customer_name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data: projects, error, count } = await query;

  if (error) throw error;

  res.json({ success: true, projects: projects || [], total: count || 0 });
}));

// ============================================================
// GET /:id - Single project with related data
// ============================================================

router.get('/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Fetch project
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Check ownership or collaborator access
  const isOwner = project.user_id === req.user.id;
  if (!isOwner && req.profile.role !== 'super_admin') {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  // Fetch related data in parallel
  const [tasksResult, activityResult, collaboratorsResult, filesResult, crewResult] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('project_id', id).order('sort_order', { ascending: true }),
    supabase.from('project_activity').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(30),
    supabase.from('project_collaborators').select('*, sg_users:user_id(id, email, full_name, role)').eq('project_id', id),
    supabase.from('project_files').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('project_crew').select('*').eq('project_id', id)
  ]);

  res.json({
    success: true,
    project,
    tasks: tasksResult.data || [],
    activity: activityResult.data || [],
    collaborators: collaboratorsResult.data || [],
    files: filesResult.data || [],
    crew: crewResult.data || []
  });
}));

// ============================================================
// PUT /:id - Update project
// ============================================================

router.put('/:id', verifyUser, validateBody(schemas.updateProject), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: project, error } = await supabase
    .from('projects')
    .update(req.body)
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    throw error;
  }

  logger.info('Project updated', { projectId: id, userId: req.user.id });

  res.json({ success: true, project });
}));

// ============================================================
// PATCH /:id/status - Quick status update
// ============================================================

router.patch('/:id/status', verifyUser, validateBody(schemas.updateStatus), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const { data: project, error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    throw error;
  }

  logger.info('Project status updated', { projectId: id, status, userId: req.user.id });

  res.json({ success: true, project });
}));

// ============================================================
// DELETE /:id - Delete project
// ============================================================

router.delete('/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) throw error;

  logger.info('Project deleted', { projectId: id, userId: req.user.id });

  res.json({ success: true });
}));

// ============================================================
// POST /from-lead/:leadId - Convert lead to project
// ============================================================

router.post('/from-lead/:leadId', verifyUser, asyncHandler(async (req, res) => {
  if (!projectService) {
    return res.status(503).json({ error: 'Service not configured' });
  }

  const { leadId } = req.params;

  const result = await projectService.createFromLead(leadId, req.user.id);

  logger.info('Lead converted to project', { leadId, projectId: result.project.id, created: result.created });

  res.status(result.created ? 201 : 200).json({
    success: true,
    project: result.project,
    created: result.created,
    message: result.created ? 'Project created from lead' : 'Project already exists for this lead'
  });
}));

// ============================================================
// GET /:id/full - Get project with all related data
// ============================================================

router.get('/:id/full', verifyUser, asyncHandler(async (req, res) => {
  if (!projectService) {
    return res.status(503).json({ error: 'Service not configured' });
  }

  const { id } = req.params;

  const data = await projectService.getProjectWithRelations(id, req.user.id);

  res.json({ success: true, ...data });
}));

// ============================================================
// CONTRACTOR MANAGEMENT
// ============================================================

/**
 * POST /:id/contractors - Assign contractor to project
 */
router.post('/:id/contractors',
  verifyUser,
  validateBody(schemas.assignContractor),
  asyncHandler(async (req, res) => {
    if (!projectService) {
      return res.status(503).json({ error: 'Service not configured' });
    }

    const { id } = req.params;
    const { contractor_id, role, agreed_rate, rate_type, send_invite, notes } = req.body;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to assign contractors' });
    }

    const result = await projectService.assignContractor(id, contractor_id, req.user.id, {
      role, agreed_rate, rate_type, send_invite
    });

    logger.info('Contractor assigned to project', { projectId: id, contractorId: contractor_id });

    res.json({
      success: true,
      assignment: result.assignment,
      contractor: result.contractor,
      invite_token: result.invite_token
    });
  })
);

/**
 * POST /contractor/respond - Public endpoint for contractor response
 */
router.post('/contractor/respond',
  validateBody(schemas.contractorResponse),
  asyncHandler(async (req, res) => {
    if (!projectService) {
      return res.status(503).json({ error: 'Service not configured' });
    }

    const { token, action, decline_reason } = req.body;

    const result = await projectService.handleContractorResponse(token, action, decline_reason);

    res.json(result);
  })
);

/**
 * GET /:id/contractors - List contractors assigned to project
 */
router.get('/:id/contractors', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const contractors = await projectService.getProjectContractors(id);

  res.json({ success: true, contractors });
}));

// ============================================================
// MATERIAL ORDERS
// ============================================================

/**
 * POST /:id/material-orders - Create material order
 */
router.post('/:id/material-orders',
  verifyUser,
  validateBody(schemas.createMaterialOrder),
  asyncHandler(async (req, res) => {
    if (!projectService) {
      return res.status(503).json({ error: 'Service not configured' });
    }

    const { id } = req.params;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const order = await projectService.createMaterialOrder(id, req.user.id, req.body);

    res.status(201).json({ success: true, order });
  })
);

/**
 * PATCH /material-orders/:orderId - Update material order
 */
router.patch('/material-orders/:orderId',
  verifyUser,
  validateBody(schemas.updateMaterialOrder),
  asyncHandler(async (req, res) => {
    if (!projectService) {
      return res.status(503).json({ error: 'Service not configured' });
    }

    const { orderId } = req.params;

    // Verify ownership
    const { data: order } = await supabase
      .from('project_material_orders')
      .select('user_id, project_id')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await projectService.updateMaterialOrderStatus(
      orderId,
      req.body.status,
      req.user.id,
      req.body.notes
    );

    res.json({ success: true, order: updated });
  })
);

/**
 * GET /:id/material-orders - List material orders for project
 */
router.get('/:id/material-orders', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const orders = await projectService.getProjectMaterialOrders(id);

  res.json({ success: true, orders });
}));

// ============================================================
// FILE MANAGEMENT
// ============================================================

/**
 * POST /:id/files - Upload file to project
 */
router.post('/:id/files',
  verifyUser,
  validateBody(schemas.uploadFile),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { file_name, file_url, file_type, category, description, visible_to_customer, visible_to_contractor } = req.body;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data: file, error } = await supabase
      .from('project_files')
      .insert({
        project_id: id,
        name: file_name,
        file_url,
        file_type,
        category,
        description,
        visible_to_customer,
        uploaded_by: req.profile.full_name || req.profile.email
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('File uploaded to project', { projectId: id, fileId: file.id });

    res.status(201).json({ success: true, file });
  })
);

// ============================================================
// CALENDAR INTEGRATION
// ============================================================

/**
 * POST /:id/schedule - Schedule calendar event for project
 */
router.post('/:id/schedule',
  verifyUser,
  validateBody(schemas.scheduleEvent),
  asyncHandler(async (req, res) => {
    if (!projectService) {
      return res.status(503).json({ error: 'Service not configured' });
    }

    const { id } = req.params;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const event = await projectService.scheduleEvent(id, req.user.id, req.body);

    res.status(201).json({ success: true, event });
  })
);

/**
 * GET /:id/events - Get calendar events for project
 */
router.get('/:id/events', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    // Check collaborator access
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const events = await projectService.getProjectEvents(id);

  res.json({ success: true, events });
}));

// ============================================================
// CUSTOMER PORTAL
// ============================================================

/**
 * GET /portal/:token - Public endpoint for customer portal view
 */
router.get('/portal/:token', asyncHandler(async (req, res) => {
  if (!projectService) {
    return res.status(503).json({ error: 'Service not configured' });
  }

  const { token } = req.params;

  try {
    const portalData = await projectService.getPortalView(token);
    res.json({ success: true, ...portalData });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}));

/**
 * POST /:id/portal/enable - Enable/disable portal access
 */
router.post('/:id/portal/enable', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { enabled = true, regenerate = false } = req.body;

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('user_id, portal_token')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const updateData = { portal_enabled: enabled };

  if (regenerate || !project.portal_token) {
    const { token, pin, url } = await projectService.generatePortalAccess(id);
    res.json({
      success: true,
      portal_enabled: enabled,
      portal_token: token,
      portal_pin: pin,
      portal_url: url
    });
    return;
  }

  const { data: updated, error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', id)
    .select('portal_enabled, portal_token')
    .single();

  if (error) throw error;

  res.json({
    success: true,
    portal_enabled: updated.portal_enabled,
    portal_url: `https://www.surprisegranite.com/portal/?token=${updated.portal_token}`
  });
}));

// ============================================================
// COLLABORATION INTEGRATION
// ============================================================

/**
 * POST /:id/add-customer-collaborator - Add customer as project collaborator
 */
router.post('/:id/add-customer-collaborator', verifyUser, asyncHandler(async (req, res) => {
  if (!projectService) {
    return res.status(503).json({ error: 'Service not configured' });
  }

  const { id } = req.params;

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const collaborator = await projectService.addCustomerAsCollaborator(id, req.user.id);

  if (!collaborator) {
    return res.status(400).json({ error: 'Could not add customer - no email on project' });
  }

  res.json({ success: true, collaborator });
}));

module.exports = router;
