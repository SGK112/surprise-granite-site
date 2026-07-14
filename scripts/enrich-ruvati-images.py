#!/usr/bin/env python3
"""
Enrich sparse Ruvati product images from OUR Shopify store (Admin API) — matched
by SKU. Ruvati.com disabled /products.json, but our Shopify store has all 454
Ruvati products with ~5 images each. FILL-ONLY: append Shopify images the catalog
row doesn't already have (dedup by filename), keep the existing primary, cap ~8.

Usage:  python3 enrich-ruvati-images.py            # dry run
        python3 enrich-ruvati-images.py --write
"""
import json, re, sys, subprocess, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env.local"
BACKUP = Path.home() / "sg-backups" / "ruvati-image-urls-backup.tsv"
CAP = 8

def env(key):
    for l in ENV.read_text().splitlines():
        if l.startswith(key + "="):
            return l.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"missing {key} in .env.local")

DB = env("DATABASE_URL")
STORE = env("SHOPIFY_STORE")
if "." not in STORE:
    STORE += ".myshopify.com"
TOKEN = env("SHOPIFY_ADMIN_TOKEN")

def curl_json(url):
    out = subprocess.check_output(["curl", "-s", "-m", "40", url,
        "-H", f"X-Shopify-Access-Token: {TOKEN}"])
    return json.loads(out)

def sku_tok(s):
    m = re.search(r"([A-Za-z]{1,4}\d{3,6}[A-Za-z0-9-]*)", s or "")
    return (m.group(1).lower() if m else (s or "").lower().strip())

def base(u):  # dedup key: filename without size/version suffixes
    fn = u.split("/")[-1].split("?")[0].lower()
    fn = re.sub(r"-\d+x\d+", "", fn)
    fn = re.sub(r"-(scaled|\d+)(?=\.)", "", fn)
    return fn

# 1) Pull ALL Ruvati products from Shopify (since_id pagination)
print("Pulling Ruvati products from Shopify…")
sku_imgs = {}
since = 0
total = 0
while True:
    url = (f"https://{STORE}/admin/api/2024-10/products.json?vendor=Ruvati"
           f"&limit=250&since_id={since}&fields=id,variants,images")
    d = curl_json(url)
    ps = d.get("products", [])
    if not ps:
        break
    for p in ps:
        imgs = [im.get("src") for im in p.get("images", []) if im.get("src")]
        if not imgs:
            continue
        for v in p.get("variants", []):
            sk = v.get("sku")
            if sk:
                sku_imgs.setdefault(sku_tok(sk), imgs)
        since = max(since, p["id"])
        total += 1
    if len(ps) < 250:
        break
print(f"  {total} Shopify Ruvati products, {len(sku_imgs)} SKUs with images")

# 2) Read catalog Ruvati rows
rows = subprocess.check_output(["psql", DB, "-t", "-A", "-F", "\t", "-c",
    "select id, coalesce(sku,''), coalesce(primary_image_url,''), array_to_string(image_urls,'|') "
    "from catalog_products where (vendor_id ilike '%ruvati%' or brand ilike '%ruvati%') and active=true;"]).decode()

updates = []
enriched = added_total = 0
for line in rows.splitlines():
    parts = line.split("\t")
    if len(parts) < 4:
        continue
    _id, sku, prim, imgstr = parts[0], parts[1], parts[2], parts[3]
    cur = [u for u in imgstr.split("|") if u]
    shop = sku_imgs.get(sku_tok(sku))
    if not shop:
        continue
    have = {base(u) for u in cur}
    merged = list(cur)
    for u in shop:
        if base(u) not in have and len(merged) < CAP:
            merged.append(u); have.add(base(u))
    if len(merged) > len(cur):
        enriched += 1
        added_total += len(merged) - len(cur)
        updates.append((_id, sku, cur, merged))

print(f"\nRuvati rows to enrich: {enriched} | images to add: {added_total}")
for _id, sku, cur, merged in updates[:8]:
    print(f"  {sku}: {len(cur)} -> {len(merged)}")

ap = argparse.ArgumentParser(); ap.add_argument("--write", action="store_true")
if not ap.parse_args().write:
    print("\n[DRY RUN] --write to apply.")
    sys.exit()

# 3) backup + write
BACKUP.parent.mkdir(exist_ok=True)
with open(BACKUP, "w") as f:
    f.write("id\tsku\told_image_urls\n")
    for _id, sku, cur, merged in updates:
        f.write(f"{_id}\t{sku}\t{'|'.join(cur)}\n")

sql = ROOT / "scripts" / "_ruvati_updates.sql"
with open(sql, "w") as f:
    for _id, sku, cur, merged in updates:
        arr = "ARRAY[" + ",".join("'" + u.replace("'", "''") + "'" for u in merged) + "]::text[]"
        f.write(f"UPDATE catalog_products SET image_urls={arr}, updated_at=now() WHERE id='{_id}';\n")
r = subprocess.run(["psql", DB, "-q", "-1", "-f", str(sql)], capture_output=True, text=True)
if r.returncode:
    sys.stderr.write(r.stderr); raise SystemExit("WRITE FAILED")
sql.unlink()
print(f"DONE: enriched {enriched} Ruvati products (+{added_total} images). Backup {BACKUP}")
