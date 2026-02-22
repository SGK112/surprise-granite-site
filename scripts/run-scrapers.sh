#!/bin/bash
# Weekly scraper automation for Surprise Granite inventory
# Runs all vendor scrapers and then updates the inventory database.
# Designed to be called by launchd (com.surprisegranite.scraper.plist)

set -euo pipefail

SCRIPT_DIR="/Users/homepc/surprise-granite-site/scripts"
LOG_DIR="$SCRIPT_DIR/scraper-output"
LOG_FILE="$LOG_DIR/weekly-$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"

echo "=== Scraper run started: $(date) ===" | tee -a "$LOG_FILE"

# Run all vendor scrapers
python3 "$SCRIPT_DIR/inventory-scraper.py" --vendor all 2>&1 | tee -a "$LOG_FILE"

# Update inventory database from scraped data
python3 "$SCRIPT_DIR/update-inventory.py" 2>&1 | tee -a "$LOG_FILE"

echo "=== Scraper run finished: $(date) ===" | tee -a "$LOG_FILE"
