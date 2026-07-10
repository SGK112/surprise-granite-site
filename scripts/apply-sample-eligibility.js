#!/usr/bin/env node
/**
 * Recompute catalog_products.sample_eligible for every slab from ONE rule.
 *
 * Owner rule (Josh):
 *   - Samples are cut by the national distributors only: MSI, Arizona Tile,
 *     Daltile, Cosentino, Architectural Surfaces. PentalQuartz is supplied by
 *     ASG but files under vendor_id 'pentalquartz'.
 *   - LX Hausys IS LX Viatera, distributed through MONTERREY TILE, and we CAN
 *     sell LX samples. It is NOT HanStone. HanStone is a separate brand and a
 *     local yard: no chips.
 *   - Never natural stone. Every lot is unique, so a 4x4 chip misrepresents it.
 *   - Never a discontinued colour.
 *
 * The supplier therefore cannot be read off vendor_id alone: LX Viatera's rows
 * carry vendor_id 'monterrey-tile' (the distributor) and brand 'LX Viatera'
 * (the manufacturer). Keying on vendor_id hid the button on all 63 of them,
 * even though the catalog already flagged them eligible and the server already
 * accepted them at checkout — a silently lost sale on every one.
 *
 * The server reads this column at checkout (api/validators/price-validator.js),
 * so it is the authority. js/sampleable.js must agree.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/apply-sample-eligibility.js [--write]
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
const SAMPLE_VENDOR_IDS = new Set(['msi', 'arizona-tile', 'daltile', 'cosentino', 'arcsurfaces', 'pentalquartz']);
// Manufacturers whose chips reach us through a distributor whose vendor_id is
// NOT itself sampleable. Matched on the brand column.
const SAMPLE_BRAND_RX = /^lx (viatera|hausys)$/i;

// `active` is NOT part of this. The column answers "would we cut a chip for this
// colour", and the server ANDs `active` itself when it looks the row up. Folding
// visibility in here would erase the answer for every hidden colour and silently
// re-derive it if the colour came back.
function eligible(r) {
  if (r.specs && r.specs.discontinued) return false;
  const material = String((r.specs && r.specs.material) || r.subcategory || '');
  if (NATURAL_STONE_RX.test(material)) return false;
  return SAMPLE_VENDOR_IDS.has(r.vendor_id) || SAMPLE_BRAND_RX.test(String(r.brand || ''));
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, slug, name, vendor_id, brand, subcategory, specs, active, sample_eligible, sample_price')
      .eq('category', 'slab').order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  if (!rows.length) throw new Error('zero rows — check the URL/key pair');

  const plan = rows
    .map((r) => ({ r, want: eligible(r) }))
    .filter(({ r, want }) => r.sample_eligible !== want);

  const on = plan.filter((p) => p.want);
  const off = plan.filter((p) => !p.want);
  console.log(`slab rows: ${rows.length}   changes: ${plan.length}  (+${on.length} enable / -${off.length} disable)\n`);

  const group = (list) => {
    const g = {};
    list.forEach(({ r }) => {
      const k = `${r.vendor_id} / ${r.brand} / ${r.subcategory} / active=${r.active}`;
      g[k] = (g[k] || 0) + 1;
    });
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  };
  console.log('ENABLE:');  group(on).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}x  ${k}`));
  console.log('\nDISABLE:'); group(off).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}x  ${k}`));

  const activeOn = on.filter(({ r }) => r.active);
  console.log(`\nACTIVE rows gaining a live Order Sample button: ${activeOn.length}`);

  if (!write) { console.log('\nDRY RUN — add --write'); process.exit(0); }

  const dir = path.join(process.env.HOME, 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `sample-eligibility-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(plan.map(({ r }) => r), null, 1));
  console.log('backup:', backup);

  let ok = 0;
  for (const { r, want } of plan) {
    const { error } = await supa.from('catalog_products').update({
      sample_eligible: want,
      // The flat fee belongs only to a colour we will actually cut.
      sample_price: want ? (r.sample_price != null ? r.sample_price : 12.99) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) console.error('  FAIL', r.slug, error.message); else ok++;
  }
  console.log(`updated ${ok}/${plan.length}`);
  process.exit(ok === plan.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
