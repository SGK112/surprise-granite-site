/**
 * Product Matching — Browse & Order Section
 * Replaces Shopify Storefront API with links to marketplace.
 * Shown on countertop, tile, and flooring product pages.
 */

(function() {
  'use strict';

  let isInitialized = false;

  function getProductCategory() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/countertops/') || path.includes('/materials/countertops')) return 'countertops';
    if (path.includes('/tile/')) return 'tile';
    if (path.includes('/flooring/')) return 'flooring';
    return null;
  }

  function getProductName() {
    var jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        var data = JSON.parse(jsonLd.textContent);
        if (data.name) return data.name;
        if (data['@graph']) {
          var product = data['@graph'].find(function(item) { return item['@type'] === 'Product'; });
          if (product && product.name) return product.name;
        }
      } catch (e) {}
    }
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      var title = ogTitle.content.split('|')[0].trim();
      if (title && title.length > 2) return title;
    }
    return document.title.split('|')[0].trim();
  }

  function createSection(category) {
    var name = getProductName();
    var section = document.createElement('section');
    section.id = 'shopify-match-section';
    section.className = 'shopify-match-section';

    var links = {
      countertops: { href: '/marketplace/slabs/', label: 'Browse Slabs', sub: 'View full slabs, compare pricing, and add to cart' },
      tile: { href: '/marketplace/tile/', label: 'Browse Tile', sub: 'Shop tile by style, color, and size' },
      flooring: { href: '/marketplace/flooring/', label: 'Browse Flooring', sub: 'Shop LVP, LVT, and tile flooring' }
    };
    var link = links[category] || links.countertops;

    section.innerHTML = '' +
      '<div class="shopify-match-container">' +
        '<div class="shopify-match-main">' +
          '<div class="shopify-match-badge">' +
            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>' +
            ' Order Online' +
          '</div>' +
          '<div class="shopify-match-card" style="display:flex;align-items:center;gap:24px;padding:24px;">' +
            '<div class="shopify-match-info" style="flex:1;">' +
              '<h3 class="shopify-match-title" style="margin:0 0 6px;font-size:17px;">' + link.label + '</h3>' +
              '<p style="margin:0 0 16px;font-size:14px;color:#64748b;">' + link.sub + '</p>' +
              '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
                '<a href="' + link.href + '" class="shopify-match-btn">' +
                  '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>' +
                  ' ' + link.label +
                '</a>' +
                '<a href="/stone-yards/" style="display:inline-flex;align-items:center;gap:6px;padding:12px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#1a1a2e;font-size:14px;font-weight:600;text-decoration:none;">' +
                  '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
                  'Visit Stone Yard' +
                '</a>' +
              '</div>' +
              '<p class="shopify-match-note" style="margin-top:10px;">Free shipping on orders over $1,000</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    return section;
  }

  function addStyles() {
    if (document.getElementById('shopify-match-styles')) return;
    var style = document.createElement('style');
    style.id = 'shopify-match-styles';
    style.textContent = '' +
      '.shopify-match-section{padding:32px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:32px 0;}' +
      '.shopify-match-container{max-width:900px;margin:0 auto;}' +
      '.shopify-match-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:#1a1a2e;color:#f9cb00;border-radius:100px;font-size:12px;font-weight:700;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;}' +
      '.shopify-match-card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.06);}' +
      '.shopify-match-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:linear-gradient(180deg,#f9cb00,#e5b800);color:#1a1a2e;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;transition:all 0.2s;box-shadow:0 2px 8px rgba(249,203,0,0.3);}' +
      '.shopify-match-btn:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(249,203,0,0.4);}' +
      '.shopify-match-note{font-size:12px;color:#94a3b8;}';
    document.head.appendChild(style);
  }

  function insertSection(section) {
    var targets = [
      '.product-details', '.product-content', '.product-page',
      'main', '.main-wrapper', '.w-richtext'
    ];
    for (var i = 0; i < targets.length; i++) {
      var el = document.querySelector(targets[i]);
      if (el) {
        el.parentNode.insertBefore(section, el.nextSibling);
        return;
      }
    }
    var scripts = document.querySelectorAll('body > script');
    if (scripts.length > 0) {
      scripts[0].parentNode.insertBefore(section, scripts[0]);
    } else {
      document.body.appendChild(section);
    }
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    var category = getProductCategory();
    if (!category) return;

    addStyles();
    var section = createSection(category);
    insertSection(section);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ShopifyProducts = {
    getProductName: getProductName,
    getProductCategory: getProductCategory,
    findMatch: function() { return null; },
    listSamples: function() { return []; },
    refresh: function() { isInitialized = false; init(); }
  };
})();
