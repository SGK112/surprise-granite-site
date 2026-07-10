/**
 * The browser must never OFFER a sample the server will REFUSE.
 *
 * js/sampleable.js decides whether to render the "Order Sample" button;
 * api/validators/price-validator.js decides whether checkout accepts it. If they
 * disagree, a buyer commits and gets a 400. This test pins them together, and
 * checks the cases where the previous four copies of the rule went wrong.
 */

const server = require('../../validators/price-validator');
const client = require('../../../js/sampleable');

describe('client sampleable rule matches the server', () => {
  it('uses the same natural-stone pattern', () => {
    expect(client.NATURAL_STONE_RX.source).toBe(server.NATURAL_STONE_RX.source);
    expect(client.NATURAL_STONE_RX.flags).toBe(server.NATURAL_STONE_RX.flags);
  });

  it('uses the same sourceable-brand list', () => {
    expect([...client.SAMPLE_BRANDS].sort()).toEqual([...server.SAMPLE_BRANDS].sort());
  });

  it('quotes the same sample price', () => {
    expect(Math.round(client.SAMPLE_PRICE * 100)).toBe(server.SAMPLE_PRICE_CENTS);
  });
});

describe('isSampleable', () => {
  const msiQuartz = { name: 'Kensho', brand: 'msi-surfaces', type: 'Quartz' };

  it('offers an MSI quartz', () => {
    expect(client.isSampleable(msiQuartz)).toBe(true);
  });

  it('offers Silestone, Dekton (Cosentino), Pental and LX Hausys', () => {
    for (const brand of ['silestone', 'cosentino', 'pentalquartz', 'lx-hausys', 'arizona-tile']) {
      expect(client.isSampleable({ name: 'X', brand, type: 'Quartz' })).toBe(true);
    }
  });

  it('refuses natural stone even from a sourceable brand', () => {
    expect(client.isSampleable({ name: 'Absolute Black', brand: 'msi-surfaces', type: 'Granite' })).toBe(false);
  });

  // The case js/sample-order.js got wrong: no stone word in the slug or name.
  it('refuses natural stone identified only by `type`', () => {
    expect(client.isSampleable({ name: 'White Napoli', slug: 'white-napoli', brand: 'msi-surfaces', type: 'Granite' })).toBe(false);
  });

  // The cases countertops/product.html got wrong: it tested /granite/ only.
  it('refuses marble, quartzite and travertine', () => {
    for (const type of ['Marble', 'Quartzite', 'Travertine', 'Onyx', 'Limestone']) {
      expect(client.isSampleable({ name: 'X', brand: 'msi-surfaces', type })).toBe(false);
    }
  });

  it('refuses a brand no distributor will cut a chip for', () => {
    expect(client.isSampleable({ name: 'Arizona Quartz', brand: 'bolder-image-stone', type: 'Quartz' })).toBe(false);
  });

  it('honours an explicit no-sample flag on an otherwise eligible colour', () => {
    expect(client.isSampleable({ ...msiQuartz, no_sample: true })).toBe(false);
    expect(client.isSampleable({ ...msiQuartz, tags: ['no-sample'] })).toBe(false);
  });

  it('stops offering a colour the vendor discontinued', () => {
    expect(client.isSampleable({ ...msiQuartz, active: false })).toBe(false);
    expect(client.isSampleable({ ...msiQuartz, discontinued: true })).toBe(false);
    expect(client.isSampleable({ ...msiQuartz, sample_eligible: false })).toBe(false);
  });

  it('does not require a catalog row (379 colours have none)', () => {
    expect(client.isSampleable({ ...msiQuartz, active: undefined, sample_eligible: undefined })).toBe(true);
  });

  it('refuses junk input rather than throwing', () => {
    expect(client.isSampleable(null)).toBe(false);
    expect(client.isSampleable({})).toBe(false);
  });
});

/**
 * The real dataset: whatever the client would offer, the server must accept.
 * This is the assertion that actually protects the buyer.
 */
describe('no colour is offered that checkout would refuse', () => {
  const { countertops } = require('../../../data/countertops.json');

  it('agrees with the server on all 619 colours', async () => {
    const disagreements = [];
    for (const c of countertops) {
      const offered = client.isSampleable(c);
      if (!offered) continue;
      const r = await server.validateSingleItem(
        { id: c.slug, name: `${c.name} (Sample)`, price: 1299, quantity: 1 }, null);
      if (r.validatedPrice !== server.SAMPLE_PRICE_CENTS) {
        disagreements.push(`${c.slug} (${c.brand}/${c.type}): offered, but server said ${r.unmatched?.reason}`);
      }
    }
    expect(disagreements).toEqual([]);
  });
});
