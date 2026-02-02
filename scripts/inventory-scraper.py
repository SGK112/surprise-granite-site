#!/usr/bin/env python3
"""
Surprise Granite - Inventory Scraper
=====================================
Scrapes vendor websites to update stone, tile, and flooring inventory.
Identifies discontinued products and discovers new ones.

Usage:
    python inventory-scraper.py [--vendor VENDOR] [--dry-run] [--output DIR]

Vendors supported:
    - msi (MSI Surfaces)
    - arizona-tile (Arizona Tile)
    - daltile (Daltile)
    - cambria (Cambria)
    - caesarstone (Caesarstone)
    - silestone (Silestone)
    - all (scrape all vendors)
"""

import os
import sys
import json
import time
import logging
import argparse
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, asdict
from urllib.parse import urljoin, urlparse
import re

# Third-party imports (install via: pip install requests beautifulsoup4 lxml)
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Required packages not installed. Run:")
    print("  pip install requests beautifulsoup4 lxml")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('inventory-scraper.log')
    ]
)
logger = logging.getLogger(__name__)

# Constants
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
OUTPUT_DIR = SCRIPT_DIR / 'scraper-output'
USER_AGENT = 'SurpriseGranite-InventoryBot/1.0 (inventory update; contact@surprisegranite.com)'
REQUEST_DELAY = 2  # Seconds between requests to be polite

@dataclass
class Product:
    """Represents a stone/tile/flooring product"""
    id: str
    name: str
    vendor: str
    material_type: str  # quartz, granite, marble, quartzite, tile, lvp, etc.
    color_family: str
    description: str
    image_url: str
    product_url: str
    sku: Optional[str] = None
    price_range: Optional[str] = None
    dimensions: Optional[str] = None
    finish: Optional[str] = None
    thickness: Optional[str] = None
    available: bool = True
    last_updated: str = ""

    def __post_init__(self):
        if not self.last_updated:
            self.last_updated = datetime.now().isoformat()
        if not self.id:
            # Generate ID from name and vendor
            self.id = self.generate_id()

    def generate_id(self) -> str:
        """Generate a unique ID for the product"""
        key = f"{self.vendor}-{self.name}".lower()
        key = re.sub(r'[^a-z0-9]+', '-', key)
        return key.strip('-')


class BaseScraper:
    """Base class for vendor scrapers"""

    vendor_name: str = "unknown"
    base_url: str = ""

    def __init__(self, session: requests.Session):
        self.session = session
        self.products: List[Product] = []

    def fetch_page(self, url: str, retries: int = 3) -> Optional[BeautifulSoup]:
        """Fetch and parse a webpage"""
        for attempt in range(retries):
            try:
                logger.debug(f"Fetching: {url}")
                response = self.session.get(url, timeout=30)
                response.raise_for_status()
                time.sleep(REQUEST_DELAY)
                return BeautifulSoup(response.content, 'lxml')
            except requests.RequestException as e:
                logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}")
                if attempt < retries - 1:
                    time.sleep(5 * (attempt + 1))
        return None

    def scrape(self) -> List[Product]:
        """Override in subclass to implement scraping logic"""
        raise NotImplementedError

    def get_color_family(self, name: str, description: str = "") -> str:
        """Determine color family from product name/description"""
        text = f"{name} {description}".lower()

        color_keywords = {
            'white': ['white', 'bianco', 'blanco', 'snow', 'arctic', 'pearl', 'ivory', 'cream'],
            'black': ['black', 'nero', 'noir', 'onyx', 'obsidian', 'charcoal', 'midnight'],
            'gray': ['gray', 'grey', 'grigio', 'gris', 'ash', 'silver', 'steel', 'slate', 'concrete'],
            'brown': ['brown', 'marrone', 'tan', 'coffee', 'mocha', 'chocolate', 'bronze', 'copper', 'walnut'],
            'beige': ['beige', 'sand', 'taupe', 'khaki', 'camel', 'fawn', 'buff'],
            'gold': ['gold', 'oro', 'amber', 'honey', 'brass', 'champagne'],
            'blue': ['blue', 'blu', 'azul', 'navy', 'sapphire', 'ocean', 'marine', 'cobalt'],
            'green': ['green', 'verde', 'emerald', 'jade', 'forest', 'sage', 'olive', 'moss'],
            'red': ['red', 'rosso', 'rojo', 'burgundy', 'wine', 'cherry', 'crimson', 'rust'],
            'pink': ['pink', 'rosa', 'rose', 'blush', 'coral', 'salmon'],
            'multi': ['multi', 'rainbow', 'mixed', 'exotic', 'veined', 'movement']
        }

        for color, keywords in color_keywords.items():
            if any(kw in text for kw in keywords):
                return color

        return 'other'


class MSIScraper(BaseScraper):
    """Scraper for MSI Surfaces (msisurfaces.com)"""

    vendor_name = "msi-surfaces"
    base_url = "https://www.msisurfaces.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting MSI Surfaces scrape...")

        # MSI product categories
        categories = [
            ('/countertops/quartz', 'quartz'),
            ('/countertops/granite', 'granite'),
            ('/countertops/marble', 'marble'),
            ('/countertops/quartzite', 'quartzite'),
            ('/tile', 'tile'),
            ('/flooring/luxury-vinyl-tile', 'lvp'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"MSI scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        """Scrape a product category"""
        page = 1
        max_pages = 50  # Safety limit

        while page <= max_pages:
            url = f"{self.base_url}{category_path}?page={page}"
            soup = self.fetch_page(url)

            if not soup:
                break

            # Find product cards (adjust selectors based on actual site structure)
            products = soup.select('.product-card, .product-item, [data-product-id]')

            if not products:
                # Try alternative selectors
                products = soup.select('.grid-item, .collection-item, .product-tile')

            if not products:
                logger.debug(f"No products found on page {page}")
                break

            for product in products:
                try:
                    self._parse_product(product, material_type)
                except Exception as e:
                    logger.warning(f"Error parsing product: {e}")

            # Check for next page
            next_btn = soup.select_one('.pagination .next, [rel="next"], .load-more')
            if not next_btn or 'disabled' in next_btn.get('class', []):
                break

            page += 1

    def _parse_product(self, element, material_type: str):
        """Parse a single product element"""
        # Get product name
        name_el = element.select_one('.product-name, .product-title, h3, h4')
        name = name_el.get_text(strip=True) if name_el else None

        if not name:
            return

        # Get product URL
        link = element.select_one('a[href]')
        product_url = urljoin(self.base_url, link['href']) if link else ""

        # Get image
        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('src') or img.get('data-src') or img.get('data-lazy-src', '')
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        # Get description
        desc_el = element.select_one('.product-description, .description, p')
        description = desc_el.get_text(strip=True) if desc_el else ""

        product = Product(
            id="",
            name=name,
            vendor=self.vendor_name,
            material_type=material_type,
            color_family=self.get_color_family(name, description),
            description=description,
            image_url=image_url,
            product_url=product_url,
            available=True
        )

        self.products.append(product)


class ArizonaTileScraper(BaseScraper):
    """Scraper for Arizona Tile"""

    vendor_name = "arizona-tile"
    base_url = "https://www.arizonatile.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Arizona Tile scrape...")

        categories = [
            ('/slab/quartz', 'quartz'),
            ('/slab/granite', 'granite'),
            ('/slab/marble', 'marble'),
            ('/slab/quartzite', 'quartzite'),
            ('/tile/floor-wall', 'tile'),
            ('/tile/porcelain', 'tile'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Arizona Tile scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        """Scrape a product category"""
        url = f"{self.base_url}{category_path}"
        soup = self.fetch_page(url)

        if not soup:
            return

        products = soup.select('.product-item, .product-card, .collection-product')

        for product in products:
            try:
                name_el = product.select_one('.product-name, .name, h3')
                name = name_el.get_text(strip=True) if name_el else None

                if not name:
                    continue

                link = product.select_one('a[href]')
                product_url = urljoin(self.base_url, link['href']) if link else ""

                img = product.select_one('img')
                image_url = ""
                if img:
                    image_url = img.get('src') or img.get('data-src', '')
                    if image_url and not image_url.startswith('http'):
                        image_url = urljoin(self.base_url, image_url)

                prod = Product(
                    id="",
                    name=name,
                    vendor=self.vendor_name,
                    material_type=material_type,
                    color_family=self.get_color_family(name),
                    description="",
                    image_url=image_url,
                    product_url=product_url,
                    available=True
                )

                self.products.append(prod)

            except Exception as e:
                logger.warning(f"Error parsing Arizona Tile product: {e}")


class DaltileScraper(BaseScraper):
    """Scraper for Daltile"""

    vendor_name = "daltile"
    base_url = "https://www.daltile.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Daltile scrape...")

        # Daltile has different structure - uses API
        categories = [
            ('/products/one-quartz-surfaces', 'quartz'),
            ('/products/panoramic-porcelain', 'porcelain'),
            ('/products/floor-tile', 'tile'),
            ('/products/wall-tile', 'tile'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Daltile scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        """Scrape a product category"""
        url = f"{self.base_url}{category_path}"
        soup = self.fetch_page(url)

        if not soup:
            return

        products = soup.select('.product-tile, .product-card, [data-product]')

        for product in products:
            try:
                name_el = product.select_one('.product-name, .tile-name, h3, h4')
                name = name_el.get_text(strip=True) if name_el else None

                if not name:
                    continue

                link = product.select_one('a[href]')
                product_url = urljoin(self.base_url, link['href']) if link else ""

                img = product.select_one('img')
                image_url = ""
                if img:
                    image_url = img.get('src') or img.get('data-src', '')
                    if image_url and not image_url.startswith('http'):
                        image_url = urljoin(self.base_url, image_url)

                prod = Product(
                    id="",
                    name=name,
                    vendor=self.vendor_name,
                    material_type=material_type,
                    color_family=self.get_color_family(name),
                    description="",
                    image_url=image_url,
                    product_url=product_url,
                    available=True
                )

                self.products.append(prod)

            except Exception as e:
                logger.warning(f"Error parsing Daltile product: {e}")


class CambriaScraper(BaseScraper):
    """Scraper for Cambria (American-made quartz)"""

    vendor_name = "cambria"
    base_url = "https://www.cambriausa.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Cambria scrape...")

        # Cambria only makes quartz
        url = f"{self.base_url}/quartz-colors/"
        soup = self.fetch_page(url)

        if not soup:
            logger.warning("Failed to fetch Cambria page")
            return self.products

        # Cambria uses a design grid
        products = soup.select('.design-card, .color-card, .product-item, [data-design]')

        for product in products:
            try:
                name_el = product.select_one('.design-name, .color-name, h3, h4, .title')
                name = name_el.get_text(strip=True) if name_el else None

                if not name:
                    continue

                link = product.select_one('a[href]')
                product_url = urljoin(self.base_url, link['href']) if link else ""

                img = product.select_one('img')
                image_url = ""
                if img:
                    image_url = img.get('src') or img.get('data-src', '')
                    if image_url and not image_url.startswith('http'):
                        image_url = urljoin(self.base_url, image_url)

                # Get collection/series if available
                collection_el = product.select_one('.collection, .series')
                collection = collection_el.get_text(strip=True) if collection_el else ""

                prod = Product(
                    id="",
                    name=name,
                    vendor=self.vendor_name,
                    material_type="quartz",
                    color_family=self.get_color_family(name),
                    description=f"Cambria Quartz - {collection}" if collection else "Cambria Quartz",
                    image_url=image_url,
                    product_url=product_url,
                    available=True
                )

                self.products.append(prod)

            except Exception as e:
                logger.warning(f"Error parsing Cambria product: {e}")

        logger.info(f"Cambria scrape complete: {len(self.products)} products found")
        return self.products


class CaesarstoneScraper(BaseScraper):
    """Scraper for Caesarstone"""

    vendor_name = "caesarstone"
    base_url = "https://www.caesarstone.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Caesarstone scrape...")

        url = f"{self.base_url}/us/quartz-colors/"
        soup = self.fetch_page(url)

        if not soup:
            return self.products

        products = soup.select('.color-card, .product-card, .quartz-color, [data-color]')

        for product in products:
            try:
                name_el = product.select_one('.color-name, .product-name, h3, h4')
                name = name_el.get_text(strip=True) if name_el else None

                if not name:
                    continue

                link = product.select_one('a[href]')
                product_url = urljoin(self.base_url, link['href']) if link else ""

                img = product.select_one('img')
                image_url = ""
                if img:
                    image_url = img.get('src') or img.get('data-src', '')
                    if image_url and not image_url.startswith('http'):
                        image_url = urljoin(self.base_url, image_url)

                # Get SKU/color code
                sku_el = product.select_one('.color-code, .sku')
                sku = sku_el.get_text(strip=True) if sku_el else None

                prod = Product(
                    id="",
                    name=name,
                    vendor=self.vendor_name,
                    material_type="quartz",
                    color_family=self.get_color_family(name),
                    description="Caesarstone Quartz",
                    image_url=image_url,
                    product_url=product_url,
                    sku=sku,
                    available=True
                )

                self.products.append(prod)

            except Exception as e:
                logger.warning(f"Error parsing Caesarstone product: {e}")

        logger.info(f"Caesarstone scrape complete: {len(self.products)} products found")
        return self.products


class SilestoneScaper(BaseScraper):
    """Scraper for Silestone (Cosentino)"""

    vendor_name = "silestone"
    base_url = "https://www.cosentino.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Silestone scrape...")

        url = f"{self.base_url}/usa/silestone/colours/"
        soup = self.fetch_page(url)

        if not soup:
            return self.products

        products = soup.select('.colour-card, .product-card, .color-item, [data-colour]')

        for product in products:
            try:
                name_el = product.select_one('.colour-name, .product-name, h3, h4')
                name = name_el.get_text(strip=True) if name_el else None

                if not name:
                    continue

                link = product.select_one('a[href]')
                product_url = urljoin(self.base_url, link['href']) if link else ""

                img = product.select_one('img')
                image_url = ""
                if img:
                    image_url = img.get('src') or img.get('data-src', '')
                    if image_url and not image_url.startswith('http'):
                        image_url = urljoin(self.base_url, image_url)

                prod = Product(
                    id="",
                    name=name,
                    vendor=self.vendor_name,
                    material_type="quartz",
                    color_family=self.get_color_family(name),
                    description="Silestone Quartz by Cosentino",
                    image_url=image_url,
                    product_url=product_url,
                    available=True
                )

                self.products.append(prod)

            except Exception as e:
                logger.warning(f"Error parsing Silestone product: {e}")

        logger.info(f"Silestone scrape complete: {len(self.products)} products found")
        return self.products


class InventoryManager:
    """Manages inventory comparison and updates"""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.existing_products: Dict[str, Product] = {}
        self.load_existing_inventory()

    def load_existing_inventory(self):
        """Load existing inventory from JSON files"""
        inventory_files = [
            'countertops.json',
            'site-search.json',
            'slabs.json',
            'flooring.json',
        ]

        for filename in inventory_files:
            filepath = self.data_dir / filename
            if filepath.exists():
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        items = data.get('items', data) if isinstance(data, dict) else data

                        for item in items:
                            if isinstance(item, dict):
                                # Create a key from vendor + name
                                vendor = item.get('brand', item.get('vendor', 'unknown'))
                                name = item.get('title', item.get('name', ''))
                                key = f"{vendor}-{name}".lower()
                                key = re.sub(r'[^a-z0-9]+', '-', key).strip('-')

                                self.existing_products[key] = item

                except Exception as e:
                    logger.warning(f"Error loading {filename}: {e}")

        logger.info(f"Loaded {len(self.existing_products)} existing products")

    def compare_inventory(self, scraped_products: List[Product]) -> Dict:
        """Compare scraped products with existing inventory"""
        scraped_keys = set()
        new_products = []
        updated_products = []

        for product in scraped_products:
            key = product.id or product.generate_id()
            scraped_keys.add(key)

            if key not in self.existing_products:
                new_products.append(product)
            else:
                # Check if product info has changed
                existing = self.existing_products[key]
                if self._has_changes(existing, product):
                    updated_products.append(product)

        # Find discontinued products (in existing but not in scraped)
        existing_keys = set(self.existing_products.keys())
        discontinued_keys = existing_keys - scraped_keys

        # Filter discontinued to only include products from scraped vendors
        scraped_vendors = set(p.vendor for p in scraped_products)
        discontinued_products = []
        for key in discontinued_keys:
            existing = self.existing_products.get(key, {})
            vendor = existing.get('brand', existing.get('vendor', ''))
            if vendor in scraped_vendors:
                discontinued_products.append(existing)

        return {
            'new': new_products,
            'updated': updated_products,
            'discontinued': discontinued_products,
            'total_scraped': len(scraped_products),
            'total_existing': len(self.existing_products)
        }

    def _has_changes(self, existing: Dict, scraped: Product) -> bool:
        """Check if product information has changed"""
        # Compare key fields
        if existing.get('image') != scraped.image_url:
            return True
        if existing.get('url') != scraped.product_url:
            return True
        return False

    def generate_report(self, comparison: Dict, output_dir: Path) -> str:
        """Generate a detailed comparison report"""
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = output_dir / f'inventory_report_{timestamp}.md'

        with open(report_path, 'w') as f:
            f.write("# Inventory Scrape Report\n\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"**Total Scraped:** {comparison['total_scraped']}\n")
            f.write(f"**Existing Products:** {comparison['total_existing']}\n\n")

            # New Products
            f.write(f"## New Products ({len(comparison['new'])})\n\n")
            if comparison['new']:
                f.write("| Vendor | Name | Material | Color |\n")
                f.write("|--------|------|----------|-------|\n")
                for p in comparison['new'][:100]:  # Limit to first 100
                    f.write(f"| {p.vendor} | {p.name} | {p.material_type} | {p.color_family} |\n")
                if len(comparison['new']) > 100:
                    f.write(f"\n*...and {len(comparison['new']) - 100} more*\n")
            else:
                f.write("No new products found.\n")

            # Updated Products
            f.write(f"\n## Updated Products ({len(comparison['updated'])})\n\n")
            if comparison['updated']:
                f.write("| Vendor | Name | Material |\n")
                f.write("|--------|------|----------|\n")
                for p in comparison['updated'][:50]:
                    f.write(f"| {p.vendor} | {p.name} | {p.material_type} |\n")
            else:
                f.write("No product updates detected.\n")

            # Discontinued Products
            f.write(f"\n## Potentially Discontinued ({len(comparison['discontinued'])})\n\n")
            if comparison['discontinued']:
                f.write("These products were not found in the latest scrape:\n\n")
                f.write("| Vendor | Name |\n")
                f.write("|--------|------|\n")
                for p in comparison['discontinued'][:50]:
                    name = p.get('title', p.get('name', 'Unknown'))
                    vendor = p.get('brand', p.get('vendor', 'Unknown'))
                    f.write(f"| {vendor} | {name} |\n")
            else:
                f.write("No discontinued products detected.\n")

        logger.info(f"Report saved to: {report_path}")
        return str(report_path)

    def export_products(self, products: List[Product], output_dir: Path, filename: str):
        """Export products to JSON file"""
        output_dir.mkdir(parents=True, exist_ok=True)

        filepath = output_dir / filename

        data = {
            'generated': datetime.now().isoformat(),
            'count': len(products),
            'items': [asdict(p) for p in products]
        }

        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Exported {len(products)} products to: {filepath}")


def create_session() -> requests.Session:
    """Create a requests session with proper headers"""
    session = requests.Session()
    session.headers.update({
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    })
    return session


def main():
    parser = argparse.ArgumentParser(description='Scrape vendor websites for inventory updates')
    parser.add_argument('--vendor', '-v', default='all',
                        help='Vendor to scrape (msi, arizona-tile, daltile, cambria, caesarstone, silestone, all)')
    parser.add_argument('--dry-run', '-d', action='store_true',
                        help='Run without saving changes')
    parser.add_argument('--output', '-o', default=str(OUTPUT_DIR),
                        help='Output directory for results')

    args = parser.parse_args()

    # Available scrapers
    scrapers = {
        'msi': MSIScraper,
        'arizona-tile': ArizonaTileScraper,
        'daltile': DaltileScraper,
        'cambria': CambriaScraper,
        'caesarstone': CaesarstoneScraper,
        'silestone': SilestoneScaper,
    }

    # Determine which scrapers to run
    if args.vendor == 'all':
        scraper_classes = list(scrapers.values())
    elif args.vendor in scrapers:
        scraper_classes = [scrapers[args.vendor]]
    else:
        logger.error(f"Unknown vendor: {args.vendor}")
        logger.info(f"Available vendors: {', '.join(scrapers.keys())}")
        sys.exit(1)

    # Create session and run scrapers
    session = create_session()
    all_products: List[Product] = []

    for scraper_class in scraper_classes:
        try:
            scraper = scraper_class(session)
            products = scraper.scrape()
            all_products.extend(products)
        except Exception as e:
            logger.error(f"Error running {scraper_class.vendor_name} scraper: {e}")

    if not all_products:
        logger.warning("No products were scraped. Check the scraper selectors.")
        logger.info("Vendor websites may have changed their HTML structure.")
        return

    logger.info(f"Total products scraped: {len(all_products)}")

    # Compare with existing inventory
    output_dir = Path(args.output)
    manager = InventoryManager(DATA_DIR)
    comparison = manager.compare_inventory(all_products)

    # Generate report
    report_path = manager.generate_report(comparison, output_dir)

    # Export scraped products
    if not args.dry_run:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        manager.export_products(all_products, output_dir, f'scraped_products_{timestamp}.json')

        # Export new products separately
        if comparison['new']:
            manager.export_products(comparison['new'], output_dir, f'new_products_{timestamp}.json')

    # Print summary
    print("\n" + "="*60)
    print("INVENTORY SCRAPE SUMMARY")
    print("="*60)
    print(f"Total Scraped:        {comparison['total_scraped']}")
    print(f"Existing Products:    {comparison['total_existing']}")
    print(f"New Products:         {len(comparison['new'])}")
    print(f"Updated Products:     {len(comparison['updated'])}")
    print(f"Discontinued:         {len(comparison['discontinued'])}")
    print(f"\nReport saved to: {report_path}")
    print("="*60)


if __name__ == '__main__':
    main()
