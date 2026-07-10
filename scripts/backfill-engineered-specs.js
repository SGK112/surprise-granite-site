#!/usr/bin/env node
/**
 * Give every engineered slab the specs its vendor publishes: thickness, finish,
 * and a slab size.
 *
 * 1,870 of 2,401 active slabs had no dimensions and 55% had no thickness, so the
 * spec card read "Material: Quartz" and nothing else.
 *
 * An engineered surface is manufactured to a spec, so the brand's published
 * figures ARE the product's figures. Natural stone is not: every block is sawn
 * differently, so a granite's size is a property of the SLAB, not of the colour.
 * This script therefore touches engineered rows only and never invents a
 * dimension for natural stone.
 *
 * `uniform` records whether the vendor publishes ONE size for the whole line:
 *
 *   uniform   Dekton (3200x1440mm, "approximately", ±2mm), Silestone (two brand
 *             formats), PentalQuartz (119x55 base; XL is colour-restricted).
 *   typical   MSI publishes NO single dimension — its own word is "typically
 *             126x64 or 130x65". LX Viatera assigns each colour Jumbo I (63x126)
 *             or Jumbo II (63x130). Caesarstone gives some colours a jumbo.
 *             Della Terra gives some colours a super jumbo.
 *
 * A typical slab_size is written with a literal " (typ.)" suffix, so the customer
 * sees the caveat. It cannot be carried in a separate specs key: the public API
 * allowlist (api/routes/catalog.js) withholds anything not explicitly listed, and
 * its test forbids any key matching /source/ from ever entering that list. So the
 * caveat lives in the value. Provenance is stored under `_dims_source` /
 * `_dims_reference`, which the allowlist withholds by construction (leading `_`).
 *
 * Never claim a measured size we do not have — but do not leave the card empty
 * either: for an engineered surface the typical IS the answer for all but a
 * handful of colours, and replacing a wrong thing with an empty thing is a
 * regression, not a fix.
 *
 * slab_sqft is DERIVED from the size (no vendor publishes it) and only written
 * alongside a size. The page already renders it as "~N sq ft".
 *
 * Existing values are never overwritten: The Yard measures each physical slab.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/backfill-engineered-specs.js [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
(function assertPair() {
  if (!KEY) throw new Error('SUPABASE_SERVICE_KEY missing (api/.env)');
  const ref = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64').toString()).ref;
  const host = new URL(SUPA_URL).host.split('.')[0];
  if (ref !== host) throw new Error(`PAIR MISMATCH: url=${host} key.ref=${ref}`);
})();
const supa = createClient(SUPA_URL, KEY);

const NATURAL_STONE_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious/i;

// Each entry is what the VENDOR publishes. `match` picks the rows it applies to.
const STANDARDS = [
  {
    brand: 'Dekton by Cosentino', uniform: true,
    match: (r) => r.brand === 'Dekton by Cosentino',
    slab_size: '126" x 57"', thickness: '8mm, 12mm, 20mm', finish: 'Matte',
    source: 'https://content.cosentino.com/dekton/documents/technical/Technical%20Manual/dekton-technical-manual-EN.pdf'
         + ' — "a useful surface of approximately 3200 mm long and 1440 mm wide"',
  },
  {
    brand: 'Silestone by Cosentino', uniform: true,
    match: (r) => r.brand === 'Silestone by Cosentino',
    slab_size: '120" x 54"', thickness: '1.2cm, 2cm, 3cm', finish: 'Polished',
    source: 'https://content.cosentino.com/silestone/documents-usa/For%20The%20Trade/Technical%20Specs/SlabSizes.pdf'
         + ' — 137cm (54") x 305cm (120") standard; jumbo 160x325cm. "Standard Finish: Polished"',
  },
  {
    brand: 'PentalQuartz', uniform: true,
    match: (r) => r.vendor_id === 'pentalquartz',
    slab_size: '119" x 55"', thickness: '2cm, 3cm', finish: 'Polished',
    source: 'https://arcsurfaces.com/wp-content/uploads/2022/08/PentalQuartz-Installation-Manual-March2021-UPDATED.pdf'
         + ' — "3000mm x 1400mm (119 x 55)"; XL 130x65 is select colours only',
  },
  {
    brand: 'MSI Surfaces (quartz)', uniform: false,
    match: (r) => r.vendor_id === 'msi',
    slab_size: '130" x 65"', thickness: '2cm, 3cm', finish: 'Polished',
    source: 'https://www.msisurfaces.com/blogs/post/2025/12/01/why-super-jumbo-slabs-a-deep-dive-into-rusta-and-belaros-quartz.aspx'
         + ' — "standard slab sizes—typically 126" x 64" or 130" x 65"". MSI publishes no uniform figure.',
  },
  {
    brand: 'LX Viatera', uniform: false,
    match: (r) => /^LX (Viatera|Hausys)$/i.test(String(r.brand)),
    slab_size: '126" x 63"', thickness: '2cm, 3cm', finish: 'Polished',
    source: 'VIATERA Pamphlet (img.lxhausys.com) — "Jumbo I : 63" x 126"… Jumbo II : 63" x 130"".'
         + ' Each colour is one or the other; 126x63 is the smaller.',
  },
  {
    brand: 'Caesarstone', uniform: false,
    match: (r) => r.vendor_id === 'caesarstone',
    slab_size: '120" x 56.7"', thickness: '2cm, 3cm', finish: 'Polished',
    source: 'https://www.caesarstoneus.com/pro-site/slab-dimensions-and-edge-details/'
         + ' — standard 144 x 305 cm; jumbo 164x327cm on some colours only',
  },
  {
    brand: 'Arizona Tile — Della Terra quartz', uniform: false,
    match: (r) => r.vendor_id === 'arizona-tile',
    slab_size: '126" x 63"', thickness: '2cm, 3cm', finish: 'Polished',
    source: 'Della Terra per-colour PIS (media.arizonatile.com) — "STOCKED SLAB SIZE 126" x 63""; '
         + 'super jumbo 138x79 on select colours',
  },
];

// "126\" x 57\"" -> 49.9
function sqftFrom(size) {
  const m = String(size).match(/([\d.]+)"?\s*[x×]\s*([\d.]+)/);
  if (!m) return null;
  return Math.round((Number(m[1]) * Number(m[2])) / 144 * 10) / 10;
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, slug, name, vendor_id, brand, subcategory, specs, size, active')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  if (!rows.length) throw new Error('zero rows — check the URL/key pair');

  const plan = [];
  const skippedNatural = [];
  for (const r of rows) {
    const specs = r.specs || {};
    const material = String(specs.material || r.subcategory || '');
    if (NATURAL_STONE_RX.test(material)) { skippedNatural.push(r); continue; }
    const std = STANDARDS.find((s) => s.match(r));
    if (!std) continue;

    const next = { ...specs };
    const changed = [];
    // Never overwrite: The Yard measures each physical slab.
    // Thickness and finish are the vendor's published options for the whole
    // line, so they are accurate for every colour in it.
    if (!specs.thickness) { next.thickness = std.thickness; changed.push('thickness'); }
    if (!specs.finish) { next.finish = std.finish; changed.push('finish'); }
    if (!specs.slab_size && !r.size) {
      next.slab_size = std.uniform ? std.slab_size : `${std.slab_size} (typ.)`;
      changed.push('slab_size');
      const sq = sqftFrom(std.slab_size);
      if (sq && specs.slab_sqft == null) { next.slab_sqft = sq; changed.push('slab_sqft'); }
    }
    if (!changed.length) continue;
    next._dims_source = std.uniform ? 'brand-standard' : 'brand-typical';
    next._dims_reference = std.source;
    plan.push({ r, next, changed, std });
  }

  const byBrand = {};
  plan.forEach(({ std, changed }) => {
    byBrand[std.brand] ||= { rows: 0, uniform: std.uniform, fields: {} };
    byBrand[std.brand].rows++;
    changed.forEach((c) => (byBrand[std.brand].fields[c] = (byBrand[std.brand].fields[c] || 0) + 1));
  });

  console.log(`active slabs: ${rows.length}   natural stone skipped: ${skippedNatural.length}   to update: ${plan.length}\n`);
  for (const [b, v] of Object.entries(byBrand)) {
    console.log(`  ${b}  [${v.uniform ? 'brand-standard' : 'brand-typical'}]  ${v.rows} rows`);
    console.log(`     ${Object.entries(v.fields).map(([k, n]) => `${k}:${n}`).join('  ')}`);
  }

  const engineeredNoStd = rows.filter((r) => {
    const m = String((r.specs || {}).material || r.subcategory || '');
    return !NATURAL_STONE_RX.test(m) && !STANDARDS.find((s) => s.match(r));
  });
  const nsv = {};
  engineeredNoStd.forEach((r) => (nsv[r.vendor_id] = (nsv[r.vendor_id] || 0) + 1));
  console.log(`\nengineered rows with NO researched standard (left empty, not guessed): ${engineeredNoStd.length}`);
  console.log('  ', JSON.stringify(nsv));

  if (!write) { console.log('\nDRY RUN — add --write'); process.exit(0); }

  const dir = path.join(process.env.HOME, 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `engineered-specs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(plan.map(({ r }) => r), null, 1));
  console.log('backup:', backup);

  let ok = 0;
  for (const { r, next } of plan) {
    const { error } = await supa.from('catalog_products')
      .update({ specs: next, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) console.error('  FAIL', r.slug, error.message); else ok++;
  }
  console.log(`updated ${ok}/${plan.length}`);
  process.exit(ok === plan.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
