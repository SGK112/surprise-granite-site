#!/usr/bin/env python3
"""
Surprise Granite Site Scraper
Downloads core pages and all assets from Webflow site
"""

import os
import re
import requests
from urllib.parse import urljoin, urlparse
from pathlib import Path
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "https://www.surprisegranite.com"
OUTPUT_DIR = "/Users/homepc/surprise-granite-site"

# Track downloaded assets to avoid duplicates
downloaded_assets = set()

def get_filename_from_url(url, default_ext=".html"):
    """Convert URL to a safe filename"""
    parsed = urlparse(url)
    path = parsed.path.strip("/")

    if not path:
        return "index.html"

    # Replace slashes with underscores
    filename = path.replace("/", "_")

    # Add extension if needed
    if not any(filename.endswith(ext) for ext in ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot']):
        filename += default_ext

    return filename

def download_file(url, output_path):
    """Download a file from URL"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'wb') as f:
            f.write(response.content)

        return True
    except Exception as e:
        print(f"  ✗ Failed: {url} - {e}")
        return False

def extract_assets(html, base_url):
    """Extract CSS, JS, and image URLs from HTML"""
    assets = {
        'css': [],
        'js': [],
        'images': [],
        'fonts': []
    }

    # CSS files
    css_pattern = r'href=["\']([^"\']*\.css[^"\']*)["\']'
    for match in re.findall(css_pattern, html):
        assets['css'].append(urljoin(base_url, match))

    # JS files
    js_pattern = r'src=["\']([^"\']*\.js[^"\']*)["\']'
    for match in re.findall(js_pattern, html):
        if 'google' not in match and 'analytics' not in match and 'gtag' not in match:
            assets['js'].append(urljoin(base_url, match))

    # Images
    img_patterns = [
        r'src=["\']([^"\']*\.(png|jpg|jpeg|gif|svg|webp)[^"\']*)["\']',
        r'srcset=["\']([^"\']*\.(png|jpg|jpeg|gif|svg|webp)[^"\']*)["\']',
        r'url\(["\']?([^"\')\s]*\.(png|jpg|jpeg|gif|svg|webp)[^"\')\s]*)["\']?\)',
    ]
    for pattern in img_patterns:
        for match in re.findall(pattern, html, re.IGNORECASE):
            if isinstance(match, tuple):
                url = match[0]
            else:
                url = match
            # Clean up srcset URLs
            url = url.split(',')[0].split(' ')[0]
            if url and not url.startswith('data:'):
                assets['images'].append(urljoin(base_url, url))

    # Fonts
    font_pattern = r'url\(["\']?([^"\')\s]*\.(woff2?|ttf|eot|otf)[^"\')\s]*)["\']?\)'
    for match in re.findall(font_pattern, html, re.IGNORECASE):
        if isinstance(match, tuple):
            url = match[0]
        else:
            url = match
        assets['fonts'].append(urljoin(base_url, url))

    return assets

def download_page(url):
    """Download a page and extract its assets"""
    print(f"\n📄 Downloading: {url}")

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        html = response.text

        # Save HTML
        filename = get_filename_from_url(url)
        html_path = os.path.join(OUTPUT_DIR, "pages", filename)

        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html)

        print(f"  ✓ Saved: {filename}")

        # Extract assets
        assets = extract_assets(html, url)
        return assets

    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return None

def download_asset(url, asset_type):
    """Download an asset file"""
    if url in downloaded_assets:
        return

    downloaded_assets.add(url)

    parsed = urlparse(url)
    filename = os.path.basename(parsed.path)

    if not filename:
        return

    # Clean filename
    filename = filename.split('?')[0]

    output_path = os.path.join(OUTPUT_DIR, asset_type, filename)

    if os.path.exists(output_path):
        return

    if download_file(url, output_path):
        print(f"  ✓ {asset_type}: {filename}")

def main():
    print("=" * 60)
    print("🚀 Surprise Granite Site Scraper")
    print("=" * 60)

    # Read pages list
    pages_file = os.path.join(OUTPUT_DIR, "pages_to_scrape.txt")
    with open(pages_file, 'r') as f:
        urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]

    print(f"\n📋 Found {len(urls)} pages to scrape")

    all_assets = {
        'css': set(),
        'js': set(),
        'images': set(),
        'fonts': set()
    }

    # Download all pages
    print("\n" + "=" * 60)
    print("📥 PHASE 1: Downloading Pages")
    print("=" * 60)

    for url in urls:
        assets = download_page(url)
        if assets:
            for key in all_assets:
                all_assets[key].update(assets[key])
        time.sleep(0.5)  # Be nice to the server

    # Download assets
    print("\n" + "=" * 60)
    print("📥 PHASE 2: Downloading Assets")
    print("=" * 60)

    print(f"\n🎨 CSS files: {len(all_assets['css'])}")
    for url in all_assets['css']:
        download_asset(url, 'css')

    print(f"\n📜 JS files: {len(all_assets['js'])}")
    for url in all_assets['js']:
        download_asset(url, 'js')

    print(f"\n🖼️  Images: {len(all_assets['images'])}")
    for url in list(all_assets['images'])[:200]:  # Limit to first 200 images
        download_asset(url, 'images')

    print(f"\n🔤 Fonts: {len(all_assets['fonts'])}")
    for url in all_assets['fonts']:
        download_asset(url, 'fonts')

    print("\n" + "=" * 60)
    print("✅ SCRAPING COMPLETE!")
    print("=" * 60)

    # Summary
    pages_count = len(list(Path(OUTPUT_DIR, 'pages').glob('*.html')))
    css_count = len(list(Path(OUTPUT_DIR, 'css').glob('*')))
    js_count = len(list(Path(OUTPUT_DIR, 'js').glob('*')))
    img_count = len(list(Path(OUTPUT_DIR, 'images').glob('*')))

    print(f"""
Summary:
  📄 Pages: {pages_count}
  🎨 CSS files: {css_count}
  📜 JS files: {js_count}
  🖼️  Images: {img_count}

Output directory: {OUTPUT_DIR}
""")

if __name__ == "__main__":
    main()
