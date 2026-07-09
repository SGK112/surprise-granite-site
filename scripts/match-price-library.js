#!/usr/bin/env node
/**
 * Dry-run: match catalog_products slabs against the price library
 * (lineitemlibraries in the CRM's Mongo) to recover a real per-sqft cost.
 *
 * READ ONLY. Writes nothing. Prints a report and a proposals CSV.
 *
 *   MONGODB_URI=... node scripts/match-price-library.js [--csv out.csv]
 *
 * Why the naive join fails: the library stores what the vendor's price sheet
 * says ("CALACATTA MIRAGGIO GOLD 2CM POLISHED"), the catalog stores a web slug
 * ("calacatta-miraggio-gold-quartz"). Thickness, finish, brand and the material
 * suffix all have to come off before the names line up.
 */

const path = require('path');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));

const CATALOG_API = 'https://surprise-granite-email-api.onrender.com/api/catalog';

// catalog vendor_id -> vendor string(s) as they appear in the price library.
const VENDOR_MAP = {
  'msi': ['MSI'],
  'cosentino': ['Cosentino'],
  'arizona-tile': ['Arizona Tile'],
  'daltile': ['Daltile'],
  'arcsurfaces': ['Architectural Surfaces (ASG)'],
  'bolder-image-stone': ['Bolder Image Stone'],
  'cactus-stone': ['Cactus Stone & Tile'],
  'sun-stone': ['Sun Stone'],
  'gila': ['Gila'],
  'esi': ['ESI'],
  'monterrey-tile': ['Monterrey Tile']
};

// Mappings that look right but nobody has confirmed. Reported separately and
// never counted as a match, because a wrong vendor means a wrong price.
const UNCONFIRMED_VENDOR_MAP = {
  'pentalquartz': ['Architectural Surfaces (ASG)']
};

const THICKNESS_RX = /\b\d(?:\.\d)?\s*cm\b/gi;
const FINISH_RX = /\b(polished|honed|matte|matt|suede|leathered|satin|brushed|textured|natural|volcano|velvet)\b/gi;
const BRAND_RX = /\b(silestone|dekton|sensa|by cosentino|cosentino|msi|pental ?quartz|pental|viatera|hanstone|caesarstone|q premium|quartz premium)\b/gi;
const SUFFIX_RX = /\b(quartz|quartzite|granite|marble|porcelain|dekton|slab|tile)\b/gi;

function normalize(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(r\)|®|™/g, ' ')
    .replace(/\bnew\b/g, ' ')
    .replace(THICKNESS_RX, ' ')
    .replace(FINISH_RX, ' ')
    .replace(BRAND_RX, ' ')
    .replace(SUFFIX_RX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function thicknessOf(name) {
  const m = /\b(\d(?:\.\d)?)\s*cm\b/i.exec(name || '');
  return m ? parseFloat(m[1]) : null;
}

function finishOf(name) {
  const m = /\b(polished|honed|matte|matt|suede|leathered|satin|brushed)\b/i.exec(name || '');
  return m ? m[1].toLowerCase() : null;
}

/** Slab area, when the vendor gave it: '133x77=71.12sqft' or '~55sqft/slab'. */
function areaOf(row) {
  const m = /([\d.]+)\s*sqft/i.exec(row.description || '');
  return m ? parseFloat(m[1]) : null;
}

/** Dealer cost per sqft, or null when the row can't produce one. */
function perSqft(row) {
  if (row.unit === 'sqft') return row.cost;
  const area = areaOf(row);
  return area > 0 ? row.cost / area : null;
}

/** 3cm preferred, else 2cm; polished preferred. Matches the quoting convention. */
function pickBest(rows) {
  const score = (r) => {
    const t = thicknessOf(r.name);
    const f = finishOf(r.name);
    return (t === 3 ? 100 : t === 2 ? 50 : 0) + (f === 'polished' ? 10 : 0);
  };
  return rows.slice().sort((a, b) => score(b) - score(a))[0];
}

async function fetchCatalogSlabs() {
  const out = [];
  for (let offset = 0; offset < 20000; offset += 250) {
    const res = await fetch(`${CATALOG_API}?limit=250&offset=${offset}&in_stock=false`);
    const json = await res.json();
    const page = json.products || [];
    out.push(...page);
    if (page.length < 250) break;
  }
  return out.filter((p) => p.category === 'slab');
}

async function fetchLibrary(uri) {
  const client = new MongoClient(uri);
  await client.connect();
  const rows = await client.db().collection('lineitemlibraries')
    .find({ category: 'materials', cost: { $gt: 0 } },
      { projection: { name: 1, unit: 1, cost: 1, vendor: 1, description: 1 } })
    .toArray();
  await client.close();
  return rows;
}

function indexLibrary(rows) {
  const byVendorName = new Map();
  const byNameAnyVendor = new Map();
  for (const r of rows) {
    const key = normalize(r.name);
    if (!key) continue;
    const vk = `${r.vendor}|${key}`;
    if (!byVendorName.has(vk)) byVendorName.set(vk, []);
    byVendorName.get(vk).push(r);
    if (!byNameAnyVendor.has(key)) byNameAnyVendor.set(key, []);
    byNameAnyVendor.get(key).push(r);
  }
  return { byVendorName, byNameAnyVendor };
}

function lookup(index, vendors, key) {
  const hits = [];
  for (const v of vendors) hits.push(...(index.byVendorName.get(`${v}|${key}`) || []));
  return hits;
}

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Set MONGODB_URI (the CRM Mongo that holds lineitemlibraries).');
    process.exit(1);
  }

  const [slabs, libRows] = await Promise.all([fetchCatalogSlabs(), fetchLibrary(uri)]);
  const index = indexLibrary(libRows);

  const stats = {};
  const proposals = [];
  const unconfirmed = [];
  const crossVendor = [];
  const noArea = [];

  const bump = (vendor, field) => {
    stats[vendor] = stats[vendor] || { slabs: 0, matched: 0, unmatched: 0, changed: 0, placeholders: 0, placeholdersFixed: 0 };
    stats[vendor][field]++;
  };

  for (const p of slabs) {
    const vendor = p.vendor_id || '(none)';
    bump(vendor, 'slabs');
    const isPlaceholder = Number(p.retail_price) === 12.99;
    if (isPlaceholder) bump(vendor, 'placeholders');

    const key = normalize(p.name);
    const mapped = VENDOR_MAP[vendor] || [];
    let hits = lookup(index, mapped, key);

    if (!hits.length && UNCONFIRMED_VENDOR_MAP[vendor]) {
      const guess = lookup(index, UNCONFIRMED_VENDOR_MAP[vendor], key);
      if (guess.length) {
        unconfirmed.push({ slug: p.slug, vendor, wouldMatch: UNCONFIRMED_VENDOR_MAP[vendor][0] });
        bump(vendor, 'unmatched');
        continue;
      }
    }

    if (!hits.length) {
      const any = index.byNameAnyVendor.get(key) || [];
      if (any.length && mapped.length) {
        crossVendor.push({ slug: p.slug, catalogVendor: vendor, libraryVendor: any[0].vendor });
      }
      bump(vendor, 'unmatched');
      continue;
    }

    const best = pickBest(hits);
    const cost = perSqft(best);
    if (cost == null) {
      noArea.push({ slug: p.slug, vendor, libName: best.name, cost: best.cost, unit: best.unit });
      bump(vendor, 'unmatched');
      continue;
    }

    bump(vendor, 'matched');
    const current = Number(p.retail_price);
    const changed = !(current > 0) || Math.abs(cost - current) / cost > 0.01;
    if (changed) bump(vendor, 'changed');
    if (isPlaceholder) bump(vendor, 'placeholdersFixed');

    proposals.push({
      slug: p.slug, vendor, name: p.name, libraryName: best.name,
      currentRetail: current, proposedPerSqft: Number(cost.toFixed(2)),
      unit: best.unit, slabArea: areaOf(best) || '', placeholder: isPlaceholder
    });
  }

  const pad = (s, n) => String(s).padEnd(n);
  const totals = { slabs: 0, matched: 0, unmatched: 0, placeholders: 0, placeholdersFixed: 0 };

  console.log('\n=== DRY RUN — nothing written ===\n');
  console.log(pad('vendor', 22), pad('slabs', 7), pad('matched', 9), pad('unmatched', 11), pad('$12.99 now', 12), 'placeholders fixed');
  for (const [v, s] of Object.entries(stats).sort((a, b) => b[1].slabs - a[1].slabs)) {
    for (const k of Object.keys(totals)) totals[k] += s[k] || 0;
    console.log(pad(v, 22), pad(s.slabs, 7), pad(s.matched, 9), pad(s.unmatched, 11), pad(s.placeholders, 12), s.placeholdersFixed);
  }
  console.log('\n' + pad('TOTAL', 22), pad(totals.slabs, 7), pad(totals.matched, 9), pad(totals.unmatched, 11), pad(totals.placeholders, 12), totals.placeholdersFixed);

  const pct = (n) => `${Math.round((n / totals.slabs) * 100)}%`;
  console.log(`\nmatched ${totals.matched}/${totals.slabs} (${pct(totals.matched)}) — would set a real $/sqft`);
  console.log(`placeholders cleared: ${totals.placeholdersFixed}/${totals.placeholders}`);

  if (unconfirmed.length) {
    console.log(`\n!! ${unconfirmed.length} slabs would match ONLY under an unconfirmed vendor mapping:`);
    const g = {};
    unconfirmed.forEach((u) => { g[`${u.vendor} -> ${u.wouldMatch}`] = (g[`${u.vendor} -> ${u.wouldMatch}`] || 0) + 1; });
    Object.entries(g).forEach(([k, n]) => console.log('   ', k, `(${n})`));
    console.log('    NOT counted as matched. Confirm the mapping before trusting these.');
  }
  if (crossVendor.length) {
    console.log(`\n!! ${crossVendor.length} slabs match a library row under a DIFFERENT vendor (possible misfiling):`);
    crossVendor.slice(0, 5).forEach((c) => console.log(`    ${c.slug}: catalog=${c.catalogVendor} library=${c.libraryVendor}`));
  }
  if (noArea.length) {
    console.log(`\n!! ${noArea.length} matched a per-slab price with no slab area — cannot derive $/sqft:`);
    noArea.slice(0, 5).forEach((n) => console.log(`    ${n.slug}: ${n.libName} = $${n.cost}/${n.unit}`));
  }

  const csvArg = process.argv.indexOf('--csv');
  if (csvArg > -1 && process.argv[csvArg + 1]) {
    const fs = require('fs');
    const cols = ['slug', 'vendor', 'name', 'libraryName', 'currentRetail', 'proposedPerSqft', 'unit', 'slabArea', 'placeholder'];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    fs.writeFileSync(process.argv[csvArg + 1],
      [cols.join(','), ...proposals.map((p) => cols.map((c) => esc(p[c])).join(','))].join('\n'));
    console.log(`\nproposals -> ${process.argv[csvArg + 1]} (${proposals.length} rows)`);
  }

  console.log('\nNOTE: proposedPerSqft is DEALER COST. Whether retail_price should carry');
  console.log('cost or cost x markup is an open decision — this script proposes neither.\n');
})().catch((e) => { console.error(e); process.exit(1); });
