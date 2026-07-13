#!/usr/bin/env python3
"""
Fix ALFI blurry images: alfitrade.com serves Magento /cache/<hash>/ RESIZED
copies (265-300px). The uncached original (strip /cache/<hash>/) is full-res
(1083px+). Rewrite every alfitrade image URL to its original — but only when
the original actually resolves (200), else keep the cached one.

Rewrites primary_image_url + image_urls across sink/faucet/accessory.
Backs up first. --dry-run default.
"""
import json, re, sys, subprocess, argparse, concurrent.futures as cf
from pathlib import Path

API = "https://surprise-granite-email-api.onrender.com/api/catalog"
SCRIPT_DIR = Path(__file__).parent
BACKUP = Path.home() / "sg-backups" / "alfi-images-backup.tsv"

def db_url():
    for l in (SCRIPT_DIR.parent / ".env.local").read_text().splitlines():
        if l.startswith("DATABASE_URL="): return l.split("=",1)[1].strip().strip('"').strip("'")
    raise SystemExit("no DATABASE_URL")
DB = db_url()

def orig(u): return re.sub(r'/cache/[^/]+/', '/', u) if 'alfitrade.com' in u and '/cache/' in u else u
def ok(u):
    try: return subprocess.check_output(['curl','-s','-o','/dev/null','-w','%{http_code}','-I','--max-time','12',u],text=True).strip()=='200'
    except: return False

def get(cat):
    out=[]
    for off in range(0,1500,250):
        d=json.loads(subprocess.check_output(['curl','-s',f'{API}?category={cat}&limit=250&offset={off}']))
        if not d.get('products'): break
        out+=d['products']
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); a=ap.parse_args()
    rows=[]
    for cat in ('sink','faucet','accessory'):
        for p in get(cat):
            imgs=[p.get('primary_image_url')]+(p.get('image_urls') or [])
            if any(u and 'alfitrade.com/media/catalog/product/cache/' in u for u in imgs) and p.get('slug'):
                p['_cat']=cat; rows.append(p)
    print(f"ALFI rows with cached images: {len(rows)}")
    # unique originals to verify
    origs=sorted({orig(u) for p in rows for u in ([p.get('primary_image_url')]+(p.get('image_urls') or [])) if u and '/cache/' in (u or '')})
    print(f"unique originals to verify: {len(origs)}")
    with cf.ThreadPoolExecutor(30) as ex: good=dict(zip(origs, ex.map(ok, origs)))
    ngood=sum(1 for v in good.values() if v); print(f"originals that resolve (200): {ngood}/{len(origs)}")

    def rw(u):
        o=orig(u)
        return o if (o!=u and good.get(o)) else u
    plans=[]; changed=0
    for p in rows:
        slug=p['slug']; op=p.get('primary_image_url') or ''; oi=p.get('image_urls') or []
        np=rw(op); ni=[rw(u) for u in oi]
        if np!=op or ni!=oi:
            changed+=sum(1 for a,b in zip(oi,ni) if a!=b)+(1 if np!=op else 0)
            plans.append((slug,p['_cat'],op,oi,np,ni))
    print(f"rows to upgrade: {len(plans)} | image URLs rewritten: {changed}")
    if not plans: return
    if not a.write:
        for slug,c,op,oi,np,ni in plans[:6]: print(f"  {slug}: primary {'UPGRADED' if op!=np else 'same'}, {sum(1 for a2,b2 in zip(oi,ni) if a2!=b2)}/{len(oi)} imgs upgraded")
        print("\n--write to back up + commit."); return

    BACKUP.parent.mkdir(exist_ok=True)
    with open(BACKUP,'w') as f:
        f.write("slug\tcat\tprimary\timage_urls_json\n")
        for slug,c,op,oi,np,ni in plans: f.write(f"{slug}\t{c}\t{op}\t{json.dumps(oi)}\n")
    print("backup:",BACKUP)
    def lit(u): return f"$img${u}$img$"
    stmts=["BEGIN;"]
    for slug,c,op,oi,np,ni in plans:
        arr="ARRAY[" + ",".join(lit(u) for u in ni) + "]::text[]" if ni else "ARRAY[]::text[]"
        s=slug.replace("'","''")
        stmts.append(f"UPDATE catalog_products SET primary_image_url={lit(np)}, image_urls={arr}, updated_at=now() WHERE category='{c}' AND slug='{s}';")
    stmts.append("COMMIT;")
    sqlf=SCRIPT_DIR/"scraper-output"/"alfi-fix.sql"; sqlf.parent.mkdir(exist_ok=True); sqlf.write_text("\n".join(stmts))
    r=subprocess.run(["psql",DB,"-v","ON_ERROR_STOP=1","-f",str(sqlf)],capture_output=True,text=True)
    sys.stdout.write(r.stdout[-200:])
    if r.returncode: sys.stderr.write(r.stderr); raise SystemExit("WRITE FAILED")
    print(f"DONE: upgraded {len(plans)} ALFI rows to full-res.")

if __name__=='__main__': main()
