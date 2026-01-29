/**
 * UNIFIED PROJECT SERVICE
 * Centralized business logic for the consolidated Projects system
 * Handles: lifecycle, contractors, materials, calendar, portal, collaboration
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class ProjectService {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ============================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================

  /**
   * Create a project from a lead
   */
  async createFromLead(leadId, userId) {
    // Fetch the lead
    const { data: lead, error: leadError } = await this.supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw new Error('Lead not found');
    }

    // Check if project already exists for this lead
    const { data: existingProject } = await this.supabase
      .from('projects')
      .select('id')
      .eq('lead_id', leadId)
      .single();

    if (existingProject) {
      return { project: existingProject, created: false };
    }

    // Generate portal token
    const portalToken = this.generatePortalToken();

    // Create project
    const projectData = {
      user_id: userId,
      name: `${lead.project_type || 'Project'} - ${lead.homeowner_name}`,
      description: lead.project_details,
      customer_name: lead.homeowner_name,
      customer_email: lead.homeowner_email,
      customer_phone: lead.homeowner_phone,
      address: lead.project_address,
      zip: lead.project_zip,
      status: 'lead',
      priority: 'medium',
      value: this.estimateLeadValue(lead),
      lead_id: leadId,
      lead_source: lead.source,
      lead_price: lead.lead_price,
      portal_token: portalToken,
      portal_enabled: true,
      notes: lead.project_details
    };

    const { data: project, error } = await this.supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (error) throw error;

    // Update lead status
    await this.supabase
      .from('leads')
      .update({ status: 'converted', updated_at: new Date().toISOString() })
      .eq('id', leadId);

    // Log activity
    await this.logActivity(project.id, userId, 'created', 'Project created from lead');

    logger.info('Project created from lead', { projectId: project.id, leadId });

    return { project, created: true };
  }

  /**
   * Create/update project from paid invoice
   */
  async convertFromInvoice(invoiceId, userId, options = {}) {
    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await this.supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
    }

    // Check if project already exists for this invoice
    const { data: existingProject } = await this.supabase
      .from('projects')
      .select('*')
      .eq('estimate_id', invoice.estimate_id)
      .single();

    if (existingProject) {
      // Update existing project
      const { data: project, error } = await this.supabase
        .from('projects')
        .update({
          invoice_id: invoiceId,
          stripe_invoice_id: invoice.stripe_invoice_id,
          contract_amount: invoice.total,
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          deposit_amount: invoice.deposit_amount || invoice.total,
          balance_due: invoice.total - (invoice.amount_paid || 0),
          total_paid: invoice.amount_paid || invoice.total,
          status: 'deposit_paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProject.id)
        .select()
        .single();

      if (error) throw error;

      await this.logActivity(project.id, userId, 'status_changed', 'Invoice paid - deposit received');
      return { project, created: false };
    }

    // Create new project
    const jobNumber = await this.generateJobNumber(userId);
    const portalToken = this.generatePortalToken();

    const projectData = {
      user_id: userId,
      name: `Installation - ${invoice.customer_name}`,
      customer_name: invoice.customer_name,
      customer_email: invoice.customer_email,
      customer_phone: invoice.customer_phone,
      customer_id: invoice.customer_id,
      address: invoice.customer_address,
      status: 'deposit_paid',
      priority: 'medium',
      value: invoice.total,
      contract_amount: invoice.total,
      deposit_paid: true,
      deposit_paid_at: new Date().toISOString(),
      deposit_amount: invoice.deposit_amount || invoice.total,
      total_paid: invoice.amount_paid || invoice.total,
      balance_due: 0,
      estimate_id: invoice.estimate_id,
      invoice_id: invoiceId,
      lead_id: invoice.lead_id,
      stripe_invoice_id: invoice.stripe_invoice_id,
      job_number: jobNumber,
      portal_token: portalToken,
      portal_enabled: true,
      notes: invoice.notes
    };

    const { data: project, error } = await this.supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (error) throw error;

    // Update invoice with project reference
    await this.supabase
      .from('invoices')
      .update({ project_id: project.id })
      .eq('id', invoiceId);

    await this.logActivity(project.id, userId, 'created', 'Project created from paid invoice');

    logger.info('Project created from invoice', { projectId: project.id, invoiceId });

    return { project, created: true };
  }

  /**
   * Update project status with validation and side effects
   */
  async updateStatus(projectId, newStatus, userId, notes = null) {
    const validStatuses = [
      'lead', 'contacted', 'qualified', 'approved', 'deposit_paid',
      'material_ordered', 'material_received', 'scheduled',
      'in_progress', 'completed', 'on_hold', 'cancelled'
    ];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    // Get current project
    const { data: project, error: fetchError } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      throw new Error('Project not found');
    }

    // Update status
    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Auto-set timestamps based on status
    switch (newStatus) {
      case 'approved':
        updateData.approved_at = new Date().toISOString();
        break;
      case 'scheduled':
        updateData.scheduled_at = new Date().toISOString();
        break;
      case 'in_progress':
        updateData.started_at = new Date().toISOString();
        break;
      case 'completed':
        updateData.completed_at = new Date().toISOString();
        updateData.progress = 100;
        break;
    }

    const { data: updated, error } = await this.supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw error;

    await this.logActivity(projectId, userId, 'status_changed', `Status changed to ${newStatus}`, notes);

    logger.info('Project status updated', { projectId, oldStatus: project.status, newStatus });

    return updated;
  }

  // ============================================================
  // CONTRACTOR MANAGEMENT
  // ============================================================

  /**
   * Assign a contractor to a project
   */
  async assignContractor(projectId, contractorId, userId, options = {}) {
    const { role = 'installer', agreed_rate, rate_type = 'flat', send_invite = true } = options;

    // Verify project exists
    const { data: project } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new Error('Project not found');
    }

    // Verify contractor exists
    const { data: contractor } = await this.supabase
      .from('contractors')
      .select('*')
      .eq('id', contractorId)
      .single();

    if (!contractor) {
      throw new Error('Contractor not found');
    }

    // Check if already assigned
    const { data: existing } = await this.supabase
      .from('project_contractors')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('contractor_id', contractorId)
      .single();

    if (existing && existing.status !== 'removed') {
      throw new Error('Contractor already assigned to this project');
    }

    // Generate invite token
    const inviteToken = crypto.randomUUID();
    const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const assignmentData = {
      project_id: projectId,
      contractor_id: contractorId,
      user_id: project.user_id,
      role,
      agreed_rate,
      rate_type,
      invite_token: inviteToken,
      invite_expires_at: inviteExpiry,
      status: 'pending'
    };

    let assignment;
    if (existing) {
      // Re-assign removed contractor
      const { data, error } = await this.supabase
        .from('project_contractors')
        .update({
          ...assignmentData,
          assigned_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      assignment = data;
    } else {
      const { data, error } = await this.supabase
        .from('project_contractors')
        .insert(assignmentData)
        .select()
        .single();

      if (error) throw error;
      assignment = data;
    }

    await this.logActivity(projectId, userId, 'contractor_assigned', `Contractor ${contractor.name} assigned as ${role}`);

    logger.info('Contractor assigned to project', { projectId, contractorId, role });

    return {
      assignment,
      contractor,
      invite_token: inviteToken
    };
  }

  /**
   * Handle contractor response to invitation
   */
  async handleContractorResponse(token, action, declineReason = null) {
    const { data: assignment, error: findErr } = await this.supabase
      .from('project_contractors')
      .select('*, project:projects(*), contractor:contractors(*)')
      .eq('invite_token', token)
      .single();

    if (findErr || !assignment) {
      throw new Error('Invalid or expired invite');
    }

    if (new Date(assignment.invite_expires_at) < new Date()) {
      throw new Error('This invite has expired');
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined';

    const { error: updateErr } = await this.supabase
      .from('project_contractors')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        decline_reason: action === 'decline' ? declineReason : null
      })
      .eq('id', assignment.id);

    if (updateErr) throw updateErr;

    // Update project status if accepted
    if (action === 'accept') {
      await this.supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', assignment.project_id);

      await this.logActivity(
        assignment.project_id,
        null,
        'contractor_accepted',
        `Contractor ${assignment.contractor?.name || 'Unknown'} accepted the assignment`
      );
    }

    logger.info('Contractor responded to invite', { assignmentId: assignment.id, action });

    return {
      success: true,
      status: newStatus,
      project: assignment.project
    };
  }

  /**
   * Get contractors assigned to a project
   */
  async getProjectContractors(projectId) {
    const { data, error } = await this.supabase
      .from('project_contractors')
      .select('*, contractor:contractors(*)')
      .eq('project_id', projectId)
      .neq('status', 'removed')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ============================================================
  // MATERIAL ORDERS
  // ============================================================

  /**
   * Create a material order for a project
   */
  async createMaterialOrder(projectId, userId, orderData) {
    const { vendor_name, vendor_id, items, notes, expected_delivery, total_amount } = orderData;

    // Verify project exists
    const { data: project } = await this.supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new Error('Project not found');
    }

    const orderNumber = `MO-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error } = await this.supabase
      .from('project_material_orders')
      .insert({
        project_id: projectId,
        user_id: project.user_id,
        vendor_id,
        vendor_name,
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

    await this.logActivity(projectId, userId, 'material_order_created', `Material order ${orderNumber} created`);

    logger.info('Material order created', { projectId, orderId: order.id, orderNumber });

    return order;
  }

  /**
   * Update material order status
   */
  async updateMaterialOrderStatus(orderId, status, userId, notes = null) {
    const validStatuses = ['pending', 'ordered', 'confirmed', 'shipped', 'received', 'inspected', 'issue', 'cancelled'];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'ordered') {
      updateData.ordered_at = new Date().toISOString();
    } else if (status === 'received') {
      updateData.received_at = new Date().toISOString();
    }

    if (notes) {
      updateData.supplier_notes = notes;
    }

    const { data: order, error } = await this.supabase
      .from('project_material_orders')
      .update(updateData)
      .eq('id', orderId)
      .select('*, project_id')
      .single();

    if (error) throw error;

    // Update project material status if this is the main order
    if (order.project_id) {
      await this.supabase
        .from('projects')
        .update({
          material_status: status,
          material_ordered_at: status === 'ordered' ? new Date().toISOString() : undefined,
          material_received_at: status === 'received' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.project_id);

      await this.logActivity(order.project_id, userId, 'material_order_updated', `Material order status: ${status}`);
    }

    logger.info('Material order status updated', { orderId, status });

    return order;
  }

  /**
   * Get material orders for a project
   */
  async getProjectMaterialOrders(projectId) {
    const { data, error } = await this.supabase
      .from('project_material_orders')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ============================================================
  // CALENDAR INTEGRATION
  // ============================================================

  /**
   * Schedule a calendar event for a project
   */
  async scheduleEvent(projectId, userId, eventData) {
    const { event_type, title, start_time, end_time, location, participants = [] } = eventData;

    // Get project for customer info
    const { data: project } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new Error('Project not found');
    }

    // Create calendar event
    const { data: event, error } = await this.supabase
      .from('calendar_events')
      .insert({
        created_by: userId,
        project_id: projectId,
        customer_id: project.customer_id,
        title: title || `${event_type} - ${project.customer_name}`,
        event_type,
        start_time,
        end_time,
        location: location || project.job_address || project.address,
        location_address: project.job_address || project.address,
        status: 'scheduled',
        notes: project.notes
      })
      .select()
      .single();

    if (error) throw error;

    // Add customer as participant if they have email
    if (project.customer_email) {
      await this.supabase
        .from('calendar_event_participants')
        .insert({
          event_id: event.id,
          email: project.customer_email,
          name: project.customer_name,
          phone: project.customer_phone,
          participant_type: 'attendee',
          response_status: 'pending'
        });
    }

    // Add additional participants
    for (const p of participants) {
      await this.supabase
        .from('calendar_event_participants')
        .insert({
          event_id: event.id,
          email: p.email,
          name: p.name,
          phone: p.phone,
          participant_type: p.type || 'attendee',
          response_status: 'pending'
        });
    }

    // Update project with scheduled date
    if (event_type === 'measurement' || event_type === 'site_visit') {
      await this.supabase
        .from('projects')
        .update({ field_measure_date: start_time })
        .eq('id', projectId);
    } else if (event_type === 'installation') {
      await this.supabase
        .from('projects')
        .update({ install_date: start_time, status: 'scheduled' })
        .eq('id', projectId);
    }

    await this.logActivity(projectId, userId, 'event_scheduled', `${event_type} scheduled for ${new Date(start_time).toLocaleDateString()}`);

    logger.info('Calendar event created for project', { projectId, eventId: event.id, event_type });

    return event;
  }

  /**
   * Get calendar events for a project
   */
  async getProjectEvents(projectId) {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .select('*, participants:calendar_event_participants(*)')
      .eq('project_id', projectId)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  // ============================================================
  // CUSTOMER PORTAL
  // ============================================================

  /**
   * Generate portal access for a project
   */
  async generatePortalAccess(projectId) {
    const portalToken = this.generatePortalToken();
    const portalPin = this.generatePortalPin();

    const { data: project, error } = await this.supabase
      .from('projects')
      .update({
        portal_token: portalToken,
        portal_pin: portalPin,
        portal_enabled: true
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw error;

    const portalUrl = `https://www.surprisegranite.com/portal/?token=${portalToken}`;

    return {
      token: portalToken,
      pin: portalPin,
      url: portalUrl,
      project
    };
  }

  /**
   * Get project view for customer portal
   */
  async getPortalView(token) {
    // Find project by portal token
    const { data: project, error } = await this.supabase
      .from('projects')
      .select(`
        id, name, status, progress, customer_name, customer_email,
        address, job_address, city, state, zip,
        field_measure_date, install_date,
        material_status, material_name,
        value, total_paid, balance_due,
        customer_notes, created_at, updated_at
      `)
      .eq('portal_token', token)
      .eq('portal_enabled', true)
      .single();

    if (error || !project) {
      throw new Error('Invalid portal token or access disabled');
    }

    // Get calendar events
    const { data: events } = await this.supabase
      .from('calendar_events')
      .select('id, title, event_type, start_time, end_time, location, status')
      .eq('project_id', project.id)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true });

    // Get files visible to customer
    const { data: files } = await this.supabase
      .from('project_files')
      .select('id, name, file_type, file_url, description, created_at')
      .eq('project_id', project.id)
      .eq('visible_to_customer', true)
      .order('created_at', { ascending: false });

    // Get design handoff status if exists
    const { data: handoffs } = await this.supabase
      .from('design_handoffs')
      .select('id, title, stage, created_at, updated_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1);

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        progress: project.progress,
        address: project.job_address || project.address,
        scheduled_dates: {
          measure: project.field_measure_date,
          install: project.install_date
        },
        materials: {
          name: project.material_name,
          status: project.material_status
        }
      },
      financials: {
        total: project.value,
        paid: project.total_paid,
        due: project.balance_due
      },
      calendar_events: events || [],
      files: files || [],
      handoff_status: handoffs?.[0] || null
    };
  }

  // ============================================================
  // COLLABORATION
  // ============================================================

  /**
   * Add customer as collaborator to their project
   */
  async addCustomerAsCollaborator(projectId, userId) {
    const { data: project } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project || !project.customer_email) {
      return null;
    }

    // Check if already a collaborator
    const { data: existing } = await this.supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', projectId)
      .eq('email', project.customer_email.toLowerCase())
      .single();

    if (existing) {
      return existing;
    }

    // Add as collaborator
    const { data: collaborator, error } = await this.supabase
      .from('project_collaborators')
      .insert({
        project_id: projectId,
        email: project.customer_email.toLowerCase(),
        user_id: null, // May not have an account
        role: 'customer',
        access_level: 'read',
        invitation_status: 'accepted',
        invited_by: userId,
        accepted_at: new Date().toISOString(),
        portal_access: true,
        can_view_files: true,
        can_view_schedule: true,
        can_view_handoff: true,
        can_send_messages: true
      })
      .select()
      .single();

    if (error) {
      logger.warn('Failed to add customer as collaborator', { error: error.message });
      return null;
    }

    return collaborator;
  }

  /**
   * Get collaborators for a project
   */
  async getProjectCollaborators(projectId) {
    const { data, error } = await this.supabase
      .from('project_collaborators')
      .select('*, user:sg_users(id, full_name, email, avatar_url)')
      .eq('project_id', projectId)
      .neq('invitation_status', 'removed')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Log project activity
   */
  async logActivity(projectId, userId, action, description, notes = null) {
    try {
      await this.supabase
        .from('project_activity')
        .insert({
          project_id: projectId,
          user_id: userId,
          action,
          description,
          new_value: notes
        });
    } catch (err) {
      logger.warn('Failed to log project activity', { error: err.message });
    }
  }

  /**
   * Generate unique portal token
   */
  generatePortalToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate portal PIN
   */
  generatePortalPin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate job number
   */
  async generateJobNumber(userId) {
    const { data, error } = await this.supabase
      .rpc('generate_project_job_number', { p_user_id: userId });

    if (error) {
      // Fallback
      return `PRJ-${Date.now().toString(36).toUpperCase()}`;
    }

    return data;
  }

  /**
   * Estimate lead value based on project type
   */
  estimateLeadValue(lead) {
    const baseValues = {
      'kitchen_countertops': 5000,
      'bathroom_countertops': 2500,
      'full_remodel': 15000,
      'outdoor': 8000,
      'commercial': 20000
    };

    let value = baseValues[lead.project_type] || 3000;

    // Adjust based on budget if provided
    if (lead.project_budget) {
      const budgetMap = {
        'under_2500': 2000,
        '2500_5000': 3500,
        '5000_10000': 7500,
        '10000_20000': 15000,
        'over_20000': 25000
      };
      value = budgetMap[lead.project_budget] || value;
    }

    return value;
  }

  /**
   * Get full project with all related data
   */
  async getProjectWithRelations(projectId, userId) {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      throw new Error('Project not found');
    }

    // Verify access
    if (project.user_id !== userId) {
      // Check collaborator access
      const { data: collab } = await this.supabase
        .from('project_collaborators')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('invitation_status', 'accepted')
        .single();

      if (!collab) {
        throw new Error('Access denied');
      }
    }

    // Fetch related data in parallel
    const [
      contractorsResult,
      materialOrdersResult,
      eventsResult,
      collaboratorsResult,
      tasksResult,
      filesResult,
      activityResult,
      handoffsResult
    ] = await Promise.all([
      this.getProjectContractors(projectId),
      this.getProjectMaterialOrders(projectId),
      this.getProjectEvents(projectId),
      this.getProjectCollaborators(projectId),
      this.supabase.from('project_tasks').select('*').eq('project_id', projectId).order('sort_order'),
      this.supabase.from('project_files').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      this.supabase.from('project_activity').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(30),
      this.supabase.from('design_handoffs').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    ]);

    return {
      project,
      contractors: contractorsResult,
      material_orders: materialOrdersResult,
      calendar_events: eventsResult,
      collaborators: collaboratorsResult,
      tasks: tasksResult.data || [],
      files: filesResult.data || [],
      activity: activityResult.data || [],
      handoffs: handoffsResult.data || []
    };
  }
}

// Factory function for creating service instance
function createProjectService(supabase) {
  return new ProjectService(supabase);
}

module.exports = { ProjectService, createProjectService };
