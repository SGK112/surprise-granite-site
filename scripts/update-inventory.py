#!/usr/bin/env python3
"""
Update inventory files with scraped product data.
Merges new products and updates existing ones with fresh images/URLs.
"""

import json
import sys
import re
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
OUTPUT_DIR = SCRIPT_DIR / 'scraper-output'

# --dry-run: compute + report what WOULD change, but write nothing. Safe way to
# preview the scraper's effect on the catalog before letting it mutate files.
DRY_RUN = '--dry-run' in sys.argv

# --add-new: also APPEND products the scrape found that we don't list yet. Off by
# default — new entries currently link to the vendor's own URL (product_url), so
# adding them unreviewed would put off-site links in our search/catalog. The safe
# default is fill-only: enrich images on products we already have, add nothing.
ADD_NEW = '--add-new' in sys.argv


def normalize_name(name: str) -> str:
    """Normalize product name for comparison"""
    # Remove trademark symbols, extra spaces, normalize case
    name = re.sub(r'[®™©]', '', name)
    name = re.sub(r'\s+', ' ', name).strip().lower()
    return name


def load_scraped_products(vendor_filter: str = None):
    """Load most recent scraped products"""
    # Find most recent scraped file
    files = sorted(OUTPUT_DIR.glob('scraped_products_*.json'), reverse=True)
    if not files:
        print("No scraped products found. Run inventory-scraper.py first.")
        return []

    latest = files[0]
    print(f"Loading scraped data from: {latest.name}")

    with open(latest) as f:
        data = json.load(f)

    # Scraper output is normally {"generated","count","items":[...]} but tolerate
    # a bare list too, so a format change never silently yields zero products.
    items = data.get('items', []) if isinstance(data, dict) else data

    if vendor_filter:
        items = [i for i in items if vendor_filter.lower() in i.get('vendor', '').lower()]

    return items


def update_slabs(scraped_products):
    """Update slabs.json with scraped products"""
    slabs_file = DATA_DIR / 'slabs.json'

    with open(slabs_file) as f:
        slabs = json.load(f)

    # Build lookup by normalized name
    existing = {}
    for i, slab in enumerate(slabs):
        key = normalize_name(slab.get('title', ''))
        existing[key] = i

    updated = 0
    added = 0

    for product in scraped_products:
        name = product.get('name', '')
        if not name:
            continue

        key = normalize_name(name)

        if key in existing:
            # Update existing product with new image if we have one
            idx = existing[key]
            if product.get('image_url') and product['image_url'].startswith('http'):
                current_images = slabs[idx].get('images', [])
                new_img = product['image_url']
                # Add new image if not already present
                if new_img not in current_images:
                    if not current_images or 'shopify' not in current_images[0]:
                        # Replace non-Shopify images with fresh ones
                        slabs[idx]['images'] = [new_img] + current_images[:2]
                        updated += 1
        elif ADD_NEW:
            # Add new product (only with --add-new; see ADD_NEW note)
            new_slab = {
                "id": f"scraped-{product.get('vendor', 'unknown')}-{key}",
                "title": name,
                "handle": re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'),
                "vendor": "MSI Surfaces" if 'msi' in product.get('vendor', '').lower() else product.get('vendor', ''),
                "brandDisplay": "MSI" if 'msi' in product.get('vendor', '').lower() else product.get('vendor', ''),
                "brandTier": "premium",
                "productType": product.get('material_type', 'Quartz').title(),
                "category": "slabs",
                "description": product.get('description', f"{name} - Premium surface material"),
                "tags": [
                    f"Primary Color_{product.get('color_family', 'Other').title()}",
                    f"Material_{product.get('material_type', 'Quartz').title()}"
                ],
                "available": True,
                "price": "0.00",
                "currency": "USD",
                "images": [product['image_url']] if product.get('image_url') else [],
                "variants": [],
                "specs": {
                    "source_url": product.get('product_url', ''),
                    "scraped_at": datetime.now().isoformat()
                }
            }
            slabs.append(new_slab)
            added += 1

    # Save updated file
    if DRY_RUN:
        print("  [dry-run] slabs.json NOT written")
    else:
        with open(slabs_file, 'w') as f:
            json.dump(slabs, f, indent=2)

    print(f"Slabs updated: {updated} products refreshed, {added} new products added")
    return updated, added


def update_site_search(scraped_products):
    """Update site-search.json with scraped products"""
    search_file = DATA_DIR / 'site-search.json'

    with open(search_file) as f:
        data = json.load(f)

    # site-search.json is a bare list on disk; an older format wrapped it as
    # {"items":[...]}. Support both and write back in the SAME shape we read.
    if isinstance(data, dict):
        wrapper = data
        items = data.get('items', [])
    else:
        wrapper = None
        items = data

    # Match by normalized NAME (not vendor+name). Vendor labels differ between
    # the scrape ("msi-surfaces") and the index ("MSI Surfaces"/"MSI"), which is
    # why the old vendor-keyed lookup produced ~80 duplicates per run instead of
    # filling blanks. Product names are distinctive enough to dedup on directly.
    existing = {}
    for i, item in enumerate(items):
        title = normalize_name(item.get('title', item.get('name', '')))
        if title and title not in existing:
            existing[title] = i

    updated = 0
    added = 0

    for product in scraped_products:
        name = product.get('name', '')
        vendor = product.get('vendor', '')
        if not name:
            continue

        key = normalize_name(name)

        if key in existing:
            # FILL ONLY: add an image where one is missing; never overwrite an
            # existing image (protects curated/Shopify art from being clobbered).
            idx = existing[key]
            if product.get('image_url') and not items[idx].get('image'):
                items[idx]['image'] = product['image_url']
                updated += 1
        elif ADD_NEW:
            # Add new
            new_item = {
                "title": name,
                "brand": "MSI Surfaces" if 'msi' in vendor.lower() else vendor,
                "type": product.get('material_type', 'quartz'),
                "category": "slabs",
                "url": product.get('product_url', ''),
                "image": product.get('image_url', ''),
                "description": product.get('description', ''),
                "tags": [product.get('color_family', ''), product.get('material_type', '')]
            }
            items.append(new_item)
            existing[key] = len(items) - 1
            added += 1

    out = items if wrapper is None else {**wrapper, 'items': items}

    if DRY_RUN:
        print("  [dry-run] site-search.json NOT written")
    else:
        with open(search_file, 'w') as f:
            json.dump(out, f, indent=2)

    print(f"Site search updated: {updated} products refreshed, {added} new products added")
    return updated, added


def main():
    print("="*60)
    print("INVENTORY UPDATE")
    print("="*60)

    # Load MSI products from scrape
    products = load_scraped_products('msi')

    if not products:
        print("No MSI products to update.")
        return

    print(f"Found {len(products)} MSI products from scrape")
    print(f"  - With images: {sum(1 for p in products if p.get('image_url'))}")
    print()

    # Update inventory files
    print("Updating slabs.json...")
    slabs_updated, slabs_added = update_slabs(products)

    print("\nUpdating site-search.json...")
    search_updated, search_added = update_site_search(products)

    print()
    print("="*60)
    print("UPDATE COMPLETE")
    print("="*60)
    print(f"Slabs: {slabs_updated} updated, {slabs_added} added")
    print(f"Search: {search_updated} updated, {search_added} added")


if __name__ == '__main__':
    main()
