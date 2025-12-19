#!/usr/bin/env python3
"""
Simple cleanup - just remove tracking and bloat, keep site functional
"""

import os
import re
from pathlib import Path

OUTPUT_DIR = "/Users/homepc/surprise-granite-site"
PAGES_DIR = os.path.join(OUTPUT_DIR, "pages")

def clean_html_file(filepath):
    """Clean a single HTML file"""
    print(f"  Cleaning: {os.path.basename(filepath)}")

    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    original_size = len(html)

    # Remove Webflow data attributes
    html = re.sub(r' data-wf-domain="[^"]*"', '', html)
    html = re.sub(r' data-wf-page="[^"]*"', '', html)
    html = re.sub(r' data-wf-site="[^"]*"', '', html)
    html = re.sub(r'<!-- Last Published:[^>]*-->', '', html)

    # Remove Google Tag Manager
    html = re.sub(
        r'<!-- Google Tag Manager -->.*?<!-- End Google Tag Manager -->',
        '<!-- GTM Removed -->', html, flags=re.DOTALL
    )
    html = re.sub(
        r'<!-- Google Tag Manager \(noscript\) -->.*?<!-- End Google Tag Manager \(noscript\) -->',
        '', html, flags=re.DOTALL
    )

    # Remove Meta/Facebook Pixel
    html = re.sub(
        r'<!-- Meta Pixel Code -->.*?<!-- End Meta Pixel Code -->',
        '<!-- FB Pixel Removed -->', html, flags=re.DOTALL
    )

    # Remove Google Adsense
    html = re.sub(
        r'<script[^>]*googlesyndication\.com[^>]*></script>',
        '', html
    )

    # Remove Wized scripts
    html = re.sub(r'<script[^>]*wized\.com[^>]*></script>', '', html)
    html = re.sub(r'<script[^>]*data-wized-id[^>]*></script>', '', html)

    # Clean up excessive whitespace
    html = re.sub(r'\n\s*\n\s*\n', '\n\n', html)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)

    new_size = len(html)
    saved = original_size - new_size
    if saved > 0:
        print(f"    Reduced by {saved:,} bytes")

def create_render_yaml():
    """Create render.yaml for deployment"""
    render_yaml = """services:
  - type: web
    name: surprise-granite
    runtime: static
    buildCommand: echo "Static site ready"
    staticPublishPath: .
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
"""
    with open(os.path.join(OUTPUT_DIR, "render.yaml"), 'w') as f:
        f.write(render_yaml)
    print("Created render.yaml")

def create_root_index():
    """Create a root index.html"""
    # Copy the home page as root index
    home_path = os.path.join(PAGES_DIR, "index.html")
    root_path = os.path.join(OUTPUT_DIR, "index.html")

    if os.path.exists(home_path):
        with open(home_path, 'r', encoding='utf-8') as f:
            html = f.read()
        with open(root_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print("Created root index.html")

def main():
    print("=" * 60)
    print("Simple Cleanup for Render Deployment")
    print("=" * 60)

    # Clean all HTML files
    for html_file in Path(PAGES_DIR).glob("*.html"):
        clean_html_file(str(html_file))

    # Create deployment files
    create_render_yaml()
    create_root_index()

    print("\n" + "=" * 60)
    print("CLEANUP COMPLETE! Ready for GitHub + Render")
    print("=" * 60)

if __name__ == "__main__":
    main()
