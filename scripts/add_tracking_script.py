#!/usr/bin/env python3
"""Add user-tracking.js to all HTML pages"""

import glob

SCRIPT_TAG = '<script src="/js/user-tracking.js"></script>\n'

def add_script(filepath):
    """Add tracking script before </body> if not present"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if 'user-tracking.js' in content:
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
        f'{base}/*.html',
    ]

    updated = 0
    for pattern in patterns:
        for filepath in glob.glob(pattern, recursive=True):
            if add_script(filepath):
                updated += 1

    print(f"Added tracking to {updated} pages")
