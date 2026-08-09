#!/usr/bin/env node
/**
 * Build data/shipping-freight.json — the per-SKU freight surcharge for oversized items.
 *
 * WHY THIS EXISTS. The storefront charges a flat shipping tier (<$100 → $15, $100–499 → $25,
 * $500+ → free). That works fine for parcel goods, but Alfi's freight items — tubs, toilets,
 * shower panels — cost $460–$790 to ship. And because the expensive items are also the heavy
 * ones, every single one of them clears the $500 threshold and ships FREE. Measured against the
 * JAN 2026 datasheets, 48 of 301 matched products lost money on a single-item order, the worst
 * at -$326. The threshold did the exact opposite of what it was meant to do.
 *
 * So: parcel items keep free-over-$500 (that promise is what brings people back, and it is
 * affordable at our margin). Freight-class items carry their real freight cost, shown as its own
 * line at checkout. Nothing is repriced — Whitehaus prices are MAP-constrained and repricing is
 * the owner's call, not a shipping fix.
 *
 * ⚠️ data/ IS PUBLICLY SERVED. This file therefore contains ONLY the freight amount a customer
 * would pay. Never write MSRP, dealer cost, or multipliers into data/.
 *
 * Source: the vendor datasheets Kim Tiamzon emails (there is no Alfi dealer portal).
 * Usage: node scripts/build-freight-table.js "<whitehaus.xlsx>" "<alfi-eago.xlsx>" [--write]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'shipping-freight.json');
const WRITE = process.argv.includes('--write');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (files.length < 2) {
  console.error('usage: build-freight-table.js "<whitehaus.xlsx>" "<alfi-eago.xlsx>" [--write]');
  process.exit(1);
}

// An item ships freight if the vendor says so, or if ground alone costs this much — no parcel
// package costs $100 to ship, so that threshold catches oversized rows the flag missed.
const FREIGHT_FLOOR = 100;

// openpyxl is the only xlsx reader available here; node has no xlsx dependency and adding one
// for a file that changes twice a year is not worth it.
const PY = `
import json, sys, warnings
warnings.filterwarnings("ignore")
import openpyxl

def rows(p):
    ws = openpyxl.load_workbook(p, data_only=True)["Sheet1"]
    data = list(ws.iter_rows(values_only=True))
    hdr = [str(h).strip() if h is not None else "" for h in data[0]]
    return hdr, data[1:]

out = {}

# --- Whitehaus: SkuNumber / FedEx Ground / LTL Charge ---
hdr, data = rows(sys.argv[1])
i = {h: n for n, h in enumerate(hdr)}
for r in data:
    sku = r[i["SkuNumber"]]
    if not sku:
        continue
    ground = r[i.get("FedEx Ground", -1)] or 0
    ltl = r[i.get("LTL Charge", -1)] or 0
    out[str(sku).strip().upper()] = {"ground": float(ground or 0), "ltl": float(ltl or 0), "flag": False}

# --- ALFI / EAGO: SKU / FedEx Ground / LTL Freight / Foam Packing Fee / Ships Freight? ---
hdr, data = rows(sys.argv[2])
i = {h: n for n, h in enumerate(hdr)}
for r in data:
    sku = r[i["SKU"]]
    if not sku:
        continue
    ground = r[i["FedEx Ground"]] or 0
    ltl = r[i["LTL Freight"]] or 0
    foam = r[i["Foam Packing Fee"]] or 0
    flag = str(r[i["Ships Freight?"]]).strip().lower() in ("yes", "true", "y", "1")
    out[str(sku).strip().upper()] = {
        "ground": float(ground or 0) + float(foam or 0),
        "ltl": float(ltl or 0),
        "flag": flag,
    }

json.dump(out, sys.stdout)
`;

const raw = execFileSync('python3', ['-c', PY, files[0], files[1]], { maxBuffer: 1 << 28 }).toString();
const parsed = JSON.parse(raw);

// The cart identifies an item by its SLUG (item.id), not the vendor SKU, so the lookup table has
// to be slug-keyed or the browser can never match a row. Join through the live catalog.
const API = 'https://surprise-granite-email-api.onrender.com';
const skuToSlugs = {};
{
  const total = JSON.parse(execFileSync('curl', ['-s', '-m', '60', `${API}/api/catalog?limit=1`], { maxBuffer: 1 << 26 })).total || 0;
  for (let off = 0; off < total; off += 250) {
    const page = JSON.parse(execFileSync('curl', ['-s', '-m', '90', `${API}/api/catalog?limit=250&offset=${off}`], { maxBuffer: 1 << 28 }));
    for (const p of page.products || []) {
      const sku = String(p.sku || '').trim().toUpperCase();
      if (sku && p.slug) (skuToSlugs[sku] = skuToSlugs[sku] || []).push(String(p.slug).toLowerCase());
    }
  }
}

// Two classes, because they get different treatment:
//   ltl    — oversized/freight. Always billed its real freight, kept out of the tier.
//   parcel — normal ground. Keeps free-over-$500 (a ~30% margin absorbs sub-$100 freight),
//            but below the free threshold it bills max(tier, real freight) so a $60 ground
//            charge can never hide behind a $15 tier.
const table = {};
const parcel = {};
let ltlCount = 0, parcelCount = 0, unmatched = 0;
for (const [sku, v] of Object.entries(parsed)) {
  // Real cost to get it to the customer: LTL when it ships freight, otherwise ground.
  const cost = Math.max(v.ltl || 0, v.ground || 0);
  if (cost <= 0) continue;
  const amount = Math.ceil(cost);              // whole dollars, never round down
  const isFreight = v.flag || cost >= FREIGHT_FLOOR;
  const target = isFreight ? table : parcel;
  if (isFreight) ltlCount++; else parcelCount++;
  target[sku] = amount;                        // SKU key, for any surface that has one
  const slugs = skuToSlugs[sku];
  if (!slugs) { unmatched++; continue; }
  for (const s of slugs) target[s] = amount;   // slug key — what the cart actually looks up
}

const payload = {
  _comment: 'Real delivery cost per SKU, keyed by slug and SKU. `freight` = oversized/LTL, always billed. `parcel` = ground, used only to stop a cheap tier undercharging below the free-shipping threshold. Contains NO cost or MSRP data - data/ is public. Generated by scripts/build-freight-table.js - do not hand-edit.',
  _generated_from: files.map((f) => path.basename(f)),
  freight: table,
  parcel,
};

console.log(`SKUs in datasheets     : ${Object.keys(parsed).length}`);
console.log(`oversized / LTL SKUs   : ${ltlCount}`);
console.log(`parcel SKUs w/ freight : ${parcelCount}`);
console.log(`  not in our catalog   : ${unmatched} (sku key only)`);
console.log(`table entries (sku+slug): ${Object.keys(table).length} ltl + ${Object.keys(parcel).length} parcel`);
const vals = Object.values(table).sort((a, b) => a - b);
if (vals.length) {
  console.log(`freight range          : $${vals[0]} – $${vals[vals.length - 1]} (median $${vals[Math.floor(vals.length / 2)]})`);
}
if (WRITE) {
  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
} else {
  console.log('\nDry run. Re-run with --write to apply.');
}
