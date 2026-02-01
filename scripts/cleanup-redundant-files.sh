#!/bin/bash

# ============================================
# Surprise Granite - Cleanup Redundant Files
# ============================================
# This script removes static product pages that are now
# served dynamically from templates/product.html
#
# RUN WITH: bash scripts/cleanup-redundant-files.sh
# DRY RUN:  bash scripts/cleanup-redundant-files.sh --dry-run
# ============================================

set -e

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
BACKUP_DIR="$SITE_DIR/.backup-$(date +%Y%m%d-%H%M%S)"

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE - No files will be deleted"
fi

echo ""
echo "============================================"
echo "  Surprise Granite - Cleanup Script"
echo "============================================"
echo ""
echo "Site directory: $SITE_DIR"
echo ""

# Count files before
count_files() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    find "$dir" -type f | wc -l | tr -d ' '
  else
    echo "0"
  fi
}

# Size of directory
dir_size() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    du -sh "$dir" 2>/dev/null | cut -f1
  else
    echo "0"
  fi
}

echo "📊 Current state:"
echo ""
echo "  /countertops/  : $(count_files "$SITE_DIR/countertops") files ($(dir_size "$SITE_DIR/countertops"))"
echo "  /tiles/        : $(count_files "$SITE_DIR/tiles") files ($(dir_size "$SITE_DIR/tiles"))"
echo "  /tile/         : $(count_files "$SITE_DIR/tile") files ($(dir_size "$SITE_DIR/tile"))"
echo "  /flooring/     : $(count_files "$SITE_DIR/flooring") files ($(dir_size "$SITE_DIR/flooring"))"
echo "  /materials/    : $(count_files "$SITE_DIR/materials") files ($(dir_size "$SITE_DIR/materials"))"
echo "  /shop/         : $(count_files "$SITE_DIR/shop") files ($(dir_size "$SITE_DIR/shop"))"
echo "  /store/        : $(count_files "$SITE_DIR/store") files ($(dir_size "$SITE_DIR/store"))"
echo ""

# Directories to clean (static product pages - now served dynamically)
PRODUCT_DIRS=(
  "$SITE_DIR/countertops"
  "$SITE_DIR/tiles"
  "$SITE_DIR/tile"
)

# Directories to remove entirely (redundant)
REMOVE_DIRS=(
  "$SITE_DIR/shop"
  "$SITE_DIR/store"
)

# Files to remove
REMOVE_FILES=(
  "$SITE_DIR/shop.html"
)

# ============================================
# Step 1: Backup (unless dry run)
# ============================================

if [[ "$DRY_RUN" == false ]]; then
  echo "📦 Creating backup at $BACKUP_DIR..."
  mkdir -p "$BACKUP_DIR"

  for dir in "${PRODUCT_DIRS[@]}" "${REMOVE_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
      dir_name=$(basename "$dir")
      echo "   Backing up $dir_name..."
      cp -r "$dir" "$BACKUP_DIR/$dir_name" 2>/dev/null || true
    fi
  done

  echo "✅ Backup complete"
  echo ""
fi

# ============================================
# Step 2: Remove static product subdirectories
# Keep the index.html in each main folder
# ============================================

echo "🗑️  Removing static product subdirectories..."
echo ""

total_removed=0

for dir in "${PRODUCT_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    dir_name=$(basename "$dir")

    # Count subdirectories (each product has its own folder)
    subdir_count=$(find "$dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

    if [[ "$subdir_count" -gt 0 ]]; then
      echo "   /$dir_name/: Removing $subdir_count product subdirectories..."

      if [[ "$DRY_RUN" == false ]]; then
        # Remove all subdirectories but keep files in root (like index.html)
        find "$dir" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} \;
      fi

      total_removed=$((total_removed + subdir_count))
    fi
  fi
done

echo ""
echo "   Total product subdirectories: $total_removed"
echo ""

# ============================================
# Step 3: Remove redundant directories entirely
# ============================================

echo "🗑️  Removing redundant directories..."
echo ""

for dir in "${REMOVE_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    dir_name=$(basename "$dir")
    file_count=$(count_files "$dir")
    echo "   /$dir_name/: Removing ($file_count files)..."

    if [[ "$DRY_RUN" == false ]]; then
      rm -rf "$dir"
    fi
  fi
done

echo ""

# ============================================
# Step 4: Remove redundant files
# ============================================

echo "🗑️  Removing redundant files..."
echo ""

for file in "${REMOVE_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    file_name=$(basename "$file")
    echo "   $file_name"

    if [[ "$DRY_RUN" == false ]]; then
      rm -f "$file"
    fi
  fi
done

echo ""

# ============================================
# Summary
# ============================================

echo "============================================"
echo "  Cleanup Summary"
echo "============================================"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "🔍 DRY RUN - No files were deleted"
  echo ""
  echo "To actually delete files, run without --dry-run:"
  echo "  bash scripts/cleanup-redundant-files.sh"
else
  echo "✅ Cleanup complete!"
  echo ""
  echo "📊 After cleanup:"
  echo ""
  echo "  /countertops/  : $(count_files "$SITE_DIR/countertops") files ($(dir_size "$SITE_DIR/countertops"))"
  echo "  /tiles/        : $(count_files "$SITE_DIR/tiles") files ($(dir_size "$SITE_DIR/tiles"))"
  echo "  /tile/         : $(count_files "$SITE_DIR/tile") files ($(dir_size "$SITE_DIR/tile"))"
  echo "  /flooring/     : $(count_files "$SITE_DIR/flooring") files ($(dir_size "$SITE_DIR/flooring"))"
  echo ""
  echo "📦 Backup saved to: $BACKUP_DIR"
  echo ""
  echo "⚠️  To restore, run:"
  echo "   cp -r $BACKUP_DIR/* $SITE_DIR/"
fi

echo ""
echo "🚀 Dynamic product pages are now served from:"
echo "   /templates/product.html"
echo ""
echo "   Old URLs like /countertops/calacatta-prado-quartz/"
echo "   now load the dynamic template automatically."
echo ""
