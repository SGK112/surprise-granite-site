#!/bin/bash
# Mirror every Webflow CDN URL to local /migrated/ and rewrite all
# references in HTML/JS/JSON/CSS so the site has zero runtime dependency
# on cdn.prod.website-files.com.
#
# Usage:
#   bash scripts/migrate-webflow-images.sh download   # phase 1: download
#   bash scripts/migrate-webflow-images.sh rewrite    # phase 2: rewrite refs
#   bash scripts/migrate-webflow-images.sh verify     # spot-check served paths
#
# Idempotent: re-running download skips files that already exist.

# NOTE: deliberately NOT using `set -e` — single-URL failures (404, timeout,
# weird path) must not abort the whole batch.
SITE_ROOT="/Users/homepc/surprise-granite-site"
URLS_FILE="/tmp/webflow-urls-all.txt"
MIRROR_DIR="$SITE_ROOT/migrated"
LOG="/tmp/webflow-migrate.log"
FAIL_LOG="/tmp/webflow-migrate-failures.txt"
PARALLEL=8

cmd="${1:-help}"

if [ "$cmd" = "help" ]; then
  echo "Phases: download | rewrite | verify"
  exit 0
fi

if [ "$cmd" = "download" ]; then
  if [ ! -f "$URLS_FILE" ]; then
    echo "Building URL inventory..."
    cd "$SITE_ROOT"
    grep -rho "https://cdn\.prod\.website-files\.com/[^\"' )]*" . \
      --include="*.html" --include="*.js" --include="*.json" --include="*.css" \
      2>/dev/null | sort -u > "$URLS_FILE"
  fi
  TOTAL=$(wc -l < "$URLS_FILE")
  echo "Downloading $TOTAL URLs to $MIRROR_DIR with $PARALLEL parallel workers..."
  > "$FAIL_LOG"

  # Bash-only concurrency: spawn up to $PARALLEL background curls, wait when full.
  # macOS xargs -P -I has a hard limit on argv assembly that breaks at 5k+ URLs.
  download_one() {
    local url="$1"
    local path="${url#https://cdn.prod.website-files.com/}"
    local dest="$MIRROR_DIR/$path"
    if [ -f "$dest" ] && [ -s "$dest" ]; then return 0; fi
    mkdir -p "$(dirname "$dest")"
    if curl -sf --max-time 20 "$url" -o "$dest.tmp"; then
      mv "$dest.tmp" "$dest"
    else
      rm -f "$dest.tmp"
      echo "$url" >> "$FAIL_LOG"
    fi
  }
  i=0
  while IFS= read -r url; do
    [ -z "$url" ] && continue
    download_one "$url" &
    i=$((i+1))
    if [ $((i % PARALLEL)) -eq 0 ]; then wait; fi
    if [ $((i % 200)) -eq 0 ]; then echo "  ... $i / $TOTAL"; fi
  done < "$URLS_FILE"
  wait

  DOWNLOADED=$(find "$MIRROR_DIR" -type f | wc -l | tr -d ' ')
  FAILED=$(wc -l < "$FAIL_LOG" | tr -d ' ')
  echo ""
  echo "Done. Local files: $DOWNLOADED. Failed: $FAILED."
  [ "$FAILED" -gt 0 ] && echo "Failures logged to $FAIL_LOG"
fi

if [ "$cmd" = "rewrite" ]; then
  echo "Rewriting Webflow CDN refs to /migrated/ across the site..."
  cd "$SITE_ROOT"
  # Find every file that mentions the CDN, then sed -i in place.
  # Skip node_modules, .git, the migrated/ dir itself, and the scripts/ dir
  # (so this script doesn't rewrite itself).
  files=$(grep -rl "cdn.prod.website-files.com" . \
    --include="*.html" --include="*.js" --include="*.json" --include="*.css" \
    2>/dev/null | grep -vE "^\./(node_modules|\.git|migrated|scripts)/")
  COUNT=$(echo "$files" | wc -l | tr -d ' ')
  echo "Touching $COUNT files..."
  echo "$files" | while read -r f; do
    [ -z "$f" ] && continue
    # macOS sed -i needs '' for in-place
    sed -i '' 's|https://cdn\.prod\.website-files\.com/|/migrated/|g' "$f"
  done
  REMAINING=$(grep -rl "cdn.prod.website-files.com" . \
    --include="*.html" --include="*.js" --include="*.json" --include="*.css" \
    2>/dev/null | grep -vE "^\./(node_modules|\.git|migrated|scripts)/" | wc -l | tr -d ' ')
  echo "Done. Files still containing webflow CDN refs: $REMAINING"
fi

if [ "$cmd" = "verify" ]; then
  echo "Spot-check 5 random migrated paths:"
  find "$MIRROR_DIR" -type f | shuf -n 5 | while read -r f; do
    rel="${f#$SITE_ROOT}"
    echo "  $rel ($(stat -f%z "$f" 2>/dev/null) bytes)"
  done
  echo ""
  echo "Files still referencing Webflow CDN (should be 0 outside migrated/):"
  grep -rl "cdn.prod.website-files.com" "$SITE_ROOT" \
    --include="*.html" --include="*.js" --include="*.json" --include="*.css" \
    2>/dev/null | grep -vE "/(node_modules|\.git|migrated|scripts)/" | head -10
fi
