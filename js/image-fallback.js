/**
 * Site-wide broken-image rescue.
 * Listens for <img> error events bubbling to document and swaps the src
 * to the brand placeholder. Saves bare-broken-icon UX even when product
 * pages render <img> tags without an inline onerror handler.
 *
 * Loaded after marketplace-mobile-fix.css on every marketplace, cart,
 * checkout, product, blog, location, and vendor page.
 */
(function () {
  'use strict';
  var FALLBACK = '/images/placeholder-card.svg';
  var swapped = new WeakSet();
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (swapped.has(t)) return;
    if (t.src && t.src.indexOf(FALLBACK) !== -1) return;
    swapped.add(t);
    t.src = FALLBACK;
    t.style.objectFit = 'cover';
  }, true);  // capture phase: catches errors before they're swallowed by inline handlers
})();
