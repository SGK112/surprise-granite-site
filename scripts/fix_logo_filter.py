#!/usr/bin/env python3
"""Remove logo filter that makes logo white on white background"""

import os
import glob
import re

def fix_logo_filter(content):
    """Remove or fix logo filter for white background"""

    # Remove brightness(0) invert(1) filter which makes logo white
    content = re.sub(
        r'\.logo\s*\{([^}]*?)filter:\s*brightness\(0\)\s*invert\(1\);',
        '.logo {\\1/* Logo natural colors */',
        content
    )

    # Also remove simpler filter patterns
    content = content.replace(
        'filter: brightness(0) invert(1);',
        '/* Natural logo colors */'
    )

    return content

def process_files(directory_pattern):
    """Process all HTML files matching the pattern"""
    files = glob.glob(directory_pattern, recursive=True)
    updated = 0

    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            new_content = fix_logo_filter(content)

            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                updated += 1
                print(f"Fixed: {filepath}")
        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    return updated

if __name__ == '__main__':
    base_dir = '/Users/homepc/surprise-granite-site'

    print("\n=== Fixing Logo Filter ===\n")

    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    count2 = process_files(f'{base_dir}/tile/*/index.html')
    count3 = process_files(f'{base_dir}/flooring/*/index.html')

    print(f"\n=== Total: {count1 + count2 + count3} pages fixed ===")
