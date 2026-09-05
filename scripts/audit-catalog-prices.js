#!/usr/bin/env node
/**
 * Reconcile catalog_products against the CRM master price book, per vendor.
 *
 *   MONGODB_URI=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/audit-catalog-prices.js [--write] [--vendor msi] [--json out.json]
 *
 * This is the tool that found 175 wrong prices and 192 unsellable rows on
 * 2026-08-27, including a $1,550 sink listed at $105.30 that actually sold.
 * Everything below is a trap it hit; none of it is theoretical.
 *
 * ── TRAP 1: there is NO global markup ────────────────────────────────────
 * fix-alfi-cost.js says "one markup, every vendor, x1.30". True for Alfi —
 * but MSI and Arizona Tile run x1.50. Applying 1.30 catalog-wide would have
 * cut 548 tile prices ~13% for nothing. Each vendor's markup is MEASURED here
 * from its own healthy rows, never assumed.
 *
 * ── TRAP 2: correcting a cost is a data fix; changing a margin is not ────
 * Recomputing retail at the vendor MEDIAN after fixing a cost silently moved
 * 122 MSI rows from x1.30 to x1.50 — a repricing decision disguised as a
 * repair. A row keeps its own prior markup when that markup is sane.
 *
 * ── TRAP 3: the price book has absorbed our own bad costs ────────────────
 * Entries exist as both "Bianco Carrara" and "Bianco Carrara — Arizona Tile".
 * Some suffixed-only entries exactly equal our current WRONG cost — our data
 * round-tripped back in, not independent evidence. Strip the suffix when
 * matching (it doubles coverage) but never treat a suffixed-only entry as
 * proof. When two costs compete, the one that reproduces the EXISTING retail
 * at the vendor's markup is the real one.
 *
 * ── TRAP 4: match on vendor + name + UNIT ────────────────────────────────
 * Name alone crosses vendors: the book's Caesarstone "Raven" ($38.01/each)
 * landed on our Cactus Stone "Raven" ($/sqft). And if the book holds several
 * costs under one name+unit that is real variance (MSI prices a colour by
 * thickness) — skip, never pick.
 *
 * ── TRAP 5: two permanent false positives ────────────────────────────────
 * - the-yard-az: theYardSync sets vendor_cost = retail x 1.091 BY DESIGN, so
 *   all ~757 rows look "below cost" forever.
 * - "no retail_price" is usually correct: stone is quote-based, flooring
 *   substitutes a type floor, tile shows "Call for Price". Do not pull them.
 * VIGO is excluded outright — its rows in the book are scraped RETAIL.
 */
const path = require('path');
const fs = require('fs');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));

const WRITE = process.argv.includes('--write');
// indexOf returns -1 when the flag is absent, and argv[-1 + 1] is argv[0] --
// the node binary -- which silently became a vendor filter matching nothing.
const flagValue = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] || null) : null;
};
const ONLY = (flagValue('--vendor') || '').trim() || null;
const JSON_OUT = flagValue('--json');

const { SUPABASE_URL, MONGODB_URI } = process.env;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !KEY || !MONGODB_URI) {
  console.error('need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MONGODB_URI');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// vendor_id -> the names that vendor goes by in lineitemlibraries.
// VIGO is deliberately absent: its rows there are scraped retail, not cost.
const VENDOR_MAP = {
  'arizona-tile': ['Arizona Tile'],
  'msi': ['MSI', 'MSI Surfaces', 'msi'],
  'cactus-stone': ['Cactus Stone & Tile'],
  'cosentino': ['Cosentino', 'Silestone by Cosentino', 'Dekton by Cosentino'],
  'bolder-image-stone': ['Bolder Image Stone'],
  'bravo-tile': ['Bravo Tile and Stone', 'Bravo Tile'],
  'monterrey-tile': ['Monterrey Tile'],
  'daltile': ['Daltile'],
  'arcsurfaces': ['Architectural Surfaces (ASG)', 'Architectural Surfaces'],
  'gila': ['Gila'],
  'sun-stone': ['Sun Stone'],
  'caesarstone': ['Caesarstone'],
  'lx-hausys': ['LG Viatera', 'LX Hausys'],
  'esi': ['ESI'],
  'aracruz': ['Aracruz Granite'],
};

// Strip a trailing " — Vendor" tag: the book carries the same item under two
// conventions and matching only the plain form halves coverage.
const norm = (s) => String(s || '')
  .replace(/\s*[—–]\s*[^—–]+$/, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const r2 = (n) => Math.round(n * 100) / 100;
const quantile = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

async function fetchCatalog() {
  const all = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/catalog_products?active=eq.true&select=id,sku,name,vendor_id,category,vendor_cost,retail_price,price_unit&order=id.asc&limit=1000&offset=${off}`, { headers: H });
    const b = await r.json();
    if (!Array.isArray(b)) throw new Error(`catalog fetch failed: ${JSON.stringify(b).slice(0, 160)}`);
    all.push(...b);
    if (b.length < 1000) return all;
  }
}

(async () => {
  const mongo = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await mongo.connect();
  const lib = mongo.db().collection('lineitemlibraries');
  const catalog = await fetchCatalog();
  console.log(`active catalog rows: ${catalog.length}\n`);

  const plan = [];
  const report = [];

  for (const [vid, libNames] of Object.entries(VENDOR_MAP)) {
    if (ONLY && vid !== ONLY) continue;
    const mine = catalog.filter((r) => r.vendor_id === vid);
    if (!mine.length) continue;

    const libRows = await lib.find({ vendor: { $in: libNames } }).project({ name: 1, cost: 1, unit: 1 }).toArray();
    const byKey = new Map();
    for (const l of libRows) {
      if (!(l.cost > 0)) continue;
      const k = `${norm(l.name)}|${String(l.unit || '').toLowerCase()}`;
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k).add(r2(l.cost));
    }
    const costFor = (p) => {
      const costs = byKey.get(`${norm(p.name)}|${String(p.price_unit || '').toLowerCase()}`);
      return costs && costs.size === 1 ? [...costs][0] : null;   // size>1 = real variance, skip
    };

    // Measure this vendor's markup from rows the book AGREES with.
    const healthy = mine.filter((p) => {
      const lc = costFor(p);
      return lc && p.vendor_cost > 0 && p.retail_price > 0 && Math.abs(p.vendor_cost - lc) / lc <= 0.02;
    }).map((p) => p.retail_price / p.vendor_cost);
    const markup = quantile(healthy, 0.5);

    let agree = 0, both = 0;
    for (const p of mine) {
      const lc = costFor(p);
      if (lc && p.vendor_cost > 0) { both++; if (Math.abs(lc / p.vendor_cost - 1) <= 0.02) agree++; }
    }
    report.push({ vendor_id: vid, active: mine.length, matched: both, agree_pct: both ? Math.round(100 * agree / both) : null, markup: markup ? r2(markup) : null, healthy: healthy.length });

    if (!markup) continue;   // no measured markup -> never guess one
    for (const p of mine) {
      const lc = costFor(p);
      if (!lc) continue;
      const costWrong = !(p.vendor_cost > 0) || Math.abs(p.vendor_cost - lc) / lc > 0.02;
      const noMargin = p.retail_price > 0 && p.vendor_cost > 0 && p.retail_price <= p.vendor_cost * 1.15;
      if (!costWrong && !noMargin) continue;

      // TRAP 3, ENFORCED. When the book and the catalogue disagree, the cost
      // that reproduces the EXISTING retail at a sane markup is the real one --
      // the other is usually our own bad value round-tripped back into the book
      // as a "— Vendor" entry, or a different variant ("Taj Mahal Premium" for
      // our Matte), or a **Sale** price. Six correct repairs were flagged for
      // reversal by an earlier version of this script that only documented this
      // rule instead of applying it.
      const corroborated = p.vendor_cost > 0 && p.retail_price > 0 &&
        // 1.4648 is the retired markup a lot of rows were priced at before the
        // "one markup" change; Bravo Tile still sits on it. A ratio landing on
        // any markup this catalogue has actually used is evidence the cost it
        // was derived from is the real one.
        [1.30, 1.4648, 1.50, markup].some((m) => Math.abs(p.retail_price / p.vendor_cost - m) <= 0.03);
      if (corroborated && !noMargin) continue;

      const prior = (p.vendor_cost > 0 && p.retail_price > 0) ? p.retail_price / p.vendor_cost : null;
      const priorSane = prior !== null && prior >= 1.15 && prior <= 1.60;
      const wanted = r2(lc * (priorSane ? prior : markup));
      // A wrong cost alone does not justify moving a price that is already sane.
      const retailSane = p.retail_price > 0 && p.retail_price >= lc * 1.15 && p.retail_price <= lc * markup * 1.25;
      plan.push({
        id: p.id, sku: p.sku, name: p.name, vendor_id: vid, unit: p.price_unit,
        old_cost: p.vendor_cost, old_retail: p.retail_price,
        new_cost: lc, new_retail: retailSane ? p.retail_price : wanted,
        reason: noMargin ? (p.retail_price <= p.vendor_cost ? 'below cost' : 'no margin') : 'cost wrong',
        kept_retail: retailSane,
      });
    }
  }

  console.log('vendor              active  matched  agree%  markup  healthy');
  report.forEach((r) => console.log(
    r.vendor_id.padEnd(20) + String(r.active).padStart(6) + String(r.matched).padStart(9) +
    String(r.agree_pct ?? '-').padStart(8) + String(r.markup ?? '-').padStart(8) + String(r.healthy).padStart(9)));

  console.log(`\nDEFECTS: ${plan.length}`);
  const byReason = {};
  plan.forEach((f) => { byReason[f.reason] = (byReason[f.reason] || 0) + 1; });
  console.log(' ', byReason, `| retail left alone on ${plan.filter((f) => f.kept_retail).length}`);
  plan.slice(0, 20).forEach((f) => console.log(
    `   ${f.vendor_id.padEnd(16)} ${String(f.name).slice(0, 28).padEnd(29)} ${f.reason.padEnd(11)} cost ${f.old_cost}->${f.new_cost}  retail ${f.old_retail}->${f.new_retail}`));

  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ report, plan }, null, 1)); console.log(`\nwrote ${JSON_OUT}`); }

  if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.'); await mongo.close(); return; }

  let ok = 0, fail = 0;
  for (const f of plan) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalog_products?id=eq.${f.id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ vendor_cost: f.new_cost, retail_price: f.new_retail }),
    });
    res.ok ? ok++ : (fail++, console.log('FAILED', f.sku, await res.text()));
  }
  console.log(`\nwrote ${ok}, failed ${fail}`);
  await mongo.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
