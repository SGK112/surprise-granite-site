#!/usr/bin/env python3
"""
Surprise Granite - Vendor API Scraper
======================================
Uses vendor APIs and Selenium for JavaScript-heavy sites to get accurate inventory.

This script handles vendors that:
1. Have public JSON APIs
2. Use JavaScript to render products
3. Require pagination handling

Usage:
    python vendor-api-scraper.py --vendor msi --output ./scraper-output
    python vendor-api-scraper.py --all --headless
"""

import os
import sys
import json
import time
import logging
import argparse
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict, field
from urllib.parse import urljoin, urlencode
import hashlib

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Install dependencies: pip install requests beautifulsoup4 lxml")
    sys.exit(1)

# Optional Selenium for JS sites
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("Note: Selenium not available. Some scrapers may not work.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
OUTPUT_DIR = SCRIPT_DIR / 'scraper-output'

@dataclass
class ScrapedProduct:
    """Product data from scraping"""
    name: str
    vendor: str
    material_type: str
    color_family: str = ""
    description: str = ""
    image_url: str = ""
    product_url: str = ""
    sku: str = ""
    collection: str = ""
    finish: str = ""
    thickness: str = ""
    price_tier: str = ""  # budget, mid, premium
    available: bool = True
    scraped_at: str = field(default_factory=lambda: datetime.now().isoformat())

    @property
    def id(self) -> str:
        key = f"{self.vendor}-{self.name}".lower()
        return re.sub(r'[^a-z0-9]+', '-', key).strip('-')


class MSIAPIClient:
    """
    MSI Surfaces API Client
    MSI has a product API that we can query
    """

    BASE_URL = "https://www.msisurfaces.com"
    API_URL = "https://www.msisurfaces.com/api"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Accept': 'application/json',
        })

    def get_products(self, category: str, page: int = 1, per_page: int = 100) -> List[dict]:
        """Fetch products from MSI API"""
        # MSI uses Algolia for search - try to access their product data
        products = []

        # Try the standard product listing pages
        urls = {
            'quartz': f"{self.BASE_URL}/quartz-countertops/",
            'granite': f"{self.BASE_URL}/granite-countertops/",
            'marble': f"{self.BASE_URL}/marble-countertops/",
            'quartzite': f"{self.BASE_URL}/natural-stone-quartzite-countertops/",
            'tile': f"{self.BASE_URL}/porcelain-and-ceramic/",
            'lvp': f"{self.BASE_URL}/luxury-vinyl-flooring/",
        }

        if category not in urls:
            return products

        try:
            response = self.session.get(urls[category], timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'lxml')

            # Look for JSON-LD structured data
            scripts = soup.find_all('script', type='application/ld+json')
            for script in scripts:
                try:
                    data = json.loads(script.string)
                    if isinstance(data, list):
                        for item in data:
                            if item.get('@type') == 'Product':
                                products.append(item)
                    elif data.get('@type') == 'Product':
                        products.append(data)
                except:
                    pass

            # Also scrape visible product cards
            cards = soup.select('.product-card, .product-tile, .color-card, [data-product-id]')
            for card in cards:
                try:
                    name = card.select_one('.product-name, .title, h3, h4')
                    if name:
                        products.append({
                            'name': name.get_text(strip=True),
                            'category': category
                        })
                except:
                    pass

        except Exception as e:
            logger.error(f"Error fetching MSI {category}: {e}")

        return products

    def scrape_all(self) -> List[ScrapedProduct]:
        """Scrape all MSI products"""
        all_products = []
        categories = ['quartz', 'granite', 'marble', 'quartzite', 'tile', 'lvp']

        for category in categories:
            logger.info(f"Scraping MSI {category}...")
            products = self.get_products(category)

            for p in products:
                name = p.get('name', '')
                if not name:
                    continue

                product = ScrapedProduct(
                    name=name,
                    vendor='msi-surfaces',
                    material_type=category,
                    color_family=self._get_color_family(name),
                    image_url=p.get('image', ''),
                    product_url=p.get('url', ''),
                    sku=p.get('sku', ''),
                )
                all_products.append(product)

            time.sleep(2)  # Be nice to the server

        return all_products

    def _get_color_family(self, name: str) -> str:
        """Determine color family from name"""
        name_lower = name.lower()
        colors = {
            'white': ['white', 'bianco', 'calacatta', 'carrara', 'snow', 'pearl'],
            'gray': ['gray', 'grey', 'grigio', 'concrete', 'steel', 'ash'],
            'black': ['black', 'nero', 'noir', 'midnight', 'obsidian'],
            'brown': ['brown', 'tan', 'coffee', 'mocha', 'chocolate', 'walnut'],
            'beige': ['beige', 'cream', 'sand', 'taupe'],
            'gold': ['gold', 'amber', 'honey'],
            'blue': ['blue', 'azul', 'navy', 'ocean'],
            'green': ['green', 'verde', 'emerald'],
        }
        for color, keywords in colors.items():
            if any(kw in name_lower for kw in keywords):
                return color
        return 'other'


class SeleniumScraper:
    """
    Selenium-based scraper for JavaScript-heavy sites
    """

    def __init__(self, headless: bool = True):
        if not SELENIUM_AVAILABLE:
            raise RuntimeError("Selenium not installed")

        options = Options()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        self.wait = WebDriverWait(self.driver, 20)

    def __del__(self):
        if hasattr(self, 'driver'):
            self.driver.quit()

    def scrape_cambria(self) -> List[ScrapedProduct]:
        """Scrape Cambria quartz designs"""
        products = []
        logger.info("Scraping Cambria with Selenium...")

        try:
            self.driver.get("https://www.cambriausa.com/quartz-countertops/quartz-colors")
            time.sleep(3)

            # Wait for products to load
            self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.design-card, .color-card, .product-item')))

            # Scroll to load all products (lazy loading)
            last_height = self.driver.execute_script("return document.body.scrollHeight")
            while True:
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
                new_height = self.driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height

            # Parse products
            soup = BeautifulSoup(self.driver.page_source, 'lxml')
            cards = soup.select('.design-card, .color-card, .product-item, [data-design-name]')

            for card in cards:
                try:
                    name_el = card.select_one('.design-name, .color-name, h3, h4, .title')
                    if not name_el:
                        continue

                    name = name_el.get_text(strip=True)
                    if not name:
                        continue

                    link = card.select_one('a[href]')
                    url = link['href'] if link else ""
                    if url and not url.startswith('http'):
                        url = f"https://www.cambriausa.com{url}"

                    img = card.select_one('img')
                    img_url = img.get('src', img.get('data-src', '')) if img else ""

                    product = ScrapedProduct(
                        name=name,
                        vendor='cambria',
                        material_type='quartz',
                        color_family=self._get_color_family(name),
                        image_url=img_url,
                        product_url=url,
                        description="Cambria American-Made Quartz"
                    )
                    products.append(product)

                except Exception as e:
                    logger.debug(f"Error parsing Cambria card: {e}")

        except Exception as e:
            logger.error(f"Error scraping Cambria: {e}")

        logger.info(f"Found {len(products)} Cambria products")
        return products

    def scrape_caesarstone(self) -> List[ScrapedProduct]:
        """Scrape Caesarstone quartz colors"""
        products = []
        logger.info("Scraping Caesarstone with Selenium...")

        try:
            self.driver.get("https://www.caesarstoneus.com/countertops/")
            time.sleep(3)

            self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.color-card, .product-card, a[href*="/countertops/"]')))

            # Scroll for lazy loading
            for _ in range(5):
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1)

            soup = BeautifulSoup(self.driver.page_source, 'lxml')
            cards = soup.select('.color-card, .product-card, [data-color-id]')

            for card in cards:
                try:
                    name_el = card.select_one('.color-name, .product-name, h3')
                    if not name_el:
                        continue

                    name = name_el.get_text(strip=True)
                    if not name:
                        continue

                    sku_el = card.select_one('.color-code, .sku, .number')
                    sku = sku_el.get_text(strip=True) if sku_el else ""

                    link = card.select_one('a[href]')
                    url = link['href'] if link else ""
                    if url and not url.startswith('http'):
                        url = f"https://www.caesarstone.com{url}"

                    img = card.select_one('img')
                    img_url = img.get('src', img.get('data-src', '')) if img else ""

                    product = ScrapedProduct(
                        name=name,
                        vendor='caesarstone',
                        material_type='quartz',
                        color_family=self._get_color_family(name),
                        image_url=img_url,
                        product_url=url,
                        sku=sku,
                        description="Caesarstone Quartz"
                    )
                    products.append(product)

                except Exception as e:
                    logger.debug(f"Error parsing Caesarstone card: {e}")

        except Exception as e:
            logger.error(f"Error scraping Caesarstone: {e}")

        logger.info(f"Found {len(products)} Caesarstone products")
        return products

    def _get_color_family(self, name: str) -> str:
        """Determine color family from name"""
        name_lower = name.lower()
        colors = {
            'white': ['white', 'bianco', 'calacatta', 'carrara', 'snow', 'pearl', 'pure'],
            'gray': ['gray', 'grey', 'concrete', 'steel', 'ash', 'urban'],
            'black': ['black', 'nero', 'noir', 'midnight', 'raven'],
            'brown': ['brown', 'tan', 'coffee', 'mocha', 'chocolate', 'walnut', 'woodlands'],
            'beige': ['beige', 'cream', 'sand', 'taupe', 'buttermilk'],
        }
        for color, keywords in colors.items():
            if any(kw in name_lower for kw in keywords):
                return color
        return 'other'


class InventoryUpdater:
    """Updates the existing inventory files with scraped data"""

    def __init__(self, data_dir: Path, output_dir: Path):
        self.data_dir = data_dir
        self.output_dir = output_dir
        output_dir.mkdir(parents=True, exist_ok=True)

    def load_existing(self, filename: str) -> Dict:
        """Load existing inventory file"""
        filepath = self.data_dir / filename
        if filepath.exists():
            with open(filepath) as f:
                return json.load(f)
        return {'items': []}

    def save_results(self, products: List[ScrapedProduct], vendor: str):
        """Save scraped products to output"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'{vendor}_products_{timestamp}.json'
        filepath = self.output_dir / filename

        data = {
            'vendor': vendor,
            'scraped_at': datetime.now().isoformat(),
            'count': len(products),
            'products': [asdict(p) for p in products]
        }

        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Saved {len(products)} products to {filepath}")
        return filepath

    def generate_comparison_report(self, scraped: List[ScrapedProduct], vendor: str) -> str:
        """Generate report comparing scraped vs existing"""
        existing_data = self.load_existing('site-search.json')
        existing_items = existing_data.get('items', [])

        # Get existing products for this vendor
        existing_vendor = [
            item for item in existing_items
            if item.get('brand', '').lower() == vendor.lower()
            or item.get('vendor', '').lower() == vendor.lower()
        ]

        existing_names = {item.get('title', '').lower() for item in existing_vendor}
        scraped_names = {p.name.lower() for p in scraped}

        new_products = [p for p in scraped if p.name.lower() not in existing_names]
        discontinued = [item for item in existing_vendor if item.get('title', '').lower() not in scraped_names]

        # Generate report
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = self.output_dir / f'{vendor}_report_{timestamp}.md'

        with open(report_path, 'w') as f:
            f.write(f"# {vendor.upper()} Inventory Report\n\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"## Summary\n\n")
            f.write(f"- **Scraped Products:** {len(scraped)}\n")
            f.write(f"- **Existing Products:** {len(existing_vendor)}\n")
            f.write(f"- **New Products:** {len(new_products)}\n")
            f.write(f"- **Potentially Discontinued:** {len(discontinued)}\n\n")

            if new_products:
                f.write(f"## New Products ({len(new_products)})\n\n")
                for p in new_products[:50]:
                    f.write(f"- **{p.name}** ({p.material_type}, {p.color_family})\n")
                if len(new_products) > 50:
                    f.write(f"\n*...and {len(new_products) - 50} more*\n")

            if discontinued:
                f.write(f"\n## Potentially Discontinued ({len(discontinued)})\n\n")
                f.write("*These products exist in our inventory but were not found in the latest scrape:*\n\n")
                for item in discontinued[:50]:
                    f.write(f"- {item.get('title', 'Unknown')}\n")

        logger.info(f"Report saved to {report_path}")
        return str(report_path)


def main():
    parser = argparse.ArgumentParser(description='Scrape vendor inventories')
    parser.add_argument('--vendor', '-v', default='all',
                        choices=['msi', 'cambria', 'caesarstone', 'all'],
                        help='Vendor to scrape')
    parser.add_argument('--headless', action='store_true', default=True,
                        help='Run browser in headless mode')
    parser.add_argument('--output', '-o', default=str(OUTPUT_DIR),
                        help='Output directory')

    args = parser.parse_args()
    output_dir = Path(args.output)
    updater = InventoryUpdater(DATA_DIR, output_dir)

    all_products: List[ScrapedProduct] = []

    # MSI (API-based)
    if args.vendor in ['msi', 'all']:
        try:
            client = MSIAPIClient()
            products = client.scrape_all()
            all_products.extend(products)
            if products:
                updater.save_results(products, 'msi')
                updater.generate_comparison_report(products, 'msi-surfaces')
        except Exception as e:
            logger.error(f"MSI scrape failed: {e}")

    # Selenium-based scrapers
    if args.vendor in ['cambria', 'caesarstone', 'all'] and SELENIUM_AVAILABLE:
        try:
            scraper = SeleniumScraper(headless=args.headless)

            if args.vendor in ['cambria', 'all']:
                products = scraper.scrape_cambria()
                all_products.extend(products)
                if products:
                    updater.save_results(products, 'cambria')
                    updater.generate_comparison_report(products, 'cambria')

            if args.vendor in ['caesarstone', 'all']:
                products = scraper.scrape_caesarstone()
                all_products.extend(products)
                if products:
                    updater.save_results(products, 'caesarstone')
                    updater.generate_comparison_report(products, 'caesarstone')

        except Exception as e:
            logger.error(f"Selenium scrape failed: {e}")

    # Summary
    print("\n" + "="*60)
    print("SCRAPE COMPLETE")
    print("="*60)
    print(f"Total products scraped: {len(all_products)}")
    print(f"Output directory: {output_dir}")
    print("="*60)

    # Group by vendor
    by_vendor = {}
    for p in all_products:
        by_vendor.setdefault(p.vendor, []).append(p)

    for vendor, products in by_vendor.items():
        print(f"  {vendor}: {len(products)} products")


if __name__ == '__main__':
    main()
