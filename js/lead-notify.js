/**
 * Lead Notification Helper
 * Call SG_notifyNewLead() after saving a lead to Supabase to trigger admin email notification.
 * This is fire-and-forget — it won't block or break the form if the notification fails.
 */
(function() {
  'use strict';

  const API_BASE = (window.SG_CONFIG && window.SG_CONFIG.API_BASE)
    ? window.SG_CONFIG.API_BASE
    : 'https://surprise-granite-email-api.onrender.com';

  /**
   * Notify admin of a new lead submission
   * @param {Object} data - Lead data
   * @param {string} data.email - Required
   * @param {string} [data.name] - Customer name
   * @param {string} [data.phone] - Phone number
   * @param {string} [data.form_name] - Which form submitted (e.g. 'hero-quote-form')
   * @param {string} [data.source] - Page URL or source identifier
   * @param {string} [data.project_type] - Type of project
   * @param {string} [data.message] - Customer message or details
   */
  window.SG_notifyNewLead = function(data) {
    if (!data || !data.email) return;

    fetch(`${API_BASE}/api/notify-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name || data.full_name || data.homeowner_name || '',
        email: data.email || data.homeowner_email || '',
        phone: data.phone || data.homeowner_phone || '',
        form_name: data.form_name || 'website',
        source: data.source || window.location.pathname,
        project_type: data.project_type || '',
        message: data.message || data.project_details || data.details || ''
      })
    }).catch(function() {
      // Silent fail — notification is best-effort, don't break the form
    });
  };
})();
