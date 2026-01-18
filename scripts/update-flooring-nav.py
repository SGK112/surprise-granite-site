#!/usr/bin/env python3
"""
Update flooring pages to add Account link and Tile link to navigation
"""

import os
import re
from pathlib import Path


def update_flooring_nav():
    """Update navigation on all flooring pages"""
    flooring_dir = Path('/Users/homepc/surprise-granite-site/flooring')

    # Old header nav pattern
    old_header_nav = '''<nav class="header-nav">
        <a href="/materials/all-countertops">Countertops</a>
        <a href="/materials/flooring">Flooring</a>
        <a href="/shop">Shop</a>
        <a href="/company/project-gallery">Gallery</a>
        <a href="/contact-us">Contact</a>
        <a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>
      </nav>'''

    # New header nav with Tile and Account
    new_header_nav = '''<nav class="header-nav">
        <a href="/materials/all-countertops">Countertops</a>
        <a href="/materials/all-tile">Tile</a>
        <a href="/materials/flooring">Flooring</a>
        <a href="/shop">Shop</a>
        <a href="/contact-us">Contact</a>
        <a href="/account" class="nav-account">Account</a>
        <a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>
      </nav>'''

    # Old mobile nav pattern
    old_mobile_nav = '''<div class="mobile-nav" id="mobileNav">
    <a href="/materials/all-countertops">Countertops</a>
    <a href="/materials/flooring">Flooring</a>
    <a href="/shop">Shop</a>
    <a href="/company/project-gallery">Gallery</a>
    <a href="/contact-us">Contact</a>
    <a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>
  </div>'''

    # New mobile nav with Tile and Account
    new_mobile_nav = '''<div class="mobile-nav" id="mobileNav">
    <a href="/materials/all-countertops">Countertops</a>
    <a href="/materials/all-tile">Tile</a>
    <a href="/materials/flooring">Flooring</a>
    <a href="/shop">Shop</a>
    <a href="/contact-us">Contact</a>
    <a href="/account">My Account</a>
    <a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>
  </div>'''

    count = 0
    for product_dir in sorted(flooring_dir.iterdir()):
        if not product_dir.is_dir():
            continue

        index_file = product_dir / 'index.html'
        if not index_file.exists():
            continue

        content = index_file.read_text()
        original = content

        # Replace header nav
        content = content.replace(old_header_nav, new_header_nav)

        # Replace mobile nav
        content = content.replace(old_mobile_nav, new_mobile_nav)

        # If already updated, try regex patterns
        if content == original:
            # Use regex to find and update header-nav that doesn't have Account
            if 'nav-account' not in content:
                # Insert Account before Free Estimate in header nav
                content = re.sub(
                    r'(<a href="/contact-us">Contact</a>\s*)'
                    r'(<a href="/get-a-free-estimate" class="btn-estimate">)',
                    r'\1<a href="/account" class="nav-account">Account</a>\n        \2',
                    content
                )

            # Check if Tile link missing
            if '/materials/all-tile' not in content:
                content = re.sub(
                    r'(<a href="/materials/all-countertops">Countertops</a>\s*)'
                    r'(<a href="/materials/flooring">)',
                    r'\1<a href="/materials/all-tile">Tile</a>\n        \2',
                    content
                )

        if content != original:
            index_file.write_text(content)
            count += 1
            print(f'Updated: {product_dir.name}')
        else:
            print(f'Skipped (already updated): {product_dir.name}')

    print(f'\nDone! Updated {count} flooring pages.')


if __name__ == '__main__':
    update_flooring_nav()
