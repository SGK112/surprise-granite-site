/**
 * Surprise Granite - Centralized Lead Service
 * ALL leads go ONLY to Supabase leads table
 * This powers the /account page leads tab
 */

(function() {
  'use strict';

  const CRM_WEBHOOK = 'https://www.voicenowcrm.com/api/surprise-granite/webhook/new-lead';

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var t = setTimeout(function() { controller.abort(); }, timeoutMs);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(function() { clearTimeout(t); });
  }

  function syncToCRMWithRetry(leadData, attempt) {
    attempt = attempt || 1;
    fetchWithTimeout(CRM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    }, 15000).then(function(r) {
      if (r.ok) {
        console.log('[LeadService] Lead synced to CRM');
      } else if (attempt < 3) {
        console.warn('[LeadService] CRM sync attempt ' + attempt + ' failed (' + r.status + '), retrying...');
        setTimeout(function() { syncToCRMWithRetry(leadData, attempt + 1); }, attempt * 3000);
      } else {
        console.error('[LeadService] CRM sync failed after 3 attempts');
      }
    }).catch(function(err) {
      if (attempt < 3) {
        console.warn('[LeadService] CRM sync attempt ' + attempt + ' error, retrying...', err.message);
        setTimeout(function() { syncToCRMWithRetry(leadData, attempt + 1); }, attempt * 3000);
      } else {
        console.error('[LeadService] CRM sync failed after 3 attempts:', err.message);
      }
    });
  }

  const config = window.SG_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  // Client-side dedup — 5-minute window per (email, form_name). Catches
  // double-clicks, multi-tab submits, and page-refresh resubmits.
  // Uses localStorage so it survives tab closes.
  const DEDUP_WINDOW_MS = 5 * 60 * 1000;
  const DEDUP_STORE_KEY = 'sg_lead_dedup';

  function loadDedupStore() {
    try {
      const raw = localStorage.getItem(DEDUP_STORE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // GC old entries so the store doesn't grow forever.
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      for (const k of Object.keys(parsed)) {
        if (!parsed[k] || parsed[k] < cutoff) delete parsed[k];
      }
      return parsed;
    } catch (_) {
      return {};
    }
  }
  function saveDedupStore(store) {
    try { localStorage.setItem(DEDUP_STORE_KEY, JSON.stringify(store)); } catch (_) {}
  }
  function dedupKey(email, formName) {
    return `${(email || '').toLowerCase().trim()}|${formName || 'website'}`;
  }
  function hasRecentSubmission(email, formName) {
    if (!email) return false;
    const store = loadDedupStore();
    const ts = store[dedupKey(email, formName)];
    return ts && (Date.now() - ts) < DEDUP_WINDOW_MS;
  }
  function markSubmitted(email, formName) {
    if (!email) return;
    const store = loadDedupStore();
    store[dedupKey(email, formName)] = Date.now();
    saveDedupStore(store);
  }

  /**
   * Submit a lead to Supabase
   * @param {Object} leadData - Lead information
   * @returns {Promise<Object>} - Result with success/error
   */
  async function submitLead(leadData) {
    // Normalize the data. Lowercase email so server-side dedup (which lowercases)
    // matches client-side inserts — otherwise JOSH@x.com and josh@x.com become two leads.
    const rawEmail = leadData.email || '';
    const normalizedEmail = rawEmail.toLowerCase().trim();
    const formName = leadData.formName || leadData.form_name || leadData.source || 'website-form';

    // Bail early if this (email, form) submitted in the last 5 minutes — stops
    // the double-submit + page-refresh-resubmit pattern from creating dupes.
    if (hasRecentSubmission(normalizedEmail, formName)) {
      console.log('[LeadService] Duplicate submission prevented (dedup window):', normalizedEmail, formName);
      return { success: true, data: null, deduped: true };
    }

    const lead = {
      full_name: leadData.name || leadData.full_name || '',
      email: normalizedEmail,
      phone: cleanPhone(leadData.phone || ''),
      project_type: leadData.projectType || leadData.project_type || leadData.service || '',
      timeline: leadData.timeline || '',
      budget: leadData.budget || '',
      message: leadData.message || leadData.notes || '',
      source: 'website',
      form_name: formName,
      page_url: leadData.page_url || window.location.href,
      raw_data: leadData
    };

    // Add address if provided (uses JSONB billing_address column)
    if (leadData.address || leadData.street) {
      lead.billing_address = {
        street: leadData.address || leadData.street || '',
        city: leadData.city || '',
        state: leadData.state || 'AZ',
        zip: leadData.zip || leadData.zipcode || ''
      };
    }
    // Add zip_code (top-level column)
    if (leadData.zip || leadData.zipcode || leadData.zip_code) {
      lead.zip_code = leadData.zip || leadData.zipcode || leadData.zip_code || '';
    }

    try {
      const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(lead)
      }, 15000);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to submit lead: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Mark as submitted so a rapid retry within the dedup window is blocked.
      markSubmitted(normalizedEmail, formName);

      // Track in analytics if available
      if (window.sgTrackEvent) {
        window.sgTrackEvent('generate_lead', {
          form_name: lead.form_name,
          project_type: lead.project_type
        });
      }

      console.log('[LeadService] Lead submitted successfully:', result[0]?.id);

      // Push to VoiceNow CRM with retry (Render cold starts can cause first attempt to fail)
      syncToCRMWithRetry(result[0] || lead);

      // Send admin notification (fire-and-forget)
      if (window.SG_notifyNewLead) {
        window.SG_notifyNewLead({
          name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          form_name: lead.form_name,
          source: lead.page_url,
          project_type: lead.project_type,
          message: lead.message
        });
      }

      return { success: true, data: result[0] };

    } catch (error) {
      console.error('[LeadService] Error submitting lead:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean phone number to digits only
   */
  function cleanPhone(phone) {
    return phone.replace(/\D/g, '');
  }

  /**
   * Helper to submit from a form element
   * @param {HTMLFormElement} form - The form element
   * @param {Object} options - Additional options
   */
  async function submitForm(form, options = {}) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Merge with options
    const leadData = {
      ...data,
      formName: options.formName || form.id || 'website-form',
      ...options.extraData
    };

    return submitLead(leadData);
  }

  /**
   * Auto-attach to forms with data-lead-form attribute
   */
  function initAutoForms() {
    document.querySelectorAll('form[data-lead-form]').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        const originalText = submitBtn?.textContent;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending...';
        }

        const result = await submitForm(form, {
          formName: form.dataset.leadForm || form.id
        });

        if (result.success) {
          // Success handling
          const successUrl = form.dataset.successUrl || '/contact-thank-you';
          const successMessage = form.dataset.successMessage || 'Thank you! We\'ll contact you soon.';

          if (form.dataset.successUrl) {
            window.location.href = successUrl;
          } else {
            alert(successMessage);
            form.reset();
          }
        } else {
          alert('Something went wrong. Please call us at (602) 833-3189');
        }

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoForms);
  } else {
    initAutoForms();
  }

  // Expose globally
  window.SG_LeadService = {
    submitLead,
    submitForm,
    // Exposed so inline-HTML forms (book/, book-appointment, etc.) can also
    // gate their direct-to-Supabase inserts behind the same dedup window.
    hasRecentSubmission,
    markSubmitted
  };

})();
