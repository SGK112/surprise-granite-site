#!/usr/bin/env python3
"""Fix logos across all pages for consistent branding"""

import os
import glob
import re

# The new logo HTML (for dark backgrounds - white text)
NEW_LOGO_DARK_BG = '''<a href="/" style="display: flex; align-items: center; gap: 12px; text-decoration: none;">
      <svg viewBox="0 0 122 125" fill="none" width="40" height="40">
        <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
        <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
        <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
        <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
      </svg>
      <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 1.5rem; font-weight: 700; color: #ffffff;">Surprise Granite</span>
    </a>'''

# The new logo HTML (for light backgrounds - blue text)
NEW_LOGO_LIGHT_BG = '''<a href="/" style="display: flex; align-items: center; gap: 12px; text-decoration: none;">
      <svg viewBox="0 0 122 125" fill="none" width="40" height="40">
        <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
        <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
        <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
        <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
      </svg>
      <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 1.5rem; font-weight: 700; color: #1e3a5f;">Surprise Granite</span>
    </a>'''

# Old logo patterns to replace
OLD_LOGO_PATTERNS = [
    r'<a href="/">\s*<img[^>]*6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide\.svg[^>]*/>\s*</a>',
    r'<img[^>]*6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide\.svg[^>]*alt="Surprise Granite"[^>]*/?>',
]

FONT_IMPORT = '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet"/>'

def fix_logo(content, filepath):
    """Fix logo in the content"""

    # Determine if dark or light background based on page
    is_dark_bg = any(x in filepath for x in ['sign-up', 'login', 'account'])
    new_logo = NEW_LOGO_DARK_BG if is_dark_bg else NEW_LOGO_LIGHT_BG

    # Try to replace old logo patterns
    for pattern in OLD_LOGO_PATTERNS:
        content = re.sub(pattern, new_logo, content, flags=re.DOTALL | re.IGNORECASE)

    # Add Playfair Display font if not present
    if 'Playfair' not in content and '</head>' in content:
        content = content.replace('</head>', f'{FONT_IMPORT}\n</head>')

    return content

def process_files(patterns):
    """Process multiple file patterns"""
    updated = 0
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        for f in files:
            try:
                with open(f, 'r', encoding='utf-8') as file:
                    content = file.read()

                # Check if has old logo
                if '6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg' in content:
                    new_content = fix_logo(content, f)
                    if new_content != content:
                        with open(f, 'w', encoding='utf-8') as file:
                            file.write(new_content)
                        updated += 1
                        print(f"Fixed: {f}")
            except Exception as e:
                print(f"Error {f}: {e}")
    return updated

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'

    patterns = [
        f'{base}/sign-up/index.html',
        f'{base}/log-in/index.html',
        f'{base}/account/*.html',
        f'{base}/account/**/*.html',
        f'{base}/vendors/*/index.html',
        f'{base}/blog/*/index.html',
        f'{base}/countertops/*/index.html',
        f'{base}/tile/*/index.html',
        f'{base}/flooring/*/index.html',
        f'{base}/materials/*/index.html',
        f'{base}/materials/*/*/index.html',
        f'{base}/tools/*/index.html',
        f'{base}/*.html',
    ]

    count = process_files(patterns)
    print(f"\nTotal: {count} pages fixed")
