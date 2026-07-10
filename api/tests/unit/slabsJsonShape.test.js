/**
 * data/slabs.json is GENERATED from catalog_products by scripts/build-slabs-json.js.
 * It is what every slab page actually loads — the catalog API is only consulted
 * afterwards, to enrich specs. These invariants are the ones that broke before:
 *
 *  - `price` used to hold the SAMPLE price, falling back to the previous file's
 *    value when the catalog had none. 1,577 of 2,402 prices had no catalog
 *    backing and were laundered forward on every rebuild. Two consumers read it:
 *    the schema.org Offer (which published $12.99 to Google as the slab's price)
 *    and the Hanstone vendor grid ("$12.99/sf"). Slabs are quote-based: no price.
 *
 *  - `sample_eligible` was absent, so slab pages could not tell whether to render
 *    the Order Sample button without a round trip to the catalog.
 *
 *  - A natural stone must never be sampleable: every lot differs, so a 4x4 chip
 *    misrepresents the slab. The server refuses one at checkout, and a button the
 *    server refuses is worse than no button.
 */
const slabs = require('../../../data/slabs.json');
const { NATURAL_STONE_RX } = require('../../validators/price-validator');

describe('data/slabs.json shape', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(slabs)).toBe(true);
    expect(slabs.length).toBeGreaterThan(2000);
  });

  it('carries no `price` — a slab is quote-based', () => {
    const priced = slabs.filter((s) => 'price' in s || 'currency' in s);
    expect(priced.map((s) => s.handle)).toEqual([]);
  });

  it('carries an explicit boolean sample_eligible on every row', () => {
    const bad = slabs.filter((s) => typeof s.sample_eligible !== 'boolean');
    expect(bad.map((s) => s.handle)).toEqual([]);
  });

  it('never offers a sample on natural stone', () => {
    const natural = (s) => NATURAL_STONE_RX.test(String(s.productType || ''))
      || NATURAL_STONE_RX.test(String(s.material || ''));
    const bad = slabs.filter((s) => s.sample_eligible && natural(s));
    expect(bad.map((s) => s.handle)).toEqual([]);
  });

  it('prices a sample at the flat fee exactly when one is offered', () => {
    const bad = slabs.filter((s) => (s.sample_eligible ? s.sample_price !== '12.99' : s.sample_price !== null));
    expect(bad.map((s) => s.handle)).toEqual([]);
  });

  it('has a unique handle per row — the handle is the identity', () => {
    const seen = new Set();
    const dupes = slabs.filter((s) => (seen.has(s.handle) ? true : (seen.add(s.handle), false)));
    expect(dupes.map((s) => s.handle)).toEqual([]);
  });

  it('does not publish the colours whose material was derived from their name', () => {
    // MSI's "Soapstone Mist" is Q Quartz; Silestone's "Charcoal Soapstone" is quartz.
    // They were filed as Soapstone, which suppressed their sample button.
    const byHandle = new Map(slabs.map((s) => [s.handle, s]));
    for (const h of ['soapstone-mist-quartz-sample', 'charcoal-soapstone-quartz-sample', 'lagoon-quartz-sample']) {
      expect(byHandle.get(h)).toBeDefined();
      expect(byHandle.get(h).productType).toBe('Quartz');
      expect(byHandle.get(h).sample_eligible).toBe(true);
    }
  });
});
