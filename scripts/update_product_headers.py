#!/usr/bin/env python3
"""Update all product pages with the correct header structure (blue banner + white nav)"""

import os
import glob
import re

# The CSS link to add to head
HEADER_CSS_LINK = '<link rel="stylesheet" href="/css/header.css">'

# The complete header HTML with blue banner and white nav
NEW_HEADER_HTML = '''<header class="sg-header">
  <div class="sg-header-banner">
    <div class="sg-banner-left">
      <a href="/get-a-free-estimate" class="sg-banner-link">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        Book Now
        <span class="sg-banner-tag">Free Estimate</span>
      </a>
    </div>
    <div class="sg-banner-right">
      <a href="/account/">My Account</a>
      <a href="tel:+16028333189" class="sg-banner-phone">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
        (602) 833-3189
      </a>
    </div>
  </div>
  <div class="sg-header-main">
    <a href="/" class="sg-logo-link">
      <svg class="sg-logo-icon" viewBox="0 0 122 125" fill="none">
        <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
        <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
        <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
        <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
      </svg>
      <div class="sg-logo-text">
        <span class="sg-logo-title">Surprise Granite</span>
        <span class="sg-logo-tagline">MARBLE & QUARTZ</span>
      </div>
    </a>
    <nav class="sg-nav">
      <a href="/materials/all-countertops">Countertops</a>
      <a href="/materials/flooring">Flooring</a>
      <a href="/materials/all-tile">Tile</a>
      <div class="sg-nav-dropdown">
        <span class="sg-nav-toggle">Tools <svg viewBox="0 0 10 6" width="10" height="6"><path d="M1 1l4 4 4-4" stroke="currentColor" fill="none" stroke-width="1.5"/></svg></span>
        <div class="sg-nav-menu">
          <a href="/tools/countertop-calculator/">Countertop Calculator</a>
          <a href="/tools/tile-calculator/">Tile Calculator</a>
          <a href="/tools/flooring-calculator/">Flooring Calculator</a>
        </div>
      </div>
      <a href="/shop">Shop</a>
      <a href="/contact-us">Contact</a>
      <a href="/get-a-free-estimate" class="sg-btn-estimate">Free Estimate</a>
    </nav>
    <button class="sg-mobile-btn" onclick="sgToggleMobileNav()">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
  </div>
</header>

<div id="sgMobileNav" class="sg-mobile-nav">
  <div class="sg-mobile-header">
    <a href="/" class="sg-logo-link">
      <svg class="sg-logo-icon" viewBox="0 0 122 125" fill="none">
        <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
        <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
        <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
        <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
      </svg>
      <div class="sg-logo-text">
        <span class="sg-logo-title">Surprise Granite</span>
        <span class="sg-logo-tagline">MARBLE & QUARTZ</span>
      </div>
    </a>
    <button class="sg-mobile-close" onclick="sgToggleMobileNav()">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="sg-mobile-links">
    <a href="/materials/all-countertops">Countertops</a>
    <a href="/materials/flooring">Flooring</a>
    <a href="/materials/all-tile">Tile</a>
    <a href="/shop">Shop</a>
    <a href="/contact-us">Contact</a>
    <div class="sg-mobile-section">
      <span class="sg-mobile-section-title">Free Tools</span>
      <a href="/tools/countertop-calculator/">Countertop Calculator</a>
      <a href="/tools/tile-calculator/">Tile Calculator</a>
      <a href="/tools/flooring-calculator/">Flooring Calculator</a>
    </div>
  </div>
  <div class="sg-mobile-cta">
    <a href="/get-a-free-estimate" class="sg-btn-estimate">Get Free Estimate</a>
    <a href="tel:+16028333189" style="display:block;text-align:center;margin-top:12px;color:#f9cb00;">(602) 833-3189</a>
  </div>
</div>
<script src="/js/header.js"></script>'''

def update_header(content):
    """Replace the old header with the new header structure"""

    # Add header.css link if not present
    if '/css/header.css' not in content:
        content = content.replace('</head>', f'{HEADER_CSS_LINK}\n</head>')

    # Replace the entire old header
    # Match <header class="header">...content...</header> and mobile nav if present
    old_header_pattern = r'<header class="header">.*?</header>(?:\s*<nav class="mobile-nav">.*?</nav>)?'
    content = re.sub(old_header_pattern, NEW_HEADER_HTML, content, flags=re.DOTALL)

    # Remove old header styles from inline CSS (we'll use external CSS)
    # Remove .header { ... } block
    content = re.sub(r'\.header\s*\{[^}]+\}', '/* Header styles in /css/header.css */', content)
    content = re.sub(r'\.header-banner\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.header-content\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.header-nav[^{]*\{[^}]+\}', '', content)
    content = re.sub(r'\.logo-link\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.logo-text\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.logo-title\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.logo-tagline\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.logo-icon\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.logo\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.btn-estimate[^{]*\{[^}]+\}', '', content)
    content = re.sub(r'\.mobile-menu-btn\s*\{[^}]+\}', '', content)
    content = re.sub(r'\.mobile-nav[^{]*\{[^}]+\}', '', content)
    content = re.sub(r'\.nav-dropdown[^{]*\{[^}]+\}', '', content)
    content = re.sub(r'\.banner-phone[^{]*\{[^}]+\}', '', content)
    content = re.sub(r'\.banner-cta[^{]*\{[^}]+\}', '', content)

    return content

def process_files(directory_pattern):
    """Process all HTML files matching the pattern"""
    files = glob.glob(directory_pattern, recursive=True)
    updated = 0

    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Skip if already has the new header
            if 'sg-header' in content:
                continue

            # Only process if has old header
            if '<header class="header">' not in content:
                continue

            new_content = update_header(content)

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

    print("\n=== Updating Product Pages with New Header ===\n")

    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    print(f"\nCountertops: {count1} pages")

    count2 = process_files(f'{base_dir}/tile/*/index.html')
    print(f"Tile: {count2} pages")

    count3 = process_files(f'{base_dir}/flooring/*/index.html')
    print(f"Flooring: {count3} pages")

    print(f"\n=== Total: {count1 + count2 + count3} pages updated ===")
