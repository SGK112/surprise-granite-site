/**
 * Wire an "Order Sample" button to the cart — one behaviour for every surface.
 *
 * A sample is its own catalog SKU: `<product-slug>-sample`, priced $12.99. The
 * button must (1) only appear where the server will honour a sample — the single
 * rule is js/sampleable.js (SGSampleable) — and (2) add that SKU to the cart and
 * open the cart, NOT link off to /shop/.
 *
 * Before this, each page hand-rolled it: the button was a static <a href="/shop/">
 * (so it "ordered" nothing, just dumped the buyer at a search page), and gating
 * was copy-pasted and drifted — templates/product.html had none, so it showed on
 * natural stone. This centralises both.
 *
 * Requires js/sampleable.js and js/cart.js to be loaded first.
 *
 * Usage:
 *   SGSampleCart.wire(document.getElementById('btn-order-sample'), product);
 * where `product` carries at least a slug/handle, a title/name, a material
 * signal (type/productType/material/tags), and an image.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SGSampleCart = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function samplePrice() {
    return (typeof window !== 'undefined' && window.SGSampleable && window.SGSampleable.SAMPLE_PRICE) || 12.99;
  }

  function slugOf(p) { return p.slug || p.handle || p.id || ''; }

  function imageOf(p) {
    if (p.primaryImage) return p.primaryImage;
    if (Array.isArray(p.images) && p.images.length) return p.images[0];
    return p.image || p.primary_image_url || '';
  }

  function eligible(p) {
    return !!(window.SGSampleable && window.SGSampleable.isSampleable(p));
  }

  /**
   * Gate the button on eligibility, and on an eligible product make it add the
   * sample SKU to the cart and open the cart. Returns true when the button is
   * shown (eligible), false when hidden.
   */
  function wire(btn, product) {
    if (!btn || !product) return false;

    if (!eligible(product)) {
      btn.style.display = 'none';
      return false;
    }
    btn.style.display = '';

    // The server (api/validators/price-validator.js) resolves a sample by looking
    // up the catalog EXACTLY by slug = item.id, then trusts that row's
    // sample_eligible. So the cart id MUST be the catalog slug — never `<slug>-
    // sample` (that misses the lookup and falls to a name match that collides
    // across colours). Catalog-API pages already carry the catalog slug; pages
    // built from data/countertops.json carry a Webflow slug that differs, so they
    // pass `sample_slug` (the catalog slug) to resolve correctly.
    var sampleId = product.sample_slug || slugOf(product);
    var baseName = product.title || product.name || 'Sample';
    var handler = function (e) {
      if (e) e.preventDefault();
      if (!window.SgCart || typeof window.SgCart.addToCart !== 'function') {
        // Cart not present — fall back to the shop rather than doing nothing.
        window.location.href = '/shop/?collection=countertop-samples';
        return;
      }
      // Shape the line so the server recognises it as a sample: variant 'Sample'
      // AND the "(Sample)" name suffix both satisfy isSampleItem().
      window.SgCart.addToCart({
        id: sampleId,
        name: baseName + ' (Sample)',
        price: samplePrice(),
        image: imageOf(product),
        variant: 'Sample',
        quantity: 1,
        category: 'samples',
        href: (typeof window !== 'undefined' && window.location) ? window.location.pathname : ''
      });
      window.location.href = '/cart/';
    };

    // If it's an <a>, neutralise its href so it can't navigate off.
    if (btn.tagName === 'A') btn.setAttribute('href', 'javascript:void(0)');
    btn.addEventListener('click', handler);
    return true;
  }

  return { wire: wire, eligible: eligible };
}));
