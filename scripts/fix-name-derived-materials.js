#!/usr/bin/env node
/**
 * Correct catalog rows whose `subcategory` was derived from the COLOUR NAME
 * rather than the product.
 *
 * js/sampleable.js already refuses to read the title, because engineered
 * surfaces are routinely named after the stone they imitate. But the catalog's
 * `subcategory`/`specs.material` for these rows was SEEDED from data/slabs.json
 * and data/countertops.json (every row below has specs._source set to one of
 * them — none was vendor-scraped), so the title-derived error survives in the
 * data. `specs.material` was later backfilled FROM `subcategory`, so the two
 * agreeing is not corroboration.
 *
 * Consequence: an engineered quartz filed as "Soapstone" trips the natural-stone
 * guard, sample_eligible is false, and the Order Sample button never renders for
 * a colour the distributor will happily cut.
 *
 * Every verdict below was checked against the VENDOR'S OWN SITE (URL recorded).
 * `bedrock-quartz` is deliberately absent — see NEEDS_OWNER_RULING.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/fix-name-derived-materials.js [--write]
 *   default: dry run. --write: back up, then apply.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;

// A URL and key from different projects return PGRST205 "could not find the
// table", which reads exactly like an empty table. Resolve them as a pair.
(function assertPair() {
  if (!KEY) throw new Error('SUPABASE_SERVICE_KEY missing (api/.env)');
  const ref = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64').toString()).ref;
  const host = new URL(SUPA_URL).host.split('.')[0];
  if (ref !== host) throw new Error(`PAIR MISMATCH: url=${host} key.ref=${ref}`);
})();

const supa = createClient(SUPA_URL, KEY);

// slug -> { to, why, evidence }
const FIXES = {
  // MSI Q Quartz colours named after soapstone. MSI does sell real soapstone
  // (msisurfaces.com/soapstone-countertops/) — these are not it.
  'soapstone-mist-quartz-sample':          { to: 'Quartz', evidence: 'https://www.msisurfaces.com/quartz-countertops/soapstone-mist-quartz/ — "A soapstone-look quartz"; SKU QSL-SPSTNMIST-2CM' },
  'soapstone-mist-concrete-quartz-sample': { to: 'Quartz', evidence: 'https://www.msisurfaces.com/quartz-countertops/soapstone-mist-concrete-quartz/ — Q Premium Quartz' },
  'soapstone-metropolis-quartz-sample':    { to: 'Quartz', evidence: 'https://www.msisurfaces.com/quartz-countertops/soapstone-metropolis-quartz/ — "This quartz features long, delicate white veins"' },
  'soapstone-metropolis-concrete':         { to: 'Quartz', evidence: 'https://www.msisurfaces.com/quartz-countertops/soapstone-metropolis-concrete-quartz/ — Q Premium Quartz' },

  // PentalQuartz is an engineered quartz line (Architectural Surfaces).
  'dolce-vita-quartz-sample': { to: 'Quartz', evidence: 'https://arcsurfaces.com/final-editions/pentalquartz/dolce-vita/ — "90-93% natural quartz crystals with high-quality resins"' },
  'azul-aran-quartz-sample':  { to: 'Quartz', evidence: 'https://arcsurfaces.com/final-editions/pentalquartz/azul-aran/ — "Inspired by granite\'s naturally luxurious charm, this reinterpretation…"' },
  'arctic-quartz-sample':     { to: 'Quartz', evidence: 'https://arcsurfaces.com/quartz/pentalquartz/ — "Arctic Pental is a quartz material"' },
  'cappuccino-quartz-sample': { to: 'Quartz', evidence: 'https://arcsurfaces.com/final-editions/pentalquartz/cappuccino/ — PentalQuartz SKU BQ9310P' },
  'avalanche-quartz-sample':  { to: 'Quartz', evidence: 'https://arcsurfaces.com/quartz/pentalquartz/avalanche/ — "Avalanche Pental is a quartz material"' },

  // Silestone is Cosentino's engineered quartz brand (Sensa/Scalea are the
  // natural-stone lines). Canonical /usa/colors/silestone/ URL path.
  'lagoon-quartz-sample':            { to: 'Quartz', evidence: 'https://www.cosentino.com/usa/colors/silestone/lagoon/ — Silestone Nebula series, HybriQ+' },
  'charcoal-soapstone-quartz-sample': { to: 'Quartz', evidence: 'https://www.cosentino.com/usa/colors/silestone/charcoal-soapstone/ — "inspired by the popular \'soap stone\'"' },

  // HanStone (Hyundai L&C) makes quartz and porcelain only — no natural stone.
  // All 8 are currently inactive (no pricing), so this changes nothing visible;
  // it stops the wrong material from being re-published if they ever relist.
  'hanstone-storm-quartz':          { to: 'Quartz', evidence: 'https://www.hanstone.ca/en/who-hanstone — "Canada\'s Premier Quartz surfaces brand"' },
  'hanstone-matterhorn-quartz':     { to: 'Quartz', evidence: 'https://hanstoneusa.com/colors/matterhorn' },
  'hanstone-fusion-quartz':         { to: 'Quartz', evidence: 'https://hanstoneusa.com/colors/fusion' },
  'hanstone-chantilly-quartz':      { to: 'Quartz', evidence: 'https://hyundailncusa.com/hanstone-quartz-featured-colors' },
  'hanstone-tahitian-cream-quartz': { to: 'Quartz', evidence: 'https://www.hanstone.ca/en/colours-hanstone/tahitian-cream — filed under "Quartz"' },
  'hanstone-calacatta-gold-quartz': { to: 'Quartz', evidence: 'https://hanstoneusa.com/colors/calacatta-gold' },
  'hanstone-patagonia-quartz':      { to: 'Quartz', evidence: 'https://hanstoneusa.com/colors/patagonia' },
  'hanstone-shangri-la-quartz':     { to: 'Quartz', evidence: 'https://hanstoneusa.com/colors/shangri-la' },

  // Bolder Image Stone sells an engineered quartz line as well as natural stone;
  // its own product pages say "This quartz…". Bolder is a local yard, so these
  // stay non-sampleable regardless of material.
  'emerald-quartz':                        { to: 'Quartz',  evidence: 'https://bolderimagestone.com/products/emerald/ — "This quartz features striking gray veining on a white base"' },
  'calacatta-macchia-vecchia-quartz':      { to: 'Quartz',  evidence: 'https://bolderimagestone.com/products/macchia-vecchia-2/ — "This quartz features bold, flowing veining"' },
  'white-pearl-quartz-bolder-image-stone': { to: 'Quartz',  evidence: 'https://bolderimagestone.com/products/white-pearl/ — "This quartz features a polished white canvas"' },
  // The one row where the legacy file was right and the catalog was wrong.
  'astoria':                               { to: 'Granite', evidence: 'https://bolderimagestone.com/products/astoria/ — heading "Granite"' },

  // Arizona Tile's Della Terra is engineered quartz, not quartzite.
  'apollo-quartz': { to: 'Quartz', evidence: 'https://www.arizonatile.com/products/slab-outlet/quartz/prescott-az/apollo-slab/ — "cream-colored quartz… part of the Della Terra Quartz line"' },
};

// Verified CORRECT as-is; listed so a later pass does not re-litigate them.
// nuage: https://www.arizonatile.com/products/slab/quartzite/nuage/ — genuinely quartzite.

// Rows I will NOT touch without Josh. Printed on every run so they stay visible.
const NEEDS_OWNER_RULING = {
  'bedrock-quartz':
    'Catalog says Granite. msisurfaces.com/granite-countertops/bedrock/ 404s and MSI site search '
  + 'lists no Bedrock granite; /quartz-countertops/bedrock-quartz/ is a DISCONTINUED notice for '
  + '"Bedrock Brown" quartz. Neither Granite nor a sellable Quartz. Under the don\'t-advertise-'
  + 'discontinued rule this row wants retiring (specs.discontinued=true), not reclassifying.',
  'gold-rush-quartz':
    'Bolder has no product page (/products/gold-rush/ 404s, absent from their catalogue index). '
  + 'Already inactive. Retire candidate rather than a material fix.',
  'bianco-carrara-quartz':
    'Classic Surfaces\' gallery labels it "BIANCO CARRARA Quartz", separate from their "WHITE '
  + 'CARRARA Marble" — but that is a gallery tile caption, not a product page (they have none), '
  + 'and Bianco Carrara is a famous MARBLE name. Catalog says Marble. Not confident enough to flip.',
  'cristallo-quartz':
    'Same source and same caveat: gallery caption says "CRISTALLO Quartz"; Cristallo is a famous '
  + 'QUARTZITE name. Catalog says Quartzite. Not confident enough to flip.',
};

// Samples are cut only by the national distributors (Josh): MSI, Arizona Tile,
// Daltile, Cosentino, Architectural Surfaces. PentalQuartz files under
// vendor_id 'pentalquartz' but is supplied by ASG, so it counts.
const SAMPLE_VENDOR_IDS = new Set(['msi', 'arizona-tile', 'daltile', 'cosentino', 'arcsurfaces', 'pentalquartz']);

// Mirrors NATURAL_STONE_RX in js/sampleable.js. Never a sample: every lot differs.
const NATURAL_STONE_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious/i;

(async () => {
  const write = process.argv.includes('--write');
  const slugs = Object.keys(FIXES);

  const { data: rows, error } = await supa.from('catalog_products')
    .select('id, slug, name, vendor_id, brand, subcategory, specs, active, sample_eligible')
    .in('slug', slugs);
  if (error) throw error;
  if (!rows.length) throw new Error('zero rows returned — check the URL/key pair');

  const found = new Set(rows.map((r) => r.slug));
  const missing = slugs.filter((s) => !found.has(s));
  if (missing.length) console.warn('!! slug(s) not in catalog:', missing.join(', '));

  const plan = [];
  for (const r of rows) {
    const to = FIXES[r.slug].to;
    // Sampleable only if a national distributor supplies it AND the corrected
    // material is engineered. Keying on vendor alone would have offered a chip
    // for `astoria` once it was reclassified to Granite.
    const eligible = SAMPLE_VENDOR_IDS.has(r.vendor_id) && !NATURAL_STONE_RX.test(to);
    const changes = {};
    if (r.subcategory !== to) changes.subcategory = to;
    if (!r.specs || r.specs.material !== to) changes.specs = { ...(r.specs || {}), material: to, material_source: 'vendor-site-verified' };
    if (r.sample_eligible !== eligible) changes.sample_eligible = eligible;
    if (Object.keys(changes).length) plan.push({ row: r, changes });
  }

  console.log(`\n${rows.length} rows fetched, ${plan.length} need changes\n`);
  for (const { row, changes } of plan) {
    const bits = [];
    if (changes.subcategory) bits.push(`subcategory ${row.subcategory} -> ${changes.subcategory}`);
    if (changes.sample_eligible !== undefined) bits.push(`sample_eligible ${row.sample_eligible} -> ${changes.sample_eligible}`);
    console.log(`  ${row.slug.padEnd(40)} [${row.vendor_id}, active=${row.active}]`);
    console.log(`     ${bits.join('  |  ')}`);
  }

  const gained = plan.filter(({ row, changes }) => changes.sample_eligible === true && row.active);
  console.log(`\nactive rows that will GAIN an Order Sample button: ${gained.length}`);
  gained.forEach(({ row }) => console.log(`   + ${row.slug}`));

  console.log('\n--- NOT touched, needs owner ruling ---');
  for (const [slug, why] of Object.entries(NEEDS_OWNER_RULING)) console.log(`  ${slug}: ${why}\n`);

  if (!write) { console.log('DRY RUN — add --write'); process.exit(0); }

  const dir = path.join(process.env.HOME, 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `catalog-materials-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(rows, null, 1));
  console.log('backup:', backup);

  let ok = 0;
  for (const { row, changes } of plan) {
    const { error: e } = await supa.from('catalog_products')
      .update({ ...changes, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (e) console.error('  FAIL', row.slug, e.message); else ok++;
  }
  console.log(`updated ${ok}/${plan.length}`);
  process.exit(ok === plan.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
