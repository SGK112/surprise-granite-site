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
  // (Silestone, Dekton, Sensa), Arch Surfaces (PentalQuartz), and LX Hausys —
  // which IS LX Viatera, distributed through Monterrey Tile. A local yard will
  // not. HanStone is NOT LX (owner, 2026-07-10): it is a separate brand and a
  // local yard, so it gets no chips.
  //
  // These are the `brand` slugs used by data/countertops.json, and they must stay
  // identical to SAMPLE_BRANDS in api/validators/price-validator.js.
  var SAMPLE_BRANDS = [
    'msi-surfaces', 'arizona-tile', 'daltile', 'cosentino', 'silestone', 'sensa',
    'arcsurfaces', 'pentalquartz', 'lx-hausys', 'lx-viatera'
  ];

  // catalog_products keys the same companies by `vendor_id`, and its `brand`
  // column is a free-text DISPLAY name: "Arizona Tile", "MSI Surfaces", "msi",
  // "Silestone by Cosentino", "Architectural Surfaces". Matching the display name
  // against the slugs above hid the sample button on every Arizona Tile, MSI,
  // Cosentino and Arch Surfaces product in the catalog. vendor_id is the stable
  // key; the brand is only a fallback for the static colour list.
  var SAMPLE_VENDOR_IDS = [
    'msi', 'arizona-tile', 'daltile', 'cosentino', 'arcsurfaces', 'pentalquartz', 'lx-hausys'
  ];

  function norm(v) { return String(v == null ? '' : v).toLowerCase(); }

  /** "Silestone by Cosentino" -> "silestone-by-cosentino" */
  function slugify(v) {
    return norm(v).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /**
   * Does `slug` begin or end with `token` as a whole hyphen-delimited component?
   *
   * Real brand names put the company first ("msi-surfaces") or last
   * ("silestone-by-cosentino"). A token buried in the MIDDLE is not the company:
   * "not-msi-clone-co" is not MSI, and an earlier version of this accepted it.
   */
  function hasToken(slug, token) {
    return slug === token
      || slug.indexOf(token + '-') === 0
      || (slug.length > token.length && slug.lastIndexOf('-' + token) === slug.length - token.length - 1);
  }

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

  /**
   * Manufacturers whose chips reach us through a distributor that is NOT itself
   * sampleable. LX Viatera's catalog rows carry vendor_id "monterrey-tile" (the
   * distributor) and brand "LX Viatera" (the maker). vendor_id alone therefore
   * says "local yard, no chip" and hid the button on all 63 of them, while the
   * catalog flagged them eligible and the server accepted them at checkout — a
   * silently lost sale on every one. The brand has to be able to override.
   *
   * Deliberately narrow: only LX. Monterrey's own colours, and the Symphony /
   * Vita Bella lines it also distributes, are not covered.
   */
  var SAMPLE_SUB_BRANDS = ['lx-viatera', 'lx-hausys'];

  function brandSlug(product) {
    return slugify(product.brand || product.vendor || product.brandDisplay);
  }

  /**
   * True when the product comes from a distributor that will cut us a chip.
   *
   * A sampleable sub-brand wins outright: it names the manufacturer, and the
   * vendor_id only names who ships it. Otherwise vendor_id decides when present —
   * it is the stable slug. Failing that, slugify the brand and look for an
   * allowed token: "msi-surfaces" starts with "msi", "silestone-by-cosentino"
   * ends with "cosentino". A bare substring test would be wrong
   * ("cosentino-lookalike" is not Cosentino), so match whole components.
   */
  function fromSampleableVendor(product) {
    var slug = brandSlug(product);
    if (slug && SAMPLE_SUB_BRANDS.indexOf(slug) > -1) return true;

    var vid = slugify(product.vendor_id);
    if (vid) return SAMPLE_VENDOR_IDS.indexOf(vid) > -1;

    if (!slug) return false;
    if (SAMPLE_BRANDS.indexOf(slug) > -1) return true;
    return SAMPLE_VENDOR_IDS.some(function (t) { return hasToken(slug, t); })
      || SAMPLE_BRANDS.some(function (t) { return hasToken(slug, t); });
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
    return fromSampleableVendor(product);
  }

  return {
    isSampleable: isSampleable,
    isNaturalStone: isNaturalStone,
    fromSampleableVendor: fromSampleableVendor,
    NATURAL_STONE_RX: NATURAL_STONE_RX,
    SAMPLE_BRANDS: SAMPLE_BRANDS,
    SAMPLE_VENDOR_IDS: SAMPLE_VENDOR_IDS,
    SAMPLE_SUB_BRANDS: SAMPLE_SUB_BRANDS,
    SAMPLE_PRICE: 12.99
  };
}));
