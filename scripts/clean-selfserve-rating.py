#!/usr/bin/env python3
"""
clean-selfserve-rating.py — remove the self-serve aggregateRating (4.5/157) from
Organization/LocalBusiness/Service-provider JSON-LD on service + location pages.

Google removed self-serve review rich results for LocalBusiness/Organization/Service
in 2019: this markup earns no stars AND self-rating your own business is a policy
flag. Real review stars come from Google Business Profile; on-page we keep the
genuine review CARDS (display only, no schema) via inject-reviews.js.

Removes every `"aggregateRating": { ... }` property, correctly deleting the
adjacent comma so the surrounding JSON stays valid. Then validates every
<script type="application/ld+json"> block still parses. Idempotent.

    python3 scripts/clean-selfserve-rating.py services locations company   # dry
    python3 scripts/clean-selfserve-rating.py services locations company --write
"""
import sys, os, re, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITE = "--write" in sys.argv
DIRS = [a for a in sys.argv[1:] if a != "--write"]

# property + trailing comma  (aggregateRating is NOT the last key)
RE_TRAILING = re.compile(r'"aggregateRating"\s*:\s*\{[^{}]*\}\s*,\s*')
# leading comma + property    (aggregateRating IS the last key before })
RE_LEADING = re.compile(r'\s*,\s*"aggregateRating"\s*:\s*\{[^{}]*\}')

LDJSON = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)


def clean(html):
    out = RE_TRAILING.sub("", html)   # common case first
    out = RE_LEADING.sub("", out)     # last-key case
    return out


def ld_valid(html, rel):
    ok = True
    for m in LDJSON.finditer(html):
        body = m.group(1).strip()
        try:
            json.loads(body)
        except Exception as e:
            ok = False
            print(f"    !! INVALID JSON-LD in {rel}: {e}")
    return ok


def walk(d):
    full = os.path.join(ROOT, d)
    for dp, _, files in os.walk(full):
        for name in files:
            if name == "index.html":
                yield os.path.join(dp, name)


changed = bad = clean_already = 0
for d in DIRS:
    for path in walk(d):
        rel = os.path.relpath(path, ROOT)
        html = open(path, encoding="utf-8").read()
        if '"aggregateRating"' not in html:
            continue
        new = clean(html)
        if new == html:
            clean_already += 1
            continue
        if '"aggregateRating"' in new:
            print(f"    !! residual aggregateRating remains in {rel}")
        if not ld_valid(new, rel):
            bad += 1
            continue
        changed += 1
        print(f"  {'wrote' if WRITE else 'would write'}: {rel}")
        if WRITE:
            open(path, "w", encoding="utf-8").write(new)

print(f"\n{'WROTE' if WRITE else 'DRY RUN'} — cleaned {changed}, invalid-skipped {bad}, no-change {clean_already}")
if not WRITE:
    print("Re-run with --write to apply.")
