#!/usr/bin/env python3
"""
Cleanup script for scraped Webflow site
Removes bloat and fixes links for static hosting
"""

import os
import re
from pathlib import Path

OUTPUT_DIR = "/Users/homepc/surprise-granite-site"
PAGES_DIR = os.path.join(OUTPUT_DIR, "pages")

# What to remove
REMOVE_PATTERNS = [
    # Webflow data attributes from html tag
    r' data-wf-domain="[^"]*"',
    r' data-wf-page="[^"]*"',
    r' data-wf-site="[^"]*"',

    # Wized scripts
    r'<script[^>]*wized[^>]*>[^<]*</script>',
    r'<script[^>]*data-wized-id[^>]*>[^<]*</script>',

    # Finsweet scripts (CMS-dependent)
    r'<!-- \[Attributes by Finsweet\][^>]*-->\s*<script[^>]*finsweet[^>]*>[^<]*</script>',
    r'<script[^>]*finsweet[^>]*>[^<]*</script>',

    # Sygnal forms (Webflow-specific)
    r'<!-- Sygnal Attributes[^>]*-->\s*<link[^>]*webflow-form[^>]*>',
    r'<script[^>]*webflow-form[^>]*>[^<]*</script>',

    # Webflow comment
    r'<!-- Last Published:[^>]*-->',
]

# Optional: Remove these tracking scripts (set to False to keep)
REMOVE_TRACKING = True

TRACKING_PATTERNS = [
    # Google Tag Manager
    r'<!-- Google Tag Manager -->\s*<script>.*?</script>\s*<!-- End Google Tag Manager -->',
    r'<!-- Google Tag Manager \(noscript\) -->.*?<!-- End Google Tag Manager \(noscript\) -->',

    # Meta/Facebook Pixel
    r'<!-- Meta Pixel Code -->\s*<script>.*?</script>\s*<!-- End Meta Pixel Code -->',
    r'<noscript>.*?facebook.*?</noscript>',

    # Google Adsense
    r'<script[^>]*googlesyndication[^>]*>[^<]*</script>',
]

def clean_html_file(filepath):
    """Clean a single HTML file"""
    print(f"  Cleaning: {os.path.basename(filepath)}")

    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    original_size = len(html)

    # Remove Webflow bloat
    for pattern in REMOVE_PATTERNS:
        html = re.sub(pattern, '', html, flags=re.DOTALL | re.IGNORECASE)

    # Optionally remove tracking
    if REMOVE_TRACKING:
        for pattern in TRACKING_PATTERNS:
            html = re.sub(pattern, '', html, flags=re.DOTALL | re.IGNORECASE)

    # Fix internal links - convert absolute to relative
    # https://www.surprisegranite.com/services/... -> /services/...
    html = re.sub(
        r'href="https://www\.surprisegranite\.com(/[^"]*)"',
        r'href="\1"',
        html
    )
    html = re.sub(
        r'href="https://www\.surprisegranite\.com"',
        r'href="/"',
        html
    )

    # Update internal page links to use .html extension for static hosting
    # /company/about-us -> /pages/company_about-us.html
    def fix_internal_link(match):
        path = match.group(1)
        if path == '/':
            return 'href="/pages/index.html"'
        # Remove leading slash and replace remaining slashes with underscores
        clean_path = path.lstrip('/').replace('/', '_')
        return f'href="/pages/{clean_path}.html"'

    # Fix navigation links
    html = re.sub(r'href="(/[a-z][^"]*)"', fix_internal_link, html, flags=re.IGNORECASE)

    # Add Shop link to Shopify store in navigation
    # This adds a link if there's a navigation element
    if 'store.surprisegranite.com' not in html:
        # Try to find a good place to add shop link
        html = html.replace(
            'href="/pages/contact-us.html"',
            'href="/pages/contact-us.html" class="nav-link">Contact</a><a href="https://store.surprisegranite.com" target="_blank" class="nav-link">Shop</a><a style="display:none'
        )

    # Save cleaned file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)

    new_size = len(html)
    saved = original_size - new_size
    print(f"    Saved {saved:,} bytes ({saved*100//original_size}% reduction)")

    return saved

def create_index_redirect():
    """Create root index.html that redirects to pages/index.html"""
    index_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=/pages/index.html">
    <title>Surprise Granite</title>
</head>
<body>
    <p>Redirecting to <a href="/pages/index.html">Surprise Granite</a>...</p>
</body>
</html>
"""
    with open(os.path.join(OUTPUT_DIR, "index.html"), 'w') as f:
        f.write(index_html)
    print("Created root index.html redirect")

def main():
    print("=" * 60)
    print("Cleaning Webflow HTML Files")
    print("=" * 60)

    total_saved = 0
    files_cleaned = 0

    # Clean all HTML files
    for html_file in Path(PAGES_DIR).glob("*.html"):
        saved = clean_html_file(str(html_file))
        total_saved += saved
        files_cleaned += 1

    # Create root redirect
    create_index_redirect()

    print("\n" + "=" * 60)
    print("CLEANUP COMPLETE!")
    print("=" * 60)
    print(f"""
Summary:
  Files cleaned: {files_cleaned}
  Total bytes saved: {total_saved:,} ({total_saved/1024/1024:.2f} MB)
  Tracking removed: {'Yes' if REMOVE_TRACKING else 'No'}
""")

if __name__ == "__main__":
    main()
