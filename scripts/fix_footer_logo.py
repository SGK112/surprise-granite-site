#!/usr/bin/env python3
"""Fix footer logo to use the proper Surprise Granite branding"""

import os
import glob

# The new footer logo with yellow SVG + text
NEW_FOOTER_LOGO = '''<a href="/" class="footer-logo-link" style="display: flex; align-items: center; gap: 12px; text-decoration: none;">
          <svg viewBox="0 0 122 125" fill="none" width="40" height="40">
            <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
            <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
            <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
            <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
          </svg>
          <span style="color: #ffffff; font-size: 1.25rem; font-weight: 800;">Surprise Granite</span>
        </a>'''

OLD_FOOTER_LOGO = '<img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg" alt="Surprise Granite" style="height: 40px; filter: brightness(0) invert(1);"/>'

# Alternative pattern that might exist
OLD_FOOTER_LOGO_ALT = '<img loading="lazy" src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg" alt="Surprise Granite" style="height: 40px; /* Natural logo colors */"/>'

def fix_footer_logo(content):
    """Replace old footer logo with new SVG + text logo"""
    content = content.replace(OLD_FOOTER_LOGO, NEW_FOOTER_LOGO)
    content = content.replace(OLD_FOOTER_LOGO_ALT, NEW_FOOTER_LOGO)
    return content

def process_files(pattern):
    files = glob.glob(pattern)
    updated = 0
    for f in files:
        try:
            with open(f, 'r') as file:
                content = file.read()
            new_content = fix_footer_logo(content)
            if new_content != content:
                with open(f, 'w') as file:
                    file.write(new_content)
                updated += 1
        except Exception as e:
            print(f"Error {f}: {e}")
    return updated

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'
    c1 = process_files(f'{base}/countertops/*/index.html')
    c2 = process_files(f'{base}/tile/*/index.html')
    c3 = process_files(f'{base}/flooring/*/index.html')
    print(f"Fixed footer logo in {c1+c2+c3} pages")
