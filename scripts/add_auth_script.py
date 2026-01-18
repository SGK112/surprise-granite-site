#!/usr/bin/env python3
"""Add auth-state.js to all HTML pages for consistent login state"""

import glob

SCRIPTS_TO_ADD = '''<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/auth-state.js"></script>
'''

def add_auth_script(filepath):
    """Add auth script before </body> if not already present"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Skip if already has auth-state.js
        if 'auth-state.js' in content:
            return False

        # Skip if no </body>
        if '</body>' not in content:
            return False

        # Add scripts before </body>
        new_content = content.replace('</body>', SCRIPTS_TO_ADD + '</body>')

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
        f'{base}/*.html',
    ]

    updated = 0
    for pattern in patterns:
        for filepath in glob.glob(pattern):
            if add_auth_script(filepath):
                updated += 1
                print(f"Added: {filepath}")

    print(f"\nTotal: {updated} pages updated")
