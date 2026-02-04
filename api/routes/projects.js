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
  }),

  // Project tasks
  createTask: Joi.object({
    title: Joi.string().max(200).trim().required(),
    description: Joi.string().max(2000).trim().allow('', null),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'blocked').default('pending'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    due_date: Joi.date().iso().allow(null),
    assigned_to: Joi.string().uuid().allow(null),
    sort_order: Joi.number().integer().min(0).default(0),
    estimated_hours: Joi.number().precision(2).min(0).allow(null),
    category: Joi.string().max(50).allow('', null)
  }),

  updateTask: Joi.object({
    title: Joi.string().max(200).trim(),
    description: Joi.string().max(2000).trim().allow('', null),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'blocked'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    due_date: Joi.date().iso().allow(null),
    assigned_to: Joi.string().uuid().allow(null),
    sort_order: Joi.number().integer().min(0),
    estimated_hours: Joi.number().precision(2).min(0).allow(null),
    actual_hours: Joi.number().precision(2).min(0).allow(null),
    completed_at: Joi.date().iso().allow(null),
    category: Joi.string().max(50).allow('', null)
  }).min(1),

  // Design handoffs
  createHandoff: Joi.object({
    title: Joi.string().max(200).trim().required(),
    description: Joi.string().max(5000).trim().allow('', null),
    design_file_url: Joi.string().uri().max(1000).allow('', null),
    fabricator_id: Joi.string().uuid().allow(null),
    contractor_id: Joi.string().uuid().allow(null),
    quote_amount: Joi.number().precision(2).min(0).allow(null),
    scheduled_date: Joi.date().iso().allow(null),
    notes: Joi.string().max(5000).allow('', null),
    metadata: Joi.object().default({})
  }),

  updateHandoff: Joi.object({
    title: Joi.string().max(200).trim(),
    description: Joi.string().max(5000).trim().allow('', null),
    stage: Joi.string().valid(
      'design_created', 'design_review', 'design_approved',
      'fabrication_quote_requested', 'fabrication_quote_received',
      'fabrication_approved', 'materials_ordered',
      'fabrication_in_progress', 'fabrication_complete',
      'install_scheduled', 'install_in_progress',
      'install_complete', 'final_review'
    ),
    design_file_url: Joi.string().uri().max(1000).allow('', null),
    fabricator_id: Joi.string().uuid().allow(null),
    contractor_id: Joi.string().uuid().allow(null),
    quote_amount: Joi.number().precision(2).min(0).allow(null),
    scheduled_date: Joi.date().iso().allow(null),
    is_active: Joi.boolean(),
    notes: Joi.string().max(5000).allow('', null),
    metadata: Joi.object()
  }).min(1),

  // Project notes
  createNote: Joi.object({
    content: Joi.string().max(10000).trim().required(),
    note_type: Joi.string().valid(
      'general', 'internal', 'customer_communication', 'issue', 'resolution',
      'measurement', 'material', 'scheduling', 'billing', 'feedback'
    ).default('general'),
    is_internal: Joi.boolean().default(true),
    visible_to_customer: Joi.boolean().default(false),
    visible_to_contractor: Joi.boolean().default(false),
    parent_note_id: Joi.string().uuid().allow(null),
    attachments: Joi.array().items(Joi.object({
      name: Joi.string().max(255).required(),
      url: Joi.string().uri().max(1000).required(),
      type: Joi.string().max(50).allow('', null),
      size: Joi.number().integer().min(0).allow(null)
    })).default([]),
    is_pinned: Joi.boolean().default(false),
    metadata: Joi.object().default({})
  }),

  updateNote: Joi.object({
    content: Joi.string().max(10000).trim(),
    note_type: Joi.string().valid(
      'general', 'internal', 'customer_communication', 'issue', 'resolution',
      'measurement', 'material', 'scheduling', 'billing', 'feedback'
    ),
    is_internal: Joi.boolean(),
    visible_to_customer: Joi.boolean(),
    visible_to_contractor: Joi.boolean(),
    attachments: Joi.array().items(Joi.object({
      name: Joi.string().max(255).required(),
      url: Joi.string().uri().max(1000).required(),
      type: Joi.string().max(50).allow('', null),
      size: Joi.number().integer().min(0).allow(null)
    })),
    is_pinned: Joi.boolean(),
    is_resolved: Joi.boolean(),
    metadata: Joi.object()
  }).min(1),

  // Template schemas
  createTemplate: Joi.object({
    name: Joi.string().max(100).trim().required(),
    description: Joi.string().max(500).trim().allow('', null),
    category: Joi.string().valid('kitchen', 'bathroom', 'flooring', 'outdoor', 'commercial', 'custom').allow(null),
    is_public: Joi.boolean().default(false),
    template_data: Joi.object({
      project_type: Joi.string().allow(null),
      status: Joi.string().allow(null),
      material_preferences: Joi.object().default({}),
      pricing_defaults: Joi.object().default({}),
      notes_template: Joi.string().allow('', null),
      checklist: Joi.array().default([]),
      tags: Joi.array().items(Joi.string()).default([])
    }).default({}),
    default_tasks: Joi.array().items(Joi.object({
      title: Joi.string().max(255).required(),
      description: Joi.string().max(1000).allow('', null),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
      category: Joi.string().max(50).allow('', null)
    })).default([]),
    checklist_items: Joi.array().items(Joi.object({
      item: Joi.string().max(255).required(),
      required: Joi.boolean().default(false),
      category: Joi.string().max(50).allow('', null)
    })).default([]),
    tags: Joi.array().items(Joi.string().max(50)).default([]),
    metadata: Joi.object().default({})
  }),

  updateTemplate: Joi.object({
    name: Joi.string().max(100).trim(),
    description: Joi.string().max(500).trim().allow('', null),
    category: Joi.string().valid('kitchen', 'bathroom', 'flooring', 'outdoor', 'commercial', 'custom').allow(null),
    is_public: Joi.boolean(),
    template_data: Joi.object({
      project_type: Joi.string().allow(null),
      status: Joi.string().allow(null),
      material_preferences: Joi.object(),
      pricing_defaults: Joi.object(),
      notes_template: Joi.string().allow('', null),
      checklist: Joi.array(),
      tags: Joi.array().items(Joi.string())
    }),
    default_tasks: Joi.array().items(Joi.object({
      title: Joi.string().max(255).required(),
      description: Joi.string().max(1000).allow('', null),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
      category: Joi.string().max(50).allow('', null)
    })),
    checklist_items: Joi.array().items(Joi.object({
      item: Joi.string().max(255).required(),
      required: Joi.boolean(),
      category: Joi.string().max(50).allow('', null)
    })),
    tags: Joi.array().items(Joi.string().max(50)),
    metadata: Joi.object()
  }).min(1),

  createFromTemplate: Joi.object({
    template_id: Joi.string().uuid().required(),
    customer_name: Joi.string().max(255).trim().required(),
    customer_email: Joi.string().email().max(255).trim().allow('', null),
    customer_phone: Joi.string().max(50).trim().allow('', null),
    customer_address: Joi.string().max(500).trim().allow('', null),
    project_name: Joi.string().max(255).trim(),
    overrides: Joi.object().default({}) // Override any template_data fields
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

// ============================================================
// TASK MANAGEMENT
// ============================================================

/**
 * POST /:id/tasks - Create a task for the project
 */
router.post('/:id/tasks',
  verifyUser,
  validateBody(schemas.createTask),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify project ownership or collaborator access
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.user_id === req.user.id;
    if (!isOwner && req.profile.role !== 'super_admin') {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id, access_level')
        .eq('project_id', id)
        .eq('user_id', req.user.id)
        .eq('invitation_status', 'accepted')
        .single();

      if (!collab || collab.access_level === 'read') {
        return res.status(403).json({ error: 'Not authorized to create tasks' });
      }
    }

    // Get highest sort_order for this project
    const { data: lastTask } = await supabase
      .from('project_tasks')
      .select('sort_order')
      .eq('project_id', id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const sortOrder = req.body.sort_order ?? ((lastTask?.sort_order ?? -1) + 1);

    const { data: task, error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: id,
        ...req.body,
        sort_order: sortOrder,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('project_activity').insert({
      project_id: id,
      user_id: req.user.id,
      action: 'task_created',
      description: `Task created: ${task.title}`
    });

    logger.info('Task created', { projectId: id, taskId: task.id });

    res.status(201).json({ success: true, task });
  })
);

/**
 * GET /:id/tasks - List all tasks for the project
 */
router.get('/:id/tasks', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, priority } = req.query;

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

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

  let query = supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', id)
    .order('sort_order', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }
  if (priority) {
    query = query.eq('priority', priority);
  }

  const { data: tasks, error } = await query;

  if (error) throw error;

  // Calculate progress
  const total = tasks?.length || 0;
  const completed = tasks?.filter(t => t.status === 'completed').length || 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  res.json({
    success: true,
    tasks: tasks || [],
    stats: {
      total,
      completed,
      pending: tasks?.filter(t => t.status === 'pending').length || 0,
      in_progress: tasks?.filter(t => t.status === 'in_progress').length || 0,
      blocked: tasks?.filter(t => t.status === 'blocked').length || 0,
      progress
    }
  });
}));

/**
 * PATCH /:id/tasks/:taskId - Update a task
 */
router.patch('/:id/tasks/:taskId',
  verifyUser,
  validateBody(schemas.updateTask),
  asyncHandler(async (req, res) => {
    const { id, taskId } = req.params;

    // Verify project access
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.user_id === req.user.id;
    if (!isOwner && req.profile.role !== 'super_admin') {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id, access_level')
        .eq('project_id', id)
        .eq('user_id', req.user.id)
        .eq('invitation_status', 'accepted')
        .single();

      if (!collab || collab.access_level === 'read') {
        return res.status(403).json({ error: 'Not authorized to update tasks' });
      }
    }

    // Auto-set completed_at when status changes to completed
    const updates = { ...req.body };
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    } else if (updates.status && updates.status !== 'completed') {
      updates.completed_at = null;
    }

    const { data: task, error } = await supabase
      .from('project_tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('project_id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Task not found' });
      }
      throw error;
    }

    // Log activity if status changed
    if (req.body.status) {
      await supabase.from('project_activity').insert({
        project_id: id,
        user_id: req.user.id,
        action: 'task_status_changed',
        description: `Task "${task.title}" marked as ${req.body.status}`
      });
    }

    // Update project progress based on task completion
    const { data: allTasks } = await supabase
      .from('project_tasks')
      .select('status')
      .eq('project_id', id);

    if (allTasks && allTasks.length > 0) {
      const completedCount = allTasks.filter(t => t.status === 'completed').length;
      const progress = Math.round((completedCount / allTasks.length) * 100);

      await supabase
        .from('projects')
        .update({ progress })
        .eq('id', id);
    }

    logger.info('Task updated', { projectId: id, taskId, updates: Object.keys(req.body) });

    res.json({ success: true, task });
  })
);

/**
 * DELETE /:id/tasks/:taskId - Delete a task
 */
router.delete('/:id/tasks/:taskId', verifyUser, asyncHandler(async (req, res) => {
  const { id, taskId } = req.params;

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
    return res.status(403).json({ error: 'Not authorized to delete tasks' });
  }

  // Get task title for activity log
  const { data: task } = await supabase
    .from('project_tasks')
    .select('title')
    .eq('id', taskId)
    .eq('project_id', id)
    .single();

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { error } = await supabase
    .from('project_tasks')
    .delete()
    .eq('id', taskId)
    .eq('project_id', id);

  if (error) throw error;

  // Log activity
  await supabase.from('project_activity').insert({
    project_id: id,
    user_id: req.user.id,
    action: 'task_deleted',
    description: `Task deleted: ${task.title}`
  });

  // Update project progress
  const { data: remainingTasks } = await supabase
    .from('project_tasks')
    .select('status')
    .eq('project_id', id);

  if (remainingTasks && remainingTasks.length > 0) {
    const completedCount = remainingTasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completedCount / remainingTasks.length) * 100);

    await supabase.from('projects').update({ progress }).eq('id', id);
  } else {
    // No tasks left, reset progress
    await supabase.from('projects').update({ progress: 0 }).eq('id', id);
  }

  logger.info('Task deleted', { projectId: id, taskId });

  res.json({ success: true });
}));

/**
 * POST /:id/tasks/reorder - Reorder tasks
 */
router.post('/:id/tasks/reorder', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { task_ids } = req.body; // Array of task IDs in new order

  if (!Array.isArray(task_ids) || task_ids.length === 0) {
    return res.status(400).json({ error: 'task_ids array is required' });
  }

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

  // Update sort_order for each task
  const updates = task_ids.map((taskId, index) =>
    supabase
      .from('project_tasks')
      .update({ sort_order: index })
      .eq('id', taskId)
      .eq('project_id', id)
  );

  await Promise.all(updates);

  logger.info('Tasks reordered', { projectId: id, count: task_ids.length });

  res.json({ success: true });
}));

// ============================================================
// ACTIVITY FEED
// ============================================================

/**
 * GET /:id/activity - Get project activity feed with pagination
 */
router.get('/:id/activity', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, action } = req.query;

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

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

  let query = supabase
    .from('project_activity')
    .select('*, sg_users:user_id(id, full_name, email)', { count: 'exact' })
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (action) {
    query = query.eq('action', action);
  }

  const { data: activity, error, count } = await query;

  if (error) throw error;

  res.json({
    success: true,
    activity: activity || [],
    pagination: {
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < (count || 0)
    }
  });
}));

/**
 * POST /:id/activity - Add custom activity entry
 */
router.post('/:id/activity', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, description, metadata } = req.body;

  if (!action || !description) {
    return res.status(400).json({ error: 'action and description are required' });
  }

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isOwner = project.user_id === req.user.id;
  if (!isOwner && req.profile.role !== 'super_admin') {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id, access_level')
      .eq('project_id', id)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab || collab.access_level === 'read') {
      return res.status(403).json({ error: 'Not authorized' });
    }
  }

  const { data: entry, error } = await supabase
    .from('project_activity')
    .insert({
      project_id: id,
      user_id: req.user.id,
      action,
      description,
      metadata: metadata || null
    })
    .select()
    .single();

  if (error) throw error;

  logger.info('Activity logged', { projectId: id, action });

  res.status(201).json({ success: true, activity: entry });
}));

// ============================================================
// DESIGN HANDOFFS
// ============================================================

const HANDOFF_STAGES = [
  'design_created', 'design_review', 'design_approved',
  'fabrication_quote_requested', 'fabrication_quote_received',
  'fabrication_approved', 'materials_ordered',
  'fabrication_in_progress', 'fabrication_complete',
  'install_scheduled', 'install_in_progress',
  'install_complete', 'final_review'
];

/**
 * POST /:id/handoffs - Create a design handoff for the project
 */
router.post('/:id/handoffs',
  verifyUser,
  validateBody(schemas.createHandoff),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify project access
    const { data: project } = await supabase
      .from('projects')
      .select('user_id, customer_name')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.user_id === req.user.id;
    const isDesigner = req.profile.role === 'designer' || req.profile.pro_subscription_tier === 'designer';

    if (!isOwner && !isDesigner && req.profile.role !== 'super_admin') {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id, role, access_level')
        .eq('project_id', id)
        .eq('user_id', req.user.id)
        .eq('invitation_status', 'accepted')
        .single();

      if (!collab || (collab.role !== 'designer' && collab.access_level === 'read')) {
        return res.status(403).json({ error: 'Not authorized to create handoffs' });
      }
    }

    const { data: handoff, error } = await supabase
      .from('design_handoffs')
      .insert({
        project_id: id,
        designer_id: req.user.id,
        stage: 'design_created',
        ...req.body,
        stage_history: [{
          to_stage: 'design_created',
          changed_by: req.user.id,
          changed_at: new Date().toISOString()
        }]
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('project_activity').insert({
      project_id: id,
      user_id: req.user.id,
      action: 'handoff_created',
      description: `Design handoff created: ${handoff.title}`,
      metadata: { handoff_id: handoff.id }
    });

    logger.info('Design handoff created', { projectId: id, handoffId: handoff.id });

    res.status(201).json({ success: true, handoff });
  })
);

/**
 * GET /:id/handoffs - List all design handoffs for the project
 */
router.get('/:id/handoffs', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { active_only } = req.query;

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isOwner = project.user_id === req.user.id;
  if (!isOwner && req.profile.role !== 'super_admin') {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    // Also check if user is designer/fabricator/contractor on any handoff
    const { data: participantHandoff } = await supabase
      .from('design_handoffs')
      .select('id')
      .eq('project_id', id)
      .or(`designer_id.eq.${req.user.id},fabricator_id.eq.${req.user.id},contractor_id.eq.${req.user.id}`)
      .limit(1)
      .single();

    if (!collab && !participantHandoff) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  let query = supabase
    .from('design_handoffs')
    .select(`
      *,
      designer:designer_id(id, full_name, email),
      fabricator:fabricator_id(id, full_name, email),
      contractor:contractor_id(id, full_name, email)
    `)
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  if (active_only === 'true') {
    query = query.eq('is_active', true);
  }

  const { data: handoffs, error } = await query;

  if (error) throw error;

  res.json({ success: true, handoffs: handoffs || [], stages: HANDOFF_STAGES });
}));

/**
 * GET /:id/handoffs/:handoffId - Get a specific design handoff
 */
router.get('/:id/handoffs/:handoffId', verifyUser, asyncHandler(async (req, res) => {
  const { id, handoffId } = req.params;

  const { data: handoff, error } = await supabase
    .from('design_handoffs')
    .select(`
      *,
      designer:designer_id(id, full_name, email, phone),
      fabricator:fabricator_id(id, full_name, email, phone),
      contractor:contractor_id(id, full_name, email, phone),
      project:project_id(id, name, customer_name, customer_email, address, city, state, zip)
    `)
    .eq('id', handoffId)
    .eq('project_id', id)
    .single();

  if (error || !handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  // Verify access
  const isOwner = handoff.project?.user_id === req.user.id;
  const isParticipant = [handoff.designer_id, handoff.fabricator_id, handoff.contractor_id].includes(req.user.id);

  if (!isOwner && !isParticipant && req.profile.role !== 'super_admin') {
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

  res.json({ success: true, handoff, stages: HANDOFF_STAGES });
}));

/**
 * PATCH /:id/handoffs/:handoffId - Update a design handoff
 */
router.patch('/:id/handoffs/:handoffId',
  verifyUser,
  validateBody(schemas.updateHandoff),
  asyncHandler(async (req, res) => {
    const { id, handoffId } = req.params;

    // Get current handoff
    const { data: currentHandoff } = await supabase
      .from('design_handoffs')
      .select('*, project:project_id(user_id)')
      .eq('id', handoffId)
      .eq('project_id', id)
      .single();

    if (!currentHandoff) {
      return res.status(404).json({ error: 'Handoff not found' });
    }

    // Verify access
    const isOwner = currentHandoff.project?.user_id === req.user.id;
    const isParticipant = [currentHandoff.designer_id, currentHandoff.fabricator_id, currentHandoff.contractor_id].includes(req.user.id);

    if (!isOwner && !isParticipant && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to update this handoff' });
    }

    // Prepare updates
    const updates = { ...req.body };

    // Handle stage change - add to history
    if (updates.stage && updates.stage !== currentHandoff.stage) {
      const stageHistory = currentHandoff.stage_history || [];
      stageHistory.push({
        from_stage: currentHandoff.stage,
        to_stage: updates.stage,
        changed_by: req.user.id,
        changed_at: new Date().toISOString()
      });
      updates.stage_history = stageHistory;

      // Auto-complete if reaching final_review
      if (updates.stage === 'final_review') {
        updates.completed_at = new Date().toISOString();
      }
    }

    const { data: handoff, error } = await supabase
      .from('design_handoffs')
      .update(updates)
      .eq('id', handoffId)
      .select()
      .single();

    if (error) throw error;

    // Log activity if stage changed
    if (req.body.stage && req.body.stage !== currentHandoff.stage) {
      await supabase.from('project_activity').insert({
        project_id: id,
        user_id: req.user.id,
        action: 'handoff_stage_changed',
        description: `Design handoff "${handoff.title}" moved to ${req.body.stage.replace(/_/g, ' ')}`,
        metadata: {
          handoff_id: handoffId,
          from_stage: currentHandoff.stage,
          to_stage: req.body.stage
        }
      });
    }

    logger.info('Design handoff updated', { projectId: id, handoffId, stage: handoff.stage });

    res.json({ success: true, handoff });
  })
);

/**
 * DELETE /:id/handoffs/:handoffId - Delete a design handoff
 */
router.delete('/:id/handoffs/:handoffId', verifyUser, asyncHandler(async (req, res) => {
  const { id, handoffId } = req.params;

  // Get handoff to verify ownership
  const { data: handoff } = await supabase
    .from('design_handoffs')
    .select('title, designer_id, project:project_id(user_id)')
    .eq('id', handoffId)
    .eq('project_id', id)
    .single();

  if (!handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  const isOwner = handoff.project?.user_id === req.user.id;
  const isDesigner = handoff.designer_id === req.user.id;

  if (!isOwner && !isDesigner && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized to delete this handoff' });
  }

  const { error } = await supabase
    .from('design_handoffs')
    .delete()
    .eq('id', handoffId)
    .eq('project_id', id);

  if (error) throw error;

  // Log activity
  await supabase.from('project_activity').insert({
    project_id: id,
    user_id: req.user.id,
    action: 'handoff_deleted',
    description: `Design handoff deleted: ${handoff.title}`
  });

  logger.info('Design handoff deleted', { projectId: id, handoffId });

  res.json({ success: true });
}));

/**
 * POST /:id/handoffs/:handoffId/advance - Advance handoff to next stage
 */
router.post('/:id/handoffs/:handoffId/advance', verifyUser, asyncHandler(async (req, res) => {
  const { id, handoffId } = req.params;
  const { notes } = req.body;

  // Get current handoff
  const { data: currentHandoff } = await supabase
    .from('design_handoffs')
    .select('*, project:project_id(user_id)')
    .eq('id', handoffId)
    .eq('project_id', id)
    .single();

  if (!currentHandoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  // Verify access
  const isOwner = currentHandoff.project?.user_id === req.user.id;
  const isParticipant = [currentHandoff.designer_id, currentHandoff.fabricator_id, currentHandoff.contractor_id].includes(req.user.id);

  if (!isOwner && !isParticipant && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Find current stage index and advance
  const currentIndex = HANDOFF_STAGES.indexOf(currentHandoff.stage);
  if (currentIndex === -1 || currentIndex >= HANDOFF_STAGES.length - 1) {
    return res.status(400).json({ error: 'Cannot advance - already at final stage or invalid stage' });
  }

  const nextStage = HANDOFF_STAGES[currentIndex + 1];
  const stageHistory = currentHandoff.stage_history || [];
  stageHistory.push({
    from_stage: currentHandoff.stage,
    to_stage: nextStage,
    changed_by: req.user.id,
    changed_at: new Date().toISOString(),
    notes: notes || null
  });

  const updates = {
    stage: nextStage,
    stage_history: stageHistory
  };

  if (nextStage === 'final_review') {
    updates.completed_at = new Date().toISOString();
  }

  const { data: handoff, error } = await supabase
    .from('design_handoffs')
    .update(updates)
    .eq('id', handoffId)
    .select()
    .single();

  if (error) throw error;

  // Log activity
  await supabase.from('project_activity').insert({
    project_id: id,
    user_id: req.user.id,
    action: 'handoff_advanced',
    description: `Design handoff "${handoff.title}" advanced to ${nextStage.replace(/_/g, ' ')}`,
    metadata: { handoff_id: handoffId, stage: nextStage }
  });

  logger.info('Design handoff advanced', { projectId: id, handoffId, stage: nextStage });

  res.json({ success: true, handoff, previousStage: currentHandoff.stage, currentStage: nextStage });
}));

// ============================================================
// PROJECT NOTES & COMMENTS
// ============================================================

/**
 * POST /:id/notes - Create a note for the project
 */
router.post('/:id/notes',
  verifyUser,
  validateBody(schemas.createNote),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify project access
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.user_id === req.user.id;
    const isAdmin = req.profile.role === 'super_admin';

    if (!isOwner && !isAdmin) {
      // Check collaborator access
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id, access_level')
        .eq('project_id', id)
        .eq('user_id', req.user.id)
        .eq('invitation_status', 'accepted')
        .single();

      if (!collab || collab.access_level === 'read') {
        return res.status(403).json({ error: 'Not authorized to create notes' });
      }
    }

    // Verify parent note exists if specified
    if (req.body.parent_note_id) {
      const { data: parentNote } = await supabase
        .from('project_notes')
        .select('id')
        .eq('id', req.body.parent_note_id)
        .eq('project_id', id)
        .single();

      if (!parentNote) {
        return res.status(400).json({ error: 'Parent note not found' });
      }
    }

    const { data: note, error } = await supabase
      .from('project_notes')
      .insert({
        project_id: id,
        user_id: req.user.id,
        ...req.body
      })
      .select(`
        *,
        user:user_id(id, email, raw_user_meta_data)
      `)
      .single();

    if (error) throw error;

    // Log activity
    const noteTypeDisplay = req.body.note_type?.replace(/_/g, ' ') || 'general';
    await supabase.from('project_activity').insert({
      project_id: id,
      user_id: req.user.id,
      action: req.body.parent_note_id ? 'note_reply_added' : 'note_created',
      description: req.body.parent_note_id
        ? `Reply added to note`
        : `${noteTypeDisplay} note added`,
      metadata: { note_id: note.id, note_type: req.body.note_type }
    });

    logger.info('Project note created', { projectId: id, noteId: note.id });

    res.status(201).json({ success: true, note });
  })
);

/**
 * GET /:id/notes - List all notes for the project
 */
router.get('/:id/notes', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    note_type,
    is_pinned,
    is_resolved,
    parent_only,
    include_replies,
    page = 1,
    limit = 50
  } = req.query;

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isOwner = project.user_id === req.user.id;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isOwner && !isAdmin) {
    // Check collaborator access
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab) {
      return res.status(403).json({ error: 'Not authorized to view notes' });
    }
  }

  let query = supabase
    .from('project_notes')
    .select(`
      *,
      user:user_id(id, email, raw_user_meta_data),
      resolved_by_user:resolved_by(id, email, raw_user_meta_data),
      replies:project_notes!parent_note_id(
        id,
        content,
        created_at,
        user:user_id(id, email, raw_user_meta_data)
      )
    `, { count: 'exact' })
    .eq('project_id', id);

  // Filters
  if (note_type) {
    query = query.eq('note_type', note_type);
  }
  if (is_pinned === 'true') {
    query = query.eq('is_pinned', true);
  }
  if (is_resolved === 'true') {
    query = query.eq('is_resolved', true);
  } else if (is_resolved === 'false') {
    query = query.eq('is_resolved', false);
  }
  if (parent_only === 'true' || include_replies !== 'false') {
    query = query.is('parent_note_id', null);
  }

  // Pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query = query
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  const { data: notes, error, count } = await query;

  if (error) throw error;

  res.json({
    success: true,
    notes,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / parseInt(limit))
    }
  });
}));

/**
 * GET /:id/notes/:noteId - Get a single note with replies
 */
router.get('/:id/notes/:noteId', verifyUser, asyncHandler(async (req, res) => {
  const { id, noteId } = req.params;

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isOwner = project.user_id === req.user.id;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isOwner && !isAdmin) {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab) {
      return res.status(403).json({ error: 'Not authorized to view notes' });
    }
  }

  const { data: note, error } = await supabase
    .from('project_notes')
    .select(`
      *,
      user:user_id(id, email, raw_user_meta_data),
      resolved_by_user:resolved_by(id, email, raw_user_meta_data),
      replies:project_notes!parent_note_id(
        *,
        user:user_id(id, email, raw_user_meta_data)
      )
    `)
    .eq('id', noteId)
    .eq('project_id', id)
    .single();

  if (error || !note) {
    return res.status(404).json({ error: 'Note not found' });
  }

  res.json({ success: true, note });
}));

/**
 * PATCH /:id/notes/:noteId - Update a note
 */
router.patch('/:id/notes/:noteId',
  verifyUser,
  validateBody(schemas.updateNote),
  asyncHandler(async (req, res) => {
    const { id, noteId } = req.params;

    // Get note with project
    const { data: existingNote } = await supabase
      .from('project_notes')
      .select('*, project:project_id(user_id)')
      .eq('id', noteId)
      .eq('project_id', id)
      .single();

    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check authorization
    const isNoteAuthor = existingNote.user_id === req.user.id;
    const isProjectOwner = existingNote.project?.user_id === req.user.id;
    const isAdmin = req.profile.role === 'super_admin';

    if (!isNoteAuthor && !isProjectOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this note' });
    }

    // Handle resolution
    const updates = { ...req.body };
    if (req.body.is_resolved === true && !existingNote.is_resolved) {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = req.user.id;
    } else if (req.body.is_resolved === false) {
      updates.resolved_at = null;
      updates.resolved_by = null;
    }

    const { data: note, error } = await supabase
      .from('project_notes')
      .update(updates)
      .eq('id', noteId)
      .select(`
        *,
        user:user_id(id, email, raw_user_meta_data),
        resolved_by_user:resolved_by(id, email, raw_user_meta_data)
      `)
      .single();

    if (error) throw error;

    // Log activity for important changes
    if (req.body.is_resolved !== undefined) {
      await supabase.from('project_activity').insert({
        project_id: id,
        user_id: req.user.id,
        action: req.body.is_resolved ? 'note_resolved' : 'note_reopened',
        description: req.body.is_resolved ? 'Note marked as resolved' : 'Note reopened',
        metadata: { note_id: noteId }
      });
    }
    if (req.body.is_pinned !== undefined) {
      await supabase.from('project_activity').insert({
        project_id: id,
        user_id: req.user.id,
        action: req.body.is_pinned ? 'note_pinned' : 'note_unpinned',
        description: req.body.is_pinned ? 'Note pinned' : 'Note unpinned',
        metadata: { note_id: noteId }
      });
    }

    logger.info('Project note updated', { projectId: id, noteId });

    res.json({ success: true, note });
  })
);

/**
 * DELETE /:id/notes/:noteId - Delete a note
 */
router.delete('/:id/notes/:noteId', verifyUser, asyncHandler(async (req, res) => {
  const { id, noteId } = req.params;

  // Get note with project
  const { data: existingNote } = await supabase
    .from('project_notes')
    .select('*, project:project_id(user_id)')
    .eq('id', noteId)
    .eq('project_id', id)
    .single();

  if (!existingNote) {
    return res.status(404).json({ error: 'Note not found' });
  }

  // Check authorization
  const isNoteAuthor = existingNote.user_id === req.user.id;
  const isProjectOwner = existingNote.project?.user_id === req.user.id;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isNoteAuthor && !isProjectOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to delete this note' });
  }

  const { error } = await supabase
    .from('project_notes')
    .delete()
    .eq('id', noteId);

  if (error) throw error;

  // Log activity
  await supabase.from('project_activity').insert({
    project_id: id,
    user_id: req.user.id,
    action: 'note_deleted',
    description: 'Note deleted',
    metadata: { note_type: existingNote.note_type }
  });

  logger.info('Project note deleted', { projectId: id, noteId });

  res.json({ success: true, message: 'Note deleted' });
}));

/**
 * POST /:id/notes/:noteId/resolve - Quick resolve/unresolve a note
 */
router.post('/:id/notes/:noteId/resolve', verifyUser, asyncHandler(async (req, res) => {
  const { id, noteId } = req.params;
  const { resolved = true } = req.body;

  // Get note with project
  const { data: existingNote } = await supabase
    .from('project_notes')
    .select('*, project:project_id(user_id)')
    .eq('id', noteId)
    .eq('project_id', id)
    .single();

  if (!existingNote) {
    return res.status(404).json({ error: 'Note not found' });
  }

  // Check authorization (project owner or admin can resolve any note)
  const isProjectOwner = existingNote.project?.user_id === req.user.id;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isProjectOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to resolve notes' });
  }

  const updates = {
    is_resolved: resolved,
    resolved_at: resolved ? new Date().toISOString() : null,
    resolved_by: resolved ? req.user.id : null
  };

  const { data: note, error } = await supabase
    .from('project_notes')
    .update(updates)
    .eq('id', noteId)
    .select(`
      *,
      user:user_id(id, email, raw_user_meta_data),
      resolved_by_user:resolved_by(id, email, raw_user_meta_data)
    `)
    .single();

  if (error) throw error;

  // Log activity
  await supabase.from('project_activity').insert({
    project_id: id,
    user_id: req.user.id,
    action: resolved ? 'note_resolved' : 'note_reopened',
    description: resolved ? 'Note marked as resolved' : 'Note reopened',
    metadata: { note_id: noteId }
  });

  res.json({ success: true, note });
}));

/**
 * POST /:id/notes/:noteId/pin - Quick pin/unpin a note
 */
router.post('/:id/notes/:noteId/pin', verifyUser, asyncHandler(async (req, res) => {
  const { id, noteId } = req.params;
  const { pinned = true } = req.body;

  // Get note with project
  const { data: existingNote } = await supabase
    .from('project_notes')
    .select('*, project:project_id(user_id)')
    .eq('id', noteId)
    .eq('project_id', id)
    .single();

  if (!existingNote) {
    return res.status(404).json({ error: 'Note not found' });
  }

  // Check authorization
  const isProjectOwner = existingNote.project?.user_id === req.user.id;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isProjectOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to pin notes' });
  }

  const { data: note, error } = await supabase
    .from('project_notes')
    .update({ is_pinned: pinned })
    .eq('id', noteId)
    .select(`
      *,
      user:user_id(id, email, raw_user_meta_data)
    `)
    .single();

  if (error) throw error;

  // Log activity
  await supabase.from('project_activity').insert({
    project_id: id,
    user_id: req.user.id,
    action: pinned ? 'note_pinned' : 'note_unpinned',
    description: pinned ? 'Note pinned' : 'Note unpinned',
    metadata: { note_id: noteId }
  });

  res.json({ success: true, note });
}));

// ============================================================
// PROJECT TEMPLATES
// ============================================================

/**
 * GET /templates - List all templates (user's own + public)
 */
router.get('/templates', verifyUser, asyncHandler(async (req, res) => {
  const { category, include_public = 'true', search } = req.query;

  let query = supabase
    .from('project_templates')
    .select('*', { count: 'exact' });

  // Filter by user's templates or public
  if (include_public === 'true') {
    query = query.or(`user_id.eq.${req.user.id},is_public.eq.true`);
  } else {
    query = query.eq('user_id', req.user.id);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  query = query
    .order('is_default', { ascending: false })
    .order('times_used', { ascending: false })
    .order('name');

  const { data: templates, error, count } = await query;

  if (error) throw error;

  // Mark which templates belong to the current user
  const templatesWithOwnership = (templates || []).map(t => ({
    ...t,
    is_owner: t.user_id === req.user.id
  }));

  res.json({
    success: true,
    templates: templatesWithOwnership,
    total: count
  });
}));

/**
 * GET /templates/:templateId - Get a single template
 */
router.get('/templates/:templateId', verifyUser, asyncHandler(async (req, res) => {
  const { templateId } = req.params;

  const { data: template, error } = await supabase
    .from('project_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error || !template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Check access
  const isOwner = template.user_id === req.user.id;
  const isPublic = template.is_public;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isOwner && !isPublic && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to view this template' });
  }

  res.json({
    success: true,
    template: {
      ...template,
      is_owner: isOwner
    }
  });
}));

/**
 * POST /templates - Create a new template
 */
router.post('/templates',
  verifyUser,
  validateBody(schemas.createTemplate),
  asyncHandler(async (req, res) => {
    const { data: template, error } = await supabase
      .from('project_templates')
      .insert({
        ...req.body,
        user_id: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Template created', { templateId: template.id, userId: req.user.id });

    res.status(201).json({ success: true, template });
  })
);

/**
 * POST /templates/from-project/:projectId - Create template from existing project
 */
router.post('/templates/from-project/:projectId', verifyUser, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { name, description, category, is_public = false, include_tasks = true, include_notes = false } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  // Get the project
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Verify ownership
  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Build template data from project
  const templateData = {
    project_type: project.project_type,
    status: 'quote', // Reset to starting status
    material_preferences: project.material_preferences || {},
    pricing_defaults: project.pricing_info || {},
    tags: project.tags || []
  };

  let defaultTasks = [];
  if (include_tasks) {
    // Get project tasks
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('title, description, priority, category')
      .eq('project_id', projectId)
      .order('sort_order');

    defaultTasks = (tasks || []).map(t => ({
      title: t.title,
      description: t.description || '',
      priority: t.priority || 'medium',
      category: t.category || ''
    }));
  }

  let notesTemplate = '';
  if (include_notes) {
    // Get pinned notes as template
    const { data: notes } = await supabase
      .from('project_notes')
      .select('content')
      .eq('project_id', projectId)
      .eq('is_pinned', true)
      .limit(5);

    if (notes && notes.length > 0) {
      notesTemplate = notes.map(n => n.content).join('\n\n---\n\n');
    }
  }

  if (notesTemplate) {
    templateData.notes_template = notesTemplate;
  }

  // Create the template
  const { data: template, error } = await supabase
    .from('project_templates')
    .insert({
      user_id: req.user.id,
      name,
      description: description || `Template based on project: ${project.project_name || project.customer_name}`,
      category: category || null,
      is_public,
      template_data: templateData,
      default_tasks: defaultTasks,
      tags: project.tags || [],
      metadata: { source_project_id: projectId }
    })
    .select()
    .single();

  if (error) throw error;

  logger.info('Template created from project', { templateId: template.id, projectId });

  res.status(201).json({ success: true, template });
}));

/**
 * PATCH /templates/:templateId - Update a template
 */
router.patch('/templates/:templateId',
  verifyUser,
  validateBody(schemas.updateTemplate),
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;

    // Get existing template
    const { data: existing } = await supabase
      .from('project_templates')
      .select('user_id')
      .eq('id', templateId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Check authorization
    const isOwner = existing.user_id === req.user.id;
    const isAdmin = req.profile.role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this template' });
    }

    const { data: template, error } = await supabase
      .from('project_templates')
      .update(req.body)
      .eq('id', templateId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Template updated', { templateId });

    res.json({ success: true, template });
  })
);

/**
 * DELETE /templates/:templateId - Delete a template
 */
router.delete('/templates/:templateId', verifyUser, asyncHandler(async (req, res) => {
  const { templateId } = req.params;

  // Get existing template
  const { data: existing } = await supabase
    .from('project_templates')
    .select('user_id, is_default')
    .eq('id', templateId)
    .single();

  if (!existing) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Check authorization
  const isOwner = existing.user_id === req.user.id;
  const isAdmin = req.profile.role === 'super_admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to delete this template' });
  }

  // Prevent deleting system default templates (unless admin)
  if (existing.is_default && !isAdmin) {
    return res.status(403).json({ error: 'Cannot delete system default templates' });
  }

  const { error } = await supabase
    .from('project_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;

  logger.info('Template deleted', { templateId });

  res.json({ success: true, message: 'Template deleted' });
}));

/**
 * POST /from-template - Create a new project from a template
 */
router.post('/from-template',
  verifyUser,
  validateBody(schemas.createFromTemplate),
  asyncHandler(async (req, res) => {
    const { template_id, customer_name, customer_email, customer_phone, customer_address, project_name, overrides } = req.body;

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Verify access to template
    const isOwner = template.user_id === req.user.id;
    const isPublic = template.is_public;
    const isAdmin = req.profile.role === 'super_admin';

    if (!isOwner && !isPublic && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to use this template' });
    }

    // Merge template data with overrides
    const mergedData = { ...(template.template_data || {}), ...overrides };

    // Create the project
    const projectData = {
      user_id: req.user.id,
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      customer_address: customer_address || null,
      project_name: project_name || `${customer_name} - ${template.name}`,
      project_type: mergedData.project_type || 'countertop',
      status: mergedData.status || 'quote',
      material_preferences: mergedData.material_preferences || {},
      pricing_info: mergedData.pricing_defaults || {},
      tags: mergedData.tags || template.tags || [],
      metadata: {
        created_from_template: template_id,
        template_name: template.name
      }
    };

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (projectError) throw projectError;

    // Create default tasks from template
    const defaultTasks = template.default_tasks || [];
    if (defaultTasks.length > 0) {
      const tasksToInsert = defaultTasks.map((task, index) => ({
        project_id: project.id,
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'medium',
        category: task.category || '',
        status: 'pending',
        sort_order: index,
        created_by: req.user.id
      }));

      await supabase.from('project_tasks').insert(tasksToInsert);
    }

    // Add notes template as initial note if present
    if (mergedData.notes_template) {
      await supabase.from('project_notes').insert({
        project_id: project.id,
        user_id: req.user.id,
        content: mergedData.notes_template,
        note_type: 'general',
        is_pinned: true
      });
    }

    // Update template usage stats
    await supabase
      .from('project_templates')
      .update({
        times_used: (template.times_used || 0) + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', template_id);

    // Log activity
    await supabase.from('project_activity').insert({
      project_id: project.id,
      user_id: req.user.id,
      action: 'project_created',
      description: `Project created from template: ${template.name}`,
      metadata: { template_id, tasks_created: defaultTasks.length }
    });

    logger.info('Project created from template', {
      projectId: project.id,
      templateId: template_id,
      tasksCreated: defaultTasks.length
    });

    res.status(201).json({
      success: true,
      project,
      tasks_created: defaultTasks.length
    });
  })
);

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
