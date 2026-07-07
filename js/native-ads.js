/**
 * SG House Ads — native in-site promos for the Online Store (owner directive
 * 2026-07-07: "advertise sinks and other things in all the pages site wide…
 * like we have our own ads inside the website").
 *
 * One small, dismissible product card per page view, bottom-left, pulled LIVE
 * from the catalog so it only ever shows in-stock items with real prices.
 * Context-aware: slab/material pages promote sinks & faucets ("finish the
 * project"), sink pages promote faucets/accessories, everything else rotates.
 * Dismiss = hidden for the rest of the session. Never shows on store pages
 * themselves, cart, or checkout. Loaded site-wide by unified-nav.js.
 */
(function () {
  'use strict';
  if (window.__sgAdsLoaded) return;
  window.__sgAdsLoaded = true;

  var path = location.pathname;
  // Don't advertise the store to people already in the store / cart / admin.
  if (/^\/(marketplace|cart|checkout|shop|admin|app|distributor|vendor)\b/.test(path)) return;
  try { if (sessionStorage.getItem('sg-ad-dismissed')) return; } catch (e) { /* private mode */ }

  var API = (window.SG_CONFIG && window.SG_CONFIG.API_BASE) || 'https://surprise-granite-email-api.onrender.com';

  // context → which store categories to promote
  var CATS = ['sink', 'faucet', 'accessory', 'fixture'];
  var HEAD = 'From our Online Store';
  var LEAD = 'Suggested for you';
  if (/materials|countertops|stone-yards|remnant|quote|calculator|granite|quartz|marble|tile|flooring/.test(path)) {
    CATS = ['sink', 'faucet'];
    LEAD = 'Finish the project';
  } else if (/kitchen/.test(path)) {
    CATS = ['sink', 'accessory'];
    LEAD = 'For your kitchen';
  } else if (/bathroom|bath/.test(path)) {
    CATS = ['faucet', 'fixture'];
    LEAD = 'For your bath';
  }

  // deterministic daily rotation, varied per page
  var seed = 0;
  var key = new Date().toISOString().slice(0, 10) + path;
  for (var i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  var cat = CATS[seed % CATS.length];

  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function render(p) {
    var img = p.primary_image_url || (p.image_urls && p.image_urls[0]);
    if (!img || !(Number(p.retail_price) > 0)) return;
    var catSlug = { sink: 'sinks', faucet: 'faucets', accessory: 'kitchen-accessories', fixture: 'bathroom' }[cat] || 'sinks';
    var href = '/marketplace/product/?handle=' + encodeURIComponent(p.slug) + '&category=' + catSlug + '&utm_source=house-ad&utm_medium=onsite&utm_campaign=' + catSlug;

    var el = document.createElement('aside');
    el.id = 'sg-house-ad';
    el.setAttribute('aria-label', 'Suggested product from our online store');
    el.innerHTML =
      '<style>' +
      '#sg-house-ad{position:fixed;left:16px;bottom:16px;z-index:9990;width:290px;max-width:calc(100vw - 32px);' +
      'background:#fff;border:1px solid #e3e6ea;border-radius:14px;box-shadow:0 8px 32px -8px rgba(20,28,38,.28);' +
      'font-family:Inter,-apple-system,sans-serif;overflow:hidden;opacity:0;transform:translateY(14px);' +
      'transition:opacity .4s ease,transform .4s ease}' +
      '#sg-house-ad.sg-ad-in{opacity:1;transform:none}' +
      '#sg-house-ad .sg-ad-tag{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;' +
      'font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a94a0;background:#f7f8fa;border-bottom:1px solid #eef0f3}' +
      '#sg-house-ad .sg-ad-x{border:0;background:none;cursor:pointer;font-size:18px;line-height:1;color:#9aa4af;' +
      'min-width:40px;min-height:40px;margin:-12px -12px -12px 0;display:flex;align-items:center;justify-content:center}' +
      '#sg-house-ad .sg-ad-x:hover{color:#333}' +
      '#sg-house-ad a{display:flex;gap:12px;padding:12px;text-decoration:none;color:#17202a;align-items:center}' +
      '#sg-house-ad img{width:74px;height:74px;object-fit:cover;border-radius:10px;background:#f0f2f4;flex:none}' +
      '#sg-house-ad .sg-ad-lead{font-size:11px;font-weight:700;color:#a07f00;margin-bottom:2px}' +
      '#sg-house-ad .sg-ad-name{font-size:13.5px;font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '#sg-house-ad .sg-ad-price{margin-top:4px;font-size:14px;font-weight:800;color:#16a34a}' +
      '#sg-house-ad .sg-ad-cta{font-size:12px;font-weight:700;color:#1f3140;margin-top:2px}' +
      '@media (max-width:600px){#sg-house-ad{width:calc(100vw - 24px);left:12px;bottom:12px}}' +
      '@media print{#sg-house-ad{display:none}}' +
      '</style>' +
      '<div class="sg-ad-tag"><span>' + HEAD + '</span>' +
      '<button class="sg-ad-x" aria-label="Dismiss suggestion">&#215;</button></div>' +
      '<a href="' + href + '">' +
      '<img loading="lazy" src="' + img + '" alt="' + (p.name || 'Product') + '"/>' +
      '<span><span class="sg-ad-lead">' + LEAD + '</span>' +
      '<span class="sg-ad-name">' + (p.name || '') + '</span>' +
      '<span class="sg-ad-price">' + money(p.retail_price) + '</span>' +
      '<span class="sg-ad-cta">Shop now &rarr;</span></span></a>';

    el.querySelector('.sg-ad-x').addEventListener('click', function () {
      try { sessionStorage.setItem('sg-ad-dismissed', '1'); } catch (e) {}
      el.remove();
    });
    document.body.appendChild(el);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) el.classList.add('sg-ad-in');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('sg-ad-in'); }); });
  }

  function start() {
    var offset = seed % 40;
    fetch(API + '/api/catalog?category=' + cat + '&limit=24&offset=' + offset)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var rows = ((j && j.products) || []).filter(function (p) {
          return p.in_stock !== false && Number(p.retail_price) > 0 && (p.primary_image_url || (p.image_urls && p.image_urls[0]));
        });
        if (!rows.length) return;
        render(rows[seed % rows.length]);
      })
      .catch(function () { /* never break a page over an ad */ });
  }

  // appear after the visitor has settled in
  if (document.readyState === 'complete') setTimeout(start, 6000);
  else window.addEventListener('load', function () { setTimeout(start, 6000); });
})();
