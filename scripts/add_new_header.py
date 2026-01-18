#!/usr/bin/env python3
"""Add new header to product pages without modifying existing CSS"""

import os
import glob
import re

# The new header HTML
NEW_HEADER = '''<header class="sg-header">
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
      <svg class="sg-logo-icon" viewBox="0 0 122 125" fill="none" width="36" height="36">
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
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
  </div>
</header>
<div id="sgMobileNav" class="sg-mobile-nav">
  <div class="sg-mobile-header">
    <a href="/" class="sg-logo-link">
      <svg class="sg-logo-icon" viewBox="0 0 122 125" fill="none" width="36" height="36">
        <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
      </svg>
      <div class="sg-logo-text">
        <span class="sg-logo-title">Surprise Granite</span>
        <span class="sg-logo-tagline">MARBLE & QUARTZ</span>
      </div>
    </a>
    <button class="sg-mobile-close" onclick="sgToggleMobileNav()">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
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
  </div>
</div>
<script src="/js/header.js"></script>'''

def add_header(content):
    """Add new header without modifying existing CSS"""

    # Skip if already has new header
    if 'sg-header' in content:
        return content

    # Add header.css link before </head>
    if '/css/header.css' not in content:
        content = content.replace('</head>', '<link rel="stylesheet" href="/css/header.css">\n</head>')

    # Replace old header HTML only
    # Match <header class="header">...all content...</header> including nested mobile nav
    old_header_pattern = r'<header class="header">.*?</header>(?:\s*<nav class="mobile-nav"[^>]*>.*?</nav>)?'
    content = re.sub(old_header_pattern, NEW_HEADER, content, count=1, flags=re.DOTALL)

    # Hide old .header styles with CSS (add to existing style block)
    # This ensures old header styles don't conflict
    if '<style>' in content and '.header { display: none' not in content:
        content = content.replace('<style>', '<style>\n    .header.old-header { display: none !important; }')

    return content

def process_files(pattern):
    files = glob.glob(pattern)
    updated = 0
    for f in files:
        try:
            with open(f, 'r') as file:
                content = file.read()
            if '<header class="header">' in content and 'sg-header' not in content:
                new_content = add_header(content)
                if new_content != content:
                    with open(f, 'w') as file:
                        file.write(new_content)
                    updated += 1
                    print(f"Updated: {f}")
        except Exception as e:
            print(f"Error {f}: {e}")
    return updated

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'
    c1 = process_files(f'{base}/countertops/*/index.html')
    c2 = process_files(f'{base}/tile/*/index.html')
    c3 = process_files(f'{base}/flooring/*/index.html')
    print(f"\nTotal: {c1+c2+c3} updated")
