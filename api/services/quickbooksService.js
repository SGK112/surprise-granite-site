/**
 * QuickBooks Online Integration Service
 * Handles OAuth, customer sync, invoice sync, and estimate sync
 */

const OAuthClient = require('intuit-oauth');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// QuickBooks OAuth Configuration
const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: process.env.QBO_ENVIRONMENT || 'sandbox', // 'sandbox' or 'production'
  redirectUri: process.env.QBO_REDIRECT_URI || `${process.env.API_BASE_URL}/api/quickbooks/callback`,
  logging: process.env.NODE_ENV !== 'production'
});

// QuickBooks API Base URL
const getBaseUrl = () => {
  return process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
};

/**
 * Generate OAuth authorization URL
 */
function getAuthUrl(userId) {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: userId // Pass user ID as state for callback
  });
  return authUri;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, realmId, userId) {
  try {
    const authResponse = await oauthClient.createToken(code);
    const tokens = authResponse.getJson();

    // Store tokens in database
    const { error } = await supabase
      .from('quickbooks_tokens')
      .upsert({
        user_id: userId,
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;

    return { success: true, realmId };
  } catch (error) {
    console.error('QuickBooks token exchange error:', error);
    throw error;
  }
}

/**
 * Get valid access token (refresh if needed)
 */
async function getValidToken(userId) {
  const { data: tokenData, error } = await supabase
    .from('quickbooks_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !tokenData) {
    throw new Error('QuickBooks not connected. Please connect your QuickBooks account.');
  }

  // Check if access token is expired
  const now = new Date();
  const expiresAt = new Date(tokenData.access_token_expires_at);

  if (now >= expiresAt) {
    // Refresh the token
    oauthClient.setToken({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: 'bearer',
      expires_in: 3600,
      x_refresh_token_expires_in: 8726400
    });

    try {
      const authResponse = await oauthClient.refresh();
      const newTokens = authResponse.getJson();

      // Update tokens in database
      await supabase
        .from('quickbooks_tokens')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          access_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      return {
        accessToken: newTokens.access_token,
        realmId: tokenData.realm_id
      };
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError);
      throw new Error('QuickBooks session expired. Please reconnect.');
    }
  }

  return {
    accessToken: tokenData.access_token,
    realmId: tokenData.realm_id
  };
}

/**
 * Make authenticated API request to QuickBooks
 */
async function qboRequest(userId, method, endpoint, body = null) {
  const { accessToken, realmId } = await getValidToken(userId);
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v3/company/${realmId}/${endpoint}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error('QuickBooks API error:', data);
    throw new Error(data.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
  }

  return data;
}

/**
 * Log sync operation
 */
async function logSync(userId, entityType, entityId, operation, qboId, status, error = null, request = null, response = null) {
  await supabase
    .from('quickbooks_sync_log')
    .insert({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      qbo_id: qboId,
      status,
      error_message: error,
      request_payload: request,
      response_payload: response
    });
}

// =====================================================
// CUSTOMER SYNC
// =====================================================

/**
 * Map our customer to QuickBooks Customer format
 */
function mapCustomerToQBO(customer) {
  const nameParts = (customer.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  return {
    DisplayName: customer.company_name || customer.name || customer.email,
    CompanyName: customer.company_name || null,
    GivenName: firstName,
    FamilyName: lastName,
    PrimaryEmailAddr: customer.email ? { Address: customer.email } : null,
    PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : null,
    BillAddr: customer.address ? {
      Line1: customer.address,
      City: customer.city || null,
      CountrySubDivisionCode: customer.state || null,
      PostalCode: customer.zip || null
    } : null
  };
}

/**
 * Sync customer to QuickBooks
 */
async function syncCustomer(userId, customerId) {
  try {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (error || !customer) throw new Error('Customer not found');

    const qboCustomer = mapCustomerToQBO(customer);
    let result;
    let operation;

    if (customer.qbo_id) {
      // Update existing customer
      qboCustomer.Id = customer.qbo_id;
      qboCustomer.SyncToken = customer.qbo_sync_token;
      result = await qboRequest(userId, 'POST', 'customer', qboCustomer);
      operation = 'update';
    } else {
      // Create new customer
      result = await qboRequest(userId, 'POST', 'customer', qboCustomer);
      operation = 'create';
    }

    const qboData = result.Customer;

    // Update local record with QuickBooks ID
    await supabase
      .from('customers')
      .update({
        qbo_id: qboData.Id,
        qbo_sync_token: qboData.SyncToken,
        qbo_synced_at: new Date().toISOString()
      })
      .eq('id', customerId);

    await logSync(userId, 'customer', customerId, operation, qboData.Id, 'success', null, qboCustomer, qboData);

    return { success: true, qboId: qboData.Id };
  } catch (error) {
    await logSync(userId, 'customer', customerId, 'sync', null, 'error', error.message);
    throw error;
  }
}

/**
 * Find or create QuickBooks customer
 */
async function findOrCreateQBOCustomer(userId, customer) {
  // If already synced, return existing ID
  if (customer.qbo_id) {
    return customer.qbo_id;
  }

  // Search for existing customer by email or name
  const displayName = customer.company_name || customer.name || customer.email;
  try {
    const searchResult = await qboRequest(
      userId,
      'GET',
      `query?query=SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`
    );

    if (searchResult.QueryResponse?.Customer?.length > 0) {
      const existingCustomer = searchResult.QueryResponse.Customer[0];

      // Update local record with found QBO ID
      await supabase
        .from('customers')
        .update({
          qbo_id: existingCustomer.Id,
          qbo_sync_token: existingCustomer.SyncToken,
          qbo_synced_at: new Date().toISOString()
        })
        .eq('id', customer.id);

      return existingCustomer.Id;
    }
  } catch (e) {
    // Customer not found, will create new one
  }

  // Create new customer
  const result = await syncCustomer(userId, customer.id);
  return result.qboId;
}

// =====================================================
// INVOICE SYNC
// =====================================================

/**
 * Map our invoice to QuickBooks Invoice format
 */
function mapInvoiceToQBO(invoice, items, qboCustomerId) {
  const lines = items.map((item, index) => ({
    Id: String(index + 1),
    LineNum: index + 1,
    Description: item.description || item.name,
    Amount: item.total || (item.quantity * item.unit_price),
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: item.qbo_item_id ? { value: item.qbo_item_id } : null,
      Qty: item.quantity || 1,
      UnitPrice: item.unit_price || item.amount,
      ServiceDate: item.service_date || null,
      TaxCodeRef: item.tax_code ? { value: item.tax_code } : null
    }
  }));

  const qboInvoice = {
    CustomerRef: { value: qboCustomerId },
    DocNumber: invoice.invoice_number,
    TxnDate: invoice.created_at ? invoice.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
    DueDate: invoice.due_date ? invoice.due_date.split('T')[0] : null,
    Line: lines,
    CustomerMemo: invoice.notes ? { value: invoice.notes } : null,
    PrivateNote: invoice.internal_notes || null,
    BillEmail: invoice.customer_email ? { Address: invoice.customer_email } : null,
    EmailStatus: 'NotSet'
  };

  // Add shipping address if present
  if (invoice.ship_to_address) {
    qboInvoice.ShipAddr = {
      Line1: invoice.ship_to_address,
      City: invoice.ship_to_city || null,
      CountrySubDivisionCode: invoice.ship_to_state || null,
      PostalCode: invoice.ship_to_zip || null
    };
  }

  // Handle deposit as payment
  if (invoice.deposit_paid && invoice.deposit_paid > 0) {
    qboInvoice.Deposit = invoice.deposit_paid;
  }

  return qboInvoice;
}

/**
 * Sync invoice to QuickBooks
 */
async function syncInvoice(userId, invoiceId) {
  try {
    // Get invoice with items
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, customers(*)')
      .eq('id', invoiceId)
      .single();

    if (invError || !invoice) throw new Error('Invoice not found');

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId);

    // Ensure customer is synced to QuickBooks
    let qboCustomerId = invoice.qbo_customer_id;
    if (!qboCustomerId && invoice.customers) {
      qboCustomerId = await findOrCreateQBOCustomer(userId, invoice.customers);

      // Update invoice with customer ref
      await supabase
        .from('invoices')
        .update({ qbo_customer_id: qboCustomerId })
        .eq('id', invoiceId);
    }

    if (!qboCustomerId) {
      throw new Error('No customer linked to invoice');
    }

    const qboInvoice = mapInvoiceToQBO(invoice, items || [], qboCustomerId);
    let result;
    let operation;

    if (invoice.qbo_id) {
      // Update existing invoice
      qboInvoice.Id = invoice.qbo_id;
      qboInvoice.SyncToken = invoice.qbo_sync_token;
      result = await qboRequest(userId, 'POST', 'invoice', qboInvoice);
      operation = 'update';
    } else {
      // Create new invoice
      result = await qboRequest(userId, 'POST', 'invoice', qboInvoice);
      operation = 'create';
    }

    const qboData = result.Invoice;

    // Update local record
    await supabase
      .from('invoices')
      .update({
        qbo_id: qboData.Id,
        qbo_sync_token: qboData.SyncToken,
        qbo_synced_at: new Date().toISOString(),
        qbo_sync_status: 'synced',
        qbo_sync_error: null
      })
      .eq('id', invoiceId);

    await logSync(userId, 'invoice', invoiceId, operation, qboData.Id, 'success', null, qboInvoice, qboData);

    return { success: true, qboId: qboData.Id };
  } catch (error) {
    // Update sync status to error
    await supabase
      .from('invoices')
      .update({
        qbo_sync_status: 'error',
        qbo_sync_error: error.message
      })
      .eq('id', invoiceId);

    await logSync(userId, 'invoice', invoiceId, 'sync', null, 'error', error.message);
    throw error;
  }
}

// =====================================================
// ESTIMATE SYNC
// =====================================================

/**
 * Map our estimate to QuickBooks Estimate format
 */
function mapEstimateToQBO(estimate, items, qboCustomerId) {
  const lines = items.map((item, index) => ({
    Id: String(index + 1),
    LineNum: index + 1,
    Description: item.description || item.name,
    Amount: item.total || (item.quantity * item.unit_price),
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: item.qbo_item_id ? { value: item.qbo_item_id } : null,
      Qty: item.quantity || 1,
      UnitPrice: item.unit_price || 0,
      TaxCodeRef: item.tax_code ? { value: item.tax_code } : null
    }
  }));

  const qboEstimate = {
    CustomerRef: { value: qboCustomerId },
    DocNumber: estimate.estimate_number,
    TxnDate: estimate.created_at ? estimate.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
    ExpirationDate: estimate.expiration_date || null,
    Line: lines,
    CustomerMemo: estimate.description ? { value: estimate.description } : null,
    PrivateNote: estimate.terms_conditions || null,
    BillEmail: estimate.customer_email ? { Address: estimate.customer_email } : null,
    EmailStatus: 'NotSet',
    TxnStatus: mapEstimateStatus(estimate.status)
  };

  // Add billing address if present
  if (estimate.customer_address) {
    qboEstimate.BillAddr = {
      Line1: estimate.customer_address,
      City: estimate.customer_city || null,
      CountrySubDivisionCode: estimate.customer_state || null,
      PostalCode: estimate.customer_zip || null
    };
  }

  return qboEstimate;
}

/**
 * Map estimate status to QuickBooks TxnStatus
 */
function mapEstimateStatus(status) {
  const statusMap = {
    'draft': 'Pending',
    'sent': 'Pending',
    'viewed': 'Pending',
    'accepted': 'Accepted',
    'rejected': 'Rejected',
    'expired': 'Closed',
    'converted': 'Closed'
  };
  return statusMap[status] || 'Pending';
}

/**
 * Sync estimate to QuickBooks
 */
async function syncEstimate(userId, estimateId) {
  try {
    // Get estimate with items
    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .select('*, customers(*)')
      .eq('id', estimateId)
      .single();

    if (estError || !estimate) throw new Error('Estimate not found');

    const { data: items } = await supabase
      .from('estimate_items')
      .select('*')
      .eq('estimate_id', estimateId);

    // Ensure customer is synced to QuickBooks
    let qboCustomerId = estimate.qbo_customer_id;
    if (!qboCustomerId && estimate.customers) {
      qboCustomerId = await findOrCreateQBOCustomer(userId, estimate.customers);

      await supabase
        .from('estimates')
        .update({ qbo_customer_id: qboCustomerId })
        .eq('id', estimateId);
    }

    if (!qboCustomerId) {
      throw new Error('No customer linked to estimate');
    }

    const qboEstimate = mapEstimateToQBO(estimate, items || [], qboCustomerId);
    let result;
    let operation;

    if (estimate.qbo_id) {
      // Update existing estimate
      qboEstimate.Id = estimate.qbo_id;
      qboEstimate.SyncToken = estimate.qbo_sync_token;
      result = await qboRequest(userId, 'POST', 'estimate', qboEstimate);
      operation = 'update';
    } else {
      // Create new estimate
      result = await qboRequest(userId, 'POST', 'estimate', qboEstimate);
      operation = 'create';
    }

    const qboData = result.Estimate;

    // Update local record
    await supabase
      .from('estimates')
      .update({
        qbo_id: qboData.Id,
        qbo_sync_token: qboData.SyncToken,
        qbo_synced_at: new Date().toISOString(),
        qbo_sync_status: 'synced',
        qbo_sync_error: null
      })
      .eq('id', estimateId);

    await logSync(userId, 'estimate', estimateId, operation, qboData.Id, 'success', null, qboEstimate, qboData);

    return { success: true, qboId: qboData.Id };
  } catch (error) {
    // Update sync status to error
    await supabase
      .from('estimates')
      .update({
        qbo_sync_status: 'error',
        qbo_sync_error: error.message
      })
      .eq('id', estimateId);

    await logSync(userId, 'estimate', estimateId, 'sync', null, 'error', error.message);
    throw error;
  }
}

// =====================================================
// BULK SYNC OPERATIONS
// =====================================================

/**
 * Sync all pending invoices
 */
async function syncPendingInvoices(userId) {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('user_id', userId)
    .in('qbo_sync_status', ['pending', 'error'])
    .order('created_at', { ascending: true })
    .limit(50);

  const results = { synced: 0, errors: 0 };

  for (const invoice of invoices || []) {
    try {
      await syncInvoice(userId, invoice.id);
      results.synced++;
    } catch (e) {
      results.errors++;
    }
  }

  return results;
}

/**
 * Sync all pending estimates
 */
async function syncPendingEstimates(userId) {
  const { data: estimates } = await supabase
    .from('estimates')
    .select('id')
    .eq('user_id', userId)
    .in('qbo_sync_status', ['pending', 'error'])
    .order('created_at', { ascending: true })
    .limit(50);

  const results = { synced: 0, errors: 0 };

  for (const estimate of estimates || []) {
    try {
      await syncEstimate(userId, estimate.id);
      results.synced++;
    } catch (e) {
      results.errors++;
    }
  }

  return results;
}

/**
 * Check if QuickBooks is connected for user
 */
async function isConnected(userId) {
  const { data, error } = await supabase
    .from('quickbooks_tokens')
    .select('id, realm_id, access_token_expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;

  // Check if refresh token is still valid
  const refreshExpires = new Date(data.refresh_token_expires_at);
  return new Date() < refreshExpires;
}

/**
 * Disconnect QuickBooks
 */
async function disconnect(userId) {
  await supabase
    .from('quickbooks_tokens')
    .delete()
    .eq('user_id', userId);

  return { success: true };
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  isConnected,
  disconnect,
  syncCustomer,
  syncInvoice,
  syncEstimate,
  syncPendingInvoices,
  syncPendingEstimates,
  findOrCreateQBOCustomer
};
