#!/usr/bin/env node
/**
 * Import MSI cost + real MSI Item IDs from the GROMA 2026 price sheets.
 *
 * WHY THIS MATTERS MORE THAN THE PORTAL. The MSI portal sync writes 1,853 costed rows into the
 * CRM every day and ZERO of them reach the catalogue, because the portal keys on real MSI part
 * numbers (NADEVISCAL1224) while catalog_products.sku holds Shopify gids and scrape slugs
 * (gid://shopify/Product/7467888672903). catalog_products.vendor_sku — the column meant to
 * carry the part number — is NULL on all 634 MSI rows. These sheets are the only source that
 * lists NAME, ITEM ID and PRICE together, so they are what backfills that join key.
 *
 * Do NOT try to bridge it by name against the portal instead: a loose normaliser scored 59% but
 * mapped "Almond Glossy Penny" onto "ALMOND GLOSSY 3X6" and "Alpine Quartz" onto "ALPINE WHITE
 * CLAY CORNER PIECE". Tightened, it fell to 4%.
 *
 * Sheet shapes differ and each needs its own reader:
 *   Slabs  "AZPH"      DESCRIPTION | FINISH | COUNTRY | ITEM ID-2cm | ITEM ID-3cm | 2cm $ | 3cm $
 *   LVT    "LVT ..."   Color | Item ID | $/SQFT | $/BOXES  — price is stated once per SERIES and
 *                      left blank on the colours beneath it, so it must be carried forward
 *   PT     "PT T-4"    PRODUCT COLLECTION | ItemNumber | COUNTRY | SIZE | FINISH | ...
 *
 * Prices are our dealer cost per sqft. Validated against the 465 rows that already carry a
 * cost — see --verify, which reports agreement instead of writing.
 *
 * Usage: node scripts/import-msi-pricing.js [--verify] [--write]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const VERIFY = process.argv.includes('--verify');

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing from .env.local'); process.exit(1); }
const psql = (sql) => execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
  { maxBuffer: 1 << 28 }).toString();

const PY = `
import json, sys, warnings, glob, re
warnings.filterwarnings("ignore")
import openpyxl

out = []
def cell(v): return '' if v is None else str(v).strip()
def num(v):
    try:
        f=float(str(v).replace('\$','').replace(',','').strip())
        return f if f>0 else None
    except Exception: return None

# ---- SLABS ----
# Our catalogue is priced on 2CM: every row that already had a cost matches the 2cm bundle
# column exactly (Alaska White 16.99, Agatha Black 19.05, Alpine Valley 7.99). Taking 3cm
# looked reasonable and disagreed with all 289 of them.
for p in glob.glob('GROMA*Slabs*.xlsx'):
    ws=openpyxl.load_workbook(p, data_only=True, read_only=True)['AZPH']
    for r in ws.iter_rows(values_only=True):
        name=cell(r[0]); id2=cell(r[3]) if len(r)>3 else ''; p2=num(r[5]) if len(r)>5 else None
        if not name or name.upper()=='DESCRIPTION' or not id2 or id2=='NA' or not p2: continue
        out.append({'name':name,'item':id2,'cost':p2,'src':'slabs'})

# ---- LVT ----
# The per-sqft price is stated on the first colour of a series and left blank beneath it, so it
# carries forward — but it MUST reset at each series header or a 5MM-20MIL plank inherits the
# 4.4MM-6MIL price (that error put Andover Abingdale at 1.84 against a real 2.29).
for p in glob.glob('GROMA*LVT*.xlsx'):
    wb=openpyxl.load_workbook(p, data_only=True, read_only=True)
    for sh in wb.sheetnames:
        carried=None
        for r in wb[sh].iter_rows(values_only=True):
            colour=cell(r[0]); item=cell(r[1]) if len(r)>1 else ''; price=num(r[2]) if len(r)>2 else None
            if colour and not item:      # a series header — the old price no longer applies
                carried=None
                continue
            if price: carried=price
            if not item or not colour or colour.lower()=='color': continue
            use=price or carried
            if use: out.append({'name':colour,'item':item,'cost':use,'src':'lvt'})

# ---- PT / MOSAIC / QUARTZ / LSC ----
# Header-driven: find the ItemNumber column and the PRICE /SQFT column by name. Positional
# guessing grabbed "SQFT PER PIECE" (2) and reported it as a $2.00 price.
for pat,tag in (('GROMA*PT*.xlsx','pt'),('GROMA*MOSAIC*.xlsx','mosaic'),
                ('GROMA*MSI Q*.xlsx','quartz'),('GROMA*LSC*.xlsx','lsc')):
    for p in glob.glob(pat):
        wb=openpyxl.load_workbook(p, data_only=True, read_only=True)
        for sh in wb.sheetnames:
            rows=list(wb[sh].iter_rows(values_only=True))
            hdr=None
            for i,r in enumerate(rows[:40]):
                vals=[cell(c).upper() for c in r]
                if any('ITEMNUMBER' in v or 'ITEM ID' in v or 'ITEM #' in v for v in vals) and \
                   any('SQFT' in v and 'PRICE' in v for v in vals):
                    hdr=i; break
            if hdr is None: continue
            H=[cell(c).upper() for c in rows[hdr]]
            ci=next(i for i,v in enumerate(H) if 'ITEMNUMBER' in v or 'ITEM ID' in v or 'ITEM #' in v)
            cp=next(i for i,v in enumerate(H) if 'SQFT' in v and 'PRICE' in v)
            cn=next((i for i,v in enumerate(H) if 'COLLECTION' in v or 'COLOR' in v or 'DESCRIPTION' in v), 0)
            for r in rows[hdr+1:]:
                if len(r)<=max(ci,cp): continue
                item=cell(r[ci]); price=num(r[cp]); name=cell(r[cn])
                if item and price and name:
                    out.append({'name':name,'item':item,'cost':price,'src':tag})

json.dump(out, sys.stdout)
`;
const sheet = JSON.parse(execFileSync('python3', ['-c', PY], { cwd: ROOT, maxBuffer: 1 << 28 }).toString());
const bySrc = sheet.reduce((a, r) => { a[r.src] = (a[r.src] || 0) + 1; return a; }, {});
console.log(`price sheet rows parsed: ${sheet.length}`, bySrc);

const norm = (s) => String(s || '').toUpperCase()
  .replace(/\s*-\s*/g, ' ')
  .replace(/\b\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?\b/g, ' ')
  .replace(/\b(POLISHED|HONED|MATTE|SATIN|BRUSHED|LEATHERED|GLOSSY)\b/g, ' ')
  .replace(/[^A-Z0-9]/g, '');

const idx = new Map();
for (const r of sheet) {
  const k = norm(r.name);
  if (!k) continue;
  if (!idx.has(k)) idx.set(k, []);
  idx.get(k).push(r);
}

const rows = psql(
  `select id, coalesce(sku,''), name, category, coalesce(retail_price,0), coalesce(vendor_cost,0), coalesce(active,false)
     from catalog_products where vendor_id='msi' order by name`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, sku, name, category, retail_price, vendor_cost, active] = l.split('|');
  return { id, sku, name, category, retail_price: +retail_price, vendor_cost: +vendor_cost, active: active === 't' };
});

const matched = [];
let ambiguous = 0, unmatched = 0;
for (const r of rows) {
  const c = idx.get(norm(r.name));
  if (!c) { unmatched++; continue; }
  const costs = [...new Set(c.map((x) => Math.round(x.cost * 100) / 100))];
  if (costs.length > 1) { ambiguous++; continue; }
  matched.push({ ...r, cost: costs[0], item: c[0].item, src: c[0].src });
}
console.log(`catalog rows ${rows.length}: matched ${matched.length} | ambiguous ${ambiguous} | unmatched ${unmatched}\n`);

// Validate against rows that already carry a cost — if the sheet is being read correctly
// those should agree, and disagreement means the parse is wrong, not the database.
const known = matched.filter((m) => m.vendor_cost > 0);
const agree = known.filter((m) => Math.abs(m.vendor_cost - m.cost) < 0.02);
console.log(`VALIDATION against ${known.length} rows that already have a cost:`);
console.log(`   agree within 2c : ${agree.length}  (${known.length ? Math.round((agree.length / known.length) * 100) : 0}%)`);
for (const m of known.filter((x) => Math.abs(x.vendor_cost - x.cost) >= 0.02).slice(0, 8)) {
  console.log(`   differs: ${m.name.slice(0, 30).padEnd(30)} db $${m.vendor_cost.toFixed(2)}  sheet $${m.cost.toFixed(2)}  [${m.src} ${m.item}]`);
}
const fresh = matched.filter((m) => !(m.vendor_cost > 0));
console.log(`\nrows that would GAIN a cost: ${fresh.length}`);
for (const m of fresh.slice(0, 10)) {
  console.log(`   ${m.name.slice(0, 30).padEnd(30)} ${m.category.padEnd(9)} -> $${m.cost.toFixed(2)}  ${m.item}`);
}
if (VERIFY || !WRITE) { console.log('\nDry run — nothing written. --write to apply.'); process.exit(0); }

const esc = (s) => String(s).replace(/'/g, "''");
const vals = matched.map((m) => `('${m.id}'::uuid, ${m.cost}, '${esc(m.item)}')`).join(',\n    ');
const f = path.join(require('os').tmpdir(), `msi-${Date.now()}.sql`);
fs.writeFileSync(f, `begin;
update catalog_products c
   set vendor_cost = v.cost,
       vendor_sku  = v.item,
       lookup_mode = 'sku',
       updated_at  = now()
  from (values
    ${vals}
  ) as v(id, cost, item)
 where c.id = v.id;
commit;`);
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
console.log(`\napplied cost + MSI item id to ${matched.length} rows`);
