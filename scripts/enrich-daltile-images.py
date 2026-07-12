#!/usr/bin/env python3
"""
Daltile image-enrichment (dry-run by default) — sibling of enrich-aztile-images.py.

Daltile renders its product images through a Scene7 viewer, but the underlying
asset filenames appear in the page DOM on digitalassets.daltile.com and each
carries the product's code (e.g. OQ58). We keep only assets bearing this
product's code (so related-product images are excluded), serve them full-res
via Scene7 (?wid=1600), dedup near-identical slab renditions, and propose them.

Writes an HTML review gallery + daltile-proposal.json. No DB writes.

Usage:
    python3 enrich-daltile-images.py --sample 8
    python3 enrich-daltile-images.py --all
"""
import json, re, subprocess, time, argparse
from pathlib import Path

API = "https://surprise-granite-email-api.onrender.com/api/catalog"
OUT_DIR = Path("/private/tmp/claude-501/-Users-homepc-surprise-granite-site/0031dbae-5b81-4f02-bafc-809773cd7533/scratchpad")
SCENE7 = "https://s7d9.scene7.com/is/image/daltile/{}?wid=1600"

def log(*a): print(*a, flush=True)

def get_products():
    prods = []
    for off in range(0, 2600, 250):
        d = json.loads(subprocess.check_output(['curl', '-s', f'{API}?category=slab&limit=250&offset={off}']))
        rows = d.get('products', [])
        if not rows: break
        for p in rows:
            if 'daltile' in ((p.get('vendor') or '') + ' ' + (p.get('brand') or '')).lower():
                prods.append(p)
    return prods

def product_code(p):
    """Second token of the Scene7 asset id in the primary image, e.g.
    DAL_OQ58_Armor_Grey... -> OQ58, PAN_CM85_Anthracite... -> CM85."""
    prim = p.get('primary_image_url') or ''
    m = re.search(r'/daltile/[A-Za-z]+_([A-Z0-9]{2,7})_', prim)
    return m.group(1) if m else None

def dedup_key(fname):
    """Collapse renditions of the same photo (drop size/variant tokens, keep the
    _01/_02 sequence numbers that distinguish different photos)."""
    k = re.sub(r'_(zoom_\d+|\d{3,4}|32|v\d+|web\d?|CU\d+)', '', fname, flags=re.I)
    return k.lower()

# nav chrome / icons / swatches that are never a product gallery image
JUNK_RX = re.compile(r'(_nav_|_icon|icon_|_swatch|_thumb|shape_|logo)', re.I)

def name_variants(name):
    n = (name or '').strip()
    return {v.lower() for v in (n.replace(' ', ''), n.replace(' ', '_')) if len(v) >= 4}

def scrape(driver, url, code, name, other_names):
    driver.get(url)
    time.sleep(3)
    for y in range(0, 2600, 500):
        driver.execute_script(f"window.scrollTo(0,{y})"); time.sleep(0.4)
    time.sleep(1.5)
    src = driver.page_source
    # Collect candidate asset ids from BOTH hosts Daltile uses.
    ids = set(re.findall(r'scene7\.com/is/image/daltile/([A-Za-z0-9_]+)', src))
    for m in re.finditer(r'digitalassets\.daltile\.com/[^"\'\s]+?\.jpg', src):
        ids.add(m.group(0).rsplit('/', 1)[-1][:-4])
    mine = name_variants(name)
    others = other_names - mine        # every OTHER product's name token
    toks = [t.lower() for t in (set([code]) | mine) if t]
    found = {}
    for i in ids:
        il = i.lower().replace('_', '')
        raw = i.lower()
        if JUNK_RX.search(raw):
            continue
        if not any(t.replace('_', '') in il or t in raw for t in toks):
            continue
        # Reject cross-labeled assets: filename names a DIFFERENT product
        # (guards against a shared code pulling the wrong colour's photo).
        if any(o.replace('_', '') in il for o in others):
            continue
        key = dedup_key(i)
        if key not in found or len(i) > len(found[key]):
            found[key] = i
    return [SCENE7.format(i) for i in found.values()]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', type=int, default=8)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--cap', type=int, default=8)
    args = ap.parse_args()

    prods = get_products()
    all_names = set()
    for p in prods:
        all_names |= name_variants(p.get('name'))
    targets = [p for p in prods if len(p.get('image_urls') or []) <= 1 and p.get('vendor_url')]
    log(f"Daltile total={len(prods)} | one-image w/ vendor_url={len(targets)}")
    if not args.all:
        targets = targets[:args.sample]
    log(f"Scraping {len(targets)} pages (cap {args.cap})...")

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
    opts = Options()
    for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,3000', '--disable-dev-shm-usage']:
        opts.add_argument(a)
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    driver.set_page_load_timeout(60)

    results = []
    for i, p in enumerate(targets, 1):
        code = product_code(p)
        try:
            imgs = scrape(driver, p['vendor_url'], code, p.get('name') or '', all_names)[:args.cap]
        except Exception as e:
            log(f"  [{i}] {p.get('name')}: ERROR {type(e).__name__}"); imgs = []
        # exclude any that dedup to the current primary
        cur = p.get('primary_image_url') or ''
        cur_id = cur.split('/daltile/')[-1].split('?')[0] if '/daltile/' in cur else ''
        cur_key = dedup_key(cur_id)
        proposed = [u for u in imgs if dedup_key(u.split('/daltile/')[-1].split('?')[0]) != cur_key]
        results.append({'name': p.get('name'), 'slug': p.get('slug'), 'vendor_url': p['vendor_url'],
                        'current': cur, 'proposed': proposed})
        log(f"  [{i}/{len(targets)}] {p.get('name')} ({code}): {len(proposed)} new")
    driver.quit()

    (OUT_DIR / 'daltile-proposal.json').write_text(json.dumps(results, indent=2))
    write_gallery(results)
    tot = sum(len(r['proposed']) for r in results)
    log(f"\nDONE. {tot} images proposed across {len(results)} products.")
    log(f"Report: {OUT_DIR/'daltile-image-review.html'}")

def write_gallery(results):
    def cell(u, tag=''):
        return f'<figure><img src="{u}" loading="lazy" alt=""><figcaption>{tag}</figcaption></figure>'
    cards = []
    for r in results:
        cur = cell(r['current'], 'current') if r['current'] else '<div class="none">no current image</div>'
        prop = ''.join(cell(u, u.split("/daltile/")[-1].split("?")[0][:24]) for u in r['proposed']) or '<div class="none">none found</div>'
        cards.append(f'''<section class="card"><h2>{r["name"]} <span class="cnt">+{len(r["proposed"])}</span> <a href="{r["vendor_url"]}" target="_blank">source ↗</a></h2>
      <div class="grid"><div class="cur">{cur}</div><div class="prop">{prop}</div></div></section>''')
    total = sum(len(r['proposed']) for r in results)
    html = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daltile image review</title><style>
:root{{--navy:#16222e;--gold:#f9cb00;--line:#e2e6ea;--ink:#1b2530;--mut:#6b7680}}
*{{box-sizing:border-box}}body{{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f2f3f5;color:var(--ink)}}
header{{position:sticky;top:0;background:var(--navy);color:#fff;padding:16px 22px;z-index:5}}header h1{{margin:0;font-size:19px}}header p{{margin:4px 0 0;color:#b9c4cd;font-size:13px}}
.wrap{{max-width:1200px;margin:0 auto;padding:20px}}.card{{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}}
.card h2{{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:10px}}.cnt{{background:var(--gold);color:var(--navy);font-size:12px;font-weight:800;padding:2px 9px;border-radius:20px}}
.card h2 a{{margin-left:auto;font-size:12px;color:var(--mut);text-decoration:none}}
.grid{{display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:start}}.cur img{{width:100%;border-radius:9px;border:2px solid var(--navy)}}
.prop{{display:flex;flex-wrap:wrap;gap:10px}}figure{{margin:0;width:150px}}figure img{{width:150px;height:150px;object-fit:cover;border-radius:9px;border:1px solid var(--line);background:#eee}}
figcaption{{font-size:10px;color:var(--mut);margin-top:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}.none{{color:var(--mut);font-size:13px;padding:20px}}
@media(max-width:640px){{.grid{{grid-template-columns:1fr}}}}</style></head><body>
<header><h1>Daltile — image enrichment dry run</h1><p>{len(results)} products · {total} proposed images · navy-bordered = current · nothing written yet</p></header>
<div class="wrap">{''.join(cards)}</div></body></html>'''
    (OUT_DIR / 'daltile-image-review.html').write_text(html)

if __name__ == '__main__':
    main()
