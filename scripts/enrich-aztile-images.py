#!/usr/bin/env python3
"""
Arizona Tile image-enrichment PILOT (dry-run by default).

For each Arizona Tile slab in the live catalog that has <=1 image, load its
Arizona Tile product page with headless Chrome, pull the product's own gallery
(hero slab shot + additional slab/room/install photos hosted on the Widen DAM),
quality-normalize + dedup them, and propose them as extra catalog images.

DRY RUN ONLY: writes an HTML review gallery + a JSON proposal. It never touches
the live Supabase catalog. A separate, reviewed step does the fill-only write.

Usage:
    python3 enrich-aztile-images.py --sample 12      # scrape 12 for review
    python3 enrich-aztile-images.py --all            # scrape all reachable
"""
import json, re, sys, subprocess, time, argparse
from pathlib import Path

API = "https://surprise-granite-email-api.onrender.com/api/catalog"
OUT_DIR = Path("/private/tmp/claude-501/-Users-homepc-surprise-granite-site/0031dbae-5b81-4f02-bafc-809773cd7533/scratchpad")

def log(*a): print(*a, flush=True)

def get_aztile_products():
    prods = []
    for off in range(0, 2600, 250):
        d = json.loads(subprocess.check_output(['curl', '-s', f'{API}?category=slab&limit=250&offset={off}']))
        rows = d.get('products', [])
        if not rows: break
        for p in rows:
            brand = ((p.get('vendor') or '') + ' ' + (p.get('brand') or '')).lower()
            if 'arizona' in brand:
                prods.append(p)
    return prods

def asset_id(url):
    m = re.search(r'/content/([a-z0-9]+)/', url)
    return m.group(1) if m else url

def clean_widen(url):
    """Full-res, aspect-preserving rendition (drop the 650px banner crop)."""
    base = url.split('?')[0]
    return base + '?w=1600&quality=90'

# Filenames that are brand/lifestyle boilerplate rather than THIS slab — reviewed by eye anyway.
JUNK_RX = re.compile(r'(logo|icon|placeholder|swatch-only|sprite)', re.I)

def scrape_gallery(driver, url):
    from selenium.webdriver.common.by import By
    driver.get(url)
    time.sleep(3.5)
    els = driver.find_elements(By.CSS_SELECTOR, '.woocommerce-product-gallery img')
    seen, out = set(), []
    for e in els:
        src = e.get_attribute('src') or ''
        if 'widen.net/content/' not in src: continue
        if JUNK_RX.search(src): continue
        aid = asset_id(src)
        if aid in seen: continue
        seen.add(aid)
        out.append(clean_widen(src))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', type=int, default=12)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--cap', type=int, default=6, help='max images proposed per product')
    args = ap.parse_args()

    log("Loading Arizona Tile products from live catalog...")
    prods = get_aztile_products()
    targets = [p for p in prods if len(p.get('image_urls') or []) <= 1 and p.get('vendor_url')]
    log(f"AZ Tile total={len(prods)} | one-image w/ vendor_url={len(targets)}")
    if not args.all:
        targets = targets[:args.sample]
    log(f"Scraping {len(targets)} product pages (headless Chrome)...")

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
    opts = Options()
    for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,2200', '--disable-dev-shm-usage']:
        opts.add_argument(a)
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    driver.set_page_load_timeout(50)

    results = []
    for i, p in enumerate(targets, 1):
        name = p.get('name'); url = p.get('vendor_url')
        try:
            imgs = scrape_gallery(driver, url)
        except Exception as e:
            log(f"  [{i}] {name}: ERROR {type(e).__name__}"); imgs = []
        current = p.get('primary_image_url') or ''
        # Propose gallery images that aren't the one we already have, capped.
        cur_id = asset_id(current) if current else None
        proposed = [u for u in imgs if asset_id(u) != cur_id][:args.cap]
        results.append({'name': name, 'slug': p.get('slug'), 'vendor_url': url,
                        'current': current, 'proposed': proposed})
        log(f"  [{i}/{len(targets)}] {name}: {len(proposed)} new images")
    driver.quit()

    (OUT_DIR / 'aztile-proposal.json').write_text(json.dumps(results, indent=2))
    write_gallery(results)
    tot = sum(len(r['proposed']) for r in results)
    log(f"\nDONE. {tot} images proposed across {len(results)} products.")
    log(f"Report: {OUT_DIR/'aztile-image-review.html'}")

def write_gallery(results):
    cards = []
    for r in results:
        cur = f'<img src="{r["current"]}" loading="lazy" alt="">' if r['current'] else '<div class="none">no current image</div>'
        prop = ''.join(f'<img src="{u}" loading="lazy" alt="">' for u in r['proposed']) or '<div class="none">— none found —</div>'
        cards.append(f'''<section class="card">
  <h2>{r["name"]} <a href="{r["vendor_url"]}" target="_blank" rel="noopener">source ↗</a></h2>
  <div class="row"><div class="col"><span class="lbl">Current (1)</span><div class="imgs cur">{cur}</div></div>
  <div class="col"><span class="lbl">Proposed to add ({len(r["proposed"])})</span><div class="imgs">{prop}</div></div></div>
</section>''')
    total = sum(len(r['proposed']) for r in results)
    html = f'''<h1>Arizona Tile — image enrichment dry run</h1>
<p class="sub">{len(results)} products · {total} proposed images · nothing written to the live catalog. Reject any product with wrong/low-quality images before we write.</p>
{''.join(cards)}'''
    (OUT_DIR / 'aztile-image-review.html').write_text(html)

if __name__ == '__main__':
    main()
