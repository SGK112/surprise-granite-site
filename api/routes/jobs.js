/**
 * Jobs & Contractors Routes
 * Handles job management, contractor assignments, material orders
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const { handleApiError } = require('../utils/security');
const { authenticateJWT } = require('../lib/auth/middleware');

// Helper to verify admin access
async function verifyAdminAccess(userId, supabase) {
  if (!userId || !supabase) return false;
  const { data: userInfo } = await supabase
    .from('sg_users')
    .select('account_type, email')
    .eq('id', userId)
    .single();

  const adminEmails = ['joshb@surprisegranite.com', 'josh.b@surprisegranite.com'];
  return ['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type) ||
         adminEmails.includes(userInfo?.email);
}

// ============ JOBS MANAGEMENT ============

/**
 * Get all jobs
 * GET /api/jobs
 */
router.get('/', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    const { status, limit = 50 } = req.query;

    const isAdmin = await verifyAdminAccess(userId, supabase);

    let query = supabase
      .from('jobs')
      .select('*, customer:customers(name, email, phone), job_contractors(contractor:contractors(name, company_name, phone))')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: jobs, error } = await query;

    if (error) throw error;

    res.json({ jobs: jobs || [] });
  } catch (error) {
    logger.error('Get jobs error:', error);
    return handleApiError(res, error, 'Get jobs');
  }
});

/**
 * Get single job
 * GET /api/jobs/:id
 */
router.get('/:id', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;

    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(*),
        job_contractors(*, contractor:contractors(*)),
        job_files(*),
        material_orders(*),
        status_history:job_status_history(*)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const isAdmin = await verifyAdminAccess(userId, supabase);
    if (job.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied - you do not own this job' });
    }

    res.json({ job });
  } catch (error) {
    logger.error('Get job error:', error);
    return handleApiError(res, error, 'Get job');
  }
});

/**
 * Update job
 * PATCH /api/jobs/:id
 */
router.patch('/:id', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;

    const { data: existingJob } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', req.params.id)
      .single();

    if (!existingJob) return res.status(404).json({ error: 'Job not found' });

    const isAdmin = await verifyAdminAccess(userId, supabase);
    if (existingJob.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied - you do not own this job' });
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ job });
  } catch (error) {
    logger.error('Update job error:', error);
    return handleApiError(res, error, 'Update job');
  }
});

/**
 * Upload file to job
 * POST /api/jobs/:id/files
 */
router.post('/:id/files', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    const { file_name, file_url, file_type, category, description, visible_to_customer, visible_to_contractor } = req.body;

    const { data: job } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', req.params.id)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const isAdmin = await verifyAdminAccess(userId, supabase);
    if (job.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied - you do not own this job' });
    }

    const { data: file, error } = await supabase
      .from('job_files')
      .insert({
        job_id: req.params.id,
        user_id: job.user_id,
        file_name,
        file_url,
        file_type: file_type || 'document',
        category: category || 'general',
        description,
        visible_to_customer: visible_to_customer || false,
        visible_to_contractor: visible_to_contractor || false
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ file });
  } catch (error) {
    logger.error('Upload file error:', error);
    return handleApiError(res, error, 'Upload file');
  }
});

/**
 * Assign contractor to job
 * POST /api/jobs/:jobId/assign-contractor
 */
router.post('/:jobId/assign-contractor', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    const { contractor_id, role = 'installer', agreed_rate, rate_type = 'flat', send_invite = true } = req.body;

    if (!contractor_id) {
      return res.status(400).json({ error: 'Contractor ID is required' });
    }

    const [{ data: job }, { data: contractor }] = await Promise.all([
      supabase.from('jobs').select('*, user_id').eq('id', req.params.jobId).single(),
      supabase.from('contractors').select('*').eq('id', contractor_id).single()
    ]);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

    const isAdmin = await verifyAdminAccess(userId, supabase);
    if (job.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied - you do not own this job' });
    }

    const inviteToken = crypto.randomUUID();
    const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { data: assignment, error } = await supabase
      .from('job_contractors')
      .insert({
        job_id: req.params.jobId,
        contractor_id,
        user_id: job.user_id,
        role,
        agreed_rate,
        rate_type,
        invite_token: inviteToken,
        invite_expires_at: inviteExpiry,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('jobs')
      .update({ status: 'assigned', updated_at: new Date().toISOString() })
      .eq('id', req.params.jobId);

    // Note: Email sending would need to be injected or imported separately
    // For now, just return the assignment
    res.json({
      assignment,
      invite_sent: false,
      invite_token: inviteToken
    });
  } catch (error) {
    logger.error('Assign contractor error:', error);
    return handleApiError(res, error, 'Assign contractor');
  }
});

/**
 * Create material order for job
 * POST /api/jobs/:jobId/material-order
 */
router.post('/:jobId/material-order', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    const { vendor_id, items, notes, expected_delivery, total_amount } = req.body;

    const { data: job } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', req.params.jobId)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const isAdmin = await verifyAdminAccess(userId, supabase);
    if (job.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const orderNumber = `MO-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error } = await supabase
      .from('material_orders')
      .insert({
        job_id: req.params.jobId,
        user_id: job.user_id,
        vendor_id,
        order_number: orderNumber,
        items: items || [],
        notes,
        expected_delivery,
        total_amount,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ order });
  } catch (error) {
    logger.error('Create material order error:', error);
    return handleApiError(res, error, 'Create material order');
  }
});

/**
 * Update material order
 * PATCH /api/jobs/material-orders/:id
 */
router.patch('/material-orders/:id', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;

    const { data: order } = await supabase
      .from('material_orders')
      .select('user_id')
      .eq('id', req.params.id)
      .single();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isAdmin = await verifyAdminAccess(userId, supabase);
    if (order.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;
    delete updates.job_id;

    const { data: updated, error } = await supabase
      .from('material_orders')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ order: updated });
  } catch (error) {
    logger.error('Update material order error:', error);
    return handleApiError(res, error, 'Update material order');
  }
});

// ============ CONTRACTORS MANAGEMENT ============

/**
 * Get all contractors (admin only)
 * GET /api/jobs/contractors
 */
router.get('/contractors/list', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId, supabase)) {
      return res.status(403).json({ error: 'Admin access required to view contractors' });
    }

    const { status = 'active' } = req.query;

    let query = supabase
      .from('contractors')
      .select('*')
      .order('name');

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: contractors, error } = await query;

    if (error) throw error;

    res.json({ contractors: contractors || [] });
  } catch (error) {
    logger.error('Get contractors error:', error);
    return handleApiError(res, error, 'Get contractors');
  }
});

/**
 * Create contractor (admin only)
 * POST /api/jobs/contractors
 */
router.post('/contractors', authenticateJWT, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId, supabase)) {
      return res.status(403).json({ error: 'Admin access required to create contractors' });
    }

    const { name, company_name, email, phone, address, city, state, zip, specialty, license_number, hourly_rate, day_rate, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Contractor name is required' });
    }

    const { data: contractor, error } = await supabase
      .from('contractors')
      .insert({
        user_id: userId,
        name,
        company_name,
        email,
        phone,
        address,
        city,
        state,
        zip,
        specialty: specialty || [],
        license_number,
        hourly_rate,
        day_rate,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ contractor });
  } catch (error) {
    logger.error('Create contractor error:', error);
    return handleApiError(res, error, 'Create contractor');
  }
});

/**
 * Contractor responds to invite (public endpoint)
 * POST /api/jobs/contractor/respond
 */
router.post('/contractor/respond', async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { token, action, decline_reason } = req.body;

    if (!token || !action) {
      return res.status(400).json({ error: 'Token and action are required' });
    }

    const { data: assignment, error: findErr } = await supabase
      .from('job_contractors')
      .select('*, job:jobs(*), contractor:contractors(*)')
      .eq('invite_token', token)
      .single();

    if (findErr || !assignment) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    if (new Date(assignment.invite_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite has expired' });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    const { error: updateErr } = await supabase
      .from('job_contractors')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        decline_reason: action === 'decline' ? decline_reason : null
      })
      .eq('id', assignment.id);

    if (updateErr) throw updateErr;

    // Update job status if accepted
    if (action === 'accept') {
      await supabase
        .from('jobs')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', assignment.job_id);
    }

    res.json({
      success: true,
      status: newStatus,
      job: assignment.job
    });
  } catch (error) {
    logger.error('Contractor respond error:', error);
    return handleApiError(res, error, 'Contractor respond');
  }
});

module.exports = router;
