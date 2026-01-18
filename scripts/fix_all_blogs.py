#!/usr/bin/env python3
"""
Fix ALL blog posts by copying the working Cambria page structure
and only replacing title, description, image, and article content.
"""

import os
import re
from pathlib import Path

SITE_ROOT = Path('/Users/homepc/surprise-granite-site')
BLOG_DIR = SITE_ROOT / 'blog'
WORKING_PAGE = BLOG_DIR / 'top-10-best-cambria-countertop-colors' / 'index.html'

def get_working_template():
    """Load the entire working Cambria page."""
    return WORKING_PAGE.read_text(encoding='utf-8')

def extract_meta_from_file(html, slug):
    """Extract title, description, image, and category from blog file."""
    meta = {
        'title': '',
        'description': '',
        'image': 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/65c51ec33ddf5eb79bf1f32f_kitchen%20countertops.avif',
        'category': 'Blog',
        'canonical': f'https://surprisegranite.com/blog/{slug}/'
    }

    # Extract title
    match = re.search(r'<title>([^<]+)</title>', html)
    if match:
        meta['title'] = match.group(1).strip()

    # Extract description
    match = re.search(r'<meta[^>]*content="([^"]*)"[^>]*name="description"', html)
    if not match:
        match = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html)
    if match:
        meta['description'] = match.group(1).strip()

    # Extract og:image
    match = re.search(r'<meta[^>]*content="([^"]*)"[^>]*property="og:image"', html)
    if not match:
        match = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]*)"', html)
    if match and match.group(1):
        meta['image'] = match.group(1).strip()

    # Determine category from title
    title_lower = meta['title'].lower()
    if 'kitchen' in title_lower:
        meta['category'] = 'Kitchen Remodeling'
    elif 'bathroom' in title_lower:
        meta['category'] = 'Bathroom Remodeling'
    elif any(x in title_lower for x in ['countertop', 'granite', 'quartz', 'marble', 'cambria']):
        meta['category'] = 'Countertops'
    elif 'cabinet' in title_lower:
        meta['category'] = 'Cabinets'
    elif 'tile' in title_lower or 'backsplash' in title_lower:
        meta['category'] = 'Tile & Backsplash'

    return meta

def extract_article_content(html):
    """Extract just the article content (paragraphs, headings, lists)."""
    # Try to find blog-article div content
    match = re.search(r'<div class="blog-article">\s*(.*?)\s*</div>\s*</article>', html, re.DOTALL)
    if match:
        content = match.group(1).strip()
        # Remove any embedded CSS
        content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL)
        # Remove any script tags
        content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL)
        # Clean up the content
        content = content.strip()
        if content:
            return content

    # Try to find w-richtext content
    match = re.search(r'<div[^>]*class="[^"]*w-richtext[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL)
    if match:
        return match.group(1).strip()

    return '<p>Content coming soon.</p>'

def apply_to_template(template, meta, article_content):
    """Apply meta and content to the working template."""
    result = template

    # Update title tag
    result = re.sub(r'<title>[^<]*</title>', f'<title>{meta["title"]}</title>', result)

    # Update canonical
    result = re.sub(
        r'<link rel="canonical" href="[^"]*"/>',
        f'<link rel="canonical" href="{meta["canonical"]}"/>',
        result
    )

    # Update meta description
    result = re.sub(
        r'<meta content="[^"]*" name="description"/>',
        f'<meta content="{meta["description"]}" name="description"/>',
        result
    )

    # Update og:title
    result = re.sub(
        r'<meta content="[^"]*" property="og:title"/>',
        f'<meta content="{meta["title"]}" property="og:title"/>',
        result
    )

    # Update og:description
    result = re.sub(
        r'<meta content="[^"]*" property="og:description"/>',
        f'<meta content="{meta["description"]}" property="og:description"/>',
        result
    )

    # Update twitter:title
    result = re.sub(
        r'<meta content="[^"]*" property="twitter:title"/>',
        f'<meta content="{meta["title"]}" property="twitter:title"/>',
        result
    )

    # Update twitter:description
    result = re.sub(
        r'<meta content="[^"]*" property="twitter:description"/>',
        f'<meta content="{meta["description"]}" property="twitter:description"/>',
        result
    )

    # Update the Blog Hero section - category badge
    result = re.sub(
        r'(<span style="display: inline-block; background: #f9cb00[^>]*>)[^<]*(</span>)',
        f'\\g<1>{meta["category"]}\\g<2>',
        result
    )

    # Update the Blog Hero section - h1 title
    result = re.sub(
        r'(<h1 style="color: white[^>]*>)[^<]*(</h1>)',
        f'\\g<1>{meta["title"]}\\g<2>',
        result
    )

    # Update the Featured Image src and alt
    safe_title = meta['title'].replace('"', '&quot;')
    result = re.sub(
        r'(<div style="max-width: 900px; margin: -40px auto 0[^>]*>\s*<img src=")[^"]*("[^>]*alt=")[^"]*(")',
        f'\\g<1>{meta["image"]}\\g<2>{safe_title}\\g<3>',
        result
    )

    # Update the article content
    result = re.sub(
        r'(<div class="blog-article">).*?(</div>\s*</article>)',
        f'\\g<1>\n            {article_content}\n          \\g<2>',
        result,
        flags=re.DOTALL
    )

    return result

def fix_blog(blog_dir, template):
    """Fix a single blog post."""
    slug = blog_dir.name

    # Skip the template page
    if slug == 'top-10-best-cambria-countertop-colors':
        return True, 'template (skipped)'

    html_path = blog_dir / 'index.html'
    if not html_path.exists():
        return False, 'no index.html'

    try:
        html = html_path.read_text(encoding='utf-8')
    except Exception as e:
        return False, f'read error: {e}'

    meta = extract_meta_from_file(html, slug)
    if not meta['title']:
        return False, 'no title found'

    article_content = extract_article_content(html)

    new_html = apply_to_template(template, meta, article_content)

    html_path.write_text(new_html, encoding='utf-8')
    return True, 'fixed'

def main():
    print("Loading working template from Cambria page...")
    template = get_working_template()
    print(f"Template size: {len(template)} characters")

    blog_dirs = [d for d in BLOG_DIR.iterdir() if d.is_dir()]
    print(f"\nFound {len(blog_dirs)} blog posts to process\n")

    success = 0
    failed = 0

    for blog_dir in sorted(blog_dirs):
        result, status = fix_blog(blog_dir, template)
        if result:
            print(f"  {blog_dir.name}: {status}")
            success += 1
        else:
            print(f"X {blog_dir.name}: {status}")
            failed += 1

    print(f"\nDone: {success} fixed, {failed} failed")

if __name__ == '__main__':
    main()
