#!/usr/bin/env python3
"""Update all product pages to use white background with blue text for header"""

import os
import glob
import re

def update_header_styles(content):
    """Update inline header styles to white/blue theme"""

    # Update CSS variables for header theme
    replacements = [
        # Header background - change from dark to white
        ('background: var(--primary);', 'background: #ffffff;'),
        ('background: #1a1a2e;', 'background: #ffffff;'),
        ('background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);', 'background: #ffffff;'),

        # Header banner - change to branded blue
        ('background: #0f0f1a;', 'background: #1e3a5f;'),
        ('background: #0a0a14;', 'background: #1e3a5f;'),

        # Navigation links - change to blue
        ('color: var(--text-light);', 'color: #1e3a5f;'),
        ('color: #94a3b8;', 'color: #475569;'),
        ('.header-nav a:hover { color: white; }', '.header-nav a:hover { color: #0066cc; }'),

        # Mobile menu button - change to blue
        ('color: white;\n      cursor: pointer;\n      padding: 8px;\n    }\n\n    .mobile-nav {',
         'color: #1e3a5f;\n      cursor: pointer;\n      padding: 8px;\n    }\n\n    .mobile-nav {'),

        # Logo title - white to blue
        ('.logo-title {\n      color: #ffffff;', '.logo-title {\n      color: #1e3a5f;'),
        ('.logo-title {\n      color: white;', '.logo-title {\n      color: #1e3a5f;'),

        # Logo tagline - gold color (darker for white background)
        ('.logo-tagline {\n      color: #f9cb00;', '.logo-tagline {\n      color: #b8860b;'),
        ('color: var(--accent);', 'color: #b8860b;'),

        # Mobile nav - white background
        ('background: var(--primary);\n      padding: 16px 24px;',
         'background: #ffffff;\n      padding: 16px 24px;'),

        # Mobile nav links - blue
        ('.mobile-nav a {\n      color: white;', '.mobile-nav a {\n      color: #1e3a5f;'),

        # Header nav dropdown menu - white background
        ('background: #1a1a2e; border-radius: 12px;', 'background: #ffffff; border-radius: 12px;'),
        ('border: 1px solid rgba(255,255,255,0.1);', 'border: 1px solid rgba(30,58,95,0.15);'),
        ('box-shadow: 0 10px 40px rgba(0,0,0,0.3);', 'box-shadow: 0 10px 40px rgba(0,0,0,0.15);'),

        # Dropdown menu links
        ('.nav-dropdown-menu a:hover { background: rgba(249,203,0,0.1); color: #f9cb00 !important; }',
         '.nav-dropdown-menu a:hover { background: rgba(30,58,95,0.1); color: #0066cc !important; }'),

        # Mobile nav section
        ('border-top: 1px solid rgba(255,255,255,0.1);', 'border-top: 1px solid rgba(30,58,95,0.15);'),
        ('border-bottom: 1px solid rgba(255,255,255,0.1);', 'border-bottom: 1px solid rgba(30,58,95,0.15);'),

        # Add shadow to header
        ('z-index: 1000;\n    }', 'z-index: 1000;\n      box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n    }'),
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

            # Check if file has header styles to update
            if '.header {' in content or 'header-nav' in content:
                new_content = update_header_styles(content)

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

    # Update countertop pages
    print("\n=== Updating Countertop Pages ===")
    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    print(f"Updated {count1} countertop pages")

    # Update tile pages
    print("\n=== Updating Tile Pages ===")
    count2 = process_files(f'{base_dir}/tile/*/index.html')
    print(f"Updated {count2} tile pages")

    # Update flooring pages
    print("\n=== Updating Flooring Pages ===")
    count3 = process_files(f'{base_dir}/flooring/*/index.html')
    print(f"Updated {count3} flooring pages")

    print(f"\n=== Total Updated: {count1 + count2 + count3} pages ===")
