/**
 * Lead Notification Helper
 * Call SG_notifyNewLead() after saving a lead to Supabase to trigger admin email notification.
 * Call SG_syncLeadToCRM(supabasePayload) to push the same lead into VoiceNow CRM so Aria has it.
 * Both are fire-and-forget — they won't block or break the form if a downstream call fails.
 */
(function() {
  'use strict';

  const API_BASE = (window.SG_CONFIG && window.SG_CONFIG.API_BASE)
    ? window.SG_CONFIG.API_BASE
    : 'https://surprise-granite-email-api.onrender.com';

  const CRM_WEBHOOK_URL = (window.SG_CONFIG && window.SG_CONFIG.CRM_WEBHOOK_URL)
    ? window.SG_CONFIG.CRM_WEBHOOK_URL
    : 'https://www.voicenowcrm.com/api/surprise-granite/webhook/new-lead';

  // Reliable fire-and-forget POST that survives page navigation/unload.
  // Tries sendBeacon first (the canonical "tab is closing, please deliver this" API),
  // falls back to fetch with keepalive (same browser-level guarantee, modern browsers).
  function sendReliable(url, payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch (_) { /* fall through to fetch */ }
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function() { /* best-effort */ });
    } catch (_) { /* best-effort */ }
  }

  window.SG_notifyNewLead = function(data) {
    if (!data || !data.email) return;
    sendReliable(`${API_BASE}/api/notify-lead`, {
      name: data.name || data.full_name || data.homeowner_name || '',
      email: data.email || data.homeowner_email || '',
      phone: data.phone || data.homeowner_phone || '',
      form_name: data.form_name || 'website',
      source: data.source || window.location.pathname,
      project_type: data.project_type || '',
      message: data.message || data.project_details || data.details || ''
    });
  };

  // Pass the SAME payload that was POSTed to Supabase. The VoiceNow webhook reads
  // full_name, email, phone, project_type, project_details, billing_address,
  // service_address, zip_code, image_urls, etc. directly off this shape.
  window.SG_syncLeadToCRM = function(supabasePayload) {
    if (!supabasePayload) return;
    if (!supabasePayload.email && !supabasePayload.phone && !supabasePayload.full_name) return;
    sendReliable(CRM_WEBHOOK_URL, supabasePayload);
  };
})();
