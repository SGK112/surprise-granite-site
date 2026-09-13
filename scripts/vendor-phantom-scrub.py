#!/usr/bin/env python3
"""
vendor-phantom-scrub.py — find catalog products the vendor does not actually sell.

WHY. Bulk vendor imports invented products. Vigo was ~67% fabricated. Ruvati, audited
2026-09-13, was 13% (64 of 492 checkable SKUs) plus 3 duplicate rows filed under an
internal id instead of a part number. A fabricated row is worse than a missing one:
the page indexes, takes an order, and the PO cannot be placed.

    python3 scripts/vendor-phantom-scrub.py ruvati            # report only
    python3 scripts/vendor-phantom-scrub.py ruvati --write    # retire confirmed phantoms

Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (site repo .env.local).

⚠️ TWO INDEPENDENT METHODS, AND THE INTERSECTION IS WHAT COUNTS. A SKU is only retired
when BOTH say it does not exist:

  1. the vendor's product API, matched on EXACT sku
  2. the vendor's product sitemap, matched on the SKU token in each product slug

On the Ruvati run method 1 alone flagged 64, but 12 of those were in the sitemap and
would have been wrongly retired — real products the API's search simply did not
return. Method 2 alone is no better: the sitemap held 766 URLs against 808 catalog
rows, so absence from it proves nothing on its own. Never retire on one signal.

WHAT A PHANTOM LOOKS LIKE. Most were colour-variant families where only the coloured
variants exist: the catalog invented a bare RVG1030 while the vendor sells only
RVG1030BK and RVG1030WH. The rest had no variants at all.

Retiring sets active=false + in_stock=false rather than deleting. That is reversible,
and it is what lets gen-marketplace-pages.js retire the page properly on its next run
(noindex AND remove the buy button). Deleting the row would strand a live page.
Every run writes a full backup of the rows it is about to touch.
"""
import json, os, re, ssl, sys, time, urllib.parse, urllib.request

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = {"User-Agent": "Mozilla/5.0"}
BASE = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

# Per-vendor adapters. `sku_re` must match that vendor's real part-number shape —
# anything else is an internal id and is reported separately, never auto-retired.
VENDORS = {
    "ruvati": {
        "api": "https://www.ruvati.com/wp-json/wc/store/products?search={sku}&per_page=5",
        "sitemaps": [f"https://www.ruvati.com/product-sitemap{i}.xml" for i in range(1, 6)],
        "sku_re": r"^RV[A-Z]?[A-Z0-9]{3,12}$",
    },
    # To add a vendor: give it a product API that can be matched on exact sku and a
    # product sitemap. If the vendor has neither, do NOT guess — leave it out.
}


def sb(path, method="GET", body=None, extra=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    h.update(extra or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}/rest/v1/{path}", data=data, method=method, headers=h)
    return json.load(urllib.request.urlopen(req, timeout=90, context=CTX))


def fetch_rows(vendor):
    rows = []
    while True:
        lo = len(rows)
        page = sb(f"catalog_products?select=sku,slug,name,active,in_stock&vendor_id=eq.{vendor}&order=sku.asc",
                  extra={"Range": f"{lo}-{lo+999}", "Range-Unit": "items"})
        rows += page
        if len(page) < 1000:
            return rows


def sitemap_tokens(cfg):
    toks = set()
    for u in cfg["sitemaps"]:
        try:
            raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60, context=CTX).read().decode("utf-8", "replace")
        except Exception as e:
            print(f"  ! sitemap {u} unavailable ({e}) — method 2 weakened, not fatal")
            continue
        for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", raw):
            slug = loc.rstrip("/").split("/")[-1].upper()
            for t in re.split(r"[-_]", slug):
                if re.match(cfg["sku_re"], t, re.I):
                    toks.add(t.upper())
    return toks


def api_has(cfg, sku, tries=3):
    """True / False / None(unreachable). None is never treated as a phantom."""
    for attempt in range(tries):
        try:
            u = cfg["api"].format(sku=urllib.parse.quote(sku))
            d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30, context=CTX))
            return any((p.get("sku") or "").upper() == sku.upper() for p in d)
        except Exception:
            if attempt == tries - 1:
                return None
            time.sleep(1.5)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in VENDORS:
        sys.exit(f"usage: vendor-phantom-scrub.py <{'|'.join(VENDORS)}> [--write]")
    vendor, write = sys.argv[1], "--write" in sys.argv
    if not BASE or not KEY:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    cfg = VENDORS[vendor]

    rows = fetch_rows(vendor)
    checkable = [r for r in rows if re.match(cfg["sku_re"], (r["sku"] or "").strip(), re.I)]
    odd = [r for r in rows if r not in checkable and r["active"]]
    print(f"{vendor}: {len(rows)} rows | {len(checkable)} checkable SKUs | {len(odd)} active rows with a non-SKU id")

    toks = sitemap_tokens(cfg)
    print(f"sitemap SKU tokens: {len(toks)}")

    phantom, unreachable = [], 0
    for i, r in enumerate(checkable, 1):
        sku = (r["sku"] or "").strip().upper()
        got = api_has(cfg, sku)
        if got is None:
            unreachable += 1
        elif got is False and sku not in toks:   # the intersection — both methods agree
            phantom.append(r)
        if i % 100 == 0:
            print(f"  checked {i}/{len(checkable)}")
        time.sleep(0.12)

    active = [r for r in phantom if r["active"]]
    print(f"\nCONFIRMED phantom (both methods): {len(phantom)}   still active: {len(active)}")
    if unreachable:
        print(f"unreachable (left alone, NOT retired): {unreachable}")
    for r in active[:20]:
        print(f"   {r['sku']:14} {(r['name'] or '')[:58]}")
    if odd:
        print(f"\nActive rows whose sku is an internal id, not a part number — check these by hand")
        print(f"for duplicates of a properly-SKU'd row before doing anything:")
        for r in odd[:10]:
            print(f"   {r['sku']}")

    if not write:
        print(f"\nDRY RUN — re-run with --write to retire the {len(active)} confirmed phantoms.")
        return
    if not active:
        print("\nnothing to retire.")
        return

    q = ",".join(r["sku"] for r in active)
    backup = sb(f"catalog_products?select=*&sku=in.({q})")
    os.makedirs("/tmp/catbak", exist_ok=True)
    path = f"/tmp/catbak/{vendor}-phantoms-{time.strftime('%Y%m%d-%H%M%S')}.json"
    json.dump(backup, open(path, "w"))
    print(f"\nbacked up {len(backup)} rows -> {path}")
    done = 0
    for r in active:
        res = sb(f"catalog_products?sku=eq.{r['sku']}", method="PATCH",
                 body={"active": False, "in_stock": False},
                 extra={"Prefer": "return=representation"})
        if res and res[0]["active"] is False:
            done += 1
    print(f"retired {done}/{len(active)}. Pages retire on the next gen-marketplace-pages.js run.")


if __name__ == "__main__":
    main()
