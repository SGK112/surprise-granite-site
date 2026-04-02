/**
 * Cookie Consent Banner
 * CCPA/GDPR compliant — blocks GA/GTM until accepted
 */
(function() {
  'use strict';

  var CONSENT_KEY = 'sg_cookie_consent';
  var consent = localStorage.getItem(CONSENT_KEY);

  // If already consented, nothing to show
  if (consent === 'accepted') return;

  // If declined, disable GA
  if (consent === 'declined') {
    window['ga-disable-G-XXXXXXXXX'] = true;
    return;
  }

  // Build banner
  var banner = document.createElement('div');
  banner.id = 'cookieConsent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.innerHTML = '' +
    '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
      '<p style="flex:1;min-width:200px;margin:0;font-size:14px;color:#e2e8f0;line-height:1.5;">' +
        'We use cookies to improve your experience and analyze site traffic. ' +
        '<a href="/legal/privacy-policy/" style="color:#f9cb00;text-decoration:underline;">Privacy Policy</a>' +
      '</p>' +
      '<div style="display:flex;gap:8px;flex-shrink:0;">' +
        '<button id="cookieAccept" style="padding:10px 20px;background:#f9cb00;color:#1a1a2e;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Accept</button>' +
        '<button id="cookieDecline" style="padding:10px 20px;background:transparent;color:#94a3b8;border:1px solid #475569;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Decline</button>' +
      '</div>' +
    '</div>';

  // Style the banner
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:16px 24px;background:#1e293b;border-top:1px solid #334155;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';

  function show() {
    document.body.appendChild(banner);

    document.getElementById('cookieAccept').addEventListener('click', function() {
      localStorage.setItem(CONSENT_KEY, 'accepted');
      banner.remove();
    });

    document.getElementById('cookieDecline').addEventListener('click', function() {
      localStorage.setItem(CONSENT_KEY, 'declined');
      window['ga-disable-G-XXXXXXXXX'] = true;
      // Clear existing GA cookies
      document.cookie.split(';').forEach(function(c) {
        var name = c.trim().split('=')[0];
        if (name.startsWith('_ga') || name.startsWith('_gid')) {
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + window.location.hostname;
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        }
      });
      banner.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
