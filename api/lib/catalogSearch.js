/**
 * ONE catalog search filter, shared by the public catalog and the admin Catalog
 * Manager.
 *
 * They drifted before, and the drift was expensive: the storefront searched the
 * live catalog while /admin/products searched the retired `shopify_products`
 * table, so a product a customer had just BOUGHT could not be found by the
 * owner looking for it. Same rows, same filter, both screens.
 *
 * Matching is per WORD, not per phrase. Brand lives in `brand` and the product
 * in `name`, so requiring the whole query inside one column meant the natural
 * search — brand then product, "Vigo Dilana" — returned nothing while either
 * half alone worked.
 */

// A PostgREST or-filter is comma/paren delimited, so those characters in a
// query would otherwise break out of the value and into the filter grammar.
const clean = (s) => String(s || '').replace(/[(),*]/g, ' ').trim();

const COLUMNS = ['name', 'brand', 'sku', 'subcategory', 'short_description'];

/**
 * @param q       a supabase-js query builder over catalog_products
 * @param search  the raw user query
 * @returns       the builder, with one AND'd or-group per word (8 words max —
 *                past that the URL grows without making the result narrower)
 */
function applyCatalogSearch(q, search) {
  const s = clean(search);
  if (!s) return q;
  for (const token of s.split(/\s+/).filter(Boolean).slice(0, 8)) {
    q = q.or(COLUMNS.map((c) => `${c}.ilike.%${token}%`).join(','));
  }
  return q;
}

module.exports = { applyCatalogSearch, COLUMNS };
