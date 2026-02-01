/**
 * Pricing Routes
 * Handles vendor price sheet uploads, validation, and management
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const logger = require('../utils/logger');
const { handleApiError } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');
const pricingService = require('../services/pricingService');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

/**
 * Check if user has pricing permission
 */
async function checkPricingPermission(req, permission = 'read') {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!userId || !supabase) return false;

  // Check if admin
  const { data: user } = await supabase
    .from('sg_users')
    .select('account_type, email')
    .eq('id', userId)
    .single();

  if (!user) return false;

  const adminTypes = ['admin', 'super_admin', 'enterprise'];
  const adminEmails = ['joshb@surprisegranite.com', 'josh.b@surprisegranite.com'];

  if (adminTypes.includes(user.account_type) || adminEmails.includes(user.email?.toLowerCase())) {
    return true;
  }

  // For write/approve, require admin
  if (permission === 'approve') {
    return false;
  }

  // For write, allow business accounts
  if (permission === 'write') {
    return ['business', 'enterprise'].includes(user.account_type);
  }

  return true; // Read access for authenticated users
}

/**
 * Upload a price sheet
 * POST /api/pricing/upload
 */
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!await checkPricingPermission(req, 'write')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { vendor_id, vendor_name } = req.body;
  if (!vendor_id) {
    return res.status(400).json({ error: 'vendor_id is required' });
  }

  try {
    // Parse file content
    const content = req.file.buffer.toString('utf-8');
    const fileType = req.file.originalname.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';

    let parseResult;
    if (fileType === 'csv') {
      parseResult = pricingService.parseCSV(content);
    } else {
      // For Excel files, would need xlsx library
      // For now, return error asking for CSV
      return res.status(400).json({
        error: 'Excel files not yet supported. Please upload a CSV file.',
        suggestion: 'Save your Excel file as CSV and try again.'
      });
    }

    if (parseResult.errors.length > 0 && parseResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Failed to parse file',
        details: parseResult.errors
      });
    }

    // Get import template for column auto-detection
    const { data: template } = await supabase
      .from('vendor_import_templates')
      .select('*')
      .eq('vendor_id', vendor_id)
      .eq('is_default', true)
      .single();

    // Auto-detect columns
    const columnMapping = pricingService.autoDetectColumns(parseResult.headers, template);

    // Store file in Supabase storage
    const fileName = `price-sheets/${vendor_id}/${Date.now()}-${req.file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    let fileUrl = null;
    if (!uploadError && uploadData) {
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
      fileUrl = urlData?.publicUrl;
    }

    // Create price sheet record
    const priceSheetData = {
      vendor_id,
      vendor_name: vendor_name || vendor_id,
      original_filename: req.file.originalname,
      file_url: fileUrl || '',
      file_size: req.file.size,
      file_type: fileType,
      status: 'pending',
      total_rows: parseResult.rows.length,
      column_mapping: columnMapping,
      preview_data: parseResult.rows.slice(0, 10),
      validation_errors: parseResult.errors,
      uploaded_by: userId
    };

    const { data: priceSheet, error: insertError } = await supabase
      .from('vendor_price_sheets')
      .insert(priceSheetData)
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to create price sheet record:', insertError);
      return res.status(500).json({ error: 'Failed to save price sheet' });
    }

    res.status(201).json({
      success: true,
      price_sheet: priceSheet,
      detected_columns: columnMapping,
      headers: parseResult.headers,
      preview_count: parseResult.rows.slice(0, 10).length,
      total_rows: parseResult.rows.length,
      parse_errors: parseResult.errors
    });

  } catch (err) {
    logger.error('Price sheet upload error:', err);
    handleApiError(res, err, 'Failed to process price sheet');
  }
}));

/**
 * List price sheets
 * GET /api/pricing/sheets
 */
router.get('/sheets', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!await checkPricingPermission(req, 'read')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const { vendor_id, status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('vendor_price_sheets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (vendor_id) query = query.eq('vendor_id', vendor_id);
  if (status) query = query.eq('status', status);

  query = query.range(offset, parseInt(offset) + parseInt(limit) - 1);

  const { data, count, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ data, count, limit: parseInt(limit), offset: parseInt(offset) });
}));

/**
 * Get price sheet details
 * GET /api/pricing/sheets/:id
 */
router.get('/sheets/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!await checkPricingPermission(req, 'read')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const { data, error } = await supabase
    .from('vendor_price_sheets')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Price sheet not found' });
  }

  res.json(data);
}));

/**
 * Validate price sheet
 * POST /api/pricing/sheets/:id/validate
 */
router.post('/sheets/:id/validate', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!await checkPricingPermission(req, 'write')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  // Get price sheet
  const { data: priceSheet, error: fetchError } = await supabase
    .from('vendor_price_sheets')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !priceSheet) {
    return res.status(404).json({ error: 'Price sheet not found' });
  }

  // Update column mapping if provided
  const columnMapping = req.body.column_mapping || priceSheet.column_mapping;

  // Re-parse and validate
  // Note: In production, would re-fetch file from storage
  // For now, use preview_data as proxy

  try {
    // Update status to validating
    await supabase
      .from('vendor_price_sheets')
      .update({ status: 'validating', column_mapping: columnMapping })
      .eq('id', req.params.id);

    // Get full file content for validation (simplified - using preview)
    const rows = priceSheet.preview_data || [];

    // Validate
    const validation = pricingService.validatePriceSheet(rows, columnMapping);

    // Update with validation results
    const { error: updateError } = await supabase
      .from('vendor_price_sheets')
      .update({
        status: validation.errors.length > 0 ? 'error' : 'preview',
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        valid_rows: validation.validRows.length,
        column_mapping: columnMapping
      })
      .eq('id', req.params.id);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      status: validation.errors.length > 0 ? 'error' : 'preview',
      valid_rows: validation.validRows.length,
      errors: validation.errors,
      warnings: validation.warnings
    });

  } catch (err) {
    logger.error('Validation error:', err);
    await supabase
      .from('vendor_price_sheets')
      .update({ status: 'error', validation_errors: [{ message: err.message }] })
      .eq('id', req.params.id);

    handleApiError(res, err, 'Validation failed');
  }
}));

/**
 * Get price change preview
 * GET /api/pricing/sheets/:id/preview
 */
router.get('/sheets/:id/preview', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!await checkPricingPermission(req, 'read')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  // Get price sheet
  const { data: priceSheet, error: fetchError } = await supabase
    .from('vendor_price_sheets')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !priceSheet) {
    return res.status(404).json({ error: 'Price sheet not found' });
  }

  try {
    // Get existing products for comparison
    const { data: existingProducts } = await supabase
      .from('distributor_products')
      .select('id, sku, name, wholesale_cost, unit_price')
      .or(`brand.ilike.%${priceSheet.vendor_id}%,vendor.ilike.%${priceSheet.vendor_id}%`);

    // Parse and validate the sheet data
    const rows = priceSheet.preview_data || [];
    const validation = pricingService.validatePriceSheet(rows, priceSheet.column_mapping);

    // Generate diff
    const diff = pricingService.generatePriceChangeDiff(
      validation.validRows,
      existingProducts || [],
      priceSheet.vendor_id
    );

    // Update price sheet with summary
    await supabase
      .from('vendor_price_sheets')
      .update({
        products_affected: diff.changes.filter(c => c.change_type !== 'not_found').length,
        price_changes_summary: diff.summary
      })
      .eq('id', req.params.id);

    res.json({
      changes: diff.changes,
      summary: diff.summary,
      column_mapping: priceSheet.column_mapping
    });

  } catch (err) {
    logger.error('Preview generation error:', err);
    handleApiError(res, err, 'Failed to generate preview');
  }
}));

/**
 * Approve price sheet
 * POST /api/pricing/sheets/:id/approve
 */
router.post('/sheets/:id/approve', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!await checkPricingPermission(req, 'approve')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const { error } = await supabase
    .from('vendor_price_sheets')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: userId
    })
    .eq('id', req.params.id)
    .eq('status', 'preview'); // Only approve sheets in preview status

  if (error) {
    return res.status(400).json({ error: 'Failed to approve. Sheet may not be in preview status.' });
  }

  res.json({ success: true, message: 'Price sheet approved' });
}));

/**
 * Apply price sheet changes
 * POST /api/pricing/sheets/:id/apply
 */
router.post('/sheets/:id/apply', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!await checkPricingPermission(req, 'approve')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  // Get approved price sheet
  const { data: priceSheet, error: fetchError } = await supabase
    .from('vendor_price_sheets')
    .select('*')
    .eq('id', req.params.id)
    .eq('status', 'approved')
    .single();

  if (fetchError || !priceSheet) {
    return res.status(404).json({ error: 'Approved price sheet not found' });
  }

  try {
    // Get existing products
    const { data: existingProducts } = await supabase
      .from('distributor_products')
      .select('id, sku, name, wholesale_cost, unit_price')
      .or(`brand.ilike.%${priceSheet.vendor_id}%,vendor.ilike.%${priceSheet.vendor_id}%`);

    // Validate and generate changes
    const rows = priceSheet.preview_data || [];
    const validation = pricingService.validatePriceSheet(rows, priceSheet.column_mapping);
    const diff = pricingService.generatePriceChangeDiff(
      validation.validRows,
      existingProducts || [],
      priceSheet.vendor_id
    );

    // Apply changes
    const results = await pricingService.applyPriceChanges(
      supabase,
      diff.changes,
      priceSheet,
      userId
    );

    // Update price sheet status
    await supabase
      .from('vendor_price_sheets')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
        products_affected: results.applied
      })
      .eq('id', req.params.id);

    res.json({
      success: true,
      applied: results.applied,
      errors: results.errors,
      summary: diff.summary
    });

  } catch (err) {
    logger.error('Apply price changes error:', err);
    handleApiError(res, err, 'Failed to apply price changes');
  }
}));

/**
 * Reject price sheet
 * POST /api/pricing/sheets/:id/reject
 */
router.post('/sheets/:id/reject', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!await checkPricingPermission(req, 'approve')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const { reason } = req.body;

  const { error } = await supabase
    .from('vendor_price_sheets')
    .update({
      status: 'rejected',
      rejection_reason: reason || 'Rejected by admin'
    })
    .eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, message: 'Price sheet rejected' });
}));

/**
 * Get pricing history
 * GET /api/pricing/history
 */
router.get('/history', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!await checkPricingPermission(req, 'read')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    const result = await pricingService.getPricingHistory(supabase, req.query);
    res.json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to fetch pricing history');
  }
}));

/**
 * Rollback a price change
 * POST /api/pricing/rollback/:id
 */
router.post('/rollback/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!await checkPricingPermission(req, 'approve')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  try {
    const result = await pricingService.rollbackPriceChange(supabase, req.params.id, userId);
    res.json(result);
  } catch (err) {
    handleApiError(res, err, err.message || 'Failed to rollback price change');
  }
}));

/**
 * Get import templates
 * GET /api/pricing/templates
 */
router.get('/templates', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const { vendor_id } = req.query;

  let query = supabase
    .from('vendor_import_templates')
    .select('*')
    .order('is_default', { ascending: false });

  if (vendor_id) {
    query = query.or(`vendor_id.eq.${vendor_id},vendor_id.eq.generic`);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
}));

/**
 * Create/update import template
 * POST /api/pricing/templates
 */
router.post('/templates', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!await checkPricingPermission(req, 'approve')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const { vendor_id, template_name, column_mapping, transformations, is_default } = req.body;

  if (!vendor_id || !template_name || !column_mapping) {
    return res.status(400).json({ error: 'vendor_id, template_name, and column_mapping are required' });
  }

  const { data, error } = await supabase
    .from('vendor_import_templates')
    .upsert({
      vendor_id,
      template_name,
      column_mapping,
      transformations: transformations || {},
      is_default: is_default || false,
      created_by: userId
    }, {
      onConflict: 'vendor_id,template_name'
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
}));

module.exports = router;
