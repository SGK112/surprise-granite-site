#!/usr/bin/env python3
"""
Comprehensive site update script for Surprise Granite
- Removes showroom/location references
- Updates messaging for in-home service model
- Adds prominent Shop links
- Updates form endpoints for VoiceFlow CRM
"""

import os
import re
from pathlib import Path

PAGES_DIR = "/Users/homepc/surprise-granite-site/pages"

# Replacements to make across all files
REPLACEMENTS = [
    # Remove showroom references
    (r'Visit our showroom', 'Schedule a free consultation'),
    (r'visit our showroom', 'schedule a free consultation'),
    (r'From our showroom in Surprise', 'Serving the Phoenix metro area'),
    (r'with a showroom you can visit', 'with convenient in-home consultations'),
    (r'Visit our showroom to choose from', 'Browse our selection of'),
    (r'showroom in Surprise', 'service area'),
    (r'our Surprise showroom', 'your home'),

    # Update placeholder addresses in forms
    (r'placeholder="123 Main St, Surprise, AZ"', 'placeholder="Your address (for estimate)"'),
    (r'123 Main St, Surprise, AZ', 'Your Service Address'),

    # Remove specific location detection prompts
    (r'Visit a Showroom', 'Free In-Home Estimate'),
    (r'visit a showroom', 'get a free in-home estimate'),

    # Update service messaging
    (r'Visit one of our Surprise Granite locations', 'Get a free in-home consultation'),
    (r'to view countertop samples', 'where we bring samples to you'),
]

def update_html_file(filepath):
    """Update a single HTML file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    for pattern, replacement in REPLACEMENTS:
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)

    # Track changes
    changes = content != original

    if changes:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    return changes

def add_shop_link_to_nav(filepath):
    """Add Shop link to navigation if not present"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check if shop link already exists
    if 'store.surprisegranite.com' in content:
        return False

    # Find navigation and add shop link before Contact
    # Look for the nav-link pattern
    nav_patterns = [
        (r'(<a[^>]*href="[^"]*contact[^"]*"[^>]*class="[^"]*nav-link[^"]*"[^>]*>)',
         r'<a href="https://store.surprisegranite.com" target="_blank" class="nav-link w-nav-link">Shop</a>\1'),
        (r'(Contact</a>)',
         r'Shop</a><a href="https://store.surprisegranite.com" target="_blank" class="nav-link w-nav-link">\1'),
    ]

    original = content
    for pattern, replacement in nav_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            content = re.sub(pattern, replacement, content, count=1, flags=re.IGNORECASE)
            break

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True

    return False

def update_visit_showroom_page():
    """Transform visit-a-showroom page to in-home consultation page"""
    filepath = os.path.join(PAGES_DIR, "company_visit-a-showroom.html")

    if not os.path.exists(filepath):
        return False

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Update page title and meta
    content = re.sub(
        r'<title>Visit a Showroom[^<]*</title>',
        '<title>Free In-Home Consultation | Surprise Granite</title>',
        content
    )
    content = re.sub(
        r'content="Visit one of our Surprise Granite locations[^"]*"',
        'content="Schedule a free in-home consultation. We bring countertop samples directly to your home for a personalized selection experience."',
        content
    )
    content = re.sub(
        r'property="og:title" content="Visit a Showroom[^"]*"',
        'property="og:title" content="Free In-Home Consultation | Surprise Granite"',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    return True

def update_form_endpoints():
    """Update form submission endpoints to VoiceFlow CRM"""
    # The current endpoint remodely.app.n8n.cloud is already connected to the CRM
    # We'll keep it as is but ensure forms work properly

    for html_file in Path(PAGES_DIR).glob("*.html"):
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # The n8n webhook is already integrated with the CRM
        # Just make sure the endpoint is correct
        content = content.replace(
            'https://remodely.app.n8n.cloud/webhook/surprise-granite-hero-lead',
            'https://voiceflow-crm.onrender.com/api/webhooks/website-lead'
        )

        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(content)

def add_in_home_service_badge():
    """Add 'We Come To You!' badge to key pages"""
    badge_html = '''
<!-- In-Home Service Badge -->
<style>
.in-home-badge {
    position: fixed;
    bottom: 100px;
    left: 20px;
    background: linear-gradient(135deg, #c9a227 0%, #d4af37 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 25px;
    font-weight: 600;
    font-size: 14px;
    box-shadow: 0 4px 15px rgba(201, 162, 39, 0.4);
    z-index: 999;
    display: flex;
    align-items: center;
    gap: 8px;
}
.in-home-badge svg {
    width: 20px;
    height: 20px;
}
@media (max-width: 768px) {
    .in-home-badge {
        bottom: 80px;
        left: 10px;
        font-size: 12px;
        padding: 10px 15px;
    }
}
</style>
<div class="in-home-badge">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
    We Come To You!
</div>
'''

    # Add to key pages
    key_pages = ['index.html', 'get-a-free-estimate.html', 'contact-us.html']

    for page in key_pages:
        filepath = os.path.join(PAGES_DIR, page)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            if 'in-home-badge' not in content:
                # Add before closing body tag
                content = content.replace('</body>', f'{badge_html}\n</body>')

                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)

def main():
    print("=" * 60)
    print("Updating Surprise Granite Site")
    print("=" * 60)

    # 1. Update all HTML files with replacements
    print("\n1. Updating showroom/location references...")
    updated_count = 0
    for html_file in Path(PAGES_DIR).glob("*.html"):
        if update_html_file(str(html_file)):
            print(f"   Updated: {html_file.name}")
            updated_count += 1
    print(f"   {updated_count} files updated")

    # 2. Transform visit-a-showroom page
    print("\n2. Transforming visit-a-showroom page...")
    if update_visit_showroom_page():
        print("   Converted to In-Home Consultation page")

    # 3. Add shop links
    print("\n3. Adding Shop links to navigation...")
    shop_added = 0
    for html_file in Path(PAGES_DIR).glob("*.html"):
        if add_shop_link_to_nav(str(html_file)):
            shop_added += 1
    print(f"   Added Shop link to {shop_added} pages")

    # 4. Update form endpoints
    print("\n4. Updating form endpoints for CRM integration...")
    update_form_endpoints()
    print("   Form endpoints updated to VoiceFlow CRM")

    # 5. Add in-home service badge
    print("\n5. Adding 'We Come To You' badge...")
    add_in_home_service_badge()
    print("   Badge added to key pages")

    print("\n" + "=" * 60)
    print("SITE UPDATE COMPLETE!")
    print("=" * 60)
    print("""
Changes made:
- Removed showroom/location references
- Updated visit-a-showroom → Free In-Home Consultation
- Added Shop link to Shopify store
- Updated forms to submit to VoiceFlow CRM
- Added 'We Come To You!' badge

Next steps:
1. Review changes locally
2. Commit and push to GitHub
3. Site will auto-deploy on Render
""")

if __name__ == "__main__":
    main()
