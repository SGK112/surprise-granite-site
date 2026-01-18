#!/usr/bin/env python3
"""
Blog Migration Script - Surprise Granite

Migrates Webflow-exported blog posts to the new template system.
Extracts content from existing HTML and creates template-based pages.

Usage:
    python3 migrate_blogs.py              # Migrate all posts
    python3 migrate_blogs.py --dry-run    # Preview without writing
"""

import os
import re
import sys
from pathlib import Path
from html.parser import HTMLParser
from html import unescape

SITE_ROOT = Path(__file__).parent
BLOG_DIR = SITE_ROOT / 'blog'
PAGES_BLOG_DIR = SITE_ROOT / 'pages' / 'blog'

# Posts already migrated manually (skip these)
ALREADY_MIGRATED = {
    '2025-kitchen-design-trends',
    'top-10-best-cambria-countertop-colors',
    'countertop-thickness-guide',
}

class ContentExtractor(HTMLParser):
    """Extract rich text content from Webflow blog posts."""

    def __init__(self):
        super().__init__()
        self.in_richtext = False
        self.content = []
        self.current_tag = None
        self.tag_stack = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        classes = attrs_dict.get('class', '')

        # Start capturing when we hit the rich text content
        if 'w-richtext' in classes and 'is-blog' in classes:
            self.in_richtext = True
            return

        if not self.in_richtext:
            return

        # Skip nested divs and non-content elements
        if tag in ['div', 'span'] and 'w-' in classes:
            self.skip_depth += 1
            return

        if self.skip_depth > 0:
            return

        self.tag_stack.append(tag)

        # Build the tag
        if tag == 'a':
            href = attrs_dict.get('href', '#')
            self.content.append(f'<a href="{href}">')
        elif tag == 'img':
            src = attrs_dict.get('src', '')
            alt = attrs_dict.get('alt', '')
            self.content.append(f'<img src="{src}" alt="{alt}" loading="lazy"/>')
        elif tag == 'figure':
            style = attrs_dict.get('style', '')
            self.content.append(f'<figure>')
        elif tag in ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'figcaption']:
            self.content.append(f'<{tag}>')

    def handle_endtag(self, tag):
        if not self.in_richtext:
            return

        # Check if we're exiting the richtext area
        if tag == 'div':
            if self.skip_depth > 0:
                self.skip_depth -= 1
            return

        if self.skip_depth > 0:
            return

        if self.tag_stack and self.tag_stack[-1] == tag:
            self.tag_stack.pop()

        if tag in ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'figure', 'figcaption']:
            self.content.append(f'</{tag}>')

    def handle_data(self, data):
        if not self.in_richtext or self.skip_depth > 0:
            return
        # Clean up the text
        text = data.strip()
        if text:
            self.content.append(unescape(text))

    def get_content(self):
        return ''.join(self.content)


def extract_meta(html, pattern):
    """Extract meta content using regex."""
    match = re.search(pattern, html)
    return match.group(1) if match else ''


def extract_blog_data(html_path):
    """Extract all needed data from a Webflow blog post."""
    html = html_path.read_text(encoding='utf-8')

    # Extract metadata
    title = extract_meta(html, r'<title>([^<]+)</title>')
    description = extract_meta(html, r'name="description"[^>]*content="([^"]*)"')
    if not description:
        description = extract_meta(html, r'content="([^"]*)"[^>]*name="description"')

    canonical = extract_meta(html, r'rel="canonical"[^>]*href="([^"]*)"')
    if not canonical:
        canonical = extract_meta(html, r'href="([^"]*)"[^>]*rel="canonical"')

    og_image = extract_meta(html, r'property="og:image"[^>]*content="([^"]*)"')
    if not og_image:
        og_image = extract_meta(html, r'content="([^"]*)"[^>]*property="og:image"')
    if not og_image:
        og_image = extract_meta(html, r'property="twitter:image"[^>]*content="([^"]*)"')
    if not og_image:
        og_image = extract_meta(html, r'content="([^"]*)"[^>]*property="twitter:image"')

    # Extract content
    extractor = ContentExtractor()
    try:
        extractor.feed(html)
        content = extractor.get_content()
    except:
        content = ''

    # Determine category from URL or content
    slug = html_path.parent.name
    category = 'Blog'
    if 'kitchen' in slug.lower() or 'kitchen' in title.lower():
        category = 'Kitchen Remodeling'
    elif 'bathroom' in slug.lower() or 'bathroom' in title.lower():
        category = 'Bathroom Remodeling'
    elif 'countertop' in slug.lower() or 'granite' in slug.lower() or 'quartz' in slug.lower():
        category = 'Countertops'
    elif 'cabinet' in slug.lower():
        category = 'Cabinets'
    elif 'tile' in slug.lower() or 'backsplash' in slug.lower():
        category = 'Tile & Backsplash'

    return {
        'title': title,
        'description': description,
        'canonical': canonical,
        'og_image': og_image,
        'content': content,
        'category': category,
        'slug': slug,
    }


def generate_template(data):
    """Generate the new template-based blog post."""

    # Clean up content - ensure proper HTML structure
    content = data['content']
    if not content.strip():
        content = '<p>Content migration in progress. Please check back soon.</p>'

    template = f'''---
title: {data['title']}
description: {data['description']}
canonical: {data['canonical']}
og_image: {data['og_image']}
output: blog/{data['slug']}/index.html
category: {data['category']}
date:
author: Surprise Granite Team
read_time: 5 min read
---
<!DOCTYPE html>
<html lang="en">
<head>
  <title>{{{{TITLE}}}}</title>
  <meta name="description" content="{{{{DESCRIPTION}}}}"/>
  <link rel="canonical" href="{{{{CANONICAL}}}}"/>
  <meta property="og:title" content="{{{{TITLE}}}}"/>
  <meta property="og:description" content="{{{{DESCRIPTION}}}}"/>
  <meta property="og:image" content="{{{{OG_IMAGE}}}}"/>
  <meta property="og:type" content="article"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="{{{{TITLE}}}}"/>
  <meta name="twitter:description" content="{{{{DESCRIPTION}}}}"/>
  <meta name="twitter:image" content="{{{{OG_IMAGE}}}}"/>
  {{{{HEAD}}}}
  {{{{BLOG_POST_STYLES}}}}
  <style>
    .main-wrapper {{ padding-top: 140px; }}
  </style>
</head>
<body>
  <div class="page-wrapper">
    {{{{NAVBAR}}}}
    <main class="main-wrapper">

      <!-- Blog Post Header -->
      <div class="blog-post-header">
        <span class="blog-post-category">{{{{CATEGORY}}}}</span>
        <h1 class="blog-post-title">{{{{TITLE}}}}</h1>
        <div class="blog-post-meta">
          <span>{{{{DATE}}}}</span>
          <span>{{{{READ_TIME}}}}</span>
          <span>By {{{{AUTHOR}}}}</span>
        </div>
      </div>

      <div class="blog-post-wrapper">
        <!-- Featured Image -->
        <div class="blog-post-hero">
          <img src="{data['og_image']}" alt="{data['title']}" loading="lazy"/>
        </div>

        <!-- Content Layout -->
        <div class="blog-post-layout">
          <!-- Article Content -->
          <article class="blog-post-content">
            {content}
          </article>

          <!-- Sidebar -->
          <aside class="blog-post-sidebar">
            <div class="sidebar-cta">
              <h3>Need Expert Advice?</h3>
              <p>Request a call with one of our remodeling experts to discuss your project.</p>
              <form action="https://usebasin.com/f/6754c18a0634" method="POST">
                <input type="text" name="name" placeholder="Your Name" required/>
                <input type="tel" name="phone" placeholder="Phone Number" required/>
                <input type="email" name="email" placeholder="Email Address" required/>
                <input type="hidden" name="source" value="Blog: {data['title']}"/>
                <button type="submit">Request a Call</button>
              </form>
              <p class="form-note">We respect your privacy. Your info is never shared.</p>
            </div>
          </aside>
        </div>
      </div>

    </main>
    {{{{FOOTER}}}}
  </div>
  {{{{SCRIPTS}}}}
</body>
</html>
'''
    return template


def migrate_post(blog_dir, dry_run=False):
    """Migrate a single blog post."""
    slug = blog_dir.name

    if slug in ALREADY_MIGRATED:
        return None, 'already migrated'

    html_path = blog_dir / 'index.html'
    if not html_path.exists():
        return None, 'no index.html found'

    # Extract data
    data = extract_blog_data(html_path)

    if not data['title']:
        return None, 'could not extract title'

    # Generate template
    template = generate_template(data)

    # Write to pages/blog/
    output_path = PAGES_BLOG_DIR / f"{slug}.html"

    if not dry_run:
        PAGES_BLOG_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_text(template, encoding='utf-8')

    return output_path, 'success'


def main():
    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print("DRY RUN - No files will be written\n")

    # Find all blog directories
    blog_dirs = [d for d in BLOG_DIR.iterdir() if d.is_dir()]

    print(f"Found {len(blog_dirs)} blog posts to process\n")

    success = 0
    skipped = 0
    failed = 0

    for blog_dir in sorted(blog_dirs):
        result, status = migrate_post(blog_dir, dry_run)

        if status == 'success':
            print(f"✓ {blog_dir.name}")
            success += 1
        elif status == 'already migrated':
            print(f"⊘ {blog_dir.name} (already migrated)")
            skipped += 1
        else:
            print(f"✗ {blog_dir.name} ({status})")
            failed += 1

    print(f"\nResults: {success} migrated, {skipped} skipped, {failed} failed")

    if not dry_run and success > 0:
        print(f"\nTemplate files created in: {PAGES_BLOG_DIR}")
        print("Run 'python3 build.py' to generate the final HTML files")


if __name__ == '__main__':
    main()
