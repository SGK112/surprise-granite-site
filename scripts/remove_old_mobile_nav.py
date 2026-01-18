#!/usr/bin/env python3
"""Remove old mobile nav divs that were left behind"""

import os
import glob
import re

def remove_old_mobile_nav(content):
    """Remove the old mobile-nav div that's showing unstyled"""

    # Remove old mobile nav - matches <div class="mobile-nav"...>...</div>
    # This pattern handles nested divs properly
    pattern = r'<div class="mobile-nav"[^>]*>.*?</div>\s*</div>\s*</div>'
    content = re.sub(pattern, '', content, flags=re.DOTALL)

    # Also try simpler pattern
    pattern2 = r'<div class="mobile-nav" id="mobileNav">.*?<a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>\s*</div>'
    content = re.sub(pattern2, '', content, flags=re.DOTALL)

    # Also add CSS to hide any remaining old mobile-nav
    if '.mobile-nav { display: none !important; }' not in content and '<style>' in content:
        content = content.replace(
            '<style>',
            '<style>\n    .mobile-nav { display: none !important; }'
        )

    return content

def process_files(directory_pattern):
    files = glob.glob(directory_pattern, recursive=True)
    updated = 0
    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Check if has old mobile nav
            if 'class="mobile-nav"' in content or 'id="mobileNav"' in content:
                new_content = remove_old_mobile_nav(content)
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    updated += 1
                    print(f"Fixed: {filepath}")
        except Exception as e:
            print(f"Error: {filepath}: {e}")
    return updated

if __name__ == '__main__':
    base_dir = '/Users/homepc/surprise-granite-site'
    count1 = process_files(f'{base_dir}/countertops/*/index.html')
    count2 = process_files(f'{base_dir}/tile/*/index.html')
    count3 = process_files(f'{base_dir}/flooring/*/index.html')
    print(f"\nTotal: {count1 + count2 + count3} pages fixed")
