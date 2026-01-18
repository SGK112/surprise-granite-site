#!/usr/bin/env python3
"""Fix dropdown menu link colors for white background"""

import os
import glob

def fix_dropdown_colors(content):
    """Fix dropdown menu link colors to be readable on white background"""

    replacements = [
        # Fix dropdown menu link colors - change gray to dark blue
        ('color: #94a3b8 !important; font-size: 0.9rem;',
         'color: #1e3a5f !important; font-size: 0.9rem;'),

        # Also fix any other gray text
        ('color: #94a3b8;', 'color: #475569;'),
    ]

    for old, new in replacements:
        content = content.replace(old, new)

    return content

def process_files(directory_pattern):
    """Process all HTML files matching the pattern"""
    files = glob.glob(directory_pattern, recursive=True)
    updated = 0

    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            new_content = fix_dropdown_colors(content)

            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                updated += 1
        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    return updated

if __name__ == '__main__':
    base_dir = '/Users/homepc/surprise-granite-site'

    # Update all product pages
    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    count2 = process_files(f'{base_dir}/tile/*/index.html')
    count3 = process_files(f'{base_dir}/flooring/*/index.html')

    print(f"Fixed dropdown colors in {count1 + count2 + count3} pages")
