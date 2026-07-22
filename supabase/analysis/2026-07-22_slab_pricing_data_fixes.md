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
