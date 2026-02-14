/**
 * Surprise Granite - Centralized Lead Service
 * ALL leads go ONLY to Supabase leads table
 * This powers the /account page leads tab
 */

(function() {
  'use strict';

  const config = window.SG_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  /**
   * Submit a lead to Supabase
   * @param {Object} leadData - Lead information
   * @returns {Promise<Object>} - Result with success/error
   */
  async function submitLead(leadData) {
    // Normalize the data
    const lead = {
      full_name: leadData.name || leadData.full_name || '',
      email: leadData.email || '',
      phone: cleanPhone(leadData.phone || ''),
      project_type: leadData.projectType || leadData.project_type || leadData.service || '',
      timeline: leadData.timeline || '',
      budget: leadData.budget || '',
      message: leadData.message || leadData.notes || '',
      source: 'website',
      form_name: leadData.formName || leadData.form_name || leadData.source || 'website-form',
      page_url: leadData.page_url || window.location.href,
      raw_data: leadData
    };

    // Add address if provided
    if (leadData.address || leadData.street) {
      lead.address = leadData.address || leadData.street;
      lead.city = leadData.city || '';
      lead.state = leadData.state || 'AZ';
      lead.zip = leadData.zip || leadData.zipcode || '';
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(lead)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to submit lead: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Track in analytics if available
      if (window.sgTrackEvent) {
        window.sgTrackEvent('generate_lead', {
          form_name: lead.form_name,
          project_type: lead.project_type
        });
      }

      console.log('[LeadService] Lead submitted successfully:', result[0]?.id);

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
    submitForm
  };

})();
