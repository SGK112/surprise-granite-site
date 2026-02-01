/**
 * Pricing Service
 * Handles CSV/Excel parsing, validation, and price update operations
 */

const logger = require('../utils/logger');

/**
 * Parse CSV content into array of objects
 * @param {string} content - CSV file content
 * @param {object} options - Parsing options
 * @returns {object} { headers: string[], rows: object[], errors: string[] }
 */
function parseCSV(content, options = {}) {
  const { delimiter = ',', hasHeaders = true } = options;
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  const errors = [];

  if (lines.length === 0) {
    return { headers: [], rows: [], errors: ['File is empty'] };
  }

  // Parse headers
  const headers = hasHeaders ? parseCSVLine(lines[0], delimiter) : [];
  const dataStartIndex = hasHeaders ? 1 : 0;

  // Parse data rows
  const rows = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i], delimiter);
      if (values.length > 0) {
        const row = {};
        if (hasHeaders) {
          headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim() || '';
          });
        } else {
          values.forEach((value, index) => {
            row[`col_${index}`] = value?.trim() || '';
          });
        }
        row._rowNumber = i + 1;
        rows.push(row);
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  return { headers, rows, errors };
}

/**
 * Parse a single CSV line handling quoted values
 * @param {string} line - CSV line
 * @param {string} delimiter - Column delimiter
 * @returns {string[]}
 */
function parseCSVLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

/**
 * Auto-detect column mapping based on header names
 * @param {string[]} headers - CSV headers
 * @param {object} template - Import template with column mapping
 * @returns {object} Detected column mapping
 */
function autoDetectColumns(headers, template = null) {
  const mapping = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  // Default field aliases
  const fieldAliases = {
    sku: ['sku', 'item id', 'item number', 'product id', 'code', 'item_id', 'product_code'],
    name: ['name', 'product name', 'title', 'description', 'color', 'product_name'],
    wholesale_price: ['price', 'wholesale', 'cost', 'net price', 'unit price', 'price per sf', 'wholesale_price', 'net_price'],
    msrp: ['msrp', 'retail', 'list price', 'suggested retail', 'retail_price'],
    category: ['category', 'type', 'material', 'product type', 'product_type'],
    color: ['color', 'color family', 'shade', 'color_family'],
    material: ['material', 'material type', 'stone type', 'material_type'],
    thickness: ['thickness', 'thick', 'size'],
    box_price: ['box price', 'price per box', 'box_price']
  };

  // Use template aliases if provided
  if (template?.column_mapping) {
    for (const [field, config] of Object.entries(template.column_mapping)) {
      const aliases = [
        config.source_column?.toLowerCase(),
        ...(config.aliases || []).map(a => a.toLowerCase())
      ].filter(Boolean);

      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (aliases.includes(normalizedHeaders[i])) {
          mapping[field] = headers[i];
          break;
        }
      }
    }
  }

  // Fill in any missing fields using default aliases
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    if (!mapping[field]) {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (aliases.includes(normalizedHeaders[i])) {
          mapping[field] = headers[i];
          break;
        }
      }
    }
  }

  return mapping;
}

/**
 * Validate price sheet data
 * @param {object[]} rows - Parsed data rows
 * @param {object} columnMapping - Column mapping configuration
 * @returns {object} { validRows: object[], errors: object[], warnings: object[] }
 */
function validatePriceSheet(rows, columnMapping) {
  const validRows = [];
  const errors = [];
  const warnings = [];

  const skuColumn = columnMapping.sku;
  const nameColumn = columnMapping.name;
  const priceColumn = columnMapping.wholesale_price;

  if (!skuColumn) {
    errors.push({ row: 0, field: 'sku', message: 'SKU column not mapped' });
    return { validRows: [], errors, warnings };
  }

  if (!priceColumn) {
    errors.push({ row: 0, field: 'price', message: 'Price column not mapped' });
    return { validRows: [], errors, warnings };
  }

  const seenSkus = new Set();

  for (const row of rows) {
    const rowNum = row._rowNumber;
    const sku = row[skuColumn]?.trim();
    const name = row[nameColumn]?.trim() || '';
    const priceStr = row[priceColumn]?.toString().trim();

    // Required: SKU
    if (!sku) {
      errors.push({ row: rowNum, field: 'sku', message: 'SKU is required' });
      continue;
    }

    // Check for duplicate SKUs
    if (seenSkus.has(sku)) {
      warnings.push({ row: rowNum, field: 'sku', message: `Duplicate SKU: ${sku}` });
    }
    seenSkus.add(sku);

    // Parse and validate price
    const price = parsePrice(priceStr);
    if (price === null) {
      errors.push({ row: rowNum, field: 'price', message: `Invalid price: ${priceStr}` });
      continue;
    }

    if (price <= 0) {
      warnings.push({ row: rowNum, field: 'price', message: `Price is zero or negative: ${price}` });
    }

    if (price > 10000) {
      warnings.push({ row: rowNum, field: 'price', message: `Price seems high: ${price}` });
    }

    // Build valid row
    const validRow = {
      _rowNumber: rowNum,
      sku,
      name,
      wholesale_price: price
    };

    // Add optional fields
    if (columnMapping.msrp && row[columnMapping.msrp]) {
      validRow.msrp = parsePrice(row[columnMapping.msrp]);
    }
    if (columnMapping.category && row[columnMapping.category]) {
      validRow.category = row[columnMapping.category].trim();
    }
    if (columnMapping.color && row[columnMapping.color]) {
      validRow.color = row[columnMapping.color].trim();
    }
    if (columnMapping.material && row[columnMapping.material]) {
      validRow.material = row[columnMapping.material].trim();
    }
    if (columnMapping.thickness && row[columnMapping.thickness]) {
      validRow.thickness = row[columnMapping.thickness].trim();
    }

    validRows.push(validRow);
  }

  return { validRows, errors, warnings };
}

/**
 * Parse price string to number
 * @param {string} priceStr - Price string (may include currency symbols)
 * @returns {number|null}
 */
function parsePrice(priceStr) {
  if (!priceStr) return null;

  // Remove currency symbols and whitespace
  const cleaned = priceStr.toString()
    .replace(/[$€£¥,\s]/g, '')
    .trim();

  const price = parseFloat(cleaned);
  return isNaN(price) ? null : Math.round(price * 100) / 100;
}

/**
 * Generate price change preview/diff
 * @param {object[]} newPrices - Validated new prices from sheet
 * @param {object[]} existingProducts - Current products from database
 * @param {string} vendorId - Vendor identifier
 * @returns {object} { changes: object[], summary: object }
 */
function generatePriceChangeDiff(newPrices, existingProducts, vendorId) {
  const existingMap = new Map();
  for (const product of existingProducts) {
    const key = (product.sku || product.product_sku)?.toLowerCase();
    if (key) {
      existingMap.set(key, product);
    }
  }

  const changes = [];
  const summary = {
    total: newPrices.length,
    increased: 0,
    decreased: 0,
    unchanged: 0,
    new: 0,
    not_found: 0
  };

  for (const newPrice of newPrices) {
    const key = newPrice.sku.toLowerCase();
    const existing = existingMap.get(key);

    const change = {
      sku: newPrice.sku,
      name: newPrice.name,
      new_price: newPrice.wholesale_price,
      old_price: null,
      change_type: 'new',
      change_amount: null,
      change_percentage: null,
      product_id: null
    };

    if (existing) {
      const oldPrice = existing.wholesale_cost || existing.unit_price || existing.price;
      change.old_price = oldPrice ? parseFloat(oldPrice) : null;
      change.product_id = existing.id;
      change.name = change.name || existing.name || existing.product_name;

      if (change.old_price !== null) {
        const diff = change.new_price - change.old_price;
        change.change_amount = Math.round(diff * 100) / 100;
        change.change_percentage = change.old_price > 0
          ? Math.round((diff / change.old_price) * 10000) / 100
          : null;

        if (Math.abs(diff) < 0.01) {
          change.change_type = 'unchanged';
          summary.unchanged++;
        } else if (diff > 0) {
          change.change_type = 'increased';
          summary.increased++;
        } else {
          change.change_type = 'decreased';
          summary.decreased++;
        }
      } else {
        change.change_type = 'new_price';
        summary.new++;
      }
    } else {
      summary.not_found++;
    }

    changes.push(change);
  }

  return { changes, summary };
}

/**
 * Apply price changes to database
 * @param {object} supabase - Supabase client
 * @param {object[]} changes - Price changes to apply
 * @param {object} priceSheet - Price sheet record
 * @param {string} userId - User applying changes
 * @returns {object} { applied: number, errors: object[] }
 */
async function applyPriceChanges(supabase, changes, priceSheet, userId) {
  const results = { applied: 0, errors: [], history: [] };

  // Filter to only products that exist and have changes
  const toApply = changes.filter(c =>
    c.product_id &&
    c.change_type !== 'unchanged' &&
    c.change_type !== 'not_found'
  );

  for (const change of toApply) {
    try {
      // Update product price
      const { error: updateError } = await supabase
        .from('distributor_products')
        .update({
          wholesale_cost: change.new_price,
          last_price_update: new Date().toISOString(),
          price_source: 'csv_upload'
        })
        .eq('id', change.product_id);

      if (updateError) {
        results.errors.push({
          sku: change.sku,
          error: updateError.message
        });
        continue;
      }

      // Record in pricing history
      const historyRecord = {
        product_id: change.product_id,
        product_sku: change.sku,
        product_name: change.name,
        vendor_id: priceSheet.vendor_id,
        old_price: change.old_price,
        new_price: change.new_price,
        price_type: 'wholesale',
        change_percentage: change.change_percentage,
        price_sheet_id: priceSheet.id,
        change_source: 'csv_upload',
        changed_by: userId,
        status: 'applied',
        applied_at: new Date().toISOString()
      };

      const { error: historyError } = await supabase
        .from('vendor_pricing_history')
        .insert(historyRecord);

      if (historyError) {
        logger.warn('Failed to record pricing history:', historyError);
      }

      results.applied++;
      results.history.push(historyRecord);
    } catch (err) {
      results.errors.push({
        sku: change.sku,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Get pricing history for a vendor or product
 * @param {object} supabase - Supabase client
 * @param {object} filters - Query filters
 * @returns {object[]} Pricing history records
 */
async function getPricingHistory(supabase, filters = {}) {
  const { vendor_id, product_sku, date_from, date_to, limit = 100, offset = 0 } = filters;

  let query = supabase
    .from('vendor_pricing_history')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (vendor_id) query = query.eq('vendor_id', vendor_id);
  if (product_sku) query = query.eq('product_sku', product_sku);
  if (date_from) query = query.gte('created_at', date_from);
  if (date_to) query = query.lte('created_at', date_to);

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) throw error;
  return { data, count };
}

/**
 * Rollback a price change
 * @param {object} supabase - Supabase client
 * @param {string} historyId - Pricing history record ID
 * @param {string} userId - User performing rollback
 * @returns {object} Result
 */
async function rollbackPriceChange(supabase, historyId, userId) {
  // Get the history record
  const { data: history, error: fetchError } = await supabase
    .from('vendor_pricing_history')
    .select('*')
    .eq('id', historyId)
    .single();

  if (fetchError || !history) {
    throw new Error('Price change record not found');
  }

  if (history.status === 'rolled_back') {
    throw new Error('Price change already rolled back');
  }

  // Restore old price
  if (history.product_id && history.old_price !== null) {
    const { error: updateError } = await supabase
      .from('distributor_products')
      .update({
        wholesale_cost: history.old_price,
        last_price_update: new Date().toISOString(),
        price_source: 'rollback'
      })
      .eq('id', history.product_id);

    if (updateError) throw updateError;
  }

  // Mark as rolled back
  const { error: historyError } = await supabase
    .from('vendor_pricing_history')
    .update({
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: userId
    })
    .eq('id', historyId);

  if (historyError) throw historyError;

  // Create reverse history record
  await supabase
    .from('vendor_pricing_history')
    .insert({
      product_id: history.product_id,
      product_sku: history.product_sku,
      product_name: history.product_name,
      vendor_id: history.vendor_id,
      old_price: history.new_price,
      new_price: history.old_price,
      price_type: history.price_type,
      change_source: 'rollback',
      changed_by: userId,
      status: 'applied',
      notes: `Rollback of change ${historyId}`
    });

  return { success: true, restored_price: history.old_price };
}

module.exports = {
  parseCSV,
  parseCSVLine,
  autoDetectColumns,
  validatePriceSheet,
  parsePrice,
  generatePriceChangeDiff,
  applyPriceChanges,
  getPricingHistory,
  rollbackPriceChange
};
