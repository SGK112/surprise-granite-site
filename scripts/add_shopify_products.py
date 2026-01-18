#!/usr/bin/env python3
"""Add shopify-products.js to all product HTML pages (countertops, flooring, tile)"""

import glob

SCRIPT_TAG = '<script src="/js/shopify-products.js"></script>\n'
OLD_TILE_SCRIPT = '<script src="/js/shopify-tiles.js"></script>\n'

def add_script(filepath):
    """Add shopify-products script before </body> if not present"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        modified = False

        # Remove old shopify-tiles.js if present
        if 'shopify-tiles.js' in content:
            content = content.replace(OLD_TILE_SCRIPT, '')
            modified = True

        # Skip if already has shopify-products.js
        if 'shopify-products.js' in content:
            if modified:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                return True
            return False

        if '</body>' not in content:
            return False

        # Add before </body>
        new_content = content.replace('</body>', SCRIPT_TAG + '</body>')

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return True
    except Exception as e:
        print(f"Error {filepath}: {e}")
        return False

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'

    patterns = [
        # Countertops
        f'{base}/countertops/*/index.html',
        f'{base}/materials/all-countertops/index.html',
        f'{base}/materials/countertops/*/index.html',

        # Flooring
        f'{base}/flooring/*/index.html',
        f'{base}/materials/flooring/index.html',
        f'{base}/materials/flooring/*/index.html',

        # Tile
        f'{base}/tile/*/index.html',
        f'{base}/materials/all-tile/index.html',
    ]

    updated = 0
    for pattern in patterns:
        for filepath in glob.glob(pattern, recursive=True):
            if add_script(filepath):
                updated += 1
                print(f"Updated: {filepath}")

    print(f"\nAdded Shopify products to {updated} pages")
