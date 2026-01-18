#!/usr/bin/env python3
"""
Surprise Granite Site Builder

Simple template system for building pages with reusable components.

Usage:
    python3 build.py                    # Build all pages in /pages/
    python3 build.py pages/blog.html    # Build specific page

Template files in /components/:
    - head.html     : Common head elements (meta, CSS, fonts)
    - navbar.html   : Universal navigation
    - footer.html   : Site footer with CTA
    - scripts.html  : JavaScript files

Page files use special markers:
    {{HEAD}}        : Insert head.html contents
    {{NAVBAR}}      : Insert navbar.html contents
    {{FOOTER}}      : Insert footer.html contents
    {{SCRIPTS}}     : Insert scripts.html contents
    {{TITLE}}       : Page title (set in frontmatter)
    {{DESCRIPTION}} : Meta description (set in frontmatter)

Example page file (pages/about.html):
    ---
    title: About Us | Surprise Granite
    description: Learn about Surprise Granite...
    output: about/index.html
    ---
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>{{TITLE}}</title>
      <meta name="description" content="{{DESCRIPTION}}"/>
      {{HEAD}}
    </head>
    <body>
      <div class="page-wrapper">
        {{NAVBAR}}
        <main class="main-wrapper">
          <!-- Your page content here -->
        </main>
        {{FOOTER}}
      </div>
      {{SCRIPTS}}
    </body>
    </html>
"""

import os
import sys
import re
from pathlib import Path

# Configuration
SITE_ROOT = Path(__file__).parent
COMPONENTS_DIR = SITE_ROOT / 'components'
PAGES_DIR = SITE_ROOT / 'pages'

# Component cache
_components = {}

def load_component(name):
    """Load and cache a component file."""
    if name not in _components:
        path = COMPONENTS_DIR / f'{name}.html'
        if path.exists():
            _components[name] = path.read_text(encoding='utf-8')
        else:
            print(f"Warning: Component '{name}' not found at {path}")
            _components[name] = f'<!-- Component {name} not found -->'
    return _components[name]

def parse_frontmatter(content):
    """Extract frontmatter variables from page content."""
    frontmatter = {}

    # Check for frontmatter block
    if content.startswith('---'):
        end = content.find('---', 3)
        if end != -1:
            fm_block = content[3:end].strip()
            content = content[end+3:].strip()

            for line in fm_block.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    frontmatter[key.strip()] = value.strip()

    return frontmatter, content

def build_page(page_path, output_path=None):
    """Build a single page from template."""
    print(f"Building: {page_path}")

    # Read page content
    content = Path(page_path).read_text(encoding='utf-8')

    # Parse frontmatter
    frontmatter, content = parse_frontmatter(content)

    # Replace component placeholders
    replacements = {
        '{{HEAD}}': load_component('head'),
        '{{NAVBAR}}': load_component('navbar'),
        '{{FOOTER}}': load_component('footer'),
        '{{SCRIPTS}}': load_component('scripts'),
        '{{BLOG_POST_STYLES}}': load_component('blog-post'),
        '{{TITLE}}': frontmatter.get('title', 'Surprise Granite'),
        '{{DESCRIPTION}}': frontmatter.get('description', ''),
        '{{CANONICAL}}': frontmatter.get('canonical', ''),
        '{{OG_IMAGE}}': frontmatter.get('og_image', ''),
        '{{CATEGORY}}': frontmatter.get('category', 'Blog'),
        '{{DATE}}': frontmatter.get('date', ''),
        '{{AUTHOR}}': frontmatter.get('author', 'Surprise Granite Team'),
        '{{READ_TIME}}': frontmatter.get('read_time', '5 min read'),
    }

    for placeholder, replacement in replacements.items():
        content = content.replace(placeholder, replacement)

    # Determine output path
    if output_path is None:
        output_path = frontmatter.get('output')
        if output_path:
            output_path = SITE_ROOT / output_path
        else:
            # Default: pages/about.html -> about/index.html
            rel_path = Path(page_path).relative_to(PAGES_DIR)
            output_path = SITE_ROOT / rel_path.stem / 'index.html'

    # Create output directory
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write output
    output_path.write_text(content, encoding='utf-8')
    print(f"  -> {output_path}")

    return output_path

def build_all():
    """Build all pages in the pages directory."""
    if not PAGES_DIR.exists():
        print(f"Creating pages directory: {PAGES_DIR}")
        PAGES_DIR.mkdir(parents=True)
        print("Add your page templates to /pages/ and run again.")
        return

    pages = list(PAGES_DIR.glob('**/*.html'))
    if not pages:
        print(f"No pages found in {PAGES_DIR}")
        return

    print(f"Building {len(pages)} page(s)...\n")

    for page_path in pages:
        try:
            build_page(page_path)
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\nDone! Built {len(pages)} page(s).")

def main():
    if len(sys.argv) > 1:
        # Build specific page(s)
        for page_path in sys.argv[1:]:
            if os.path.exists(page_path):
                build_page(page_path)
            else:
                print(f"File not found: {page_path}")
    else:
        # Build all pages
        build_all()

if __name__ == '__main__':
    main()
