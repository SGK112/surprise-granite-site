#!/usr/bin/env python3
"""
Convert Webflow blog posts from HTML to Markdown
"""

import os
import re
import json
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime

# Paths
BLOG_DIR = Path("/Users/homepc/surprise-granite-site/blog")
OUTPUT_DIR = Path("/Users/homepc/surprise-granite-site/content/blog")

class HTMLToMarkdown(HTMLParser):
    """Simple HTML to Markdown converter"""

    def __init__(self):
        super().__init__()
        self.markdown = []
        self.current_tag = None
        self.in_content = False
        self.list_type = None
        self.list_count = 0
        self.skip_tags = {'script', 'style', 'nav', 'header', 'footer', 'noscript', 'svg', 'path', 'form', 'input', 'button'}
        self.skip_depth = 0
        self.in_paragraph = False
        self.link_href = None
        self.image_src = None
        self.image_alt = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        # Skip certain tags entirely
        if tag in self.skip_tags:
            self.skip_depth += 1
            return

        if self.skip_depth > 0:
            return

        self.current_tag = tag

        if tag == 'h1':
            self.markdown.append('\n# ')
        elif tag == 'h2':
            self.markdown.append('\n\n## ')
        elif tag == 'h3':
            self.markdown.append('\n\n### ')
        elif tag == 'h4':
            self.markdown.append('\n\n#### ')
        elif tag == 'p':
            self.markdown.append('\n\n')
            self.in_paragraph = True
        elif tag == 'br':
            self.markdown.append('\n')
        elif tag == 'strong' or tag == 'b':
            self.markdown.append('**')
        elif tag == 'em' or tag == 'i':
            self.markdown.append('*')
        elif tag == 'a':
            self.link_href = attrs_dict.get('href', '')
            self.markdown.append('[')
        elif tag == 'img':
            src = attrs_dict.get('src', '')
            alt = attrs_dict.get('alt', '')
            if src and not src.startswith('data:'):
                self.markdown.append(f'\n\n![{alt}]({src})\n\n')
        elif tag == 'ul':
            self.list_type = 'ul'
            self.markdown.append('\n')
        elif tag == 'ol':
            self.list_type = 'ol'
            self.list_count = 0
            self.markdown.append('\n')
        elif tag == 'li':
            if self.list_type == 'ol':
                self.list_count += 1
                self.markdown.append(f'\n{self.list_count}. ')
            else:
                self.markdown.append('\n- ')
        elif tag == 'blockquote':
            self.markdown.append('\n\n> ')
        elif tag == 'code':
            self.markdown.append('`')
        elif tag == 'pre':
            self.markdown.append('\n\n```\n')

    def handle_endtag(self, tag):
        if tag in self.skip_tags:
            self.skip_depth -= 1
            return

        if self.skip_depth > 0:
            return

        if tag == 'strong' or tag == 'b':
            self.markdown.append('**')
        elif tag == 'em' or tag == 'i':
            self.markdown.append('*')
        elif tag == 'a':
            if self.link_href:
                self.markdown.append(f']({self.link_href})')
            else:
                self.markdown.append(']')
            self.link_href = None
        elif tag == 'p':
            self.in_paragraph = False
        elif tag == 'ul' or tag == 'ol':
            self.list_type = None
            self.markdown.append('\n')
        elif tag == 'code':
            self.markdown.append('`')
        elif tag == 'pre':
            self.markdown.append('\n```\n\n')

        self.current_tag = None

    def handle_data(self, data):
        if self.skip_depth > 0:
            return

        # Clean up whitespace
        text = data.strip()
        if text:
            # Preserve single spaces between inline elements
            if self.markdown and not self.markdown[-1].endswith(('\n', ' ', '[', '**', '*', '`')):
                if data.startswith(' '):
                    self.markdown.append(' ')
            self.markdown.append(text)
            if data.endswith(' ') and not text.endswith((' ', '\n')):
                self.markdown.append(' ')

    def get_markdown(self):
        result = ''.join(self.markdown)
        # Clean up excessive newlines
        result = re.sub(r'\n{3,}', '\n\n', result)
        return result.strip()


def extract_meta(html_content):
    """Extract metadata from HTML"""
    meta = {
        'title': '',
        'description': '',
        'image': '',
        'date': '',
        'category': 'General'
    }

    # Extract title
    title_match = re.search(r'<title>([^<]+)</title>', html_content)
    if title_match:
        meta['title'] = title_match.group(1).strip()
        # Clean up title
        meta['title'] = re.sub(r'\s*\|\s*Surprise Granite.*$', '', meta['title'])
        meta['title'] = re.sub(r'\s*-\s*Surprise Granite.*$', '', meta['title'])

    # Extract description
    desc_match = re.search(r'<meta\s+(?:name="description"|content="[^"]*"\s+name="description")[^>]*content="([^"]*)"', html_content)
    if not desc_match:
        desc_match = re.search(r'<meta\s+content="([^"]*)"[^>]*name="description"', html_content)
    if desc_match:
        meta['description'] = desc_match.group(1).strip()

    # Extract OG image
    img_match = re.search(r'<meta\s+(?:property="og:image"|content="[^"]*"\s+property="og:image")[^>]*content="([^"]*)"', html_content)
    if not img_match:
        img_match = re.search(r'<meta\s+content="([^"]*)"[^>]*property="og:image"', html_content)
    if img_match:
        meta['image'] = img_match.group(1).strip()

    # Extract date from schema.org
    date_match = re.search(r'"datePublished"\s*:\s*"([^"]+)"', html_content)
    if date_match:
        meta['date'] = date_match.group(1).strip()
    else:
        # Default to today if not found
        meta['date'] = datetime.now().strftime('%Y-%m-%d')

    # Try to determine category from content
    content_lower = html_content.lower()
    if 'bathroom' in content_lower and 'kitchen' not in content_lower:
        meta['category'] = 'Bathroom'
    elif 'kitchen' in content_lower:
        meta['category'] = 'Kitchen'
    elif 'countertop' in content_lower or 'granite' in content_lower or 'quartz' in content_lower:
        meta['category'] = 'Countertops'
    else:
        meta['category'] = 'Home Remodeling'

    return meta


def extract_content(html_content):
    """Extract main blog content from HTML"""

    # Try to find the main content area
    # Look for common Webflow blog content patterns
    content_patterns = [
        r'<div[^>]*class="[^"]*rich-text[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</div>',
        r'<div[^>]*class="[^"]*blog-content[^"]*"[^>]*>(.*?)</div>',
        r'<div[^>]*class="[^"]*article-content[^"]*"[^>]*>(.*?)</div>',
        r'<div[^>]*class="[^"]*post-content[^"]*"[^>]*>(.*?)</div>',
        r'<article[^>]*>(.*?)</article>',
    ]

    content = None
    for pattern in content_patterns:
        match = re.search(pattern, html_content, re.DOTALL | re.IGNORECASE)
        if match:
            content = match.group(1)
            break

    if not content:
        # Fallback: try to find content between specific markers
        # Look for the content after the hero/header and before footer
        body_match = re.search(r'<body[^>]*>(.*?)</body>', html_content, re.DOTALL)
        if body_match:
            body = body_match.group(1)
            # Remove nav, header, footer sections
            body = re.sub(r'<nav[^>]*>.*?</nav>', '', body, flags=re.DOTALL | re.IGNORECASE)
            body = re.sub(r'<header[^>]*>.*?</header>', '', body, flags=re.DOTALL | re.IGNORECASE)
            body = re.sub(r'<footer[^>]*>.*?</footer>', '', body, flags=re.DOTALL | re.IGNORECASE)
            content = body

    return content or ''


def html_to_markdown(html_content):
    """Convert HTML to Markdown"""
    parser = HTMLToMarkdown()
    try:
        parser.feed(html_content)
        return parser.get_markdown()
    except Exception as e:
        print(f"  Warning: Parse error - {e}")
        # Fallback: basic cleanup
        text = re.sub(r'<[^>]+>', '', html_content)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


def convert_blog_post(blog_dir):
    """Convert a single blog post"""
    html_file = blog_dir / "index.html"

    if not html_file.exists():
        return None

    # Read HTML
    with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
        html_content = f.read()

    # Extract metadata
    meta = extract_meta(html_content)

    # Extract and convert content
    content_html = extract_content(html_content)
    content_md = html_to_markdown(content_html)

    # Clean up content
    content_md = re.sub(r'\n{3,}', '\n\n', content_md)

    # Remove any remaining HTML artifacts
    content_md = re.sub(r'<[^>]+>', '', content_md)

    # Build frontmatter
    slug = blog_dir.name
    frontmatter = f"""---
title: "{meta['title'].replace('"', '\\"')}"
description: "{meta['description'].replace('"', '\\"')}"
date: "{meta['date']}"
category: "{meta['category']}"
image: "{meta['image']}"
slug: "{slug}"
author: "Surprise Granite"
---

"""

    return frontmatter + content_md


def main():
    """Main conversion function"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    blog_dirs = sorted([d for d in BLOG_DIR.iterdir() if d.is_dir()])

    print(f"Found {len(blog_dirs)} blog posts to convert\n")

    converted = 0
    errors = []

    for blog_dir in blog_dirs:
        slug = blog_dir.name
        print(f"Converting: {slug}")

        try:
            markdown = convert_blog_post(blog_dir)

            if markdown:
                output_file = OUTPUT_DIR / f"{slug}.md"
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(markdown)
                converted += 1
                print(f"  ✓ Saved to {output_file.name}")
            else:
                errors.append((slug, "No content found"))
                print(f"  ✗ No content found")

        except Exception as e:
            errors.append((slug, str(e)))
            print(f"  ✗ Error: {e}")

    print(f"\n{'='*50}")
    print(f"Conversion complete!")
    print(f"  Converted: {converted}/{len(blog_dirs)}")
    if errors:
        print(f"  Errors: {len(errors)}")
        for slug, error in errors:
            print(f"    - {slug}: {error}")


if __name__ == "__main__":
    main()
