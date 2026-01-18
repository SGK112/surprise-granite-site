#!/usr/bin/env python3
"""Update tile and flooring pages with the correct logo structure"""

import os
import glob
import re

# The correct logo HTML to use
NEW_LOGO_HTML = '''<a href="/" class="logo-link">
        <svg class="logo-icon" viewBox="0 0 122 125" fill="none" width="36" height="36">
          <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
          <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
          <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
          <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
        </svg>
        <div class="logo-text">
          <span class="logo-title">Surprise Granite</span>
          <span class="logo-tagline">MARBLE & QUARTZ</span>
        </div>
      </a>'''

# The CSS styles needed for the logo
LOGO_CSS = '''
    /* Logo Branding */
    .logo-link { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 36px; height: 36px; filter: drop-shadow(0 2px 4px rgba(249,203,0,0.3)); }
    .logo-text { display: flex; flex-direction: column; gap: 1px; }
    .logo-title { color: #1e3a5f; font-size: 1.2rem; font-weight: 800; line-height: 1; }
    .logo-tagline { color: #b8860b; font-size: 0.55rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; }
'''

def fix_logo(content):
    """Replace the old logo img with the new logo structure"""

    # Pattern to find the old logo structure
    old_logo_patterns = [
        r'<a href="/"><img[^>]*class="logo"[^>]*/></a>',
        r'<a href="/"><img[^>]*alt="Surprise Granite"[^>]*/></a>',
    ]

    for pattern in old_logo_patterns:
        content = re.sub(pattern, NEW_LOGO_HTML, content)

    # Check if logo CSS exists, if not add it before header-nav
    if '.logo-link {' not in content and '.logo-icon {' not in content:
        # Add the logo CSS before header-nav styles
        content = content.replace(
            '.header-nav {',
            LOGO_CSS + '\n    .header-nav {'
        )

    return content

def process_files(directory_pattern):
    """Process all HTML files matching the pattern"""
    files = glob.glob(directory_pattern, recursive=True)
    updated = 0

    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Skip if already has the new logo structure
            if 'logo-link' in content and 'logo-icon' in content:
                continue

            new_content = fix_logo(content)

            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                updated += 1
                print(f"Updated: {filepath}")
        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    return updated

if __name__ == '__main__':
    base_dir = '/Users/homepc/surprise-granite-site'

    print("\n=== Updating Tile Pages with New Logo ===")
    count1 = process_files(f'{base_dir}/tile/*/index.html')
    print(f"Tile: {count1} pages")

    print("\n=== Updating Flooring Pages with New Logo ===")
    count2 = process_files(f'{base_dir}/flooring/*/index.html')
    print(f"Flooring: {count2} pages")

    print(f"\n=== Total: {count1 + count2} pages updated ===")
