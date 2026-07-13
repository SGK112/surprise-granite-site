#!/usr/bin/env python3
"""
Clean broken / placeholder images from sink catalog rows.

- Removes images that 404 (non-200).
- Removes Ruvati Odoo placeholders: zen.ruvati.com images under 8KB (the
  "no image" 256x256 ~6KB placeholder; real Ruvati photos are 60KB+).
- If primary_image_url gets removed, promotes the first surviving image.
- Backs up (slug, primary, image_urls) first. --dry-run default.

(ALFI images are genuinely low-res 300px from the vendor — a source issue,
not broken — so they are left as-is.)
"""
import json, re, sys, subprocess, argparse, concurrent.futures as cf
from pathlib import Path

API = "https://surprise-granite-email-api.onrender.com/api/catalog"
SCRIPT_DIR = Path(__file__).parent
BACKUP = Path.home() / "sg-backups" / "sink-images-backup.tsv"

def db_url():
    for l in (SCRIPT_DIR.parent / ".env.local").read_text().splitlines():
        if l.startswith("DATABASE_URL="): return l.split("=",1)[1].strip().strip('"').strip("'")
    raise SystemExit("no DATABASE_URL")
DB = db_url()

def get_sinks():
    out=[]
    for off in range(0,1200,250):
        d=json.loads(subprocess.check_output(['curl','-s',f'{API}?category=sink&limit=250&offset={off}']))
        if not d.get('products'): break
        out+=d['products']
    return out

def head(u):
    try:
        r=subprocess.check_output(['curl','-s','-o','/dev/null','-w','%{http_code} %{header_json}','-I','--max-time','12',u],text=True)
        code,hdr=r.split(' ',1)
        try: cl=int(json.loads(hdr).get('content-length',['0'])[0])
        except: cl=0
        return (u,code,cl)
    except: return (u,'ERR',0)

def bad(u,code,cl):
    if code not in ('200','301','302'): return True
    if 'zen.ruvati.com' in u and 0 < cl < 8000: return True   # Odoo placeholder
    if cl and cl < 1500: return True                          # anything trivially tiny
    return False

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); a=ap.parse_args()
    sinks=get_sinks()
    # only rows whose images we care about (ruvati/vigo/alfi + any zen.ruvati)
    def relevant(p):
        b=((p.get('brand') or '')+(p.get('vendor') or '')+(p.get('vendor_id') or '')).lower()
        return any(k in b for k in ('ruvati','vigo','alfi'))
    rows=[p for p in sinks if relevant(p) and p.get('slug')]
    allimg=sorted({u for p in rows for u in ([p.get('primary_image_url')]+(p.get('image_urls') or [])) if u})
    print(f"sink rows: {len(rows)} | unique images to check: {len(allimg)}")
    with cf.ThreadPoolExecutor(30) as ex: res=dict((u,(c,cl)) for u,c,cl in ex.map(head,allimg))
    badset={u for u,(c,cl) in res.items() if bad(u,c,cl)}
    print(f"bad images found: {len(badset)}")

    plans=[]; total_removed=0
    for p in rows:
        slug=p['slug']; prim=p.get('primary_image_url') or ''
        old_imgs=p.get('image_urls') or []
        new_imgs=[u for u in old_imgs if u not in badset]
        new_prim=prim
        if prim in badset:
            new_prim=new_imgs[0] if new_imgs else ''
        if new_imgs!=old_imgs or new_prim!=prim:
            removed=len(old_imgs)-len(new_imgs)+(1 if (prim in badset and prim not in old_imgs) else 0)
            total_removed+=max(removed,0)
            plans.append((slug,prim,old_imgs,new_prim,new_imgs))
    print(f"rows to fix: {len(plans)} | images removed: {total_removed}")
    if not plans: return
    if not a.write:
        for slug,op,oi,np,ni in plans[:8]:
            print(f"  {slug}: {len(oi)}->{len(ni)} imgs" + ("  [primary replaced]" if op!=np else ""))
        print(f"\n--write to back up + commit."); return

    BACKUP.parent.mkdir(exist_ok=True)
    with open(BACKUP,'w') as f:
        f.write("slug\tprimary\timage_urls_json\n")
        for slug,op,oi,np,ni in plans: f.write(f"{slug}\t{op}\t{json.dumps(oi)}\n")
    print("backup:",BACKUP)
    def lit(u): return f"$img${u}$img$"
    stmts=["BEGIN;"]
    for slug,op,oi,np,ni in plans:
        arr="ARRAY[" + ",".join(lit(u) for u in ni) + "]::text[]" if ni else "ARRAY[]::text[]"
        s=slug.replace("'","''")
        stmts.append(f"UPDATE catalog_products SET primary_image_url={lit(np)}, image_urls={arr}, updated_at=now() WHERE category='sink' AND slug='{s}';")
    stmts.append("COMMIT;")
    sqlf=SCRIPT_DIR/"scraper-output"/"sink-clean.sql"; sqlf.parent.mkdir(exist_ok=True); sqlf.write_text("\n".join(stmts))
    r=subprocess.run(["psql",DB,"-v","ON_ERROR_STOP=1","-f",str(sqlf)],capture_output=True,text=True)
    sys.stdout.write(r.stdout[-300:])
    if r.returncode: sys.stderr.write(r.stderr); raise SystemExit("WRITE FAILED")
    print(f"DONE: cleaned {len(plans)} sink rows.")

if __name__=='__main__': main()
