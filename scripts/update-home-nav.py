#!/usr/bin/env python3
"""
Update home page navigation and search dropdown to include Tile, Flooring, and Account links
"""

import re
from pathlib import Path


def update_home_page():
    """Update home page navigation"""
    index_file = Path('/Users/homepc/surprise-granite-site/index.html')
    content = index_file.read_text()
    original = content

    # 1. Update the "Browse Remodeling Spaces" section to include product categories
    old_browse = '''<div class="slider-list_wrapper"><a href="/services/home/kitchen-remodeling-arizona" class="button-pill-grey is-xsmall w-button">Kitchen</a><a href="/services/home/bathroom-remodeling-arizona" class="button-pill-grey is-xsmall w-button">Bathroom</a><div class="text-size-tiny">More coming soon</div></div>'''

    new_browse = '''<div class="slider-list_wrapper"><a href="/materials/all-countertops" class="button-pill-grey is-xsmall w-button">Countertops</a><a href="/materials/all-tile" class="button-pill-grey is-xsmall w-button">Tile</a><a href="/materials/flooring" class="button-pill-grey is-xsmall w-button">Flooring</a><a href="/services/home/kitchen-remodeling-arizona" class="button-pill-grey is-xsmall w-button">Kitchen</a><a href="/services/home/bathroom-remodeling-arizona" class="button-pill-grey is-xsmall w-button">Bathroom</a></div>'''

    content = content.replace(old_browse, new_browse)

    # 2. Change section title from "Browse Remodeling Spaces" to "Quick Browse"
    content = content.replace(
        '<div class="text-size-small">Browse Remodeling Spaces</div>',
        '<div class="text-size-small">Quick Browse</div>'
    )

    # 3. Update search placeholder to be more inclusive
    content = content.replace(
        'placeholder="Search countertops, services, products..."',
        'placeholder="Search countertops, tile, flooring, services..."'
    )

    if content != original:
        index_file.write_text(content)
        print('Home page updated!')
        print('Changes:')
        print('- Added Countertops, Tile, Flooring to Quick Browse section')
        print('- Renamed "Browse Remodeling Spaces" to "Quick Browse"')
        print('- Updated search placeholder')
    else:
        print('No changes made (already updated or pattern not found)')


if __name__ == '__main__':
    update_home_page()
