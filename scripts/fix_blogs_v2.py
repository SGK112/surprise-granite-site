#!/usr/bin/env python3
"""
Fix Blog Posts - Version 2 with proper meta tag handling
"""

import os
import re
from pathlib import Path

SITE_ROOT = Path('/Users/homepc/surprise-granite-site')
BLOG_DIR = SITE_ROOT / 'blog'
GRANITE_PAGE = SITE_ROOT / 'materials' / 'countertops' / 'granite-countertops' / 'index.html'
PAGES_BLOG_DIR = SITE_ROOT / 'pages' / 'blog'

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

def get_original_blog_data(slug):
    """Try to get data from pages/blog template file if exists."""
    template_file = PAGES_BLOG_DIR / f'{slug}.html'
    if template_file.exists():
        try:
            content = template_file.read_text(encoding='utf-8')
            # Extract frontmatter
            if content.startswith('---'):
                end = content.find('---', 3)
                if end > 0:
                    frontmatter = content[3:end]
                    data = {}
                    for line in frontmatter.strip().split('\n'):
                        if ':' in line:
                            key, val = line.split(':', 1)
                            data[key.strip()] = val.strip()
                    return data
        except:
            pass
    return None

def extract_blog_metadata(html, slug):
    """Extract title, description, and image from blog post."""
    meta = {
        'title': '',
        'description': '',
        'image': '',
        'category': 'Blog',
        'canonical': f'https://surprisegranite.com/blog/{slug}/'
    }
    
    # First try to get from pages/blog template
    template_data = get_original_blog_data(slug)
    if template_data:
        if 'title' in template_data:
            meta['title'] = template_data['title']
        if 'description' in template_data:
            meta['description'] = template_data['description']
        if 'og_image' in template_data:
            meta['image'] = template_data['og_image']
        if 'canonical' in template_data:
            meta['canonical'] = template_data['canonical']
        if 'category' in template_data:
            meta['category'] = template_data['category']
    
    # Fall back to extracting from HTML
    if not meta['title']:
        match = re.search(r'<title>([^<]+)</title>', html)
        if match:
            meta['title'] = match.group(1)
    
    if not meta['description']:
        match = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html)
        if not match:
            match = re.search(r'<meta[^>]*content="([^"]*)"[^>]*name="description"', html)
        if match:
            meta['description'] = match.group(1)
    
    if not meta['image']:
        match = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]*)"', html)
        if not match:
            match = re.search(r'<meta[^>]*content="([^"]*)"[^>]*property="og:image"', html)
        if match:
            meta['image'] = match.group(1)
    
    # Determine category from title if not set
    if meta['category'] == 'Blog':
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
    """Extract the article content."""
    # Try to find existing article content from template-based pages
    match = re.search(r'<article[^>]*class="blog-post-content"[^>]*>(.*?)</article>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Try blog-article class
    match = re.search(r'<div[^>]*class="blog-article"[^>]*>(.*?)</div>\s*</article>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Return placeholder
    return '<p>Content coming soon. Please check back later for the full article.</p>'

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
        <img src="{meta['image']}" alt="{meta['title']}" style="width: 100%; height: auto; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15);" loading="lazy" onerror="this.style.display='none'"/>
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

def update_header_meta(header, meta):
    """Update meta tags in header."""
    # Replace title
    header = re.sub(r'<title>[^<]*</title>', f'<title>{meta["title"]}</title>', header)
    
    # Replace canonical
    header = re.sub(
        r'<link rel="canonical" href="[^"]*"/>',
        f'<link rel="canonical" href="{meta["canonical"]}"/>',
        header
    )
    
    # Replace description - handle both formats
    header = re.sub(
        r'<meta content="[^"]*" name="description"/>',
        f'<meta content="{meta["description"]}" name="description"/>',
        header
    )
    header = re.sub(
        r'<meta name="description" content="[^"]*"/>',
        f'<meta name="description" content="{meta["description"]}"/>',
        header
    )
    
    # Replace og:title
    header = re.sub(
        r'<meta content="[^"]*" property="og:title"/>',
        f'<meta content="{meta["title"]}" property="og:title"/>',
        header
    )
    
    # Replace og:description
    header = re.sub(
        r'<meta content="[^"]*" property="og:description"/>',
        f'<meta content="{meta["description"]}" property="og:description"/>',
        header
    )
    
    # Replace twitter:title
    header = re.sub(
        r'<meta content="[^"]*" property="twitter:title"/>',
        f'<meta content="{meta["title"]}" property="twitter:title"/>',
        header
    )
    
    # Replace twitter:description
    header = re.sub(
        r'<meta content="[^"]*" property="twitter:description"/>',
        f'<meta content="{meta["description"]}" property="twitter:description"/>',
        header
    )
    
    return header

def fix_blog_post(blog_dir, header, footer):
    """Fix a single blog post."""
    slug = blog_dir.name
    html_path = blog_dir / 'index.html'
    
    if not html_path.exists():
        return False, 'no index.html'
    
    try:
        html = html_path.read_text(encoding='utf-8')
    except:
        return False, 'read error'
    
    meta = extract_blog_metadata(html, slug)
    if not meta['title']:
        return False, 'no title'
    
    article_content = extract_article_content(html)
    blog_content = create_blog_content(meta, article_content)
    
    # Update header with correct metadata
    new_header = update_header_meta(header, meta)
    
    # Build new page
    new_page = new_header + blog_content + footer
    
    # Write it
    html_path.write_text(new_page, encoding='utf-8')
    
    return True, 'fixed'

def main():
    print("Loading page template from granite page...")
    header, footer = get_page_template()
    
    # Find all blog subdirectories
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
