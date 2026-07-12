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

def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')

def load_sitemap_map():
    """Map each AZ Tile product URL's last path segment -> full URL, so products
    that carry no vendor_url in our catalog can still be resolved to their page."""
    try:
        xml = subprocess.check_output(['curl', '-s', 'https://www.arizonatile.com/product-sitemap.xml']).decode()
    except Exception:
        return {}
    m = {}
    for u in re.findall(r'<loc>([^<]+)</loc>', xml):
        seg = u.rstrip('/').split('/')[-1]
        m.setdefault(seg, u)
    return m

def resolve_url(p, smap):
    if p.get('vendor_url'):
        return p['vendor_url']
    for cand in (p.get('slug'), slugify(p.get('name'))):
        if cand and cand in smap:
            return smap[cand]
    return None

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
    ap.add_argument('--cap', type=int, default=10, help='max images proposed per product')
    args = ap.parse_args()

    log("Loading Arizona Tile products from live catalog...")
    prods = get_aztile_products()
    log("Loading AZ Tile product sitemap for URL resolution...")
    smap = load_sitemap_map()
    log(f"  sitemap URLs: {len(smap)}")

    one_img = [p for p in prods if len(p.get('image_urls') or []) <= 1]
    targets = []
    unresolved = 0
    for p in one_img:
        u = resolve_url(p, smap)
        if u:
            p['_url'] = u
            targets.append(p)
        else:
            unresolved += 1
    log(f"AZ Tile total={len(prods)} | one-image={len(one_img)} | reachable={len(targets)} | unresolved={unresolved}")
    if not args.all:
        targets = targets[:args.sample]
    log(f"Scraping {len(targets)} product pages (headless Chrome, cap {args.cap}/product)...")

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
        name = p.get('name'); url = p.get('_url') or p.get('vendor_url')
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
    def cell(u, tag=''):
        return f'<figure><img src="{u}" loading="lazy" alt=""><figcaption>{tag}</figcaption></figure>'
    cards = []
    for r in results:
        cur = cell(r['current'], 'current') if r['current'] else '<div class="none">no current image</div>'
        prop = ''.join(cell(u, u.split("/content/")[-1].split("?")[0].split("/")[-1][:22]) for u in r['proposed']) or '<div class="none">none found</div>'
        cards.append(f'''<section class="card">
      <h2>{r["name"]} <span class="cnt">+{len(r["proposed"])}</span> <a href="{r["vendor_url"]}" target="_blank">source ↗</a></h2>
      <div class="grid"><div class="cur">{cur}</div><div class="prop">{prop}</div></div>
    </section>''')
    total = sum(len(r['proposed']) for r in results)
    html = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AZ Tile image review</title><style>
:root{{--navy:#16222e;--gold:#f9cb00;--line:#e2e6ea;--ink:#1b2530;--mut:#6b7680}}
*{{box-sizing:border-box}}body{{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f2f3f5;color:var(--ink)}}
header{{position:sticky;top:0;background:var(--navy);color:#fff;padding:16px 22px;z-index:5}}
header h1{{margin:0;font-size:19px}}header p{{margin:4px 0 0;color:#b9c4cd;font-size:13px}}
.wrap{{max-width:1200px;margin:0 auto;padding:20px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}}
.card h2{{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:10px}}
.cnt{{background:var(--gold);color:var(--navy);font-size:12px;font-weight:800;padding:2px 9px;border-radius:20px}}
.card h2 a{{margin-left:auto;font-size:12px;color:var(--mut);text-decoration:none}}
.grid{{display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:start}}
.cur figure{{margin:0}}.cur img{{width:100%;border-radius:9px;border:2px solid var(--navy)}}
.prop{{display:flex;flex-wrap:wrap;gap:10px}}
figure{{margin:0;width:150px}}figure img{{width:150px;height:150px;object-fit:cover;border-radius:9px;border:1px solid var(--line);background:#eee}}
figcaption{{font-size:10px;color:var(--mut);margin-top:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.none{{color:var(--mut);font-size:13px;padding:20px}}
@media(max-width:640px){{.grid{{grid-template-columns:1fr}}}}
</style></head><body>
<header><h1>Arizona Tile — image enrichment dry run</h1><p>{len(results)} products · {total} proposed images · navy-bordered = current, right = proposed to add · nothing written to the live catalog yet</p></header>
<div class="wrap">{''.join(cards)}</div></body></html>'''
    (OUT_DIR / 'aztile-image-review.html').write_text(html)

if __name__ == '__main__':
    main()
