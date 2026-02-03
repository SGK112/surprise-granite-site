#!/usr/bin/env python3
"""
Cleanup script for slabs.json
- Removes non-product category pages
- Replaces broken/tracking image URLs with local images
- Updates Cosentino API URLs to use local images where available
"""

import json
import os
from urllib.parse import urlparse

# Paths
DATA_FILE = '/Users/homepc/surprise-granite-site/data/slabs.json'
BACKUP_FILE = '/Users/homepc/surprise-granite-site/data/slabs.json.backup'
LOCAL_IMAGES_DIR = '/Users/homepc/surprise-granite-site/images/products'

# Known bad domains (tracking pixels, ads, etc.)
BAD_DOMAINS = [
    't.teads.tv',
    'ipv4.d.adroll.com',
    'doubleclick.net',
    'adroll.com',
    'edgebanding-services.com',
    'fundacioneduardajusto.es',
]

# Category page patterns (not actual products)
CATEGORY_PATTERNS = [
    'maintenance',
    'kitchen-countertops',
    'kitchen-cladding',
    'kitchen-claddings',
    'kitchen-floors',
    'kitchen-furniture',
    'kitchen-flooring',
    'bathroom-sink',
    'bathroom-claddings',
    'bathroom-countertops',
    'bathroom-flooring',
    'bathroom-remodelings',
    'shower-trays',
    'furniture',
    'interior-cladding',
    'what-is-dekton',
    'what-is-silestone',
    'what-is-sensa',
    'what-is-scalea',
    'what-is-clos',
    'colors',
    'sinks',
    'earthic',
    'outdoor-countertops',
    'outdoor',
    'facades',
    'cladding',
    'claddings',
    'countertops',
    'flooring',
    'floorings',
    'floor-coverings',
    'kitchens',
    'bathrooms',
    'living-room',
    'swimming-pools',
    'outside-use-kitchens',
    'kitchen-visualizer',
    'bathroom-visualizer',
    'warranty',
    'visualizer',
    '-edition',  # Product lines, not products
    'dekton-ukiyo',
    'dekton-pietra-kode',
]

# Exact matches to remove (category pages, not products)
EXACT_REMOVE = {
    'flooring', 'facades', 'cladding', 'countertops', 'claddings',
    'kitchens', 'bathrooms', 'colors', 'warranty', 'outdoor',
    'floorings', 'living-room', 'floor-coverings',
}

def get_local_images():
    """Get set of local image files"""
    if os.path.exists(LOCAL_IMAGES_DIR):
        return set(os.listdir(LOCAL_IMAGES_DIR))
    return set()

def find_local_image(handle, local_images):
    """Find a local image that matches the product handle"""
    # Try various naming patterns
    patterns = [
        f"{handle}.jpg",
        f"{handle}.webp",
        f"{handle}.jpeg",
        f"{handle}.png",
        f"{handle}-quartz.jpg",
        f"{handle}-quartz.webp",
        f"{handle}-granite.jpg",
        f"{handle}-granite.webp",
    ]

    for pattern in patterns:
        if pattern in local_images:
            return pattern

    # Try partial matching for handles with -quartz or -granite suffix
    handle_base = handle.replace('-quartz', '').replace('-granite', '').replace('-sample', '')
    for pattern in [f"{handle_base}.jpg", f"{handle_base}.webp", f"{handle_base}-quartz.jpg", f"{handle_base}-quartz.webp"]:
        if pattern in local_images:
            return pattern

    return None

def is_bad_url(url):
    """Check if URL is from a bad/tracking domain"""
    if not url:
        return True
    # Data URLs (SVG placeholders) are bad
    if url.startswith('data:'):
        return True
    domain = urlparse(url).netloc.lower()
    return any(bad in domain for bad in BAD_DOMAINS)

def is_cosentino_api(url):
    """Check if URL is from Cosentino API (often fails)"""
    if not url:
        return False
    return 'assetstools.cosentino.com' in url.lower()

def is_category_page(handle):
    """Check if handle represents a category page, not a product"""
    handle_lower = handle.lower()
    # Exact match
    if handle_lower in EXACT_REMOVE:
        return True
    # Pattern match
    return any(cat in handle_lower for cat in CATEGORY_PATTERNS)

def cleanup_slabs():
    """Main cleanup function"""
    # Load data
    with open(DATA_FILE, 'r') as f:
        data = json.load(f)

    # Create backup
    with open(BACKUP_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Created backup at {BACKUP_FILE}")

    # Get products list
    products = data if isinstance(data, list) else data.get('products', data.get('data', []))

    # Get local images
    local_images = get_local_images()
    print(f"Found {len(local_images)} local images")

    # Track changes
    stats = {
        'total': len(products),
        'removed_category_pages': 0,
        'replaced_bad_urls': 0,
        'replaced_cosentino': 0,
        'added_local_images': 0,
        'kept_unchanged': 0,
    }

    cleaned_products = []

    for product in products:
        handle = product.get('handle', '')

        # Skip category pages
        if is_category_page(handle):
            stats['removed_category_pages'] += 1
            continue

        images = product.get('images', [])
        first_image = images[0] if images else ''

        # Find local image
        local_img = find_local_image(handle, local_images)
        local_url = f"/images/products/{local_img}" if local_img else None

        # Determine if we need to replace the image
        needs_replacement = False

        if is_bad_url(first_image):
            needs_replacement = True
            stats['replaced_bad_urls'] += 1
        elif is_cosentino_api(first_image) and local_url:
            needs_replacement = True
            stats['replaced_cosentino'] += 1

        if needs_replacement and local_url:
            product['images'] = [local_url]
            stats['added_local_images'] += 1
        elif needs_replacement and not local_url:
            # Product has bad URL and no local image - remove it
            stats['removed_category_pages'] += 1
            continue
        else:
            stats['kept_unchanged'] += 1

        # Remove _needs_image marker if it exists
        if '_needs_image' in product:
            del product['_needs_image']

        cleaned_products.append(product)

    # Save cleaned data
    if isinstance(data, list):
        output_data = cleaned_products
    else:
        data['products'] = cleaned_products
        output_data = data

    with open(DATA_FILE, 'w') as f:
        json.dump(output_data, f, indent=2)

    # Print summary
    print("\n=== CLEANUP SUMMARY ===")
    print(f"Original products: {stats['total']}")
    print(f"Removed category pages: {stats['removed_category_pages']}")
    print(f"Replaced bad/tracking URLs: {stats['replaced_bad_urls']}")
    print(f"Replaced Cosentino API URLs: {stats['replaced_cosentino']}")
    print(f"Added local images: {stats['added_local_images']}")
    print(f"Kept unchanged: {stats['kept_unchanged']}")
    print(f"Final product count: {len(cleaned_products)}")

    # List products still needing images
    needs_images = [p['handle'] for p in cleaned_products if p.get('_needs_image')]
    if needs_images:
        print(f"\n{len(needs_images)} products still need images:")
        for h in needs_images[:20]:
            print(f"  - {h}")
        if len(needs_images) > 20:
            print(f"  ... and {len(needs_images) - 20} more")

if __name__ == '__main__':
    cleanup_slabs()
