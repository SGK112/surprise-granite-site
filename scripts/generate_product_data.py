#!/usr/bin/env python3
"""Generate JSON data for tile and flooring products from HTML files"""

import os
import json
import re
from glob import glob

def extract_product_data(html_path, product_type):
    """Extract product data from HTML file"""
    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Get slug from path
        slug = os.path.basename(os.path.dirname(html_path))

        # Extract title from h1 or og:title
        title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', content)
        if not title_match:
            title_match = re.search(r'property="og:title"\s+content="([^"]+)"', content)
        title = title_match.group(1).strip() if title_match else slug.replace('-', ' ').title()

        # Clean title - remove brand suffix
        title = re.sub(r'\s*\|\s*.*$', '', title).strip()

        # Extract image
        image_match = re.search(r'property="og:image"\s+content="([^"]+)"', content)
        image = image_match.group(1) if image_match else ''

        # Try to extract brand from title or content
        brand = ''
        brand_patterns = ['MSI', 'Daltile', 'Cosentino', 'Cambria', 'Arizona Tile']
        for bp in brand_patterns:
            if bp.lower() in content.lower():
                brand = bp.lower().replace(' ', '-')
                break

        # Extract color from content or slug
        colors = ['white', 'gray', 'grey', 'black', 'brown', 'beige', 'blue', 'green', 'gold', 'cream', 'taupe']
        primary_color = ''
        for color in colors:
            if color in slug.lower() or color in title.lower():
                primary_color = color.capitalize()
                break

        # Extract material type
        material = product_type.capitalize()
        if 'vinyl' in slug.lower() or 'lvp' in slug.lower():
            material = 'Luxury Vinyl'
        elif 'travertine' in slug.lower():
            material = 'Travertine'
        elif 'marble' in slug.lower():
            material = 'Marble'
        elif 'porcelain' in slug.lower():
            material = 'Porcelain'
        elif 'ceramic' in slug.lower():
            material = 'Ceramic'
        elif 'mosaic' in slug.lower():
            material = 'Mosaic'

        return {
            'name': title,
            'slug': slug,
            'brand': brand,
            'primaryImage': image,
            'primaryColor': primary_color or 'Multi',
            'type': material,
            'category': product_type
        }
    except Exception as e:
        print(f"Error processing {html_path}: {e}")
        return None

def generate_json(base_path, product_type, output_file):
    """Generate JSON for a product type"""
    products = []
    pattern = os.path.join(base_path, product_type, '*/index.html')

    for html_path in glob(pattern):
        data = extract_product_data(html_path, product_type)
        if data:
            products.append(data)

    # Sort by name
    products.sort(key=lambda x: x['name'])

    output_path = os.path.join(base_path, 'data', output_file)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({product_type: products}, f, indent=2)

    print(f"Generated {output_file} with {len(products)} products")
    return products

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'

    tile_products = generate_json(base, 'tile', 'tile.json')
    flooring_products = generate_json(base, 'flooring', 'flooring.json')

    # Also create a combined search index
    all_products = []

    # Load countertops
    with open(os.path.join(base, 'data', 'countertops.json'), 'r') as f:
        countertops_data = json.load(f)
        for p in countertops_data.get('countertops', []):
            p['category'] = 'countertops'
            all_products.append(p)

    # Add tile
    for p in tile_products:
        all_products.append(p)

    # Add flooring
    for p in flooring_products:
        all_products.append(p)

    # Save combined index
    with open(os.path.join(base, 'data', 'search-index.json'), 'w') as f:
        json.dump({'products': all_products}, f, indent=2)

    print(f"\nTotal search index: {len(all_products)} products")
