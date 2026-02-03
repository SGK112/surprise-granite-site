#!/usr/bin/env python3
"""
Fix broken images in slabs.json
- Replace .tif images (browsers can't display)
- Replace other known broken URLs
"""

import json
import re

# Placeholder images by material type
PLACEHOLDERS = {
    'quartz': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg',
    'granite': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb2b55efbb1f5_MSI%20Surfaces%20-%20Surprise%20Granite%20absolute-black-granite%20-%20close%20up.jpg',
    'marble': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2b48efbbd7f_msi-surfaces-sruprise-granite-absolute-white-marble-close%20up.jpg',
    'quartzite': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2dc93fbbbe4_Pental-quartz-surprise-granite-super-white-close-up.jpeg',
    'porcelain': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg',
    'default': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg',
}

def is_broken_url(url):
    """Check if URL is broken (browsers can't display)."""
    if not url:
        return True
    # .tif files can't be displayed by browsers
    if '.tif' in url.lower():
        return True
    # Empty or placeholder URLs
    if url.strip() == '' or url == 'null':
        return True
    return False

def get_placeholder(material_type):
    """Get placeholder image for material type."""
    material = (material_type or '').lower()
    return PLACEHOLDERS.get(material, PLACEHOLDERS['default'])

def fix_images():
    with open('/Users/homepc/surprise-granite-site/data/slabs.json', 'r') as f:
        slabs = json.load(f)

    fixed_count = 0

    for slab in slabs:
        images = slab.get('images', [])
        material = slab.get('productType', 'quartz')

        if not images:
            # No images - add placeholder
            slab['images'] = [get_placeholder(material)]
            fixed_count += 1
            print(f"Added placeholder for: {slab.get('title')}")
        else:
            # Check each image
            new_images = []
            changed = False
            for img in images:
                if is_broken_url(img):
                    new_images.append(get_placeholder(material))
                    changed = True
                else:
                    new_images.append(img)

            if changed:
                slab['images'] = new_images
                fixed_count += 1
                print(f"Fixed images for: {slab.get('title')}")

    # Save updated data
    with open('/Users/homepc/surprise-granite-site/data/slabs.json', 'w') as f:
        json.dump(slabs, f, indent=2)

    print(f"\nFixed {fixed_count} products with broken images")

if __name__ == '__main__':
    fix_images()
