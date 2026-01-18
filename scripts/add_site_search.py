#!/usr/bin/env python3
"""Add site-search.js to all HTML pages and remove old product-search.js"""

import glob

NEW_SCRIPT = '<script src="/js/site-search.js"></script>\n'
OLD_SCRIPT = '<script src="/js/product-search.js"></script>\n'

def update_file(filepath):
    """Update HTML file with new search script"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        modified = False

        # Remove old product-search.js if present
        if 'product-search.js' in content:
            content = content.replace(OLD_SCRIPT, '')
            modified = True

        # Skip if already has site-search.js
        if 'site-search.js' in content:
            if modified:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
            return modified

        if '</body>' not in content:
            return False

        # Add new script before </body>
        content = content.replace('</body>', NEW_SCRIPT + '</body>')

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        return True
    except Exception as e:
        print(f"Error {filepath}: {e}")
        return False

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'

    patterns = [
        f'{base}/countertops/*/index.html',
        f'{base}/tile/*/index.html',
        f'{base}/flooring/*/index.html',
        f'{base}/materials/*/index.html',
        f'{base}/materials/*/*/index.html',
        f'{base}/vendors/*/index.html',
        f'{base}/blog/*/index.html',
        f'{base}/tools/*/index.html',
        f'{base}/account/*.html',
        f'{base}/account/**/*.html',
        f'{base}/sign-up/index.html',
        f'{base}/log-in/index.html',
        f'{base}/services/*/index.html',
        f'{base}/services/*/*/index.html',
        f'{base}/company/*/index.html',
        f'{base}/legal/*/index.html',
        f'{base}/financing/*/index.html',
        f'{base}/products/*/index.html',
        f'{base}/coverage-plans/*/index.html',
        f'{base}/for-pros/*/index.html',
        f'{base}/*.html',
        f'{base}/*/index.html',
    ]

    updated = 0
    for pattern in patterns:
        for filepath in glob.glob(pattern, recursive=True):
            if update_file(filepath):
                updated += 1

    print(f"Updated {updated} pages with site-wide search")
