/**
 * /api/catalog/:slug is public. It must never ship dealer cost, margin, MSRP,
 * stock levels, or scraper provenance.
 *
 * This guard used to be a DENY regex, and a blocklist on a public endpoint fails
 * open. It caught `cost_basis` and `msrp` but shipped `sqft_price`, which EQUALS
 * vendor_cost on 1,020 slabs. We had removed dealer cost from retail_price and
 * were still publishing it inside `specs`.
 *
 * The list below is every specs key present in the catalog on 2026-07-10. Any
 * key not explicitly allowed must be withheld — including ones invented later by
 * a scraper, which is the case a blocklist can never cover.
 */

const { publicSpecs, PUBLIC_SPEC_KEYS } = require('../../routes/catalog');

// Observed in production: `select distinct jsonb_object_keys(specs)`.
const ALL_KEYS_IN_CATALOG = [
  '_source', 'material', 'imported_at', 'slug', 'thickness', 'margin_pct',
  'markup_x', 'sample_pricing', 'sqft_price', 'msrp', 'crawled_at', 'alfi_stock',
  'cost_basis', 'each_price', 'slab_sqft', 'brandTier', 'origin', 'piece_size',
  'piece_sqft', 'yard_product_id', 'yard_location', 'finish', 'slab_size',
  'style', 'accentColor', 'odoo_template_id', 'lots', 'ruvati_sku',
  'stock_synced_at', 'ruvati_qty', 'ruvati_eta', 'collection', 'handle',
  'published_at', 'shopify_id', 'desc_source', 'desc_source_url', 'sf_per_box',
  'wear_layer', 'line', 'yard_product_ids', 'slab_count', 'mpn', 'price_source',
  'image_source', 'product_line', 'image2_source', 'printed_quartz', 'closeout',
  'image_source_url', 'msi_verified', 'msi_price_sqft', 'msi_itemno',
];

// Anything that reveals what we pay, what we make, or what we hold.
const FORBIDDEN = /price|cost|margin|markup|msrp|profit|wholesale|dealer|stock|qty|count|lot|_at$|^_|source|shopify|odoo|yard_|handle|slug|sku|itemno|mpn|verified|brand_?tier|sample_pricing/i;

describe('publicSpecs withholds everything not explicitly allowed', () => {
  it('drops sqft_price — it equals vendor_cost on 1,020 slabs', () => {
    const out = publicSpecs({ material: 'Quartzite', sqft_price: 38.73 });
    expect(out).toEqual({ material: 'Quartzite' });
  });

  it('drops every inside-information key present in the catalog', () => {
    const input = Object.fromEntries(ALL_KEYS_IN_CATALOG.map((k) => [k, 'x']));
    const out = publicSpecs(input);
    const leaked = Object.keys(out).filter((k) => FORBIDDEN.test(k));
    expect(leaked).toEqual([]);
  });

  it('keeps the specs a customer actually needs', () => {
    const input = Object.fromEntries(ALL_KEYS_IN_CATALOG.map((k) => [k, 'x']));
    const out = publicSpecs(input);
    expect(Object.keys(out).sort()).toEqual(
      ['accentColor', 'collection', 'finish', 'line', 'material', 'origin',
        'piece_size', 'piece_sqft', 'printed_quartz', 'product_line', 'sf_per_box',
        'slab_size', 'slab_sqft', 'style', 'thickness', 'wear_layer'].sort()
    );
  });

  it('withholds a key no one has seen before (fails closed)', () => {
    const out = publicSpecs({ material: 'Quartz', supplier_secret_rebate: 0.12 });
    expect(out.supplier_secret_rebate).toBeUndefined();
    expect(out.material).toBe('Quartz');
  });

  it('allows no forbidden key into the allowlist itself', () => {
    const bad = [...PUBLIC_SPEC_KEYS].filter((k) => FORBIDDEN.test(k));
    expect(bad).toEqual([]);
  });

  it('handles an empty or odd specs object', () => {
    expect(publicSpecs({})).toEqual({});
  });
});
