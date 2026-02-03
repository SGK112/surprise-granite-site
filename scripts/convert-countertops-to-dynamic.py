#!/usr/bin/env python3
"""
Convert static countertop pages to use the dynamic template.
Creates redirect pages that load the product from slabs.json.
"""

import os
import shutil

COUNTERTOPS_DIR = '/Users/homepc/surprise-granite-site/countertops'
BACKUP_DIR = '/Users/homepc/surprise-granite-site/.countertops-backup'

# Create redirect template that extracts slug from URL and loads dynamically
REDIRECT_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loading... | Surprise Granite</title>
  <style>
    body {{ margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: -apple-system, sans-serif; background: #f8fafc; }}
    .loader {{ text-align: center; }}
    .spinner {{ width: 40px; height: 40px; border: 3px solid #e5e5e5; border-top-color: #f9cb00; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
  </style>
  <script>
    // Get slug from URL path
    const path = window.location.pathname;
    const match = path.match(/\\/countertops\\/([^\\/]+)/);
    if (match) {{
      const slug = match[1];
      // Redirect to dynamic product page
      window.location.replace('/marketplace/product/?handle=' + slug + '&category=slabs');
    }}
  </script>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Loading product...</p>
  </div>
</body>
</html>
'''

def convert_countertops():
    # Create backup
    if not os.path.exists(BACKUP_DIR):
        print(f"Creating backup at {BACKUP_DIR}")
        shutil.copytree(COUNTERTOPS_DIR, BACKUP_DIR)

    # Get all product directories (excluding special files)
    skip_items = {'index.html', 'product.html', '.DS_Store'}

    converted = 0
    for item in os.listdir(COUNTERTOPS_DIR):
        item_path = os.path.join(COUNTERTOPS_DIR, item)

        # Only process directories that are product pages
        if os.path.isdir(item_path) and item not in skip_items:
            index_path = os.path.join(item_path, 'index.html')

            if os.path.exists(index_path):
                # Replace with redirect
                with open(index_path, 'w') as f:
                    f.write(REDIRECT_TEMPLATE)
                converted += 1

    print(f"Converted {converted} countertop pages to use dynamic template")
    print(f"Backup saved at {BACKUP_DIR}")

if __name__ == '__main__':
    convert_countertops()
