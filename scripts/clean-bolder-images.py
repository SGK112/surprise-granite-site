#!/usr/bin/env python3
"""
Clean up Bolder Image Stone catalog images.

Prior Bolder data is contaminated: galleries include the Bolder LOGO
(cropped-TagBolderImage) and OTHER colours' photos (Black Galaxy, Cristallus
appearing under BST151, etc.). Bolder names its real slab files by colour, so
we keep ONLY images whose filename matches THIS product's colour name (letter-
boundary match, so "Amazon" != "Amazonia"), drop logos, drop images that name a
DIFFERENT Bolder colour, and keep an unnamed primary only as a last resort.

Rewrites primary_image_url + image_urls. Backs up both first. --dry-run default.

Usage:
  python3 clean-bolder-images.py              # dry run
  python3 clean-bolder-images.py --write
"""
import json, re, sys, subprocess, argparse
from pathlib import Path

API = "https://surprise-granite-email-api.onrender.com/api/catalog"
SCRIPT_DIR = Path(__file__).parent
BACKUP = Path.home() / "sg-backups" / "bolder-images-backup.tsv"
LOGO = re.compile(r'logo|tagbolderimage|cropped-|watermark|/icon|-icon', re.I)

def db_url():
    for line in (SCRIPT_DIR.parent / ".env.local").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no DATABASE_URL")
DB = db_url()

def fname(u): return (u or '').rsplit('/', 1)[-1].lower()

def name_rx(name):
    toks = [t for t in re.split(r'\s+', (name or '').strip()) if t]
    if not toks: return None
    pat = r'[-_. ]?'.join(re.escape(t) for t in toks)
    return re.compile(r'(?<![a-z0-9])' + pat + r'(?![a-z0-9])', re.I)

def get_bolder():
    prods = []
    for off in range(0, 2600, 250):
        d = json.loads(subprocess.check_output(['curl', '-s', f'{API}?category=slab&limit=250&offset={off}']))
        rows = d.get('products', [])
        if not rows: break
        for p in rows:
            if 'bolder' in ((p.get('vendor') or '') + (p.get('vendor_id') or '') + (p.get('brand') or '')).lower():
                prods.append(p)
    return prods

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--write', action='store_true'); args = ap.parse_args()
    prods = get_bolder()
    rxs = {p['slug']: name_rx(p.get('name')) for p in prods if p.get('slug')}
    all_rx = [(p['slug'], rxs[p['slug']]) for p in prods if p.get('slug') and rxs.get(p['slug'])]
    print(f"Bolder products: {len(prods)}")

    plans, removed_logo, removed_cross = [], 0, 0
    for p in prods:
        slug = p.get('slug'); me = rxs.get(slug)
        if not slug: continue
        primary = p.get('primary_image_url') or ''
        cands = []
        for u in [primary] + (p.get('image_urls') or []):
            if u and u not in cands: cands.append(u)
        keep = []
        for u in cands:
            f = fname(u)
            if LOGO.search(u): removed_logo += 1; continue
            if me and me.search(f): keep.append(u); continue
            # names another Bolder colour? contamination -> drop
            if any(slug2 != slug and rx.search(f) for slug2, rx in all_rx):
                removed_cross += 1; continue
            # unnamed, not a logo: keep only if it is the current primary (its hero)
            if u == primary: keep.append(u)
        if not keep and primary and not LOGO.search(primary):
            keep = [primary]
        old = [primary] + (p.get('image_urls') or [])
        if keep != cands:   # something changed
            plans.append({'slug': slug, 'name': p.get('name'), 'old': cands, 'new': keep,
                          'old_primary': primary, 'new_primary': keep[0] if keep else primary})

    print(f"products to fix: {len(plans)} | logo images removed: {removed_logo} | cross-colour removed: {removed_cross}")
    if not plans: return
    if not args.write:
        print("\n[DRY RUN] sample:")
        for pl in plans[:8]:
            print(f"  {pl['name']}: {len(pl['old'])} -> {len(pl['new'])} imgs" +
                  ("  [primary changed]" if pl['old_primary'] != pl['new_primary'] else ""))
        print(f"\nRun --write to back up + commit fixes to {len(plans)} products.")
        return

    BACKUP.parent.mkdir(exist_ok=True)
    with open(BACKUP, 'w') as f:
        f.write("slug\tprimary_image_url\timage_urls_json\n")
        for pl in plans:
            f.write(f"{pl['slug']}\t{pl['old_primary']}\t{json.dumps(pl['old'][1:])}\n")
    print(f"backup: {BACKUP} ({len(plans)} rows)")

    def lit(u): return f"$img${u}$img$"
    stmts = ["BEGIN;"]
    for pl in plans:
        arr = "ARRAY[" + ",".join(lit(u) for u in pl['new']) + "]::text[]"
        s = pl['slug'].replace("'", "''")
        stmts.append(f"UPDATE catalog_products SET primary_image_url={lit(pl['new_primary'])}, "
                     f"image_urls={arr}, updated_at=now() WHERE category='slab' AND slug='{s}';")
    stmts.append("COMMIT;")
    sqlf = SCRIPT_DIR / "scraper-output" / "bolder-clean.sql"
    sqlf.parent.mkdir(exist_ok=True); sqlf.write_text("\n".join(stmts))
    res = subprocess.run(["psql", DB, "-v", "ON_ERROR_STOP=1", "-f", str(sqlf)], capture_output=True, text=True)
    sys.stdout.write(res.stdout[-400:])
    if res.returncode: sys.stderr.write(res.stderr); raise SystemExit("WRITE FAILED (rolled back)")
    print(f"DONE: cleaned {len(plans)} Bolder products.")

if __name__ == '__main__':
    main()
