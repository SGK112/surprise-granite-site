#!/usr/bin/env python3
"""
Generate blog-posts.json from markdown files for the standalone blog engine
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime

CONTENT_DIR = Path("/Users/homepc/surprise-granite-site/content/blog")
OUTPUT_FILE = Path("/Users/homepc/surprise-granite-site/data/blog-posts.json")

def parse_frontmatter(content):
    """Extract frontmatter from markdown file"""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return {}

    frontmatter = {}
    for line in match.group(1).split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            frontmatter[key] = value

    return frontmatter

def get_category_slug(category):
    """Convert category to URL-friendly slug"""
    category_map = {
        'Kitchen': 'kitchen',
        'Bathroom': 'bathroom',
        'Countertops': 'countertops',
        'Home Remodeling': 'guides',
        'General': 'guides'
    }
    return category_map.get(category, 'guides')

def format_date(date_str):
    """Format date for display"""
    try:
        date = datetime.strptime(date_str, '%Y-%m-%d')
        return date.strftime('%B %Y')
    except:
        return date_str

def main():
    posts = []

    if not CONTENT_DIR.exists():
        print(f"Content directory not found: {CONTENT_DIR}")
        return

    for md_file in sorted(CONTENT_DIR.glob('*.md')):
        with open(md_file, 'r', encoding='utf-8') as f:
            content = f.read()

        fm = parse_frontmatter(content)

        if not fm.get('title'):
            continue

        post = {
            'slug': fm.get('slug', md_file.stem),
            'title': fm.get('title', ''),
            'description': fm.get('description', ''),
            'date': fm.get('date', ''),
            'dateFormatted': format_date(fm.get('date', '')),
            'category': fm.get('category', 'General'),
            'categorySlug': get_category_slug(fm.get('category', 'General')),
            'image': fm.get('image', ''),
            'author': fm.get('author', 'Surprise Granite'),
            'url': f"/blog/{fm.get('slug', md_file.stem)}/"
        }

        posts.append(post)

    # Sort by date descending
    posts.sort(key=lambda x: x['date'], reverse=True)

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Write JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump({'posts': posts, 'total': len(posts)}, f, indent=2)

    print(f"Generated {len(posts)} posts to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
