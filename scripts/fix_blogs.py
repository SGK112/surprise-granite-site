#!/usr/bin/env python3
"""
Fix Blog Posts - Use Granite Page as Template
Replaces the template-based blog posts with proper Webflow-compatible structure.
"""

import os
import re
from pathlib import Path

SITE_ROOT = Path('/Users/homepc/surprise-granite-site')
BLOG_DIR = SITE_ROOT / 'blog'
GRANITE_PAGE = SITE_ROOT / 'materials' / 'countertops' / 'granite-countertops' / 'index.html'

def get_page_template():
    """Extract header and footer from granite page."""
    granite = GRANITE_PAGE.read_text(encoding='utf-8')
    
    # Find where <main> starts and ends
    main_match = re.search(r'<main[^>]*class="[^"]*main-wrapper[^"]*"[^>]*>', granite)
    if main_match:
        header = granite[:main_match.end()]
        
    # Find </main> and get footer
    main_close = granite.find('</main>')
    if main_close > 0:
        footer = granite[main_close:]
    
    return header, footer

def extract_blog_metadata(html):
    """Extract title, description, and image from blog post."""
    title = ''
    description = ''
    image = ''
    category = 'Blog'
    
    # Extract title
    match = re.search(r'<title>([^<]+)</title>', html)
    if match:
        title = match.group(1)
    
    # Extract description
    match = re.search(r'name="description"[^>]*content="([^"]*)"', html)
    if not match:
        match = re.search(r'content="([^"]*)"[^>]*name="description"', html)
    if match:
        description = match.group(1)
    
    # Extract og:image
    match = re.search(r'property="og:image"[^>]*content="([^"]*)"', html)
    if not match:
        match = re.search(r'content="([^"]*)"[^>]*property="og:image"', html)
    if match:
        image = match.group(1)
    
    # Determine category from title/slug
    title_lower = title.lower()
    if 'kitchen' in title_lower:
        category = 'Kitchen Remodeling'
    elif 'bathroom' in title_lower:
        category = 'Bathroom Remodeling'
    elif 'countertop' in title_lower or 'granite' in title_lower or 'quartz' in title_lower or 'marble' in title_lower:
        category = 'Countertops'
    elif 'cabinet' in title_lower:
        category = 'Cabinets'
    elif 'tile' in title_lower or 'backsplash' in title_lower:
        category = 'Tile & Backsplash'
    
    return {
        'title': title,
        'description': description,
        'image': image,
        'category': category
    }

def extract_article_content(html):
    """Extract the article content from blog-post-content section."""
    # Try to find existing article content
    match = re.search(r'<article[^>]*class="blog-post-content"[^>]*>(.*?)</article>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Try to find richtext content
    match = re.search(r'<div[^>]*class="[^"]*w-richtext[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</div>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Return placeholder if nothing found
    return '<p>Content coming soon.</p>'

def create_blog_content(meta, article_content):
    """Create the main blog content section."""
    return f'''
      <!-- Blog Hero -->
      <section style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 100px 24px 60px; text-align: center;">
        <span style="display: inline-block; background: #f9cb00; color: #1a1a2e; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px;">{meta['category']}</span>
        <h1 style="color: white; font-size: 2.5rem; font-weight: 800; margin: 0 0 16px 0; max-width: 800px; margin-left: auto; margin-right: auto; line-height: 1.2;">{meta['title']}</h1>
        <p style="color: rgba(255,255,255,0.7); font-size: 1.1rem; max-width: 600px; margin: 0 auto;">By Surprise Granite Team</p>
      </section>

      <!-- Featured Image -->
      <div style="max-width: 900px; margin: -40px auto 0; padding: 0 24px;">
        <img src="{meta['image']}" alt="{meta['title']}" style="width: 100%; height: auto; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15);" loading="lazy"/>
      </div>

      <!-- Article Content -->
      <div style="max-width: 800px; margin: 0 auto; padding: 48px 24px;">
        <article style="font-size: 17px; line-height: 1.8; color: #333;">
          <style>
            .blog-article h2 {{ font-size: 1.75rem; font-weight: 700; color: #1a1a2e; margin: 40px 0 16px 0; }}
            .blog-article h3 {{ font-size: 1.4rem; font-weight: 700; color: #1a1a2e; margin: 32px 0 12px 0; }}
            .blog-article p {{ margin: 0 0 20px 0; }}
            .blog-article ul, .blog-article ol {{ margin: 0 0 24px 0; padding-left: 24px; }}
            .blog-article li {{ margin-bottom: 10px; }}
            .blog-article a {{ color: #1a1a2e; text-decoration: underline; text-decoration-color: #f9cb00; }}
            .blog-article a:hover {{ color: #f9cb00; }}
            .blog-article img {{ width: 100%; height: auto; border-radius: 8px; margin: 24px 0; }}
            .blog-article blockquote {{ border-left: 4px solid #f9cb00; padding-left: 20px; margin: 24px 0; font-style: italic; color: #555; }}
          </style>
          <div class="blog-article">
            {article_content}
          </div>
        </article>
        
        <!-- CTA -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 40px; text-align: center; margin-top: 48px;">
          <h3 style="color: white; font-size: 1.5rem; font-weight: 700; margin: 0 0 12px 0;">Ready to Start Your Project?</h3>
          <p style="color: rgba(255,255,255,0.8); margin: 0 0 20px 0;">Get a free in-home estimate from our expert team.</p>
          <a href="/get-a-free-estimate" style="display: inline-block; background: #f9cb00; color: #1a1a2e; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;">Get a Free Estimate</a>
        </div>
      </div>
'''

def fix_blog_post(blog_dir, header, footer):
    """Fix a single blog post."""
    html_path = blog_dir / 'index.html'
    if not html_path.exists():
        return False, 'no index.html'
    
    try:
        html = html_path.read_text(encoding='utf-8')
    except:
        return False, 'read error'
    
    meta = extract_blog_metadata(html)
    if not meta['title']:
        return False, 'no title'
    
    article_content = extract_article_content(html)
    blog_content = create_blog_content(meta, article_content)
    
    # Update header with correct title and meta
    new_header = header
    new_header = re.sub(r'<title>[^<]*</title>', f'<title>{meta["title"]}</title>', new_header)
    new_header = re.sub(r'name="description"[^>]*content="[^"]*"', f'name="description" content="{meta["description"]}"', new_header)
    new_header = re.sub(r'property="og:title"[^>]*content="[^"]*"', f'property="og:title" content="{meta["title"]}"', new_header)
    new_header = re.sub(r'property="og:description"[^>]*content="[^"]*"', f'property="og:description" content="{meta["description"]}"', new_header)
    new_header = re.sub(r'property="twitter:title"[^>]*content="[^"]*"', f'property="twitter:title" content="{meta["title"]}"', new_header)
    new_header = re.sub(r'property="twitter:description"[^>]*content="[^"]*"', f'property="twitter:description" content="{meta["description"]}"', new_header)
    
    # Build new page
    new_page = new_header + blog_content + footer
    
    # Write it
    html_path.write_text(new_page, encoding='utf-8')
    
    return True, 'fixed'

def main():
    print("Loading page template from granite page...")
    header, footer = get_page_template()
    
    # Find all blog subdirectories (skip index.html)
    blog_dirs = [d for d in BLOG_DIR.iterdir() if d.is_dir()]
    
    print(f"Found {len(blog_dirs)} blog posts to fix\n")
    
    success = 0
    failed = 0
    
    for blog_dir in sorted(blog_dirs):
        result, status = fix_blog_post(blog_dir, header, footer)
        if result:
            print(f"✓ {blog_dir.name}")
            success += 1
        else:
            print(f"✗ {blog_dir.name} ({status})")
            failed += 1
    
    print(f"\nResults: {success} fixed, {failed} failed")

if __name__ == '__main__':
    main()
