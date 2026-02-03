#!/usr/bin/env python3
"""
Enrich slabs.json with data from countertops.json
- Adds multiple images where available
- Adds colors, style, brand info
- Preserves existing slabs.json data for products not in countertops.json
"""

import json
import os
from difflib import SequenceMatcher

# Paths
SLABS_FILE = '/Users/homepc/surprise-granite-site/data/slabs.json'
COUNTERTOPS_FILE = '/Users/homepc/surprise-granite-site/data/countertops.json'
BACKUP_FILE = '/Users/homepc/surprise-granite-site/data/slabs.json.pre-enrich.backup'

def normalize_slug(slug):
    """Normalize slug for matching"""
    return slug.lower().replace('-quartz', '').replace('-granite', '').replace('-marble', '').replace('-sample', '').replace('-dekton', '').strip()

def similar(a, b):
    """Check string similarity"""
    return SequenceMatcher(None, a, b).ratio()

def find_matching_countertop(slab_handle, slab_title, countertops_by_slug, countertops_by_name):
    """Find a matching countertop product"""
    normalized = normalize_slug(slab_handle)

    # Try direct slug match variations
    for suffix in ['', '-quartz', '-granite', '-marble']:
        candidate = normalized + suffix
        if candidate in countertops_by_slug:
            return countertops_by_slug[candidate]

    # Try with the full handle
    if slab_handle in countertops_by_slug:
        return countertops_by_slug[slab_handle]

    # Try name match
    slab_name = slab_title.lower().strip()
    if slab_name in countertops_by_name:
        return countertops_by_name[slab_name]

    # Try fuzzy matching on normalized slug
    best_match = None
    best_score = 0.85  # Minimum threshold

    for slug, product in countertops_by_slug.items():
        score = similar(normalized, normalize_slug(slug))
        if score > best_score:
            best_score = score
            best_match = product

    return best_match

def enrich_slabs():
    """Main enrichment function"""
    # Load data
    with open(SLABS_FILE, 'r') as f:
        slabs_data = json.load(f)

    with open(COUNTERTOPS_FILE, 'r') as f:
        countertops_data = json.load(f)

    # Create backup
    with open(BACKUP_FILE, 'w') as f:
        json.dump(slabs_data, f, indent=2)
    print(f"Created backup at {BACKUP_FILE}")

    # Get products lists
    slabs = slabs_data if isinstance(slabs_data, list) else slabs_data.get('products', slabs_data.get('data', []))
    countertops = countertops_data.get('countertops', countertops_data) if isinstance(countertops_data, dict) else countertops_data

    print(f"Slabs products: {len(slabs)}")
    print(f"Countertops products: {len(countertops)}")

    # Index countertops by slug and name for fast lookup
    countertops_by_slug = {p['slug']: p for p in countertops}
    countertops_by_name = {p['name'].lower().strip(): p for p in countertops}

    # Track stats
    stats = {
        'enriched': 0,
        'not_found': 0,
        'already_rich': 0,
    }

    enriched_products = []

    for slab in slabs:
        handle = slab.get('handle', '')
        title = slab.get('title', '')
        current_images = slab.get('images', [])

        # Check if already has multiple images
        if len(current_images) >= 3:
            stats['already_rich'] += 1
            enriched_products.append(slab)
            continue

        # Find matching countertop
        match = find_matching_countertop(handle, title, countertops_by_slug, countertops_by_name)

        if match:
            # Enrich with countertops data
            enriched = slab.copy()

            # Add images (prefer countertops images if they have more)
            ct_images = match.get('images', [])
            if len(ct_images) > len(current_images):
                enriched['images'] = ct_images

            # Add colors if not present
            if not enriched.get('primaryColor'):
                enriched['primaryColor'] = match.get('primaryColor', '')
            if not enriched.get('accentColor'):
                enriched['accentColor'] = match.get('accentColor', '')

            # Add style if not present
            if not enriched.get('style'):
                enriched['style'] = match.get('style', '')

            # Add brand display name
            if not enriched.get('brandDisplay') or enriched.get('brandDisplay') == enriched.get('vendor'):
                enriched['brandDisplay'] = match.get('brandDisplay', match.get('brand', ''))

            # Add views/trending if not present
            if not enriched.get('views'):
                enriched['views'] = match.get('views', 0)
            if not enriched.get('trending'):
                enriched['trending'] = match.get('trending', 0)

            # Add featured flag
            if match.get('featured'):
                enriched['featured'] = True

            # Store slug reference for linking
            enriched['countertopSlug'] = match.get('slug', '')

            stats['enriched'] += 1
            enriched_products.append(enriched)
        else:
            stats['not_found'] += 1
            enriched_products.append(slab)

    # Save enriched data
    if isinstance(slabs_data, list):
        output_data = enriched_products
    else:
        slabs_data['products'] = enriched_products
        output_data = slabs_data

    with open(SLABS_FILE, 'w') as f:
        json.dump(output_data, f, indent=2)

    # Print summary
    print("\n=== ENRICHMENT SUMMARY ===")
    print(f"Products enriched with countertops data: {stats['enriched']}")
    print(f"Already had rich data: {stats['already_rich']}")
    print(f"No matching countertop found: {stats['not_found']}")
    print(f"Total products: {len(enriched_products)}")

    # Show some examples of enriched products
    print("\n=== SAMPLE ENRICHED PRODUCTS ===")
    enriched_samples = [p for p in enriched_products if p.get('countertopSlug')][:10]
    for p in enriched_samples:
        print(f"  {p.get('handle')} -> {p.get('countertopSlug')}: {len(p.get('images', []))} images")

if __name__ == '__main__':
    enrich_slabs()
