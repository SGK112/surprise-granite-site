#!/usr/bin/env python3
"""
Caesarstone image-enrichment (dry-run by default).

Caesarstone product pages are server-rendered (no Selenium needed). Each page
embeds the product's own images on caesarstoneus.com/wp-content/uploads/, named
with the product CODE (e.g. 4044) and name (Airy-Concrete), incl. kitchen
renders. WordPress emits many resized variants per photo (-1024x682 etc.) —
we dedup to one best (largest/original) per distinct photo.

Match by code OR name; reject any asset naming a DIFFERENT catalog product.
Missing vendor_urls are derived as /countertops/<code>-<name-slug>/.

Writes daltile-style HTML review + caesarstone-proposal.json. No DB writes.
"""
import json, re, subprocess, argparse
from pathlib import Path

API = "https://surprise-granite-email-api.onrender.com/api/catalog"
OUT_DIR = Path("/private/tmp/claude-501/-Users-homepc-surprise-granite-site/0031dbae-5b81-4f02-bafc-809773cd7533/scratchpad")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"

def log(*a): print(*a, flush=True)

def get_products():
    prods = []
    for off in range(0, 2600, 250):
        d = json.loads(subprocess.check_output(['curl', '-s', f'{API}?category=slab&limit=250&offset={off}']))
        rows = d.get('products', [])
        if not rows: break
        for p in rows:
            if 'caesarstone' in ((p.get('vendor') or '') + ' ' + (p.get('brand') or '')).lower():
                prods.append(p)
    return prods

def slugify(s): return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')

def product_code(p):
    fn = (p.get('primary_image_url') or '').rsplit('/', 1)[-1]
    m = re.match(r'(\d{2,4})[_-]', fn)
    return m.group(1) if m else None

def resolve_url(p):
    if p.get('vendor_url'): return p['vendor_url']
    code, slug = product_code(p), slugify(p.get('name'))
    return f"https://www.caesarstoneus.com/countertops/{code}-{slug}/" if code and slug else None

def name_variants(name):
    n = (name or '').strip()
    return {v.lower() for v in (n.replace(' ', ''), n.replace(' ', '-'), n.replace(' ', '_')) if len(v) >= 4}

def wp_base(u):
    """Photo identity: strip WP -WxH resizes + embedded size tokens."""
    fn = u.rsplit('/', 1)[-1]
    fn = re.sub(r'-\d+x\d+(?=\.\w+$)', '', fn)
    fn = re.sub(r'\.(jpg|jpeg|png|webp)$', '', fn, flags=re.I)
    fn = re.sub(r'_jpg$', '', fn)
    fn = re.sub(r'_\d{3,4}[_x]\d{3,4}px?', '', fn)
    fn = re.sub(r'_\d{3,4}px', '', fn)
    return fn.lower()

def width_of(u):
    m = re.search(r'-(\d+)x\d+\.\w+$', u)
    return int(m.group(1)) if m else 99999   # no suffix = original = biggest

def strip_resize(u):
    """WP always keeps the un-suffixed original at full res; the -WxH copies are
    downscales. Serve the original (lowercase-x suffix only; an in-name 1920X1080
    uses uppercase X and is left intact)."""
    return re.sub(r'-\d+x\d+(?=\.\w+$)', '', u)

JUNK_RX = re.compile(r'(logo|icon|sprite|placeholder|-150x150|swatch-)', re.I)

def scrape(url, code, name, others):
    try:
        html = subprocess.check_output(['curl', '-s', '-A', UA, url], timeout=30).decode('utf-8', 'ignore')
    except Exception:
        return []
    urls = re.findall(r'https://www\.caesarstoneus\.com/wp-content/uploads/[^"\'\s)]+?\.(?:jpg|jpeg|png|webp)', html)
    toks = [t for t in ([code.lower()] if code else []) + list(name_variants(name))]
    groups = {}
    for u in set(urls):
        ul = u.lower()
        if JUNK_RX.search(ul): continue
        if not any(t.replace('-', '').replace('_', '') in ul.replace('-', '').replace('_', '') for t in toks):
            continue
        if any(o.replace('-', '').replace('_', '') in ul.replace('-', '').replace('_', '') for o in others):
            continue
        b = wp_base(u)
        # keep the widest representative of each distinct photo
        if b not in groups or width_of(u) > width_of(groups[b]):
            groups[b] = u
    # serve full-res originals, dedup again in case resizes collapse together
    out = []
    for u in groups.values():
        o = strip_resize(u)
        if o not in out:
            out.append(o)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', type=int, default=10)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--cap', type=int, default=8)
    args = ap.parse_args()

    prods = get_products()
    all_names = set()
    for p in prods: all_names |= name_variants(p.get('name'))
    one = [p for p in prods if len(p.get('image_urls') or []) <= 1]
    targets, unresolved = [], 0
    for p in one:
        u = resolve_url(p)
        if u: p['_url'] = u; targets.append(p)
        else: unresolved += 1
    log(f"Caesarstone total={len(prods)} | one-image={len(one)} | reachable={len(targets)} | unresolved={unresolved}")
    if not args.all: targets = targets[:args.sample]
    log(f"Fetching {len(targets)} pages (plain HTTP)...")

    results = []
    for i, p in enumerate(targets, 1):
        code = product_code(p)
        mine = name_variants(p.get('name'))
        imgs = scrape(p['_url'], code, p.get('name') or '', all_names - mine)[:args.cap]
        cur = p.get('primary_image_url') or ''
        cur_b = wp_base(cur) if cur else None
        proposed = [u for u in imgs if wp_base(u) != cur_b]
        results.append({'name': p.get('name'), 'slug': p.get('slug'), 'vendor_url': p['_url'],
                        'current': cur, 'proposed': proposed})
        log(f"  [{i}/{len(targets)}] {p.get('name')} ({code}): {len(proposed)} new")

    (OUT_DIR / 'caesarstone-proposal.json').write_text(json.dumps(results, indent=2))
    write_gallery(results)
    tot = sum(len(r['proposed']) for r in results)
    log(f"\nDONE. {tot} images across {len(results)} products. Report: {OUT_DIR/'caesarstone-image-review.html'}")

def write_gallery(results):
    def cell(u, tag=''): return f'<figure><img src="{u}" loading="lazy" alt=""><figcaption>{tag}</figcaption></figure>'
    cards = []
    for r in results:
        cur = cell(r['current'], 'current') if r['current'] else '<div class="none">no current</div>'
        prop = ''.join(cell(u, u.rsplit('/', 1)[-1][:24]) for u in r['proposed']) or '<div class="none">none</div>'
        cards.append(f'<section class="card"><h2>{r["name"]} <span class="cnt">+{len(r["proposed"])}</span> <a href="{r["vendor_url"]}" target="_blank">source ↗</a></h2><div class="grid"><div class="cur">{cur}</div><div class="prop">{prop}</div></div></section>')
    total = sum(len(r['proposed']) for r in results)
    html = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Caesarstone image review</title><style>
:root{{--navy:#16222e;--gold:#f9cb00;--line:#e2e6ea;--ink:#1b2530;--mut:#6b7680}}*{{box-sizing:border-box}}body{{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f2f3f5;color:var(--ink)}}
header{{position:sticky;top:0;background:var(--navy);color:#fff;padding:16px 22px;z-index:5}}header h1{{margin:0;font-size:19px}}header p{{margin:4px 0 0;color:#b9c4cd;font-size:13px}}
.wrap{{max-width:1200px;margin:0 auto;padding:20px}}.card{{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}}
.card h2{{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:10px}}.cnt{{background:var(--gold);color:var(--navy);font-size:12px;font-weight:800;padding:2px 9px;border-radius:20px}}.card h2 a{{margin-left:auto;font-size:12px;color:var(--mut);text-decoration:none}}
.grid{{display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:start}}.cur img{{width:100%;border-radius:9px;border:2px solid var(--navy)}}.prop{{display:flex;flex-wrap:wrap;gap:10px}}
figure{{margin:0;width:150px}}figure img{{width:150px;height:150px;object-fit:cover;border-radius:9px;border:1px solid var(--line);background:#eee}}figcaption{{font-size:10px;color:var(--mut);margin-top:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}.none{{color:var(--mut);font-size:13px;padding:20px}}
@media(max-width:640px){{.grid{{grid-template-columns:1fr}}}}</style></head><body>
<header><h1>Caesarstone — image enrichment dry run</h1><p>{len(results)} products · {total} proposed · navy-bordered = current · nothing written yet</p></header>
<div class="wrap">{''.join(cards)}</div></body></html>'''
    (OUT_DIR / 'caesarstone-image-review.html').write_text(html)

if __name__ == '__main__':
    main()
