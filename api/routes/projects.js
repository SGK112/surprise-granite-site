/**
 * SURPRISE GRANITE - PROJECTS CRUD API
 * Full project management: create, list, update, delete, stats
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');

// Initialize Supabase with service role for admin operations
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn('Projects: Supabase credentials not configured - routes will be disabled');
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const STATUS_VALUES = ['lead', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold'];
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

module.exports = router;
