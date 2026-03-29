/**
 * Surprise Granite Instant Quote Widget
 * Self-contained IIFE — drop on any page via <script src="/js/instant-quote.js"></script>
 */
(function () {
  'use strict';

  // No dismiss — widget always shows. Close just hides it on current page.

  /* ── pricing table (installed, $/sq ft) ─────────────────────────── */
  var PRICING = {
    countertops:       { budget: [45, 65],   standard: [65, 95],   premium: [95, 150] },
    tile_backsplash:   { budget: [12, 18],   standard: [18, 28],   premium: [28, 45] },
    flooring:          { budget: [6, 10],    standard: [10, 16],   premium: [16, 25] },
    bathroom_remodel:  { budget: [80, 120],  standard: [120, 180], premium: [180, 280] },
    kitchen_remodel:   { budget: [100, 150], standard: [150, 250], premium: [250, 400] }
  };

  var PROJECT_LABELS = {
    countertops:      'Countertops',
    tile_backsplash:  'Tile / Backsplash',
    flooring:         'Flooring',
    bathroom_remodel: 'Bathroom Remodel',
    kitchen_remodel:  'Kitchen Remodel'
  };

  var TIER_LABELS = { budget: 'Budget', standard: 'Standard', premium: 'Premium' };

  var PRESETS = [
    { label: 'Small Kitchen ~25 sq ft', value: 25 },
    { label: 'Large Kitchen ~45 sq ft', value: 45 },
    { label: 'Bathroom ~15 sq ft',      value: 15 },
    { label: 'Backsplash ~30 sq ft',    value: 30 }
  ];

  /* ── state ──────────────────────────────────────────────────────── */
  var state = { step: 1, type: '', tier: '', sqft: 0, email: '' };

  /* ── inject styles ──────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = [
    '/* SQ Instant Quote Widget */',
    '.sq-iq-btn{position:fixed;bottom:24px;left:24px;z-index:9990;background:#f9cb00;color:#1a1a2e;border:none;padding:14px 22px;border-radius:50px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .2s,box-shadow .2s;display:flex;align-items:center;gap:8px;line-height:1}',
    '@media(max-width:768px){.sq-iq-btn{bottom:80px;left:16px;padding:12px 18px;font-size:14px}}',
    '.sq-iq-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.3)}',
    '.sq-iq-btn svg{width:20px;height:20px;flex-shrink:0}',

    '.sq-iq-overlay{position:fixed;bottom:90px;left:24px;z-index:9991;width:380px;max-width:calc(100vw - 48px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden;transform:scale(.92) translateY(12px);opacity:0;pointer-events:none;transition:transform .25s ease,opacity .2s ease}',
    '@media(max-width:480px){.sq-iq-overlay{left:8px;right:8px;bottom:auto;top:50%;transform:scale(.92) translateY(-50%);width:auto;max-width:none;max-height:85vh}.sq-iq-overlay.sq-open{transform:scale(1) translateY(-50%)}}',
    '.sq-iq-overlay.sq-open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}',

    '.sq-iq-header{background:#1a1a2e;color:#f9cb00;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}',
    '.sq-iq-header h3{margin:0;font-size:17px;font-weight:700}',
    '.sq-iq-close{background:none;border:none;color:#f9cb00;font-size:22px;cursor:pointer;padding:0 0 0 12px;line-height:1}',

    '.sq-iq-body{padding:20px;max-height:420px;overflow-y:auto}',
    '.sq-iq-step-label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin:0 0 10px}',
    '.sq-iq-progress{display:flex;gap:4px;margin-bottom:16px}',
    '.sq-iq-dot{height:4px;flex:1;border-radius:2px;background:#e0e0e0;transition:background .2s}',
    '.sq-iq-dot.sq-active{background:#f9cb00}',

    '.sq-iq-options{display:flex;flex-direction:column;gap:8px}',
    '.sq-iq-opt{background:#f7f7f7;border:2px solid transparent;border-radius:10px;padding:12px 16px;font-size:15px;cursor:pointer;text-align:left;transition:border-color .15s,background .15s;color:#1a1a2e;font-weight:500}',
    '.sq-iq-opt:hover{border-color:#f9cb00;background:#fffbe6}',

    '.sq-iq-sqft-wrap{display:flex;flex-direction:column;gap:10px}',
    '.sq-iq-presets{display:flex;flex-wrap:wrap;gap:6px}',
    '.sq-iq-preset{background:#f0f0f0;border:1px solid #ddd;border-radius:20px;padding:6px 14px;font-size:13px;cursor:pointer;transition:background .15s;color:#1a1a2e}',
    '.sq-iq-preset:hover,.sq-iq-preset.sq-sel{background:#f9cb00;border-color:#f9cb00;color:#1a1a2e}',
    '.sq-iq-input{border:2px solid #ddd;border-radius:10px;padding:12px 16px;font-size:16px;width:100%;box-sizing:border-box;outline:none;transition:border-color .15s;font-family:inherit}',
    '.sq-iq-input:focus{border-color:#f9cb00}',
    '.sq-iq-go{background:#f9cb00;color:#1a1a2e;border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;width:100%;margin-top:6px;transition:opacity .15s}',
    '.sq-iq-go:disabled{opacity:.45;cursor:default}',

    /* result */
    '.sq-iq-result{text-align:center}',
    '.sq-iq-range{font-size:28px;font-weight:800;color:#1a1a2e;margin:6px 0 4px}',
    '.sq-iq-detail{font-size:13px;color:#666;margin-bottom:16px}',
    '.sq-iq-cta{display:block;text-align:center;padding:13px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:8px;transition:opacity .15s}',
    '.sq-iq-cta-primary{background:#f9cb00;color:#1a1a2e}',
    '.sq-iq-cta-secondary{background:#1a1a2e;color:#fff}',
    '.sq-iq-cta:hover{opacity:.88}',

    '.sq-iq-email-section{margin-top:14px;border-top:1px solid #eee;padding-top:14px}',
    '.sq-iq-email-section label{font-size:13px;color:#666;display:block;margin-bottom:6px}',
    '.sq-iq-email-row{display:flex;gap:6px}',
    '.sq-iq-email-row input{flex:1}',
    '.sq-iq-email-send{background:#1a1a2e;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.sq-iq-email-ok{color:#27ae60;font-size:13px;font-weight:600;margin-top:6px}',
    '.sq-iq-back{background:none;border:none;color:#888;font-size:13px;cursor:pointer;margin-top:10px;padding:4px 0}',
    '.sq-iq-back:hover{color:#1a1a2e}',

    '.sq-iq-footer{text-align:center;padding:8px 20px 12px;font-size:11px}',
    '.sq-iq-footer a{color:#888;text-decoration:none}',
    '.sq-iq-footer a:hover{color:#1a1a2e}',

    /* mobile */
    '@media(max-width:480px){',
    '  .sq-iq-overlay{left:0;right:0;bottom:0;width:100%;max-width:100%;border-radius:16px 16px 0 0;max-height:85vh}',
    '  .sq-iq-btn{bottom:16px;left:16px;padding:12px 18px;font-size:14px}',
    '}'
  ].join('\n');
  document.head.appendChild(css);

  /* ── build DOM ──────────────────────────────────────────────────── */
  // floating button
  var btn = document.createElement('button');
  btn.className = 'sq-iq-btn';
  btn.setAttribute('aria-label', 'Get Instant Quote');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>Get Instant Quote';
  document.body.appendChild(btn);

  // overlay
  var overlay = document.createElement('div');
  overlay.className = 'sq-iq-overlay';
  overlay.innerHTML = [
    '<div class="sq-iq-header"><h3>Instant Quote</h3><button class="sq-iq-close" aria-label="Close">&times;</button></div>',
    '<div class="sq-iq-body"></div>',
    '<div class="sq-iq-footer"><a href="https://remodely.ai" target="_blank" rel="noopener">Powered by Remodely AI</a></div>'
  ].join('');
  document.body.appendChild(overlay);

  var body = overlay.querySelector('.sq-iq-body');
  var closeBtn = overlay.querySelector('.sq-iq-close');

  /* ── helpers ────────────────────────────────────────────────────── */
  function $(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    return el;
  }
  function money(n) {
    return '$' + n.toLocaleString('en-US');
  }
  function dots(step) {
    var html = '';
    for (var i = 1; i <= 4; i++) html += '<div class="sq-iq-dot' + (i <= step ? ' sq-active' : '') + '"></div>';
    return '<div class="sq-iq-progress">' + html + '</div>';
  }

  /* ── render steps ───────────────────────────────────────────────── */
  function render() {
    body.innerHTML = '';

    if (state.step === 1) renderStep1();
    else if (state.step === 2) renderStep2();
    else if (state.step === 3) renderStep3();
    else if (state.step === 4) renderStep4();
  }

  function renderStep1() {
    body.innerHTML = dots(1) + '<p class="sq-iq-step-label">Step 1 of 4 — Project Type</p>';
    var opts = $('div', 'sq-iq-options');
    Object.keys(PROJECT_LABELS).forEach(function (key) {
      var b = $('button', 'sq-iq-opt', PROJECT_LABELS[key]);
      b.addEventListener('click', function () { state.type = key; state.step = 2; render(); });
      opts.appendChild(b);
    });
    body.appendChild(opts);
  }

  function renderStep2() {
    body.innerHTML = dots(2) + '<p class="sq-iq-step-label">Step 2 of 4 — Material Tier</p>';
    var opts = $('div', 'sq-iq-options');
    Object.keys(TIER_LABELS).forEach(function (key) {
      var range = PRICING[state.type][key];
      var b = $('button', 'sq-iq-opt', '<strong>' + TIER_LABELS[key] + '</strong><br><span style="font-size:13px;color:#666">' + money(range[0]) + ' – ' + money(range[1]) + ' / sq ft installed</span>');
      b.addEventListener('click', function () { state.tier = key; state.step = 3; render(); });
      opts.appendChild(b);
    });
    body.appendChild(opts);
    addBack();
  }

  function renderStep3() {
    body.innerHTML = dots(3) + '<p class="sq-iq-step-label">Step 3 of 4 — Square Footage</p>';
    var wrap = $('div', 'sq-iq-sqft-wrap');

    var presetWrap = $('div', 'sq-iq-presets');
    PRESETS.forEach(function (p) {
      var tag = $('button', 'sq-iq-preset', p.label);
      tag.addEventListener('click', function () {
        state.sqft = p.value;
        inp.value = p.value;
        goBtn.disabled = false;
        // deselect others
        presetWrap.querySelectorAll('.sq-iq-preset').forEach(function (el) { el.classList.remove('sq-sel'); });
        tag.classList.add('sq-sel');
      });
      presetWrap.appendChild(tag);
    });
    wrap.appendChild(presetWrap);

    var inp = $('input', 'sq-iq-input');
    inp.type = 'number'; inp.min = '1'; inp.max = '9999';
    inp.placeholder = 'Or enter sq ft manually';
    inp.addEventListener('input', function () {
      state.sqft = parseInt(inp.value, 10) || 0;
      goBtn.disabled = state.sqft < 1;
      presetWrap.querySelectorAll('.sq-iq-preset').forEach(function (el) { el.classList.remove('sq-sel'); });
    });
    wrap.appendChild(inp);

    var goBtn = $('button', 'sq-iq-go', 'Calculate My Quote');
    goBtn.disabled = true;
    goBtn.addEventListener('click', function () { if (state.sqft > 0) { state.step = 4; render(); } });
    wrap.appendChild(goBtn);

    body.appendChild(wrap);
    addBack();
  }

  function renderStep4() {
    var range = PRICING[state.type][state.tier];
    var low = range[0] * state.sqft;
    var high = range[1] * state.sqft;

    var estUrl = '/get-a-free-estimate/?source=instant-quote&type=' +
      encodeURIComponent(PROJECT_LABELS[state.type]) +
      '&tier=' + encodeURIComponent(TIER_LABELS[state.tier]) +
      '&sqft=' + state.sqft;

    body.innerHTML = dots(4);

    var result = $('div', 'sq-iq-result');
    result.innerHTML = [
      '<p class="sq-iq-step-label">Your Estimated Range</p>',
      '<div class="sq-iq-range">' + money(low) + ' – ' + money(high) + '</div>',
      '<p class="sq-iq-detail">' + PROJECT_LABELS[state.type] + ' &middot; ' + TIER_LABELS[state.tier] + ' &middot; ' + state.sqft + ' sq ft<br>Material + installation &middot; Phoenix metro area</p>',
      '<a class="sq-iq-cta sq-iq-cta-primary" href="' + estUrl + '">Get Exact Quote</a>',
      '<a class="sq-iq-cta sq-iq-cta-secondary" href="tel:+16028333189">Call Now — (602) 833-3189</a>',
      '<div class="sq-iq-email-section"><label>Email me this estimate</label><div class="sq-iq-email-row"><input class="sq-iq-input" type="email" placeholder="you@email.com"><button class="sq-iq-email-send">Send</button></div><div class="sq-iq-email-msg"></div></div>'
    ].join('');
    body.appendChild(result);

    // email handler
    var emailInput = result.querySelector('.sq-iq-email-row input');
    var sendBtn = result.querySelector('.sq-iq-email-send');
    var msgEl = result.querySelector('.sq-iq-email-msg');

    sendBtn.addEventListener('click', function () {
      var email = (emailInput.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msgEl.textContent = 'Please enter a valid email.';
        msgEl.style.color = '#e74c3c';
        return;
      }
      state.email = email;
      sendBtn.disabled = true;
      sendBtn.textContent = '...';
      submitLead(low, high, function (ok) {
        if (ok) {
          msgEl.className = 'sq-iq-email-ok';
          msgEl.textContent = 'Sent! Check your inbox.';
        } else {
          msgEl.textContent = 'Something went wrong. Try again.';
          msgEl.style.color = '#e74c3c';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send';
        }
      });
    });

    addBack();
  }

  function addBack() {
    var b = $('button', 'sq-iq-back', '&larr; Back');
    b.addEventListener('click', function () { state.step--; render(); });
    body.appendChild(b);
  }

  /* ── lead submission ────────────────────────────────────────────── */
  function submitLead(low, high, cb) {
    var payload = {
      email: state.email,
      source: 'instant-quote-widget',
      project_type: PROJECT_LABELS[state.type],
      project_details: TIER_LABELS[state.tier] + ' tier, ~' + state.sqft + ' sq ft. Estimate: ' + money(low) + ' – ' + money(high) + '.',
      page_url: window.location.href
    };

    var crmPayload = {
      email: state.email,
      source: 'instant-quote-widget',
      project_type: PROJECT_LABELS[state.type],
      message: payload.project_details,
      page_url: window.location.href,
      raw_data: { tier: state.tier, sqft: state.sqft, low: low, high: high }
    };

    var done = 0, ok = true;
    function check() { done++; if (done >= 2) cb(ok); }

    post('https://surprise-granite-email-api.onrender.com/api/leads', payload, function (s) { if (!s) ok = false; check(); });
    postWithRetry('https://voiceflow-crm.onrender.com/api/surprise-granite/webhook/new-lead', crmPayload, function (s) { if (!s) ok = false; check(); });
  }

  function post(url, data, cb) {
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) { cb(r.ok); }).catch(function () { cb(false); });
    } catch (e) { cb(false); }
  }

  function postWithRetry(url, data, cb, attempt) {
    attempt = attempt || 1;
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) {
        if (r.ok) { cb(true); }
        else if (attempt < 3) { setTimeout(function() { postWithRetry(url, data, cb, attempt + 1); }, attempt * 3000); }
        else { cb(false); }
      }).catch(function () {
        if (attempt < 3) { setTimeout(function() { postWithRetry(url, data, cb, attempt + 1); }, attempt * 3000); }
        else { cb(false); }
      });
    } catch (e) { cb(false); }
  }

  /* ── toggle logic ───────────────────────────────────────────────── */
  function open() {
    state.step = 1; state.type = ''; state.tier = ''; state.sqft = 0; state.email = '';
    render();
    overlay.classList.add('sq-open');
    btn.style.display = 'none';
  }

  function close() {
    overlay.classList.remove('sq-open');
    btn.style.display = '';
  }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', function () { close(); });

  // close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('sq-open')) close(false);
  });

  // close on outside click
  document.addEventListener('mousedown', function (e) {
    if (overlay.classList.contains('sq-open') && !overlay.contains(e.target) && e.target !== btn) {
      close(false);
    }
  });
})();
