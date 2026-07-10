/**
 * Sample refusal classification.
 *
 * A granite sample being refused is the owner's sampling policy working. A
 * colour we cannot identify at all is either tampering or a lost sale. They used
 * to raise the same "possible price tampering" alarm, which trains staff to
 * ignore the one that costs money.
 *
 * `white-napoli` is the case that matters: its slug contains no stone word, but
 * its `type` is "Granite". Any rule that reads only the slug gets it wrong.
 */

const { validateSingleItem, SAMPLE_PRICE_CENTS } = require('../../validators/price-validator');

// No supabase: these colours have no catalog row, which is the point — the
// static dataset backs the allowlist.
const check = (id, name) => validateSingleItem({ id, name, price: 1299, quantity: 1 }, null);

describe('sample refusal is classified, not lumped together', () => {
  it('prices a sampleable colour at the flat sample fee', async () => {
    const r = await check('kensho-quartz', 'Kensho (Sample)');
    expect(r.validatedPrice).toBe(SAMPLE_PRICE_CENTS);
    expect(r.unmatched).toBeUndefined();
  });

  it('refuses natural stone as policy, not as tampering', async () => {
    const r = await check('absolute-black-granite', 'Absolute Black (Sample)');
    expect(r.validatedPrice).toBeNull();
    expect(r.unmatched.reason).toBe('not_sampleable');
    expect(r.unmatched.why).toMatch(/natural stone/i);
    // The buyer is told we don't sample it, not that we can't verify a price.
    expect(r.error).toMatch(/don't offer samples/i);
  });

  it('catches natural stone whose slug does not say so (type=Granite)', async () => {
    const r = await check('white-napoli', 'White Napoli (Sample)');
    expect(r.unmatched.reason).toBe('not_sampleable');
    expect(r.unmatched.why).toMatch(/natural stone/i);
  });

  it('refuses a brand no distributor will cut a chip for', async () => {
    const r = await check('arizona-quartz', 'Arizona Quartz (Sample)');
    expect(r.unmatched.reason).toBe('not_sampleable');
    expect(r.unmatched.why).toMatch(/brand/i);
  });

  it('flags an unidentifiable colour as a missing product', async () => {
    const r = await check('totally-made-up-xyz', 'Totally Made Up (Sample)');
    expect(r.validatedPrice).toBeNull();
    expect(r.unmatched.reason).toBe('no_server_price');
    expect(r.error).toMatch(/couldn't verify the price/i);
  });

  it('never trusts the client price on a sample', async () => {
    const r = await validateSingleItem(
      { id: 'kensho-quartz', name: 'Kensho (Sample)', price: 1, quantity: 1 }, null);
    expect(r.validatedPrice).toBe(SAMPLE_PRICE_CENTS);
  });
});

/**
 * Display names collide across colours and materials. The slug identifies the
 * product; a name never can. When the slug lookup missed because the colour was
 * not sampleable, the search used to continue to the name — and "White Pearl"
 * granite matched a DIFFERENT quartz colour of the same name, so we charged
 * $12.99 for a granite chip we do not stock.
 */
describe('the slug is the identity; a colliding name cannot override it', () => {
  it('refuses white-pearl-granite even though a quartz "White Pearl" exists', async () => {
    const r = await check('white-pearl-granite', 'White Pearl (Sample)');
    expect(r.validatedPrice).toBeNull();
    expect(r.unmatched.reason).toBe('not_sampleable');
  });

  it('refuses an unsourceable brand whose name matches a sourceable colour', async () => {
    const r = await check('avenza-quartz-bolder-image-stone', 'Avenza (Sample)');
    expect(r.validatedPrice).toBeNull();
    expect(r.unmatched.reason).toBe('not_sampleable');
  });

  // The fallback still has a job: a cart that carries no id at all.
  it('still resolves by name when the cart sends no id', async () => {
    const r = await validateSingleItem(
      { name: 'Kensho (Sample)', price: 1299, quantity: 1 }, null);
    expect(r.validatedPrice).toBe(SAMPLE_PRICE_CENTS);
  });

  it('falls back to the name for an unknown id, so stale slugs keep working', async () => {
    const r = await validateSingleItem(
      { id: 'kensho-quartz-v2-renamed', name: 'Kensho (Sample)', price: 1299, quantity: 1 }, null);
    expect(r.validatedPrice).toBe(SAMPLE_PRICE_CENTS);
  });
});

/**
 * The static list slugs a colour `<name>-<material>`; the catalog slugs it
 * `<name>`. `white-egeo-granite` missed its catalog row (`white-egeo`, Granite,
 * sample_eligible=false), fell through to data/countertops.json -- which called
 * it Quartz -- and checkout ACCEPTED $12.99 for a granite chip. Live, verified.
 */
describe('a `<name>-<material>` slug still finds its catalog row', () => {
  /** Minimal supabase stub: one table, exact-match .eq() only. */
  const stubCatalog = (rows) => ({
    from: () => {
      const filters = {};
      const api = {
        select: () => api,
        eq: (col, val) => { filters[col] = val; return api; },
        limit: () => api,
        maybeSingle: async () => ({
          data: rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) || null,
        }),
      };
      return api;
    },
  });

  const catalog = [
    { slug: 'white-egeo', vendor_id: 'cosentino', sample_eligible: false, active: true },
    { slug: 'arctic-ice', vendor_id: 'bolder-image-stone', sample_eligible: true, active: true },
    { slug: 'kensho-quartz', vendor_id: 'msi', sample_eligible: true, active: true },
  ];

  it('refuses white-egeo-granite via the base slug', async () => {
    const r = await validateSingleItem(
      { id: 'white-egeo-granite', name: 'White Egeo (Sample)', price: 1299, quantity: 1 },
      stubCatalog(catalog));
    expect(r.validatedPrice).toBeNull();
    expect(r.unmatched.reason).toBe('not_sampleable');
  });

  it('does not prefix-match a different stone (arctic-quartz is not arctic-ice)', async () => {
    const r = await validateSingleItem(
      { id: 'arctic-quartz', name: 'Arctic (Sample)', price: 1299, quantity: 1 },
      stubCatalog(catalog));
    // arctic-quartz has no catalog row of its own and no `arctic` base row, so it
    // must NOT inherit arctic-ice's eligibility. Whatever it resolves to, it may
    // not come from arctic-ice.
    expect(r.priceSource).not.toBe('catalog_sample');
  });

  it('still honours an exact catalog slug', async () => {
    const r = await validateSingleItem(
      { id: 'kensho-quartz', name: 'Kensho (Sample)', price: 1299, quantity: 1 },
      stubCatalog(catalog));
    expect(r.validatedPrice).toBe(SAMPLE_PRICE_CENTS);
    expect(r.priceSource).toBe('catalog_sample');
  });
});

describe('the two mislabelled granites', () => {
  it('refuses bedrock-quartz (MSI has no Bedrock quartz; it is granite)', async () => {
    const r = await check('bedrock-quartz', 'Bedrock (Sample)');
    expect(r.unmatched.reason).toBe('not_sampleable');
  });

  it('refuses white-egeo-granite from the static list alone', async () => {
    const r = await check('white-egeo-granite', 'White Egeo (Sample)');
    expect(r.unmatched.reason).toBe('not_sampleable');
  });
});
