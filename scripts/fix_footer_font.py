#!/usr/bin/env python3
"""Fix footer logo font to bold"""

import os
import glob

OLD = 'font-weight: 800;"'
NEW = 'font-weight: 900; font-family: \'Inter\', sans-serif;"'

def fix_font(content):
    return content.replace(OLD, NEW)

def process_files(pattern):
    files = glob.glob(pattern)
    updated = 0
    for f in files:
        try:
            with open(f, 'r') as file:
                content = file.read()
            new_content = fix_font(content)
            if new_content != content:
                with open(f, 'w') as file:
                    file.write(new_content)
                updated += 1
        except Exception as e:
            print(f"Error {f}: {e}")
    return updated

if __name__ == '__main__':
    base = '/Users/homepc/surprise-granite-site'
    c1 = process_files(f'{base}/countertops/*/index.html')
    c2 = process_files(f'{base}/tile/*/index.html')
    c3 = process_files(f'{base}/flooring/*/index.html')
    print(f"Updated {c1+c2+c3} pages")
