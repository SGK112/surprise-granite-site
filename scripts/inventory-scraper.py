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
    - bolder-image (Bolder Image Stone)
    - aracruz (Aracruz RE)
    - sun-stone (Sun Stone Supply)
    - classic-surfaces (Classic Surfaces)
    - stone-collection (The Stone Collection)
    - pentalquartz (PentalQuartz / ARC Surfaces)
    - hanstone (HanStone Quartz)
    - lx-hausys (LX Hausys Viatera)
    - vicostone (Vicostone)
    - polarstone (Polarstone)
    - radianz (Radianz Quartz)
    - dekton (Dekton by Cosentino)
    - sensa (Sensa by Cosentino)
    - neolith (Neolith)
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

        # MSI product categories - Updated URLs for 2026
        categories = [
            ('/quartz-countertops/', 'quartz'),
            ('/granite-countertops/', 'granite'),
            ('/marble/', 'marble'),
            ('/quartzite/', 'quartzite'),
            ('/porcelain-tile/', 'tile'),
            ('/ceramic-tile/', 'tile'),
            ('/luxury-vinyl-tile/', 'lvp'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"MSI scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        """Scrape a product category"""
        # MSI has collection pages that list all colors
        collection_paths = {
            '/quartz-countertops/': '/quartz-countertops/quartz-collections/',
            '/granite-countertops/': '/granite-countertops/granite-colors/',
            '/marble/': '/marble/marble-colors/',
            '/quartzite/': '/quartzite/quartzite-colors/',
            '/porcelain-tile/': '/porcelain-tile/',
            '/ceramic-tile/': '/ceramic-tile/',
            '/luxury-vinyl-tile/': '/luxury-vinyl-tile/lvt-colors/',
        }

        # Use collection page if available
        url = self.base_url + collection_paths.get(category_path, category_path)
        soup = self.fetch_page(url)

        if not soup:
            # Try the original path
            soup = self.fetch_page(self.base_url + category_path)
            if not soup:
                return

        # MSI uses 'productid' class for product links
        products = soup.select('a.productid[href]')

        if not products:
            # Try alternative selectors
            products = soup.select('.colors-container a[href], .product-title, .color-card a[href]')

        if not products:
            # Try generic product selectors
            products = soup.select('.product-card a[href], .product-item a[href], .grid-item a[href]')

        logger.info(f"Found {len(products)} products in {category_path}")

        for product in products:
            try:
                self._parse_msi_product(product, material_type, soup)
            except Exception as e:
                logger.warning(f"Error parsing product: {e}")

    def _parse_msi_product(self, link_element, material_type: str, soup):
        """Parse MSI product from link element"""
        # Get product URL
        href = link_element.get('href', '')
        if not href:
            return
        product_url = urljoin(self.base_url, href)

        # Get product name from aria-label or link text
        name = link_element.get('aria-label', '').replace(' product page', '').strip()
        if not name:
            name = link_element.get_text(strip=True)

        if not name or len(name) < 2:
            return

        # Skip navigation links
        skip_words = ['home', 'colors', 'gallery', 'contact', 'video', 'warranty', 'care', 'resources', 'explore', 'discover', 'view all']
        if any(word in name.lower() for word in skip_words):
            return

        # Find the associated image - look for img inside or next to the link
        image_url = ""
        img = link_element.select_one('img')
        if not img:
            # Try to find img sibling
            parent = link_element.parent
            if parent:
                img = parent.select_one('img')

        if img:
            # MSI uses data-src for lazy loading
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)
            # Skip placeholder/icon images
            if 'logo' in image_url.lower() or 'icon' in image_url.lower() or 'svg' in image_url.lower():
                image_url = ""

        product = Product(
            id="",
            name=name,
            vendor=self.vendor_name,
            material_type=material_type,
            color_family=self.get_color_family(name),
            description=f"MSI {material_type.title()}",
            image_url=image_url,
            product_url=product_url,
            available=True
        )

        self.products.append(product)

    def _parse_product(self, element, material_type: str):
        """Parse a single product element"""
        # Get product name - try multiple selectors
        name_el = element.select_one('.product-title, .product-title-inner, .product-name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None

        # If element is a link, try getting text from it
        if not name and element.name == 'a':
            name = element.get_text(strip=True)
            # Also check for title attribute
            if not name:
                name = element.get('title', '')

        if not name or len(name) < 2:
            return

        # Skip navigation links
        skip_words = ['home', 'colors', 'gallery', 'contact', 'video', 'warranty', 'care', 'resources', 'explore', 'discover']
        if any(word in name.lower() for word in skip_words):
            return

        # Get product URL
        if element.name == 'a':
            product_url = urljoin(self.base_url, element.get('href', ''))
        else:
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

        # Arizona Tile URL structure: /products/slab/[material-type]/
        categories = [
            ('/products/slab/della-terra-quartz/', 'quartz'),
            ('/products/slab/granite-slab/', 'granite'),
            ('/products/slab/marble-slab/', 'marble'),
            ('/products/slab/quartzite/', 'quartzite'),
            ('/products/slab/limestone-slab/', 'limestone'),
            ('/products/slab/onyx/', 'onyx'),
            ('/products/slab/travertine/', 'travertine'),
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
            logger.warning(f"Failed to fetch Arizona Tile category: {category_path}")
            return

        # Arizona Tile uses various card structures - try multiple selectors
        products = soup.select('.product-item, .product-card, .collection-product, .slab-card, .tile-card')

        if not products:
            # Try finding links in a product grid
            products = soup.select('.product-grid a[href*="/products/"], .products-list a[href*="/products/"]')

        if not products:
            # Try generic card selectors
            products = soup.select('[class*="product"] a[href], [class*="card"] a[href*="slab"], [class*="card"] a[href*="tile"]')

        logger.info(f"Found {len(products)} products in {category_path}")

        for product in products:
            try:
                self._parse_arizona_product(product, material_type)
            except Exception as e:
                logger.warning(f"Error parsing Arizona Tile product: {e}")

    def _parse_arizona_product(self, element, material_type: str):
        """Parse Arizona Tile product element"""
        # Get the link
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        if not link:
            return

        href = link.get('href', '')
        if not href or '/products/' not in href:
            return

        product_url = urljoin(self.base_url, href)

        # Get name from various sources
        name_el = element.select_one('.product-name, .name, .title, h3, h4')
        name = name_el.get_text(strip=True) if name_el else None

        if not name:
            # Try link text or title attribute
            name = link.get('title', '') or link.get_text(strip=True)

        if not name or len(name) < 2:
            return

        # Skip navigation/category links
        skip_words = ['view all', 'see all', 'filter', 'sort', 'home', 'about', 'contact']
        if any(word in name.lower() for word in skip_words):
            return

        # Get image
        img = element.select_one('img')
        if not img and element.name != 'a':
            img = element.parent.select_one('img') if element.parent else None

        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or img.get('data-lazy', '')
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        prod = Product(
            id="",
            name=name,
            vendor=self.vendor_name,
            material_type=material_type,
            color_family=self.get_color_family(name),
            description=f"Arizona Tile {material_type.title()}",
            image_url=image_url,
            product_url=product_url,
            available=True
        )

        self.products.append(prod)


class DaltileScraper(BaseScraper):
    """Scraper for Daltile"""

    vendor_name = "daltile"
    base_url = "https://www.daltile.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Daltile scrape...")

        # Daltile uses category-based URLs with specific patterns
        categories = [
            ('/countertops-product-category/one-quartz-surfaces', 'quartz'),
            ('/countertops-product-category/panoramic-porcelain-surfaces', 'porcelain'),
            ('/countertops-product-category/purevana-mineral-surfaces', 'quartz'),
            ('/countertops-product-category/natural-quartzite', 'quartzite'),
            ('/natural-stone-product-category/marble', 'marble'),
            ('/natural-stone-product-category/granite', 'granite'),
            ('/products/natural-stone/granite', 'granite'),
            ('/products/natural-stone/marble', 'marble'),
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
            logger.warning(f"Failed to fetch Daltile category: {category_path}")
            return

        # Daltile uses product tiles and cards
        products = soup.select('.product-tile, .product-card, [data-product], .color-tile, .surface-tile')

        if not products:
            # Try finding product links
            products = soup.select('a[href*="/products/"], a[href*="/color/"]')

        if not products:
            # Try generic card structures
            products = soup.select('[class*="tile"] a[href], [class*="card"] a[href]')

        logger.info(f"Found {len(products)} products in {category_path}")

        for product in products:
            try:
                self._parse_daltile_product(product, material_type)
            except Exception as e:
                logger.warning(f"Error parsing Daltile product: {e}")

    def _parse_daltile_product(self, element, material_type: str):
        """Parse Daltile product element"""
        # Get the link
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        # Get name
        name_el = element.select_one('.product-name, .tile-name, .color-name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None

        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)

        if not name or len(name) < 2:
            return

        # Skip navigation and category links (must be specific product names)
        skip_words = ['view all', 'see all', 'filter', 'sort', 'home', 'about', 'back',
                      'explore', 'granite', 'marble', 'limestone', 'slate', 'travertine',
                      'stacked stone', 'tile', 'floor', 'wall', 'mosaic', 'countertop',
                      'natural stone', 'porcelain', 'ceramic', 'quartz', 'quartzite',
                      'selection', 'look', 'more', 'category', 'products', 'collections']
        name_lower = name.lower()
        if any(word == name_lower or name_lower == word + 's' for word in skip_words):
            return
        if any(name_lower.startswith(word + ' ') and len(name) < 25 for word in ['explore', 'view', 'see', 'shop']):
            return

        # Get image - REQUIRE image for Daltile products
        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)
            # Skip placeholder/icon images
            if image_url and ('icon' in image_url.lower() or 'logo' in image_url.lower() or 'placeholder' in image_url.lower()):
                image_url = ""

        # Skip entries without images (likely navigation links)
        if not image_url:
            return

        prod = Product(
            id="",
            name=name,
            vendor=self.vendor_name,
            material_type=material_type,
            color_family=self.get_color_family(name),
            description=f"Daltile {material_type.title()}",
            image_url=image_url,
            product_url=product_url,
            available=True
        )

        self.products.append(prod)


class CambriaScraper(BaseScraper):
    """Scraper for Cambria (American-made quartz)"""

    vendor_name = "cambria"
    base_url = "https://www.cambriausa.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Cambria scrape...")

        # Cambria only makes quartz - try multiple URL patterns
        urls_to_try = [
            f"{self.base_url}/quartz-countertops/quartz-colors",
            f"{self.base_url}/quartz-countertops/quartz-colors/",
            f"{self.base_url}/quartz-colors/",
            f"{self.base_url}/content/cusa/us/en/quartz-countertops/quartz-colors.html",
        ]

        soup = None
        for url in urls_to_try:
            soup = self.fetch_page(url)
            if soup:
                logger.info(f"Successfully fetched Cambria from: {url}")
                break

        if not soup:
            logger.warning("Failed to fetch Cambria page - site may require JavaScript")
            return self.products

        # Cambria uses various design card structures
        products = soup.select('.design-card, .color-card, .product-item, [data-design], .quartz-design')

        if not products:
            # Try finding design links
            products = soup.select('a[href*="/quartz-design/"], a[href*="/design/"]')

        if not products:
            # Try generic card structures
            products = soup.select('[class*="design"] a[href], [class*="color"] a[href]')

        logger.info(f"Found {len(products)} Cambria designs")

        for product in products:
            try:
                self._parse_cambria_product(product)
            except Exception as e:
                logger.warning(f"Error parsing Cambria product: {e}")

        # Note: Cambria's site is heavily JavaScript-driven
        # If no products found, recommend using Selenium scraper
        if not self.products:
            logger.info("Cambria site may require Selenium for JavaScript rendering")
            logger.info("Try: python vendor-api-scraper.py --vendor cambria")

        logger.info(f"Cambria scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_cambria_product(self, element):
        """Parse Cambria design element"""
        # Get the link
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        # Only process links to quartz designs
        if href and '/quartz-design/' not in href and '/design/' not in href:
            # Check if it looks like a product URL
            if not any(x in href for x in ['/quartz-countertops/', '/quartz-colors/']):
                return

        # Get name
        name_el = element.select_one('.design-name, .color-name, h3, h4, .title, .name')
        name = name_el.get_text(strip=True) if name_el else None

        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
            # Try to extract name from URL
            if not name and href and '/quartz-design/' in href:
                # /quartz-design/brittanicca/ -> Brittanicca
                parts = href.strip('/').split('/')
                if parts:
                    name = parts[-1].replace('-', ' ').title()

        if not name or len(name) < 2:
            return

        # Skip navigation and common menu items
        skip_words = ['view all', 'see all', 'filter', 'sort', 'home', 'about', 'back', 'menu',
                      'skip to', 'order samples', 'for professionals', 'cambria cares',
                      'cambriausa', 'contact', 'find a dealer', 'where to buy', 'gallery',
                      'quartz designs', 'new designs', 'kitchens', 'baths', 'planning',
                      'care', 'warranty', 'sustainability', 'careers', 'news', 'press',
                      'finishes', 'textures', 'thicknesses', 'edge profiles', 'inspiration',
                      'commercial', 'residential', 'outdoor', 'fireplace', 'mycambria']
        name_lower = name.lower()
        if any(word in name_lower for word in skip_words):
            return

        # Get image - REQUIRE image for Cambria products
        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)
            # Skip placeholder/icon images
            if image_url and ('icon' in image_url.lower() or 'logo' in image_url.lower() or 'placeholder' in image_url.lower() or 'svg' in image_url.lower()):
                image_url = ""

        # Skip entries without images (likely navigation links)
        if not image_url:
            return

        # Get collection/series if available
        collection_el = element.select_one('.collection, .series')
        collection = collection_el.get_text(strip=True) if collection_el else ""

        prod = Product(
            id="",
            name=name,
            vendor=self.vendor_name,
            material_type="quartz",
            color_family=self.get_color_family(name),
            description=f"Cambria Quartz - {collection}" if collection else "Cambria American-Made Quartz",
            image_url=image_url,
            product_url=product_url,
            available=True
        )

        self.products.append(prod)


class CaesarstoneScraper(BaseScraper):
    """Scraper for Caesarstone"""

    vendor_name = "caesarstone"
    base_url = "https://www.caesarstoneus.com"  # US site

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Caesarstone scrape...")

        # Caesarstone US uses /countertops/ for their catalog
        urls_to_try = [
            f"{self.base_url}/countertops/",
            f"{self.base_url}/countertops",
            "https://www.caesarstone.com/en-us/design-quartz-colors-quartz-countertops/",
        ]

        soup = None
        for url in urls_to_try:
            soup = self.fetch_page(url)
            if soup:
                logger.info(f"Successfully fetched Caesarstone from: {url}")
                break

        if not soup:
            logger.warning("Failed to fetch Caesarstone page")
            return self.products

        # Look for product/color data in various formats
        products = soup.select('.color-card, .product-card, .quartz-color, [data-color], .catalog-item')

        if not products:
            # Try finding color links with their URL pattern: /countertops/CODE-name/
            products = soup.select('a[href*="/countertops/"][href*="-"]')

        if not products:
            # Try generic card structures
            products = soup.select('[class*="color"] a[href], [class*="product"] a[href]')

        # Also look for JSON data embedded in the page (Caesarstone uses Vue.js)
        scripts = soup.select('script')
        for script in scripts:
            if script.string and '_catalogItems' in script.string:
                try:
                    # Extract product data from JavaScript
                    import re
                    match = re.search(r'_catalogItems\s*=\s*(\[.*?\]);', script.string, re.DOTALL)
                    if match:
                        items = json.loads(match.group(1))
                        for item in items:
                            if item.get('title'):
                                self._add_product_from_json(item)
                except Exception as e:
                    logger.debug(f"Could not parse Caesarstone JSON: {e}")

        logger.info(f"Found {len(products)} Caesarstone color elements")

        for product in products:
            try:
                self._parse_caesarstone_product(product)
            except Exception as e:
                logger.warning(f"Error parsing Caesarstone product: {e}")

        logger.info(f"Caesarstone scrape complete: {len(self.products)} products found")
        return self.products

    def _add_product_from_json(self, item: dict):
        """Add product from JSON data"""
        name = item.get('title', '')
        if not name:
            return

        code = item.get('code', '')
        material = item.get('materialName', 'quartz').lower()

        prod = Product(
            id="",
            name=name,
            vendor=self.vendor_name,
            material_type=material if material in ['quartz', 'porcelain', 'fusion', 'mineral'] else 'quartz',
            color_family=self.get_color_family(name),
            description="Caesarstone Quartz",
            image_url=item.get('img', ''),
            product_url=item.get('url', ''),
            sku=code,
            available=True
        )

        self.products.append(prod)

    def _parse_caesarstone_product(self, element):
        """Parse Caesarstone product element"""
        # Get the link
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        # Get name
        name_el = element.select_one('.color-name, .product-name, h3, h4')
        name = name_el.get_text(strip=True) if name_el else None

        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
            # Try to extract from URL: /countertops/5000-london-grey/ -> London Grey
            if not name and href and '/countertops/' in href:
                parts = href.strip('/').split('/')
                if len(parts) >= 2:
                    name_part = parts[-1]
                    # Remove code prefix like "5000-"
                    name_part = re.sub(r'^\d+-', '', name_part)
                    name = name_part.replace('-', ' ').title()

        if not name or len(name) < 2:
            return

        # Skip navigation
        skip_words = ['view all', 'see all', 'filter', 'sort', 'home', 'about', 'where to buy', 'samples']
        if any(word in name.lower() for word in skip_words):
            return

        # Get image
        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        # Get SKU/color code
        sku_el = element.select_one('.color-code, .sku, .code')
        sku = sku_el.get_text(strip=True) if sku_el else None

        # Try to get SKU from URL
        if not sku and href:
            match = re.search(r'/(\d{4})-', href)
            if match:
                sku = match.group(1)

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


class SilestoneScaper(BaseScraper):
    """Scraper for Silestone (Cosentino)"""

    vendor_name = "silestone"
    base_url = "https://www.cosentino.com"

    def scrape(self) -> List[Product]:
        logger.info(f"Starting Silestone scrape...")

        # Silestone is now part of Cosentino - try multiple URL patterns
        urls_to_try = [
            f"{self.base_url}/usa/colors/silestone/",
            f"{self.base_url}/usa/silestone/",
            f"{self.base_url}/usa/silestone/colours/",
            "https://www.silestoneusa.com/colors/",
        ]

        soup = None
        for url in urls_to_try:
            soup = self.fetch_page(url)
            if soup:
                logger.info(f"Successfully fetched Silestone from: {url}")
                break

        if not soup:
            logger.warning("Failed to fetch Silestone page - site may require JavaScript")
            return self.products

        # Silestone/Cosentino uses various card structures
        products = soup.select('.colour-card, .color-card, .product-card, .color-item, [data-colour], [data-color]')

        if not products:
            # Try finding color links
            products = soup.select('a[href*="/colors/"], a[href*="/colour/"], a[href*="/silestone/"]')

        if not products:
            # Try generic card structures
            products = soup.select('[class*="color"] a[href], [class*="colour"] a[href]')

        logger.info(f"Found {len(products)} Silestone color elements")

        for product in products:
            try:
                self._parse_silestone_product(product)
            except Exception as e:
                logger.warning(f"Error parsing Silestone product: {e}")

        # Note: Cosentino's site is heavily JavaScript-driven
        if not self.products:
            logger.info("Silestone/Cosentino site may require Selenium for JavaScript rendering")

        logger.info(f"Silestone scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_silestone_product(self, element):
        """Parse Silestone product element"""
        # Get the link
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        # Only process links that look like product/color pages
        if href:
            # Must be a color/product link, not navigation
            valid_patterns = ['/silestone/', '/color/', '/colours/', '/colors/']
            if not any(p in href for p in valid_patterns):
                return
            # Skip main section pages
            skip_paths = ['/usa/silestone/$', '/colors/$', '/colours/$', '/colors/silestone/$']
            if any(href.rstrip('/').endswith(p.rstrip('$')) for p in skip_paths):
                return

        # Get name
        name_el = element.select_one('.colour-name, .color-name, .product-name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None

        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
            # Try to extract from URL - look for color name in path
            if (not name or len(name) < 3) and href:
                parts = href.strip('/').split('/')
                # Get the last meaningful part that's not a generic term
                for part in reversed(parts):
                    if part and part not in ['silestone', 'colors', 'colours', 'usa', 'color']:
                        name = part.replace('-', ' ').title()
                        break

        if not name or len(name) < 3:
            return

        # Skip navigation and non-product links
        skip_words = ['view all', 'see all', 'filter', 'sort', 'home', 'about', 'contact',
                      'hybriq', 'technology', 'sustainability', 'what is', 'maintenance',
                      'warranty', 'colors', 'colours', 'where to buy', 'find a dealer',
                      'professional', 'dealer', 'download', 'brochure', 'catalog',
                      'kitchen', 'bathroom', 'countertop', 'cladding', 'sink', 'furniture',
                      'shower', 'care', 'cleaning', 'installation', 'fabricator']
        name_lower = name.lower()
        if any(word in name_lower for word in skip_words):
            return

        # Get image - REQUIRE image for Silestone products
        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)
            # Skip placeholder/icon images
            if image_url and ('icon' in image_url.lower() or 'logo' in image_url.lower() or 'placeholder' in image_url.lower() or 'svg' in image_url.lower()):
                image_url = ""

        # Skip entries without images (likely navigation links)
        if not image_url:
            return

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


# ─── Tier 1: Phoenix-local wholesale distributors ───────────────────────────


class BolderImageScraper(BaseScraper):
    """Scraper for Bolder Image Stone (bolderimagestone.com)"""

    vendor_name = "bolder-image"
    base_url = "https://www.bolderimagestone.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Bolder Image Stone scrape...")

        categories = [
            ('/catalogue/', 'granite'),
            ('/collection/quartz/', 'quartz'),
            ('/collection/natural-stone/', 'granite'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Bolder Image scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        url = f"{self.base_url}{category_path}"
        soup = self.fetch_page(url)
        if not soup:
            return

        products = soup.select('.product-card a[href], .product-item a[href], .collection-item a[href]')
        if not products:
            products = soup.select('[class*="product"] a[href], .grid-item a[href], .portfolio-item a[href]')
        if not products:
            products = soup.select('a[href*="/product/"], a[href*="/collection/"]')

        logger.info(f"Found {len(products)} products in {category_path}")

        for product in products:
            try:
                self._parse_product(product, material_type)
            except Exception as e:
                logger.warning(f"Error parsing Bolder Image product: {e}")

    def _parse_product(self, element, material_type: str):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')
        if not link:
            return

        href = link.get('href', '')
        if not href:
            return
        product_url = urljoin(self.base_url, href)

        name_el = element.select_one('.product-name, .title, h3, h4, .name')
        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        skip_words = ['home', 'about', 'contact', 'view all', 'catalogue', 'collection']
        if any(word in name.lower() for word in skip_words):
            return

        # Detect material from name/URL
        detected = material_type
        text_lower = f"{name} {href}".lower()
        if 'quartz' in text_lower and 'quartzite' not in text_lower:
            detected = 'quartz'
        elif 'quartzite' in text_lower:
            detected = 'quartzite'
        elif 'marble' in text_lower:
            detected = 'marble'

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type=detected, color_family=self.get_color_family(name),
            description=f"Bolder Image Stone {detected.title()}",
            image_url=image_url, product_url=product_url, available=True
        ))


class AracruzScraper(BaseScraper):
    """Scraper for Aracruz RE (aracruzre.com) — WooCommerce"""

    vendor_name = "aracruz"
    base_url = "https://www.aracruzre.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Aracruz RE scrape...")

        categories = [
            ('/product-category/granite-slab/', 'granite'),
            ('/product-category/quartz-slab/', 'quartz'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Aracruz scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        page = 1
        while True:
            url = f"{self.base_url}{category_path}" if page == 1 else f"{self.base_url}{category_path}page/{page}/"
            soup = self.fetch_page(url)
            if not soup:
                break

            products = soup.select('.product, .product-item, li.product')
            if not products:
                products = soup.select('a[href*="/product/"]')

            if not products:
                break

            logger.info(f"Found {len(products)} products on page {page} of {category_path}")

            for product in products:
                try:
                    self._parse_woo_product(product, material_type)
                except Exception as e:
                    logger.warning(f"Error parsing Aracruz product: {e}")

            # Check for next page
            next_link = soup.select_one('a.next, .woocommerce-pagination a.next')
            if not next_link:
                break
            page += 1

    def _parse_woo_product(self, element, material_type: str):
        link = element.select_one('a[href*="/product/"]')
        if not link and element.name == 'a' and '/product/' in element.get('href', ''):
            link = element
        if not link:
            return

        href = link.get('href', '')
        product_url = urljoin(self.base_url, href)

        name_el = element.select_one('.woocommerce-loop-product__title, .product-title, h2, h3')
        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        # Detect material from name
        detected = material_type
        name_lower = name.lower()
        for mat in ['quartzite', 'quartz', 'marble', 'soapstone', 'granite']:
            if mat in name_lower:
                detected = mat
                break

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type=detected, color_family=self.get_color_family(name),
            description=f"Aracruz RE {detected.title()}",
            image_url=image_url, product_url=product_url, available=True
        ))


class SunStoneScraper(BaseScraper):
    """Scraper for Sun Stone Supply (sunstonesurfaces.com) — WooCommerce"""

    vendor_name = "sun-stone"
    base_url = "https://www.sunstonesurfaces.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Sun Stone Supply scrape...")

        categories = [
            ('/product-category/quartz-slabs/', 'quartz'),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Sun Stone scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: str):
        page = 1
        while True:
            url = f"{self.base_url}{category_path}" if page == 1 else f"{self.base_url}{category_path}page/{page}/"
            soup = self.fetch_page(url)
            if not soup:
                break

            products = soup.select('.product, li.product')
            if not products:
                products = soup.select('a[href*="/product/"]')

            if not products:
                break

            logger.info(f"Found {len(products)} products on page {page} of {category_path}")

            for product in products:
                try:
                    self._parse_woo_product(product, material_type)
                except Exception as e:
                    logger.warning(f"Error parsing Sun Stone product: {e}")

            next_link = soup.select_one('a.next, .woocommerce-pagination a.next')
            if not next_link:
                break
            page += 1

    def _parse_woo_product(self, element, material_type: str):
        link = element.select_one('a[href*="/product/"]')
        if not link and element.name == 'a' and '/product/' in element.get('href', ''):
            link = element
        if not link:
            return

        href = link.get('href', '')
        product_url = urljoin(self.base_url, href)

        name_el = element.select_one('.woocommerce-loop-product__title, .product-title, h2, h3')
        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type=material_type, color_family=self.get_color_family(name),
            description=f"Sun Stone Supply {material_type.title()}",
            image_url=image_url, product_url=product_url, available=True
        ))


class ClassicSurfacesScraper(BaseScraper):
    """Scraper for Classic Surfaces (classic-surfaces.com)"""

    vendor_name = "classic-surfaces"
    base_url = "https://www.classic-surfaces.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Classic Surfaces scrape...")

        categories = [
            ('/quartz-and-stone-countertop-products/', None),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Classic Surfaces scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: Optional[str]):
        url = f"{self.base_url}{category_path}"
        soup = self.fetch_page(url)
        if not soup:
            return

        products = soup.select('.product-card a[href], .product-item a[href], .grid-item a[href]')
        if not products:
            products = soup.select('[class*="product"] a[href], [class*="stone"] a[href]')
        if not products:
            products = soup.select('a[href*="product"], a[href*="stone"], a[href*="quartz"]')

        logger.info(f"Found {len(products)} products in {category_path}")

        for product in products:
            try:
                self._parse_product(product, material_type)
            except Exception as e:
                logger.warning(f"Error parsing Classic Surfaces product: {e}")

    def _parse_product(self, element, material_type: Optional[str]):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')
        if not link:
            return

        href = link.get('href', '')
        if not href:
            return
        product_url = urljoin(self.base_url, href)

        name_el = element.select_one('.product-name, .title, h3, h4, .name')
        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        skip_words = ['home', 'about', 'contact', 'view all', 'products']
        if any(word in name.lower() for word in skip_words):
            return

        # Detect material from name/URL
        detected = material_type or 'quartz'
        text_lower = f"{name} {href}".lower()
        if 'quartzite' in text_lower:
            detected = 'quartzite'
        elif 'quartz' in text_lower:
            detected = 'quartz'
        elif 'marble' in text_lower:
            detected = 'marble'
        elif 'granite' in text_lower:
            detected = 'granite'
        elif 'dolomite' in text_lower:
            detected = 'dolomite'

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type=detected, color_family=self.get_color_family(name),
            description=f"Classic Surfaces {detected.title()}",
            image_url=image_url, product_url=product_url, available=True
        ))


class StoneCollectionScraper(BaseScraper):
    """Scraper for The Stone Collection (thestonecollection.com)"""

    vendor_name = "stone-collection"
    base_url = "https://www.thestonecollection.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting The Stone Collection scrape...")

        categories = [
            ('/slab-products/', None),
        ]

        for category_url, material_type in categories:
            self._scrape_category(category_url, material_type)

        logger.info(f"Stone Collection scrape complete: {len(self.products)} products found")
        return self.products

    def _scrape_category(self, category_path: str, material_type: Optional[str]):
        url = f"{self.base_url}{category_path}"
        soup = self.fetch_page(url)
        if not soup:
            return

        products = soup.select('.product-card a[href], .product-item a[href], .slab-item a[href]')
        if not products:
            products = soup.select('[class*="product"] a[href], [class*="slab"] a[href]')
        if not products:
            products = soup.select('.grid-item a[href], .portfolio-item a[href]')

        logger.info(f"Found {len(products)} products in {category_path}")

        for product in products:
            try:
                self._parse_product(product, material_type)
            except Exception as e:
                logger.warning(f"Error parsing Stone Collection product: {e}")

    def _parse_product(self, element, material_type: Optional[str]):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')
        if not link:
            return

        href = link.get('href', '')
        if not href:
            return
        product_url = urljoin(self.base_url, href)

        name_el = element.select_one('.product-name, .title, h3, h4, .name')
        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        skip_words = ['home', 'about', 'contact', 'view all', 'slab products']
        if any(word in name.lower() for word in skip_words):
            return

        # Detect material
        detected = material_type or 'granite'
        text_lower = f"{name} {href}".lower()
        if 'quartzite' in text_lower:
            detected = 'quartzite'
        elif 'quartz' in text_lower:
            detected = 'quartz'
        elif 'marble' in text_lower:
            detected = 'marble'
        elif 'onyx' in text_lower:
            detected = 'onyx'
        elif 'granite' in text_lower:
            detected = 'granite'

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type=detected, color_family=self.get_color_family(name),
            description=f"The Stone Collection {detected.title()}",
            image_url=image_url, product_url=product_url, available=True
        ))


# ─── Tier 2: Manufacturer brands ────────────────────────────────────────────


class PentalQuartzScraper(BaseScraper):
    """Scraper for PentalQuartz (arcsurfaces.com)"""

    vendor_name = "pentalquartz"
    base_url = "https://www.arcsurfaces.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting PentalQuartz scrape...")

        url = f"{self.base_url}/quartz/pentalquartz/collections/"
        soup = self.fetch_page(url)
        if not soup:
            logger.warning("Failed to fetch PentalQuartz page")
            return self.products

        products = soup.select('.color-card a[href], .product-card a[href], .collection-item a[href]')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="product"] a[href]')
        if not products:
            products = soup.select('a[href*="pentalquartz"]')

        logger.info(f"Found {len(products)} PentalQuartz colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing PentalQuartz product: {e}")

        logger.info(f"PentalQuartz scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')
        if not link:
            return

        href = link.get('href', '')
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .title, h3, h4, .name')
        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        skip_words = ['view all', 'collections', 'home', 'about', 'contact']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="quartz", color_family=self.get_color_family(name),
            description="PentalQuartz by ARC Surfaces",
            image_url=image_url, product_url=product_url, available=True
        ))


class HanStoneScraper(BaseScraper):
    """Scraper for HanStone Quartz (hanstone.com)"""

    vendor_name = "hanstone"
    base_url = "https://www.hanstone.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting HanStone scrape...")

        url = f"{self.base_url}/collections/all_colors.php"
        soup = self.fetch_page(url)
        if not soup:
            # Try alternate URL
            soup = self.fetch_page(f"{self.base_url}/collections/")
        if not soup:
            logger.warning("Failed to fetch HanStone page")
            return self.products

        products = soup.select('.color-card, .color-item, .product-card, [data-color]')
        if not products:
            products = soup.select('a[href*="color"], a[href*="collection"]')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="swatch"] a[href]')

        logger.info(f"Found {len(products)} HanStone colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing HanStone product: {e}")

        logger.info(f"HanStone scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name:
            # Try data attribute
            name = element.get('data-color', '') or element.get('data-name', '')
        if not name or len(name) < 2:
            return

        skip_words = ['view all', 'all colors', 'home', 'about', 'contact', 'collections']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="quartz", color_family=self.get_color_family(name),
            description="HanStone Quartz",
            image_url=image_url, product_url=product_url, available=True
        ))


class LXHausysScraper(BaseScraper):
    """Scraper for LX Hausys Viatera (lxhausys.com) — JS-heavy, best-effort"""

    vendor_name = "lx-hausys"
    base_url = "https://www.lxhausys.com/us"

    def scrape(self) -> List[Product]:
        logger.info("Starting LX Hausys (Viatera) scrape...")

        url = f"{self.base_url}/products/viatera-quartz-surface/viatera-finder"
        soup = self.fetch_page(url)
        if not soup:
            # Try alternate paths
            soup = self.fetch_page(f"{self.base_url}/products/viatera-quartz-surface/")
        if not soup:
            logger.warning("Failed to fetch LX Hausys page — site may require Selenium")
            return self.products

        products = soup.select('.color-card, .product-card, .color-item, [data-color]')
        if not products:
            products = soup.select('a[href*="viatera"], [class*="color"] a[href]')
        if not products:
            products = soup.select('[class*="product"] a[href], [class*="swatch"]')

        logger.info(f"Found {len(products)} Viatera colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing LX Hausys product: {e}")

        if not self.products:
            logger.info("LX Hausys site is heavily JS-driven; consider Selenium for full catalog")

        logger.info(f"LX Hausys scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name:
            name = element.get('data-color', '') or element.get('data-name', '')
        if not name or len(name) < 2:
            return

        skip_words = ['view all', 'home', 'about', 'contact', 'finder', 'viatera']
        if any(name.lower() == word for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="quartz", color_family=self.get_color_family(name),
            description="LX Hausys Viatera Quartz",
            image_url=image_url, product_url=product_url, available=True
        ))


class VicostoneScraper(BaseScraper):
    """Scraper for Vicostone (us.vicostone.com) — 140+ quartz colors"""

    vendor_name = "vicostone"
    base_url = "https://us.vicostone.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Vicostone scrape...")

        url = f"{self.base_url}/en/quartz-stone"
        soup = self.fetch_page(url)
        if not soup:
            soup = self.fetch_page(f"{self.base_url}/en/quartz-stone/")
        if not soup:
            logger.warning("Failed to fetch Vicostone page")
            return self.products

        products = soup.select('.color-card, .product-card, .product-item, [data-product]')
        if not products:
            products = soup.select('a[href*="quartz-stone/"], a[href*="/product/"]')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="product"] a[href]')

        logger.info(f"Found {len(products)} Vicostone colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing Vicostone product: {e}")

        logger.info(f"Vicostone scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .product-name, .name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name:
            name = element.get('data-name', '') or element.get('data-color', '')
        if not name or len(name) < 2:
            return

        skip_words = ['view all', 'home', 'about', 'contact', 'quartz stone']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="quartz", color_family=self.get_color_family(name),
            description="Vicostone Quartz",
            image_url=image_url, product_url=product_url, available=True
        ))


class PolarstoneScraper(BaseScraper):
    """Scraper for Polarstone (polarstoneus.com) — homepage gallery"""

    vendor_name = "polarstone"
    base_url = "https://www.polarstoneus.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Polarstone scrape...")

        # Polarstone uses homepage gallery
        soup = self.fetch_page(self.base_url)
        if not soup:
            soup = self.fetch_page(f"{self.base_url}/")
        if not soup:
            logger.warning("Failed to fetch Polarstone page")
            return self.products

        products = soup.select('.color-card, .product-card, .product-item, .gallery-item')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="product"] a[href]')
        if not products:
            products = soup.select('a[href*="color"], a[href*="product"]')

        logger.info(f"Found {len(products)} Polarstone colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing Polarstone product: {e}")

        logger.info(f"Polarstone scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .product-name, .name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name or len(name) < 2:
            return

        skip_words = ['home', 'about', 'contact', 'view all']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="quartz", color_family=self.get_color_family(name),
            description="Polarstone Quartz",
            image_url=image_url, product_url=product_url, available=True
        ))


class RadianzScraper(BaseScraper):
    """Scraper for Radianz Quartz (radianz-quartz.com)"""

    vendor_name = "radianz"
    base_url = "https://www.radianz-quartz.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Radianz scrape...")

        url = f"{self.base_url}/radianz/us/color/list"
        soup = self.fetch_page(url)
        if not soup:
            soup = self.fetch_page(f"{self.base_url}/radianz/us/color/list/")
        if not soup:
            logger.warning("Failed to fetch Radianz page")
            return self.products

        products = soup.select('.color-card, .color-item, .product-card, [data-color]')
        if not products:
            products = soup.select('a[href*="color/"], [class*="color"] a[href]')
        if not products:
            products = soup.select('[class*="product"] a[href], [class*="swatch"]')

        logger.info(f"Found {len(products)} Radianz colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing Radianz product: {e}")

        logger.info(f"Radianz scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name:
            name = element.get('data-color', '') or element.get('data-name', '')
        if not name or len(name) < 2:
            return

        skip_words = ['view all', 'home', 'about', 'contact', 'color list']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="quartz", color_family=self.get_color_family(name),
            description="Radianz Quartz by Samsung",
            image_url=image_url, product_url=product_url, available=True
        ))


# ─── Tier 3: Cosentino extensions + Neolith ─────────────────────────────────


class DektonScraper(BaseScraper):
    """Scraper for Dekton (cosentino.com) — sintered stone"""

    vendor_name = "dekton"
    base_url = "https://www.cosentino.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Dekton scrape...")

        urls_to_try = [
            f"{self.base_url}/usa/colors/dekton/",
            f"{self.base_url}/usa/dekton/colors/",
            f"{self.base_url}/usa/dekton/",
        ]

        soup = None
        for url in urls_to_try:
            soup = self.fetch_page(url)
            if soup:
                logger.info(f"Successfully fetched Dekton from: {url}")
                break

        if not soup:
            logger.warning("Failed to fetch Dekton page — site may require JavaScript")
            return self.products

        # Same structure as Silestone (Cosentino)
        products = soup.select('.colour-card, .color-card, .product-card, .color-item, [data-colour], [data-color]')
        if not products:
            products = soup.select('a[href*="/colors/"], a[href*="/colour/"], a[href*="/dekton/"]')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="colour"] a[href]')

        logger.info(f"Found {len(products)} Dekton color elements")

        for product in products:
            try:
                self._parse_cosentino_product(product, "dekton")
            except Exception as e:
                logger.warning(f"Error parsing Dekton product: {e}")

        if not self.products:
            logger.info("Dekton/Cosentino site may require Selenium for JavaScript rendering")

        logger.info(f"Dekton scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_cosentino_product(self, element, brand: str):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        if href:
            valid_patterns = ['/dekton/', '/color/', '/colours/', '/colors/']
            if not any(p in href for p in valid_patterns):
                return
            skip_paths = ['/usa/dekton/$', '/colors/$', '/colours/$', f'/colors/{brand}/$']
            if any(href.rstrip('/').endswith(p.rstrip('$')) for p in skip_paths):
                return

        name_el = element.select_one('.colour-name, .color-name, .product-name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
            if (not name or len(name) < 3) and href:
                parts = href.strip('/').split('/')
                for part in reversed(parts):
                    if part and part not in ['dekton', 'colors', 'colours', 'usa', 'color']:
                        name = part.replace('-', ' ').title()
                        break
        if not name or len(name) < 3:
            return

        skip_words = ['view all', 'see all', 'filter', 'home', 'about', 'contact',
                      'technology', 'sustainability', 'where to buy', 'find a dealer',
                      'kitchen', 'bathroom', 'countertop', 'cladding', 'flooring',
                      'outdoor', 'facade', 'colors', 'colours']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)
            if image_url and ('icon' in image_url.lower() or 'logo' in image_url.lower() or 'svg' in image_url.lower()):
                image_url = ""

        if not image_url:
            return

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="sintered-stone", color_family=self.get_color_family(name),
            description="Dekton Sintered Stone by Cosentino",
            image_url=image_url, product_url=product_url, available=True
        ))


class SensaScraper(BaseScraper):
    """Scraper for Sensa (cosentino.com) — natural granite & quartzite"""

    vendor_name = "sensa"
    base_url = "https://www.cosentino.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Sensa scrape...")

        urls_to_try = [
            f"{self.base_url}/usa/colors/sensa/",
            f"{self.base_url}/usa/sensa/colors/",
            f"{self.base_url}/usa/sensa/",
        ]

        soup = None
        for url in urls_to_try:
            soup = self.fetch_page(url)
            if soup:
                logger.info(f"Successfully fetched Sensa from: {url}")
                break

        if not soup:
            logger.warning("Failed to fetch Sensa page — site may require JavaScript")
            return self.products

        # Same structure as Silestone/Dekton (Cosentino)
        products = soup.select('.colour-card, .color-card, .product-card, .color-item, [data-colour], [data-color]')
        if not products:
            products = soup.select('a[href*="/colors/"], a[href*="/colour/"], a[href*="/sensa/"]')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="colour"] a[href]')

        logger.info(f"Found {len(products)} Sensa color elements")

        for product in products:
            try:
                self._parse_cosentino_product(product)
            except Exception as e:
                logger.warning(f"Error parsing Sensa product: {e}")

        if not self.products:
            logger.info("Sensa/Cosentino site may require Selenium for JavaScript rendering")

        logger.info(f"Sensa scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_cosentino_product(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        if href:
            valid_patterns = ['/sensa/', '/color/', '/colours/', '/colors/']
            if not any(p in href for p in valid_patterns):
                return
            skip_paths = ['/usa/sensa/$', '/colors/$', '/colours/$', '/colors/sensa/$']
            if any(href.rstrip('/').endswith(p.rstrip('$')) for p in skip_paths):
                return

        name_el = element.select_one('.colour-name, .color-name, .product-name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
            if (not name or len(name) < 3) and href:
                parts = href.strip('/').split('/')
                for part in reversed(parts):
                    if part and part not in ['sensa', 'colors', 'colours', 'usa', 'color']:
                        name = part.replace('-', ' ').title()
                        break
        if not name or len(name) < 3:
            return

        skip_words = ['view all', 'see all', 'filter', 'home', 'about', 'contact',
                      'technology', 'sustainability', 'where to buy', 'find a dealer',
                      'kitchen', 'bathroom', 'countertop', 'colors', 'colours']
        if any(word in name.lower() for word in skip_words):
            return

        # Detect material — Sensa covers granite and quartzite
        detected = 'granite'
        if 'quartzite' in name.lower():
            detected = 'quartzite'

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)
            if image_url and ('icon' in image_url.lower() or 'logo' in image_url.lower() or 'svg' in image_url.lower()):
                image_url = ""

        if not image_url:
            return

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type=detected, color_family=self.get_color_family(name),
            description=f"Sensa {detected.title()} by Cosentino",
            image_url=image_url, product_url=product_url, available=True
        ))


class NeolithScraper(BaseScraper):
    """Scraper for Neolith (neolith.com) — sintered stone"""

    vendor_name = "neolith"
    base_url = "https://www.neolith.com"

    def scrape(self) -> List[Product]:
        logger.info("Starting Neolith scrape...")

        url = f"{self.base_url}/us/all-colors/"
        soup = self.fetch_page(url)
        if not soup:
            soup = self.fetch_page(f"{self.base_url}/us/all-colors")
        if not soup:
            soup = self.fetch_page(f"{self.base_url}/en/all-colors/")
        if not soup:
            logger.warning("Failed to fetch Neolith page")
            return self.products

        products = soup.select('.color-card, .product-card, .color-item, [data-color]')
        if not products:
            products = soup.select('a[href*="color"], a[href*="model"]')
        if not products:
            products = soup.select('[class*="color"] a[href], [class*="product"] a[href]')

        logger.info(f"Found {len(products)} Neolith colors")

        for product in products:
            try:
                self._parse_color(product)
            except Exception as e:
                logger.warning(f"Error parsing Neolith product: {e}")

        logger.info(f"Neolith scrape complete: {len(self.products)} products found")
        return self.products

    def _parse_color(self, element):
        if element.name == 'a':
            link = element
        else:
            link = element.select_one('a[href]')

        href = link.get('href', '') if link else ''
        product_url = urljoin(self.base_url, href) if href else ""

        name_el = element.select_one('.color-name, .product-name, .name, h3, h4, .title')
        name = name_el.get_text(strip=True) if name_el else None
        if not name and link:
            name = link.get('title', '') or link.get_text(strip=True)
        if not name:
            name = element.get('data-color', '') or element.get('data-name', '')
        if not name or len(name) < 2:
            return

        skip_words = ['view all', 'all colors', 'home', 'about', 'contact', 'where to buy']
        if any(word in name.lower() for word in skip_words):
            return

        img = element.select_one('img')
        image_url = ""
        if img:
            image_url = img.get('data-src') or img.get('src') or ''
            if image_url and not image_url.startswith('http'):
                image_url = urljoin(self.base_url, image_url)

        self.products.append(Product(
            id="", name=name, vendor=self.vendor_name,
            material_type="sintered-stone", color_family=self.get_color_family(name),
            description="Neolith Sintered Stone",
            image_url=image_url, product_url=product_url, available=True
        ))


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
                        help='Vendor to scrape (msi, arizona-tile, daltile, cambria, caesarstone, silestone, '
                             'bolder-image, aracruz, sun-stone, classic-surfaces, stone-collection, '
                             'pentalquartz, hanstone, lx-hausys, vicostone, polarstone, radianz, '
                             'dekton, sensa, neolith, all)')
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
        # Tier 1 — Phoenix-local wholesale
        'bolder-image': BolderImageScraper,
        'aracruz': AracruzScraper,
        'sun-stone': SunStoneScraper,
        'classic-surfaces': ClassicSurfacesScraper,
        'stone-collection': StoneCollectionScraper,
        # Tier 2 — Manufacturer brands
        'pentalquartz': PentalQuartzScraper,
        'hanstone': HanStoneScraper,
        'lx-hausys': LXHausysScraper,
        'vicostone': VicostoneScraper,
        'polarstone': PolarstoneScraper,
        'radianz': RadianzScraper,
        # Tier 3 — Cosentino extensions + Neolith
        'dekton': DektonScraper,
        'sensa': SensaScraper,
        'neolith': NeolithScraper,
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
