#!/usr/bin/env python3
"""Fix all header styles to white background with blue text"""

import os
import glob
import re

def fix_header_styles(content):
    """Fix header styles for all page types"""

    # Fix .header background - various formats
    content = re.sub(
        r'\.header\s*\{\s*background:\s*linear-gradient\([^)]+\);',
        '.header { background: #ffffff;',
        content
    )
    content = re.sub(
        r'\.header\s*\{\s*background:\s*var\(--primary\);',
        '.header { background: #ffffff;',
        content
    )
    content = re.sub(
        r'\.header\s*\{\s*background:\s*#1a1a2e;',
        '.header { background: #ffffff;',
        content
    )

    # Fix header-banner to blue
    content = re.sub(
        r'\.header-banner\s*\{\s*background:\s*#0f0f1a;',
        '.header-banner { background: #1e3a5f;',
        content
    )
    content = re.sub(
        r'\.header-banner\s*\{\s*background:\s*#0a0a14;',
        '.header-banner { background: #1e3a5f;',
        content
    )

    # Fix .header-nav a colors to blue
    content = re.sub(
        r'\.header-nav a\s*\{\s*color:\s*#94a3b8;',
        '.header-nav a { color: #1e3a5f;',
        content
    )
    content = re.sub(
        r'\.header-nav a\s*\{\s*color:\s*var\(--text-light\);',
        '.header-nav a { color: #1e3a5f;',
        content
    )
    content = re.sub(
        r'\.header-nav a\s*\{\s*color:\s*white;',
        '.header-nav a { color: #1e3a5f;',
        content
    )

    # Fix .header-nav a:hover to blue
    content = re.sub(
        r'\.header-nav a:hover\s*\{\s*color:\s*white;',
        '.header-nav a:hover { color: #0066cc;',
        content
    )
    content = re.sub(
        r'\.header-nav a:hover\s*\{\s*color:\s*var\(--accent\);',
        '.header-nav a:hover { color: #0066cc;',
        content
    )

    # Fix .header-content color
    content = re.sub(
        r'(\.header\s*\{[^}]*)\bcolor:\s*white;',
        r'\1color: #1e3a5f;',
        content
    )

    # Fix dropdown menu links
    content = re.sub(
        r'color:\s*#94a3b8\s*!important;\s*font-size:\s*0\.9rem',
        'color: #1e3a5f !important; font-size: 0.9rem',
        content
    )

    # Fix dropdown toggle color
    content = re.sub(
        r'\.nav-dropdown-toggle\s*\{([^}]*?)color:\s*#94a3b8;',
        '.nav-dropdown-toggle {\\1color: #1e3a5f;',
        content
    )
    content = re.sub(
        r'\.nav-dropdown-toggle\s*\{([^}]*?)color:\s*#475569;',
        '.nav-dropdown-toggle {\\1color: #1e3a5f;',
        content
    )

    # Fix mobile menu button color
    content = re.sub(
        r'\.mobile-menu-btn\s*\{([^}]*?)color:\s*white;',
        '.mobile-menu-btn {\\1color: #1e3a5f;',
        content
    )

    # Fix mobile nav links
    content = re.sub(
        r'\.mobile-nav a\s*\{\s*color:\s*white;',
        '.mobile-nav a { color: #1e3a5f;',
        content
    )

    # Fix logo title color
    content = re.sub(
        r'\.logo-title\s*\{\s*color:\s*#fff;',
        '.logo-title { color: #1e3a5f;',
        content
    )
    content = re.sub(
        r'\.logo-title\s*\{\s*color:\s*white;',
        '.logo-title { color: #1e3a5f;',
        content
    )
    content = re.sub(
        r'\.logo-title\s*\{\s*color:\s*#ffffff;',
        '.logo-title { color: #1e3a5f;',
        content
    )

    # Fix logo tagline color
    content = re.sub(
        r'\.logo-tagline\s*\{\s*color:\s*#f9cb00;',
        '.logo-tagline { color: #b8860b;',
        content
    )
    content = re.sub(
        r'\.logo-tagline\s*\{\s*color:\s*var\(--accent\);',
        '.logo-tagline { color: #b8860b;',
        content
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

            new_content = fix_header_styles(content)

            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                updated += 1
                print(f"Updated: {filepath}")
        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    return updated

if __name__ == '__main__':
    base_dir = '/Users/homepc/surprise-granite-site'

    print("\n=== Fixing All Header Styles ===\n")

    # Update all product pages
    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    print(f"\nCountertops: {count1} pages")

    count2 = process_files(f'{base_dir}/tile/*/index.html')
    print(f"Tile: {count2} pages")

    count3 = process_files(f'{base_dir}/flooring/*/index.html')
    print(f"Flooring: {count3} pages")

    print(f"\n=== Total: {count1 + count2 + count3} pages updated ===")
