#!/usr/bin/env python3
"""
Add mobile-optimizations.css link to all flooring pages that don't have it.
"""

import os
import re
from pathlib import Path

BASE_DIR = Path("/Users/homepc/surprise-granite-site")
CSS_LINK = '  <link rel="stylesheet" href="/css/mobile-optimizations.css"/>'

def add_css_link(filepath):
    """Add CSS link to a single page."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Skip if already has the link
        if 'mobile-optimizations.css' in content:
            return False

        # Insert before <style> tag
        if '<style>' in content:
            new_content = content.replace(
                '  <style>',
                CSS_LINK + '\n\n  <style>'
            )

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)

            print(f"  UPDATED: {filepath}")
            return True
        else:
            print(f"  SKIP (no style tag): {filepath}")
            return False

    except Exception as e:
        print(f"  ERROR: {filepath} - {e}")
        return False

def main():
    flooring_dir = BASE_DIR / "flooring"

    updated = 0
    skipped = 0

    if flooring_dir.exists():
        print("=== Adding mobile-optimizations.css to Flooring Pages ===\n")
        for page in flooring_dir.glob("*/index.html"):
            if add_css_link(page):
                updated += 1
            else:
                skipped += 1

    print(f"\n=== Summary ===")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")

if __name__ == "__main__":
    main()
