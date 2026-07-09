#!/usr/bin/env node
/**
 * Write real dealer cost from the CRM price library into
 * catalog_products.vendor_cost.
 *
 *   MONGODB_URI=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *     node scripts/sync-vendor-cost.js [--write] [--vendor msi]
 *
 * Writes vendor_cost ONLY. retail_price is a pricing decision, not a data fix:
 * on slabs it currently EQUALS vendor_cost (the retired sample-price=$/sqft
 * scheme), so the marketplace publishes dealer cost as a /sqft price. Changing
 * it is the owner's call — this script reports what it would become at each
 * vendor's configured markup and changes nothing.
 *
 * Excludes `<colour>-sample` rows: those are sample chips priced at a flat
 * $12.99, not slabs, and a slab cost written onto them would be wrong.
 */

const path = require('path');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));

// catalog vendor_id -> vendor string(s) in the price library
const VENDOR_MAP = {
  'msi': ['MSI'], 'cosentino': ['Cosentino'], 'arizona-tile': ['Arizona Tile'],
  'daltile': ['Daltile'], 'arcsurfaces': ['Architectural Surfaces (ASG)'],
  'bolder-image-stone': ['Bolder Image Stone'], 'cactus-stone': ['Cactus Stone & Tile'],
  'sun-stone': ['Sun Stone'], 'gila': ['Gila'], 'esi': ['ESI'],
  'monterrey-tile': ['Monterrey Tile'],
};

// Cosentino's own brands arrive on a distributor's sheet, so their library rows
// carry that distributor's vendor string. Match those by brand name instead.
const BRAND_RX = { 'cosentino': /^(silestone|dekton|sensa|scalea)\b/i };

const THICK_RX = /\b\d{1,2}(?:\.\d)?\s*(?:cm|mm)\b/gi;
const FINISH_RX = /\b(polished|honed|matte|matt|suede|leathered|satin|brushed|textured|natural|volcano|velvet|dual|caressed|lava)\b/gi;
const BRAND_STRIP_RX = /\b(silestone|dekton|sensa|scalea|by cosentino|cosentino|msi|pental ?quartz|pental|viatera|hanstone|caesarstone)\b/gi;
const MAT_RX = /\b(quartz|quartzite|granite|marble|porcelain|dekton|slab|tile)\b/gi;

const norm = (n) => String(n || '').toLowerCase()
  .replace(/\(r\)|®|™/g, ' ').replace(/\*+[a-z ]+\*+/g, ' ').replace(/\(aka:[^)]*\)/gi, ' ')
  .replace(/::.*$/, ' ').replace(/:\s*\d+x\d+.*$/, ' ')
  .replace(THICK_RX, ' ').replace(FINISH_RX, ' ').replace(BRAND_STRIP_RX, ' ').replace(MAT_RX, ' ')
  .replace(/\b(new|premium|slabs?)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const thicknessOf = (n) => { const m = /\b(\d(?:\.\d)?)\s*cm\b/i.exec(n || ''); return m ? parseFloat(m[1]) : null; };
const isSampleSku = (slug) => /-sample$/.test(slug || '');

/**
 * Pick the library row this catalog slab actually refers to.
 *
 * norm() strips the finish, so `White Quartz - Satin` ($119.95), `- Leather`
 * ($285) and `- Jumbo or Regular` ($275) all collapse to one key. Picking any
 * of them writes a cost that belongs to a different product. Disambiguate on
 * the catalog row's own finish; if that can't separate them and the costs
 * genuinely differ, return null — a skipped row is recoverable, a wrong dealer
 * cost quietly misprices the job.
 *
 * Thickness: 3cm preferred, else 2cm (the quoting convention).
 */
function pickBest(rows, slabFinish) {
  if (rows.length === 1) return rows[0];

  if (slabFinish) {
    const f = String(slabFinish).toLowerCase();
    const byFinish = rows.filter((r) => r.name.toLowerCase().includes(f));
    if (byFinish.length) rows = byFinish;
  }

  const thick = (r) => (thicknessOf(r.name) === 3 ? 100 : thicknessOf(r.name) === 2 ? 50 : 0);
  const ranked = rows.slice().sort((a, b) => thick(b) - thick(a));

  // Still several candidates at the same thickness with different costs -> ambiguous.
  const top = ranked.filter((r) => thick(r) === thick(ranked[0]));
  const costs = new Set(top.map((r) => r.cost));
  if (costs.size > 1) return null;
  return ranked[0];
}

/** Slab area, when the vendor gave it: '133x77=71.12sqft' or '~55sqft/slab'. */
const areaOf = (r) => { const m = /([\d.]+)\s*sqft/i.exec(r.description || ''); return m ? parseFloat(m[1]) : null; };

/** Dealer cost per sqft. Per-slab rows need an area to divide by. */
function perSqft(row) {
  if (row.unit === 'sqft') return row.cost;
  const area = areaOf(row);
  return area > 0 ? row.cost / area : null;
}

const WRITE = process.argv.includes('--write');
const vArg = process.argv.indexOf('--vendor');
const ONLY = vArg > -1 ? process.argv[vArg + 1] : null;

const { SUPABASE_URL: U, SUPABASE_SERVICE_KEY: K } = process.env;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

async function fetchAll(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${U}/rest/v1/${query}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

(async () => {
  if (!U || !K) { console.error('need SUPABASE_URL and SUPABASE_SERVICE_KEY'); process.exit(1); }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const lib = await client.db().collection('lineitemlibraries')
    .find({ category: 'materials', cost: { $gt: 0 } },
      { projection: { name: 1, vendor: 1, cost: 1, unit: 1, description: 1 } }).toArray();
  await client.close();

  const byVendorName = new Map();   // "MSI|calacatta gold" -> [rows]
  const byBrand = [];
  for (const r of lib) {
    const key = norm(r.name);
    if (!key) continue;
    const k = `${r.vendor}|${key}`;
    if (!byVendorName.has(k)) byVendorName.set(k, []);
    byVendorName.get(k).push(r);
    byBrand.push({ key, raw: r.name, row: r });
  }
  const brandRows = (rx, key) => byBrand.filter((b) => rx.test(b.raw) && b.key === key).map((b) => b.row);

  const markups = {};
  (await fetchAll('vendor_config?select=vendor_id,default_markup_pct')).forEach((v) => { markups[v.vendor_id] = v.default_markup_pct; });

  const slabs = (await fetchAll('catalog_products?select=id,slug,name,vendor_id,vendor_cost,retail_price,finish&category=eq.slab&active=eq.true'))
    .filter((s) => !isSampleSku(s.slug))
    .filter((s) => !ONLY || s.vendor_id === ONLY);

  const updates = [];
  const stats = {};
  for (const s of slabs) {
    const v = s.vendor_id;
    stats[v] = stats[v] || { total: 0, matched: 0, noArea: 0, ambiguous: 0, changed: 0 };
    stats[v].total++;

    const key = norm(s.name);
    let rows = [];
    for (const lv of VENDOR_MAP[v] || []) rows.push(...(byVendorName.get(`${lv}|${key}`) || []));
    if (!rows.length && BRAND_RX[v]) rows = brandRows(BRAND_RX[v], key);
    if (!rows.length) continue;

    const best = pickBest(rows, s.finish);
    if (!best) { stats[v].ambiguous++; continue; }
    const cost = perSqft(best);
    if (cost == null) { stats[v].noArea++; continue; }
    stats[v].matched++;

    const rounded = Number(cost.toFixed(2));
    if (Number(s.vendor_cost) === rounded) continue;
    stats[v].changed++;
    updates.push({ id: s.id, slug: s.slug, vendor: v, from: s.vendor_cost, to: rounded, retail: s.retail_price });
  }

  const pad = (x, n) => String(x).padEnd(n);
  console.log(`mode: ${WRITE ? 'WRITE' : 'DRY RUN'}   (vendor_cost only — retail_price never touched)\n`);
  console.log(pad('vendor', 22) + pad('slabs', 8) + pad('matched', 9) + pad('ambig', 8) + pad('no area', 9) + 'vendor_cost changes');
  console.log('-'.repeat(80));
  for (const [v, s] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total)) {
    if (!s.matched && !s.noArea && !s.ambiguous) continue;
    console.log(pad(v, 22) + pad(s.total, 8) + pad(s.matched, 9) + pad(s.ambiguous, 8) + pad(s.noArea, 9) + s.changed);
  }
  console.log(`\nrows to update: ${updates.length}`);

  const big = updates.filter((u) => u.from > 0 && Math.abs(u.to - u.from) / u.from > 0.25);
  console.log(`  moving more than 25%: ${big.length}`);
  big.slice(0, 8).forEach((u) => console.log(`    ${pad(u.slug, 38)} $${u.from} -> $${u.to}`));

  console.log('\n--- what retail_price WOULD be at the configured markup (NOT written) ---');
  updates.slice(0, 6).forEach((u) => {
    const m = markups[u.vendor];
    const suggested = m ? Number((u.to * (1 + m / 100)).toFixed(2)) : null;
    console.log(`  ${pad(u.slug, 34)} cost $${u.to}  x${m ? 1 + m / 100 : '?'} = $${suggested ?? '?'}   (retail today: $${u.retail})`);
  });

  if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.\n'); return; }
  if (!updates.length) { console.log('\nnothing to do.\n'); return; }

  // Snapshot every slab's current vendor_cost, not just the ones we touch, so a
  // restore doesn't need this script's matching logic to reproduce.
  const fs = require('fs');
  const os = require('os');
  const dir = path.join(os.homedir(), 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, 'vendor_cost_before_sync.json');
  fs.writeFileSync(backup, JSON.stringify(slabs.map((r) => ({ id: r.id, slug: r.slug, vendor_cost: r.vendor_cost })), null, 1));
  console.log(`\nbackup: ${backup} (${slabs.length} slab rows)`);

  let done = 0;
  for (const u of updates) {
    const r = await fetch(`${U}/rest/v1/catalog_products?id=eq.${u.id}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ vendor_cost: u.to }),
    });
    if (!r.ok) { console.error(`\nfailed on ${u.slug}: ${r.status} ${await r.text()}`); process.exit(1); }
    if (++done % 100 === 0) process.stdout.write(`\r  updated ${done}/${updates.length}`);
  }
  console.log(`\r  updated ${done}/${updates.length}`);

  const check = (await fetchAll('catalog_products?select=id,vendor_cost&category=eq.slab&active=eq.true'))
    .reduce((m, r) => (m[r.id] = r.vendor_cost, m), {});
  const bad = updates.filter((u) => Number(check[u.id]) !== u.to);
  console.log(`\nverify: ${updates.length - bad.length}/${updates.length} rows hold the new cost`);
  if (bad.length) { console.error('MISMATCH — investigate.'); process.exit(1); }
  console.log('\nDONE. retail_price unchanged.\n');
})().catch((e) => { console.error(e); process.exit(1); });
