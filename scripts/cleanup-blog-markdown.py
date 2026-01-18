#!/usr/bin/env python3
"""
Clean up converted markdown blog posts - remove form boilerplate
"""

import os
import re
from pathlib import Path

CONTENT_DIR = Path("/Users/homepc/surprise-granite-site/content/blog")

# Patterns to remove from end of posts
BOILERPLATE_PATTERNS = [
    r'Need to talk to an expert\?.*$',
    r'Request a call with one of our home remodeling experts.*$',
    r'Thank you! Your submission has been received!.*$',
    r'Oops! Something went wrong while submitting the form\..*$',
    r'Get a Free Estimate.*$',
    r'Schedule Your Free Consultation.*$',
    r'Ready to Start Your Project\?.*$',
]

def clean_markdown(content):
    """Remove boilerplate from markdown content"""
    # Split frontmatter and content
    parts = content.split('---', 2)
    if len(parts) < 3:
        return content

    frontmatter = parts[1]
    body = parts[2]

    # Remove boilerplate patterns
    for pattern in BOILERPLATE_PATTERNS:
        body = re.sub(pattern, '', body, flags=re.IGNORECASE | re.DOTALL)

    # Clean up excessive whitespace at end
    body = body.rstrip() + '\n'

    # Clean up excessive newlines
    body = re.sub(r'\n{3,}', '\n\n', body)

    return f'---{frontmatter}---{body}'

def main():
    md_files = list(CONTENT_DIR.glob('*.md'))
    print(f"Cleaning {len(md_files)} markdown files...\n")

    for md_file in md_files:
        with open(md_file, 'r', encoding='utf-8') as f:
            content = f.read()

        cleaned = clean_markdown(content)

        if cleaned != content:
            with open(md_file, 'w', encoding='utf-8') as f:
                f.write(cleaned)
            print(f"  Cleaned: {md_file.name}")
        else:
            print(f"  Unchanged: {md_file.name}")

    print("\nDone!")

if __name__ == "__main__":
    main()
