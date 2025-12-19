#!/usr/bin/env python3
"""
Fix broken emoji icons by replacing with SVG icons
"""

import os
import re
from pathlib import Path

PAGES_DIR = "/Users/homepc/surprise-granite-site/pages"

# Map broken characters to proper icons/emojis
# Using simple text symbols that work universally
ICON_REPLACEMENTS = {
    # Promo card icons (in span with class sg-promo-card-icon)
    '<span class="sg-promo-card-icon">ð³</span>': '<span class="sg-promo-card-icon">🍳</span>',
    '<span class="sg-promo-card-icon">ð¿</span>': '<span class="sg-promo-card-icon">🚿</span>',
    '<span class="sg-promo-card-icon">â¨</span>': '<span class="sg-promo-card-icon">✨</span>',
    '<span class="sg-promo-card-icon">ð </span>': '<span class="sg-promo-card-icon">🏠</span>',
    '<span class="sg-promo-card-icon">ð¢</span>': '<span class="sg-promo-card-icon">🏢</span>',

    # Modal icons
    '<div class="sg-modal-icon">ð³</div>': '<div class="sg-modal-icon">🍳</div>',
    '<div class="sg-modal-icon">ð¿</div>': '<div class="sg-modal-icon">🚿</div>',
    '<div class="sg-modal-icon">â¨</div>': '<div class="sg-modal-icon">✨</div>',
    '<div class="sg-modal-icon">ð </div>': '<div class="sg-modal-icon">🏠</div>',
    '<div class="sg-modal-icon">ð¢</div>': '<div class="sg-modal-icon">🏢</div>',

    # Project option icons
    '<span class="project-icon">ð³</span>': '<span class="project-icon">🍳</span>',
    '<span class="project-icon">ð¿</span>': '<span class="project-icon">🚿</span>',
    '<span class="project-icon">â¨</span>': '<span class="project-icon">✨</span>',
    '<span class="project-icon">ð </span>': '<span class="project-icon">🏠</span>',
    '<span class="project-icon">ð¢</span>': '<span class="project-icon">🏢</span>',

    # Button icons
    '<span class="btn-icon">ð</span>': '<span class="btn-icon">📋</span>',

    # Thank you icons
    '<div class="sg-thank-you-icon">ð</div>': '<div class="sg-thank-you-icon">🎉</div>',
    '<span>ð</span>': '<span>📞</span>',

    # List item checkmarks (å character)
    '>å<': '>✓<',
    '>å ': '>✓ ',

    # Generic broken emojis
    'ð³': '🍳',
    'ð¿': '🚿',
    'â¨': '✨',
    'ð ': '🏠',
    'ð¢': '🏢',
    'ð': '📋',
    'å': '✓',

    # Fix star ratings that might be broken
    'â': '⭐',
}

def fix_icons_in_file(filepath):
    """Fix broken icons in a single file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    for broken, fixed in ICON_REPLACEMENTS.items():
        content = content.replace(broken, fixed)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    print("=" * 60)
    print("Fixing Broken Icons")
    print("=" * 60)

    fixed_count = 0
    for html_file in Path(PAGES_DIR).glob("*.html"):
        if fix_icons_in_file(str(html_file)):
            print(f"  Fixed: {html_file.name}")
            fixed_count += 1

    # Also fix root index.html
    root_index = "/Users/homepc/surprise-granite-site/index.html"
    if os.path.exists(root_index):
        if fix_icons_in_file(root_index):
            print(f"  Fixed: index.html (root)")
            fixed_count += 1

    print(f"\n{fixed_count} files fixed")
    print("=" * 60)

if __name__ == "__main__":
    main()
