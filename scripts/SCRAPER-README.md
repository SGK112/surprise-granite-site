# Inventory Scraper Tools

Tools for scraping vendor websites to keep your stone, tile, and flooring inventory up-to-date.

## Quick Start

```bash
# Install dependencies
cd scripts
pip install -r requirements-scraper.txt

# Run basic scraper (all vendors)
python inventory-scraper.py --vendor all

# Run with Selenium for JavaScript sites
python vendor-api-scraper.py --vendor cambria

# Dry run (no file changes)
python inventory-scraper.py --dry-run
```

## Available Scripts

### 1. `inventory-scraper.py` - Basic HTML Scraper
Best for sites with server-rendered HTML.

```bash
# Scrape specific vendor
python inventory-scraper.py --vendor msi
python inventory-scraper.py --vendor arizona-tile
python inventory-scraper.py --vendor daltile

# Scrape all vendors
python inventory-scraper.py --vendor all

# Custom output directory
python inventory-scraper.py --vendor all --output ./my-output
```

**Supported Vendors:**
- `msi` - MSI Surfaces
- `arizona-tile` - Arizona Tile
- `daltile` - Daltile
- `cambria` - Cambria
- `caesarstone` - Caesarstone
- `silestone` - Silestone

### 2. `vendor-api-scraper.py` - API & Selenium Scraper
Best for JavaScript-heavy sites and API-based vendors.

```bash
# Scrape with browser automation
python vendor-api-scraper.py --vendor cambria

# Run in headless mode (default)
python vendor-api-scraper.py --vendor all --headless

# Run with visible browser (for debugging)
python vendor-api-scraper.py --vendor cambria --no-headless
```

## Output Files

All output goes to `scripts/scraper-output/`:

```
scraper-output/
├── inventory_report_20260202_143022.md    # Comparison report
├── scraped_products_20260202_143022.json  # All scraped products
├── new_products_20260202_143022.json      # Only new products
├── msi_products_20260202_143022.json      # Vendor-specific output
└── msi_report_20260202_143022.md          # Vendor-specific report
```

## Report Contents

Each report includes:

1. **Summary Stats**
   - Total products scraped
   - Products in existing inventory
   - New products found
   - Potentially discontinued items

2. **New Products List**
   - Product name
   - Material type
   - Color family
   - Vendor

3. **Discontinued Products**
   - Items in your inventory but not found online
   - May need manual verification

## Updating Your Inventory

After running the scraper:

1. **Review the Report**
   ```bash
   cat scraper-output/inventory_report_*.md
   ```

2. **Import New Products**
   - Check `new_products_*.json` for items to add
   - Verify images and details before importing

3. **Handle Discontinued Items**
   - Review the discontinued list manually
   - Some may be temporarily out of stock
   - Mark truly discontinued items as unavailable

4. **Update Data Files**
   ```bash
   # The new data can be merged into your existing files:
   # - data/site-search.json
   # - data/countertops.json
   # - data/slabs.json
   ```

## Extending the Scrapers

To add a new vendor:

```python
class NewVendorScraper(BaseScraper):
    vendor_name = "new-vendor"
    base_url = "https://www.newvendor.com"

    def scrape(self) -> List[Product]:
        # Implement scraping logic
        products = []

        # Fetch product listing page
        soup = self.fetch_page(f"{self.base_url}/products")

        # Parse products
        for card in soup.select('.product-card'):
            name = card.select_one('.name').text
            # ... extract other fields

            product = Product(
                id="",
                name=name,
                vendor=self.vendor_name,
                material_type="quartz",
                # ... other fields
            )
            products.append(product)

        return products
```

## Scheduling Automated Scrapes

### Using Cron (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Run weekly on Sunday at 2 AM
0 2 * * 0 cd /path/to/scripts && python inventory-scraper.py --vendor all >> /var/log/inventory-scrape.log 2>&1
```

### Using Task Scheduler (Windows)

Create a scheduled task to run:
```
python C:\path\to\scripts\inventory-scraper.py --vendor all
```

## Troubleshooting

### No products found
- Website structure may have changed
- Check the CSS selectors in the scraper
- Try running with `--verbose` flag

### Selenium issues
```bash
# Install/update Chrome driver
pip install --upgrade webdriver-manager

# Check Chrome version
google-chrome --version
```

### Rate limiting
- Increase `REQUEST_DELAY` in the script
- Some sites may block rapid requests
- Consider running during off-peak hours

### Missing images
- Some sites lazy-load images
- Selenium scraper handles this better
- Check for `data-src` attributes

## Data Structure

Scraped products follow this format:

```json
{
  "id": "msi-surfaces-calacatta-abezzo",
  "name": "Calacatta Abezzo",
  "vendor": "msi-surfaces",
  "material_type": "quartz",
  "color_family": "white",
  "description": "Premium quartz surface",
  "image_url": "https://...",
  "product_url": "https://...",
  "sku": "Q1234",
  "available": true,
  "last_updated": "2026-02-02T14:30:22"
}
```

## Contact

For issues with these scripts, contact the development team or check the repository issues.
