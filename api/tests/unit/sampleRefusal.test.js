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
