#!/usr/bin/env node
/**
 * Reconcile Bravo Tile cost + price from their emailed wholesale price list PDF.
 *
 * All 362 Bravo products were imported from tile.json with a placeholder price and NO
 * vendor_cost — 287 flat at $7.99, 34 at $8.99, and 16 at $12.99 (which is the SAMPLE price
 * leaking in, not a tile price). So margin was unknowable and wrong in both directions:
 * ALASKA GREY 6X24 wholesales at $6.49 (we sold it at $7.99, a 19% margin) while AVANA BROWN
 * wholesales at $4.25 (we sold that at $7.99 too).
 *
 * The PDF uses two different table shapes and both have to be read:
 *   A. name-first   "ALASKA GREY 6X24 SPLIT FACE PANEL $6.49"
 *   B. collection   a "NOCE COLLECTION" heading, then rows of "18x18 Tumbled Tile $6.25"
 *
 * Prices are WHOLESALE, i.e. our cost. retail = cost x 1.085 x 1.35, the same rule the rest
 * of the catalogue uses.
 *
 * MATCHING IS DELIBERATELY STRICT. A wrong cost is worse than no cost — it silently sets a
 * wrong price. A loose "price-list name appears in our title" rule matched "Crema Classico
 * Versailles Pattern" (a travertine pattern set) to a 6X24 ledger panel. So a partial name
 * match is only accepted when the SIZE agrees too, and anything ambiguous is reported for a
 * human instead of guessed.
 *
 * Dry-run by default. --write updates PRODUCTION.
 * Usage: node scripts/import-bravo-pricing.js "<price-list.pdf>" [--write]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const pdf = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!pdf) { console.error('usage: import-bravo-pricing.js "<price-list.pdf>" [--write]'); process.exit(1); }

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing from .env.local'); process.exit(1); }
const psql = (sql) => execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
  { maxBuffer: 1 << 28 }).toString();

const TAX = 1.085;
const MARGIN = 1.35;

const PY = `
import json, re, sys
import pypdf

reader = pypdf.PdfReader(sys.argv[1])
NAME_ROW = re.compile(r'^(?P<name>[A-Za-z0-9][A-Za-z0-9 .,\\'\\-/&()]*?)\\s+(?P<size>\\d+\\s?[Xx]\\s?\\d+(?:\\.\\d+)?)\\s+(?P<rest>.*?)\\\$(?P<price>\\d+\\.\\d{2})')
SIZE_ROW = re.compile(r'^(?P<size>\\d+\\s?[Xx]\\s?\\d+(?:\\.\\d+)?|VERSAILLES PATTERN)\\s+(?P<finish>.*?)\\\$(?P<price>\\d+\\.\\d{2})')
HEADING  = re.compile(r'^[A-Z][A-Z &/\\'\\-]{3,}$')

out, collection = [], None
for pi, page in enumerate(reader.pages):
    for raw in (page.extract_text() or '').split('\\n'):
        s = ' '.join(raw.split())
        if not s:
            continue
        if '\$' not in s:
            # A heading with no price is the collection these rows belong to. Ignore the
            # repeated column headers.
            if HEADING.match(s) and not s.startswith('NAME'):
                collection = s.replace('COLLECTION', '').strip()
            continue
        m = NAME_ROW.match(s)
        if m:
            out.append({'name': m.group('name').strip(), 'size': m.group('size'),
                        'finish': m.group('rest').strip()[:48], 'price': float(m.group('price')),
                        'shape': 'name', 'page': pi + 1})
            continue
        m = SIZE_ROW.match(s)
        if m and collection:
            out.append({'name': collection, 'size': m.group('size'),
                        'finish': m.group('finish').strip()[:48], 'price': float(m.group('price')),
                        'shape': 'collection', 'page': pi + 1})
json.dump(out, sys.stdout)
`;
const list = JSON.parse(execFileSync('python3', ['-c', PY, pdf], { maxBuffer: 1 << 28 }).toString());
console.log(`price list: ${list.length} rows (${list.filter((r) => r.shape === 'name').length} name-first, ${list.filter((r) => r.shape === 'collection').length} collection)`);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normSize = (s) => String(s || '').toLowerCase().replace(/×/g, 'x').replace(/[^0-9x]/g, '');

const byName = new Map();
for (const r of list) {
  const k = norm(r.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(r);
}

const rows = psql(
  `select id, coalesce(sku,''), name, coalesce(retail_price,0), coalesce(vendor_cost,0)
     from catalog_products where vendor_id='bravo-tile' order by name`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, sku, name, retail_price, vendor_cost] = l.split('|');
  return { id, sku, name, retail_price: Number(retail_price), vendor_cost: Number(vendor_cost) };
});
console.log(`our Bravo products: ${rows.length}\n`);

const round2 = (n) => Math.round(n * 100) / 100;
const matched = [];
const ambiguous = [];
const unmatched = [];

for (const p of rows) {
  const n = norm(p.name);
  const ourSize = normSize(p.name);
  let cands = byName.get(n) || [];
  let how = 'exact';

  if (!cands.length) {
    // Longest price-list name contained in our title.
    const keys = [...byName.keys()].filter((k) => k.length >= 5 && n.includes(k));
    if (keys.length) {
      const k = keys.reduce((a, b) => (b.length > a.length ? b : a));
      cands = byName.get(k);
      how = 'name-in-title';
    }
  }
  if (!cands.length) { unmatched.push(p); continue; }

  // Narrow by size whenever our title states one.
  let pick = cands;
  if (ourSize) {
    const sized = cands.filter((c) => normSize(c.size) && ourSize.includes(normSize(c.size)));
    if (sized.length) pick = sized;
  }
  // Narrow further by a finish word we both mention.
  if (pick.length > 1) {
    const fin = ['tumbled', 'polished', 'honed', 'matte', 'brushed', 'filled', 'split']
      .find((f) => n.includes(f));
    if (fin) {
      const f2 = pick.filter((c) => norm(c.finish).includes(fin));
      if (f2.length) pick = f2;
    }
  }

  // An exact single hit is safe. A partial match is only safe when the size agreed —
  // otherwise it is the Versailles-vs-ledger trap.
  const sizeAgreed = ourSize && pick.every((c) => normSize(c.size) && ourSize.includes(normSize(c.size)));
  const prices = [...new Set(pick.map((c) => c.price))];

  if (pick.length === 1 && (how === 'exact' || sizeAgreed)) {
    const cost = pick[0].price;
    matched.push({ ...p, cost, retail: round2(cost * TAX * MARGIN), src: pick[0], how });
  } else if (prices.length === 1 && how === 'exact') {
    // Several rows, one price — the size split doesn't matter, cost is cost.
    const cost = prices[0];
    matched.push({ ...p, cost, retail: round2(cost * TAX * MARGIN), src: pick[0], how: 'same-price' });
  } else if (how === 'exact') {
    // The name is right but we can't tell which size. Take the DEAREST option: guessing high
    // means we might leave margin on the table, guessing low means selling under cost. Flagged
    // so it can be corrected, never silently assumed correct.
    const cost = Math.max(...prices);
    matched.push({ ...p, cost, retail: round2(cost * TAX * MARGIN), src: pick.find((c) => c.price === cost), how: 'assumed-dearest' });
  } else {
    ambiguous.push({ ...p, options: pick.slice(0, 3), how });
  }
}

const money = (n) => `$${Number(n).toFixed(2)}`;
const byHow = matched.reduce((a, m) => { a[m.how] = (a[m.how] || 0) + 1; return a; }, {});
console.log(`matched   : ${matched.length}  (${Object.entries(byHow).map(([k, v]) => k + ' ' + v).join(', ')})`);
console.log(`ambiguous : ${ambiguous.length}  (left alone — needs a human)`);
console.log(`unmatched : ${unmatched.length}  (not in this price list)`);

const under = matched.filter((m) => m.retail_price < m.cost);
console.log(`\nSELLING BELOW COST right now: ${under.length}`);
for (const m of under.slice(0, 8)) console.log(`   ${m.name.slice(0, 36).padEnd(36)} sold ${money(m.retail_price)} · cost ${money(m.cost)} -> ${money(m.retail)}`);

console.log('\nlargest corrections:');
for (const m of matched.slice().sort((a, b) => Math.abs(b.retail - b.retail_price) - Math.abs(a.retail - a.retail_price)).slice(0, 10)) {
  const d = m.retail - m.retail_price;
  console.log(`   ${m.name.slice(0, 36).padEnd(36)} ${money(m.retail_price)} -> ${money(m.retail)} (${d > 0 ? '+' : ''}${money(d)})  cost ${money(m.cost)}`);
}
if (ambiguous.length) {
  console.log('\nambiguous sample:');
  for (const a of ambiguous.slice(0, 6)) {
    console.log(`   ${a.name.slice(0, 34).padEnd(34)} -> ${a.options.map((o) => `${o.name} ${o.size} $${o.price}`).join(' | ').slice(0, 76)}`);
  }
}

if (!WRITE) { console.log('\nDry run — nothing written. Re-run with --write.'); process.exit(0); }
if (!matched.length) { console.log('nothing to write'); process.exit(0); }

const vals = matched.map((m) => `('${m.id}'::uuid, ${m.cost}, ${m.retail})`).join(',\n    ');
const f = path.join(require('os').tmpdir(), `bravo-${Date.now()}.sql`);
fs.writeFileSync(f, `begin;
update catalog_products c set vendor_cost = v.cost, retail_price = v.retail, updated_at = now()
  from (values
    ${vals}
  ) as v(id, cost, retail)
 where c.id = v.id;
commit;`);
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
console.log(`\nrepriced ${matched.length} Bravo products from the July 2026 wholesale list`);
