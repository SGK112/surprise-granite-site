#!/usr/bin/env node
/**
 * Turn off sample_eligible for products we cannot actually source a sample for.
 *
 * Samples run only through the national distributors. Everything else is a
 * local yard that does not cut chips, so offering a sample there sells an order
 * we cannot fill.
 *
 * Only ever DISABLES. Never enables — turning a sample on is a sourcing
 * decision, not something a script should infer.
 *
 *   node scripts/apply-sample-scrub.js            # dry run
 *   node scripts/apply-sample-scrub.js --write    # apply (backs up first)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// PentalQuartz is distributed by Architectural Surfaces (owner, 2026-07-09);
// its catalog rows are still filed under their own vendor_id.
const SAMPLE_DISTRIBUTORS = new Set([
  'msi', 'arizona-tile', 'daltile', 'cosentino', 'arcsurfaces', 'pentalquartz',
]);

const NATURAL_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious|natural stone/i;

const WRITE = process.argv.includes('--write');
const BACKUP_DIR = path.join(os.homedir(), 'sg-backups');
const BACKUP = path.join(BACKUP_DIR, 'sample_eligible_before_scrub.json');

const { SUPABASE_URL: U, SUPABASE_SERVICE_KEY: K } = process.env;
if (!U || !K) { console.error('need SUPABASE_URL and SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

async function fetchAll(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${U}/rest/v1/catalog_products?${query}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

(async () => {
  const eligible = await fetchAll('select=id,slug,name,vendor_id,category,subcategory,sample_eligible&sample_eligible=eq.true&active=eq.true');
  const disable = eligible.filter((r) => !SAMPLE_DISTRIBUTORS.has(r.vendor_id));
  const keep = eligible.filter((r) => SAMPLE_DISTRIBUTORS.has(r.vendor_id));
  const naturalKept = keep.filter((r) => NATURAL_RX.test(r.subcategory || ''));

  const tally = (rows, key) => Object.entries(rows.reduce((m, r) => (m[r[key] || '?'] = (m[r[key] || '?'] || 0) + 1, m), {}))
    .sort((a, b) => b[1] - a[1]);

  console.log(`mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);
  console.log(`sample_eligible rows (active) : ${eligible.length}`);
  console.log(`  keep  (distributor)         : ${keep.length}`);
  console.log(`  DISABLE (not a distributor) : ${disable.length}\n`);
  console.log('disable, by vendor:');
  tally(disable, 'vendor_id').forEach(([v, n]) => console.log(`  ${String(v).padEnd(22)}${n}`));
  console.log('\ndisable, by category:');
  tally(disable, 'category').forEach(([c, n]) => console.log(`  ${String(c).padEnd(22)}${n}`));

  if (naturalKept.length) {
    console.log(`\nNOTE: ${naturalKept.length} natural-stone rows from distributors stay eligible`);
    console.log('      (owner rule says no natural stone, but these are tile — left alone):');
    naturalKept.slice(0, 4).forEach((r) => console.log(`  ${r.slug.padEnd(42)} ${r.vendor_id}  ${r.subcategory}`));
  }

  if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.\n'); return; }
  if (!disable.length) { console.log('\nnothing to do.\n'); return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(BACKUP, JSON.stringify(eligible.map((r) => ({ id: r.id, slug: r.slug, sample_eligible: true })), null, 1));
  console.log(`\nbackup: ${BACKUP} (${eligible.length} rows, all currently true)`);

  let done = 0;
  const CHUNK = 100;
  for (let i = 0; i < disable.length; i += CHUNK) {
    const ids = disable.slice(i, i + CHUNK).map((r) => r.id);
    const res = await fetch(`${U}/rest/v1/catalog_products?id=in.(${ids.join(',')})`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ sample_eligible: false }),
    });
    if (!res.ok) { console.error(`chunk failed: ${res.status} ${await res.text()}`); process.exit(1); }
    done += (await res.json()).length;
    process.stdout.write(`\r  updated ${done}/${disable.length}`);
  }
  console.log('');

  const after = await fetchAll('select=id,vendor_id&sample_eligible=eq.true&active=eq.true');
  const stragglers = after.filter((r) => !SAMPLE_DISTRIBUTORS.has(r.vendor_id));
  console.log(`\nverify: sample_eligible now ${after.length} (expected ${keep.length})`);
  console.log(`        non-distributor rows still eligible: ${stragglers.length} (expected 0)`);
  if (after.length !== keep.length || stragglers.length) { console.error('MISMATCH — investigate before trusting.'); process.exit(1); }
  console.log('\nDONE.\n');
})().catch((e) => { console.error(e); process.exit(1); });
