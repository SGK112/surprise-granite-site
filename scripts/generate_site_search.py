#!/usr/bin/env python3
"""Generate comprehensive site-wide search index"""

import os
import json
import re
from glob import glob

BASE_PATH = '/Users/homepc/surprise-granite-site'

def extract_page_data(html_path, page_type):
    """Extract search data from HTML file"""
    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Get URL path
        rel_path = html_path.replace(BASE_PATH, '').replace('/index.html', '/').replace('.html', '/')
        if rel_path == '/':
            rel_path = '/'

        # Extract title
        title_match = re.search(r'<title>([^<]+)</title>', content, re.IGNORECASE)
        title = title_match.group(1) if title_match else ''
        title = re.sub(r'\s*\|.*$', '', title).strip()  # Remove site name suffix

        # Extract description
        desc_match = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', content, re.IGNORECASE)
        if not desc_match:
            desc_match = re.search(r'<meta\s+content="([^"]*)"\s+name="description"', content, re.IGNORECASE)
        description = desc_match.group(1) if desc_match else ''

        # Extract og:image
        img_match = re.search(r'property="og:image"\s+content="([^"]+)"', content)
        if not img_match:
            img_match = re.search(r'content="([^"]+)"\s+property="og:image"', content)
        image = img_match.group(1) if img_match else ''

        # Skip empty titles
        if not title or len(title) < 3:
            return None

        return {
            'title': title,
            'description': description[:200] if description else '',
            'url': rel_path,
            'image': image,
            'type': page_type
        }
    except Exception as e:
        print(f"Error processing {html_path}: {e}")
        return None

def load_existing_products():
    """Load existing product search index"""
    try:
        with open(os.path.join(BASE_PATH, 'data', 'search-index.json'), 'r') as f:
            data = json.load(f)
            products = []
            for p in data.get('products', []):
                products.append({
                    'title': p.get('name', ''),
                    'description': f"{p.get('type', '')} - {p.get('primaryColor', '')} - {p.get('brand', '')}".strip(' -'),
                    'url': f"/{p.get('category', 'countertops')}/{p.get('slug', '')}/",
                    'image': p.get('primaryImage', ''),
                    'type': p.get('category', 'countertops'),
                    'brand': p.get('brand', ''),
                    'color': p.get('primaryColor', ''),
                    'material': p.get('type', '')
                })
            return products
    except Exception as e:
        print(f"Error loading products: {e}")
        return []

def main():
    all_items = []

    # 1. Load existing products (countertops, tile, flooring)
    print("Loading products...")
    products = load_existing_products()
    all_items.extend(products)
    print(f"  Loaded {len(products)} products")

    # 2. Blog posts
    print("Indexing blog posts...")
    blog_count = 0
    for html_path in glob(f'{BASE_PATH}/blog/*/index.html'):
        data = extract_page_data(html_path, 'blog')
        if data:
            all_items.append(data)
            blog_count += 1
    print(f"  Indexed {blog_count} blog posts")

    # 3. Tools
    print("Indexing tools...")
    tool_count = 0
    for html_path in glob(f'{BASE_PATH}/tools/*/index.html'):
        data = extract_page_data(html_path, 'tool')
        if data:
            all_items.append(data)
            tool_count += 1
    print(f"  Indexed {tool_count} tools")

    # 4. Services
    print("Indexing services...")
    service_count = 0
    for pattern in [f'{BASE_PATH}/services/*/index.html', f'{BASE_PATH}/services/*/*/index.html']:
        for html_path in glob(pattern):
            data = extract_page_data(html_path, 'service')
            if data:
                all_items.append(data)
                service_count += 1
    print(f"  Indexed {service_count} services")

    # 5. Company pages
    print("Indexing company pages...")
    company_count = 0
    for html_path in glob(f'{BASE_PATH}/company/*/index.html'):
        data = extract_page_data(html_path, 'company')
        if data:
            all_items.append(data)
            company_count += 1
    print(f"  Indexed {company_count} company pages")

    # 6. Vendors
    print("Indexing vendors...")
    vendor_count = 0
    for html_path in glob(f'{BASE_PATH}/vendors/*/index.html'):
        data = extract_page_data(html_path, 'vendor')
        if data:
            all_items.append(data)
            vendor_count += 1
    print(f"  Indexed {vendor_count} vendors")

    # 7. Materials category pages
    print("Indexing material categories...")
    material_count = 0
    for pattern in [f'{BASE_PATH}/materials/*/index.html', f'{BASE_PATH}/materials/*/*/index.html']:
        for html_path in glob(pattern):
            # Skip if it's a product page (those are in the products index)
            if '/materials/countertops/' in html_path or '/materials/flooring/' in html_path:
                continue
            data = extract_page_data(html_path, 'category')
            if data:
                all_items.append(data)
                material_count += 1
    print(f"  Indexed {material_count} material categories")

    # 8. Other important pages
    print("Indexing other pages...")
    other_pages = [
        f'{BASE_PATH}/contact-us/index.html',
        f'{BASE_PATH}/get-a-free-estimate/index.html',
        f'{BASE_PATH}/financing/index.html',
        f'{BASE_PATH}/special-offers/index.html',
        f'{BASE_PATH}/find-a-pro/index.html',
        f'{BASE_PATH}/shop/index.html',
        f'{BASE_PATH}/marketplace/index.html',
    ]
    other_count = 0
    for html_path in other_pages:
        if os.path.exists(html_path):
            data = extract_page_data(html_path, 'page')
            if data:
                all_items.append(data)
                other_count += 1

    # Financing pages
    for html_path in glob(f'{BASE_PATH}/financing/*/index.html'):
        data = extract_page_data(html_path, 'financing')
        if data:
            all_items.append(data)
            other_count += 1

    # Legal pages
    for html_path in glob(f'{BASE_PATH}/legal/*/index.html'):
        data = extract_page_data(html_path, 'legal')
        if data:
            all_items.append(data)
            other_count += 1

    # Products pages (sinks, faucets, etc.)
    for html_path in glob(f'{BASE_PATH}/products/*/index.html'):
        data = extract_page_data(html_path, 'products')
        if data:
            all_items.append(data)
            other_count += 1

    print(f"  Indexed {other_count} other pages")

    # Save search index
    output_path = os.path.join(BASE_PATH, 'data', 'site-search.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({'items': all_items, 'total': len(all_items)}, f, indent=2)

    print(f"\n✓ Created site search index with {len(all_items)} total items")
    print(f"  Saved to: {output_path}")

if __name__ == '__main__':
    main()
