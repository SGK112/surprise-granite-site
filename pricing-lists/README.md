# Vendor Price Lists

Drop vendor cost/price lists here, one folder per vendor, then run the importer.
This updates `catalog_products.vendor_cost` (your cost) and recomputes
`retail_price` from the vendor's markup in `vendor_config` (so reps only need
to send COST — your sell price derives automatically).

## How to add a vendor's pricing
1. Put the file at `pricing-lists/<vendor_id>/<anything>.csv`
   (vendor_id matches vendor_config, e.g. `kibi`, `ruvati`, `vigo`, `msi`).
2. CSV header (case-insensitive). One of `sku` or `name` is required:
       sku,cost,retail,name
   - `sku`    — matches catalog_products.sku (best match key)
   - `cost`   — your wholesale cost (number; $ and commas ok)
   - `retail` — optional; if omitted, retail = cost * (1 + vendor markup)
   - `name`   — optional fallback match if no sku
3. Run:  `node scripts/import-price-list.mjs <vendor_id> pricing-lists/<vendor_id>/<file>.csv`
   (add `--commit` to write; without it you get a dry-run report).

## Notes
- Markup per vendor is set in vendor_config.default_markup_pct (25–35% today).
- PDFs/Excel: convert to CSV first (Excel → Save As CSV). The Monterrey
  importer (scripts/import-monterrey.mjs) shows how to parse PDFs if needed.
- Most urgent vendors with NO pricing: monterrey-tile, lions-floor.
