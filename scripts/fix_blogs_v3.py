#!/usr/bin/env python3
"""
Fix Blog Posts - Version 3 with clean footer
"""

import os
import re
from pathlib import Path

SITE_ROOT = Path('/Users/homepc/surprise-granite-site')
BLOG_DIR = SITE_ROOT / 'blog'
GRANITE_PAGE = SITE_ROOT / 'materials' / 'countertops' / 'granite-countertops' / 'index.html'
PAGES_BLOG_DIR = SITE_ROOT / 'pages' / 'blog'

def get_page_header():
    """Extract just the header (up to and including <main> opening) from granite page."""
    granite = GRANITE_PAGE.read_text(encoding='utf-8')
    
    # Find where <main> starts
    main_match = re.search(r'<main[^>]*class="[^"]*main-wrapper[^"]*"[^>]*>', granite)
    if main_match:
        return granite[:main_match.end()]
    return None

def get_clean_footer():
    """Create a clean footer without the filter scripts."""
    return '''</main>
  </div>
  
  <!-- Footer -->
  <footer class="simple-footer">
    <div class="footer-main">
      <div class="footer-grid">
        <div class="footer-col">
          <h4>Products</h4>
          <a href="/materials/all-countertops">Countertops</a>
          <a href="/materials/all-cabinets">Cabinets</a>
          <a href="/materials/flooring">Flooring</a>
          <a href="/materials/all-tile">Tile & Backsplash</a>
        </div>
        <div class="footer-col">
          <h4>Services</h4>
          <a href="/services/home/kitchen-remodeling-arizona">Kitchen Remodeling</a>
          <a href="/services/home/bathroom-remodeling-arizona">Bathroom Remodeling</a>
          <a href="/get-a-free-estimate">Free Estimate</a>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <a href="/company/about-us">About Us</a>
          <a href="/company/project-gallery">Gallery</a>
          <a href="/company/reviews">Reviews</a>
          <a href="/blog">Blog</a>
        </div>
        <div class="footer-col">
          <h4>Contact</h4>
          <div class="footer-contact">
            <p><strong>Surprise Granite</strong><br>14050 N 83rd Ave Suite 290<br>Peoria, AZ 85381</p>
            <p><a href="tel:+16028333189">(602) 833-3189</a></p>
          </div>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="footer-bottom-inner">
        <div class="footer-legal">
          <a href="/company/privacy-policy">Privacy</a>
          <a href="/company/terms-of-service">Terms</a>
        </div>
        <div class="footer-copy">&copy; 2025 Surprise Granite Marble & Quartz</div>
      </div>
    </div>
  </footer>

  <style>
  .simple-footer { background: #1a1a2e; color: #fff; margin-top: 60px; }
  .footer-main { padding: 48px 24px; max-width: 1100px; margin: 0 auto; }
  .footer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 40px; }
  @media (max-width: 800px) { .footer-grid { grid-template-columns: repeat(2, 1fr); gap: 32px; } }
  @media (max-width: 500px) { .footer-grid { grid-template-columns: 1fr; } }
  .footer-col h4 { color: #f9cb00; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; }
  .footer-col a { display: block; color: rgba(255,255,255,0.8); text-decoration: none; font-size: 14px; padding: 6px 0; transition: color 0.2s; }
  .footer-col a:hover { color: #f9cb00; }
  .footer-contact p { font-size: 13px; color: rgba(255,255,255,0.7); margin: 0 0 12px 0; line-height: 1.5; }
  .footer-contact strong { color: rgba(255,255,255,0.9); }
  .footer-contact a { display: inline; padding: 0; }
  .footer-bottom { border-top: 1px solid rgba(255,255,255,0.1); padding: 20px 24px; }
  .footer-bottom-inner { max-width: 1100px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  .footer-legal { display: flex; gap: 16px; }
  .footer-legal a { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 12px; }
  .footer-legal a:hover { color: #f9cb00; }
  .footer-copy { color: rgba(255,255,255,0.4); font-size: 12px; }
  @media (max-width: 700px) { .footer-bottom-inner { flex-direction: column; text-align: center; } }
  </style>

  <!-- Webflow JS -->
  <script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js" type="text/javascript" crossorigin="anonymous"></script>
  <script src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/js/webflow.741b4ac7.a2dfb666f301e88a.js" type="text/javascript"></script>
</body>
</html>'''

def get_original_blog_data(slug):
    """Try to get data from pages/blog template file if exists."""
    template_file = PAGES_BLOG_DIR / f'{slug}.html'
    if template_file.exists():
        try:
            content = template_file.read_text(encoding='utf-8')
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
        # Default image if none found
        if not meta['image']:
            meta['image'] = 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/65c51ec33ddf5eb79bf1f32f_kitchen%20countertops.avif'
    
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
    # Try to find blog-article div content
    match = re.search(r'<div class="blog-article">(.*?)</div>\s*</article>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Try to find existing article content from template-based pages
    match = re.search(r'<article[^>]*class="blog-post-content"[^>]*>(.*?)</article>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    return '<p>Content coming soon. Please check back later for the full article.</p>'

def create_blog_content(meta, article_content):
    """Create the main blog content section."""
    # Escape any problematic characters in title for HTML attributes
    safe_title = meta['title'].replace('"', '&quot;')
    
    return f'''
      <!-- Blog Hero -->
      <section style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 100px 24px 60px; text-align: center;">
        <span style="display: inline-block; background: #f9cb00; color: #1a1a2e; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px;">{meta['category']}</span>
        <h1 style="color: white; font-size: 2.5rem; font-weight: 800; margin: 0 0 16px 0; max-width: 800px; margin-left: auto; margin-right: auto; line-height: 1.2;">{meta['title']}</h1>
        <p style="color: rgba(255,255,255,0.7); font-size: 1.1rem; max-width: 600px; margin: 0 auto;">By Surprise Granite Team</p>
      </section>

      <!-- Featured Image -->
      <div style="max-width: 900px; margin: -40px auto 0; padding: 0 24px;">
        <img src="{meta['image']}" alt="{safe_title}" style="width: 100%; height: auto; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15);" loading="lazy" onerror="this.style.display='none'"/>
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
    header = re.sub(r'<title>[^<]*</title>', f'<title>{meta["title"]}</title>', header)
    header = re.sub(r'<link rel="canonical" href="[^"]*"/>', f'<link rel="canonical" href="{meta["canonical"]}"/>', header)
    header = re.sub(r'<meta content="[^"]*" name="description"/>', f'<meta content="{meta["description"]}" name="description"/>', header)
    header = re.sub(r'<meta content="[^"]*" property="og:title"/>', f'<meta content="{meta["title"]}" property="og:title"/>', header)
    header = re.sub(r'<meta content="[^"]*" property="og:description"/>', f'<meta content="{meta["description"]}" property="og:description"/>', header)
    header = re.sub(r'<meta content="[^"]*" property="twitter:title"/>', f'<meta content="{meta["title"]}" property="twitter:title"/>', header)
    header = re.sub(r'<meta content="[^"]*" property="twitter:description"/>', f'<meta content="{meta["description"]}" property="twitter:description"/>', header)
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
    
    new_header = update_header_meta(header, meta)
    new_page = new_header + blog_content + footer
    
    html_path.write_text(new_page, encoding='utf-8')
    return True, 'fixed'

def main():
    print("Loading page template...")
    header = get_page_header()
    footer = get_clean_footer()
    
    if not header:
        print("ERROR: Could not extract header from granite page")
        return
    
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
