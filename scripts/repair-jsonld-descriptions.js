#!/usr/bin/env node
/**
 * Repair product descriptions that captured a vendor's JSON-LD instead of their copy.
 *
 * VIGO puts a <script type="application/ld+json"> Product schema at the top of
 * body_html. The importer's stripHtml removed <style> blocks and every TAG, but
 * not a <script> block's CONTENTS — so the schema's text survived, won the
 * "longest description wins" tie-break on the product page, and 206 products
 * showed a customer a truncated blob of JSON where the description should be:
 *
 *   { "@context": "https://schema.org/", "@type": "Product", "name": "Dilana …
 *
 * The importer is fixed (import-shopify-vendor-catalog.js), which stops it
 * recurring; this repairs the rows already written. Of VIGO's 614 products 323
 * have real copy behind the bad strip — those get it. The other 291, VG08001
 * among them, publish NOTHING but the schema, so their description is nulled
 * and the page falls back to the short_description we write ourselves.
 *
 * Usage: node scripts/repair-jsonld-descriptions.js [--write]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing from .env.local'); process.exit(1); }
const psql = (sql) => execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
  { maxBuffer: 1 << 28 }).toString();

// The strip the importer should have had: script and style blocks go WITH their
// contents, because a stripped <script> tag leaves its payload behind as text.
const strip = (h) => String(h || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const bad = psql(
  `select id, coalesce(vendor_id,''), coalesce(sku,'')
     from catalog_products
    where description like '%@context%' or description like '%schema.org%'`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, vendor_id, sku] = l.split('|');
  return { id, vendor_id, sku: sku.toUpperCase() };
});
console.log(`rows with JSON-LD in description: ${bad.length}`);
if (!bad.length) process.exit(0);
const byVendor = bad.reduce((m, r) => (m[r.vendor_id] = (m[r.vendor_id] || 0) + 1, m), {});
console.log('by vendor:', byVendor);

// VIGO is the only affected vendor, and their live feed still carries the copy
// the bad strip threw away. Pull it back rather than nulling 323 good rows.
const copy = new Map();
if (byVendor.vigo) {
  for (let page = 1; page <= 4; page++) {
    const raw = execFileSync('curl', ['-sL', '-m', '45', '-A',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      `https://www.vigoindustries.com/products.json?limit=250&page=${page}`], { maxBuffer: 1 << 27 }).toString();
    let products = [];
    try { products = JSON.parse(raw).products || []; } catch { break; }
    if (!products.length) break;
    for (const p of products) {
      const text = strip(p.body_html).slice(0, 600);
      for (const v of p.variants || []) {
        const sku = String(v.sku || '').trim().toUpperCase();
        if (sku && text.length >= 40) copy.set(sku, text);
      }
    }
    execFileSync('sleep', ['2']);
  }
  console.log(`VIGO feed: recovered real copy for ${copy.size} skus`);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const restored = bad.filter((r) => copy.has(r.sku));
const nulled = bad.filter((r) => !copy.has(r.sku));
console.log(`restore real description: ${restored.length}`);
console.log(`null (vendor publishes only schema, page falls back to short_description): ${nulled.length}`);

if (!WRITE) { console.log('\nDry run — nothing written.'); process.exit(0); }

const sql = [`begin;`];
if (restored.length) {
  sql.push(`update catalog_products c set description = v.d, updated_at = now()
              from (values ${restored.map((r) => `('${r.id}'::uuid, ${q(copy.get(r.sku))})`).join(',\n                ')}) as v(id, d)
             where c.id = v.id;`);
}
if (nulled.length) {
  sql.push(`update catalog_products set description = null, updated_at = now()
             where id in (${nulled.map((r) => `'${r.id}'::uuid`).join(', ')});`);
}
sql.push('commit;');
const f = path.join(require('os').tmpdir(), `desc-repair-${Date.now()}.sql`);
fs.writeFileSync(f, sql.join('\n'));
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
console.log(`\nrepaired ${bad.length} descriptions`);
