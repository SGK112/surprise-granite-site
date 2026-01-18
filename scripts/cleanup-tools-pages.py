#!/usr/bin/env python3
"""
Clean up leftover Webflow content from tools pages.
Removes everything between mobile-nav closing and main-wrapper opening.
"""

import re
from pathlib import Path

BASE_DIR = Path("/Users/homepc/surprise-granite-site")

TOOLS_PAGES = [
    "virtual-kitchen-design-tool",
    "virtual-bathroom-design-tool",
    "countertop-edge-visualizer",
    "interior-design-gallery",
    "multi-surface-room-visualizer",
]

def cleanup_page(filepath):
    """Remove leftover Webflow content between mobile-nav and main-wrapper."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original_length = len(content)

        # Pattern 1: Remove everything from after mobile-nav's btn-estimate link
        # up to (but not including) <main class="main-wrapper">
        # This covers: extra </div>, navbar-search, cart-popup, scripts, orphaned tags

        # Find the mobile-nav end pattern: the btn-estimate link followed by </div>
        # Then remove everything until <main class="main-wrapper">

        pattern = r'(<a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>\s*</div>)\s*</div>.*?(?=<main class="main-wrapper">)'

        replacement = r'\1\n'

        new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

        # Also handle case where there might be orphaned </script></div></nav></div> right before <main>
        new_content = re.sub(
            r'</script>\s*</div>\s*</nav>\s*</div>\s*<main',
            '<main',
            new_content
        )

        if len(new_content) < original_length:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)

            removed_chars = original_length - len(new_content)
            print(f"  CLEANED: {filepath} (removed {removed_chars:,} chars)")
            return True
        else:
            print(f"  SKIP (no content to remove or pattern not found): {filepath}")
            return False

    except Exception as e:
        print(f"  ERROR: {filepath} - {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    tools_dir = BASE_DIR / "tools"

    cleaned = 0
    skipped = 0
    errors = 0

    print("=== Cleaning Up Tools Pages ===\n")

    for page_name in TOOLS_PAGES:
        page_path = tools_dir / page_name / "index.html"
        if page_path.exists():
            result = cleanup_page(page_path)
            if result:
                cleaned += 1
            else:
                skipped += 1
        else:
            print(f"  NOT FOUND: {page_path}")
            errors += 1

    print(f"\n=== Summary ===")
    print(f"Cleaned: {cleaned}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    main()
