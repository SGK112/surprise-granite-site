/**
 * Is this colour something we will actually cut a sample chip for?
 *
 * ONE rule, shared by every surface that renders an "Order Sample" button, and
 * pinned by api/tests/unit/sampleableParity.test.js to the server's copy in
 * api/validators/price-validator.js. Before this existed the rule lived in four
 * places and no two agreed:
 *
 *   - marketplace/product/index.html tested type AND brand   (correct)
 *   - countertops/product.html tested /granite/ only          (marble, quartzite,
 *     travertine and every unsourceable brand slipped through)
 *   - js/sample-order.js tested the SLUG                      (`white-napoli` is
 *     type "Granite" with no stone word in its slug)
 *   - js/swipe-cards-universal.js tested nothing, and priced samples at $25
 *
 * A button the server will refuse is worse than no button: the buyer commits,
 * the checkout 400s, and they leave. That is exactly what happened to the
 * customer who tried four times to order a Kensho sample.
 *
 * The server is the authority and re-derives all of this at checkout. This file
 * exists only so we never OFFER what the server will refuse.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SGSampleable = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Every lot of natural stone is unique, so a 4x4 chip misrepresents the slab.
  // Owner rule: we send those buyers to the stone yard instead.
  var NATURAL_STONE_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious/i;

  // Engineered surfaces we can get a chip for, because a national distributor
  // cuts them: MSI quartz, Arizona Tile's quartz line, Daltile, Cosentino
  // (Silestone, Dekton, Sensa), Arch Surfaces (PentalQuartz), and LX Hausys
  // (Viatera/HanStone) through Monterrey Tile. A local yard will not.
  var SAMPLE_BRANDS = [
    'msi-surfaces', 'arizona-tile', 'daltile', 'cosentino', 'silestone', 'sensa',
    'arcsurfaces', 'pentalquartz', 'lx-hausys'
  ];

  function norm(v) { return String(v == null ? '' : v).toLowerCase(); }

  // Material only — never the NAME. Engineered surfaces are routinely named
  // after the stone they imitate: "Soapstone Mist" is MSI quartz, "Ice Onyx" is
  // porcelain, "Charcoal Soapstone" is Silestone. Reading the title hid the
  // button on 15 colours the server happily samples. The server tests `type`,
  // and so do we.
  function isNaturalStone(product) {
    var tags = Array.isArray(product.tags) ? product.tags : [];
    return NATURAL_STONE_RX.test(norm(product.type))
      || NATURAL_STONE_RX.test(norm(product.productType))
      || NATURAL_STONE_RX.test(norm(product.material))
      || tags.some(function (t) { return NATURAL_STONE_RX.test(norm(t)); });
  }

  function brandOf(product) {
    return norm(product.brand || product.vendor || product.brandDisplay);
  }

  /** An explicit "no sample" on a specific SKU always wins. */
  function blockedByFlag(product) {
    var tags = (Array.isArray(product.tags) ? product.tags : []).map(norm);
    return product.no_sample === true
      || product.has_sample === false
      || product.samples_available === false
      || tags.indexOf('no-sample') > -1
      || tags.indexOf('no-samples') > -1
      || tags.indexOf('no_sample') > -1
      || tags.indexOf('no_samples') > -1
      || tags.indexOf('samples-unavailable') > -1;
  }

  /**
   * A colour the vendor has discontinued is not orderable, whatever its brand.
   * The catalog carries the truth (`active`), and slabs pulled from a vendor's
   * public site are deactivated by the vendor sync. Treat an explicit false as
   * authoritative; treat absence as "no catalog row", which is normal — 379 of
   * the sampleable colours live only in data/countertops.json.
   */
  function discontinued(product) {
    return product.active === false
      || product.discontinued === true
      || product.sample_eligible === false;
  }

  function isSampleable(product) {
    if (!product) return false;
    if (discontinued(product)) return false;
    if (blockedByFlag(product)) return false;
    if (isNaturalStone(product)) return false;
    return SAMPLE_BRANDS.indexOf(brandOf(product)) > -1;
  }

  return {
    isSampleable: isSampleable,
    isNaturalStone: isNaturalStone,
    NATURAL_STONE_RX: NATURAL_STONE_RX,
    SAMPLE_BRANDS: SAMPLE_BRANDS,
    SAMPLE_PRICE: 12.99
  };
}));
