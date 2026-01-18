#!/usr/bin/env python3
"""Fix navigation link colors to blue"""

import os
import glob

def fix_nav_colors(content):
    """Fix nav link colors to blue"""

    # Fix header-nav a colors
    content = content.replace(
        '.header-nav a { color: #475569;',
        '.header-nav a { color: #1e3a5f;'
    )
    content = content.replace(
        '.header-nav a { color: #94a3b8;',
        '.header-nav a { color: #1e3a5f;'
    )
    content = content.replace(
        'color: #475569;',
        'color: #1e3a5f;'
    )

    return content

def process_files(directory_pattern):
    files = glob.glob(directory_pattern, recursive=True)
    updated = 0
    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = fix_nav_colors(content)
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                updated += 1
        except Exception as e:
            print(f"Error: {filepath}: {e}")
    return updated

if __name__ == '__main__':
    base_dir = '/Users/homepc/surprise-granite-site'
    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    count2 = process_files(f'{base_dir}/tile/*/index.html')
    count3 = process_files(f'{base_dir}/flooring/*/index.html')
    print(f"Fixed nav colors in {count1 + count2 + count3} pages")
