# Slab pricing + classification data fixes — 2026-07-22

Data-only changes applied directly to `catalog_products` (no schema change, so no
migration). Recorded here because migrations are manual and these decisions are
not recoverable from the code.

Backups (restore is a straight replay of the prior values):

| File | Covers |
|---|---|
| `~/sg-backups/retail_price_before_markup.json` | all 2,421 active slab `retail_price` |
| `~/sg-backups/price_unit_before_relabel.txt` | 912 rows' prior `price_unit` |
| `~/sg-backups/subcategory_before_semiprecious.txt` | 34 rows' prior `subcategory` |
| `~/sg-backups/borrowed_costs_before_clear.txt` | 6 rows' prior `vendor_cost` |

## 1. Published 82 missing slab prices

`scripts/apply-retail-markup.js --only-unpriced --write`, at `vendor_config`'s
30% markup. 30% was confirmed empirically first: 96.5% of already-priced slabs
sit at exactly 1.30 and all 16 slab vendors are configured at 30. (A note
claiming `cost x 1.085 tax x 1.35` = 1.465 does NOT hold for slabs — zero rows
use it.)

The `--only-unpriced` flag was added for this. A full run wanted to change 150
rows; only 82 were unpriced. Among the rest it would have CUT Calacatta Gold
$110.50 -> $18.58 and Lincoln White $89.64 -> $23.14, because their `vendor_cost`
is one of the repeated bad values. Marking up a bad cost publishes a bad price.

Verified by diffing the DB against the backup: exactly 82 rows changed, all
previously NULL, zero existing prices touched.

## 2. `price_unit` 'each' -> 'sqft' on 912 slab rows

The label was an import artifact — `import-shopify-vendor-catalog.js` and
`import-cactus-colors.js` both hardcode `price_unit: 'each'`. It is not cosmetic:
`tools/blueprint-takeoff` renders `${price}/${price_unit}` literally, so a
per-sqft slab displayed as **"$18.46/each"**.

Scope: `category='slab'`, `vendor_id <> 'the-yard-az'`, `retail_price` in the
$3–300 band the rest of the codebase already treats as per-sqft. The Yard is
excluded because its prices genuinely ARE per-piece.

Result: 1,603 rows `sqft` ($6.76–273, zero Yard) / 185 `each` ($318+, 178 Yard).

## 3. Semi-precious stones misfiled as Granite/Marble

Reclassified 5 (Amethyst, Amazonite x2, Sodalite, Petrified Forest) to
`Semi-Precious`, and normalised 4 rows from `Semi-precious` to `Semi-Precious`
(two spellings split the browse facet into two buckets).

Confirmed by cost, not by name alone: cactus-stone's known semi-precious agates
all cost exactly $195, and so does Amethyst; the granite median is $18.27.

**Deliberately NOT reclassified** — engineered quartz and porcelain colours
merely NAMED after minerals: daltile "Obsidian"/"Jasper Grey"/"Smoked Geode"
(porcelain), arizona-tile "Citrine", cosentino "Ocean Jasper", bolder-image-stone
"Agate Quartz"/"Carrara Opal". Also left daltile "Amazonite" as Granite — at
$39.52 it is the real Brazilian granite, not the mineral.

Granite median is now $21.03, Semi-Precious $175.50.

## 4. The four "corrupt" slab costs — they were not corrupt

`vendor_cost` of 1305.04 / 1166.98 appeared on rows across four vendors AND three
materials. The CRM price library (`lineitemlibraries`) explains it:

    Aura            -> vendor ESI,              cost 1305.04, unit 'each'
    Calacatta Extra -> vendor ESI,              cost 1305.04, unit 'each'
    Crescent Veil   -> vendor Classic Surfaces, cost 1166.98, unit 'each'

They are real WHOLE-SLAB prices. Something matched them on NAME ONLY, so ESI's
slab cost landed on same-named colours belonging to Cosentino and Monterrey Tile.

Cleared `vendor_cost` on the 5 rows whose vendor does not match the price
library. Kept `classic-surfaces / crescent-veil-pick-up-only-1` — its vendor
matches, it is a "pick up only" whole piece, and $1,166.98 -> $1,517.08 is
correct for one.

NOT contamination, do not "fix": hanstone `Aramis Quartz` ($931.25) and
`Bavaria Quartz` ($740) show vendor ESI in the price library because ESI is the
stone YARD that carries the Hanstone brand (see `brandKeys` in
`data/stone-yards.json`: `esi -> [esi, hanstone]`). Supplier vs brand, both correct.

### Root cause NOT pinned

`sync-vendor-cost.js` is clean — its `perSqft()` returns null rather than writing
an `each` cost raw. `import-vendor-colors.js` is clean — it filters `unit:'sqft'`.
The likely source is the Shopify path (`import-shopify-vendor-catalog.js` sets
`vendor_cost: inv?.dealerCost` alongside `price_unit:'each'`), but that was not
proven. If these values reappear, start there.

## Still open

- 9 sample chips carry a cost and no price. Correctly excluded by the markup
  script — they are $12.99 chips, not slabs.
- 3 whole-slab-priced rows (hanstone x2, classic-surfaces x1) have a real price
  but render "Call for pricing", because `withInstalled()` only quotes per-sqft
  material at or under $500. Showing "$1,210.63 per slab" would need a
  whole-piece display path that does not exist yet.

---

# Follow-up sweep — same day

## 5. Sample parity: client button vs checkout (2 real 400s fixed)

`js/sampleable.js` decides whether the "Order Sample" button renders;
`api/validators/price-validator.js` (wired into Stripe checkout at
`api/routes/stripe.js:204`) decides whether checkout accepts it. Two Arizona Tile
quartz colours — `glisten` and `statuary-nebula` — were OFFERED by the client but
had `sample_eligible=false`, so a buyer who clicked Order Sample got
"We don't offer samples of ...". 64 of their 66 Arizona Tile quartz siblings are
eligible at $12.99 and nothing marked these two discontinued or out of stock, so
it was a data gap. Set eligible + $12.99.

Also set `sample_price=12.99` on `soapstone-metropolis-concrete` (eligible, no
display price). Checkout never failed on it — the validator uses the
`SAMPLE_PRICE_CENTS` constant, not the DB column — but the PDP had nothing to show.

Verified afterwards by running the REAL `isSampleable()` over all 2,421 active
slabs: 0 offered-but-refused, 0 eligible-but-hidden.

Backup: `~/sg-backups/sample_flags_before.txt`

## Three things that looked broken and are NOT — do not "fix" these

1. **`/materials/all-cabinets/`** renders fine (3,821px: 3 cabinet brands, 14 door
   styles). An early check called it empty; that was measuring before Webflow's
   tab component rendered and looking for `.pc`/`.product-card` selectors this
   page does not use. The `/data/cabinets.json` reference in
   `js/swipe-cards-universal.js` is unreachable dead code — the branch keys off
   `path.includes('cabinet')` and no page that loads that script has 'cabinet' in
   its URL. No request for the missing file is ever made.

2. **`price-validator.js` reading `data/countertops.json`** is not a stale-data
   bug. `resolveSampleableProduct()` queries `catalog_products` FIRST and treats
   `sample_eligible` as the verdict either way; the static list is only a fallback
   for carts carrying slugs that no longer exist in the catalog. 388 catalog
   sample-eligible slabs are absent from countertops.json and all of them resolve
   correctly through the catalog path.

3. **63 LX Viatera slabs under `vendor_id='monterrey-tile'`** are NOT a parity
   break. `monterrey-tile` is absent from `SAMPLE_VENDOR_IDS`, but
   `fromSampleableVendor()` checks `SAMPLE_SUB_BRANDS` (['lx-viatera','lx-hausys'])
   against the BRAND before it ever reads `vendor_id`. Confirmed by calling
   `isSampleable()` directly: true.

Lesson for the next sweep: test candidate rules by CALLING the shipped function,
not by re-implementing them in SQL. Both false alarms above came from an
approximation that dropped a branch the real code has.

## Remaining known-stale, deliberately left alone

`marketplace/slabs/detail/` and `marketplace/tile/product.html` still read static
JSON, but both are orphaned: not linked from any page (the only reference to
`MARKETPLACE_DETAIL` is its own definition in `js/config.js`) and absent from
every sitemap. Converting them is low value; deleting them is a separate call.

---

# Correction to §4 — one cost was cleared wrongly

`hanstone-aura-quartz` should NOT have had its `vendor_cost` cleared. Restored to
1305.04.

The clearing rule was "price-library vendor != catalog vendor". The library says
`Aura -> vendor ESI`; the catalog row says `vendor_id=hanstone`, so the rule fired.
But ESI is the stone YARD that carries the Hanstone BRAND
(`data/stone-yards.json`: `esi -> [esi, hanstone]`) — the exact supplier-vs-brand
relationship §4 itself flags as legitimate for Aramis Quartz and Bavaria Quartz.
The rule and the caveat contradicted each other and the rule won.

Proof it belongs there: `retail_price` is 1696.55 = 1305.04 x 1.30, i.e. the row
was priced FROM that cost. And every other hanstone whole-slab row sits at ratio
exactly 1.3000 — Aura Quartz was the sole outlier while the cost was missing.

The other four clears stand: Cosentino and Monterrey Tile are not ESI-supplied,
and Classic Surfaces is not ESI, so those really are name collisions.

## Dimensions for the still-unpriced rows

Asked whether dimensions could convert the whole-slab cost to per-sqft. Two of the
four have dimensions, recorded in `specs` with provenance:

| row | slab_size | sqft | source |
|---|---|---|---|
| `aura-dekton` (cosentino) | 126" x 57" | 49.9 | Dekton technical manual |
| `aura-quartz-monterrey` | 126" x 63" (typ.) | 55.1 | LX Viatera pamphlet |
| `calacattaextra-quartz-classic` | — | — | none |
| `crescent-veil` (cosentino) | — | — | none |

Dimensions do NOT unlock these. The $1,305.04 is ESI/Hanstone's cost for a
DIFFERENT product that happens to also be called "Aura"; dividing it by Cosentino's
or Monterrey's slab area would just launder one vendor's price into another's.
These four need a real cost from their own vendor.

They are already handled correctly in the meantime: all four carry
`specs.needs_quote = true` and `specs.priced_from = "no-cost-in-crm"` (774 and 596
rows respectively site-wide), so they quote rather than publish a wrong price.

The price library has no dimensions either — `description` holds only the ESI SKUs
(`MV531J`, `BG884J`), and neither appears anywhere in the catalog.
