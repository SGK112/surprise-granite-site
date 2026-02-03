#!/usr/bin/env python3
"""
Selenium-based scraper for JavaScript-heavy vendor sites.
Requires: pip install selenium webdriver-manager
"""

import json
import time
import logging
import re
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    from webdriver_manager.chrome import ChromeDriverManager
    from bs4 import BeautifulSoup
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install selenium webdriver-manager beautifulsoup4")
    exit(1)

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / 'scraper-output'
OUTPUT_DIR.mkdir(exist_ok=True)


@dataclass
class Product:
    name: str
    vendor: str
    material_type: str
    image_url: str = ""
    product_url: str = ""
    color_family: str = "other"
    description: str = ""
    sku: str = ""


def get_color_family(name: str) -> str:
    """Determine color family from product name"""
    name_lower = name.lower()
    colors = {
        'white': ['white', 'bianco', 'blanco', 'calacatta', 'carrara', 'snow', 'pearl', 'ivory', 'frost'],
        'gray': ['gray', 'grey', 'grigio', 'concrete', 'steel', 'ash', 'slate', 'charcoal'],
        'black': ['black', 'nero', 'noir', 'midnight', 'obsidian', 'raven', 'onyx'],
        'brown': ['brown', 'tan', 'coffee', 'mocha', 'chocolate', 'walnut', 'bronze', 'copper'],
        'beige': ['beige', 'cream', 'sand', 'taupe', 'khaki', 'buff'],
        'gold': ['gold', 'amber', 'honey', 'brass', 'champagne'],
        'blue': ['blue', 'azul', 'navy', 'ocean', 'marine', 'cobalt'],
        'green': ['green', 'verde', 'emerald', 'jade', 'sage', 'olive'],
    }
    for color, keywords in colors.items():
        if any(kw in name_lower for kw in keywords):
            return color
    return 'other'


class VendorScraper:
    """Selenium-based scraper for vendor websites"""

    def __init__(self, headless: bool = True):
        options = Options()
        if headless:
            options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option('excludeSwitches', ['enable-automation'])

        logger.info("Starting Chrome browser...")
        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        self.wait = WebDriverWait(self.driver, 15)

    def close(self):
        if hasattr(self, 'driver'):
            self.driver.quit()

    def scroll_page(self, pause: float = 1.5, max_scrolls: int = 10):
        """Scroll page to load lazy content"""
        last_height = self.driver.execute_script("return document.body.scrollHeight")
        for i in range(max_scrolls):
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(pause)
            new_height = self.driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

    def scrape_cambria(self) -> List[Product]:
        """Scrape Cambria quartz designs"""
        products = []
        logger.info("Scraping Cambria...")

        try:
            self.driver.get("https://www.cambriausa.com/quartz-countertops/quartz-colors")
            time.sleep(5)  # Wait for JS to load

            self.scroll_page()

            # Get page source after JS rendering
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')

            # Try multiple selector patterns
            selectors = [
                'a[href*="/quartz-design/"]',
                '[class*="design"] a[href]',
                '[class*="color-card"] a',
                '[class*="product"] a[href*="quartz"]',
            ]

            links = []
            for selector in selectors:
                found = soup.select(selector)
                if found:
                    logger.info(f"  Found {len(found)} elements with: {selector}")
                    links.extend(found)

            # Deduplicate by href
            seen_urls = set()
            for link in links:
                href = link.get('href', '')
                if not href or href in seen_urls:
                    continue
                if '/quartz-design/' not in href and '/design/' not in href:
                    continue

                seen_urls.add(href)

                # Extract name from URL or link text
                name = link.get_text(strip=True)
                if not name or len(name) < 3:
                    # Get from URL: /quartz-design/brittanicca/ -> Brittanicca
                    parts = href.strip('/').split('/')
                    name = parts[-1].replace('-', ' ').title() if parts else ""

                if not name or len(name) < 3:
                    continue

                # Skip navigation items
                skip = ['skip', 'menu', 'nav', 'home', 'about', 'contact', 'sample', 'dealer']
                if any(s in name.lower() for s in skip):
                    continue

                url = href if href.startswith('http') else f"https://www.cambriausa.com{href}"

                # Try to find associated image
                img = link.select_one('img')
                if not img:
                    parent = link.parent
                    img = parent.select_one('img') if parent else None

                img_url = ""
                if img:
                    img_url = img.get('src') or img.get('data-src') or ""
                    if img_url and not img_url.startswith('http'):
                        img_url = f"https://www.cambriausa.com{img_url}"

                products.append(Product(
                    name=name,
                    vendor='cambria',
                    material_type='quartz',
                    image_url=img_url,
                    product_url=url,
                    color_family=get_color_family(name),
                    description="Cambria American-Made Quartz"
                ))

            logger.info(f"  Cambria: {len(products)} products found")

        except Exception as e:
            logger.error(f"  Cambria error: {e}")

        return products

    def scrape_silestone(self) -> List[Product]:
        """Scrape Silestone/Cosentino colors"""
        products = []
        logger.info("Scraping Silestone...")

        try:
            self.driver.get("https://www.cosentino.com/usa/colors/silestone/")
            time.sleep(5)

            self.scroll_page()

            soup = BeautifulSoup(self.driver.page_source, 'html.parser')

            # Look for color/product links
            selectors = [
                'a[href*="/silestone/"][href*="color"]',
                'a[href*="/colors/silestone/"]',
                '[class*="color"] a[href]',
                '[class*="product-card"] a',
            ]

            links = []
            for selector in selectors:
                found = soup.select(selector)
                if found:
                    logger.info(f"  Found {len(found)} elements with: {selector}")
                    links.extend(found)

            seen_urls = set()
            for link in links:
                href = link.get('href', '')
                if not href or href in seen_urls:
                    continue

                # Must be a specific color page, not category
                if href.rstrip('/').endswith('/silestone') or href.rstrip('/').endswith('/colors'):
                    continue

                seen_urls.add(href)

                name = link.get_text(strip=True)
                if not name or len(name) < 3:
                    parts = href.strip('/').split('/')
                    name = parts[-1].replace('-', ' ').title() if parts else ""

                if not name or len(name) < 3:
                    continue

                skip = ['color', 'silestone', 'menu', 'nav', 'about', 'contact', 'find', 'where']
                if any(s == name.lower() for s in skip):
                    continue

                url = href if href.startswith('http') else f"https://www.cosentino.com{href}"

                img = link.select_one('img')
                if not img:
                    parent = link.parent
                    img = parent.select_one('img') if parent else None

                img_url = ""
                if img:
                    img_url = img.get('src') or img.get('data-src') or ""

                products.append(Product(
                    name=name,
                    vendor='silestone',
                    material_type='quartz',
                    image_url=img_url,
                    product_url=url,
                    color_family=get_color_family(name),
                    description="Silestone Quartz by Cosentino"
                ))

            logger.info(f"  Silestone: {len(products)} products found")

        except Exception as e:
            logger.error(f"  Silestone error: {e}")

        return products

    def scrape_caesarstone(self) -> List[Product]:
        """Scrape Caesarstone colors"""
        products = []
        logger.info("Scraping Caesarstone...")

        try:
            self.driver.get("https://www.caesarstoneus.com/countertops/")
            time.sleep(5)

            self.scroll_page()

            soup = BeautifulSoup(self.driver.page_source, 'html.parser')

            # Look for product links matching pattern /countertops/CODE-name/
            links = soup.select('a[href*="/countertops/"]')
            logger.info(f"  Found {len(links)} countertop links")

            seen = set()
            for link in links:
                href = link.get('href', '')
                if not href or href in seen:
                    continue

                # Must match pattern like /countertops/5000-london-grey/
                match = re.search(r'/countertops/(\d+)-([^/]+)/?$', href)
                if not match:
                    continue

                seen.add(href)

                sku = match.group(1)
                name_slug = match.group(2)
                name = name_slug.replace('-', ' ').title()

                url = href if href.startswith('http') else f"https://www.caesarstoneus.com{href}"

                img = link.select_one('img')
                img_url = ""
                if img:
                    img_url = img.get('src') or img.get('data-src') or ""

                products.append(Product(
                    name=name,
                    vendor='caesarstone',
                    material_type='quartz',
                    image_url=img_url,
                    product_url=url,
                    color_family=get_color_family(name),
                    sku=sku,
                    description="Caesarstone Quartz"
                ))

            logger.info(f"  Caesarstone: {len(products)} products found")

        except Exception as e:
            logger.error(f"  Caesarstone error: {e}")

        return products

    def scrape_arizona_tile(self) -> List[Product]:
        """Scrape Arizona Tile slabs"""
        products = []
        logger.info("Scraping Arizona Tile...")

        categories = [
            ('https://www.arizonatile.com/products/slab/della-terra-quartz/', 'quartz'),
            ('https://www.arizonatile.com/products/slab/granite-slab/', 'granite'),
            ('https://www.arizonatile.com/products/slab/marble-slab/', 'marble'),
            ('https://www.arizonatile.com/products/slab/quartzite/', 'quartzite'),
        ]

        for url, material in categories:
            try:
                self.driver.get(url)
                time.sleep(4)
                self.scroll_page(pause=1, max_scrolls=5)

                soup = BeautifulSoup(self.driver.page_source, 'html.parser')

                # Look for product links
                links = soup.select('a[href*="/products/slab/"]')
                logger.info(f"  {material}: Found {len(links)} links")

                seen = set()
                for link in links:
                    href = link.get('href', '')
                    if not href or href in seen or href.rstrip('/') == url.rstrip('/'):
                        continue

                    # Must be a specific product, not category
                    parts = href.strip('/').split('/')
                    if len(parts) < 4:
                        continue

                    seen.add(href)

                    name = link.get_text(strip=True)
                    if not name or len(name) < 3:
                        name = parts[-1].replace('-', ' ').title()

                    if not name or len(name) < 3:
                        continue

                    product_url = href if href.startswith('http') else f"https://www.arizonatile.com{href}"

                    img = link.select_one('img')
                    if not img:
                        parent = link.parent
                        img = parent.select_one('img') if parent else None

                    img_url = ""
                    if img:
                        img_url = img.get('src') or img.get('data-src') or ""
                        if img_url and not img_url.startswith('http'):
                            img_url = f"https://www.arizonatile.com{img_url}"

                    products.append(Product(
                        name=name,
                        vendor='arizona-tile',
                        material_type=material,
                        image_url=img_url,
                        product_url=product_url,
                        color_family=get_color_family(name),
                        description=f"Arizona Tile {material.title()}"
                    ))

            except Exception as e:
                logger.error(f"  Arizona Tile {material} error: {e}")

        logger.info(f"  Arizona Tile: {len(products)} total products")
        return products

    def scrape_daltile(self) -> List[Product]:
        """Scrape Daltile ONE Quartz"""
        products = []
        logger.info("Scraping Daltile...")

        try:
            self.driver.get("https://www.daltile.com/countertops-product-category/one-quartz-surfaces")
            time.sleep(5)

            self.scroll_page()

            soup = BeautifulSoup(self.driver.page_source, 'html.parser')

            # Look for color swatches/links
            links = soup.select('a[href*="/products/"], a[href*="/color/"]')
            logger.info(f"  Found {len(links)} product links")

            seen = set()
            for link in links:
                href = link.get('href', '')
                if not href or href in seen:
                    continue

                seen.add(href)

                name = link.get('title') or link.get_text(strip=True)
                if not name or len(name) < 3:
                    continue

                # Skip navigation
                skip = ['explore', 'view', 'see all', 'shop', 'filter', 'sort']
                if any(s in name.lower() for s in skip):
                    continue

                url = href if href.startswith('http') else f"https://www.daltile.com{href}"

                img = link.select_one('img')
                img_url = ""
                if img:
                    img_url = img.get('src') or img.get('data-src') or ""

                products.append(Product(
                    name=name,
                    vendor='daltile',
                    material_type='quartz',
                    image_url=img_url,
                    product_url=url,
                    color_family=get_color_family(name),
                    description="Daltile ONE Quartz Surfaces"
                ))

            logger.info(f"  Daltile: {len(products)} products found")

        except Exception as e:
            logger.error(f"  Daltile error: {e}")

        return products


def main():
    print("="*60)
    print("SELENIUM VENDOR SCRAPER")
    print("="*60)

    all_products = []
    scraper = None

    try:
        scraper = VendorScraper(headless=True)

        # Scrape each vendor
        all_products.extend(scraper.scrape_cambria())
        all_products.extend(scraper.scrape_silestone())
        all_products.extend(scraper.scrape_caesarstone())
        all_products.extend(scraper.scrape_arizona_tile())
        all_products.extend(scraper.scrape_daltile())

    except Exception as e:
        logger.error(f"Scraper error: {e}")
    finally:
        if scraper:
            scraper.close()

    # Save results
    if all_products:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = OUTPUT_DIR / f'selenium_products_{timestamp}.json'

        data = {
            'generated': datetime.now().isoformat(),
            'count': len(all_products),
            'items': [asdict(p) for p in all_products]
        }

        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)

        print(f"\nSaved {len(all_products)} products to: {output_file}")

    # Summary
    print("\n" + "="*60)
    print("SCRAPE COMPLETE")
    print("="*60)

    by_vendor = {}
    for p in all_products:
        by_vendor.setdefault(p.vendor, []).append(p)

    for vendor, prods in sorted(by_vendor.items()):
        with_img = sum(1 for p in prods if p.image_url)
        print(f"  {vendor}: {len(prods)} products ({with_img} with images)")

    print(f"\nTotal: {len(all_products)} products")


if __name__ == '__main__':
    main()
