#!/usr/bin/env python3
"""
Fix ALL blog posts using the clean content from pages/blog templates
and applying them to the working Cambria page structure.
"""

import os
import re
from pathlib import Path

SITE_ROOT = Path('/Users/homepc/surprise-granite-site')
BLOG_DIR = SITE_ROOT / 'blog'
PAGES_BLOG_DIR = SITE_ROOT / 'pages' / 'blog'
WORKING_PAGE = BLOG_DIR / 'top-10-best-cambria-countertop-colors' / 'index.html'

def get_working_template():
    """Load the entire working Cambria page."""
    return WORKING_PAGE.read_text(encoding='utf-8')

def parse_frontmatter(content):
    """Parse frontmatter from template file."""
    if not content.startswith('---'):
        return {}, content

    end = content.find('---', 3)
    if end == -1:
        return {}, content

    frontmatter_str = content[3:end]
    body = content[end+3:].strip()

    meta = {}
    for line in frontmatter_str.strip().split('\n'):
        if ':' in line:
            key, val = line.split(':', 1)
            meta[key.strip()] = val.strip()

    return meta, body

def extract_article_from_template(body):
    """Extract article content from template body - stop before CTA/CSS."""
    # Find the article content between <article> tags
    match = re.search(r'<article[^>]*class="blog-post-content"[^>]*>(.*?)(?=Need to talk to an expert\?|\.blog-cta-section|</article>)', body, re.DOTALL)
    if match:
        content = match.group(1).strip()
        # Clean up any trailing incomplete tags
        content = re.sub(r'<[^>]*$', '', content)
        return content

    # Fallback: just get everything after <article> until we hit the CTA
    match = re.search(r'<article[^>]*>(.*?)(?=Need to talk to an expert\?|\.blog-cta-section)', body, re.DOTALL)
    if match:
        return match.group(1).strip()

    return '<p>Content coming soon.</p>'

def apply_to_template(template, meta, article_content):
    """Apply meta and content to the working template."""
    result = template

    title = meta.get('title', 'Blog Post')
    description = meta.get('description', '')
    canonical = meta.get('canonical', '')
    og_image = meta.get('og_image', 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/65c51ec33ddf5eb79bf1f32f_kitchen%20countertops.avif')
    category = meta.get('category', 'Blog')

    # Update title tag
    result = re.sub(r'<title>[^<]*</title>', f'<title>{title}</title>', result)

    # Update canonical
    if canonical:
        result = re.sub(
            r'<link rel="canonical" href="[^"]*"/>',
            f'<link rel="canonical" href="{canonical}"/>',
            result
        )

    # Update meta description
    result = re.sub(
        r'<meta content="[^"]*" name="description"/>',
        f'<meta content="{description}" name="description"/>',
        result
    )

    # Update og:title
    result = re.sub(
        r'<meta content="[^"]*" property="og:title"/>',
        f'<meta content="{title}" property="og:title"/>',
        result
    )

    # Update og:description
    result = re.sub(
        r'<meta content="[^"]*" property="og:description"/>',
        f'<meta content="{description}" property="og:description"/>',
        result
    )

    # Update twitter:title
    result = re.sub(
        r'<meta content="[^"]*" property="twitter:title"/>',
        f'<meta content="{title}" property="twitter:title"/>',
        result
    )

    # Update twitter:description
    result = re.sub(
        r'<meta content="[^"]*" property="twitter:description"/>',
        f'<meta content="{description}" property="twitter:description"/>',
        result
    )

    # Update the Blog Hero section - category badge
    result = re.sub(
        r'(<span style="display: inline-block; background: #f9cb00[^>]*>)[^<]*(</span>)',
        f'\\g<1>{category}\\g<2>',
        result
    )

    # Update the Blog Hero section - h1 title
    result = re.sub(
        r'(<h1 style="color: white[^>]*>)[^<]*(</h1>)',
        f'\\g<1>{title}\\g<2>',
        result
    )

    # Update the Featured Image src and alt
    safe_title = title.replace('"', '&quot;')
    result = re.sub(
        r'(<div style="max-width: 900px; margin: -40px auto 0[^>]*>\s*<img src=")[^"]*("[^>]*alt=")[^"]*(")',
        f'\\g<1>{og_image}\\g<2>{safe_title}\\g<3>',
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

def fix_blog(slug, template):
    """Fix a single blog post using its template."""
    # Skip the template page
    if slug == 'top-10-best-cambria-countertop-colors':
        return True, 'template (skipped)'

    template_path = PAGES_BLOG_DIR / f'{slug}.html'
    output_path = BLOG_DIR / slug / 'index.html'

    if not template_path.exists():
        return False, 'no template'

    if not output_path.parent.exists():
        output_path.parent.mkdir(parents=True)

    try:
        content = template_path.read_text(encoding='utf-8')
    except Exception as e:
        return False, f'read error: {e}'

    meta, body = parse_frontmatter(content)
    if not meta.get('title'):
        return False, 'no title in frontmatter'

    article_content = extract_article_from_template(body)

    new_html = apply_to_template(template, meta, article_content)

    output_path.write_text(new_html, encoding='utf-8')
    return True, 'fixed'

def main():
    print("Loading working template from Cambria page...")
    template = get_working_template()
    print(f"Template size: {len(template)} characters")

    # Get all template files
    template_files = list(PAGES_BLOG_DIR.glob('*.html'))
    print(f"\nFound {len(template_files)} blog templates to process\n")

    success = 0
    failed = 0

    for template_file in sorted(template_files):
        slug = template_file.stem
        result, status = fix_blog(slug, template)
        if result:
            print(f"  {slug}: {status}")
            success += 1
        else:
            print(f"X {slug}: {status}")
            failed += 1

    print(f"\nDone: {success} fixed, {failed} failed")

if __name__ == '__main__':
    main()
