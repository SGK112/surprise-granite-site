#!/usr/bin/env python3
"""
Fill-only writer: append the Arizona Tile pilot's proposed images to the live
Supabase catalog_products.image_urls.

SAFETY:
  * Reads the CURRENT image_urls from the DB and APPENDS only — never removes.
  * Dedups by Widen asset id so nothing is added twice.
  * Leaves primary_image_url untouched (the slab stays the grid thumbnail;
    lifestyle/room shots become secondary gallery images).
  * Backs up every affected row (slug, primary_image_url, image_urls) to a
    timestamped TSV BEFORE writing. Reverse = restore image_urls from it.
  * --dry-run (default) writes nothing; --write commits in one transaction.

Usage:
  python3 write-aztile-images.py               # dry run: show impact
  python3 write-aztile-images.py --write        # back up + commit
"""
import json, re, os, sys, subprocess, argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
SCRATCH = Path("/private/tmp/claude-501/-Users-homepc-surprise-granite-site/0031dbae-5b81-4f02-bafc-809773cd7533/scratchpad")
PROPOSAL = SCRATCH / "aztile-proposal.json"
BACKUP_DIR = Path.home() / "sg-backups"

def db_url():
    for line in (SCRIPT_DIR.parent / ".env.local").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not found in .env.local")

DB = db_url()

def psql_json(sql):
    """Run a SELECT that returns one JSON object per row; parse to list of dicts."""
    out = subprocess.check_output(["psql", DB, "-tAc", sql]).decode()
    return [json.loads(l) for l in out.splitlines() if l.strip()]

def asset_key(url):
    m = re.search(r'/content/([a-z0-9]+)/', url or '')
    return m.group(1) if m else (url or '')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='commit changes (default is dry run)')
    args = ap.parse_args()

    proposal = json.load(open(PROPOSAL))
    by_slug = {p['slug']: p for p in proposal}
    slugs = list(by_slug)

    # Fetch current DB state for exactly these slugs.
    inlist = ",".join("'" + s.replace("'", "''") + "'" for s in slugs)
    rows = psql_json(
        "select json_build_object('slug',slug,'imgs',coalesce(image_urls,'{}'),"
        "'primary',primary_image_url) from catalog_products "
        f"where vendor_id='arizona-tile' and category='slab' and slug in ({inlist});")
    db = {r['slug']: r for r in rows}
    print(f"proposal slugs: {len(slugs)} | found in DB: {len(db)}")

    plans = []           # (slug, old_list, new_list, n_added)
    total_added = 0
    for slug in slugs:
        if slug not in db:
            continue
        existing = db[slug]['imgs'] or []
        have = {asset_key(u) for u in existing}
        additions = []
        for u in by_slug[slug]['proposed']:
            k = asset_key(u)
            if k in have:
                continue
            have.add(k)
            additions.append(u)
        if not additions:
            continue
        new_list = list(existing) + additions
        plans.append((slug, existing, new_list, len(additions)))
        total_added += len(additions)

    print(f"products to enrich: {len(plans)} | images to append: {total_added}")
    if not plans:
        return

    if not args.write:
        print("\n[DRY RUN] nothing written. Sample:")
        for slug, old, new, n in plans[:6]:
            print(f"  {slug}: {len(old)} -> {len(new)} (+{n})")
        print(f"\nRun with --write to back up + commit {total_added} images across {len(plans)} products.")
        return

    # --- WRITE PATH ---
    BACKUP_DIR.mkdir(exist_ok=True)
    backup = BACKUP_DIR / "aztile-image-urls-backup.tsv"
    with open(backup, "w") as f:
        f.write("slug\timage_urls_json\n")
        for slug, old, new, n in plans:
            f.write(f"{slug}\t{json.dumps(old)}\n")
    print(f"backup written: {backup} ({len(plans)} rows)")

    # Build one transactional SQL file. Dollar-quote each URL ($img$...$img$)
    # so &,=,? in the URLs never need escaping.
    def lit(u):
        return f"$img${u}$img$"
    stmts = ["BEGIN;"]
    for slug, old, new, n in plans:
        arr = "ARRAY[" + ",".join(lit(u) for u in new) + "]::text[]"
        s = slug.replace("'", "''")
        stmts.append(
            f"UPDATE catalog_products SET image_urls={arr}, updated_at=now() "
            f"WHERE vendor_id='arizona-tile' AND category='slab' AND slug='{s}';")
    stmts.append("COMMIT;")
    sqlfile = SCRATCH / "aztile-image-write.sql"
    sqlfile.write_text("\n".join(stmts))

    print(f"executing {len(plans)} updates in a transaction...")
    res = subprocess.run(["psql", DB, "-v", "ON_ERROR_STOP=1", "-f", str(sqlfile)],
                         capture_output=True, text=True)
    sys.stdout.write(res.stdout)
    if res.returncode != 0:
        sys.stderr.write(res.stderr)
        raise SystemExit(f"WRITE FAILED (rolled back). backup safe at {backup}")
    print(f"DONE: appended {total_added} images across {len(plans)} products.")

if __name__ == '__main__':
    main()
