#!/usr/bin/env python3
"""
Stone Vendor Image Scraper
Scrapes product images and logos from vendor sites for the marketplace.

Usage:
    python scrape-vendor-images.py --vendor msi --limit 50
    python scrape-vendor-images.py --vendor all --limit 20
    python scrape-vendor-images.py --logos-only

Requirements:
    pip install requests beautifulsoup4 pillow
"""

import os
import sys
import json
import time
import argparse
import hashlib
import requests
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from pathlib import Path

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "images" / "vendor-products"
LOGOS_DIR = Path(__file__).parent.parent / "images" / "vendor-logos"
DATA_DIR = Path(__file__).parent.parent / "data"
DELAY_BETWEEN_REQUESTS = 1.5  # seconds - be respectful

# Headers to mimic browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Vendor configurations
VENDORS = {
    "msi": {
        "name": "MSI Surfaces",
        "base_url": "https://www.msisurfaces.com",
        "product_pages": [
            "/countertops/quartz",
            "/countertops/granite",
            "/countertops/marble",
            "/countertops/quartzite",
        ],
        "logo_url": "https://www.msisurfaces.com/images/msi-logo.svg",
        "image_selector": "img.product-image, img[data-src*='quartz'], img[data-src*='granite'], .product-card img",
        "product_link_selector": "a.product-card, a[href*='/countertops/']",
    },
    "arizona-tile": {
        "name": "Arizona Tile",
        "base_url": "https://www.arizonatile.com",
        "product_pages": [
            "/products/slab/quartz",
            "/products/slab/granite",
            "/products/slab/marble",
        ],
        "logo_url": "https://www.arizonatile.com/images/arizona-tile-logo.png",
        "image_selector": "img.product-image, .product-grid img, .slab-image img",
        "product_link_selector": "a.product-item, a[href*='/products/slab/']",
    },
    "cambria": {
        "name": "Cambria",
        "base_url": "https://www.cambriausa.com",
        "product_pages": [
            "/quartz-countertops/colors/",
        ],
        "logo_url": "https://www.cambriausa.com/images/cambria-logo.svg",
        "image_selector": "img.design-image, .color-swatch img, .product-image img",
        "product_link_selector": "a.design-card, a[href*='/quartz-countertops/']",
    },
    "caesarstone": {
        "name": "Caesarstone",
        "base_url": "https://www.caesarstoneus.com",
        "product_pages": [
            "/quartz-colors/",
        ],
        "logo_url": "https://www.caesarstoneus.com/images/caesarstone-logo.svg",
        "image_selector": "img.color-image, .product-swatch img, .quartz-image",
        "product_link_selector": "a.color-card, a[href*='/quartz-colors/']",
    },
    "silestone": {
        "name": "Silestone by Cosentino",
        "base_url": "https://www.silestoneusa.com",
        "product_pages": [
            "/colors/",
        ],
        "logo_url": "https://www.cosentino.com/images/silestone-logo.svg",
        "image_selector": "img.color-image, .product-image img",
        "product_link_selector": "a.color-item, a[href*='/colors/']",
    },
    "daltile": {
        "name": "Daltile",
        "base_url": "https://www.daltile.com",
        "product_pages": [
            "/products/natural-stone/",
            "/products/quartz/",
        ],
        "logo_url": "https://www.daltile.com/images/daltile-logo.svg",
        "image_selector": "img.product-image, .product-tile img",
        "product_link_selector": "a.product-link, a[href*='/products/']",
    },
}


def setup_directories():
    """Create output directories if they don't exist."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directories ready:")
    print(f"  Products: {OUTPUT_DIR}")
    print(f"  Logos: {LOGOS_DIR}")


def download_image(url, save_path, referer=None):
    """Download an image from URL and save to path."""
    try:
        headers = HEADERS.copy()
        if referer:
            headers["Referer"] = referer

        response = requests.get(url, headers=headers, timeout=30, stream=True)
        response.raise_for_status()

        # Check if it's actually an image
        content_type = response.headers.get("Content-Type", "")
        if "image" not in content_type and not url.endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg')):
            print(f"  Skipping non-image: {url[:60]}...")
            return False

        with open(save_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        print(f"  Downloaded: {save_path.name}")
        return True

    except Exception as e:
        print(f"  Error downloading {url[:50]}...: {e}")
        return False


def get_image_filename(url, vendor_key, index):
    """Generate a unique filename for an image."""
    ext = Path(urlparse(url).path).suffix or ".jpg"
    if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.gif']:
        ext = ".jpg"

    # Create hash of URL for uniqueness
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    return f"{vendor_key}-{index:03d}-{url_hash}{ext}"


def scrape_vendor_products(vendor_key, config, limit=50):
    """Scrape product images from a vendor site."""
    print(f"\n{'='*60}")
    print(f"Scraping {config['name']}...")
    print(f"{'='*60}")

    vendor_dir = OUTPUT_DIR / vendor_key
    vendor_dir.mkdir(exist_ok=True)

    all_images = []
    image_count = 0

    for page_path in config["product_pages"]:
        if image_count >= limit:
            break

        page_url = urljoin(config["base_url"], page_path)
        print(f"\nFetching: {page_url}")

        try:
            response = requests.get(page_url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            # Find all images matching selector
            images = soup.select(config["image_selector"])
            print(f"  Found {len(images)} images on page")

            for img in images:
                if image_count >= limit:
                    break

                # Get image URL from various attributes
                img_url = (
                    img.get("src") or
                    img.get("data-src") or
                    img.get("data-lazy-src") or
                    img.get("srcset", "").split(",")[0].split()[0] if img.get("srcset") else None
                )

                if not img_url:
                    continue

                # Make absolute URL
                img_url = urljoin(page_url, img_url)

                # Skip tiny images (likely icons)
                width = img.get("width", "100")
                height = img.get("height", "100")
                try:
                    if int(width) < 50 or int(height) < 50:
                        continue
                except:
                    pass

                # Skip already downloaded
                if img_url in [i["url"] for i in all_images]:
                    continue

                # Generate filename and download
                filename = get_image_filename(img_url, vendor_key, image_count)
                save_path = vendor_dir / filename

                if download_image(img_url, save_path, referer=page_url):
                    all_images.append({
                        "url": img_url,
                        "local_path": str(save_path.relative_to(Path(__file__).parent.parent)),
                        "vendor": vendor_key,
                        "alt": img.get("alt", ""),
                        "title": img.get("title", ""),
                    })
                    image_count += 1

                time.sleep(DELAY_BETWEEN_REQUESTS)

        except Exception as e:
            print(f"  Error fetching {page_url}: {e}")
            continue

    # Save manifest
    manifest_path = vendor_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump({
            "vendor": config["name"],
            "vendor_key": vendor_key,
            "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "image_count": len(all_images),
            "images": all_images
        }, f, indent=2)

    print(f"\nSaved {len(all_images)} images for {config['name']}")
    return all_images


def scrape_vendor_logo(vendor_key, config):
    """Download vendor logo."""
    print(f"Downloading logo for {config['name']}...")

    logo_url = config.get("logo_url")
    if not logo_url:
        print(f"  No logo URL configured")
        return None

    ext = Path(urlparse(logo_url).path).suffix or ".png"
    filename = f"{vendor_key}-logo{ext}"
    save_path = LOGOS_DIR / filename

    if download_image(logo_url, save_path):
        return str(save_path.relative_to(Path(__file__).parent.parent))
    return None


def scrape_logos_only():
    """Download just the logos for all vendors."""
    print("\nDownloading vendor logos...")
    logos = {}

    for vendor_key, config in VENDORS.items():
        logo_path = scrape_vendor_logo(vendor_key, config)
        if logo_path:
            logos[vendor_key] = {
                "name": config["name"],
                "logo": logo_path
            }
        time.sleep(DELAY_BETWEEN_REQUESTS)

    # Save logos manifest
    logos_manifest = LOGOS_DIR / "logos.json"
    with open(logos_manifest, "w") as f:
        json.dump(logos, f, indent=2)

    print(f"\nSaved {len(logos)} logos to {LOGOS_DIR}")
    return logos


def use_existing_images():
    """Use images already in the codebase instead of scraping."""
    print("\nUsing existing images from codebase...")

    # Load countertops data
    countertops_path = DATA_DIR / "countertops.json"
    if countertops_path.exists():
        with open(countertops_path) as f:
            data = json.load(f)

        products = data.get("countertops", [])
        print(f"Found {len(products)} existing countertop products")

        # Group by brand
        by_brand = {}
        for product in products:
            brand = product.get("brand", "unknown")
            if brand not in by_brand:
                by_brand[brand] = []
            by_brand[brand].append({
                "name": product.get("name"),
                "slug": product.get("slug"),
                "type": product.get("type"),
                "primaryImage": product.get("primaryImage"),
                "secondaryImage": product.get("secondaryImage"),
                "primaryColor": product.get("primaryColor"),
            })

        print("\nProducts by brand:")
        for brand, items in by_brand.items():
            print(f"  {brand}: {len(items)} products")

        # Save for marketplace use
        marketplace_products = DATA_DIR / "marketplace-products.json"
        with open(marketplace_products, "w") as f:
            json.dump({
                "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
                "total": len(products),
                "by_brand": by_brand
            }, f, indent=2)

        print(f"\nSaved marketplace products to {marketplace_products}")
        return by_brand

    else:
        print(f"No countertops.json found at {countertops_path}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Scrape vendor images for marketplace")
    parser.add_argument("--vendor", choices=list(VENDORS.keys()) + ["all"],
                       default="all", help="Vendor to scrape")
    parser.add_argument("--limit", type=int, default=20,
                       help="Max images per vendor")
    parser.add_argument("--logos-only", action="store_true",
                       help="Only download logos")
    parser.add_argument("--use-existing", action="store_true",
                       help="Use existing images from codebase instead of scraping")

    args = parser.parse_args()

    setup_directories()

    if args.use_existing:
        use_existing_images()
        return

    if args.logos_only:
        scrape_logos_only()
        return

    # Scrape products
    all_results = {}

    if args.vendor == "all":
        for vendor_key, config in VENDORS.items():
            results = scrape_vendor_products(vendor_key, config, args.limit)
            all_results[vendor_key] = results
            time.sleep(DELAY_BETWEEN_REQUESTS * 2)  # Extra delay between vendors
    else:
        config = VENDORS[args.vendor]
        results = scrape_vendor_products(args.vendor, config, args.limit)
        all_results[args.vendor] = results

    # Save combined manifest
    combined_manifest = OUTPUT_DIR / "all-products.json"
    with open(combined_manifest, "w") as f:
        json.dump({
            "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "vendors": all_results
        }, f, indent=2)

    print(f"\n{'='*60}")
    print("Scraping complete!")
    print(f"Total images: {sum(len(v) for v in all_results.values())}")
    print(f"Combined manifest: {combined_manifest}")


if __name__ == "__main__":
    main()
