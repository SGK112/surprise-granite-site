#!/usr/bin/env python3
"""
Update all product pages to use the new secondary header.
This script replaces the existing header with the standardized secondary header.
"""

import os
import re
import sys
from pathlib import Path

# Base directory
BASE_DIR = Path("/Users/homepc/surprise-granite-site")

# Read the new header component
HEADER_FILE = BASE_DIR / "components" / "header-secondary.html"
with open(HEADER_FILE, 'r') as f:
    NEW_HEADER = f.read()

# Remove the comment from the header component
NEW_HEADER = re.sub(r'<!--[\s\S]*?-->\s*', '', NEW_HEADER, count=1)

def update_page(filepath):
    """Update a single page with the new header."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check if this page has a header
        if '<header class="header">' not in content:
            print(f"  SKIP (no header found): {filepath}")
            return False

        # Pattern to match header and optional mobile-nav
        # Match from <header class="header"> to </header> and optional mobile-nav div
        pattern = r'(  <!-- Header.*?-->[\s\n]*)?  <header class="header">[\s\S]*?</header>(\s*<div class="mobile-nav"[\s\S]*?</div>)?'

        # Check if pattern matches
        match = re.search(pattern, content)
        if not match:
            # Try simpler pattern
            pattern = r'<header class="header">[\s\S]*?</header>(\s*<div class="mobile-nav"[\s\S]*?</div>)?'
            match = re.search(pattern, content)

        if not match:
            print(f"  SKIP (pattern not found): {filepath}")
            return False

        # Replace the header
        new_content = re.sub(pattern, NEW_HEADER.strip(), content, count=1)

        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

        print(f"  UPDATED: {filepath}")
        return True

    except Exception as e:
        print(f"  ERROR: {filepath} - {e}")
        return False

def main():
    # Find all product pages
    flooring_dir = BASE_DIR / "flooring"
    countertops_dir = BASE_DIR / "countertops"

    updated = 0
    skipped = 0
    errors = 0

    # Process flooring pages
    if flooring_dir.exists():
        print("\n=== Processing Flooring Pages ===")
        for page in flooring_dir.glob("*/index.html"):
            result = update_page(page)
            if result:
                updated += 1
            else:
                skipped += 1

    # Process countertop pages
    if countertops_dir.exists():
        print("\n=== Processing Countertop Pages ===")
        for page in countertops_dir.glob("*/index.html"):
            result = update_page(page)
            if result:
                updated += 1
            else:
                skipped += 1

    print(f"\n=== Summary ===")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")

if __name__ == "__main__":
    main()
